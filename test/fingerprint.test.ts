import { describe, expect, test } from "bun:test";
import type { LanguageModelV3Prompt } from "@ai-sdk/provider";
import {
  fingerprintCompactionOutput,
  fingerprintTranscript,
  findCompactionFingerprint,
  promptContainsCompactionFingerprint,
  reconcileTranscript,
} from "../src/fingerprint.js";

const asPrompt = (messages: unknown[]): LanguageModelV3Prompt =>
  messages as unknown as LanguageModelV3Prompt;

const user = (text: string) => ({ role: "user", content: [{ type: "text", text }] });
const assistant = (text: string) => ({ role: "assistant", content: [{ type: "text", text }] });

describe("fingerprintTranscript", () => {
  test("ignores system text but covers tool calls and results", () => {
    const prompt = asPrompt([
      { role: "system", content: "system prompt" },
      user("hello"),
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "lookup", input: {} }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "t1", toolName: "lookup", output: { type: "text", value: "ok" } }] },
    ]);
    expect(fingerprintTranscript(prompt)).toHaveLength(3);
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

describe("findCompactionFingerprint", () => {
  const digest = "Conversation digest (opencode-owned history):\n\nUser: one";
  const fingerprint = fingerprintCompactionOutput(digest);

  test("returns the index of the digest message", () => {
    const prompt = asPrompt([
      { role: "system", content: "sys" },
      user("old"),
      user(digest),
      user("new"),
    ]);
    expect(findCompactionFingerprint(prompt, [fingerprint])).toBe(2);
  });

  test("returns -1 when the digest is absent or no fingerprints are known", () => {
    expect(findCompactionFingerprint(asPrompt([user("new")]), [fingerprint])).toBe(-1);
    expect(findCompactionFingerprint(asPrompt([user(digest)]), [])).toBe(-1);
  });

  test("matches a whole string body rather than its characters", () => {
    const prompt = asPrompt([{ role: "user", content: digest }]);
    expect(findCompactionFingerprint(prompt, [fingerprint])).toBe(0);
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

  test("a changed tool output is a divergence even when the text is identical", () => {
    const before = asPrompt([
      user("look it up"),
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "lookup", input: { q: 1 } }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "t1", toolName: "lookup", output: { type: "text", value: "one" } }] },
    ]);
    const after = asPrompt([
      user("look it up"),
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "lookup", input: { q: 1 } }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "t1", toolName: "lookup", output: { type: "text", value: "two" } }] },
    ]);
    expect(
      reconcileTranscript(fingerprintTranscript(before), fingerprintTranscript(after), [], after),
    ).toBe("diverged");
  });

  test("a different call id is a divergence", () => {
    const before = asPrompt([
      user("look it up"),
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "lookup", input: {} }] },
    ]);
    const after = asPrompt([
      user("look it up"),
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "t2", toolName: "lookup", input: {} }] },
    ]);
    expect(
      reconcileTranscript(fingerprintTranscript(before), fingerprintTranscript(after), [], after),
    ).toBe("diverged");
  });

  test("an unchanged tool transcript is the same session", () => {
    const prompt = asPrompt([
      user("look it up"),
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "lookup", input: {} }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "t1", toolName: "lookup", output: { type: "text", value: "one" } }] },
      user("next"),
    ]);
    const prints = fingerprintTranscript(prompt);
    expect(reconcileTranscript(prints, prints, [], prompt)).toBe("same");
  });
});
