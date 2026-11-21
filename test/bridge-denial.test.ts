import { describe, expect, test } from "bun:test";
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { HEADERS } from "../src/language-model.js";
import { createArm } from "../bench/arms.js";

/**
 * Phase 8a: the three ways a parked bridge call can end without a tool result.
 *
 * The bridge parks every call Muse makes and resolves it from opencode's next
 * step, so these are the paths that decide whether a denied, abandoned, or
 * cancelled call fails loudly or hangs the session. Source guards:
 * `src/session-registry.ts:392` (turn ended), `:686` (session closed), and
 * `resolvePending` at `:669` for the denied case.
 */

const TOOL = { type: "function" as const, name: "bash", inputSchema: { type: "object" } };

type ToolCallPart = Extract<LanguageModelV3StreamPart, { type: "tool-call" }>;

function request(sessionID: string, messages: unknown[]): LanguageModelV3CallOptions {
  return {
    prompt: messages,
    tools: [TOOL],
    headers: {
      [HEADERS.kind]: "primary",
      [HEADERS.session]: sessionID,
      [HEADERS.directory]: "/tmp",
    },
  } as unknown as LanguageModelV3CallOptions;
}

const said = (text: string) => ({ role: "user", content: [{ type: "text", text }] });

const toolCallMessage = (call: ToolCallPart) => ({
  role: "assistant",
  content: [{ type: "tool-call", toolCallId: call.toolCallId, toolName: call.toolName, input: call.input }],
});

const toolResultMessage = (call: ToolCallPart, output: Record<string, unknown>) => ({
  role: "tool",
  content: [{ type: "tool-result", toolCallId: call.toolCallId, toolName: call.toolName, output }],
});

async function collect(result: { stream: ReadableStream<LanguageModelV3StreamPart> }) {
  const parts: LanguageModelV3StreamPart[] = [];
  for await (const part of result.stream) parts.push(part);
  return parts;
}

/** v3 text deltas carry `delta`; older shapes carried `text`/`textDelta`. */
function textOf(parts: LanguageModelV3StreamPart[]): string {
  return parts
    .filter((part) => part.type === "text-delta")
    .map((part) => {
      const raw = part as unknown as Record<string, unknown>;
      return String(raw.delta ?? raw.text ?? raw.textDelta ?? "");
    })
    .join("");
}

async function withDeadline<T>(promise: Promise<T>, what: string, ms = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`deadline: ${what}`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Poll rather than sleep a fixed time, so a slow machine is not a failure. */
async function until(what: string, predicate: () => boolean, ms = 3000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > ms) throw new Error(`deadline: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("a parked bridge call", () => {
  test("a denied result reaches the model as an error carrying the reason", async () => {
    const arm = createArm("production", { toolName: "bash" });
    try {
      const step = await arm.model.doStream(request("deny-1", [said("run the sentinel")]));
      const parts = await withDeadline(collect(step), "first step");
      const call = parts.find((part): part is ToolCallPart => part.type === "tool-call");
      expect(call).toBeDefined();
      // The step parks on the call: it ends as tool-calls, not as an answer.
      const finish = parts.find((part) => part.type === "finish");
      const reasonPart = finish?.type === "finish" ? finish.finishReason : undefined;
      const unified = typeof reasonPart === "object" ? reasonPart.unified : reasonPart;
      expect(unified).toBe("tool-calls");
      // Nothing resolved it yet: the bridge is parked, not answered.
      expect(arm.adapter.sessions[0]?.toolResults).toHaveLength(0);

      const reason = "the user declined this command";
      const resumed = await arm.model.doStream(
        request("deny-1", [
          said("run the sentinel"),
          toolCallMessage(call!),
          toolResultMessage(call!, { type: "execution-denied", reason }),
        ]),
      );
      const after = await withDeadline(collect(resumed), "answer step");

      // The model saw the denial, and it is an error, not a success.
      const delivered = arm.adapter.sessions[0]?.toolResults.at(-1);
      expect(delivered?.isError).toBe(true);
      expect(delivered?.content).toEqual([{ type: "text", text: reason }]);
      // The reason is visible in the reply, so the model can adapt.
      expect(textOf(after)).toContain(reason);
      // A denial is not retried: no new call, no second attempt.
      expect(after.some((part) => part.type === "tool-call")).toBe(false);
      expect(arm.adapter.sessions[0]?.toolCallsAttempted).toBe(1);
    } finally {
      await arm.registry.closeAll();
    }
  });

  test("a turn that ends while the call is parked rejects instead of hanging", async () => {
    const arm = createArm("production", { toolName: "bash", failTurnWhileParked: true });
    try {
      const step = await arm.model.doStream(request("deny-2", [said("run the sentinel")]));
      // The stream may fail with the turn; the claim under test is the parked
      // call, which is what would otherwise wait forever.
      await collect(step).catch(() => []);

      await until("the parked call to be rejected", () => (arm.adapter.sessions[0]?.toolErrors.length ?? 0) > 0);
      expect(arm.adapter.sessions[0]?.toolErrors).toEqual(["Turn ended before the tool result arrived"]);
      // It never saw a result, because there was none.
      expect(arm.adapter.sessions[0]?.toolResults).toHaveLength(0);
    } finally {
      await arm.registry.closeAll();
    }
  });

  test("closing the session while the call is parked rejects it", async () => {
    const arm = createArm("production", { toolName: "bash" });
    const step = await arm.model.doStream(request("deny-3", [said("run the sentinel")]));
    await withDeadline(collect(step), "first step");
    expect(arm.adapter.sessions[0]?.toolResults).toHaveLength(0);

    await withDeadline(arm.registry.closeAll(), "closeAll while parked");
    await until("the close rejection to reach the model", () =>
      (arm.adapter.sessions[0]?.toolErrors ?? []).includes("Session closed"),
    );
    expect(arm.adapter.sessions[0]?.toolResults).toHaveLength(0);
  });
});
