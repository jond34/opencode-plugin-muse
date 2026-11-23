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
import { MspError } from "@muse-code/sdk";
import type { HostDeathReason, MuseNotification, NotificationSink } from "./host.js";
import { startToolBridgeServer, normalizeToolName, BRIDGE_MCP_SERVER_NAME, type ToolBridgeServer } from "./bridge.js";
import { MUSE_CAPABILITIES } from "./capabilities.js";
import { hookGateRefusal, readHookCatalog } from "./hooks.js";
import {
  createTurnWatchdog,
  isSubstantiveProgress,
  watchdogConfigFromEnv,
  type TurnWatchdog,
} from "./watchdog.js";
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

/** Page size and page cap for a view-gap splice (MSP caps a page at 1–1000). */
const VIEW_GAP_PAGE_SIZE = 1000;
const VIEW_GAP_PAGE_LIMIT = 50;

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
  /**
   * Send a request-mode query (no injected `commandId`). Optional because the
   * connection is the host's: a replay host or test double may not offer it,
   * and a gap then degrades to warn-and-continue instead of throwing.
   */
  request?(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface SessionHost {
  readonly connection: SessionConnection;
  registerSink(sink: NotificationSink): void;
  unregisterSink(sessionId: string): void;
  /** Grants from the handshake, when the host can report them. */
  grantedCapabilities?(): readonly string[];
  /** Override the ack deadline; tests set it low so a hang is cheap. */
  readonly ackDeadlineMs?: number;
  /**
   * End the host process. The watchdog's last rung, and optional because a
   * replay host or test double may not own a process.
   */
  close?(): Promise<void>;
}

/** How long `turn/interrupt` gets on a host that may already be wedged. */
const WATCHDOG_INTERRUPT_BUDGET_MS = 2_000;

/**
 * How long `turn/start` may go unanswered before the admission is unknown.
 *
 * The wire sets no deadline of its own ("no local timeout", `connection.js`),
 * so without one a lost response parks the step forever. Thirty seconds is well
 * above any observed admission; nothing in the fixtures carries timing, so this
 * is a chosen bound rather than a measured one.
 */
const DEFAULT_ACK_DEADLINE_MS = 30_000;

/**
 * Bound a promise by a deadline and an abort signal.
 *
 * The work itself is not cancelled: the connection offers no cancellation, so
 * the promise is left to settle on its own while the caller decides what the
 * silence means. Its rejection is consumed by the `then` handler, so an
 * abandoned promise cannot raise an unhandled rejection later.
 */
function bounded<T>(work: Promise<T>, ms: number, signal: AbortSignal | undefined): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const onAbort = (): void => finish(() => reject(new Error("turn/start was cancelled")));
    const timer = setTimeout(
      () => finish(() => reject(new Error(`turn/start went unanswered for ${ms} ms`))),
      ms,
    );
    timer.unref?.();
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    work.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
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
  /**
   * Set while a `view/gap` splice is replaying, so live frames that arrive
   * mid-fill are delivered after the paged ones instead of interleaving.
   */
  private viewFill: {
    pending: MuseNotification[];
    backlog: Array<{ after: string; next: string }>;
  } | null = null;
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
  /** Set once the host died; a later close must not ask it to leave. */
  private hostGone = false;
  /** The clocks for the running turn, and whose turn they belong to. */
  private watchdog: TurnWatchdog | null = null;
  private watchdogTurnId: string | null = null;
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

    // The host reports every installed hook with its origin. A `project` or
    // `plugin` row is a command Muse runs outside opencode's permissions, so a
    // workspace that supplies one is refused until that exact file is accepted.
    // The check sits here because `hook/list` is per-session; it is still
    // before any turn, and a refusal leaves no session behind.
    const hookRefusal = hookGateRefusal(await readHookCatalog(host, nativeSessionId), input.cwd);
    if (hookRefusal !== null) {
      await host.connection
        .command(
          "session/leave",
          { sessionId: nativeSessionId, stop: true },
          { commandId: host.connection.mintCommandId() },
        )
        .catch(() => undefined);
      await bridgeServer?.close().catch(() => undefined);
      throw new HarnessError({
        code: "containment_breach",
        adapterId: ADAPTER_ID,
        message: hookRefusal,
      });
    }

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
    // A compaction may legitimately carry no turn; it still must not name one
    // that has terminated, so `materializeTurn` decides and `""` means turnless.
    const turnId = this.materializeTurn(item.turnId);
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
    // Reserve the turn in this same tick, before the first await. The guard
    // above is check-before-await otherwise: a second submit arriving while
    // this command is in flight sees no turn yet, sends its own, and Muse
    // absorbs one into the other.
    const reservation: ActiveTurn = {
      turn: {
        id: input.turnId,
        nativeRef: nativeRef(commandId, this.capabilities.identity.nativeTurnIds),
        ordinal: this.turns.size + 1,
        // Accepted, but not running until the host confirms it with
        // `turn/started`; `onTurnStarted` settles the status and emits the event.
        status: "pending",
        model: input.model ?? this.sessionInfo.model,
        startedAt: now(),
        completedAt: null,
      },
      terminal: false,
    };
    this.turns.set(input.turnId, reservation);
    const params: Record<string, unknown> = {
      sessionId: this.nativeId,
      ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
      input: toTurnInputParts(input.message),
    };
    let result: Record<string, unknown>;
    try {
      result = await this.admitTurn(params, commandId, input.signal);
    } catch (error) {
      if (error instanceof MspError) {
        // A refused start must not leave the reservation, a phantom turn, or a
        // mapping behind, whether the host refused it or `turn/started` beat
        // it: the server judged the command and admitted nothing.
        this.pendingStarts.delete(commandId);
        if (this.hostToNative.get(input.turnId) === commandId) this.hostToNative.delete(input.turnId);
        if (this.nativeToHost.get(commandId) === input.turnId) this.nativeToHost.delete(commandId);
        this.assumedTurnIds.delete(commandId);
        const started = this.turns.get(input.turnId);
        if (started !== undefined && !started.terminal) this.turns.delete(input.turnId);
        throw error;
      }
      // Anything else proves nothing: the transport died or the ack never came,
      // so the turn may be running on the host with no step to read it. Retire
      // the reservation instead of deleting it, so a late `turn/started` or
      // item resolves to a settled turn rather than minting a phantom one that
      // would refuse the next step.
      this.pendingStarts.delete(commandId);
      this.assumedTurnIds.delete(commandId);
      this.retireTurn(input.turnId, error);
      // Best effort: a fresh turn's id is its submitting command id, so an
      // admitted turn can still be stopped. An unadmitted one answers nothing
      // and the rejection is dropped.
      void this.host.connection
        .command("turn/interrupt", { sessionId: this.nativeId, turnId: commandId })
        .catch(() => {});
      throw new HarnessError({
        code: "protocol_error",
        adapterId: ADAPTER_ID,
        retryable: true,
        message: `Muse did not answer turn/start (${commandId}); the turn may have been admitted, so retry as a new step`,
        cause: error,
      });
    }
    this.pendingStarts.delete(commandId);
    const acked = typeof result?.turnId === "string" ? result.turnId : undefined;
    // Muse answers `started` when it opened a turn for this submit, and only
    // then: `startedNewTurn` is its boolean shorthand. The wire default is
    // `queue`, which admits this input to a turn that launches later, and
    // `steer` folds it into the running turn — `turnId` names whichever turn
    // carries it. Mapping that id onto this host turn would hand one native turn
    // to two of them, so the start is refused: this adapter runs one turn at a
    // time and opencode steers explicitly rather than submitting while busy.
    const disposition = typeof result?.disposition === "string" ? result.disposition : "started";
    if (disposition !== "started" || result?.startedNewTurn === false) {
      if (this.hostToNative.get(input.turnId) === commandId) this.hostToNative.delete(input.turnId);
      if (this.nativeToHost.get(commandId) === input.turnId) this.nativeToHost.delete(commandId);
      this.assumedTurnIds.delete(commandId);
      const reserved = this.turns.get(input.turnId);
      if (reserved !== undefined && !reserved.terminal) this.turns.delete(input.turnId);
      const absorbed =
        disposition === "queued"
          ? `queued this input for a later turn (${acked ?? "not yet named"})`
          : disposition === "steered"
            ? `absorbed this input into turn ${acked ?? "already running"}`
            : `did not start this input (disposition ${disposition})`;
      throw new HarnessError({
        code: "unsupported",
        adapterId: ADAPTER_ID,
        retryable: true,
        message: `Muse ${absorbed}; this adapter runs one turn at a time, so steer instead`,
      });
    }
    const nativeTurnId = acked ?? commandId;
    this.hostToNative.set(input.turnId, nativeTurnId);
    this.nativeToHost.set(nativeTurnId, input.turnId);
    if (nativeTurnId !== commandId && this.nativeToHost.get(commandId) === input.turnId) {
      this.nativeToHost.delete(commandId);
    }
    if (acked === undefined) this.assumedTurnIds.set(nativeTurnId, input.turnId);
    else this.assumedTurnIds.delete(commandId);

    // `turn/started` may have replaced the reservation with the running turn,
    // so read it back rather than holding the one made above.
    const active = this.turns.get(input.turnId) ?? reservation;
    // Keep the status and model the event reported, and only correct the native
    // ref the ack names.
    active.turn = {
      ...active.turn,
      nativeRef: nativeRef(nativeTurnId, this.capabilities.identity.nativeTurnIds),
    };
    this.turns.set(input.turnId, active);
    // The clocks start once the turn is admitted: before that, `turn/start`'s
    // own ack deadline is the bound, and a turn the host never accepted has no
    // stream to protect.
    this.armWatchdog(input.turnId);
    return active.turn;
  }

  /** Start the three clocks for this turn, replacing any previous ones. */
  private armWatchdog(turnId: string): void {
    this.stopWatchdog();
    const config = watchdogConfigFromEnv();
    if (config.firstByteMs === 0 && config.idleMs === 0) return;
    this.watchdogTurnId = turnId;
    this.watchdog = createTurnWatchdog({
      ...config,
      onWarn: (silentMs) =>
        console.warn(
          `[opencode-muse] no frame for ${silentMs} ms; the turn is still waiting on the host`,
        ),
      onExpire: (reason) => this.onWatchdogExpire(turnId, reason, config),
    });
  }

  private stopWatchdog(): void {
    this.watchdog?.stop();
    this.watchdog = null;
    this.watchdogTurnId = null;
  }

  /**
   * A budget expired. Fail the turn as a timeout, then end the host.
   *
   * The order is the point: the terminal must name the timeout, not the host
   * exit the timeout caused. `turn/interrupt` gets a short budget first because
   * a host that is merely slow can still honour it; one that is wedged will
   * not, and `close()` is the rung that always works (E-D2).
   */
  private onWatchdogExpire(
    turnId: string,
    reason: "first_byte" | "idle",
    config: { firstByteMs: number; idleMs: number },
  ): void {
    this.watchdog = null;
    this.watchdogTurnId = null;
    const budget = reason === "first_byte" ? config.firstByteMs : config.idleMs;
    const active = this.turns.get(turnId);
    // An admitted turn whose `turn/started` never arrived is still a turn
    // opencode is waiting on, so it must get its terminal rather than be
    // retired silently as a reservation that never reached anyone.
    if (active !== undefined && !active.terminal && active.turn.status === "pending") {
      active.turn = { ...active.turn, status: "running" };
    }
    const failure = new HarnessError({
      code: "host_idle_timeout",
      adapterId: ADAPTER_ID,
      retryable: true,
      message:
        reason === "first_byte"
          ? `Muse sent no frame within ${budget} ms; the host was ended and the turn failed`
          : `Muse sent no frame for ${budget} ms after starting; the host was ended and the turn failed`,
    });
    this.retireTurn(turnId, failure);
    void this.endWedgedHost(this.nativeTurnId(turnId) ?? turnId);
  }

  /** The abort ladder: interrupt with a budget, then close, then report gone. */
  private async endWedgedHost(nativeTurnId: string): Promise<void> {
    try {
      await Promise.race([
        this.host.connection.command("turn/interrupt", {
          sessionId: this.nativeId,
          turnId: nativeTurnId,
        }),
        new Promise<void>((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error("interrupt budget expired")),
            WATCHDOG_INTERRUPT_BUDGET_MS,
          );
          timer.unref?.();
        }),
      ]);
    } catch {
      // A wedged host answers nothing; that is the case this ladder is for.
    }
    try {
      await this.host.close?.();
    } catch {
      // Closing is best-effort; the turn is already retired.
    }
    // The session cannot serve another turn on a closed host. Marking it gone
    // is what makes the registry reopen it, and the stored native id is what
    // that reopen resumes.
    this.handleHostExit("exited");
  }

  /**
   * Send `turn/start`, replaying it once under the same command id when the
   * failure proves nothing.
   *
   * `Connection.command` already replays the two nothing-admitted refusals
   * (`-32001`, `-32031`) under this id and rejects a replay whose ack would
   * differ, so a second send cannot double-execute; what it cannot do is replay
   * a dead transport or a response that never arrived. Those are the cases
   * here. A server-authored `MspError` is a judgment and is not replayed.
   */
  private async admitTurn(
    params: Record<string, unknown>,
    commandId: string,
    signal: AbortSignal | undefined,
  ): Promise<Record<string, unknown>> {
    const deadline = this.host.ackDeadlineMs ?? DEFAULT_ACK_DEADLINE_MS;
    try {
      return await bounded(
        this.host.connection.command("turn/start", params, { commandId }),
        deadline,
        signal,
      );
    } catch (error) {
      if (error instanceof MspError || signal?.aborted === true) throw error;
      // Byte-identical params under the original id: the host records the ack
      // once and serves it again, so this cannot run the input twice.
      return await bounded(
        this.host.connection.command("turn/start", params, { commandId }),
        deadline,
        signal,
      );
    }
  }

  /**
   * Settle a start that will not be read, keeping it as a tombstone.
   *
   * A turn the host announced already reached opencode, so it gets its terminal
   * (plus any pending tool items settled). A turn that only reached the
   * reservation is marked failed silently: opencode never saw it start, so a
   * terminal would be an event without a beginning.
   */
  private retireTurn(turnId: string, failure: unknown): void {
    const active = this.turns.get(turnId);
    if (active === undefined || active.terminal) return;
    const announced = active.turn.status !== "pending";
    active.turn = { ...active.turn, status: "failed", completedAt: now() };
    active.terminal = true;
    if (!announced) return;
    this.settleTurnItems(active);
    this.emit({ type: "turn.updated", turn: active.turn });
    this.emit({ type: "turn.terminal", turn: active.turn, failure: toFailure(failure) });
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
      try {
        await this.host.connection.command("approval/decide", {
          sessionId: this.nativeId,
          approvalId: request.id,
          choiceId,
          ...(requirementId === undefined ? {} : { requirementId }),
          ...(input.feedback === undefined ? {} : { feedback: input.feedback }),
        });
      } catch (error) {
        this.applyApprovalRejection(error, request.id, choiceId);
      }
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

  /**
   * The three typed rejections `approval/decide` can answer with.
   *
   * `approvalAlreadyResolved` is a success in disguise: the host carries the
   * winning decision, so the request settles here instead of staying pending
   * forever. The other two leave the approval open — it really is still
   * undecided — so the request stays pending, the stage token is refreshed where
   * the wire carried one, and the caller is told the decision did not apply.
   * Nothing is retried: a stale decision is stale, and the wire carries the
   * rejected choice on `approvalChoiceInvalid`, not a replacement menu, so no
   * menu is invented locally.
   */
  private applyApprovalRejection(error: unknown, approvalId: string, choiceId: string): void {
    if (!(error instanceof MspError)) throw error;
    switch (error.kind) {
      case "approvalAlreadyResolved": {
        const resolution = error.data.resolution as { decision?: unknown } | undefined;
        const decision = typeof resolution?.decision === "string" ? resolution.decision : "abort";
        this.settleApprovalFromHost(approvalId, decision);
        return;
      }
      case "approvalRequirementStale": {
        const next = error.data.currentRequirementId;
        if (typeof next === "string") this.requestRequirements.set(approvalId, next);
        const current = this.requests.get(approvalId);
        if (current?.status === "pending") {
          this.emit({ type: "request.updated", request: current });
        }
        throw new HarnessError({
          code: "invalid_input",
          adapterId: ADAPTER_ID,
          message: `Approval ${approvalId} moved to a new stage: the decision was stale. Decide again.`,
        });
      }
      case "approvalChoiceInvalid": {
        const rejected = typeof error.data.choiceId === "string" ? error.data.choiceId : choiceId;
        throw new HarnessError({
          code: "invalid_input",
          adapterId: ADAPTER_ID,
          message: `Muse rejected choice ${rejected} for approval ${approvalId}; the approval is still open.`,
        });
      }
      default:
        throw error;
    }
  }

  /** Apply a decision the host says already won, without re-sending it. */
  private settleApprovalFromHost(approvalId: string, decision: string): void {
    const current = this.requests.get(approvalId);
    if (!current || current.status !== "pending") return;
    const updated: HarnessRuntimeRequest = {
      ...current,
      status: toRequestStatus(decision),
      resolvedAt: now(),
    };
    this.requests.set(approvalId, updated);
    this.requestRequirements.delete(approvalId);
    this.emit({ type: "request.updated", request: updated });
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

  /** True once the host died under this session; it cannot serve a turn again. */
  get hostExited(): boolean {
    return this.hostGone;
  }

  /**
   * The host process died. Retire whatever turn was running, so its step ends
   * with an error instead of hanging on notifications that will never arrive,
   * then close without asking a dead host to leave the session.
   */
  handleHostExit(reason: HostDeathReason = "exited"): void {
    if (this.closed || this.hostGone) return;
    this.hostGone = true;
    this.stopWatchdog();
    // A transport EOF may leave the process alive, so the failure says what was
    // observed instead of claiming an exit, and a retry can reach a new host.
    const transportEof = reason === "transportEof";
    const failure = new HarnessError({
      code: "event_stream_failed",
      adapterId: ADAPTER_ID,
      message: transportEof
        ? "Muse host closed its output while this turn was running"
        : "Muse host exited while this turn was running",
      retryable: transportEof,
    });
    for (const [turnId, active] of this.turns) {
      if (!active.terminal) this.retireTurn(turnId, failure);
    }
    void this.close();
  }

  async close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = (async () => {
      if (this.closed) return;
      this.stopWatchdog();
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
      if (!this.hostGone) {
        try {
          await this.host.connection.command(
            "session/leave",
            { sessionId: this.nativeId, stop: true },
          );
        } catch {
          // Leaving is best-effort; the host may already be gone.
        }
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
    // Arrival is what the clocks measure. Only a substantive frame counts, so
    // keepalives and usage echoes cannot make a wedged turn look alive.
    this.watchdog?.touch(isSubstantiveProgress(notification.method));
    // Splice-fill: a page may only be replayed in view order, so live frames
    // wait for the fill to finish rather than overtaking it. A second gap is
    // queued by `onViewGap` instead, since it starts its own fill.
    if (this.viewFill !== null && notification.method !== "view/gap") {
      this.viewFill.pending.push(notification);
      return;
    }
    this.dispatch(notification);
  }

  private dispatch(notification: MuseNotification): void {
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
      case "view/gap":
        this.onViewGap(params);
        break;
      default:
        break;
    }
  }

  /**
   * A `view/gap` says the frames between `after` and `next` were dropped. Splice
   * them back with `view/page`, a request-mode read: it takes no lease and does
   * not re-issue a command, unlike `session/resume`.
   */
  private onViewGap(params: Record<string, unknown>): void {
    const after = typeof params.after === "string" ? params.after : "";
    const next = typeof params.next === "string" ? params.next : "";
    // Without both bounds there is no range to ask for; the warning below is
    // the only thing this adapter can honestly say.
    if (after.length === 0 || next.length === 0) return;
    if (this.viewFill !== null) {
      // One fill at a time; this gap's turn comes after the current one drains.
      this.viewFill.backlog.push({ after, next });
      return;
    }
    const fill = {
      pending: [] as MuseNotification[],
      backlog: [] as Array<{ after: string; next: string }>,
    };
    this.viewFill = fill;
    void this.fillGap(after, next, fill);
  }

  private async fillGap(
    after: string,
    next: string,
    fill: { pending: MuseNotification[]; backlog: Array<{ after: string; next: string }> },
  ): Promise<void> {
    const connection = this.host.connection;
    let replayed = 0;
    let pages = 0;
    let failure: unknown;
    if (connection.request === undefined) {
      failure = new Error("this host connection cannot send view/page");
    } else {
      let cursor = after;
      try {
        while (pages < VIEW_GAP_PAGE_LIMIT) {
          const result = await connection.request("view/page", {
            sessionId: this.nativeId,
            cursor,
            direction: "forward",
            limit: VIEW_GAP_PAGE_SIZE,
          });
          pages += 1;
          const events = Array.isArray(result?.events) ? result.events : [];
          for (const raw of events) {
            const frame = raw as { method?: unknown; params?: unknown };
            if (typeof frame.method !== "string") continue;
            this.dispatch({
              method: frame.method,
              params: (frame.params ?? {}) as Record<string, unknown>,
            });
            replayed += 1;
          }
          // Cursors are opaque: only equality means anything, never order.
          const nextCursor = typeof result?.nextCursor === "string" ? result.nextCursor : null;
          if (nextCursor === null || nextCursor === next || nextCursor === cursor) break;
          cursor = nextCursor;
        }
      } catch (error) {
        failure = error;
      }
    }
    // Drain what waited in arrival order even when the fill failed: the live
    // stream must not stall behind a range that cannot be repaired.
    this.viewFill = null;
    for (const pending of fill.pending) this.dispatch(pending);
    if (failure !== undefined) {
      console.warn(
        `[opencode-muse] view gap after ${after} could not be replayed; continuing live`,
        failure,
      );
    } else {
      console.warn(
        `[opencode-muse] view gap after ${after}: replayed ${replayed} events in ${pages} page(s)`,
      );
    }
    // A gap that arrived mid-fill starts a fill of its own.
    for (const queued of fill.backlog) {
      this.onViewGap({ after: queued.after, next: queued.next });
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

    this.stopWatchdog();
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

  /**
   * The host turn an item belongs to, created if this side never saw it start.
   *
   * An item frame can arrive without its `turn/started`: the start may have
   * preceded the subscription, or fallen in a view gap. The contract requires
   * `turn.started` first, so the turn is materialized here rather than letting
   * the item's events hang off an id no turn owns. Returns `""` when the frame
   * names no turn, or when that turn has already terminated — nothing may
   * follow a terminal.
   *
   * No guessing is needed in the pre-ack window: a fresh turn's id equals its
   * submitting `commandId` (`TurnStartedParams.turnId`), and `startTurn`
   * registers that id before sending, so the item already resolves to its host
   * turn and the reservation is promoted rather than replaced.
   */
  private materializeTurn(nativeTurnId: unknown, commandId?: unknown): string {
    const hostTurnId = this.resolveTurnId(nativeTurnId, commandId);
    if (hostTurnId.length === 0 || typeof nativeTurnId !== "string") return "";
    return this.startMaterializedTurn(hostTurnId, nativeTurnId);
  }

  /** Emit `turn.started` once for a turn, promoting a reservation if present. */
  private startMaterializedTurn(hostTurnId: string, nativeTurnId: string): string {
    const existing = this.turns.get(hostTurnId);
    if (existing?.terminal) return "";
    if (existing !== undefined) {
      // `startTurn` reserves the turn as pending; the host is running it now.
      if (existing.turn.status !== "pending") return hostTurnId;
      const turn: HarnessTurn = { ...existing.turn, status: "running" };
      this.turns.set(hostTurnId, { turn, terminal: false });
      this.emit({ type: "turn.started", turn });
      return hostTurnId;
    }

    const turn: HarnessTurn = {
      id: hostTurnId,
      nativeRef: nativeRef(nativeTurnId, this.capabilities.identity.nativeTurnIds),
      ordinal: this.turns.size + 1,
      status: "running",
      model: this.sessionInfo.model,
      startedAt: now(),
      completedAt: null,
    };
    this.turns.set(hostTurnId, { turn, terminal: false });
    this.emit({ type: "turn.started", turn });
    return hostTurnId;
  }

  /** Build the started tool item, including the containment check. */
  private toolItemFromFrame(
    item: Record<string, unknown>,
    itemId: string,
    turnId: string,
    timestamp: string,
  ): HarnessToolItem {
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
    return {
      id: itemId,
      turnId,
      name: normalizeToolName(rawTool.length > 0 ? rawTool : "unknown"),
      input: parseToolArgs(item.args),
      status: "running",
      startedAt: timestamp,
      completedAt: null,
    };
  }

  private onItemStarted(params: Record<string, unknown>): void {
    const item = params.item as Record<string, unknown> | undefined;
    if (!item) return;
    const itemId = typeof item.itemId === "string" ? item.itemId : undefined;
    if (itemId === undefined) return;
    const kind = typeof item.kind === "string" ? item.kind : "";
    const timestamp = now();
    this.noteItemKind(kind);

    if (kind === "compaction") {
      // Started items may already be terminal on a replayed frame; emit once.
      this.pendingCompactions.set(itemId, item);
      if (isTerminalItem(item)) this.emitCompaction(item);
      return;
    }

    if (kind === "agentMessage" || kind === "reasoning") {
      const turnId = this.materializeTurn(item.turnId);
      if (turnId.length === 0) return;
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
      const turnId = this.materializeTurn(item.turnId);
      if (turnId.length === 0) return;
      const tool = this.toolItemFromFrame(item, itemId, turnId, timestamp);
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
      const turnId = this.materializeTurn(item.turnId);
      if (turnId.length === 0) return;
      let message = this.messages.get(itemId);
      if (!message) {
        // The started frame was missed. Synthesize it so the completion is not
        // dropped, keeping `message.started` ahead of `message.completed`.
        message = {
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
      }
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
      const turnId = this.materializeTurn(item.turnId);
      if (turnId.length === 0) return;
      let tool = this.tools.get(itemId);
      if (!tool) {
        // Same recovery as a message: the call started before this side was
        // listening, so emit the started shape the completion extends.
        tool = this.toolItemFromFrame(item, itemId, turnId, timestamp);
        this.tools.set(itemId, tool);
        this.emit({ type: "tool.started", item: tool });
      }
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
