import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FunctionTool,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from "@ai-sdk/provider";
import type { HarnessToolResult } from "./contract/index.js";
import { resolveEffort, type ModelEffort } from "./effort.js";
import { fingerprintTranscript, findCompactionFingerprint, reconcileTranscript } from "./fingerprint.js";
import { nativeHistoryEnabled } from "./flags.js";
import { decideHistory, isToolOnlyRewrite } from "./history.js";
import type { MuseSessionRegistry, ToolDefinition } from "./session-registry.js";
import { toAIUsage } from "./session-registry.js";
import {
  allImages,
  latestUserTurn,
  toolResultsByCallId,
  type ToolResult,
} from "./prompt.js";
import {
  promptHasHistory,
  renderTranscriptDetailed,
  type TranscriptRender,
} from "./transcript.js";
import { appendUsage } from "./usage-ledger.js";

export const PROVIDER_ID = "muse";

export const HEADERS = {
  kind: "x-opencode-muse-kind",
  session: "x-opencode-session-id",
  directory: "x-opencode-muse-directory",
  variant: "x-opencode-muse-variant",
} as const;

export const AGENT_OPTION = "museAgent";
export const INSTRUCTIONS_OPTION = "museInstructions";

/** How a full seed is rendered; the bench injects a legacy arm here. */
export type TranscriptRenderer = (prompt: LanguageModelV3Prompt) => TranscriptRender;

/** Mirrors OpenCode's `SessionRequestKind`: only `primary` drives the live turn. */
export type RequestKind = "primary" | "compaction" | "title" | "generate";

/**
 * Decide whether this step opens a native session that must be seeded whole.
 *
 * `fresh` is true only for the first step of a LiveSession, so later steps are
 * always deltas. `reseed` is a rebuilt session after a rewrite. A resumed
 * session already holds the history, so replaying the prompt there would
 * duplicate it; only a native session with no history needs the transcript.
 * A first-ever request has no history beyond the new user turn, which the
 * delta already carries.
 */
