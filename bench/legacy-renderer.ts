import type { LanguageModelV3Prompt } from "@ai-sdk/provider";
import type { TranscriptRender } from "../src/transcript.js";

/**
 * Frozen baseline: the text-only renderer the audit measured.
 *
 * This is bench-only and must never be imported by production. It keeps user,
 * assistant, and system text and deliberately drops every tool call and
 * result, which is exactly the behavior the production renderer replaced.
 */
export function legacyRender(prompt: LanguageModelV3Prompt): TranscriptRender {
  const blocks: string[] = [];
  for (const message of prompt) {
    if (message.role === "system") {
      if (message.content.length > 0) blocks.push(message.content);
      continue;
    }
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = message.content
      .map((part) =>
        part.type === "text" ? part.text : "",
      )
      .join("");
    if (text.length > 0) blocks.push(text);
  }
  return { text: blocks.join("\n\n"), toolBlocks: 0, truncated: false };
}
