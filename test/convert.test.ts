import { describe, expect, test } from "bun:test";
import { StreamConverter } from "../src/convert.js";
import type { HarnessContentBlock, HarnessEvent, HarnessMessage } from "../src/contract/index.js";

function message(
  id: string,
  text: string,
  role: HarnessMessage["role"] = "assistant",
): HarnessMessage {
  const content: HarnessContentBlock[] = text === "" ? [] : [{ type: "text", text }];
  return {
    id,
    turnId: "t1",
    role,
    content,
    status: "completed",
    createdAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
  };
}

function delta(messageId: string, text: string): HarnessEvent {
  return { type: "message.delta", messageId, text };
}

function completed(id: string, text: string, role: HarnessMessage["role"] = "assistant"): HarnessEvent {
  return { type: "message.completed", message: message(id, text, role) };
}

/** The text a consumer accumulates from the parts, in stream order. */
function rendered(parts: ReturnType<StreamConverter["convert"]>): string {
  return parts
    .filter((part) => part.type === "text-delta")
    .map((part) => (part.type === "text-delta" ? part.delta : ""))
    .join("");
}

describe("StreamConverter: reply text", () => {
  test("a completion whose deltas never arrived renders the whole reply", () => {
    const converter = new StreamConverter();
    const parts = converter.convert(completed("m1", "the whole answer"));
    expect(parts.map((part) => part.type)).toEqual(["text-start", "text-delta", "text-end"]);
    expect(rendered(parts)).toBe("the whole answer");
    expect(parts[0]?.type === "text-start" ? parts[0].id : undefined).toBe("text-m1");
  });

  test("a streamed reply is not repeated by its completion", () => {
    const converter = new StreamConverter();
    const parts = [
      ...converter.convert(delta("m1", "the ")),
      ...converter.convert(delta("m1", "whole answer")),
      ...converter.convert(completed("m1", "the whole answer")),
    ];
    expect(parts.map((part) => part.type)).toEqual([
      "text-start",
      "text-delta",
      "text-delta",
      "text-end",
    ]);
    expect(rendered(parts)).toBe("the whole answer");
  });

  test("a saturated surface appends nothing: the preview already showed more", () => {
    // The budget cuts `agentMessage.text`, so the completed frame is the
    // shorter one. Appending anything would invent a prefix.
    const converter = new StreamConverter();
    const parts = [
      ...converter.convert(delta("m1", "hello world")),
      ...converter.convert(completed("m1", "hello")),
    ];
    expect(rendered(parts)).toBe("hello world");
    expect(parts.map((part) => part.type)).toEqual(["text-start", "text-delta", "text-end"]);
  });

  test("a delta replayed after the completion is ignored", () => {
    const converter = new StreamConverter();
    const parts = [
      ...converter.convert(completed("m1", "done")),
      ...converter.convert(delta("m1", "more")),
    ];
    expect(parts.map((part) => part.type)).toEqual(["text-start", "text-delta", "text-end"]);
    expect(rendered(parts)).toBe("done");
  });

  test("two messages keep separate offsets", () => {
    // The second message must measure from its own deltas, not the first's, or
    // its completion drops a prefix it never streamed.
    const converter = new StreamConverter();
    const parts = [
      ...converter.convert(delta("m1", "abc")),
      ...converter.convert(completed("m1", "abc")),
      ...converter.convert(delta("m2", "de")),
      ...converter.convert(completed("m2", "def")),
    ];
    expect(rendered(parts)).toBe("abcdef");
  });

  test("a completion with no deltas after a closed block uses a tail part id", () => {
    // The step ended mid-block, so `text-m1` is spent. A second start under the
    // same id would be a reused part id; the tail gets its own.
    const converter = new StreamConverter();
    converter.convert(delta("m1", "half"));
    converter.closeBlocks();
    const parts = converter.convert(completed("m1", "half and half"));
    expect(parts.map((part) => part.type)).toEqual(["text-start", "text-delta", "text-end"]);
    expect(parts[0]?.type === "text-start" ? parts[0].id : undefined).toBe("text-m1-tail");
    expect(rendered(parts)).toBe(" and half");
  });

  test("a user message completion emits nothing", () => {
    const converter = new StreamConverter();
    expect(converter.convert(completed("u1", "my prompt", "user"))).toEqual([]);
  });
});
