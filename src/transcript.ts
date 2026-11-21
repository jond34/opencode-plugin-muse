import type { LanguageModelV3Prompt, LanguageModelV3ToolResultOutput } from "@ai-sdk/provider";
import { textOfContent } from "./shared.js";

/**
 * Faithful transcript rendering for a fresh native Muse session.
 *
 * OpenCode owns the conversation. When a native session has to be rebuilt
 * (fork, restart into a new session, or a rewrite), the prompt is replayed as
 * text. An earlier renderer kept only user and assistant text and relied on
 * tool calls "replaying live via the bridge"; that is false after a rebuild,
 * where there is no live turn to replay into, so the model saw claims about
 * tool results it never received. This renderer keeps the calls and results,
 * with their ids, so the rebuilt session has the same facts as a live one.
 */

export interface RenderOptions {
  /** Per tool-call input or tool-result output cap. Defaults to 8_000 chars. */
  readonly maxToolResultChars?: number;
  /** Whole-transcript cap. Blocks past it are dropped with a marker. */
  readonly maxTotalChars?: number;
}

const DEFAULT_MAX_TOOL_RESULT_CHARS = 8_000;
const DEFAULT_MAX_TOTAL_CHARS = 120_000;

const HARNESS_NOTE =
  "[harness note] The tool calls and results below already ran. Their outputs are authoritative; do not repeat a call whose result is present.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function clip(text: string, limit: number): { readonly text: string; readonly omitted: number } {
  if (text.length <= limit) return { text, omitted: 0 };
  return { text: text.slice(0, limit), omitted: text.length - limit };
}

function marker(omitted: number): string {
  return `[truncated: ${omitted} chars omitted]`;
}

export function toolCallInputText(input: unknown): string {
  if (typeof input === "string") return input;
  if (input === undefined) return "";
  try {
    return JSON.stringify(input) ?? "";
  } catch {
    return String(input);
  }
}

/**
 * A tool result's status. `unknown` covers a part whose output is absent:
 * opencode can hand the compaction hook a `tool-result` it never filled in,
 * and calling that `ok` would put a claim in the digest the model never saw.
 * It used to throw instead, which failed the whole compaction.
 */
export function toolResultStatus(output: unknown): "ok" | "error" | "unknown" {
  if (!isRecord(output)) return "unknown";
  return output.type === "error-text" ||
    output.type === "error-json" ||
    output.type === "execution-denied"
    ? "error"
    : "ok";
}

/** The text a tool result carries, mirroring `toToolResult` in the model. */
export function toolResultText(output: unknown): string {
  if (!isRecord(output)) return "";
  switch (output.type) {
    case "text":
    case "error-text":
      return typeof output.value === "string" ? output.value : "";
    case "execution-denied":
      return typeof output.reason === "string" ? output.reason : "Tool execution was denied by the user.";
    case "json":
    case "error-json":
      try {
        return JSON.stringify(output.value) ?? "";
      } catch {
        return String(output.value);
      }
    case "content":
      return Array.isArray(output.value)
        ? output.value
            .map((part) =>
              isRecord(part) && part.type === "text" && typeof part.text === "string" ? part.text : "",
            )
            .join("")
        : "";
    default:
      return "";
  }
}

/**
 * True when the prompt carries conversation before the newest user message.
 *
 * A first-ever request is only a system message plus one user message; seeding
 * that as a "full transcript" would duplicate OpenCode's stock prompt inside
 * the user turn for no benefit. A fork or a rewrite carries assistant or tool
 * messages and must be replayed whole.
 */
export function promptHasHistory(prompt: LanguageModelV3Prompt): boolean {
  let userMessages = 0;
  for (const message of prompt) {
    if (message.role === "assistant" || message.role === "tool") return true;
    if (message.role === "user") userMessages += 1;
  }
  return userMessages > 1;
}

export interface TranscriptRender {
  readonly text: string;
  /** Tool call/result blocks that made it into the body. */
  readonly toolBlocks: number;
  /** True when the whole-transcript cap dropped a tail block. */
  readonly truncated: boolean;
}

