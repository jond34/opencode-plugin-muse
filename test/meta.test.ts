import { describe, expect, test } from "bun:test";
import type { LanguageModelV3Prompt } from "@ai-sdk/provider";
import { makeCompactionDigest, makeLocalTitle } from "../src/meta.js";

const asPrompt = (messages: unknown[]): LanguageModelV3Prompt =>
  messages as unknown as LanguageModelV3Prompt;

const user = (text: string) => ({ role: "user", content: [{ type: "text", text }] });
const assistant = (text: string) => ({ role: "assistant", content: [{ type: "text", text }] });

describe("makeLocalTitle", () => {
  test("uses the first user message with whitespace collapsed", () => {
    expect(
      makeLocalTitle([
        { role: "system", content: "ignore me" },
        { role: "user", content: "  Fix\n\nthe   parser  " },
      ]),
    ).toBe("Fix the parser");
  });

  test("falls back when there is no user text", () => {
    expect(makeLocalTitle([{ role: "user", content: "" }])).toBe("Muse session");
    expect(makeLocalTitle([])).toBe("Muse session");
  });

  test("caps the title at 72 codepoints without splitting a word", () => {
    const title = makeLocalTitle([
      { role: "user", content: "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron" },
    ]);
    expect(Array.from(title).length).toBeLessThanOrEqual(72);
    expect(title.endsWith("…")).toBe(true);
    expect(title).not.toContain("  ");
  });
});

describe("makeCompactionDigest", () => {
  test("is deterministic and labels every role", () => {
    const prompt = asPrompt([user("first"), assistant("answer"), user("second")]);
    const first = makeCompactionDigest(prompt);
    expect(makeCompactionDigest(prompt)).toBe(first);
    expect(first).toContain("User: first");
    expect(first).toContain("Assistant: answer");
    expect(first).toContain("User: second");
  });

  test("marks omitted history and stays inside the budget", () => {
    const prompt = asPrompt(
      Array.from({ length: 30 }, (_, index) => user(`message number ${index} ${"x".repeat(40)}`)),
    );
    const digest = makeCompactionDigest(prompt, 200);
    expect(Array.from(digest).length).toBeLessThanOrEqual(200);
    expect(digest).toContain("earlier message");
    expect(digest).toContain("User:");
  });

  test("refuses a budget too small to summarize", () => {
    expect(() => makeCompactionDigest(asPrompt([user("hi")]), 16)).toThrow(/too small/);
  });

  test("an empty conversation still has a header", () => {
    expect(makeCompactionDigest(asPrompt([]))).toContain("Conversation digest");
  });
});
