import type { LanguageModelV3Prompt, LanguageModelV3ToolResultOutput } from "@ai-sdk/provider";
import { textOfContent } from "./shared.js";
import { toolCallInputText, toolResultStatus, toolResultText } from "./transcript.js";

/**
 * Local titles and compaction digests.
 *
 * Both are opencode requests that would otherwise spend a Muse turn on work the
 * harness can do from the transcript. Keeping them local means opencode's title
 * and compaction budgets are not billed as inference, and neither request can
 * see or change the native Muse session.
 */

const TITLE_LIMIT = 72;
const TITLE_FALLBACK = "Muse session";
// Openers that restate the ask instead of saying it. Applied in order and
// repeated, so "hey, please could you ..." reduces to the request itself.
const TITLE_FRAMING: ReadonlyArray<RegExp> = [
  /^(?:hey|hi|hello)[,!.\s]+/i,
  /^(?:please|pls)\b[,:\s]*/i,
  /^would you mind (?:please )?/i,
  /^(?:can|could|would|will) you (?:please )?/i,
  /^help me (?:to |understand )?/i,
  /^i'd like (?:to |you to )?/i,
  /^i (?:need|want) (?:to |you to )?/i,
  /^how (?:do|can|could|would|should) i /i,
  /^what(?:'s| is) the best way to /i,
  /^is there (?:a|any) way to /i,
];
const DEFAULT_DIGEST_BUDGET = 1024;
const MIN_DIGEST_BUDGET = 64;
const DIGEST_HEADER = "Conversation digest (opencode-owned history):";

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clipCodepoints(text: string, limit: number): string {
  const points = Array.from(text);
  if (points.length <= limit) return text;
  if (limit <= 0) return "";
  return `${points.slice(0, Math.max(0, limit - 1)).join("")}…`;
}

// OpenCode frames the title request before it reaches the hook: the user
// message the hook sees is "Here is the first message of the conversation:
// <message>...</message> Reply with only the title." (session/title.ts), not
// what the user typed. Without this unwrap the derived title is the framing,
// which is what every Muse session in the local database showed. Both framings
// are matched; anything else is left as written, so a future host wording
// degrades to the old behaviour instead of losing the title.
const FIRST_MESSAGE_PROMPT =
  /^Here is the first message of the conversation:\s*<message>\s*([\s\S]*?)\s*<\/message>\s*Reply with only the title\.?\s*$/i;
const CONVERSATION_PROMPT =
  /^Here is the conversation so far:\s*<conversation>\s*([\s\S]*?)\s*<\/conversation>\s*Reply with only the title\.?\s*$/i;

function unwrapTitlePrompt(text: string): string {
  const first = FIRST_MESSAGE_PROMPT.exec(text);
  if (first) return first[1] ?? "";
  const conversation = CONVERSATION_PROMPT.exec(text);
  if (!conversation) return text;
  const body = conversation[1] ?? "";
  if (!body.startsWith("Original request:")) return body;
  const end = body.indexOf("\n\nRecent conversation:");
  return body.slice("Original request:".length, end === -1 ? undefined : end);
}

/**
 * A title from the first user message: whitespace-collapsed, leading framing
 * dropped, first sentence kept, sentence-cased, and 72 codepoints cut at a word
 * boundary, with a stable fallback when the message is empty.
 *
 * The framing list is the measured win from the local-title probe: "can you fix
 * the 500" reads as "Fix the 500" in the sidebar instead of restating the
 * question. A message that opens with a bare identifier or path is left alone.
 * A message that opens with a bare command name ("npm install fails") is
 * capitalized too; a stoplist for that would need maintaining for a cosmetic
 * case, and the session can always be renamed.
 */
export function makeLocalTitle(
  prompt: ReadonlyArray<{ readonly role: string; readonly content: unknown }>,
): string {
  const first = prompt.find((message) => message.role === "user");
  let text = collapse(first === undefined ? "" : unwrapTitlePrompt(textOfContent(first.content)));
  for (let pass = 0; pass < 3; pass += 1) {
    const before = text;
    for (const rule of TITLE_FRAMING) text = text.replace(rule, "");
    if (text === before) break;
  }
  text = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  text = text.replace(/[.!?]+$/, "").trim();
  if (Array.from(text).length < 3) return TITLE_FALLBACK;
  if (/^[a-z]/.test(text)) text = `${text[0]!.toUpperCase()}${text.slice(1)}`;
  return clipTitle(text);
}

/** A title cut at 72 codepoints, preferring a word boundary past the halfway point. */
function clipTitle(text: string): string {
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
      const text = collapse(textOfContent(message.content));
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
      const output = part.output as LanguageModelV3ToolResultOutput | undefined;
      const status = toolResultStatus(output);
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

/**
 * One message of the replacement window the hook hands back.
 *
 * The window is the digest, optionally followed by the single tool exchange
 * that was in flight when compaction fired: the assistant message carrying the
 * calls, then the tool message(s) answering exactly those calls. Nothing else
 * is legal, because opencode replays this when it reads history - an unmatched
 * call or result fails there, not here, and looks like a successful compaction
 * until the next prompt.
 *
 * Parts stay in the dialect the hook received them in. opencode 2.3.2 hands a
 * compaction hook `{type:"tool-call",id,name,input}` and
 * `{type:"tool-result",id,name,result}`; a provider-facing prompt uses
 * `toolCallId`/`toolName`/`output`. Both are accepted and replayed unchanged,
 * because guessing the other dialect is the kind of mismatch that only shows
 * up as a silently dropped window.
 */
export interface NativeWindowMessage {
  readonly role: "user" | "assistant" | "tool";
  readonly content: ReadonlyArray<Record<string, unknown>>;
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
function isTextPart(value: unknown): boolean {
  return isRecord(value) && value.type === "text" && typeof value.text === "string" && value.text.trim().length > 0;
}

/** Call id, in either dialect. */
function partId(part: Record<string, unknown>): string {
  const id = part.toolCallId ?? part.id;
  return typeof id === "string" ? id : "";
}

/** Tool name, in either dialect. */
function partName(part: Record<string, unknown>): string {
  const name = part.toolName ?? part.name;
  return typeof name === "string" ? name : "";
}

/** Result payload, in either dialect. */
function partOutput(part: Record<string, unknown>): Record<string, unknown> | undefined {
  const output = part.output ?? part.result;
  return isRecord(output) ? output : undefined;
}

function isToolCallPart(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.type === "tool-call" &&
    partId(value).length > 0 &&
    partName(value).length > 0 &&
    value.input !== undefined
  );
}

/**
 * A tool result is replayable only when the payload is present and typed.
 *
 * opencode handed this plugin a result whose `output` was never filled in and
 * reading `output.type` threw; a type with no value is the same failure one
 * level down, so it counts as incomplete and the window falls back.
 */
function isToolResultPart(value: unknown): boolean {
  if (!isRecord(value) || value.type !== "tool-result") return false;
  if (partId(value).length === 0 || partName(value).length === 0) return false;
  const output = partOutput(value);
  if (output === undefined || typeof output.type !== "string" || output.type.length === 0) return false;
  if (output.type === "text" || output.type === "error-text") return typeof output.value === "string";
  if (output.type === "json" || output.type === "error-json") return output.value !== undefined;
  if (output.type === "content") return Array.isArray(output.value);
  // `execution-denied` and any future kind carry no payload of their own.
  return true;
}

function isDigestMessage(value: unknown): boolean {
  if (!isRecord(value) || value.role !== "user") return false;
  if (!Array.isArray(value.content) || value.content.length === 0) return false;
  return value.content.every(isTextPart);
}

/**
 * The call ids and result ids of a trailing exchange, or undefined when the
 * exchange is not a complete one-to-one match.
 */
function exchangeIds(messages: ReadonlyArray<unknown>): { calls: string[]; results: string[] } | undefined {
  const first = messages[0];
  if (!isRecord(first) || first.role !== "assistant" || !Array.isArray(first.content)) return undefined;
  if (first.content.length === 0) return undefined;
  const calls: string[] = [];
  for (const part of first.content) {
    if (isToolCallPart(part)) calls.push(partId(part as Record<string, unknown>));
    // Reasoning and file parts are not replayed: keeping them would ask the
    // provider to re-read evidence this window does not carry.
    else if (!isTextPart(part)) return undefined;
  }
  if (calls.length === 0) return undefined;
  const results: string[] = [];
  for (const message of messages.slice(1)) {
    if (!isRecord(message) || message.role !== "tool" || !Array.isArray(message.content)) return undefined;
    for (const part of message.content) {
      if (!isToolResultPart(part)) return undefined;
      results.push(partId(part as Record<string, unknown>));
    }
  }
  if (results.length === 0 || results.length !== calls.length) return undefined;
  if (new Set(calls).size !== calls.length) return undefined;
  const answered = new Set(calls);
  for (const id of results) if (!answered.has(id)) return undefined;
  return { calls, results };
}

export function isNativeCompactionWindow(value: unknown): value is NativeWindowMessage[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  if (!isDigestMessage(value[0])) return false;
  // The digest alone is always legal; anything after it must be one complete
  // exchange, because the provider prompt cannot start with a tool result.
  if (value.length === 1) return true;
  return exchangeIds(value.slice(1)) !== undefined;
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
 * A compact can fire mid-turn, between a tool call and the turn that reads its
 * result - in a tool-using session that is the normal case, not the edge. A
 * user-only window would leave the result orphaned, so the window carries the
 * one exchange that is in flight: the calls and the results answering them.
 * Anything incomplete (a call with no result, a result with no call, a result
 * whose payload is missing) is not replayed: the window is the digest alone,
 * which carries the same facts the summary does. The summary-only path remains
 * as the guard for a malformed build, not as the normal mid-turn answer.
 */
/** Longest tool payload replayed; the digest already clips its own copy. */
const MAX_RESULT_CHARS = 4096;

function clipResult(value: string): string {
  return value.length <= MAX_RESULT_CHARS ? value : `${clipCodepoints(value, MAX_RESULT_CHARS)}\u2026 [clipped]`;
}

/** Rebuild the in-flight tool exchange, or undefined when it is incomplete. */
function trailingExchange(prompt: LanguageModelV3Prompt): NativeWindowMessage[] | undefined {
  const last = prompt[prompt.length - 1];
  if (last?.role !== "tool") return undefined;
  let start = prompt.length - 1;
  while (start > 0 && prompt[start - 1]?.role === "tool") start -= 1;
  const calls = prompt[start - 1];
  if (calls?.role !== "assistant") return undefined;

  const callParts: Array<Record<string, unknown>> = [];
  for (const part of calls.content) {
    if (isToolCallPart(part)) callParts.push({ ...(part as unknown as Record<string, unknown>) });
    else if (isTextPart(part)) callParts.push({ type: "text", text: (part as { text: string }).text });
    else return undefined;
  }

  const toolMessages: NativeWindowMessage[] = [];
  for (const message of prompt.slice(start)) {
    if (message.role !== "tool") return undefined;
    const resultParts: Array<Record<string, unknown>> = [];
    for (const part of message.content) {
      if (!isToolResultPart(part)) return undefined;
      const copy = { ...(part as unknown as Record<string, unknown>) };
      // Clip the payload where it lives in this dialect, without renaming it.
      const key = copy.output !== undefined ? "output" : copy.result !== undefined ? "result" : undefined;
      const payload = key === undefined ? undefined : copy[key];
      if (key !== undefined && isRecord(payload) && typeof payload.value === "string") {
        copy[key] = { ...payload, value: clipResult(payload.value) };
      }
      resultParts.push(copy);
    }
    if (resultParts.length === 0) return undefined;
    toolMessages.push({ role: "tool", content: resultParts });
  }

  const exchange: NativeWindowMessage[] = [{ role: "assistant", content: callParts }, ...toolMessages];
  return exchangeIds(exchange) === undefined ? undefined : exchange;
}

/** The digest text of a window; the first message is always the digest. */
export function nativeWindowDigest(messages: ReadonlyArray<NativeWindowMessage>): string | undefined {
  const first = messages[0];
  if (first?.role !== "user") return undefined;
  const text = first.content[0]?.text;
  return typeof text === "string" ? text : undefined;
}

export function nativeCompactionResult(
  prompt: LanguageModelV3Prompt,
  maxOutputTokens?: number,
): NativeCompactionResult {
  const requested =
    typeof maxOutputTokens === "number" && Number.isFinite(maxOutputTokens) && maxOutputTokens > 0
      ? Math.floor(maxOutputTokens)
      : DEFAULT_DIGEST_BUDGET;
  const digest = makeCompactionDigest(prompt, Math.min(requested, 2048));
  // The summary is the portable fallback, not a placeholder. opencode only
  // replays the native window on the same provider and model; a model switch,
  // a dropped window, or a refused resume must still see the facts.
  // Recall tests must put their needle outside the digest's per-entry clips
  // (512 characters for user/assistant text, 200 for a tool result), or the
  // digest itself answers the question.
  const messages: NativeWindowMessage[] = [
    { role: "user", content: [{ type: "text", text: digest }] },
  ];
  const exchange = trailingExchange(prompt);
  if (exchange !== undefined) messages.push(...exchange);
  if (!isNativeCompactionWindow(messages)) return { summary: digest };
  return {
    summary: digest,
    native: { messages },
    metadata: { muse: "native", digest },
  };
}
