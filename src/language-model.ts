import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FunctionTool,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from "@ai-sdk/provider";
import type { HarnessToolResult } from "./contract/index.js";
import { resolveEffort, type ModelEffort } from "./effort.js";
import { commonPrefixLength, fingerprintTranscript, reconcileTranscript } from "./fingerprint.js";
import type { MuseSessionRegistry, ToolDefinition } from "./session-registry.js";
import { toAIUsage } from "./session-registry.js";
import {
  allImages,
  fullConversationText,
  latestUserTurn,
  toolResultsByCallId,
  type ToolResult,
} from "./prompt.js";

export const PROVIDER_ID = "muse";

export const HEADERS = {
  kind: "x-opencode-muse-kind",
  session: "x-opencode-session-id",
  directory: "x-opencode-muse-directory",
  forkSource: "x-opencode-muse-fork-source",
  variant: "x-opencode-muse-variant",
} as const;

export const AGENT_OPTION = "museAgent";
export const INSTRUCTIONS_OPTION = "museInstructions";

/** Mirrors OpenCode's `SessionRequestKind`: only `primary` drives the live turn. */
export type RequestKind = "primary" | "compaction" | "title" | "generate";

/** Convert an AI SDK tool result into the harness bridge shape. */
export function toToolResult(result: ToolResult): HarnessToolResult {
  const output = result.output as Record<string, unknown> | undefined;
  let text = "";
  if (output && typeof output === "object") {
    if ((output.type === "text" || output.type === "error-text") && typeof output.value === "string") {
      text = output.value;
    } else if (output.type === "execution-denied") {
      // A denied tool never ran; the reason is the whole answer.
      text = typeof output.reason === "string" ? output.reason : "Tool execution was denied by the user.";
    } else if (output.type === "content" && Array.isArray(output.value)) {
      text = output.value
        .map((part) =>
          part && typeof part === "object" && (part as Record<string, unknown>).type === "text"
            ? String((part as Record<string, unknown>).text ?? "")
            : "",
        )
        .join("");
    } else if (output.type === "json" || output.type === "error-json") {
      text = JSON.stringify(output.value);
    } else {
      text = String(output);
    }
  } else {
    text = String(output);
  }
  const isError =
    output?.type === "error-text" || output?.type === "error-json" || output?.type === "execution-denied";
  return { content: [{ type: "text", text }], isError };
}

function functionTools(options: LanguageModelV3CallOptions): LanguageModelV3FunctionTool[] {
  return (options.tools ?? []).filter((tool): tool is LanguageModelV3FunctionTool => tool.type === "function");
}

/**
 * Muse Code as an OpenCode language model.
 *
 * OpenCode owns the agent loop. Each `doStream` call is one step: the prompt
 * carries the conversation, Muse runs its own turn against it, and tool calls
 * are surfaced as AI SDK `tool-call` parts so OpenCode executes them with its
 * own permission system and feeds the results back on the next step.
 */
