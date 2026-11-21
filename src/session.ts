import type {
  HarnessContentBlock,
  HarnessEvent,
  HarnessMessage,
  HarnessRequestResponse,
  HarnessRuntimeRequest,
  HarnessSession,
  HarnessSessionInfo,
  HarnessSnapshot,
  HarnessToolBridge,
  HarnessToolItem,
  HarnessTurn,
  HarnessUserMessage,
  InterruptTurnInput,
  StartTurnInput,
  SteerTurnInput,
} from "./contract/index.js";
import { HarnessError, nativeRef } from "./contract/index.js";
import type { MuseNotification, NotificationSink } from "./host.js";
import { startToolBridgeServer, normalizeToolName, BRIDGE_MCP_SERVER_NAME, type ToolBridgeServer } from "./bridge.js";
import { MUSE_CAPABILITIES } from "./capabilities.js";
import {
  parseToolArgs,
  toFailure,
  toMessageStatus,
  toRequestStatus,
  toSessionStatus,
  toTokenUsage,
  toToolStatus,
  toTurnStatus,
  toUserInputStatus,
} from "./events.js";

/**
 * One Muse native session, and everything the harness contract needs from it:
 * turn commands, the normalized event stream, and the notification handlers
 * that translate Muse frames into that stream.
 *
 * Layout, in file order: shared turn/usage/context shapes and the host seam,
 * then `MuseHarnessSession` — construction and resume, accessors, the turn API,
 * notification dispatch, and finally one handler per Muse notification kind.
 */
const ADAPTER_ID = "muse";

/**
 * Item kinds the adapter understands. Anything else is recorded, not fatal:
 * a new MSP kind must never take a chat down, but it must be visible.
 */
const KNOWN_ITEM_KINDS: ReadonlySet<string> = new Set([
  "userMessage",
  "agentMessage",
  "reasoning",
  "toolCall",
  "compaction",
  "userShell",
  "webSearch",
]);

/** Item statuses that mean the item will not change again. */
const TERMINAL_ITEM_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
  "aborted",
]);

function itemStatus(item: Record<string, unknown>): string {
  return typeof item.status === "string" ? item.status : "";
}

function isTerminalItem(item: Record<string, unknown>): boolean {
  return TERMINAL_ITEM_STATUSES.has(itemStatus(item));
}

export type HistoryCompactedEvent = Extract<HarnessEvent, { type: "history.compacted" }>;

interface EventConsumer {
  queue: HarnessEvent[];
  notify: (() => void) | null;
  closed: boolean;
}

/** Broadcast event bus: every subscriber gets an independent queue. */
class EventBus {
  private readonly consumers = new Set<EventConsumer>();
  private closed = false;

  publish(event: HarnessEvent): void {
    if (this.closed) return;
    for (const consumer of this.consumers) consumer.queue.push(event);
    for (const consumer of this.consumers) consumer.notify?.();
  }

  subscribe(): AsyncIterable<HarnessEvent> {
    const consumer: EventConsumer = { queue: [], notify: null, closed: false };
    this.consumers.add(consumer);
    const consumers = this.consumers;
    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<HarnessEvent>> {
            while (consumer.queue.length === 0) {
              if (consumer.closed) return { done: true, value: undefined };
              await new Promise<void>((resolve) => {
                consumer.notify = resolve;
                if (consumer.queue.length > 0) resolve();
              });
              consumer.notify = null;
            }
            return { done: false, value: consumer.queue.shift() as HarnessEvent };
          },
          async return(): Promise<IteratorResult<HarnessEvent>> {
            consumer.closed = true;
            consumers.delete(consumer);
            consumer.notify?.();
            return { done: true, value: undefined };
          },
        };
      },
    };
  }

  close(): void {
    this.closed = true;
    for (const consumer of this.consumers) {
      consumer.closed = true;
      consumer.notify?.();
    }
    this.consumers.clear();
  }
}

interface ActiveTurn {
  turn: HarnessTurn;
  terminal: boolean;
}

interface UserInputQuestion {
  readonly id: string;
  readonly question: string;
  readonly selection: { readonly mode: string };
  readonly options: ReadonlyArray<{ readonly label: string }>;
}

/**
 * Usage accumulated for one native turn.
 *
 * A turn can carry several model completions (tool loop), each reported via
 * `session/tokenUsage`. Context fields (`inputTokens`, cache counters,
 * `totalTokens`) keep the highest value — the last report describes the whole
 * context. `outputTokens`/`reasoningTokens` are per-completion, so they are
 * summed, guarded by the `totalTokens` high-water mark so a repeated report
 * of the same completion is not counted twice.
 */
interface TurnUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
  /** Cumulative-cost delta reported by Muse for this turn, in USD. */
  costUsd?: number;
  /** At least one completion's cost is provisional. */
  costPartial?: boolean;
  /** Prompt tokens summed over completions, which is what gets billed. */
  billedPromptTokens?: number;
  billedCacheRead?: number;
  billedCacheWrite?: number;
  billedOutput?: number;
}

export interface ContextUsage {
  readonly usedTokens: number;
  readonly windowTokens?: number;
  readonly pressure: string;
}

/** The minimal host surface a session needs, so tests can supply a fake. */
interface SessionConnection {
  mintCommandId(): string;
  command(
    method: string,
    params: Record<string, unknown>,
    options?: { commandId?: string },
  ): Promise<Record<string, unknown>>;
}

export interface SessionHost {
  readonly connection: SessionConnection;
  registerSink(sink: NotificationSink): void;
  unregisterSink(sessionId: string): void;
  /** Grants from the handshake, when the host can report them. */
  grantedCapabilities?(): readonly string[];
}

function now(): string {
  return new Date().toISOString();
}

function max(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

function textContent(text: string): ReadonlyArray<HarnessContentBlock> {
  return [{ type: "text", text }];
}

/** Convert contract content blocks into MSP turn input parts. */
function toTurnInputParts(message: HarnessUserMessage): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];
  for (const block of message.content) {
    if (block.type === "text") {
      parts.push({ type: "text", text: block.text });
    } else if (block.type === "image") {
      parts.push({ type: "image", mediaType: block.mediaType, base64Data: block.data });
    } else if (block.type === "file") {
      // MSP has no file part; a file mention travels as text.
      parts.push({ type: "text", text: `@${block.name ?? "file"}` });
    }
  }
  if (parts.length === 0) parts.push({ type: "text", text: "" });
  return parts;
}

