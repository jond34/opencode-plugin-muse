import { describe, expect, test } from "bun:test";
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import type { HarnessEvent } from "../src/contract/index.js";
import {
  HEADERS,
  LiveSession,
  fingerprintCompactionOutput,
  MuseHarnessAdapter,
  MuseHarnessSession,
  MuseLanguageModel,
  MuseSessionRegistry,
  toToolResult,
  type MuseNotification,
  type SessionHost,
} from "../src/index.js";

const BRIDGE_TOOL = {
  type: "function" as const,
  name: "lookup",
  inputSchema: { type: "object" },
};

interface RecordedCommand {
  method: string;
  params: Record<string, unknown>;
}

interface FakeHost {
  host: SessionHost;
  commands: RecordedCommand[];
}

/** A host that records commands and answers from a fixed method -> result map. */
function fakeHost(results: Record<string, Record<string, unknown>> = {}): FakeHost {
  const commands: RecordedCommand[] = [];
  let counter = 0;
  const host: SessionHost = {
    connection: {
      mintCommandId: () => `cmd-${counter++}`,
      command: async (method: string, params: Record<string, unknown>) => {
        commands.push({ method, params });
        return results[method] ?? {};
      },
    },
    registerSink: () => {},
    unregisterSink: () => {},
  };
  return { host, commands };
}

/** Subscribe, run `body`, then close and return every event in stream order. */
async function drive(session: MuseHarnessSession, body: () => Promise<void>): Promise<HarnessEvent[]> {
  const events: HarnessEvent[] = [];
  const collecting = (async () => {
    for await (const event of session.subscribe()) events.push(event);
  })();
  await body();
  await new Promise((resolve) => setTimeout(resolve, 10));
  await session.close();
  await collecting;
  return events;
}

function fakeController(): {
  parts: LanguageModelV3StreamPart[];
  controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>;
  closed: () => boolean;
} {
  const parts: LanguageModelV3StreamPart[] = [];
  let closed = false;
  return {
    parts,
    controller: {
      enqueue: (part: LanguageModelV3StreamPart) => {
        parts.push(part);
      },
      close: () => {
        closed = true;
      },
    } as unknown as ReadableStreamDefaultController<LanguageModelV3StreamPart>,
    closed: () => closed,
  };
}

describe("MuseHarnessSession construction", () => {
  test("a fork starts a fresh native session instead of reusing the source id", async () => {
    // A server-side fork inherits the source's MCP bridge, so the registry
    // never issues one: the fork starts fresh and reseeds history as text.
    const opened: Record<string, unknown>[] = [];
    const adapter = {
      listModels: async () => [],
      openSession: async (input: Record<string, unknown>) => {
        opened.push(input);
        return MuseHarnessSession.fromNativeSession(
          fakeHost().host,
          { sessionId: input.sessionId as string, cwd: input.cwd as string },
          "fresh-native",
        );
      },
    } as unknown as MuseHarnessAdapter;
    const registry = new MuseSessionRegistry(adapter);
    const live = await registry.get("oc-fork", "/tmp", "oc-source", "muse-spark-1.3");
    try {
      expect(opened[0]).not.toHaveProperty("resumeSessionId");
      expect(opened[0]).not.toHaveProperty("forkSessionId");
      expect(opened[0]).toMatchObject({ model: "muse-spark-1.3" });
      expect(live.takeFullSeed()).toBe(true);
    } finally {
      await registry.close("oc-fork");
    }
  });

  test("a resume keeps the native id and forwards the model", async () => {
    const { host, commands } = fakeHost({
      "session/resume": { session: { sessionId: "source-native", modelId: "muse-ember-1.0" } },
    });
    const session = await MuseHarnessSession.create(host, {
      sessionId: "oc-resume",
      cwd: "/tmp",
      resumeSessionId: "source-native",
      model: "muse-ember-1.0",
    });
    expect(commands[0]?.method).toBe("session/resume");
    expect(commands[0]?.params.modelId).toBe("muse-ember-1.0");
    expect(session.nativeSessionId).toBe("source-native");
    await session.close();
  });

  test("start forwards a developer prompt in SessionConfig", async () => {
    const { host, commands } = fakeHost({
      "session/start": { session: { sessionId: "fresh-native", modelId: "muse-spark-1.3" } },
    });
    const session = await MuseHarnessSession.create(host, {
      sessionId: "oc-start",
      cwd: "/tmp",
      developerPrompt: "Be terse.",
    });
    expect(commands[0]?.method).toBe("session/start");
    expect(commands[0]?.params.config).toEqual({ developerPrompt: "Be terse." });
    await session.close();
  });

  test("resume forwards a developer prompt in SessionConfig", async () => {
    const { host, commands } = fakeHost({
      "session/resume": { session: { sessionId: "source-native", modelId: "muse-spark-1.3" } },
    });
    const session = await MuseHarnessSession.create(host, {
      sessionId: "oc-resume",
      cwd: "/tmp",
      resumeSessionId: "source-native",
      developerPrompt: "Be terse.",
    });
    expect(commands[0]?.method).toBe("session/resume");
    expect(commands[0]?.params.config).toEqual({ developerPrompt: "Be terse." });
    await session.close();
  });

  test("a fresh start forwards the model", async () => {
    const { host, commands } = fakeHost({
      "session/start": { session: { sessionId: "fresh-native", modelId: "muse-spark-1.3" } },
    });
    const session = await MuseHarnessSession.create(host, {
      sessionId: "oc-start",
      cwd: "/tmp",
      model: "muse-spark-1.3",
    });
    expect(commands[0]?.method).toBe("session/start");
    expect(commands[0]?.params.modelId).toBe("muse-spark-1.3");
    // No bridge means the host's own approval default applies.
    expect(commands[0]?.params).not.toHaveProperty("approvalMode");
    await session.close();
  });
});