export function needsFullSeed(input: {
  readonly fresh: boolean;
  readonly nativeHasHistory: boolean;
  readonly reseed: boolean;
  readonly prompt: LanguageModelV3CallOptions["prompt"];
}): boolean {
  if (!input.fresh) return false;
  if (input.reseed) return true;
  return !input.nativeHasHistory && promptHasHistory(input.prompt);
}

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
    /** Production renders faithfully; only the bench substitutes this. */
    private readonly render: TranscriptRenderer = renderTranscriptDetailed,
  ) {}

  async doGenerate(_options: LanguageModelV3CallOptions): Promise<never> {
    throw new Error("Muse models only support streaming");
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    // Sections, in order: 1 headers (kind, session, directory, effort); 2 tools
    // to bridge definitions, with non-primary kinds leaving for `runUtility`;
    // 3 provider options to the agent and instruction preamble; 4 session lookup,
    // transcript reconciliation, checkpoint trust; 5 rebuild and reseed decisions
    // (the seed mode itself is `decideHistory` in `history.ts`); 6 parked tool
    // results; 7 deliver, by steering the running turn or starting one; 8 step
    // stats, abort wiring, and the stream that translates Muse events.

    const headers = options.headers ?? {};
    const kind = (headers[HEADERS.kind] as RequestKind | undefined) ?? "primary";
    const sessionID = headers[HEADERS.session];
    const directory = headers[HEADERS.directory] ?? process.cwd();
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
      this.modelId,
      sessionTools,
      preamble,
    );
    let reseed = false;
    const previous = [...live.transcriptFingerprints];
    const fingerprints = fingerprintTranscript(options.prompt);
    const toolOnly = isToolOnlyRewrite(previous, fingerprints);
    const compactionFingerprints = this.registry.compactionFingerprintsFor(sessionID);
    const verdict = reconcileTranscript(
      previous,
      fingerprints,
      compactionFingerprints,
      options.prompt,
    );
    // The checkpoint is the digest the compaction hook supplied. It is only
    // trusted when this request follows that hook, or when a fresh process
    // successfully resumed the native session. A rewind can still contain the
    // digest, so "compacted" alone is not enough.
    const marker =
      kind === "primary" ? this.registry.consumeNativeCompaction(sessionID) : undefined;
    const checkpointIndex =
      nativeHistoryEnabled() && kind === "primary"
        ? findCompactionFingerprint(
            options.prompt,
            marker === undefined ? compactionFingerprints : [marker.fingerprint],
          )
        : -1;
    const justCompacted = marker !== undefined;
    const resumedCheckpoint = live.isFresh && live.resumed;
    // A marker whose digest never appears is not a checkpoint. The prompt was
    // rewritten or the hook's window was dropped; in either case the native
    // session must be rebuilt rather than silently treated as current.
    const nativeMissing = justCompacted && checkpointIndex < 0 && verdict !== "same";
    const trustedCheckpoint =
      checkpointIndex >= 0 &&
      !live.resumeFallback &&
      (justCompacted || resumedCheckpoint);
    // A prefix (`same`) is also a checkpoint: a resumed session whose stored
    // transcript was lost has nothing to reconcile, but its native window is
    // still the digest. Only a real divergence must rebuild.
    const nativeCheckpoint = trustedCheckpoint && verdict !== "diverged";
    if (nativeCheckpoint) {
      live.markNativeCheckpoint();
      live.recordHistory("compaction", "opencode_compaction", {
        direction: "native",
        source: "opencode",
        native: true,
        windowMessages: marker?.windowMessages ?? 1,
      });
    }
    // Stop the old native session, start a clean one, and reseed below.
    // Closing with `stop: true` is what makes the old native id unusable; a
    // plain resume would keep the stale transcript.
    const rebuild = async (): Promise<void> => {
      await this.registry.close(sessionID);
      live = await this.registry.get(
        sessionID,
        directory,
        this.modelId,
        sessionTools,
        preamble,
      );
      live.markNativeEmpty();
    };
    if (verdict !== "same" && previous.length > 0 && !nativeCheckpoint) {
      // OpenCode rewrote the history (compaction, rewind, or a restored
      // session). The native session still holds the old context. A native
      // checkpoint is the exception: the native session *is* the history.
      await rebuild();
      reseed = true;
    }
    // Pressure and a pending Muse compaction are pre-emptions: Muse may have
    // rewritten its native history without opencode knowing. A full seed into
    // the same session would only add tokens, so the session is rebuilt at the
    // next user turn below.
    const pressure = live.pressureReseed;
    let wasFresh = live.isFresh;
    if (wasFresh) {
      // A resumed session already holds the conversation Muse has seen, so
      // seed the diff just before the new user message.
      const lastIsUser = options.prompt.length > 0 && options.prompt[options.prompt.length - 1]?.role === "user";
      live.promptLength = Math.max(0, options.prompt.length - (lastIsUser ? 1 : 0));
      live.markSeen();
    }
    // The digest is the first message of the native window, so it must not be
    // sliced back in as a user turn. This also survives a restart, where the
    // resumed session already holds the digest. An untrusted checkpoint (a
    // rewind, or a legacy digest reseed) is different: the digest is history
    // that the full seed must carry, so the baseline stays at the last user.
    if (nativeCheckpoint && checkpointIndex >= 0) live.promptLength = checkpointIndex + 1;
    let fresh = options.prompt.slice(live.promptLength);

    // A mid-session native rewrite is only safe to heal at a new user turn: a
    // tool-loop continuation may finish on Muse's summary, but the next user
    // message must start from opencode's whole transcript.
    // A native checkpoint already holds the history. Rebuilding it here would
    // close the session Muse is holding the history in, so pressure and a
    // Muse-side compaction are not reasons to reseed.
    const pendingCompaction = live.nativeCheckpoint ? false : live.compactionPending;
    const pendingPressure = live.nativeCheckpoint ? false : pressure;
    const deliveringUser = latestUserTurn(fresh) !== undefined;
    if (
      !live.hasActiveTurn &&
      deliveringUser &&
      !live.nativeCheckpoint &&
      (pendingCompaction || pendingPressure)
    ) {
      await rebuild();
      reseed = true;
      wasFresh = true;
      live.markSeen();
      live.promptLength = 0;
      fresh = options.prompt;
    }

    // Resolve tool calls Muse parked on.
    for (const [id, result] of toolResultsByCallId(fresh)) {
      live.resolvePending(id, toToolResult(result));
    }

    // A cancelled step must stop the turn it is starting, not only one it has
    // already handed to a stream, so the start is told about the cancel. This
    // sits above the start because that call needs the signal.
    const abort = new AbortController();
    const signal = options.abortSignal ? AbortSignal.any([abort.signal, options.abortSignal]) : abort.signal;

    // Deliver a new user message: start a turn, or steer the running one.
    let seedFull = false;
    let seedReason = "first";
    let rendered: TranscriptRender = { text: "", toolBlocks: 0, truncated: false };
    // Send-to-ack for a fresh turn, left unset by a steer. This is the wait the
    // ack deadline competes with, so it includes a replayed admission.
    let admitMs: number | undefined;
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
        // After a rewrite, a Muse compaction, or on a forked session the native
        // session cannot be trusted to match the prompt, so seed it with the
        // whole conversation, tool calls and results included.
        const decision = decideHistory({
          fresh: wasFresh,
          nativeHasHistory: live.nativeHasHistory,
          reseed,
          resumed: live.resumed,
          resumeFallback: live.resumeFallback,
          nativeMissing,
          reconciliation: verdict,
          toolOnly,
          compactionPending: pendingCompaction,
          pressure: pendingPressure,
          promptHasHistory: promptHasHistory(options.prompt),
        });
        seedFull = decision.mode === "full";
        seedReason = decision.reason;
        if (seedFull) {
          // The compaction is explained by this seed; do not reseed the next
          // user turn for the same event.
          if (decision.reason === "muse_compaction" || decision.reason === "pressure") {
            live.consumeCompaction();
          }
          live.recordHistory(decision.reason === "pressure" ? "pressure" : "reseed", decision.reason, {
            direction: "full",
          });
        }
        rendered = seedFull
          ? this.render(options.prompt)
          : { text: "", toolBlocks: 0, truncated: false };
        const body = seedFull ? rendered.text : turn.text;
        const attachments = seedFull ? allImages(options.prompt) : turn.images;
        const text = live.prependPreamble(preamble) && preamble.length > 0
          ? `${preamble}\n\n${body}`
          : body;
        const turnId = `muse_turn_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const startAt = Date.now();
        try {
          await live.muse.startTurn({
            turnId,
            signal,
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
          admitMs = Date.now() - startAt;
          live.setActiveTurn(true, turnId);
          // A cancel that landed between the ack and this line found no active
          // turn to interrupt; the turn is active now, so stop it here.
          if (signal.aborted) void live.interrupt();
        } catch (error) {
          // Cancelled before the ack: the adapter retired the turn it had
          // admitted, so this step has nothing left to fail.
          if (!signal.aborted) throw error;
        }
      }
    }

    live.promptLength = options.prompt.length;
    await this.registry.rememberTranscript(sessionID, fingerprints);
    const stepStats = {
      renderedChars: (seedFull ? rendered.text : turn?.text ?? "").length,
      promptMessages: options.prompt.length,
      toolBlocks: rendered.toolBlocks,
      truncated: rendered.truncated,
      hostFingerprint: this.registry.hostFingerprint,
      ...(admitMs === undefined ? {} : { admitMs }),
    };

    // Cancelling the step must stop Muse: a native turn left running would keep
    // producing events, and its finish would leak into the next step.
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
        live.beginStep(seedFull ? "full" : "delta", seedReason, stepStats);
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
    const started = Date.now();
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
        void appendUsage({
          ts: new Date().toISOString(),
          sessionID: (options.headers?.[HEADERS.session] as string | undefined) ?? "utility",
          step: 0,
          kind,
          model: this.modelId,
          input: result.usage.inputTokens ?? 0,
          cached: result.usage.cachedInputTokens ?? 0,
          cacheWrite: result.usage.cacheWriteTokens ?? 0,
          output: result.usage.outputTokens ?? 0,
          toolCalls: 0,
          wallMs: Math.max(0, Date.now() - started),
          seed: "delta",
        });
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