/** Mirrors MSP's closed `ApprovalMode` (`msp.d.ts:187`). */
export type AdapterApprovalMode = "allowAll" | "promptUnmatched" | "onRequest" | "denyUnmatched";

export interface CreateSessionInput {
  /** Host-assigned session id, echoed in `HarnessSessionInfo.id`. */
  readonly sessionId: string;
  readonly cwd: string;
  readonly model?: string | null;
  readonly toolBridge?: HarnessToolBridge;
  readonly signal?: AbortSignal;
  /** Starting approval mode; omitted selects the host default. */
  readonly approvalMode?: AdapterApprovalMode;
  /** Native Muse session id to resume instead of starting a new session. */
  readonly resumeSessionId?: string;
  /**
   * Developer instructions for this session only. Muse trims the text; a
   * nonblank value replaces the settings-derived developer context, including
   * the agent catalog and memory snapshot.
   */
  readonly developerPrompt?: string;
  /** How a non-bridge tool call is treated. Defaults to warn. */
  readonly containment?: "strict" | "warn" | "off";
}

/**
 * One Muse session translated into the harness contract.
 *
 * The session owns the normalized event stream. It never lets an event for a
 * turn escape after that turn's `turn.terminal`, and it settles every open
 * message, tool, and request before the terminal.
 */