describe("MuseHarnessSession turns", () => {
  test("startTurn is pending until turn/started confirms it", async () => {
    const { host } = fakeHost({ "turn/start": { turnId: "native-turn" } });
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const events = await drive(session, async () => {
      const turn = await session.startTurn({
        turnId: "t1",
        message: { content: [{ type: "text", text: "hi" }] },
      });
      expect(turn.status).toBe("pending");
      session.handleNotification({
        method: "turn/started",
        params: { turnId: "native-turn", sessionId: "native" },
      } satisfies MuseNotification);
    });
    const started = events.find((event) => event.type === "turn.started");
    expect(started?.type === "turn.started" ? started.turn.status : undefined).toBe("running");
  });

  test("approval/updated refreshes the choices and requirement", async () => {
    const { host, commands } = fakeHost({ "approval/decide": { status: "accepted" } });
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const events = await drive(session, async () => {
      session.handleNotification({
        method: "approval/requested",
        params: {
          approvalId: "ap1",
          sessionId: "native",
          turnId: "t1",
          currentRequirementId: { approvalId: "ap1", sourceIndex: 0 },
          availableChoices: [{ choiceId: "allow", label: "Allow" }],
        },
      } satisfies MuseNotification);
      session.handleNotification({
        method: "approval/updated",
        params: {
          approvalId: "ap1",
          sessionId: "native",
          currentRequirementId: { approvalId: "ap1", sourceIndex: 1 },
          availableChoices: [{ choiceId: "allow-stage-2", label: "Allow stage 2" }],
        },
      } satisfies MuseNotification);
      await session.respondToRequest({
        requestId: "ap1",
        decision: "accept",
        optionId: "allow-stage-2",
      });
    });
    const updated = events.filter((event) => event.type === "request.updated");
    const last = updated[updated.length - 1];
    expect(last?.type === "request.updated" ? last.request.options : undefined).toEqual([
      { id: "allow-stage-2", label: "Allow stage 2" },
    ]);
    const decide = commands.find((entry) => entry.method === "approval/decide");
    expect(decide?.params).toMatchObject({
      approvalId: "ap1",
      choiceId: "allow-stage-2",
      requirementId: { approvalId: "ap1", sourceIndex: 1 },
    });
  });

  test("setModel issues session/setModel and updates the info", async () => {
    const { host, commands } = fakeHost({
      "session/setModel": { status: "accepted" },
    });
    const session = MuseHarnessSession.fromNativeSession(
      host,
      { sessionId: "oc", cwd: "/tmp", model: "muse-spark-1.3" },
      "native",
      "muse-spark-1.3",
    );
    await session.setModel("muse-ember-1.0");
    const command = commands.find((entry) => entry.method === "session/setModel");
    expect(command?.params).toMatchObject({
      sessionId: "native",
      model: { modelId: "muse-ember-1.0" },
    });
    expect(session.info.model).toBe("muse-ember-1.0");
    await session.close();
  });
});

