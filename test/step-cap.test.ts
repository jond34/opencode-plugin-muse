import { describe, expect, test } from "bun:test";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { MuseHarnessAdapter } from "../src/adapter.js";
import { HEADERS, MuseLanguageModel } from "../src/language-model.js";
import { MuseHarnessSession, type SessionHost } from "../src/session.js";
import { MuseSessionRegistry } from "../src/session-registry.js";

interface RecordedCommand {
  method: string;
  params: Record<string, unknown>;
}

/**
 * A host that answers `turn/interrupt` the way a real one does: the turn ends
 * with a completion event, which is what clears the session's active turn.
 */
function fakeHost(
  commands: RecordedCommand[],
  onInterrupt?: () => void,
): SessionHost {
  let counter = 0;
  return {
    connection: {
      mintCommandId: () => `cmd-${counter++}`,
      command: async (method: string, params: Record<string, unknown>) => {
        commands.push({ method, params });
        if (method === "turn/start") return { turnId: "native-turn" };
        if (method === "session/start") {
          return { session: { sessionId: `native-${counter}`, modelId: "muse-spark-1.3" } };
        }
        if (method === "turn/interrupt") onInterrupt?.();
        return {};
      },
    },
    registerSink: () => {},
    unregisterSink: () => {},
  };
}

function request(input: {
  prompt: unknown[];
  toolChoice?: unknown;
}): LanguageModelV3CallOptions {
  const options: Record<string, unknown> = {
    prompt: input.prompt,
    tools: [{ type: "function", name: "lookup", inputSchema: { type: "object" } }],
    headers: {
      [HEADERS.kind]: "primary",
      [HEADERS.session]: "oc",
      [HEADERS.directory]: "/tmp",
    },
  };
  if (input.toolChoice !== undefined) options.toolChoice = input.toolChoice;
  return options as unknown as LanguageModelV3CallOptions;
}

const system = { role: "system", content: "sys" };
const first = { role: "user", content: [{ type: "text", text: "first" }] };
const ack = { role: "assistant", content: [{ type: "text", text: "ack" }] };
const call = {
  role: "assistant",
  content: [{ type: "tool-call", toolCallId: "tc1", toolName: "lookup", input: { q: "x" } }],
};
const result = {
  role: "tool",
  content: [
    { type: "tool-result", toolCallId: "tc1", toolName: "lookup", output: { type: "text", value: "answer" } },
  ],
};
// OpenCode appends the step-cap instruction as an assistant message.
const capInstruction = {
  role: "assistant",
  content: [{ type: "text", text: "CRITICAL - MAXIMUM STEPS REACHED. Respond with text only." }],
};

function build(commands: RecordedCommand[], sessions: MuseHarnessSession[]) {
  const adapter = {
    listModels: async () => [],
    openSession: async (input: { sessionId: string; cwd: string; model?: string | null }) => {
      const session = MuseHarnessSession.fromNativeSession(
        fakeHost(commands, () => {
          session.handleNotification({
            method: "turn/completed",
            params: { sessionId: "native-0", turnId: "native-turn", terminal: "completed" },
          });
        }),
        { sessionId: input.sessionId, cwd: input.cwd, model: input.model ?? null },
        `native-${sessions.length}`,
      );
      sessions.push(session);
      return session;
    },
  } as unknown as MuseHarnessAdapter;
  const registry = new MuseSessionRegistry(adapter);
  return { registry, model: new MuseLanguageModel("muse-spark-1.3", {}, registry, "muse") };
}

describe("the step cap", () => {
  test("closes the running turn before delivering the instruction", async () => {
    const commands: RecordedCommand[] = [];
    const sessions: MuseHarnessSession[] = [];
    const { registry, model } = build(commands, sessions);

    const running = await model.doStream(request({ prompt: [system, first] }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(commands.filter((entry) => entry.method === "turn/start")).toHaveLength(1);
    expect(registry.peek("oc")?.hasActiveTurn).toBe(true);

    // The capped step: the tool result plus the host's text-only instruction,
    // marked by `toolChoice: none`. Muse would keep calling tools if the
    // instruction were steered into the turn that is still running.
    const capped = await model.doStream(
      request({
        prompt: [system, first, ack, call, result, capInstruction],
        toolChoice: { type: "none" },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    const interrupts = commands.filter((entry) => entry.method === "turn/interrupt");
    expect(interrupts).toHaveLength(1);
    // The interrupt must come before the turn that carries the instruction.
    const order = commands.map((entry) => entry.method);
    const interruptedAt = order.indexOf("turn/interrupt");
    expect(order.lastIndexOf("turn/start")).toBeGreaterThan(interruptedAt);

    const starts = commands.filter((entry) => entry.method === "turn/start");
    expect(JSON.stringify(starts[starts.length - 1]?.params.input)).toContain("CRITICAL - MAXIMUM STEPS");
    // Cancelling the step interrupts too, so it comes after the assertions.
    await capped.stream.cancel();
    await running.stream.cancel();
  });

  test("an ordinary tool-result step neither steers nor interrupts", async () => {
    const commands: RecordedCommand[] = [];
    const sessions: MuseHarnessSession[] = [];
    const { model } = build(commands, sessions);

    const running = await model.doStream(request({ prompt: [system, first] }));
    await new Promise((resolve) => setTimeout(resolve, 5));

    const step = await model.doStream(request({ prompt: [system, first, ack, call, result] }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The parked call is answered inside the turn that is still running, so
    // there is nothing to close and nothing new to deliver.
    expect(commands.filter((entry) => entry.method === "turn/interrupt")).toHaveLength(0);
    expect(commands.filter((entry) => entry.method === "turn/steer")).toHaveLength(0);
    expect(commands.filter((entry) => entry.method === "turn/start")).toHaveLength(1);
    await step.stream.cancel();
    await running.stream.cancel();
  });

  test("a capped first step starts no second turn", async () => {
    const commands: RecordedCommand[] = [];
    const sessions: MuseHarnessSession[] = [];
    const { model } = build(commands, sessions);

    const only = await model.doStream(
      request({ prompt: [system, first, capInstruction], toolChoice: { type: "none" } }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Nothing was in flight, so there is nothing to close.
    expect(commands.filter((entry) => entry.method === "turn/interrupt")).toHaveLength(0);
    expect(commands.filter((entry) => entry.method === "turn/start")).toHaveLength(1);
    await only.stream.cancel();
  });
});