export class MuseLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3";
  readonly provider = PROVIDER_ID;
  readonly supportedUrls = {};

  constructor(
    readonly modelId: string,
    private readonly settings: Record<string, unknown>,
    private readonly registry: MuseSessionRegistry,
    /**
     * Key OpenCode nests provider options under. It is the model's canonical
     * provider when one is set (`providerOptionKey` in OpenCode), so the
     * agent/instructions options must be read from the same key they were
     * written under.
     */
    private readonly providerOptionKey = PROVIDER_ID,
    /** Per-model catalog effort, keyed by Muse model id. */
    private readonly efforts: ReadonlyMap<string, ModelEffort> = new Map(),
  ) {}

  async doGenerate(_options: LanguageModelV3CallOptions): Promise<never> {
    throw new Error("Muse models only support streaming");
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const headers = options.headers ?? {};
    const kind = (headers[HEADERS.kind] as RequestKind | undefined) ?? "primary";
    const sessionID = headers[HEADERS.session];
    const directory = headers[HEADERS.directory] ?? process.cwd();
    const forkSource = headers[HEADERS.forkSource];
    const effort = resolveEffort(this.efforts.get(this.modelId), headers[HEADERS.variant]);

    const tools = functionTools(options);
    const toolDefs: ToolDefinition[] = tools.map((tool) => ({
      name: tool.name,
      ...(tool.description === undefined ? {} : { description: tool.description }),
      inputSchema: tool.inputSchema as Record<string, unknown>,
    }));
    if (kind !== "primary") {
      // Compaction and generate branch the chat: they keep the chat's tools
      // so the request matches the cached shape. Titles stand alone.
      const branch = kind === "compaction" || kind === "generate";
      return this.runUtility(kind, options, directory, branch ? toolDefs : []);
    }
    if (typeof sessionID !== "string" || sessionID.length === 0) {
      throw new Error("Muse model request is missing the session header");
    }
    if (toolDefs.length === 0) {
      // Muse validates `run.toolset` before the turn starts, and the private
      // host config pins it to the bridge namespace. With no bridge tools that
      // wildcard cannot resolve, so the turn would fail with an opaque
      // `unknown tool` error. Fail here with something actionable instead of
      // inventing a no-op tool to satisfy the wildcard.
      throw new Error(
        "The Muse bridge has no tools; enable at least one tool or run without the bridge.",
      );
    }

    const providerOptions = options.providerOptions?.[this.providerOptionKey] as
      | Record<string, unknown>
      | undefined;
    const agent = typeof providerOptions?.[AGENT_OPTION] === "string" ? providerOptions[AGENT_OPTION] : "";
    const instructions =
      typeof providerOptions?.[INSTRUCTIONS_OPTION] === "string" ? providerOptions[INSTRUCTIONS_OPTION] : "";
    const preamble = [agent, instructions].filter((text) => text.length > 0).join("\n\n");

    // Titles and other utility requests carry no tools; they must not clear
    // the list a primary step is using on the same session.
    const sessionTools = kind === "primary" ? toolDefs : undefined;
    let live = await this.registry.get(
      sessionID,
      directory,
      forkSource,
      this.modelId,
      sessionTools,
      preamble,
    );
    let reseed = false;
    const fingerprints = fingerprintTranscript(options.prompt);
    const previous = live.transcriptFingerprints;
    const verdict = reconcileTranscript(
      previous,
      fingerprints,
      this.registry.compactionFingerprintsFor(sessionID),
      options.prompt,
    );
    if (verdict !== "same" && previous.length > 0) {
      // A divergence with a proven common prefix can branch the native session
      // at the last completed turn inside that prefix. Compaction has no such
      // prefix, so it always reseeds.
      let forked = false;
      if (verdict === "diverged") {
        const point = live.forkPoint(commonPrefixLength(previous, fingerprints));
        if (point !== undefined) {
          try {
            await this.registry.fork(
              sessionID,
              point,
              previous.slice(0, point.fingerprintLength),
            );
            forked = true;
          } catch {
            // Any fork failure falls back to the reseed below.
          }
        }
      }
      if (!forked) {
        // The native session holds context the new prompt no longer has, so
        // stop it and reseed from the full prompt below. Closing with
        // `stop: true` is what makes the old native id unusable; a plain
        // resume would keep the stale transcript.
        await this.registry.close(sessionID);
        live = await this.registry.get(
          sessionID,
          directory,
          forkSource,
          this.modelId,
          sessionTools,
          preamble,
        );
        reseed = true;
      }
    }
    if (live.isFresh) {
      // A resumed session already holds the conversation Muse has seen, so
      // seed the diff just before the new user message.
      const lastIsUser = options.prompt.length > 0 && options.prompt[options.prompt.length - 1]?.role === "user";
      live.promptLength = Math.max(0, options.prompt.length - (lastIsUser ? 1 : 0));
      live.markSeen();
    }
    const fresh = options.prompt.slice(live.promptLength);

    // Resolve tool calls Muse parked on.
    for (const [id, result] of toolResultsByCallId(fresh)) {
      live.resolvePending(id, toToolResult(result));
    }

    // Deliver a new user message: start a turn, or steer the running one.
    const turn = latestUserTurn(fresh);
    if (turn) {
      const running = live.hasActiveTurn ? live.activeTurnId : null;
      if (running !== null) {
        // OpenCode promotes input that arrives mid-turn as a steer. Dropping
        // it would lose the message, so inject it into the running turn.
        try {
          await live.muse.steerTurn({
            turnId: running,
            ...(effort === undefined ? {} : { reasoningEffort: effort }),
            message: {
              content: [
                ...(turn.text.length > 0 ? [{ type: "text" as const, text: turn.text }] : []),
                ...turn.images.map((image) => ({
                  type: "image" as const,
                  mediaType: image.mediaType,
                  data: image.data,
                })),
              ],
            },
          });
        } catch {
          // The turn ended before the steer landed; fall through to a new one.
          live.setActiveTurn(false);
        }
      }
      if (!live.hasActiveTurn) {
        // After a history rewrite the fresh native session has seen nothing,
        // so seed it with the whole condensed conversation, not just the
        // delta. A forked session is in the same position on its first turn.
        const seedFull = reseed || live.takeFullSeed();
        const body = seedFull ? fullConversationText(options.prompt) : turn.text;
        const attachments = seedFull ? allImages(options.prompt) : turn.images;
        const text = live.prependPreamble(preamble) && preamble.length > 0
          ? `${preamble}\n\n${body}`
          : body;
        const turnId = `muse_turn_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const started = await live.muse.startTurn({
          turnId,
          ...(effort === undefined ? {} : { reasoningEffort: effort }),
          message: {
            content: [
              ...(text.length > 0 ? [{ type: "text" as const, text }] : []),
              ...attachments.map((image) => ({
                type: "image" as const,
                mediaType: image.mediaType,
                data: image.data,
              })),
            ],
          },
        });
        if (started.nativeRef.id !== null) {
          live.recordTurnStart(
            started.nativeRef.id,
            Math.max(0, options.prompt.length - 1),
            Math.max(0, fingerprints.length - 1),
          );
        }
        live.setActiveTurn(true, turnId);
      }
    }

    live.promptLength = options.prompt.length;
    await this.registry.rememberTranscript(sessionID, fingerprints);

    // Cancelling the step must stop Muse: a native turn left running would keep
    // producing events, and its finish would leak into the next step.
    const abort = new AbortController();
    const signal = options.abortSignal ? AbortSignal.any([abort.signal, options.abortSignal]) : abort.signal;
    let interrupted = false;
    const interrupt = () => {
      if (interrupted) return;
      interrupted = true;
      abort.abort();
      void live.interrupt();
    };
    if (signal.aborted) interrupt();
    else signal.addEventListener("abort", interrupt, { once: true });

    let controller: ReadableStreamDefaultController<LanguageModelV3StreamPart> | undefined;
    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      start: (value) => {
        controller = value;
        try {
          value.enqueue({ type: "stream-start", warnings: [] });
        } catch {
          // Closed.
        }
        live.attach(value);
      },
      cancel: () => {
        interrupt();
        live.detach();
      },
    });
    void controller;
    return { stream };
  }

  /** Title, compaction summary, and generate run as one-off Muse turns. */
  private async runUtility(
    kind: RequestKind,
    options: LanguageModelV3CallOptions,
    directory: string,
    tools: ToolDefinition[],
  ): Promise<LanguageModelV3StreamResult> {
    const content: Array<{ type: "text"; text: string }> = [];
    for (const message of options.prompt) {
      if (message.role !== "system" && message.role !== "user") continue;
      if (typeof message.content === "string") {
        content.push({ type: "text", text: message.content });
        continue;
      }
      for (const part of message.content) {
        if (part.type === "text") content.push({ type: "text", text: part.text });
      }
    }
    void kind;

    let controller!: ReadableStreamDefaultController<LanguageModelV3StreamPart>;
    let resolveController!: () => void;
    const ready = new Promise<void>((resolve) => {
      resolveController = resolve;
    });

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      start: (value) => {
        controller = value;
        value.enqueue({ type: "stream-start", warnings: [] });
        resolveController();
      },
      cancel: () => {
        options.abortSignal?.throwIfAborted();
      },
    });

    void (async () => {
      await ready;
      controller.enqueue({ type: "text-start", id: "utility-0" });
      try {
        const result = await this.registry.runOnce(directory, content, options.abortSignal, tools, this.modelId);
        controller.enqueue({ type: "text-delta", id: "utility-0", delta: result.text });
        controller.enqueue({ type: "text-end", id: "utility-0" });
        controller.enqueue({
          type: "finish",
          finishReason: { unified: "stop", raw: "stop" },
          usage: toAIUsage(result.usage),
        });
      } catch (error) {
        controller.enqueue({ type: "error", error });
        controller.enqueue({
          type: "finish",
          finishReason: { unified: "error", raw: "error" },
          usage: toAIUsage({}),
        });
      } finally {
        controller.close();
      }
    })();

    return { stream };
  }
}