describe("LiveSession step settling", () => {
  test("a finish buffered while detached closes the next step", async () => {
    const { host } = fakeHost({ "turn/start": { turnId: "native-turn" } });
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const live = new LiveSession("oc", session);
    try {
      // A cancelled step detached its controller, so the finish queued.
      live.endStep("stop");
      const step = fakeController();
      live.attach(step.controller);
      expect(step.parts.some((part) => part.type === "finish")).toBe(true);
      expect(step.closed()).toBe(true);
    } finally {
      await live.close();
    }
  });

  test("a parked step delivers its finish to its own stream, not the next", async () => {
    const { host } = fakeHost({ "turn/start": { turnId: "native-turn" } });
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const live = new LiveSession("oc", session);
    try {
      await session.startTurn({ turnId: "t1", message: { content: [{ type: "text", text: "hi" }] } });
      session.handleNotification({
        method: "turn/started",
        params: { turnId: "native-turn", sessionId: "native" },
      } as MuseNotification);
      live.setActiveTurn(true, "t1");

      const first = fakeController();
      live.attach(first.controller);
      live.emitToolCall({ toolCallId: "tc1", toolName: "lookup", input: { q: "x" } });
      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(first.parts.some((part) => part.type === "finish")).toBe(true);
      expect(first.closed()).toBe(true);

      const second = fakeController();
      live.attach(second.controller);
      await new Promise((resolve) => setTimeout(resolve, 20));
      // The turn is still parked on the tool call, so the next step stays open
      // and waits for Muse instead of settling on a foreign finish.
      expect(second.parts.some((part) => part.type === "finish")).toBe(false);
      expect(second.closed()).toBe(false);
    } finally {
      await live.close();
    }
  });

  test("a step with no turn running settles at once", async () => {
    const { host } = fakeHost();
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const live = new LiveSession("oc", session);
    try {
      const step = fakeController();
      live.attach(step.controller);
      expect(step.parts.some((part) => part.type === "finish")).toBe(true);
      expect(step.closed()).toBe(true);
    } finally {
      await live.close();
    }
  });

  test("a user message that arrives mid-turn is steered, not dropped", async () => {
    const { host, commands } = fakeHost({
      "turn/start": { turnId: "native-turn" },
      "turn/steer": { status: "accepted" },
    });
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const adapter = {
      listModels: async () => [],
      openSession: async () => session,
    } as unknown as MuseHarnessAdapter;
    const registry = new MuseSessionRegistry(adapter);
    const model = new MuseLanguageModel("muse-spark-1.3", {}, registry, "muse");
    const request = (messages: unknown[]) =>
      ({
        prompt: messages,
        tools: [BRIDGE_TOOL],
        headers: {
          [HEADERS.kind]: "primary",
          [HEADERS.session]: "oc",
          [HEADERS.directory]: "/tmp",
        },
      }) as unknown as LanguageModelV3CallOptions;

    const first = await model.doStream(
      request([
        { role: "system", content: "sys" },
        { role: "user", content: [{ type: "text", text: "first" }] },
      ]),
    );
    const second = await model.doStream(
      request([
        { role: "system", content: "sys" },
        { role: "user", content: [{ type: "text", text: "first" }] },
        { role: "assistant", content: [{ type: "text", text: "working" }] },
        { role: "user", content: [{ type: "text", text: "second" }] },
      ]),
    );

    const steer = commands.find((entry) => entry.method === "turn/steer");
    expect(steer?.params).toMatchObject({ expectedTurnId: "native-turn" });
    await first.stream.cancel();
    await second.stream.cancel();
  });

  test("a turn that ends with pending tool calls still settles the step", async () => {
    const { host } = fakeHost({ "turn/start": { turnId: "native-turn" } });
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const live = new LiveSession("oc", session);
    try {
      await session.startTurn({ turnId: "t1", message: { content: [{ type: "text", text: "hi" }] } });
      session.handleNotification({
        method: "turn/started",
        params: { turnId: "native-turn", sessionId: "native" },
      } satisfies MuseNotification);
      live.setActiveTurn(true, "t1");

      // The bridge registers the parked call before emitting it.
      live.pending.set("tc1", {
        id: "tc1",
        name: "lookup",
        input: { q: "x" },
        resolve: () => {},
        reject: () => {},
      });
      live.emitToolCall({ toolCallId: "tc1", toolName: "lookup", input: { q: "x" } });
      expect(live.pendingCount()).toBe(1);

      session.handleNotification({
        method: "turn/completed",
        params: { turnId: "native-turn", sessionId: "native", terminal: "failed" },
      } satisfies MuseNotification);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(live.pendingCount()).toBe(0);
      expect(live.hasActiveTurn).toBe(false);
      const step = fakeController();
      live.attach(step.controller);
      expect(step.parts.some((part) => part.type === "finish")).toBe(true);
      expect(step.closed()).toBe(true);
    } finally {
      await live.close();
    }
  });
});

