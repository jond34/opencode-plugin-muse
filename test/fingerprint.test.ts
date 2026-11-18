import { describe, expect, test } from "bun:test";
import type { LanguageModelV3Prompt } from "@ai-sdk/provider";
import {
  fingerprintCompactionOutput,
  fingerprintTranscript,
  promptContainsCompactionFingerprint,
  reconcileTranscript,
} from "../src/fingerprint.js";

const asPrompt = (messages: unknown[]): LanguageModelV3Prompt =>
  messages as unknown as LanguageModelV3Prompt;

const user = (text: string) => ({ role: "user", content: [{ type: "text", text }] });
const assistant = (text: string) => ({ role: "assistant", content: [{ type: "text", text }] });

describe("fingerprintTranscript", () => {
  test("ignores system, tool calls, and tool results", () => {
    const prompt = asPrompt([
      { role: "system", content: "system prompt" },
      user("hello"),
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "lookup", input: {} }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "t1", output: "ok" }] },
    ]);
    expect(fingerprintTranscript(prompt)).toHaveLength(1);
  });

  test("includes visible file parts", () => {
    const one = asPrompt([
      { role: "user", content: [{ type: "file", mediaType: "image/png", data: "aaa" }] },
    ]);
    const two = asPrompt([
      { role: "user", content: [{ type: "file", mediaType: "image/png", data: "bbb" }] },
    ]);
    expect(fingerprintTranscript(one)).not.toEqual(fingerprintTranscript(two));
  });
});

describe("reconcileTranscript", () => {
  test("a previous chain that prefixes the current one is the same session", () => {
    const previous = asPrompt([user("one"), assistant("two")]);
    const current = asPrompt([user("one"), assistant("two"), user("three")]);
    const previousPrints = fingerprintTranscript(previous);
    const currentPrints = fingerprintTranscript(current);
    expect(reconcileTranscript(previousPrints, currentPrints, [], current)).toBe("same");
  });

  test("an equal-length rewrite is still a divergence", () => {
    const previous = asPrompt([user("one")]);
    const current = asPrompt([user("different")]);
    expect(
      reconcileTranscript(fingerprintTranscript(previous), fingerprintTranscript(current), [], current),
    ).toBe("diverged");
  });

  test("a recorded compaction digest is named, not treated as a rewrite", () => {
    const digest = "Conversation digest (opencode-owned history):\n\nUser: one";
    const current = asPrompt([user(digest), assistant("two")]);
    const fingerprint = fingerprintCompactionOutput(digest);
    expect(promptContainsCompactionFingerprint(current, fingerprint)).toBe(true);
    expect(
      reconcileTranscript(fingerprintTranscript(asPrompt([user("one")])), fingerprintTranscript(current), [fingerprint], current),
    ).toBe("compacted");
  });

  test("an empty history matches any prompt", () => {
    const current = asPrompt([user("one")]);
    expect(reconcileTranscript([], fingerprintTranscript(current), [], current)).toBe("same");
  });
});
