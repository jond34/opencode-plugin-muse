import type { LanguageModelV3Prompt, LanguageModelV3ToolResultOutput } from "@ai-sdk/provider";
import { toolCallInputText, toolResultIsError, toolResultText } from "./transcript.js";

/**
 * Local titles and compaction digests.
 *
 * Both are opencode requests that would otherwise spend a Muse turn on work the
 * harness can do from the transcript. Keeping them local means opencode's title
 * and compaction budgets are not billed as inference, and neither request can
 * see or change the native Muse session.
 */

const TITLE_LIMIT = 72;
const DEFAULT_DIGEST_BUDGET = 1024;
const MIN_DIGEST_BUDGET = 64;
const DIGEST_HEADER = "Conversation digest (opencode-owned history):";

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push(part);
      continue;
    }
    if (typeof part !== "object" || part === null) continue;
    if ((part as { type?: unknown }).type === "text") {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("");
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clipCodepoints(text: string, limit: number): string {
  const points = Array.from(text);
  if (points.length <= limit) return text;
  if (limit <= 0) return "";
  return `${points.slice(0, Math.max(0, limit - 1)).join("")}…`;
}

/**
 * A title from the first user message: whitespace-collapsed, 72 codepoints,
 * cut at a word boundary, with a stable fallback when the message is empty.
 */
export function makeLocalTitle(
  prompt: ReadonlyArray<{ readonly role: string; readonly content: unknown }>,
): string {
  const first = prompt.find((message) => message.role === "user");
  const text = collapse(first === undefined ? "" : textOf(first.content));
  if (text.length === 0) return "Muse session";
  const points = Array.from(text);
  if (points.length <= TITLE_LIMIT) return text;
  const head = points.slice(0, TITLE_LIMIT - 1).join("");
  const boundary = head.lastIndexOf(" ");
  const cut = boundary > TITLE_LIMIT / 2 ? head.slice(0, boundary) : head;
  return `${cut.trimEnd()}…`;
}

interface DigestEntry {
  readonly label: string;
  readonly text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The summary's entries, in order: the visible text plus the tool facts.
 *
 * A digest that kept only user/assistant text lost every tool call and result,
 * so the reseed after compaction started from a summary that could not say
 * what the tools had returned. Tool entries stay short: id, name, status, and
 * a bounded excerpt, which is enough to keep the facts and cheap to hash.
 */
function digestEntries(prompt: LanguageModelV3Prompt): DigestEntry[] {
  const entries: DigestEntry[] = [];
  const seenCalls = new Set<string>();
  const seenResults = new Set<string>();

  for (const message of prompt) {
    if (message.role === "system") continue;
    if (message.role === "user" || message.role === "assistant") {
      const text = collapse(textOf(message.content));
      if (text.length > 0) entries.push({ label: message.role === "user" ? "User: " : "Assistant: ", text });
    }
    if (message.role !== "assistant" && message.role !== "tool") continue;
    for (const part of message.content) {
      if (!isRecord(part)) continue;
      if (part.type === "tool-call") {
        const id = typeof part.toolCallId === "string" ? part.toolCallId : "";
        if (id.length > 0 && seenCalls.has(id)) continue;
        if (id.length > 0) seenCalls.add(id);
        const name = typeof part.toolName === "string" ? part.toolName : "";
        const input = collapse(toolCallInputText(part.input));
        entries.push({
          label: "Tool call: ",
          text: `${name} (${id}) ${clipCodepoints(input, 120)}`,
        });
        continue;
      }
      if (part.type !== "tool-result") continue;
      const id = typeof part.toolCallId === "string" ? part.toolCallId : "";
      if (id.length > 0 && seenResults.has(id)) continue;
      if (id.length > 0) seenResults.add(id);
      const name = typeof part.toolName === "string" ? part.toolName : "";
      const output = part.output as LanguageModelV3ToolResultOutput;
      const status = toolResultIsError(output) ? "error" : "ok";
      const text = collapse(toolResultText(output));
      entries.push({
        label: "Tool result: ",
        text: `${name} (${id}) ${status}: ${clipCodepoints(text, 200)}`,
      });
    }
  }
  return entries;
}

/**
 * A deterministic transcript digest, bounded by the request's output budget.
 *
 * It keeps whole exchange pairs from the newest end, labels every line by role,
 * and states how many earlier messages were dropped. There is no model call, no
 * clock, and no generated prose: the same prompt always produces the same
 * digest, which is what lets the compaction fingerprint be checked later.
 */
export function makeCompactionDigest(
  prompt: LanguageModelV3Prompt,
  maxOutputTokens?: number,
): string {
  const budget =
    typeof maxOutputTokens === "number" && Number.isFinite(maxOutputTokens) && maxOutputTokens > 0
      ? Math.floor(maxOutputTokens)
      : DEFAULT_DIGEST_BUDGET;
  if (budget < MIN_DIGEST_BUDGET) {
    throw new Error(
      `Compaction budget ${budget} is too small; need at least ${MIN_DIGEST_BUDGET} tokens`,
    );
  }

  const entries = digestEntries(prompt);
  if (entries.length === 0) return DIGEST_HEADER;

  const pieces: string[] = [];
  let used = DIGEST_HEADER.length;
  let omitted = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry === undefined) continue;
    const label = entry.label;
    // Leave room for the separator, and for the omission line if anything is
    // already missing. Each entry is clipped so a pasted file cannot eat the
    // whole budget.
    const reserve = 48;
    const room = budget - used - reserve - label.length - 2;
    if (room < 16) {
      omitted = index + 1;
      break;
    }
    const text = clipCodepoints(entry.text, Math.min(512, room));
    pieces.push(`${label}${text}`);
    used += label.length + text.length + 2;
  }

  pieces.reverse();
  const marker = omitted > 0 ? `[... ${omitted} earlier message${omitted === 1 ? "" : "s"} omitted ...]` : "";
  const digest = [DIGEST_HEADER, marker, ...pieces].filter((part) => part.length > 0).join("\n\n");
  return clipCodepoints(digest, budget);
}