describe("LiveSession cancellation", () => {
  test("cancelling a parked step rejects its call and interrupts the turn", async () => {
    const { host, commands } = fakeHost({
      "turn/start": { turnId: "native-turn" },
      "turn/interrupt": { status: "accepted" },
    });
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const live = new LiveSession("oc", session);
    try {
      await session.startTurn({ turnId: "t1", message: { content: [{ type: "text", text: "hi" }] } });
      session.handleNotification({
        method: "turn/started",
        params: { turnId: "native-turn", sessionId: "native" },
      } satisfies MuseNotification);
      live.setActiveTurn(true, "t1");

      let rejected: unknown;
      live.pending.set("tc1", {
        id: "tc1",
        name: "lookup",
        input: { q: "x" },
        resolve: () => {},
        reject: (error) => {
          rejected = error;
        },
      });

      await live.interrupt();

      expect(rejected).toBeInstanceOf(Error);
      expect(live.pendingCount()).toBe(0);
      expect(live.hasActiveTurn).toBe(false);
      expect(commands.some((entry) => entry.method === "turn/interrupt")).toBe(true);
    } finally {
      await live.close();
    }
  });
});

describe("MuseHarnessSession approvals", () => {
  test("a bridge session defaults to allowAll", async () => {
    const { host, commands } = fakeHost({
      "session/start": { session: { sessionId: "native", modelId: "muse-spark-1.3" } },
    });
    const session = await MuseHarnessSession.create(host, {
      sessionId: "oc-bridge",
      cwd: "/tmp",
      toolBridge: {
        listTools: () => [],
        callTool: async () => ({ content: [{ type: "text", text: "ok" }], isError: false }),
      },
    });
    try {
      expect(commands[0]?.params.approvalMode).toBe("allowAll");
    } finally {
      await session.close();
    }
  });
});

