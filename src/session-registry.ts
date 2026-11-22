import type { LanguageModelV3StreamPart, LanguageModelV3Usage } from "@ai-sdk/provider";
import type { HarnessEvent, HarnessToolBridge, HarnessToolResult } from "./contract/index.js";
import type { LanguageAdapter, LanguageSession } from "./language.js";
import type { HistoryCompactedEvent } from "./session.js";
import { StreamConverter } from "./convert.js";
import { appendLedgerRow, appendUsage, type HistoryRow } from "./usage-ledger.js";
import {
  decidePromptPolicy,
  PROBE_QUESTION,
  probeInstruction,
  probeSucceeded,
  type PromptDelivery,
} from "./prompt-policy.js";

/**
 * Split by lifetime, not by order: `MuseHarnessSession` (`session.ts`) owns one
 * Muse native session — its events, containment, compaction, and turn usage —
 * while `LiveSession` here owns OpenCode's step state: the stream controller,
 * the parked bridge calls, and per-step bookkeeping. One native session, many
 * steps.
 *
 * In file order: `ToolDefinition` (what a session may call); `SessionStore`,
 * `NativeCompactionMarker`, `STORE_VERSION` and `storeKey` (the durable
 * OpenCode → Muse session-id map); `PendingCall`, `Usage`, `StepStats` and
 * `toAIUsage` (step accounting); `LiveSession` (one OpenCode step, and the
 * parked bridge calls it owns, with `parseFingerprints` as its helper);
 * `MuseSessionRegistry` (the object the plugin holds).
 */
export interface ToolDefinition {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: Record<string, unknown>;
}

/** Durable OpenCode session id -> native Muse session id mapping. */
export interface SessionStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

/** The compaction hook's native window, kept until the next primary request. */
export interface NativeCompactionMarker {
  /** Fingerprint of the digest the hook installed, not just "a compaction". */
  readonly fingerprint: string;
  /** Messages in the replacement window; zero means summary-only. */
  readonly windowMessages: number;
}

/**
 * Store-key version. The transcript fingerprint format changed with this
 * version (tool identity is now part of it), so old keys are ignored: that
 * forces one clean reseed per existing session instead of matching a shape the
 * new code cannot verify.
 */
const STORE_VERSION = "v2";

/** Namespace a durable session key. */
export function storeKey(sessionID: string, suffix = ""): string {
  return `${STORE_VERSION}:${sessionID}${suffix}`;
}

export interface PendingCall {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
  resolve: (result: HarnessToolResult) => void;
  reject: (error: Error) => void;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  /** 1 when any completion's cost was provisional; merged from a boolean. */
  costPartial?: number;
  billedPromptTokens?: number;
  billedCacheRead?: number;
  billedCacheWrite?: number;
  billedOutput?: number;
  [key: string]: number | undefined;
}

/** What the step actually sent, recorded beside its usage. */
export interface StepStats {
  readonly renderedChars: number;
  readonly promptMessages: number;
  readonly toolBlocks: number;
  readonly truncated: boolean;
  readonly hostFingerprint: string | null;
  /**
   * Wall ms from the `turn/start` send to its ack, as this step waited; a
   * replayed admission (lost ack, same command id) is included twice over.
   * Absent on a steered step, which starts no turn.
   */
  readonly admitMs?: number;
}

/**
 * Convert our flat usage counters to the AI SDK v3 usage shape.
 *
 * The SDK splits input into fresh (`noCache`) and cached (`cacheRead` +
 * `cacheWrite`) portions with `total` as their sum; `text` is the visible
 * output excluding reasoning. Reporting the total as `noCache` (or the total
 * as `text`) would double-count the cached/reasoning portions downstream.
 */
export function toAIUsage(usage: Usage): LanguageModelV3Usage {
  const total = usage.inputTokens;
  const read = usage.cachedInputTokens;
  const write = usage.cacheWriteTokens;
  const output = usage.outputTokens;
  const reasoning = usage.reasoningTokens;
  return {
    inputTokens: {
      total,
      noCache:
        total === undefined ? undefined : Math.max(0, total - (read ?? 0) - (write ?? 0)),
      cacheRead: read,
      cacheWrite: write,
    },
    outputTokens: {
      total: output,
      text:
        output === undefined
          ? undefined
          : reasoning === undefined
            ? output
            : Math.max(0, output - reasoning),
      reasoning,
    },
  };
}

