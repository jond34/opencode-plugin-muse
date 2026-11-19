import { createHash } from "node:crypto";
import type { LanguageModelV3Prompt } from "@ai-sdk/provider";

/**
 * Transcript identity for the native Muse session.
 *
 * Muse keeps its own conversation. opencode may rewrite the visible transcript
 * (compaction, rewind, or a restored session), and the native session then holds
 * context the new prompt no longer has. Comparing a hash chain of the visible
 * user/assistant messages detects that without trusting message counts: a
 * rewrite that keeps the same number of messages is still caught.
 *
 * Tool calls, tool results, reasoning, and system text are deliberately absent.
 * They change shape between steps and are not part of the conversation a user
 * would recognize as rewritten.
 */

export type Reconciliation = "same" | "compacted" | "diverged";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

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
 * One fingerprint per visible message, in order.
 *
 * A fingerprint covers the role plus every text and file part of that message.
 * Tool-only assistant messages produce no entry, so a parked step and its
 * follow-up step share the same chain.
 */
export function fingerprintTranscript(prompt: LanguageModelV3Prompt): string[] {
  const fingerprints: string[] = [];
  for (const message of prompt) {
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
    if (text.length === 0) continue;
    fingerprints.push(sha256(`${message.role}:${text}`));
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
  for (const message of prompt) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    for (const part of message.content) {
      if (typeof part === "string") {
        if (sha256(part) === fingerprint) return true;
        continue;
      }
      if (typeof part !== "object" || part === null) continue;
      const record = part as unknown as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "string") {
        if (sha256(record.text) === fingerprint) return true;
      }
    }
  }
  return false;
}

/** Length of the shared visible prefix, in fingerprints. */
export function commonPrefixLength(
  previous: readonly string[],
  current: readonly string[],
): number {
  const limit = Math.min(previous.length, current.length);
  let index = 0;
  while (index < limit && previous[index] === current[index]) index += 1;
  return index;
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