describe("reasoning effort", () => {
  test("a variant reaches turn/start and turn/steer", async () => {
    const { host, commands } = fakeHost({
      "turn/start": { turnId: "native-turn" },
      "turn/steer": { status: "accepted" },
    });
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const adapter = {
      listModels: async () => [],
      openSession: async () => session,
    } as unknown as MuseHarnessAdapter;
    const registry = new MuseSessionRegistry(adapter);
    const efforts = new Map([
      ["muse-spark-1.3", { variants: ["low", "medium", "high", "max"] }],
    ]);
    const model = new MuseLanguageModel("muse-spark-1.3", {}, registry, "muse", efforts);
    const request = (variant: string, messages: unknown[]) =>
      ({
        prompt: messages,
        tools: [BRIDGE_TOOL],
        headers: {
          [HEADERS.kind]: "primary",
          [HEADERS.session]: "oc",
          [HEADERS.directory]: "/tmp",
          [HEADERS.variant]: variant,
        },
      }) as unknown as LanguageModelV3CallOptions;

    const first = await model.doStream(
      request("high", [{ role: "user", content: [{ type: "text", text: "first" }] }]),
    );
    expect(commands.find((entry) => entry.method === "turn/start")?.params.reasoningEffort).toBe("high");

    const second = await model.doStream(
      request("off", [
        { role: "user", content: [{ type: "text", text: "first" }] },
        { role: "assistant", content: [{ type: "text", text: "working" }] },
        { role: "user", content: [{ type: "text", text: "second" }] },
      ]),
    );
    expect(commands.find((entry) => entry.method === "turn/steer")?.params.reasoningEffort).toBe("none");

    await first.stream.cancel();
    await second.stream.cancel();
  });

  test("default omits reasoningEffort when the catalog names one", async () => {
    const { host, commands } = fakeHost({ "turn/start": { turnId: "native-turn" } });
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const adapter = {
      listModels: async () => [],
      openSession: async () => session,
    } as unknown as MuseHarnessAdapter;
    const registry = new MuseSessionRegistry(adapter);
    const efforts = new Map([
      ["muse-spark-1.3", { variants: ["low", "medium", "high", "max"] }],
    ]);
    const model = new MuseLanguageModel("muse-spark-1.3", {}, registry, "muse", efforts);
    const request = {
      prompt: [{ role: "user", content: [{ type: "text", text: "first" }] }],
      tools: [BRIDGE_TOOL],
      headers: {
        [HEADERS.kind]: "primary",
        [HEADERS.session]: "oc",
        [HEADERS.directory]: "/tmp",
        [HEADERS.variant]: "default",
      },
    } as unknown as LanguageModelV3CallOptions;

    const stream = await model.doStream(request);
    const start = commands.find((entry) => entry.method === "turn/start");
    expect(start?.params).not.toHaveProperty("reasoningEffort");
    await stream.stream.cancel();
  });
});