/**
 * One OpenCode chat session mapped to one Muse session.
 *
 * OpenCode owns the agent loop: each `doStream` call is one step. A step ends
 * when Muse parks on a tool call (the bridge emits a `tool-call` part and the
 * step finishes with `tool-calls`); OpenCode executes the tool and calls
 * `doStream` again with the result, which resolves the parked call and lets
 * Muse continue.
 */
export class LiveSession {
  readonly openCodeSessionId: string;
  readonly muse: LanguageSession;
  readonly pending = new Map<string, PendingCall>();

  private readonly converter = new StreamConverter();
  private controller: ReadableStreamDefaultController<LanguageModelV3StreamPart> | null = null;
  private queue: LanguageModelV3StreamPart[] = [];
  private turnActive = false;
  private currentTurnId: string | null = null;
  private stepAborted = false;
  private stepEnded = false;
  private lastPromptLength = 0;
  private transcript: string[] = [];
  private compactions: string[] = [];
  private counter = 0;
  private parkTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private stepUsage: Usage = {};
  private terminalError: Error | null = null;
  private preamble = "";
  private preambleSent = false;
  private readonly nativeDeveloperPrompt: boolean;
  private fresh = true;
  private model: string | null;
  private nativeHasHistoryValue: boolean;
  private stepNumber = 0;
  private stepSeed: "delta" | "full" = "delta";
  private stepReason = "first";
  private stepStats: StepStats = {
    renderedChars: 0,
    promptMessages: 0,
    toolBlocks: 0,
    truncated: false,
    hostFingerprint: null,
  };
  private stepStartedAt = 0;
  private turnToolCalls = 0;
  private compactionPendingValue = false;
  private nativeCheckpointValue = false;
  private lastCompactionValue: HistoryCompactedEvent | null = null;

  /** True until the first step seeds the prompt diff. */
  get isFresh(): boolean {
    return this.fresh;
  }

  markSeen(): void {
    this.fresh = false;
  }

  /**
   * True when this native session already holds context that is not in the
   * prompt: a session resumed after a host restart. A rebuilt session started
   * from no stored id has none and must be seeded from the whole prompt.
   */
  get nativeHasHistory(): boolean {
    return this.nativeHasHistoryValue;
  }

  /** Mark a just-rebuilt native session as carrying no prior context. */
  markNativeEmpty(): void {
    this.nativeHasHistoryValue = false;
  }

  /**
   * Prepend the agent role/instructions once, and again when they change.
   *
   * A session created with `developerPrompt` already carries the first value
   * natively, so the first turn must not repeat it. A later, different value
   * still travels in the next user turn; Muse has no per-session mutation for
   * that field.
   */
  prependPreamble(preamble: string): boolean {
    if (preamble.length === 0) return false;
    if (this.preamble === preamble && (this.preambleSent || this.nativeDeveloperPrompt)) return false;
    this.preamble = preamble;
    this.preambleSent = true;
    return true;
  }

  constructor(
    openCodeSessionId: string,
    muse: LanguageSession,
    private readonly toolsRef: { current: ToolDefinition[] } = { current: [] },
    developerPrompt = "",
    /** A resumed native session already holds the history this prompt repeats. */
    nativeHasHistory = false,
    /**
     * Whether the host is verified to honor `config.developerPrompt`. Unknown
     * is treated as false: sending the preamble twice is recoverable, losing
     * the agent role and instructions is not.
     */
    nativeDeveloperPrompt = developerPrompt.trim().length > 0,
    private readonly strictContainment = false,
  ) {
    this.openCodeSessionId = openCodeSessionId;
    this.nativeHasHistoryValue = nativeHasHistory;
    this.muse = muse;
    this.model = muse.info.model;
    this.preamble = developerPrompt.trim();
    this.nativeDeveloperPrompt = nativeDeveloperPrompt && this.preamble.length > 0;
    void this.pump();
  }

  /**
   * Offer this step's tools to the bridge. Each OpenCode session has its own
   * agent and therefore its own tool set; a shared list would serve one
   * session's tools to another.
   */
  setTools(tools: ReadonlyArray<ToolDefinition>): void {
    this.toolsRef.current = [...tools];
  }

  get promptLength(): number {
    return this.lastPromptLength;
  }

  set promptLength(value: number) {
    this.lastPromptLength = value;
  }

  /** Visible user/assistant fingerprints the native session has already seen. */
  get transcriptFingerprints(): readonly string[] {
    return this.transcript;
  }

