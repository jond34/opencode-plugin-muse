import { describe, expect, test } from "bun:test";
import type { LanguageModelV3Prompt } from "@ai-sdk/provider";
import { needsFullSeed } from "../src/language-model.js";
import { allImages } from "../src/prompt.js";
import { promptHasHistory, renderTranscript } from "../src/transcript.js";

const asPrompt = (messages: unknown[]): LanguageModelV3Prompt =>
  messages as unknown as LanguageModelV3Prompt;

const user = (text: string) => ({ role: "user", content: [{ type: "text", text }] });
const assistant = (text: string) => ({ role: "assistant", content: [{ type: "text", text }] });
const call = (id: string, name = "lookup") => ({
  role: "assistant",
  content: [{ type: "tool-call", toolCallId: id, toolName: name, input: { q: id } }],
});
const result = (id: string, output: unknown, name = "lookup") => ({
  role: "tool",
  content: [{ type: "tool-result", toolCallId: id, toolName: name, output }],
});

describe("renderTranscript", () => {
  test("keeps tool calls and results, paired by id and in order", () => {
    const prompt = asPrompt([
      user("find the record"),
      call("t1"),
      result("t1", { type: "text", value: "record 42" }),
      assistant("found it"),
    ]);
    const text = renderTranscript(prompt);
    expect(text).toContain('<tool_call id="t1" name="lookup">');
    expect(text).toContain('id="t1" name="lookup" status="ok"');
    expect(text).toContain("record 42");
    expect(text.indexOf("<tool_call")).toBeLessThan(text.indexOf("<tool_result"));
    expect(text.indexOf("find the record")).toBeLessThan(text.indexOf("<tool_call"));
    expect(text.indexOf("<tool_result")).toBeLessThan(text.indexOf("found it"));
  });

  test("marks every error output shape", () => {
    for (const output of [
      { type: "error-text", value: "boom" },
      { type: "error-json", value: { error: "boom" } },
      { type: "execution-denied", reason: "no" },
    ]) {
      const text = renderTranscript(asPrompt([call("t1"), result("t1", output)]));
      expect(text).toContain('status="error"');
    }
  });

  test("renders a call whose result never arrived", () => {
    const text = renderTranscript(asPrompt([call("t1"), call("t2")]));
    expect(text).toContain('id="t1"');
    expect(text).toContain('id="t2"');
    expect(text).not.toContain("<tool_result");
  });

  test("renders a duplicated result once", () => {
    const text = renderTranscript(
      asPrompt([
        call("t1"),
        result("t1", { type: "text", value: "one" }),
        result("t1", { type: "text", value: "one" }),
      ]),
    );
    expect(text.match(/<tool_result/g)).toHaveLength(1);
  });

  test("truncates a long result with an explicit count", () => {
    const text = renderTranscript(
      asPrompt([call("t1"), result("t1", { type: "text", value: "x".repeat(100) })]),
      { maxToolResultChars: 10 },
    );
    expect(text).toContain("[truncated: 90 chars omitted]");
  });

  test("stays inside the total cap and says what it dropped", () => {
    const messages: unknown[] = [user("start")];
    for (let index = 0; index < 20; index += 1) {
      messages.push(call(`t${index}`), result(`t${index}`, { type: "text", value: "y".repeat(500) }));
    }
    const text = renderTranscript(asPrompt(messages), { maxTotalChars: 1_000 });
    expect(text.length).toBeLessThanOrEqual(1_000);
    expect(text).toContain("[truncated:");
    expect(text).toContain("start");
  });

  test("does not put images in the text, and keeps them available", () => {
    const prompt = asPrompt([
      {
        role: "user",
        content: [
          { type: "text", text: "see this" },
          { type: "file", mediaType: "image/png", data: "aGVsbG8=" },
        ],
      },
    ]);
    const text = renderTranscript(prompt);
    expect(text).toBe("see this");
    expect(allImages(prompt)).toEqual([{ mediaType: "image/png", data: "aGVsbG8=" }]);
  });

  test("a text-only prompt renders exactly as before", () => {
    const prompt = asPrompt([
      { role: "system", content: "sys" },
      user("first"),
      assistant("ack"),
      user("second"),
    ]);
    expect(renderTranscript(prompt)).toBe("sys\n\nfirst\n\nack\n\nsecond");
  });
});

describe("needsFullSeed", () => {
  const history = asPrompt([user("a"), assistant("b"), user("c")]);
  const first = asPrompt([{ role: "system", content: "sys" }, user("hi")]);

  test("a fork replays the parent conversation", () => {
    expect(needsFullSeed({ fresh: true, nativeHasHistory: false, reseed: false, prompt: history })).toBe(true);
  });

  test("a first request sends only the new user turn", () => {
    expect(needsFullSeed({ fresh: true, nativeHasHistory: false, reseed: false, prompt: first })).toBe(false);
  });

  test("a resumed native session must not be seeded again", () => {
    expect(needsFullSeed({ fresh: true, nativeHasHistory: true, reseed: false, prompt: history })).toBe(false);
  });

  test("a rewrite reseeds even when the store still named an id", () => {
    expect(needsFullSeed({ fresh: true, nativeHasHistory: true, reseed: true, prompt: history })).toBe(true);
  });

  test("later steps of the same session are deltas", () => {
    expect(needsFullSeed({ fresh: false, nativeHasHistory: false, reseed: false, prompt: history })).toBe(false);
  });
});

describe("promptHasHistory", () => {
  test("a first request with one user message has none", () => {
    expect(promptHasHistory(asPrompt([{ role: "system", content: "sys" }, user("hi")]))).toBe(false);
  });

  test("assistant, tool, or an earlier user message counts as history", () => {
    expect(promptHasHistory(asPrompt([user("a"), assistant("b"), user("c")]))).toBe(true);
    expect(promptHasHistory(asPrompt([user("a"), call("t1"), result("t1", { type: "text", value: "x" })]))).toBe(true);
    expect(promptHasHistory(asPrompt([user("a"), user("b")]))).toBe(true);
  });
});