describe("fork boundary", () => {
  test("chooses the newest completed turn fully inside the common prefix", async () => {
    const { host } = fakeHost();
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const live = new LiveSession("oc", session);
    try {
      live.setTranscriptFingerprints(["u1", "a1", "u2", "a2"]);
      live.promptLength = 4;
      live.recordTurnStart("turn-1", 0, 0);
      live.markTurnCompleted();
      live.recordTurnStart("turn-2", 2, 2);
      live.markTurnCompleted();

      expect(live.forkPoint(2)).toMatchObject({
        nativeTurnId: "turn-1",
        promptLength: 2,
        fingerprintLength: 2,
        turnIndex: 0,
      });
      expect(live.forkPoint(1)).toBeUndefined();
    } finally {
      await live.close();
    }
  });

  test("a diverged prompt forks only after a completed turn and seeds the suffix", async () => {
    const { host, commands } = fakeHost({
      "turn/start": { turnId: "native-turn" },
      "session/fork": { session: { sessionId: "child-native" } },
      "session/leave": { status: "accepted" },
      "session/resume": { session: { sessionId: "child-native", modelId: "muse-spark-1.3" } },
    });
    const source = MuseHarnessSession.fromNativeSession(
      host,
      { sessionId: "oc", cwd: "/tmp", model: "muse-spark-1.3" },
      "source-native",
      "muse-spark-1.3",
    );
    const adapter = {
      listModels: async () => [],
      openSession: async () => source,
    } as unknown as MuseHarnessAdapter;
    const registry = new MuseSessionRegistry(adapter);
    const model = new MuseLanguageModel("muse-spark-1.3", {}, registry, "muse");
    const request = (messages: unknown[]) =>
      ({
        prompt: messages,
        tools: [BRIDGE_TOOL],
        headers: {
          [HEADERS.kind]: "primary",
          [HEADERS.session]: "oc",
          [HEADERS.directory]: "/tmp",
        },
      }) as unknown as LanguageModelV3CallOptions;
    const complete = () =>
      source.handleNotification({
        method: "turn/completed",
        params: { turnId: "native-turn", sessionId: "source-native", terminal: "completed" },
      } as MuseNotification);

    const first = await model.doStream(
      request([{ role: "user", content: [{ type: "text", text: "one" }] }]),
    );
    complete();
    const second = await model.doStream(
      request([
        { role: "user", content: [{ type: "text", text: "one" }] },
        { role: "assistant", content: [{ type: "text", text: "a1" }] },
        { role: "user", content: [{ type: "text", text: "two" }] },
      ]),
    );
    complete();
    const third = await model.doStream(
      request([
        { role: "user", content: [{ type: "text", text: "one" }] },
        { role: "assistant", content: [{ type: "text", text: "a1" }] },
        { role: "user", content: [{ type: "text", text: "two changed" }] },
      ]),
    );

    const fork = commands.find((entry) => entry.method === "session/fork");
    expect(fork?.params).toMatchObject({
      sessionId: "source-native",
      cutPoint: { lastTurnId: "native-turn" },
    });
    const childStart = commands.filter((entry) => entry.method === "turn/start").at(-1);
    expect(childStart?.params.sessionId).toBe("child-native");
    expect(childStart?.params.input).toEqual([{ type: "text", text: "two changed" }]);

    await first.stream.cancel();
    await second.stream.cancel();
    await third.stream.cancel();
    await registry.closeAll();
  });

  test("forkAt leaves the source usable and resumes the child with its config", async () => {
    const { host, commands } = fakeHost({
      "session/fork": { session: { sessionId: "child-native" } },
      "session/leave": { status: "accepted" },
      "session/resume": {
        session: { sessionId: "child-native", modelId: "muse-spark-1.3", createdAt: "2026-11-19T00:00:00Z" },
      },
      "session/setApprovalMode": { status: "accepted" },
    });
    const source = MuseHarnessSession.fromNativeSession(
      host,
      {
        sessionId: "oc",
        cwd: "/tmp",
        model: "muse-spark-1.3",
        developerPrompt: "Be terse.",
        approvalMode: "allowAll",
      },
      "source-native",
      "muse-spark-1.3",
    );
    const child = await source.forkAt({ lastTurnId: "turn-1" });
    try {
      expect(commands.map((entry) => entry.method)).toEqual([
        "session/fork",
        "session/leave",
        "session/resume",
        "session/setApprovalMode",
      ]);
      expect(commands[0]?.params).toMatchObject({
        sessionId: "source-native",
        cutPoint: { lastTurnId: "turn-1" },
        excludeItems: true,
      });
      expect(commands[1]?.params).toMatchObject({ sessionId: "child-native", stop: true });
      expect(commands[2]?.params).toMatchObject({
        sessionId: "child-native",
        modelId: "muse-spark-1.3",
        config: { developerPrompt: "Be terse." },
      });
      expect(commands[3]?.params).toMatchObject({ sessionId: "child-native", mode: "allowAll" });
      expect(child.nativeSessionId).toBe("child-native");
      expect(source.nativeSessionId).toBe("source-native");
    } finally {
      await child.close();
      await source.close();
    }
  });
});

describe("developer prompt", () => {
  test("the first turn does not repeat a prompt Muse already holds", async () => {
    const { host, commands } = fakeHost({ "turn/start": { turnId: "native-turn" } });
    const session = MuseHarnessSession.fromNativeSession(
      host,
      { sessionId: "oc", cwd: "/tmp", model: "muse-spark-1.3" },
      "native",
      "muse-spark-1.3",
    );
    const opened: Array<Record<string, unknown>> = [];
    const adapter = {
      listModels: async () => [],
      openSession: async (input: Record<string, unknown>) => {
        opened.push(input);
        return session;
      },
    } as unknown as MuseHarnessAdapter;
    const registry = new MuseSessionRegistry(adapter);
    const model = new MuseLanguageModel("muse-spark-1.3", {}, registry, "muse");
    const request = {
      prompt: [{ role: "user", content: [{ type: "text", text: "first" }] }],
      tools: [BRIDGE_TOOL],
      providerOptions: { muse: { museAgent: "Be terse." } },
      headers: {
        [HEADERS.kind]: "primary",
        [HEADERS.session]: "oc",
        [HEADERS.directory]: "/tmp",
      },
    } as unknown as LanguageModelV3CallOptions;

    const stream = await model.doStream(request);
    expect(opened[0]?.developerPrompt).toBe("Be terse.");
    const start = commands.find((entry) => entry.method === "turn/start");
    expect(start?.params.input).toEqual([{ type: "text", text: "first" }]);
    await stream.stream.cancel();
  });

  test("a changed prompt travels in the next user turn", async () => {
    const { host } = fakeHost({ "turn/start": { turnId: "native-turn" } });
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const live = new LiveSession("oc", session, { current: [] }, "Be terse.");
    try {
      expect(live.prependPreamble("Be terse.")).toBe(false);
      expect(live.prependPreamble("Be thorough.")).toBe(true);
      expect(live.prependPreamble("Be thorough.")).toBe(false);
    } finally {
      await live.close();
    }
  });
});