export class MuseHarnessSession implements HarnessSession, NotificationSink {
  readonly id: string;
  private readonly host: SessionHost;
  private readonly nativeId: string;
  private readonly bus = new EventBus();
  private readonly capabilities = MUSE_CAPABILITIES;
  private readonly toolBridge: HarnessToolBridge | undefined;
  private readonly bridgeServer: ToolBridgeServer | undefined;
  private readonly containment: "strict" | "warn" | "off";
  private containmentBreaches = 0;
  private containmentReported = false;
  private readonly turns = new Map<string, ActiveTurn>();
  private readonly turnUsage = new Map<string, TurnUsage>();
  /** Last cumulative cost seen for this native session; deltas price a turn. */
  private lastCumulativeUsd: number | undefined;
  private lastContextUsage: ContextUsage | null = null;
  private readonly pendingCompactions = new Map<string, Record<string, unknown>>();
  private readonly emittedCompactions = new Set<string>();
  private compactionCountValue = 0;
  private lastCompactionValue: HistoryCompactedEvent | null = null;
  /** Item kinds this adapter does not model, with counts. */
  private readonly unexpectedKindCounts = new Map<string, number>();
  private readonly hostToNative = new Map<string, string>();
  private readonly nativeToHost = new Map<string, string>();
  /** Native ids assumed from a command id because the ack omitted `turnId`. */
  private readonly assumedTurnIds = new Map<string, string>();
  /** Command ids whose `turn/start` is in flight, and the host turn they own. */
  private readonly pendingStarts = new Map<string, string>();
  private readonly messages = new Map<string, HarnessMessage>();
  private readonly tools = new Map<string, HarnessToolItem>();
  private readonly requests = new Map<string, HarnessRuntimeRequest>();
  private readonly requestRequirements = new Map<string, unknown>();
  private readonly requestQuestions = new Map<string, readonly UserInputQuestion[]>();
  private readonly requestWaiters = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void }
  >();
  private closing: Promise<void> | null = null;
  private closed = false;
  private sessionInfo: HarnessSessionInfo;
  /**
   * How this session's native id was obtained. A resume that fell back to a
   * fresh start leaves the native session empty even though a stored id was
   * present, so the caller must not send a delta against it.
   */
  readonly resumeOutcome: "started" | "resumed" | "resume_fallback";

  private constructor(
    host: SessionHost,
    input: CreateSessionInput,
    nativeSessionId: string,
    startedAt: string,
    toolBridge?: HarnessToolBridge,
    bridgeServer?: ToolBridgeServer,
    resumeOutcome: "started" | "resumed" | "resume_fallback" = "started",
  ) {
    this.host = host;
    this.id = input.sessionId;
    this.resumeOutcome = resumeOutcome;
    this.nativeId = nativeSessionId;
    this.toolBridge = toolBridge;
    this.bridgeServer = bridgeServer;
    this.containment = input.containment ?? "warn";
    this.sessionInfo = {
      id: input.sessionId,
      adapterId: ADAPTER_ID,
      status: "ready",
      cwd: input.cwd,
      model: input.model ?? null,
      capabilities: this.capabilities,
      lastError: null,
      createdAt: startedAt,
      updatedAt: startedAt,
    };
  }

  static async create(
    host: SessionHost,
    input: CreateSessionInput,
  ): Promise<MuseHarnessSession> {
    // A bridge session is driven by opencode, whose permission evaluation is
    // the only fence. Only `allowAll` can be honoured: nothing in this plugin
    // answers a Muse approval, so any asking mode would park the turn.
    if (
      input.toolBridge !== undefined &&
      input.approvalMode !== undefined &&
      input.approvalMode !== "allowAll"
    ) {
      throw new HarnessError({
        code: "invalid_input",
        adapterId: ADAPTER_ID,
        message: `approvalMode ${input.approvalMode} cannot be answered here; bridge sessions use allowAll`,
      });
    }
    // Starting a bridge the handshake did not grant would fail `session/start`
    // as a whole, after the server is listening. An absent accessor means a
    // replay host or test double that does not model the handshake.
    const granted = host.grantedCapabilities?.();
    if (input.toolBridge !== undefined && granted !== undefined && !granted.includes("sessionMcp")) {
      throw new HarnessError({
        code: "open_failed",
        adapterId: ADAPTER_ID,
        message: "Muse did not grant sessionMcp; the tool bridge cannot start",
      });
    }
    const commandId = host.connection.mintCommandId();
    const bridgeServer = input.toolBridge
      ? await startToolBridgeServer(input.toolBridge)
      : undefined;
    // `SessionConfig` is open: `mcpServers` and `developerPrompt` share it on
    // both start and resume. A blank developer prompt is the explicit clear and
    // would disable Muse's suppressible developer context, so only nonblank
    // text is forwarded.
    const developerPrompt = input.developerPrompt?.trim();
    const config =
      bridgeServer !== undefined || (developerPrompt !== undefined && developerPrompt.length > 0)
        ? {
            ...(bridgeServer === undefined
              ? {}
              : {
                  mcpServers: {
                    [BRIDGE_MCP_SERVER_NAME]: {
                      transport: "streamableHttp",
                      url: bridgeServer.url,
                      headers: { Authorization: `Bearer ${bridgeServer.token}` },
                      mode: "required",
                    },
                  },
                }),
            ...(developerPrompt === undefined || developerPrompt.length === 0
              ? {}
              : { developerPrompt }),
          }
        : undefined;

    // A bridge session is driven by opencode, whose permission evaluation is
    // the only fence. Asking Muse as well would double-ask, and a parked Muse
    // approval would hang a turn opencode has already decided.
    const approvalMode = input.toolBridge !== undefined ? "allowAll" : input.approvalMode;
    const startParams = () => ({
      workspaceRoot: input.cwd,
      ...(input.model ? { modelId: input.model } : {}),
      ...(approvalMode ? { approvalMode } : {}),
      ...(config === undefined ? {} : { config }),
    });
    // A failed construction starts fresh with a new command id: reusing one is
    // a protocol error, and a missing source must not take the chat down.
    const startFresh = () =>
      host.connection.command("session/start", startParams(), {
        commandId: host.connection.mintCommandId(),
      });

    let result: Record<string, unknown>;
    let resumeOutcome: "started" | "resumed" | "resume_fallback" = "started";
    if (input.resumeSessionId !== undefined) {
      try {
        result = await host.connection.command(
          "session/resume",
          {
            sessionId: input.resumeSessionId,
            ...(input.model ? { modelId: input.model } : {}),
            ...(config === undefined ? {} : { config }),
          },
          { commandId },
        );
        resumeOutcome = "resumed";
      } catch {
        // The retained session is gone (pruned, or a different host). The
        // fallback is a fresh native session, not a resume: callers must seed
        // the whole prompt instead of sending the tail as a delta.
        result = await startFresh();
        resumeOutcome = "resume_fallback";
      }
    } else {
      result = await host.connection.command("session/start", startParams(), { commandId });
    }

    const session = result?.session as Record<string, unknown> | undefined;
    const nativeSessionId =
      typeof session?.sessionId === "string" ? session.sessionId : input.sessionId;
    const model =
      typeof session?.modelId === "string" ? session.modelId : input.model ?? null;
    const createdAt =
      typeof session?.createdAt === "string" ? session.createdAt : now();

    const created = new MuseHarnessSession(
      host,
      { ...input, model },
      nativeSessionId,
      createdAt,
      input.toolBridge,
      bridgeServer,
      resumeOutcome,
    );
    host.registerSink(created);
    created.emit({ type: "session.updated", session: created.info });
    return created;
  }

  /**
   * Attach to an already-started native session without issuing `session/start`.
   * Used by replay tests, which drive a recorded transcript through the
   * notification handler.
   */
  static fromNativeSession(
    host: SessionHost,
    input: CreateSessionInput,
    nativeSessionId: string,
    model: string | null = null,
  ): MuseHarnessSession {
    const created = new MuseHarnessSession(
      host,
      { ...input, model },
      nativeSessionId,
      now(),
    );
    host.registerSink(created);
    return created;
  }

  get info(): HarnessSessionInfo {
    return this.sessionInfo;
  }

  /** The native Muse session id, used for notification routing. */
  get sessionId(): string {
    return this.nativeId;
  }

  /** The native Muse session id, for resume and persistence. */
  get nativeSessionId(): string {
    return this.nativeId;
  }

  /** Latest `session/contextUsage` for this session, if the host sent one. */
  get contextUsage(): ContextUsage | null {
    return this.lastContextUsage;
  }

  /** How many Muse-side compactions this session reported. */
  get compactionCount(): number {
    return this.compactionCountValue;
  }

  /** The most recent Muse compaction, if any. */
  get lastCompaction(): HistoryCompactedEvent | null {
    return this.lastCompactionValue;
  }

  /** Unknown item kinds, for the containment report. */
  get unexpectedItemKinds(): ReadonlyMap<string, number> {
    return this.unexpectedKindCounts;
  }

  /** Non-bridge tool calls observed on this session. */
  get containmentBreachCount(): number {
    return this.containmentBreaches;
  }

  private noteItemKind(kind: string): void {
    if (kind.length === 0 || KNOWN_ITEM_KINDS.has(kind)) return;
    this.unexpectedKindCounts.set(kind, (this.unexpectedKindCounts.get(kind) ?? 0) + 1);
  }

  /**
   * Report a native compaction exactly once, at its terminal.
   *
   * A compaction rewrites the native history. opencode owns that history, so
   * the next user turn has to reseed; dropping the item leaves the adapter
   * sending deltas against a context it believes is whole.
   */
  private emitCompaction(item: Record<string, unknown>): void {
    const itemId = typeof item.itemId === "string" ? item.itemId : undefined;
    if (itemId === undefined || this.emittedCompactions.has(itemId)) return;
    this.emittedCompactions.add(itemId);
    this.pendingCompactions.delete(itemId);
    const turnId = this.resolveTurnId(item.turnId);
    const event: HistoryCompactedEvent = {
      type: "history.compacted",
      itemId,
      ...(turnId.length === 0 ? {} : { turnId }),
      ...(typeof item.tokensBefore === "number" ? { tokensBefore: item.tokensBefore } : {}),
      ...(typeof item.tokensAfter === "number" ? { tokensAfter: item.tokensAfter } : {}),
      ...(typeof item.trigger === "string" ? { trigger: item.trigger } : {}),
      ...(typeof item.strategyId === "string" ? { strategy: item.strategyId } : {}),
      ...(typeof item.summarizedThrough === "string"
        ? { summarizedThrough: item.summarizedThrough }
        : {}),
      ...(typeof item.outcome === "string" ? { outcome: item.outcome } : {}),
      ...(typeof item.reason === "string" ? { reason: item.reason } : {}),
    };
    this.compactionCountValue += 1;
    this.lastCompactionValue = event;
    this.emit(event);
  }

  subscribe(): AsyncIterable<HarnessEvent> {
    return this.bus.subscribe();
  }

  private emit(event: HarnessEvent): void {
    if (!this.closed) this.bus.publish(event);
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new HarnessError({
        code: "session_stopped",
        adapterId: ADAPTER_ID,
        message: `Session ${this.id} is closed`,
      });
    }
  }

  /**
   * Muse's turn id, in opencode's turn-id space. A turn this side never minted
   * surfaces under its native id instead of vanishing. When the ack omitted
   * `turnId` and the host later names the turn, the single unconfirmed
   * assumption is adopted rather than left as a phantom pending turn.
   */
  private resolveTurnId(nativeTurnId: unknown, commandId?: unknown): string {
    if (typeof nativeTurnId !== "string") return "";
    const known = this.nativeToHost.get(nativeTurnId);
    if (known !== undefined) return known;
    // `turn/started` names the command that submitted it, which closes the
    // window before the ack without assuming `turnId == commandId`.
    if (typeof commandId === "string") {
      const hostTurnId = this.pendingStarts.get(commandId);
      if (hostTurnId !== undefined) {
        this.pendingStarts.delete(commandId);
        this.hostToNative.set(hostTurnId, nativeTurnId);
        this.nativeToHost.set(nativeTurnId, hostTurnId);
        return hostTurnId;
      }
    }
    if (this.assumedTurnIds.size === 1) {
      const [entry] = [...this.assumedTurnIds];
      if (entry !== undefined) {
        const [assumed, hostTurnId] = entry;
        this.adoptTurnId(assumed, nativeTurnId, hostTurnId);
        return hostTurnId;
      }
    }
    return nativeTurnId;
  }

  /** Re-key an assumed turn id once the host names the turn for real. */
  private adoptTurnId(assumed: string, actual: string, hostTurnId: string): void {
    this.assumedTurnIds.delete(assumed);
    if (this.nativeToHost.get(assumed) === hostTurnId) this.nativeToHost.delete(assumed);
    this.hostToNative.set(hostTurnId, actual);
    this.nativeToHost.set(actual, hostTurnId);
    const active = this.turns.get(hostTurnId);
    if (active) {
      active.turn = {
        ...active.turn,
        nativeRef: nativeRef(actual, this.capabilities.identity.nativeTurnIds),
      };
    }
  }

  private nativeTurnId(hostTurnId: string): string | undefined {
    return this.hostToNative.get(hostTurnId);
  }

  // ------------------------------------------------------------------ turns

  async startTurn(input: StartTurnInput): Promise<HarnessTurn> {
    this.assertOpen();
    // Muse absorbs a submit into the running turn (`ifBusy` defaults to
    // `queue`), but this adapter models one native turn per host turn. opencode
    // steers instead of submitting while a turn runs, so refusing is the honest
    // answer; a queued turn would share the running turn's native id.
    for (const [turnId, active] of this.turns) {
      if (!active.terminal) {
        throw new HarnessError({
          code: "unsupported",
          adapterId: ADAPTER_ID,
          retryable: true,
          message: `Turn ${turnId} is still running; steer or interrupt it first`,
        });
      }
    }
    const commandId = this.host.connection.mintCommandId();
    // Register before sending: `turn/started` can arrive before the ack, and it
    // carries this command id, so the event binds to this host turn instead of
    // minting a second one under the native id.
    this.pendingStarts.set(commandId, input.turnId);
    this.hostToNative.set(input.turnId, commandId);
    this.nativeToHost.set(commandId, input.turnId);
    let result: Record<string, unknown>;
    try {
      result = await this.host.connection.command(
        "turn/start",
        {
          sessionId: this.nativeId,
          ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
          input: toTurnInputParts(input.message),
        },
        { commandId },
      );
    } catch (error) {
      // A refused start must not leave a phantom turn or mapping behind. The
      // turn can only exist here if `turn/started` beat the refusal.
      this.pendingStarts.delete(commandId);
      if (this.hostToNative.get(input.turnId) === commandId) this.hostToNative.delete(input.turnId);
      if (this.nativeToHost.get(commandId) === input.turnId) this.nativeToHost.delete(commandId);
      this.assumedTurnIds.delete(commandId);
      const started = this.turns.get(input.turnId);
      if (started !== undefined && !started.terminal) this.turns.delete(input.turnId);
      throw error;
    }
    this.pendingStarts.delete(commandId);
    const acked = typeof result?.turnId === "string" ? result.turnId : undefined;
    const nativeTurnId = acked ?? commandId;
    this.hostToNative.set(input.turnId, nativeTurnId);
    this.nativeToHost.set(nativeTurnId, input.turnId);
    if (nativeTurnId !== commandId && this.nativeToHost.get(commandId) === input.turnId) {
      this.nativeToHost.delete(commandId);
    }
    if (acked === undefined) this.assumedTurnIds.set(nativeTurnId, input.turnId);
    else this.assumedTurnIds.delete(commandId);

    const existing = this.turns.get(input.turnId);
    if (existing !== undefined) {
      // `turn/started` already created the turn. Keep the status it reported
      // (running) and only correct the native ref the ack names.
      existing.turn = {
        ...existing.turn,
        nativeRef: nativeRef(nativeTurnId, this.capabilities.identity.nativeTurnIds),
      };
      return existing.turn;
    }

    const turn: HarnessTurn = {
      id: input.turnId,
      nativeRef: nativeRef(nativeTurnId, this.capabilities.identity.nativeTurnIds),
      ordinal: this.turns.size + 1,
      // The turn is accepted but not running until the host confirms it with
      // `turn/started`; `onTurnStarted` settles the status and emits the event.
      status: "pending",
      model: input.model ?? this.sessionInfo.model,
      startedAt: now(),
      completedAt: null,
    };
    this.turns.set(input.turnId, { turn, terminal: false });
    return turn;
  }

  /**
   * Switch the session's standing model. The host applies it at the next
   * model-call boundary when a turn is running, so the picker takes effect
   * without restarting the session.
   */
  async setModel(model: string): Promise<void> {
    this.assertOpen();
    await this.host.connection.command(
      "session/setModel",
      { sessionId: this.nativeId, model: { modelId: model } },
      { commandId: this.host.connection.mintCommandId() },
    );
    this.sessionInfo = { ...this.sessionInfo, model, updatedAt: now() };
  }

  async interruptTurn(input: InterruptTurnInput): Promise<void> {
    this.assertOpen();
    const nativeTurnId = this.nativeTurnId(input.turnId);
    if (nativeTurnId === undefined) {
      throw new HarnessError({
        code: "invalid_input",
        adapterId: ADAPTER_ID,
        message: `Unknown turn ${input.turnId}`,
      });
    }
    await this.host.connection.command(
      "turn/interrupt",
      { sessionId: this.nativeId, turnId: nativeTurnId },
    );
  }

  async steerTurn(input: SteerTurnInput): Promise<void> {
    this.assertOpen();
    const nativeTurnId = this.nativeTurnId(input.turnId);
    if (nativeTurnId === undefined) {
      throw new HarnessError({
        code: "invalid_input",
        adapterId: ADAPTER_ID,
        message: `Unknown turn ${input.turnId}`,
      });
    }
    await this.host.connection.command(
      "turn/steer",
      {
        sessionId: this.nativeId,
        expectedTurnId: nativeTurnId,
        ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
        input: toTurnInputParts(input.message),
      },
    );
  }

  async respondToRequest(input: HarnessRequestResponse): Promise<void> {
    this.assertOpen();
    const request = this.requests.get(input.requestId);
    if (!request) {
      throw new HarnessError({
        code: "invalid_input",
        adapterId: ADAPTER_ID,
        message: `Unknown runtime request ${input.requestId}`,
      });
    }
    if (request.status !== "pending") return;

    if (request.kind === "approval") {
      const choiceId = input.optionId;
      if (choiceId === undefined) {
        throw new HarnessError({
          code: "invalid_input",
          adapterId: ADAPTER_ID,
          message: `Approval ${input.requestId} needs an optionId`,
        });
      }
      const option = request.options?.find((entry) => entry.id === choiceId);
      if (input.feedback !== undefined && option?.acceptsFeedback !== true) {
        throw new HarnessError({
          code: "invalid_input",
          adapterId: ADAPTER_ID,
          message: `Choice ${choiceId} does not accept feedback`,
        });
      }
      const requirementId = this.requestRequirements.get(request.id);
      await this.host.connection.command("approval/decide", {
        sessionId: this.nativeId,
        approvalId: request.id,
        choiceId,
        ...(requirementId === undefined ? {} : { requirementId }),
        ...(input.feedback === undefined ? {} : { feedback: input.feedback }),
      });
      return;
    }

    if (request.kind === "user_input") {
      const answers = this.toUserInputAnswers(input);
      await this.host.connection.command("userInput/answer", {
        sessionId: this.nativeId,
        userInputId: request.id,
        answers,
      });
    }
  }

  private toUserInputAnswers(input: HarnessRequestResponse): Array<Record<string, unknown>> {
    const questions = this.requestQuestions.get(input.requestId) ?? [];
    const answers: Array<Record<string, unknown>> = [];
    for (const question of questions) {
      const supplied = input.answers?.[question.id];
      const answer: Record<string, unknown> = { questionId: question.id };
      if (Array.isArray(supplied)) {
        answer.selectedLabels = supplied.map((label) => String(label));
      } else if (typeof supplied === "string") {
        answer.selectedLabel = supplied;
      } else if (supplied && typeof supplied === "object" && typeof (supplied as { freeText?: unknown }).freeText === "string") {
        answer.freeText = (supplied as { freeText: string }).freeText;
      } else if (questions.length === 1 && input.optionId !== undefined) {
        answer.selectedLabel = input.optionId;
      } else if (question.selection.mode === "single" && question.options[0] !== undefined) {
        answer.selectedLabel = question.options[0].label;
      } else {
        answer.freeText = "";
      }
      answers.push(answer);
    }
    return answers;
  }

  async getSnapshot(): Promise<HarnessSnapshot> {
    this.assertOpen();
    return {
      session: this.sessionInfo,
      turns: [...this.turns.values()].map((active) => active.turn),
      messages: [...this.messages.values()],
      tools: [...this.tools.values()],
      requests: [...this.requests.values()],
    };
  }

  async close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = (async () => {
      if (this.closed) return;
      // Settle anything still open so the stream never ends with a hung item.
      for (const active of this.turns.values()) {
        if (!active.terminal) this.settleTurnItems(active);
      }
      for (const waiter of this.requestWaiters.values()) {
        waiter.reject(
          new HarnessError({
            code: "session_stopped",
            adapterId: ADAPTER_ID,
            message: "Session closed while waiting for a response",
          }),
        );
      }
      this.requestWaiters.clear();
      try {
        await this.host.connection.command(
          "session/leave",
          { sessionId: this.nativeId, stop: true },
        );
      } catch {
        // Leaving is best-effort; the host may already be gone.
      }
      this.host.unregisterSink(this.nativeId);
      this.updateSession("stopped");
      this.closed = true;
      this.bus.close();
      try {
        await this.toolBridge?.close?.();
      } catch {
        // Bridge cleanup is best-effort.
      }
      await this.bridgeServer?.close();
    })();
    return this.closing;
  }

  // ------------------------------------------------------------- notifications

  handleNotification(notification: MuseNotification): void {
    if (this.closed) return;
    const params = notification.params ?? {};
    // The closing `default` is deliberate: MSP gains notification kinds, and
    // an adapter that threw on the first unknown one would take a chat down.
    switch (notification.method) {
      case "turn/started":
        this.onTurnStarted(params);
        break;
      case "turn/completed":
        this.onTurnCompleted(params);
        break;
      case "item/started":
        this.onItemStarted(params);
        break;
      case "item/updated":
        this.onItemUpdated(params);
        break;
      case "item/delta":
        this.onItemDelta(params);
        break;
      case "item/completed":
        this.onItemCompleted(params);
        break;
      case "approval/requested":
        this.onApprovalRequested(params);
        break;
      case "approval/updated":
        this.onApprovalUpdated(params);
        break;
      case "approval/resolved":
        this.onApprovalResolved(params);
        break;
      case "userInput/requested":
        this.onUserInputRequested(params);
        break;
      case "userInput/settled":
        this.onUserInputSettled(params);
        break;
      case "session/tokenUsage":
        this.onTokenUsage(params);
        break;
      case "session/contextUsage":
        this.onContextUsage(params);
        break;
      case "session/statusChanged":
        this.onSessionStatusChanged(params);
        break;
      case "session/closed":
        this.onSessionClosed(params);
        break;
      default:
        break;
    }
  }

  private onTurnStarted(params: Record<string, unknown>): void {
    const nativeTurnId = typeof params.turnId === "string" ? params.turnId : undefined;
    if (nativeTurnId === undefined) return;
    const hostTurnId = this.resolveTurnId(nativeTurnId, params.commandId);
    const existing = this.turns.get(hostTurnId);
    if (existing && existing.turn.status !== "pending") return;

    const turn: HarnessTurn = {
      id: hostTurnId,
      nativeRef: nativeRef(nativeTurnId, this.capabilities.identity.nativeTurnIds),
      ordinal: existing ? existing.turn.ordinal : this.turns.size + 1,
      status: "running",
      model: existing?.turn.model ?? this.sessionInfo.model,
      startedAt: now(),
      completedAt: null,
    };
    this.turns.set(hostTurnId, { turn, terminal: false });
    this.emit({ type: "turn.started", turn });
  }

  private onTurnCompleted(params: Record<string, unknown>): void {
    const nativeTurnId = typeof params.turnId === "string" ? params.turnId : undefined;
    if (nativeTurnId === undefined) return;
    const hostTurnId = this.resolveTurnId(nativeTurnId);
    const active = this.turns.get(hostTurnId);
    if (!active || active.terminal) return;

    this.settleTurnItems(active);
    // Absent reason reads as failure: a turn is only reported successful when
    // the host says so.
    const terminal = typeof params.terminal === "string" ? params.terminal : "failed";
    const status = toTurnStatus(terminal);
    const failure = status === "failed" ? toFailure(params.error) : null;
    // `turn/completed` rarely carries usage (see fixtures); the per-completion
    // `session/tokenUsage` reports accumulated above are the primary source.
    const stored = this.turnUsage.get(nativeTurnId);
    this.turnUsage.delete(nativeTurnId);
    const inline = params.usage === undefined ? undefined : toTokenUsage(params.usage);
    const tokenUsage = stored ?? inline;
    const turn: HarnessTurn = {
      ...active.turn,
      status,
      completedAt: now(),
      ...(tokenUsage === undefined ? {} : { tokenUsage }),
    };
    active.turn = turn;
    active.terminal = true;
    this.emit({ type: "turn.updated", turn });
    this.emit({ type: "turn.terminal", turn, failure });
  }

  private onTokenUsage(params: Record<string, unknown>): void {
    const nativeTurnId = typeof params.turnId === "string" ? params.turnId : undefined;
    if (nativeTurnId === undefined) return;
    const breakdown = toTokenUsage(params.usage);
    const promptTokens = typeof params.promptTokens === "number" ? params.promptTokens : undefined;
    const totalTokens = typeof params.totalTokens === "number" ? params.totalTokens : undefined;
    // The SDK folds running session totals into `cumulative` (replace, never
    // sum). Its cost is the precise meter; the subscription's own usage/read
    // is integer percent and is too coarse to price a turn.
    const cumulative = params.cumulative as Record<string, unknown> | undefined;
    const cost = cumulative?.cost as Record<string, unknown> | undefined;
    const cumulativeUsd =
      typeof cost?.usd === "number" && Number.isFinite(cost.usd) ? cost.usd : undefined;
    const costPartial = cost?.partial === true;
    if (
      breakdown === undefined &&
      promptTokens === undefined &&
      totalTokens === undefined &&
      cumulativeUsd === undefined
    ) {
      return;
    }
    const prev = this.turnUsage.get(nativeTurnId);
    const advanced =
      totalTokens !== undefined && (prev?.totalTokens === undefined || totalTokens > prev.totalTokens);
    const counted = prev === undefined || advanced;
    let costDelta: number | undefined;
    if (cumulativeUsd !== undefined) {
      // A resumed session starts with the prior turns already in the meter, so
      // its first report is a baseline, not a spike that belongs to this row.
      const baseline =
        this.lastCumulativeUsd ?? (this.resumeOutcome === "resumed" ? cumulativeUsd : 0);
      costDelta = cumulativeUsd - baseline;
      this.lastCumulativeUsd = cumulativeUsd;
    }
    const next: TurnUsage = {
      inputTokens: max(prev?.inputTokens, promptTokens ?? breakdown?.inputTokens),
      cachedInputTokens: max(prev?.cachedInputTokens, breakdown?.cachedInputTokens),
      cacheWriteTokens: max(prev?.cacheWriteTokens, breakdown?.cacheWriteTokens),
      totalTokens: max(prev?.totalTokens, totalTokens ?? breakdown?.totalTokens),
      outputTokens:
        counted ? (prev?.outputTokens ?? 0) + (breakdown?.outputTokens ?? 0) : prev.outputTokens,
      reasoningTokens:
        counted
          ? (prev?.reasoningTokens ?? 0) + (breakdown?.reasoningTokens ?? 0)
          : prev.reasoningTokens,
      ...(costDelta === undefined ? {} : { costUsd: (prev?.costUsd ?? 0) + costDelta }),
      ...(costPartial || prev?.costPartial === true ? { costPartial: true } : {}),
      billedPromptTokens:
        (prev?.billedPromptTokens ?? 0) +
        (counted ? (promptTokens ?? breakdown?.inputTokens ?? 0) : 0),
      billedCacheRead:
        (prev?.billedCacheRead ?? 0) +
        (counted ? (breakdown?.cachedInputTokens ?? 0) : 0),
      billedCacheWrite:
        (prev?.billedCacheWrite ?? 0) +
        (counted ? (breakdown?.cacheWriteTokens ?? 0) : 0),
      billedOutput:
        (prev?.billedOutput ?? 0) +
        (counted ? (breakdown?.outputTokens ?? 0) : 0),
    };
    this.turnUsage.set(nativeTurnId, next);
  }

  private onContextUsage(params: Record<string, unknown>): void {
    const usedTokens = typeof params.usedTokens === "number" ? params.usedTokens : undefined;
    if (usedTokens === undefined) return;
    const windowTokens = typeof params.windowTokens === "number" ? params.windowTokens : undefined;
    const pressure = typeof params.pressure === "string" ? params.pressure : "unknown";
    this.lastContextUsage = {
      usedTokens,
      ...(windowTokens === undefined ? {} : { windowTokens }),
      pressure,
    };
  }

  private onItemStarted(params: Record<string, unknown>): void {
    const item = params.item as Record<string, unknown> | undefined;
    if (!item) return;
    const itemId = typeof item.itemId === "string" ? item.itemId : undefined;
    if (itemId === undefined) return;
    const kind = typeof item.kind === "string" ? item.kind : "";
    const turnId = this.resolveTurnId(item.turnId);
    const timestamp = now();
    this.noteItemKind(kind);

    if (kind === "compaction") {
      // Started items may already be terminal on a replayed frame; emit once.
      this.pendingCompactions.set(itemId, item);
      if (isTerminalItem(item)) this.emitCompaction(item);
      return;
    }

    if (kind === "agentMessage" || kind === "reasoning") {
      const message: HarnessMessage = {
        id: itemId,
        turnId,
        role: "assistant",
        content: [],
        status: "pending",
        createdAt: timestamp,
        completedAt: null,
      };
      this.messages.set(itemId, message);
      this.emit({ type: "message.started", message });
      return;
    }

    if (kind === "toolCall") {
      const rawTool = typeof item.tool === "string" ? item.tool : "";
      // The bridge namespace is the only tool authority opencode granted. A
      // tool outside it means a containment lever did not hold; report once,
      // never let the call look bridge-normalized.
      if (
        this.toolBridge !== undefined &&
        this.containment !== "off" &&
        rawTool.length > 0 &&
        !rawTool.startsWith(`mcp__${BRIDGE_MCP_SERVER_NAME}__`)
      ) {
        this.containmentBreaches += 1;
        if (!this.containmentReported) {
          this.containmentReported = true;
          console.warn(`[opencode-muse] containment breach: non-bridge tool ${rawTool}`);
          this.emit({
            type: "session.error",
            error: {
              class: "protocol",
              code: "containment_breach",
              message: `Muse called a tool outside the opencode bridge: ${rawTool}`,
              retryable: false,
            },
          });
        }
      }
      const tool: HarnessToolItem = {
        id: itemId,
        turnId,
        name: normalizeToolName(rawTool.length > 0 ? rawTool : "unknown"),
        input: parseToolArgs(item.args),
        status: "running",
        startedAt: timestamp,
        completedAt: null,
      };
      this.tools.set(itemId, tool);
      this.emit({ type: "tool.started", item: tool });
    }
  }

  private onItemUpdated(params: Record<string, unknown>): void {
    const item = params.item as Record<string, unknown> | undefined;
    if (!item) return;
    const status = typeof item.status === "string" ? item.status : "inProgress";
    // Only a settled item has anything to store here: while it runs, text and
    // output arrive through `item/delta`, so a partial frame would overwrite
    // the item with the same state it already has.
    if (status === "inProgress") return;
    // A terminal whole-item update is equivalent to item/completed.
    this.onItemCompleted({ item });
  }

  private onItemDelta(params: Record<string, unknown>): void {
    const itemId = typeof params.itemId === "string" ? params.itemId : undefined;
    const delta = typeof params.delta === "string" ? params.delta : "";
    if (itemId === undefined || delta.length === 0) return;
    const field = typeof params.field === "string" ? params.field : "text";

    const message = this.messages.get(itemId);
    if (message) {
      if (field === "text") {
        this.emit({ type: "message.delta", messageId: itemId, text: delta });
      } else if (field.startsWith("summary.")) {
        this.emit({ type: "message.delta", messageId: itemId, reasoning: delta });
      }
      return;
    }

    const tool = this.tools.get(itemId);
    if (tool && field === "output") {
      this.emit({ type: "tool.delta", itemId, chunk: delta });
    }
  }

  private onItemCompleted(params: Record<string, unknown>): void {
    const item = params.item as Record<string, unknown> | undefined;
    if (!item) return;
    const itemId = typeof item.itemId === "string" ? item.itemId : undefined;
    if (itemId === undefined) return;
    const kind = typeof item.kind === "string" ? item.kind : "";
    const status = typeof item.status === "string" ? item.status : "completed";
    const timestamp = now();
    this.noteItemKind(kind);

    if (kind === "compaction") {
      this.emitCompaction(item);
      return;
    }

    if (kind === "agentMessage" || kind === "reasoning") {
      const message = this.messages.get(itemId);
      if (!message) return;
      const updated: HarnessMessage = {
        ...message,
        content:
          kind === "agentMessage"
            ? textContent(typeof item.text === "string" ? item.text : "")
            : [],
        status: toMessageStatus(status),
        completedAt: timestamp,
      };
      this.messages.set(itemId, updated);
      this.emit({ type: "message.completed", message: updated });
      return;
    }

    if (kind === "toolCall") {
      const tool = this.tools.get(itemId);
      if (!tool) return;
      const updated: HarnessToolItem = {
        ...tool,
        status: toToolStatus(status),
        output: typeof item.visibleOutput === "string" ? item.visibleOutput : undefined,
        error: typeof item.failureReason === "string" ? item.failureReason : undefined,
        completedAt: timestamp,
      };
      this.tools.set(itemId, updated);
      this.emit({ type: "tool.completed", item: updated });
    }
  }

  /**
   * Copy the wire choices, keeping the decision and whether it accepts
   * feedback. A host that only sees labels cannot tell a denial from an
   * approval, and feedback sent on a non-accepting choice is a protocol error.
   */
  private approvalOptions(choices: unknown[]): HarnessRuntimeRequest["options"] {
    return choices.map((raw) => {
      const choice = raw as Record<string, unknown>;
      return {
        id: String(choice.choiceId ?? ""),
        label: String(choice.label ?? ""),
        ...(typeof choice.decision === "string" ? { decision: choice.decision } : {}),
        ...(choice.acceptsFeedback === true ? { acceptsFeedback: true } : {}),
      };
    });
  }

  private onApprovalRequested(params: Record<string, unknown>): void {
    const approvalId = typeof params.approvalId === "string" ? params.approvalId : undefined;
    if (approvalId === undefined) return;
    const choices = Array.isArray(params.availableChoices) ? params.availableChoices : [];
    const request: HarnessRuntimeRequest = {
      id: approvalId,
      turnId: this.resolveTurnId(params.turnId),
      nativeRef: nativeRef(approvalId, this.capabilities.identity.nativeRequestIds),
      kind: "approval",
      status: "pending",
      options: this.approvalOptions(choices),
      createdAt: now(),
      resolvedAt: null,
    };
    this.requests.set(request.id, request);
    if (params.currentRequirementId !== undefined) {
      this.requestRequirements.set(request.id, params.currentRequirementId);
    }
    this.emit({ type: "request.updated", request });
  }

  /**
   * A multi-stage approval advanced (or a restart refreshed it). The stored
   * choices and `currentRequirementId` are stale without this, so a later
   * `approval/decide` is rejected and the approval never resolves.
   */
  private onApprovalUpdated(params: Record<string, unknown>): void {
    const approvalId = typeof params.approvalId === "string" ? params.approvalId : undefined;
    if (approvalId === undefined) return;
    const request = this.requests.get(approvalId);
    if (!request) return;
    const choices = Array.isArray(params.availableChoices) ? params.availableChoices : [];
    if (params.currentRequirementId !== undefined) {
      this.requestRequirements.set(approvalId, params.currentRequirementId);
    }
    const updated: HarnessRuntimeRequest = {
      ...request,
      options: this.approvalOptions(choices),
    };
    this.requests.set(approvalId, updated);
    this.emit({ type: "request.updated", request: updated });
  }

  private onApprovalResolved(params: Record<string, unknown>): void {
    const approvalId = typeof params.approvalId === "string" ? params.approvalId : undefined;
    if (approvalId === undefined) return;
    const request = this.requests.get(approvalId);
    if (!request) return;
    const decision = typeof params.decision === "string" ? params.decision : "abort";
    const updated: HarnessRuntimeRequest = {
      ...request,
      status: toRequestStatus(decision),
      resolvedAt: now(),
    };
    this.requests.set(request.id, updated);
    this.emit({ type: "request.updated", request: updated });
    this.requestWaiters.get(request.id)?.resolve();
    this.requestWaiters.delete(request.id);
  }

  private onUserInputRequested(params: Record<string, unknown>): void {
    const userInputId = typeof params.userInputId === "string" ? params.userInputId : undefined;
    if (userInputId === undefined) return;
    const questions = Array.isArray(params.questions)
      ? (params.questions as UserInputQuestion[])
      : [];
    const first = questions[0];
    const request: HarnessRuntimeRequest = {
      id: userInputId,
      turnId: this.resolveTurnId(params.turnId),
      nativeRef: nativeRef(userInputId, this.capabilities.identity.nativeRequestIds),
      kind: "user_input",
      status: "pending",
      question: first?.question,
      options: (first?.options ?? []).map((option) => ({ id: option.label, label: option.label })),
      createdAt: now(),
      resolvedAt: null,
    };
    this.requests.set(request.id, request);
    this.requestQuestions.set(request.id, questions);
    this.emit({ type: "request.updated", request });
  }

  private onUserInputSettled(params: Record<string, unknown>): void {
    const userInputId = typeof params.userInputId === "string" ? params.userInputId : undefined;
    if (userInputId === undefined) return;
    const request = this.requests.get(userInputId);
    if (!request) return;
    const outcome = typeof params.outcome === "string" ? params.outcome : "aborted";
    const updated: HarnessRuntimeRequest = {
      ...request,
      status: toUserInputStatus(outcome),
      resolvedAt: now(),
    };
    this.requests.set(request.id, updated);
    this.emit({ type: "request.updated", request: updated });
    this.requestWaiters.get(request.id)?.resolve();
    this.requestWaiters.delete(request.id);
  }

  private onSessionStatusChanged(params: Record<string, unknown>): void {
    const status = typeof params.status === "string" ? params.status : "idle";
    this.updateSession(toSessionStatus(status));
  }

  private onSessionClosed(_params: Record<string, unknown>): void {
    this.updateSession("stopped");
  }

  private updateSession(status: HarnessSessionInfo["status"]): void {
    this.sessionInfo = { ...this.sessionInfo, status, updatedAt: now() };
    this.emit({ type: "session.updated", session: this.sessionInfo });
  }

  /** Settle every message, tool, and request still open for this turn. */
  private settleTurnItems(active: ActiveTurn): void {
    const timestamp = now();
    // A compaction that started but never completed still rewrote the native
    // history; report it before the turn terminal closes the window.
    for (const item of [...this.pendingCompactions.values()]) {
      if (this.resolveTurnId(item.turnId) === active.turn.id) this.emitCompaction(item);
    }
    for (const message of this.messages.values()) {
      if (message.turnId !== active.turn.id) continue;
      if (message.status === "pending" || message.status === "streaming") {
        const settled: HarnessMessage = { ...message, status: "failed", completedAt: timestamp };
        this.messages.set(message.id, settled);
        this.emit({ type: "message.completed", message: settled });
      }
    }
    for (const tool of this.tools.values()) {
      if (tool.turnId !== active.turn.id) continue;
      if (tool.status === "running") {
        const settled: HarnessToolItem = {
          ...tool,
          status: "cancelled",
          error: "Turn ended before the tool finished",
          completedAt: timestamp,
        };
        this.tools.set(tool.id, settled);
        this.emit({ type: "tool.completed", item: settled });
      }
    }
    for (const request of this.requests.values()) {
      if (request.turnId !== active.turn.id) continue;
      if (request.status === "pending") {
        const settled: HarnessRuntimeRequest = {
          ...request,
          status: "cancelled",
          resolvedAt: timestamp,
        };
        this.requests.set(request.id, settled);
        this.emit({ type: "request.updated", request: settled });
        this.requestWaiters.get(request.id)?.resolve();
        this.requestWaiters.delete(request.id);
      }
    }
  }
}
