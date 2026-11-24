import { describe, expect, test } from "bun:test";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import type { HarnessEvent } from "../src/contract/index.js";
import { MuseHarnessAdapter } from "../src/adapter.js";
import type { MuseNotification } from "../src/host.js";
import { HEADERS, MuseLanguageModel } from "../src/language-model.js";
import { MuseHarnessSession, type SessionHost } from "../src/session.js";
import { MuseSessionRegistry } from "../src/session-registry.js";

interface RecordedCommand {
  method: string;
  params: Record<string, unknown>;
}

function fakeHost(commands: RecordedCommand[]): SessionHost {
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
        return {};
      },
    },
    registerSink: () => {},
    unregisterSink: () => {},
  };
}

function compaction(itemId = "c1"): MuseNotification {
  return {
    method: "item/started",
    params: {
      item: {
        itemId,
        kind: "compaction",
        turnId: "native-turn",
        status: "completed",
        tokensBefore: 90_000,
        tokensAfter: 12_000,
        trigger: "auto",
        strategyId: "summary",
        outcome: "summary",
        reason: "threshold",
      },
    },
  };
}

function request(prompt: unknown[]): LanguageModelV3CallOptions {
  return {
    prompt,
    tools: [{ type: "function", name: "lookup", inputSchema: { type: "object" } }],
    headers: {
      [HEADERS.kind]: "primary",
      [HEADERS.session]: "oc",
      [HEADERS.directory]: "/tmp",
    },
  } as unknown as LanguageModelV3CallOptions;
}

const system = { role: "system", content: "sys" };
const first = { role: "user", content: [{ type: "text", text: "first" }] };
const ack = { role: "assistant", content: [{ type: "text", text: "ack" }] };
const call = {
  role: "assistant",
  content: [
    { type: "tool-call", toolCallId: "tc1", toolName: "lookup", input: { q: "x" } },
  ],
};
const result = {
  role: "tool",
  content: [
    { type: "tool-result", toolCallId: "tc1", toolName: "lookup", output: { type: "text", value: "answer" } },
  ],
};
const second = { role: "user", content: [{ type: "text", text: "second" }] };

const afterFirst = [system, first, ack, call, result, second];