describe("empty bridge preflight", () => {
  test("a primary request with no tools fails before opening a session", async () => {
    let opened = false;
    const adapter = {
      listModels: async () => [],
      openSession: async () => {
        opened = true;
        return MuseHarnessSession.fromNativeSession(
          fakeHost().host,
          { sessionId: "oc", cwd: "/tmp" },
          "native",
        );
      },
    } as unknown as MuseHarnessAdapter;
    const registry = new MuseSessionRegistry(adapter);
    const model = new MuseLanguageModel("muse-spark-1.3", {}, registry, "muse");
    const request = {
      prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      tools: [],
      headers: {
        [HEADERS.kind]: "primary",
        [HEADERS.session]: "oc",
        [HEADERS.directory]: "/tmp",
      },
    } as unknown as LanguageModelV3CallOptions;

    await expect(model.doStream(request)).rejects.toThrow(
      "The Muse bridge has no tools; enable at least one tool or run without the bridge.",
    );
    expect(opened).toBe(false);
  });
});

describe("transcript reconciliation", () => {
  test("a compaction digest recycles the native session and reseeds", async () => {
    const opened: Array<Record<string, unknown>> = [];
    const hosts: Array<{ commands: RecordedCommand[] }> = [];
    let counter = 0;
    const adapter = {
      listModels: async () => [],
      openSession: async (input: Record<string, unknown>) => {
        opened.push(input);
        const fake = fakeHost({ "turn/start": { turnId: `native-turn-${counter}` } });
        hosts.push({ commands: fake.commands });
        return MuseHarnessSession.fromNativeSession(
          fake.host,
          { sessionId: input.sessionId as string, cwd: input.cwd as string },
          `native-${counter++}`,
        );
      },
    } as unknown as MuseHarnessAdapter;
    const stored = new Map<string, string>();
    const registry = new MuseSessionRegistry(adapter, {
      get: async (key) => stored.get(key),
      set: async (key, value) => {
        stored.set(key, value);
      },
    });
    const model = new MuseLanguageModel("muse-spark-1.3", {}, registry, "muse");
    const request = (messages: unknown[]) =>
      ({
        prompt: messages,
        tools: [BRIDGE_TOOL],
        headers: {
          [HEADERS.kind]: "primary",
          [HEADERS.session]: "oc",
          [HEADERS.directory]: "/tmp",
        },
      }) as unknown as LanguageModelV3CallOptions;

    const first = await model.doStream(request([{ role: "user", content: "old" }]));
    const digest = "Conversation digest (opencode-owned history):\n\nUser: old";
    await registry.recordCompaction("oc", fingerprintCompactionOutput(digest));
    const second = await model.doStream(request([{ role: "user", content: digest }]));

    expect(opened).toHaveLength(2);
    const start = hosts[1]?.commands.find((entry) => entry.method === "turn/start");
    expect(start?.params.input).toEqual([{ type: "text", text: digest }]);
    expect(JSON.parse(stored.get("oc:transcript") ?? "[]")).toEqual([
      expect.any(String),
    ]);

    await first.stream.cancel();
    await second.stream.cancel();
    await registry.closeAll();
  });

  test("fingerprints survive a registry restart", async () => {
    const stored = new Map<string, string>();
    const adapter = {
      listModels: async () => [],
      openSession: async (input: Record<string, unknown>) =>
        MuseHarnessSession.fromNativeSession(
          fakeHost().host,
          { sessionId: input.sessionId as string, cwd: input.cwd as string },
          "native",
        ),
    } as unknown as MuseHarnessAdapter;
    const store = {
      get: async (key: string) => stored.get(key),
      set: async (key: string, value: string) => {
        stored.set(key, value);
      },
    };

    const first = new MuseSessionRegistry(adapter, store);
    await first.get("oc", "/tmp");
    await first.rememberTranscript("oc", ["a", "b"]);
    await first.closeAll();

    const second = new MuseSessionRegistry(adapter, store);
    const reopened = await second.get("oc", "/tmp");
    expect(reopened.transcriptFingerprints).toEqual(["a", "b"]);
    await second.closeAll();
  });
});