/**
 * Render a prompt as the text body of a fresh Muse turn, with its shape.
 *
 * Order is the prompt's order; nothing is regrouped. Tool calls and results are
 * paired by their ids, and a repeated id is rendered once. Long outputs are
 * capped per block and again for the whole transcript, always with an explicit
 * omission marker.
 */
export function renderTranscriptDetailed(
  prompt: LanguageModelV3Prompt,
  options: RenderOptions = {},
): TranscriptRender {
  const maxToolResult = Math.max(0, options.maxToolResultChars ?? DEFAULT_MAX_TOOL_RESULT_CHARS);
  const maxTotal = Math.max(0, options.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS);

  const blocks: string[] = [];
  const seenCalls = new Set<string>();
  const seenResults = new Set<string>();
  let toolBlocks = 0;

  const pushResult = (record: Record<string, unknown>): void => {
    const id = typeof record.toolCallId === "string" ? record.toolCallId : "";
    if (id.length > 0 && seenResults.has(id)) return;
    if (id.length > 0) seenResults.add(id);
    const name = typeof record.toolName === "string" ? record.toolName : "";
    const output = record.output;
    const status = toolResultStatus(output);
    const clipped = clip(toolResultText(output), maxToolResult);
    const body =
      clipped.omitted > 0 ? `${clipped.text}\n${marker(clipped.omitted)}` : clipped.text;
    blocks.push(
      `<tool_result id="${escapeAttribute(id)}" name="${escapeAttribute(name)}" status="${status}">\n${body}\n</tool_result>`,
    );
    toolBlocks += 1;
  };

  for (const message of prompt) {
    if (message.role === "system") {
      if (message.content.length > 0) blocks.push(message.content);
      continue;
    }
    if (message.role === "user") {
      const text = textOfContent(message.content);
      if (text.length > 0) blocks.push(text);
      continue;
    }
    if (message.role === "tool") {
      for (const part of message.content) {
        if (isRecord(part) && part.type === "tool-result") pushResult(part);
      }
      continue;
    }
    if (message.role !== "assistant") continue;
    for (const part of message.content) {
      if (!isRecord(part)) continue;
      if (part.type === "text" && typeof part.text === "string") {
        if (part.text.length > 0) blocks.push(part.text);
        continue;
      }
      if (part.type === "tool-call") {
        const id = typeof part.toolCallId === "string" ? part.toolCallId : "";
        if (id.length > 0 && seenCalls.has(id)) continue;
        if (id.length > 0) seenCalls.add(id);
        const name = typeof part.toolName === "string" ? part.toolName : "";
        const clipped = clip(toolCallInputText(part.input), maxToolResult);
        const body =
          clipped.omitted > 0 ? `${clipped.text}\n${marker(clipped.omitted)}` : clipped.text;
        blocks.push(
          `<tool_call id="${escapeAttribute(id)}" name="${escapeAttribute(name)}">${body}</tool_call>`,
        );
        toolBlocks += 1;
        continue;
      }
      if (part.type === "tool-result") pushResult(part);
    }
  }

  const head = toolBlocks > 0 ? [HARNESS_NOTE] : [];
  const assembled: string[] = [...head];
  let used = head.reduce((sum, block) => sum + block.length, 0);
  // Reserve room for the omission marker so the result stays inside the cap.
  const effectiveMax = Math.max(0, maxTotal - 48);
  let omitted = 0;
  let overflowing = false;
  for (const block of blocks) {
    const separator = assembled.length > 0 ? 2 : 0;
    // Once one block no longer fits, drop the rest as a tail: keeping a later
    // small block after a gap would misrepresent the order of the transcript.
    if (overflowing || used + separator + block.length > effectiveMax) {
      overflowing = true;
      omitted += block.length;
      continue;
    }
    assembled.push(block);
    used += separator + block.length;
  }
  if (omitted > 0) assembled.push(marker(omitted));

  return { text: assembled.join("\n\n"), toolBlocks, truncated: omitted > 0 };
}

/** The rendered text; kept as the simple entry point for importers. */
export function renderTranscript(
  prompt: LanguageModelV3Prompt,
  options: RenderOptions = {},
): string {
  return renderTranscriptDetailed(prompt, options).text;
}
