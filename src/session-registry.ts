import type { LanguageModelV3StreamPart, LanguageModelV3Usage } from "@ai-sdk/provider";
import type { HarnessEvent, HarnessToolBridge, HarnessToolResult } from "./contract/index.js";
import { MuseHarnessAdapter } from "./adapter.js";
import type { MuseHarnessSession } from "./session.js";
import { StreamConverter } from "./convert.js";

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
  [key: string]: number | undefined;
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
  readonly muse: MuseHarnessSession;
  readonly pending = new Map<string, PendingCall>();

  private readonly converter = new StreamConverter();
  private controller: ReadableStreamDefaultController<LanguageModelV3StreamPart> | null = null;
  private queue: LanguageModelV3StreamPart[] = [];
  private turnActive = false;
  private currentTurnId: string | null = null;
  private stepAborted = false;
  private stepEnded = false;
  private lastPromptLength = 0;
  private counter = 0;
  private parkTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private stepUsage: Usage = {};
  private terminalError: Error | null = null;
  private preamble = "";
  private preambleSent = false;
  private fresh = true;
  private model: string | null;
  private fullSeed = false;

  /** True until the first step seeds the prompt diff. */
  get isFresh(): boolean {
    return this.fresh;
  }

  markSeen(): void {
    this.fresh = false;
  }

  /** The next turn carries the full conversation: a forked native session has seen nothing yet. */
  requestFullSeed(): void {
    this.fullSeed = true;
  }

  /** Consume the one-shot full-seed flag. */
  takeFullSeed(): boolean {
    const value = this.fullSeed;
    this.fullSeed = false;
    return value;
  }

  /** Prepend the agent role/instructions once, and again when they change. */
  prependPreamble(preamble: string): boolean {
    if (preamble.length === 0) return false;
    if (this.preambleSent && this.preamble === preamble) return false;
    this.preamble = preamble;
    this.preambleSent = true;
    return true;
  }

  constructor(
    openCodeSessionId: string,
    muse: MuseHarnessSession,
    private readonly toolsRef: { current: ToolDefinition[] } = { current: [] },
  ) {
    this.openCodeSessionId = openCodeSessionId;
    this.muse = muse;
    this.model = muse.info.model;
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

  get hasActiveTurn(): boolean {
    return this.turnActive;
  }

  /** Host turn id of the running turn, for `turn/steer` and `turn/interrupt`. */
  get activeTurnId(): string | null {
    return this.currentTurnId;
  }

  setActiveTurn(value: boolean, turnId?: string): void {
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

  /** Emit a tool call to OpenCode and park the step. */
  emitToolCall(call: { toolCallId: string; toolName: string; input: unknown }): void {
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
export class MuseSessionRegistry {
  private readonly sessions = new Map<string, LiveSession>();
  private readonly adapter: MuseHarnessAdapter;
  private readonly store: SessionStore | undefined;

  constructor(adapter: MuseHarnessAdapter, store?: SessionStore) {
    this.adapter = adapter;
    this.store = store;
  }

  /** Read the Muse model catalog through the session's host. */
  async listModels(): Promise<Array<Record<string, unknown>>> {
    return this.adapter.listModels();
  }

  /**
   * Get or create the live session for an OpenCode session id.
   *
   * `resumeFrom` is the OpenCode id of the session being forked. A fork starts
   * a *new* native session: resuming the source's native id would overwrite
   * the source's notification sink, and a server-side fork inherits the
   * source's MCP bridge instead of this session's. The forked conversation
   * reseeds here as text on its first turn.
   */
  async get(
    openCodeSessionId: string,
    cwd: string,
    resumeFrom?: string,
    model?: string,
    /**
     * The tools this session's next step offers; the bridge serves them.
     * Omitted for utility requests, which must leave the live list alone.
     */
    tools?: ReadonlyArray<ToolDefinition>,
  ): Promise<LiveSession> {
    const existing = this.sessions.get(openCodeSessionId);
    if (existing) {
      if (tools !== undefined) existing.setTools(tools);
      if (model !== undefined) await existing.setModel(model);
      return existing;
    }

    const own = await this.store?.get(openCodeSessionId);
    // A fork never reattaches to the source's native session; it starts fresh
    // and its first turn carries the full conversation as text.
    const seedFull = own === undefined && resumeFrom !== undefined;

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
        const result = new Promise<HarnessToolResult>((resolve, reject) => {
          current.pending.set(id, { id, name: call.name, input: call.input, resolve, reject });
        });
        current.emitToolCall({ toolCallId: id, toolName: call.name, input: call.input });
        return result;
      },
    };

    const muse = await this.adapter.openSession({
      sessionId: openCodeSessionId,
      cwd,
      ...(model === undefined ? {} : { model }),
      ...(own !== undefined ? { resumeSessionId: own } : {}),
      toolBridge: bridge,
    });
    live = new LiveSession(openCodeSessionId, muse as MuseHarnessSession, toolsRef);
    if (seedFull) live.requestFullSeed();
    this.sessions.set(openCodeSessionId, live);
    if (this.store) {
      await this.store.set(openCodeSessionId, live.muse.nativeSessionId).catch(() => undefined);
    }
    return live;
  }

  peek(openCodeSessionId: string): LiveSession | undefined {
    return this.sessions.get(openCodeSessionId);
  }

  async close(openCodeSessionId: string): Promise<void> {
    const live = this.sessions.get(openCodeSessionId);
    if (!live) return;
    this.sessions.delete(openCodeSessionId);
    await live.close();
  }

  async closeAll(): Promise<void> {
    for (const session of this.sessions.values()) await session.close();
    this.sessions.clear();
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
  ): Promise<{ text: string; usage: Usage }> {
    const session = await this.adapter.openSession({
      sessionId: `oneoff_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      cwd,
      ...(model === undefined ? {} : { model }),
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