  setTranscriptFingerprints(fingerprints: readonly string[]): void {
    this.transcript = [...fingerprints];
  }

  /** Compaction summaries this session produced, for rewrite detection. */
  get compactionFingerprints(): readonly string[] {
    return this.compactions;
  }

  setCompactionFingerprints(fingerprints: readonly string[]): void {
    this.compactions = [...fingerprints];
  }

  get hasActiveTurn(): boolean {
    return this.turnActive;
  }

  /**
   * Muse rewrote its own history and opencode has not been reseeded yet. The
   * flag deliberately survives the turn that saw the compaction: that turn may
   * continue on the summary, but the next user turn must be rebuilt.
   */
  get compactionPending(): boolean {
    return this.compactionPendingValue;
  }

  /** The compaction that set `compactionPending`, for the ledger. */
  get lastCompaction(): HistoryCompactedEvent | null {
    return this.lastCompactionValue;
  }

  /** Clear the pending flag once a user turn has acted on it. */
  consumeCompaction(): void {
    this.compactionPendingValue = false;
  }

  /**
   * The current history is the native window this plugin supplied. Pressure
   * and Muse-compaction rebuilds are suppressed: rebuilding would close the
   * session that already holds the history and reseed from a prompt that no
   * longer contains it.
   */
  get nativeCheckpoint(): boolean {
    return this.nativeCheckpointValue;
  }

  markNativeCheckpoint(): void {
    this.nativeCheckpointValue = true;
  }

  /**
   * True when the native window is at or past the reseed threshold. Pressure
   * is a pre-emption: it catches the case where Muse compacts without an item
   * the adapter can see.
   */
  get pressureReseed(): boolean {
    const usage = this.muse.contextUsage;
    if (!usage) return false;
    if (usage.pressure !== "normal") return true;
    if (usage.windowTokens === undefined || usage.windowTokens <= 0) return false;
    return usage.usedTokens / usage.windowTokens >= 0.9;
  }

  /** A stored native id existed, but the resume was refused and started fresh. */
  get resumeFallback(): boolean {
    return this.muse.resumeOutcome === "resume_fallback";
  }

  /** The native session was successfully resumed, so it already holds history. */
  get resumed(): boolean {
    return this.muse.resumeOutcome === "resumed";
  }

  /** Host turn id of the running turn, for `turn/steer` and `turn/interrupt`. */
  get activeTurnId(): string | null {
    return this.currentTurnId;
  }

  setActiveTurn(value: boolean, turnId?: string): void {
    // A new turn starts a new tool-call count.
    if (value && !this.turnActive) this.turnToolCalls = 0;
    this.turnActive = value;
    this.currentTurnId = value ? (turnId ?? null) : null;
  }

  /**
   * Switch the standing model. A no-op when the session already uses it, so a
   * step never pays for a redundant host command.
   */
  async setModel(model: string): Promise<void> {
    if (this.model === model) return;
    await this.muse.setModel(model);
    this.model = model;
  }

  get toolCounter(): number {
    return ++this.counter;
  }

  pendingCount(): number {
    return this.pending.size;
  }

  /** Subscribe the session's event stream once and pump it into the current step. */
  private async pump(): Promise<void> {
    try {
      for await (const event of this.muse.subscribe()) {
        if (this.closed) return;
        for (const part of this.converter.convert(event)) this.enqueue(part);
        if (event.type === "session.error" && event.error.code === "containment_breach") {
          // Warn mode records the breach and lets the turn continue; strict
          // mode turns it into the step's failure.
          if (this.strictContainment) {
            this.terminalError = new Error(event.error.message);
            if (this.currentTurnId !== null) {
              void this.muse.interruptTurn({ turnId: this.currentTurnId });
            }
          }
        }
        if (event.type === "history.compacted") {
          this.compactionPendingValue = true;
          this.lastCompactionValue = event;
          this.recordHistory("compaction", "muse_compaction", {
            ...(event.tokensBefore === undefined ? {} : { tokensBefore: event.tokensBefore }),
            ...(event.tokensAfter === undefined ? {} : { tokensAfter: event.tokensAfter }),
            ...(event.trigger === undefined ? {} : { trigger: event.trigger }),
            ...(event.strategy === undefined ? {} : { strategy: event.strategy }),
            ...(event.outcome === undefined ? {} : { outcome: event.outcome }),
          });
        }
        if (event.type === "turn.terminal") {
          this.setActiveTurn(false);
          if (event.turn.status === "failed") {
            this.terminalError = new Error(event.failure?.message ?? "Muse turn failed");
          }
          this.mergeUsage(event.turn.tokenUsage as Usage | undefined);
          if (this.pending.size > 0) {
            // The turn ended before its tool calls were answered; they can
            // never be. Reject them so the bridge does not wait forever.
            this.clearPending(new Error("Turn ended before the tool result arrived"));
          }
          // The step always settles here. Skipping the finish when calls are
          // pending leaves the stream open, and the next step hangs.
          this.endStep("stop");
        }
      }
    } catch {
      // The session stream ended; nothing to pump.
    }
  }

