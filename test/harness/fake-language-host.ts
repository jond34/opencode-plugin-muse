import type {
  HarnessContentBlock,
  HarnessEvent,
  HarnessSessionInfo,
  HarnessToolBridge,
  HarnessToolResult,
  HarnessTurn,
  StartTurnInput,
} from "../../src/contract/index.js";
import { MUSE_CAPABILITIES } from "../../src/capabilities.js";
import type { LanguageAdapter, LanguageOpenSessionInput, LanguageSession } from "../../src/language.js";
import type { ContextUsage } from "../../src/session.js";

/**
 * A deterministic language host for the public bridge tests.
 *
 * It records the exact text the provider sends, calls the real tool bridge
 * when a script says so, and emits the same normalized events a Muse host
 * would. No network, no quota, no second copy of the provider loop.
 */

interface Consumer {
  queue: HarnessEvent[];
  notify: (() => void) | null;
  closed: boolean;
}

class Bus {
  private readonly consumers = new Set<Consumer>();
  private closed = false;

  publish(event: HarnessEvent): void {
    if (this.closed) return;
    for (const consumer of this.consumers) consumer.queue.push(event);
    for (const consumer of this.consumers) consumer.notify?.();
  }

  subscribe(): AsyncIterable<HarnessEvent> {
    const consumer: Consumer = { queue: [], notify: null, closed: false };
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

export interface FakeScript {
  /** Tool the model calls before answering. */
  readonly toolName?: string;
  /** How many calls to make before the final answer. */
  readonly toolCalls?: number;
  /** Optional fixed answer; otherwise derived from the turn count. */
  readonly answer?: string;
  /**
   * End the native turn while a bridged call is still parked, the way a host
   * that dies mid-call would. Without it the fake model always answers its
   * calls, so the registry's parked-call guards can never fire.
   */
  readonly failTurnWhileParked?: boolean;
}

function textOf(content: ReadonlyArray<HarnessContentBlock>): string {
  return content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
}

function now(): string {
  return new Date().toISOString();
}

export class FakeSession implements LanguageSession {
  readonly id: string;
  readonly nativeSessionId: string;
  readonly resumeOutcome = "started" as const;
  contextUsage: ContextUsage | null = null;
  private readonly bus = new Bus();
  private infoValue: HarnessSessionInfo;
  private readonly bridge: HarnessToolBridge | undefined;
  private readonly script: FakeScript;
  private readonly startTexts: string[];
  private turnCount = 0;
  private messageCount = 0;
  private calls = 0;
  private closed = false;
  /** Every bridge answer the model received, in call order. */
  readonly toolResults: HarnessToolResult[] = [];
  /** Every rejection that reached the model instead of a tool result. */
  readonly toolErrors: string[] = [];
  /** Calls the model has issued to the bridge, answered or not. */
  get toolCallsAttempted(): number {
    return this.calls;
  }

  constructor(
    id: string,
    input: LanguageOpenSessionInput,
    script: FakeScript,
    startTexts: string[],
  ) {
    this.id = id;
    this.nativeSessionId = `fake-native-${id}`;
    this.bridge = input.toolBridge;
    this.script = script;
    this.startTexts = startTexts;
    this.infoValue = {
      id,
      adapterId: "fake",
      status: "ready",
      cwd: input.cwd,
      model: input.model ?? "muse-spark-1.3",
      capabilities: MUSE_CAPABILITIES,
      lastError: null,
      createdAt: now(),
      updatedAt: now(),
    };
  }

  get info(): HarnessSessionInfo {
    return this.infoValue;
  }

  subscribe(): AsyncIterable<HarnessEvent> {
    return this.bus.subscribe();
  }

  setModel(model: string): Promise<void> {
    this.infoValue = { ...this.infoValue, model };
    return Promise.resolve();
  }

  async startTurn(input: StartTurnInput): Promise<HarnessTurn> {
    const text = textOf(input.message.content);
    this.startTexts.push(text);
    const turn: HarnessTurn = {
      id: input.turnId,
      nativeRef: { id: input.turnId, strength: "strong" },
      ordinal: ++this.turnCount,
      status: "running",
      model: this.infoValue.model,
      startedAt: now(),
      completedAt: null,
    };
    this.bus.publish({ type: "turn.started", turn });
    void this.run(input.turnId, text, turn);
    return turn;
  }

  private async run(turnId: string, text: string, turn: HarnessTurn): Promise<void> {
    const wanted = this.script.toolCalls ?? (this.script.toolName === undefined ? 0 : 1);
    const parts: string[] = [];
    try {
      while (this.calls < wanted && this.bridge !== undefined) {
        this.calls += 1;
        const parked = this.bridge.callTool({
          name: this.script.toolName ?? "lookup",
          input: { query: text.slice(-48) },
        });
        if (this.script.failTurnWhileParked) {
          setTimeout(() => {
            this.bus.publish({
              type: "turn.terminal",
              turn: { ...turn, status: "failed", completedAt: now() },
              failure: { class: "unknown", message: "fake host ended the turn", retryable: false },
            });
          }, 1);
        }
        const call = await parked;
        this.toolResults.push(call);
        parts.push(
          call.content
            .map((block) => (block.type === "text" ? block.text : ""))
            .join(""),
        );
      }
      const answer =
        this.script.answer ??
        (parts.length > 0
          ? `The lookup returned: ${parts.join(" | ")}`
          : `acknowledged (${this.turnCount})`);
      this.emitMessage(turnId, answer);
      this.bus.publish({
        type: "turn.terminal",
        turn: {
          ...turn,
          status: "completed",
          completedAt: now(),
          tokenUsage: {
            inputTokens: Math.max(1, Math.ceil(text.length / 4)),
            outputTokens: Math.max(1, Math.ceil(answer.length / 4)),
            totalTokens: Math.max(2, Math.ceil((text.length + answer.length) / 4)),
            cachedInputTokens: 0,
            cacheWriteTokens: 0,
          },
        },
        failure: null,
      });
    } catch (error) {
      this.toolErrors.push(error instanceof Error ? error.message : String(error));
      this.bus.publish({
        type: "turn.terminal",
        turn: { ...turn, status: "failed", completedAt: now() },
        failure: {
          class: "unknown",
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        },
      });
    }
  }

  private emitMessage(turnId: string, text: string): void {
    const id = `m${++this.messageCount}`;
    const base = {
      id,
      turnId,
      role: "assistant" as const,
      createdAt: now(),
    };
    this.bus.publish({
      type: "message.started",
      message: { ...base, content: [], status: "pending", completedAt: null },
    });
    this.bus.publish({ type: "message.delta", messageId: id, text });
    this.bus.publish({
      type: "message.completed",
      message: {
        ...base,
        content: [{ type: "text", text }],
        status: "completed",
        completedAt: now(),
      },
    });
  }

  interruptTurn(): Promise<void> {
    return Promise.resolve();
  }

  steerTurn(): Promise<void> {
    return Promise.resolve();
  }

  respondToRequest(): Promise<void> {
    return Promise.resolve();
  }

  /** Simulate a Muse-side compaction without spending a native turn. */
  reportCompaction(tokensBefore = 90_000, tokensAfter = 12_000): void {
    this.bus.publish({
      type: "history.compacted",
      itemId: `compaction-${this.turnCount}`,
      tokensBefore,
      tokensAfter,
      trigger: "auto",
      strategy: "summary",
      outcome: "summary",
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.bus.close();
  }
}

export class FakeAdapter implements LanguageAdapter {
  readonly info = { id: "fake", label: "Fake host", version: "0" };
  readonly sessions: FakeSession[] = [];
  /** Every exact body the provider sent to `startTurn`. */
  readonly startTexts: string[] = [];
  readonly opened: LanguageOpenSessionInput[] = [];

  constructor(private readonly script: FakeScript = {}) {}

  getCapabilities() {
    return MUSE_CAPABILITIES;
  }

  async listModels(): Promise<Array<Record<string, unknown>>> {
    return [{ modelId: "muse-spark-1.3", contextLimit: 200_000, outputLimit: 8_192 }];
  }

  async openSession(input: LanguageOpenSessionInput): Promise<LanguageSession> {
    this.opened.push(input);
    const session = new FakeSession(input.sessionId, input, this.script, this.startTexts);
    this.sessions.push(session);
    return session;
  }

  async close(): Promise<void> {
    for (const session of this.sessions) await session.close();
  }
}
