import { createHash } from "node:crypto";
import type { LanguageModelV3Prompt, LanguageModelV3ToolResultOutput } from "@ai-sdk/provider";
import { toolCallInputText, toolResultStatus, toolResultText } from "./transcript.js";

/**
 * Transcript identity for the native Muse session.
 *
 * Muse keeps its own conversation. opencode may rewrite the visible transcript
 * (compaction, rewind, or a restored session), and the native session then holds
 * context the new prompt no longer has. Comparing a hash chain of the visible
 * messages detects that without trusting message counts: a rewrite that keeps
 * the same number of messages is still caught.
 *
 * Tool calls and results are part of the chain. A rewrite can change nothing
 * but a tool output (opencode pruning or replacing one), and a text-only chain
 * would call that "same", leaving the native session with a result the prompt
 * no longer contains. System text stays out: opencode rebuilds it every step.
 */

export type Reconciliation = "same" | "compacted" | "diverged";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSignature(part: Record<string, unknown>): string | undefined {
  if (part.type !== "file") return undefined;
  const mediaType = typeof part.mediaType === "string" ? part.mediaType : "application/octet-stream";
  const data = part.data;
  if (typeof data === "string") return `file:${mediaType}:${sha256(data)}`;
  if (data instanceof Uint8Array) {
    return `file:${mediaType}:${sha256(Buffer.from(data).toString("base64"))}`;
  }
  return `file:${mediaType}:`;
}

/**
 * One fingerprint per visible message part, in order.
 *
 * A text-only message contributes one role+content entry, as before. Every tool
 * call and result contributes its own entry at that message's position, keyed
 * by call id and content hash. Repeated ids count once, matching the renderer.
 */
export function fingerprintTranscript(prompt: LanguageModelV3Prompt): string[] {
  const fingerprints: string[] = [];
  const seenCalls = new Set<string>();
  const seenResults = new Set<string>();

  const pushResult = (part: Record<string, unknown>): void => {
    const id = typeof part.toolCallId === "string" ? part.toolCallId : "";
    if (id.length > 0 && seenResults.has(id)) return;
    if (id.length > 0) seenResults.add(id);
    const name = typeof part.toolName === "string" ? part.toolName : "";
    const output = part.output as LanguageModelV3ToolResultOutput | undefined;
    const status = toolResultStatus(output);
    fingerprints.push(`tool-result:${id}:${name}:${status}:${sha256(toolResultText(output))}`);
  };

  for (const message of prompt) {
    if (message.role === "tool") {
      for (const part of message.content) {
        if (typeof part !== "object" || part === null) continue;
        const record = part as unknown as Record<string, unknown>;
        if (record.type === "tool-result") pushResult(record);
      }
      continue;
    }
    if (message.role !== "user" && message.role !== "assistant") continue;

    const chunks: string[] = [];
    for (const part of message.content) {
      if (typeof part === "string") {
        chunks.push(part);
        continue;
      }
      if (typeof part !== "object" || part === null) continue;
      const record = part as unknown as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "string") {
        chunks.push(record.text);
        continue;
      }
      const file = fileSignature(record);
      if (file !== undefined) chunks.push(file);
    }
    const text = chunks.join("").trim();
    if (text.length > 0) fingerprints.push(sha256(`${message.role}:${text}`));

    for (const part of message.content) {
      if (typeof part !== "object" || part === null) continue;
      const record = part as unknown as Record<string, unknown>;
      if (record.type === "tool-call") {
        const id = typeof record.toolCallId === "string" ? record.toolCallId : "";
        if (id.length > 0 && seenCalls.has(id)) continue;
        if (id.length > 0) seenCalls.add(id);
        const name = typeof record.toolName === "string" ? record.toolName : "";
        fingerprints.push(`tool-call:${id}:${name}:${sha256(toolCallInputText(record.input))}`);
        continue;
      }
      if (record.type === "tool-result") pushResult(record);
    }
  }
  return fingerprints;
}

/** Fingerprint of a compaction summary, checked against future prompts. */
export function fingerprintCompactionOutput(summary: string): string {
  return sha256(summary);
}

/**
 * True when the prompt carries a compaction summary this plugin produced.
 *
 * The summary can arrive as a user or assistant message, so every text part is
 * checked rather than only the fingerprint chain.
 */
export function promptContainsCompactionFingerprint(
  prompt: LanguageModelV3Prompt,
  fingerprint: string,
): boolean {
  return findCompactionFingerprint(prompt, [fingerprint]) >= 0;
}

/**
 * Index of the first prompt message carrying one of these compaction digests.
 *
 * The index is the checkpoint boundary: the native window starts there, and
 * everything after it is a delta. `-1` means no digest this plugin produced is
 * present, so the caller must not treat the prompt as a native checkpoint.
 */
export function findCompactionFingerprint(
  prompt: LanguageModelV3Prompt,
  fingerprints: readonly string[],
): number {
  if (fingerprints.length === 0) return -1;
  const matches = (text: string): boolean =>
    fingerprints.some((fingerprint) => sha256(text) === fingerprint);
  for (let index = 0; index < prompt.length; index += 1) {
    const message = prompt[index];
    if (!message || (message.role !== "user" && message.role !== "assistant")) continue;
    const content: unknown = message.content;
    // OpenCode usually sends parts, but a string body is legal on the wire and
    // iterating it would check one character at a time.
    if (typeof content === "string") {
      if (matches(content)) return index;
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part === "string") {
        if (matches(part)) return index;
        continue;
      }
      if (typeof part !== "object" || part === null) continue;
      const record = part as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "string" && matches(record.text)) {
        return index;
      }
    }
  }
  return -1;
}

/**
 * Classify the current transcript against the native session's history.
 *
 * `"same"` means the native session has seen a prefix of this prompt; the new
 * tail can be sent as a delta. `"compacted"` means a known summary replaced the
 * history. Anything else is `"diverged"`. Both non-`"same"` outcomes need a
 * fresh native session and a full reseed.
 */
export function reconcileTranscript(
  previous: readonly string[],
  current: readonly string[],
  compactionFingerprints: readonly string[],
  prompt: LanguageModelV3Prompt,
): Reconciliation {
  if (current.length >= previous.length) {
    let prefix = true;
    for (let index = 0; index < previous.length; index += 1) {
      if (previous[index] !== current[index]) {
        prefix = false;
        break;
      }
    }
    if (prefix) return "same";
  }
  for (const fingerprint of compactionFingerprints) {
    if (promptContainsCompactionFingerprint(prompt, fingerprint)) return "compacted";
  }
  return "diverged";
}
