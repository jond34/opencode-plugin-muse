import { describe, expect, test } from "bun:test";
import type { LanguageModelV3Prompt } from "@ai-sdk/provider";
import {
  isNativeCompactionWindow,
  makeCompactionDigest,
  makeLocalTitle,
  nativeCompactionResult,
} from "../src/meta.js";

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

  test("keeps tool calls and results, with id and status", () => {
    const prompt = asPrompt([
      user("check the record"),
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "t9", toolName: "lookup", input: { q: 1 } }],
      },
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "t9", toolName: "lookup", output: { type: "text", value: "record 42" } },
        ],
      },
    ]);
    const digest = makeCompactionDigest(prompt, 1024);
    expect(digest).toContain("t9");
    expect(digest).toContain("lookup");
    expect(digest).toContain("ok");
    expect(digest).toContain("record 42");
  });

  test("marks an error result as an error", () => {
    const digest = makeCompactionDigest(
      asPrompt([
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "bash", input: {} }] },
        { role: "tool", content: [{ type: "tool-result", toolCallId: "t1", toolName: "bash", output: { type: "error-text", value: "boom" } }] },
      ]),
    );
    expect(digest).toContain("error");
    expect(digest).toContain("boom");
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

describe("nativeCompactionResult", () => {
  test("returns the digest as one native user message and a portable summary", () => {
    const result = nativeCompactionResult(asPrompt([user("first"), assistant("answer")]));
    expect(result.native?.messages).toHaveLength(1);
    expect(result.native?.messages[0]?.role).toBe("user");
    expect(result.native?.messages[0]?.content[0]?.text).toContain("Conversation digest");
    expect(result.native?.messages[0]?.content[0]?.text).toContain("User: first");
    expect(result.metadata).toMatchObject({ muse: "native" });
    // A model switch or a dropped window falls back to the summary. It must
    // carry the same facts as the native window.
    expect(result.summary).toBe(result.native?.messages[0]?.content[0]?.text);
  });

  test("rejects a window opencode could not replay", () => {
    expect(isNativeCompactionWindow([{ role: "user", content: [{ type: "text", text: "ok" }] }])).toBe(true);
    expect(isNativeCompactionWindow([])).toBe(false);
    expect(isNativeCompactionWindow([{ role: "user", content: [] }])).toBe(false);
    expect(isNativeCompactionWindow([{ role: "user", content: [{ type: "text", text: "  " }] }])).toBe(false);
    expect(isNativeCompactionWindow([{ role: "assistant", content: [{ type: "text", text: "ok" }] }])).toBe(false);
  });

  test("falls back to summary-only when the compact lands on a tool result", () => {
    const result = nativeCompactionResult(
      asPrompt([
        user("check"),
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "lookup", input: {} }] },
        {
          role: "tool",
          content: [{ type: "tool-result", toolCallId: "t1", toolName: "lookup", output: { type: "text", value: "ok" } }],
        },
      ]),
    );
    expect(result.native).toBeUndefined();
    expect(result.summary).toContain("Conversation digest");
    expect(result.summary).toBe(
      makeCompactionDigest(
        asPrompt([
          user("check"),
          { role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "lookup", input: {} }] },
          {
            role: "tool",
            content: [{ type: "tool-result", toolCallId: "t1", toolName: "lookup", output: { type: "text", value: "ok" } }],
          },
        ]),
      ),
    );
  });

  test("falls back when an assistant message still carries a tool call", () => {
    const result = nativeCompactionResult(
      asPrompt([
        user("check"),
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "lookup", input: {} }] },
      ]),
    );
    expect(result.native).toBeUndefined();
    expect(result.summary).toContain("Conversation digest");
  });

  test("caps the digest at 2048 characters even with a large output budget", () => {
    const prompt = asPrompt(
      Array.from({ length: 40 }, (_, index) => user(`message ${index} ${"x".repeat(200)}`)),
    );
    const result = nativeCompactionResult(prompt, 100_000);
    expect(Array.from(result.native?.messages[0]?.content[0]?.text ?? "").length).toBeLessThanOrEqual(2048);
  });
});