  private mergeUsage(usage: Usage | undefined): void {
    if (!usage) return;
    for (const [key, value] of Object.entries(usage)) {
      // The turn's cost flag arrives as a boolean, which the numeric merge
      // below would drop. Preserve it as a 1, never unset by a later false.
      if (key === "costPartial") {
        if ((value as unknown) === true) this.stepUsage.costPartial = 1;
        continue;
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        this.stepUsage[key] = (this.stepUsage[key] ?? 0) + value;
      }
    }
  }

  private enqueue(part: LanguageModelV3StreamPart): void {
    if (this.controller) {
      try {
        this.controller.enqueue(part);
        return;
      } catch {
        // The controller closed between the check and the enqueue.
      }
    }
    if (this.queue.length < 10_000) this.queue.push(part);
  }

  /**
   * Attach a new step's stream, flushing anything buffered while detached.
   *
   * A buffered finish means the step it belonged to already ended, so the new
   * stream closes right after it. With no turn running there is nothing to
   * wait for either: the step settles at once instead of hanging.
   */
  attach(controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>): void {
    this.controller = controller;
    this.stepEnded = false;
    const queue = this.queue;
    this.queue = [];
    let finished = false;
    for (const part of queue) {
      try {
        controller.enqueue(part);
      } catch {
        this.controller = null;
        return;
      }
      if (part.type === "finish") finished = true;
    }
    if (!finished && this.turnActive) return;
    this.controller = null;
    if (!finished) {
      // A terminal that landed between steps merged usage but skipped its
      // finish; report it here instead of dropping it.
      const usage = this.stepUsage;
      this.stepUsage = {};
      const error = this.terminalError;
      this.terminalError = null;
      try {
        if (error) controller.enqueue({ type: "error", error });
        controller.enqueue({
          type: "finish",
          finishReason: error
            ? { unified: "error", raw: "error" }
            : { unified: "stop", raw: "stop" },
          usage: toAIUsage(usage),
        });
      } catch {
        // Already closed.
      }
    }
    try {
      controller.close();
    } catch {
      // Already closed.
    }
  }

  detach(): void {
    this.controller = null;
  }

  /**
   * Stop the active turn because OpenCode cancelled the step.
   *
   * A turn still generating is interrupted natively, and the buffered parts
   * are dropped so a stale finish cannot reach the next step. A turn parked on
   * a tool call would otherwise wait forever, because OpenCode discards the
   * step that owed the result; its call is rejected and the turn is stopped.
   */
  async interrupt(): Promise<void> {
    if (!this.turnActive) return;
    const turnId = this.currentTurnId;
    this.setActiveTurn(false);
    this.stepAborted = true;
    this.queue = [];
    // A parked turn has a `tools/call` waiting on the bridge. If the step is
    // cancelled, OpenCode will never send that result, so reject it here and
    // interrupt the native turn; otherwise the session stays parked with a
    // turn OpenCode no longer knows about.
    if (this.pending.size > 0) {
      this.clearPending(new Error("Step cancelled before the tool result arrived"));
    }
    if (turnId !== null) {
      try {
        await this.muse.interruptTurn({ turnId });
      } catch {
        // The turn may already be over.
      }
    }
  }

  /** Why the most recent step seeded the native session. */
  get lastSeedReason(): string {
    return this.stepReason;
  }

  /** What the most recent step sent, for tests and diagnostics. */
  get lastStepStats(): StepStats {
    return this.stepStats;
  }

  /** Begin this step's ledger accounting; called once per `doStream`. */
  beginStep(seed: "delta" | "full", reason = "same", stats: StepStats = {
    renderedChars: 0,
    promptMessages: 0,
    toolBlocks: 0,
    truncated: false,
    hostFingerprint: null,
  }): void {
    this.stepNumber += 1;
    this.stepSeed = seed;
    this.stepReason = reason;
    this.stepStats = stats;
    this.stepStartedAt = Date.now();
  }