describe("MuseSessionRegistry tools", () => {
  test("each session's bridge serves only that session's tools", async () => {
    const opened: Array<{ sessionId: string; list: () => ReadonlyArray<{ name: string }> }> = [];
    const adapter = {
      listModels: async () => [],
      openSession: async (input: Record<string, unknown>) => {
        const bridge = input.toolBridge as {
          listTools(): ReadonlyArray<{ name: string }>;
        };
        opened.push({ sessionId: input.sessionId as string, list: () => bridge.listTools() });
        return MuseHarnessSession.fromNativeSession(
          fakeHost().host,
          { sessionId: input.sessionId as string, cwd: input.cwd as string },
          `native-${input.sessionId as string}`,
        );
      },
    } as unknown as MuseHarnessAdapter;
    const registry = new MuseSessionRegistry(adapter);
    const tool = (name: string) => ({ name, description: name, inputSchema: { type: "object" } });

    try {
      await registry.get("a", "/tmp", undefined, undefined, [tool("a-tool")]);
      await registry.get("b", "/tmp", undefined, undefined, [tool("b-tool")]);

      const [a, b] = opened;
      if (!a || !b) throw new Error("expected two sessions");
      expect(a.list().map((entry) => entry.name)).toEqual(["a-tool"]);
      expect(b.list().map((entry) => entry.name)).toEqual(["b-tool"]);

      // A later step for one session replaces its list without touching the
      // other session's.
      await registry.get("a", "/tmp", undefined, undefined, [tool("a-tool-2")]);
      expect(a.list().map((entry) => entry.name)).toEqual(["a-tool-2"]);
      expect(b.list().map((entry) => entry.name)).toEqual(["b-tool"]);

      // A utility request on the same session omits tools and leaves the list
      // the running step is using untouched.
      await registry.get("a", "/tmp");
      expect(a.list().map((entry) => entry.name)).toEqual(["a-tool-2"]);
    } finally {
      await registry.closeAll();
    }
  });
});

describe("toToolResult", () => {
  test("error-text keeps its message instead of stringifying the envelope", () => {
    const result = toToolResult({
      toolCallId: "tc1",
      toolName: "bash",
      output: { type: "error-text", value: "command failed" },
    });
    expect(result.content).toEqual([{ type: "text", text: "command failed" }]);
    expect(result.isError).toBe(true);
  });

  test("execution-denied reports the reason", () => {
    const result = toToolResult({
      toolCallId: "tc1",
      toolName: "bash",
      output: { type: "execution-denied", reason: "user declined" },
    });
    expect(result.content).toEqual([{ type: "text", text: "user declined" }]);
    expect(result.isError).toBe(true);
  });

  test("text and json outputs pass through", () => {
    expect(
      toToolResult({ toolCallId: "tc1", toolName: "t", output: { type: "text", value: "ok" } }).content,
    ).toEqual([{ type: "text", text: "ok" }]);
    expect(
      toToolResult({ toolCallId: "tc1", toolName: "t", output: { type: "json", value: { a: 1 } } }).content,
    ).toEqual([{ type: "text", text: '{"a":1}' }]);
  });
});