describe("Muse compaction", () => {
  test("reports one history.compacted per item, including replay duplication", async () => {
    const commands: RecordedCommand[] = [];
    const session = MuseHarnessSession.fromNativeSession(
      fakeHost(commands),
      { sessionId: "oc", cwd: "/tmp" },
      "native",
    );
    const events: HarnessEvent[] = [];
    const collecting = (async () => {
      for await (const event of session.subscribe()) events.push(event);
    })();
    session.handleNotification(compaction());
    session.handleNotification({
      method: "item/completed",
      params: { item: { itemId: "c1", kind: "compaction", turnId: "native-turn", status: "completed" } },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await session.close();
    await collecting;

    const reported = events.filter((event) => event.type === "history.compacted");
    expect(reported).toHaveLength(1);
    expect(reported[0]).toMatchObject({
      type: "history.compacted",
      itemId: "c1",
      tokensBefore: 90_000,
      tokensAfter: 12_000,
      trigger: "auto",
      strategy: "summary",
      outcome: "summary",
    });
    expect(session.compactionCount).toBe(1);
  });

  test("an unknown item kind is counted, not fatal", async () => {
    const commands: RecordedCommand[] = [];
    const session = MuseHarnessSession.fromNativeSession(
      fakeHost(commands),
      { sessionId: "oc", cwd: "/tmp" },
      "native",
    );
    session.handleNotification({
      method: "item/started",
      params: { item: { itemId: "u1", kind: "subagent", turnId: "native-turn", status: "inProgress" } },
    });
    expect(session.unexpectedItemKinds.get("subagent")).toBe(1);
    await session.close();
  });
});

describe("reseed after a Muse compaction", () => {
  test("the next user turn rebuilds and seeds the whole transcript", async () => {
    const commands: RecordedCommand[] = [];
    const sessions: MuseHarnessSession[] = [];
    const adapter = {
      listModels: async () => [],
      openSession: async (input: { sessionId: string; cwd: string; model?: string | null }) => {
        const session = MuseHarnessSession.fromNativeSession(
          fakeHost(commands),
          { sessionId: input.sessionId, cwd: input.cwd, model: input.model ?? null },
          `native-${sessions.length}`,
        );
        sessions.push(session);
        return session;
      },
    } as unknown as MuseHarnessAdapter;
    const registry = new MuseSessionRegistry(adapter);
    const model = new MuseLanguageModel("muse-spark-1.3", {}, registry, "muse");

    const firstStream = await model.doStream(request([system, first]));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await firstStream.stream.cancel();

    const started = commands.find((entry) => entry.method === "turn/start");
    expect(JSON.stringify(started?.params.input)).toContain("first");

    sessions[0]?.handleNotification(compaction());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(registry.peek("oc")?.compactionPending).toBe(true);

    const secondStream = await model.doStream(request(afterFirst));
    await new Promise((resolve) => setTimeout(resolve, 5));

    const starts = commands.filter((entry) => entry.method === "turn/start");
    const seeded = JSON.stringify(starts[starts.length - 1]?.params.input);
    expect(seeded).toContain("<tool_call");
    expect(seeded).toContain("<tool_result");
    expect(seeded).toContain("first");
    expect(seeded).toContain("second");
    const live = registry.peek("oc");
    expect(live?.lastSeedReason).toBe("muse_compaction");
    expect(live?.lastStepStats.toolBlocks).toBe(2);
    await secondStream.stream.cancel();
  });

  test("a compaction during a tool-loop step does not reseed that step", async () => {
    const commands: RecordedCommand[] = [];
    const sessions: MuseHarnessSession[] = [];
    const adapter = {
      listModels: async () => [],
      openSession: async (input: { sessionId: string; cwd: string; model?: string | null }) => {
        const session = MuseHarnessSession.fromNativeSession(
          fakeHost(commands),
          { sessionId: input.sessionId, cwd: input.cwd, model: input.model ?? null },
          `native-${sessions.length}`,
        );
        sessions.push(session);
        return session;
      },
    } as unknown as MuseHarnessAdapter;
    const registry = new MuseSessionRegistry(adapter);
    const model = new MuseLanguageModel("muse-spark-1.3", {}, registry, "muse");

    const firstStream = await model.doStream(request([system, first]));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await firstStream.stream.cancel();
    sessions[0]?.handleNotification(compaction());
    await new Promise((resolve) => setTimeout(resolve, 10));
    const sessionCount = sessions.length;

    // A tool result is not a new user turn: the current turn may continue on
    // Muse's summary, and rebuilding here would strand the parked call.
    const toolStep = await model.doStream(request([system, first, ack, call, result]));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(sessions.length).toBe(sessionCount);
    expect(registry.peek("oc")?.compactionPending).toBe(true);

    const nextUser = await model.doStream(request(afterFirst));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(sessions.length).toBe(sessionCount + 1);
    expect(registry.peek("oc")?.lastSeedReason).toBe("muse_compaction");
    await toolStep.stream.cancel();
    await nextUser.stream.cancel();
  });

  test("context pressure rebuilds on the next user turn", async () => {
    const commands: RecordedCommand[] = [];
    const sessions: MuseHarnessSession[] = [];
    const adapter = {
      listModels: async () => [],
      openSession: async (input: { sessionId: string; cwd: string; model?: string | null }) => {
        const session = MuseHarnessSession.fromNativeSession(
          fakeHost(commands),
          { sessionId: input.sessionId, cwd: input.cwd, model: input.model ?? null },
          `native-${sessions.length}`,
        );
        sessions.push(session);
        return session;
      },
    } as unknown as MuseHarnessAdapter;
    const registry = new MuseSessionRegistry(adapter);
    const model = new MuseLanguageModel("muse-spark-1.3", {}, registry, "muse");

    const firstStream = await model.doStream(request([system, first]));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await firstStream.stream.cancel();

    sessions[0]?.handleNotification({
      method: "session/contextUsage",
      params: {
        sessionId: "native-0",
        usedTokens: 95_000,
        windowTokens: 100_000,
        pressure: "high",
      },
    });

    const secondStream = await model.doStream(request([system, first, ack, second]));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const live = registry.peek("oc");
    expect(live?.lastSeedReason).toBe("pressure");
    expect(sessions.length).toBe(2);
    await secondStream.stream.cancel();
  });
});