  /** Record a compaction or reseed explanation beside the turn rows. */
  recordHistory(
    event: HistoryRow["event"],
    reason: string,
    extra: Omit<HistoryRow, "type" | "ts" | "sessionID" | "event" | "reason"> = {},
  ): void {
    void appendLedgerRow({
      type: "history",
      ts: new Date().toISOString(),
      sessionID: this.openCodeSessionId,
      event,
      reason,
      ...extra,
    });
  }

  /** Emit a tool call to OpenCode and park the step. */
  emitToolCall(call: { toolCallId: string; toolName: string; input: unknown }): void {
    this.turnToolCalls += 1;
    this.enqueue({
      type: "tool-call",
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      input: typeof call.input === "string" ? call.input : JSON.stringify(call.input),
    });
    this.schedulePark();
  }

  private schedulePark(): void {
    if (this.parkTimer) clearTimeout(this.parkTimer);
    // A short debounce collects tool calls Muse issued in parallel.
    this.parkTimer = setTimeout(() => {
      this.parkTimer = null;
      this.endStep("tool-calls");
    }, 50);
    this.parkTimer.unref?.();
  }

  /** End the current step. */
  endStep(finishReason: "stop" | "tool-calls"): void {
    // A step ends once. A park and a terminal can both land on the same step
    // when a turn stops right after issuing a tool call.
    if (this.stepEnded) return;
    this.stepEnded = true;
    if (this.parkTimer) {
      clearTimeout(this.parkTimer);
      this.parkTimer = null;
    }
    const controller = this.controller;
    if (this.stepAborted) {
      // The step was cancelled: a finish for it would be a stray part in the
      // next step's stream. Close the controller we already detached instead.
      this.stepAborted = false;
      this.controller = null;
      if (controller) {
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
      return;
    }
    // The terminal parts belong to this step's controller. Detaching first
    // would park the finish in the queue, and the next step would open with a
    // foreign finish and settle immediately, ending OpenCode's agent loop.
    for (const part of this.converter.closeBlocks()) this.enqueue(part);
    const usage = this.stepUsage;
    this.stepUsage = {};
    this.recordUsage(usage);
    const error = this.terminalError;
    this.terminalError = null;
    if (error) this.enqueue({ type: "error", error });
    this.enqueue({
      type: "finish",
      finishReason: error
        ? { unified: "error", raw: "error" }
        : finishReason === "tool-calls"
        ? { unified: "tool-calls", raw: "tool_use" }
        : { unified: "stop", raw: "stop" },
      usage: toAIUsage(usage),
    });
    this.controller = null;
    if (controller) {
      try {
        controller.close();
      } catch {
        // Already closed.
      }
    }
  }

  /** Append this step's token counts to the local ledger, best effort. */
  private recordUsage(usage: Usage): void {
    // Muse reports token usage at the turn terminal. A step that parked on a
    // tool call ends before that, so it has no numbers; logging it as a zero
    // row would drag the input percentiles down and inflate the turn count.
    if (Object.keys(usage).length === 0) return;
    const at = new Date();
    void appendUsage({
      ts: at.toISOString(),
      sessionID: this.openCodeSessionId,
      step: this.stepNumber,
      kind: "primary",
      model: this.model ?? this.muse.info.model ?? "unknown",
      // Billed sums, not context high-water marks: a tool loop sends several
      // prompts in one turn and each one is billed. The ledger's percentiles
      // are about cost, so they must see the sum.
      input: usage.billedPromptTokens ?? usage.inputTokens ?? 0,
      cached: usage.billedCacheRead ?? usage.cachedInputTokens ?? 0,
      cacheWrite: usage.billedCacheWrite ?? usage.cacheWriteTokens ?? 0,
      output: usage.billedOutput ?? usage.outputTokens ?? 0,
      toolCalls: this.turnToolCalls,
      wallMs: this.stepStartedAt === 0 ? 0 : Math.max(0, at.getTime() - this.stepStartedAt),
      ...(this.stepStats.admitMs === undefined ? {} : { admitMs: this.stepStats.admitMs }),
      seed: this.stepSeed,
      seedReason: this.stepReason,
      renderedChars: this.stepStats.renderedChars,
      promptMessages: this.stepStats.promptMessages,
      toolBlocks: this.stepStats.toolBlocks,
      truncated: this.stepStats.truncated,
      hostFingerprint: this.stepStats.hostFingerprint,
      // Read-and-reset here, not at `beginStep`: a parked step writes no row, so
      // its fills belong to the next row that is. A row can therefore cover
      // more than one step, and each fill is still counted exactly once.
      ...this.converter.takeTextStats(),
      nativeSessionId: this.muse.nativeSessionId,
      ...(usage.costUsd === undefined ? {} : { costUsd: usage.costUsd }),
      ...(usage.costPartial === undefined ? {} : { costPartial: usage.costPartial > 0 }),
    });
  }

  /** Resolve a parked tool call from an OpenCode tool result. */
  resolvePending(toolCallId: string, result: HarnessToolResult): void {
    const pending = this.pending.get(toolCallId);
    if (!pending) return;
    this.pending.delete(toolCallId);
    pending.resolve(result);
  }

  /** Reject every parked call; used when the session ends or errors. */
  clearPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.parkTimer) clearTimeout(this.parkTimer);
    this.clearPending(new Error("Session closed"));
    await this.muse.close();
  }
}

