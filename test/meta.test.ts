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

  // A compact between a tool call and the next turn is the normal case in a
  // tool-using session, so the window keeps that exchange instead of dropping
  // to the digest and losing the result the turn was about to read.
  test("keeps the in-flight exchange when the compact lands on a tool result", () => {
    const result = nativeCompactionResult(
      asPrompt([
        user("check"),
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "lookup", input: { q: 1 } }] },
        {
          role: "tool",
          content: [{ type: "tool-result", toolCallId: "t1", toolName: "lookup", output: { type: "text", value: "record 42" } }],
        },
      ]),
    );
    const messages = result.native?.messages ?? [];
    expect(messages).toHaveLength(3);
    expect(messages[0]?.role).toBe("user");
    expect(messages[1]).toEqual({
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "t1", toolName: "lookup", input: { q: 1 } }],
    });
    expect(messages[2]).toEqual({
      role: "tool",
      content: [
        { type: "tool-result", toolCallId: "t1", toolName: "lookup", output: { type: "text", value: "record 42" } },
      ],
    });
    expect(isNativeCompactionWindow(messages)).toBe(true);
    // The summary is still the digest alone: a dropped window loses only the
    // exchange the model had already been shown, never the digested facts.
    expect(result.summary).toBe(messages[0]?.content[0]?.text);
    expect(result.summary).toContain("record 42");
  });

  test("accepts an assistant text part alongside the calls", () => {
    const result = nativeCompactionResult(
      asPrompt([
        user("check"),
        {
          role: "assistant",
          content: [
            { type: "text", text: "Looking that up." },
            { type: "tool-call", toolCallId: "t1", toolName: "lookup", input: {} },
          ],
        },
        {
          role: "tool",
          content: [{ type: "tool-result", toolCallId: "t1", toolName: "lookup", output: { type: "text", value: "ok" } }],
        },
      ]),
    );
    expect(result.native?.messages).toHaveLength(3);
    expect(result.native?.messages[1]?.content).toHaveLength(2);
  });

  test("carries every call of a parallel exchange, in one or more tool messages", () => {
    const result = nativeCompactionResult(
      asPrompt([
        user("check both"),
        {
          role: "assistant",
          content: [
            { type: "tool-call", toolCallId: "t1", toolName: "lookup", input: {} },
            { type: "tool-call", toolCallId: "t2", toolName: "lookup", input: {} },
          ],
        },
        {
          role: "tool",
          content: [{ type: "tool-result", toolCallId: "t1", toolName: "lookup", output: { type: "text", value: "a" } }],
        },
        {
          role: "tool",
          content: [{ type: "tool-result", toolCallId: "t2", toolName: "lookup", output: { type: "text", value: "b" } }],
        },
      ]),
    );
    expect(result.native?.messages).toHaveLength(4);
    expect(isNativeCompactionWindow(result.native?.messages)).toBe(true);
  });

  // An incomplete exchange is not replayed, but the digest still installs as
  // the window: that is the same facts the summary would carry, with fewer
  // moving parts.
  const digestOnly = (result: { native?: { messages: unknown[] } }) => {
    expect(result.native?.messages).toHaveLength(1);
  };

  test("keeps the digest alone when one call of a parallel exchange has no result", () => {
    const result = nativeCompactionResult(
      asPrompt([
        user("check both"),
        {
          role: "assistant",
          content: [
            { type: "tool-call", toolCallId: "t1", toolName: "lookup", input: {} },
            { type: "tool-call", toolCallId: "t2", toolName: "lookup", input: {} },
          ],
        },
        {
          role: "tool",
          content: [{ type: "tool-result", toolCallId: "t1", toolName: "lookup", output: { type: "text", value: "a" } }],
        },
      ]),
    );
    digestOnly(result);
    expect(result.summary).toContain("Conversation digest");
  });

  test("keeps the digest alone when a result answers a call the window does not carry", () => {
    const result = nativeCompactionResult(
      asPrompt([
        user("check"),
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "lookup", input: {} }] },
        {
          role: "tool",
          content: [{ type: "tool-result", toolCallId: "t2", toolName: "lookup", output: { type: "text", value: "ok" } }],
        },
      ]),
    );
    digestOnly(result);
  });

  // The W2 crash shape: a result whose payload was never filled in is not
  // evidence, and replaying it would move the crash to the read.
  test("keeps the digest alone when a replayed result has no output payload", () => {
    const result = nativeCompactionResult(
      asPrompt([
        user("read the file"),
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "read", input: { path: "x" } }] },
        { role: "tool", content: [{ type: "tool-result", toolCallId: "t1", toolName: "read" }] },
      ]),
    );
    digestOnly(result);
    expect(result.summary).toContain("Conversation digest");
  });

  test("keeps the digest alone when a result payload is typed but empty", () => {
    const result = nativeCompactionResult(
      asPrompt([
        user("read the file"),
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "read", input: {} }] },
        { role: "tool", content: [{ type: "tool-result", toolCallId: "t1", toolName: "read", output: { type: "text" } }] },
      ]),
    );
    digestOnly(result);
  });

  // opencode 2.3.2 hands the compaction hook its own dialect, which differs
  // from the provider dialect: `id`/`name`/`result` instead of
  // `toolCallId`/`toolName`/`output`. Rejecting it looked exactly like a failed
  // mid-turn window - six compactions in a row installed the digest alone.
  test("keeps an exchange in the opencode dialect unchanged", () => {
    const assistantPart = { type: "tool-call", id: "muse_tool_2", name: "read", input: { path: "a.ts" }, providerExecuted: false };
    const resultPart = {
      type: "tool-result",
      id: "muse_tool_2",
      name: "read",
      result: { type: "text", value: "line one\nline two" },
      providerExecuted: false,
    };
    const result = nativeCompactionResult(
      asPrompt([
        user("read it"),
        { role: "assistant", content: [assistantPart] },
        { role: "tool", content: [resultPart] },
      ]),
    );
    expect(result.native?.messages).toHaveLength(3);
    expect(result.native?.messages[1]?.content[0]).toEqual(assistantPart);
    expect(result.native?.messages[2]?.content[0]).toEqual(resultPart);
    expect(isNativeCompactionWindow(result.native?.messages)).toBe(true);
  });

  test("clips a very large tool output instead of replaying it whole", () => {
    const result = nativeCompactionResult(
      asPrompt([
        user("read the log"),
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "read", input: {} }] },
        {
          role: "tool",
          content: [{ type: "tool-result", toolCallId: "t1", toolName: "read", output: { type: "text", value: "y".repeat(50_000) } }],
        },
      ]),
    );
    const replayed = result.native?.messages[2]?.content[0] as { output?: { value?: string } } | undefined;
    expect(replayed?.output?.value?.length ?? 0).toBeLessThanOrEqual(4096 + 32);
    expect(replayed?.output?.value?.endsWith("[clipped]")).toBe(true);
  });

  test("keeps the digest alone when the assistant still carries an unanswered tool call", () => {
    const result = nativeCompactionResult(
      asPrompt([
        user("check"),
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "lookup", input: {} }] },
      ]),
    );
    digestOnly(result);
    expect(result.summary).toContain("Conversation digest");
  });

  test("caps the digest at 2048 characters even with a large output budget", () => {
    const prompt = asPrompt(
      Array.from({ length: 40 }, (_, index) => user(`message ${index} ${"x".repeat(200)}`)),
    );
    const result = nativeCompactionResult(prompt, 100_000);
    expect(Array.from(result.native?.messages[0]?.content[0]?.text ?? "").length).toBeLessThanOrEqual(2048);
  });

  // opencode can hand the compaction hook a tool-result part whose output was
  // never filled in. Reading `output.type` threw and failed the compaction.
  test("a tool result with no output keeps the digest instead of throwing", () => {
    const digest = makeCompactionDigest(
      asPrompt([
        user("read the file"),
        {
          role: "assistant",
          content: [{ type: "tool-call", toolCallId: "t1", toolName: "read", input: { path: "x" } }],
        },
        { role: "tool", content: [{ type: "tool-result", toolCallId: "t1", toolName: "read" }] },
      ]),
    );
    expect(digest).toContain("Tool result: read (t1) unknown:");
  });
});