/** A compaction result the opencode hook can return directly. */
export interface NativeWindowMessage {
  readonly role: "user";
  readonly content: ReadonlyArray<{ readonly type: "text"; readonly text: string }>;
}

export interface NativeCompactionResult {
  summary: string;
  native?: { messages: NativeWindowMessage[] };
  metadata?: Record<string, unknown>;
}

/**
 * True when a value is a replacement window this plugin can safely hand to
 * opencode.
 *
 * opencode validates a window when it reads history, not when the hook
 * installs it, and silently falls back to the summary when decoding fails.
 * Checking the shape here makes that failure visible before the turn instead
 * of looking like a successful compaction until the next prompt.
 */
export function isNativeCompactionWindow(value: unknown): value is NativeWindowMessage[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  for (const message of value) {
    if (typeof message !== "object" || message === null) return false;
    const record = message as Record<string, unknown>;
    if (record.role !== "user") return false;
    if (!Array.isArray(record.content) || record.content.length === 0) return false;
    for (const part of record.content) {
      if (typeof part !== "object" || part === null) return false;
      const block = part as Record<string, unknown>;
      if (block.type !== "text" || typeof block.text !== "string" || block.text.trim().length === 0) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Build a native-history compaction result.
 *
 * The window is the digest the plugin already produces, not a slice of the
 * transcript. A digest is stable enough to recognize in a later prompt, small
 * enough to replay after a restart, and deterministic, so no Muse turn is spent
 * on a summary. opencode replays `native.messages` when the hook result is used;
 * it does not need `settings.compaction = native`, which this AI SDK provider
 * rejects in opencode 2.3.2.
 *
 * A trailing tool message (or an assistant message still carrying a tool call)
 * means the compact happened mid-turn. A user-only window would leave an
 * orphan tool result, so that case falls back to the summary-only path.
 */
export function nativeCompactionResult(
  prompt: LanguageModelV3Prompt,
  maxOutputTokens?: number,
): NativeCompactionResult {
  const requested =
    typeof maxOutputTokens === "number" && Number.isFinite(maxOutputTokens) && maxOutputTokens > 0
      ? Math.floor(maxOutputTokens)
      : DEFAULT_DIGEST_BUDGET;
  const digest = makeCompactionDigest(prompt, Math.min(requested, 2048));
  const last = prompt[prompt.length - 1];
  let midTurn = last?.role === "tool";
  if (!midTurn && last?.role === "assistant") {
    for (const part of last.content) {
      if (typeof part === "object" && part !== null && (part as { type?: unknown }).type === "tool-call") {
        midTurn = true;
        break;
      }
    }
  }
  // The summary is the portable fallback, not a placeholder. opencode only
  // replays the native window on the same provider and model; a model switch,
  // a dropped window, or a refused resume must still see the facts.
  // Recall tests must put their needle outside the digest's per-entry clips
  // (512 characters for user/assistant text, 200 for a tool result), or the
  // digest itself answers the question.
  if (midTurn) return { summary: digest };
  const messages: NativeWindowMessage[] = [
    { role: "user", content: [{ type: "text", text: digest }] },
  ];
  if (!isNativeCompactionWindow(messages)) return { summary: digest };
  return {
    summary: digest,
    native: { messages },
    metadata: { muse: "native", digest },
  };
}