/**
 * The registry owns every live session and the adapter that serves them.
 */
function parseFingerprints(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * The registry owns every live session and the adapter that serves them.
 */
export class MuseSessionRegistry {
  private readonly sessions = new Map<string, LiveSession>();
  private readonly transcriptBySession = new Map<string, string[]>();
  private readonly compactionBySession = new Map<string, string[]>();
  /** Sessions whose next primary request is the checkpoint the hook supplied. */
  private readonly nativeCompactions = new Map<string, NativeCompactionMarker>();
  /** Tail of the in-flight `get` per opencode id, so one key opens once. */
  private readonly getChains = new Map<string, Promise<unknown>>();
  private readonly adapter: LanguageAdapter;
  private readonly store: SessionStore | undefined;
  private hostFingerprintValue: string | null = null;
  private promptDeliveryValue: PromptDelivery = "unknown";
  private containmentModeValue: "strict" | "warn" | "off" = "warn";

  constructor(adapter: LanguageAdapter, store?: SessionStore) {
    this.adapter = adapter;
    this.store = store;
  }

  /** Record the served schema fingerprint for ledger rows and containment. */
  setHostFingerprint(fingerprint: string | null): void {
    this.hostFingerprintValue = fingerprint;
  }

  get hostFingerprint(): string | null {
    return this.hostFingerprintValue;
  }

  /** The cached probe result for this host; unknown means preamble fallback. */
  setPromptDelivery(delivery: PromptDelivery): void {
    this.promptDeliveryValue = delivery;
  }

  get promptDelivery(): PromptDelivery {
    return this.promptDeliveryValue;
  }

  /** Set once at startup; a containment breach in strict mode fails the turn. */
  setContainmentMode(mode: "strict" | "warn" | "off"): void {
    this.containmentModeValue = mode;
  }

  /**
   * One tiny throwaway turn that proves `developerPrompt` reached the model.
   * It never touches a user's live session. Callers decide when to spend it.
   */
  async probeDeveloperPrompt(canary: string, model?: string): Promise<boolean> {
    const response = await this.runOnce(
      process.cwd(),
      [{ type: "text", text: PROBE_QUESTION }],
      undefined,
      [],
      model,
      probeInstruction(canary),
    );
    return probeSucceeded(response.text, canary);
  }

  /** Read the Muse model catalog through the session's host. */
  async listModels(): Promise<Array<Record<string, unknown>>> {
    return this.adapter.listModels();
  }

  /**
   * Persist the visible transcript the native session now matches.
   *
   * The store is best-effort: losing the map only costs a full reseed on the
   * next start, while failing the request would lose the turn.
   */
  async rememberTranscript(sessionID: string, fingerprints: readonly string[]): Promise<void> {
    const copy = [...fingerprints];
    this.transcriptBySession.set(sessionID, copy);
    this.sessions.get(sessionID)?.setTranscriptFingerprints(copy);
    await this.store?.set(storeKey(sessionID, ":transcript"), JSON.stringify(copy)).catch(() => undefined);
  }

  /** Record a locally produced compaction summary so a rewrite can be named. */
  async recordCompaction(sessionID: string, fingerprint: string): Promise<void> {
    const next = [...(this.compactionBySession.get(sessionID) ?? []), fingerprint].slice(-8);
    this.compactionBySession.set(sessionID, next);
    this.sessions.get(sessionID)?.setCompactionFingerprints(next);
    await this.store?.set(storeKey(sessionID, ":compaction"), JSON.stringify(next)).catch(() => undefined);
  }

  compactionFingerprintsFor(sessionID: string): readonly string[] {
    return this.compactionBySession.get(sessionID) ?? [];
  }

  /** The compaction hook supplied this session's current native window. */
  markNativeCompaction(sessionID: string, marker: NativeCompactionMarker): void {
    this.nativeCompactions.set(sessionID, marker);
  }

  /** Consume the marker once, so a later rewind is not mistaken for it. */
  consumeNativeCompaction(sessionID: string): NativeCompactionMarker | undefined {
    const marker = this.nativeCompactions.get(sessionID);
    this.nativeCompactions.delete(sessionID);
    return marker;
  }

  /**
   * Get or create the live session for an OpenCode session id.
   *
   * A forked OpenCode session has a new id and therefore no stored native id,
   * so it starts a *new* native session: resuming the source's native id would
   * overwrite the source's notification sink, and a server-side fork inherits
   * the source's MCP bridge instead of this session's. Having no stored id is
   * also what tells the caller to seed the whole prompt rather than a delta.
   */
  async get(
    openCodeSessionId: string,
    cwd: string,
    model?: string,
    tools?: ReadonlyArray<ToolDefinition>,
    developerPrompt?: string,
  ): Promise<LiveSession> {
    // Serialize per opencode id. The body's `sessions.get` check and its later
    // `sessions.set` straddle awaits, so two concurrent callers both opened a
    // native session for one key and the second silently replaced the first.
    const prev = this.getChains.get(openCodeSessionId);
    const run = (prev ?? Promise.resolve()).then(() =>
      this.getInner(openCodeSessionId, cwd, model, tools, developerPrompt),
    );
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.getChains.set(openCodeSessionId, tail);
    try {
      return await run;
    } finally {
      // Only the last waiter clears the slot; a later `get` chains on `tail`.
      if (this.getChains.get(openCodeSessionId) === tail) this.getChains.delete(openCodeSessionId);
    }
  }

  private async getInner(
    openCodeSessionId: string,
    cwd: string,
    model?: string,
    /**
     * The tools this session's next step offers; the bridge serves them.
     * Omitted for utility requests, which must leave the live list alone.
     */
    tools?: ReadonlyArray<ToolDefinition>,
    /**
     * Agent role and instructions for a session this call creates. An existing
     * session keeps its native prompt; a changed value travels in the next turn.
     */
    developerPrompt?: string,
  ): Promise<LiveSession> {
    const existing = this.sessions.get(openCodeSessionId);
    if (existing) {
      if (tools !== undefined) existing.setTools(tools);
      if (model !== undefined) await existing.setModel(model);
      return existing;
    }

    const own = await this.store?.get(storeKey(openCodeSessionId));

    // The bridge is asked for its tool list during `session/start`, before the
    // LiveSession exists, so the list lives in a box the session later updates
    // instead of on the session itself.
    const toolsRef = { current: tools === undefined ? [] : [...tools] };
    let live: LiveSession | undefined;
    const bridge: HarnessToolBridge = {
      listTools: () => toolsRef.current,
      callTool: async (call) => {
        const current = live;
        if (!current) throw new Error("Session is not ready");
        const id = `muse_tool_${current.toolCounter}`;
        return new Promise<HarnessToolResult>((resolve, reject) => {
          // The opencode-side tool cannot be aborted from here, but the wait
          // can: release the parked call so it does not leak. The caller sees
          // the rejection and sends no result for the cancelled request.
          const onAbort = () => {
            current.pending.delete(id);
            reject(new Error("Tool call cancelled"));
          };
          const cleanup = () => call.signal?.removeEventListener("abort", onAbort);
          current.pending.set(id, {
            id,
            name: call.name,
            input: call.input,
            resolve: (value) => {
              cleanup();
              resolve(value);
            },
            reject: (error) => {
              cleanup();
              reject(error);
            },
          });
          if (call.signal?.aborted) {
            onAbort();
            return;
          }
          call.signal?.addEventListener("abort", onAbort, { once: true });
          current.emitToolCall({ toolCallId: id, toolName: call.name, input: call.input });
        });
      },
    };

    // Exactly once: a verified host gets the developer prompt natively and no
    // preamble; an unverified host gets the preamble and no duplicate native
    // copy. Unknown is treated as unverified.
    const nativePrompt = decidePromptPolicy(this.promptDeliveryValue).nativeDeveloperPrompt;
    const muse = await this.adapter.openSession({
      sessionId: openCodeSessionId,
      cwd,
      ...(model === undefined ? {} : { model }),
      ...(own !== undefined ? { resumeSessionId: own } : {}),
      ...(!nativePrompt || developerPrompt === undefined || developerPrompt.trim().length === 0
        ? {}
        : { developerPrompt }),
      containment: this.containmentModeValue,
      toolBridge: bridge,
    });
    live = new LiveSession(
      openCodeSessionId,
      muse,
      toolsRef,
      developerPrompt,
      own !== undefined,
      nativePrompt,
      this.containmentModeValue === "strict",
    );
    const transcript = parseFingerprints(await this.store?.get(storeKey(openCodeSessionId, ":transcript")));
    const compactions = parseFingerprints(await this.store?.get(storeKey(openCodeSessionId, ":compaction")));
    this.transcriptBySession.set(openCodeSessionId, transcript);
    this.compactionBySession.set(openCodeSessionId, compactions);
    live.setTranscriptFingerprints(transcript);
    live.setCompactionFingerprints(compactions);
    this.sessions.set(openCodeSessionId, live);
    if (this.store) {
      await this.store.set(storeKey(openCodeSessionId), live.muse.nativeSessionId).catch(() => undefined);
    }
    return live;
  }

  peek(openCodeSessionId: string): LiveSession | undefined {
    return this.sessions.get(openCodeSessionId);
  }

  async close(openCodeSessionId: string): Promise<void> {
    // An open in flight must land before the close looks: a close that ran
    // between the `get`'s check and its set left a live session nobody closes.
    await this.getChains.get(openCodeSessionId);
    const live = this.sessions.get(openCodeSessionId);
    this.nativeCompactions.delete(openCodeSessionId);
    if (!live) return;
    this.sessions.delete(openCodeSessionId);
    await live.close();
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.getChains.values()]);
    for (const session of this.sessions.values()) await session.close();
    this.sessions.clear();
    this.nativeCompactions.clear();
  }

  /**
   * Run a one-off Muse turn that does not touch a live session.
   *
   * Utility prompts (compaction, generate) are offered the chat's tools so the
   * request matches the cached shape; calls are still refused, since the
   * summary prompt must not perform work.
   */
  async runOnce(
    cwd: string,
    content: Array<{ type: "text"; text: string }>,
    signal?: AbortSignal,
    tools: ToolDefinition[] = [],
    model?: string,
    developerPrompt?: string,
  ): Promise<{ text: string; usage: Usage }> {
    const session = await this.adapter.openSession({
      sessionId: `oneoff_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      cwd,
      ...(model === undefined ? {} : { model }),
      ...(developerPrompt === undefined ? {} : { developerPrompt }),
      toolBridge: {
        listTools: () => tools,
        callTool: async (call) => ({
          content: [{ type: "text", text: `Tool ${call.name} is not available for this request.` }],
          isError: true,
        }),
      },
    });
    const events: HarnessEvent[] = [];
    const terminal = new Promise<void>((resolve) => {
      void (async () => {
        for await (const event of session.subscribe()) {
          events.push(event);
          if (event.type === "turn.terminal") resolve();
        }
      })();
    });
    await session.startTurn({
      turnId: `oneoff_turn_${Date.now()}`,
      message: { content },
    });
    try {
      await Promise.race([
        terminal,
        new Promise<void>((_, reject) => {
          const timer = setTimeout(() => reject(new Error("one-off turn timed out")), 120_000);
          timer.unref?.();
          signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new Error("aborted"));
          }, { once: true });
        }),
      ]);
    } finally {
      await session.close();
    }
    let text = "";
    for (const event of events) {
      if (event.type === "message.delta" && event.text) text += event.text;
      if (event.type === "message.completed" && event.message.role === "assistant") {
        text = event.message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");
      }
    }
    const terminalEvent = events.find((event) => event.type === "turn.terminal");
    if (terminalEvent?.type === "turn.terminal" && terminalEvent.turn.status === "failed") {
      throw new Error(terminalEvent.failure?.message ?? "Muse turn failed");
    }
    const usage: Usage =
      terminalEvent?.type === "turn.terminal" ? (terminalEvent.turn.tokenUsage as Usage | undefined) ?? {} : {};
    return { text, usage };
  }
}
