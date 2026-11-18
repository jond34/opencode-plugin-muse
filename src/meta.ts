import type { LanguageModelV3Prompt } from "@ai-sdk/provider";

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

interface VisibleEntry {
  readonly role: "user" | "assistant";
  readonly text: string;
}

function visibleEntries(prompt: LanguageModelV3Prompt): VisibleEntry[] {
  const entries: VisibleEntry[] = [];
  for (const message of prompt) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = collapse(textOf(message.content));
    if (text.length > 0) entries.push({ role: message.role, text });
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

  const entries = visibleEntries(prompt);
  if (entries.length === 0) return DIGEST_HEADER;

  const pieces: string[] = [];
  let used = DIGEST_HEADER.length;
  let omitted = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry === undefined) continue;
    const label = entry.role === "user" ? "User: " : "Assistant: ";
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
