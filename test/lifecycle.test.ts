import { describe, expect, test } from "bun:test";
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessEvent } from "../src/contract/index.js";
import { MuseHarnessAdapter } from "../src/adapter.js";
import { fingerprintCompactionOutput } from "../src/fingerprint.js";
import type { MuseNotification } from "../src/host.js";
import { HEADERS, MuseLanguageModel, toToolResult } from "../src/language-model.js";
import { HarnessError } from "../src/contract/index.js";
import { MuseHarnessSession, type SessionHost } from "../src/session.js";
import { LiveSession, MuseSessionRegistry, storeKey } from "../src/session-registry.js";

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

/**
 * A host that records commands and answers from a fixed method -> result map.
 * Pass `grants` to model a handshake; omit it to leave the accessor absent,
 * which is how a replay host or a double without a handshake looks.
 */
function fakeHost(
  results: Record<string, Record<string, unknown>> = {},
  grants?: readonly string[],
): FakeHost {
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
    ...(grants === undefined ? {} : { grantedCapabilities: () => grants }),
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

/** Finish the current fake native turn so the next request starts a new one. */
async function finishNativeTurn(registry: MuseSessionRegistry, sessionID = "oc"): Promise<void> {
  const live = registry.peek(sessionID);
  const muse = live?.muse as MuseHarnessSession | undefined;
  const turnId = live?.activeTurnId;
  if (!muse || !turnId) return;
  muse.handleNotification({
    method: "turn/completed",
    params: { turnId, sessionId: muse.nativeSessionId, terminal: "completed" },
  } as never);
  await new Promise((resolve) => setTimeout(resolve, 5));
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
    const live = await registry.get("oc-fork", "/tmp", "muse-spark-1.3");
    try {
      expect(opened[0]).not.toHaveProperty("resumeSessionId");
      expect(opened[0]).not.toHaveProperty("forkSessionId");
      expect(opened[0]).toMatchObject({ model: "muse-spark-1.3" });
      // No stored native id: this session is empty and its first turn has to
      // replay the parent's history, tool results included.
      expect(live.nativeHasHistory).toBe(false);
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

  test("a refused resume reports a fallback instead of swallowing it", async () => {
    const methods: string[] = [];
    const host: SessionHost = {
      connection: {
        mintCommandId: () => `cmd-${methods.length}`,
        command: async (method: string) => {
          methods.push(method);
          if (method === "session/resume") throw new Error("session is gone");
          return { session: { sessionId: "fresh-native", modelId: "muse-spark-1.3" } };
        },
      },
      registerSink: () => {},
      unregisterSink: () => {},
    };
    const session = await MuseHarnessSession.create(host, {
      sessionId: "oc-fallback",
      cwd: "/tmp",
      resumeSessionId: "pruned-native",
    });
    expect(methods).toEqual(["session/resume", "session/start"]);
    expect(session.resumeOutcome).toBe("resume_fallback");
    expect(session.nativeSessionId).toBe("fresh-native");
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

  test("two concurrent gets for one opencode id open one native session", async () => {
    // Both callers used to pass the `sessions.get` check before either set, so
    // one native session was opened and immediately replaced by the other.
    let opens = 0;
    const adapter = {
      listModels: async () => [],
      openSession: async (input: Record<string, unknown>) => {
        opens += 1;
        const mine = opens;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return MuseHarnessSession.fromNativeSession(
          fakeHost().host,
          { sessionId: input.sessionId as string, cwd: input.cwd as string },
          `native-${mine}`,
        );
      },
    } as unknown as MuseHarnessAdapter;
    const registry = new MuseSessionRegistry(adapter);
    try {
      const [a, b] = await Promise.all([registry.get("oc", "/tmp"), registry.get("oc", "/tmp")]);
      expect(opens).toBe(1);
      expect(a).toBe(b);
    } finally {
      await registry.closeAll();
    }
  });

  test("a close during an in-flight get leaves no live session behind", async () => {
    let release!: (session: MuseHarnessSession) => void;
    const gate = new Promise<MuseHarnessSession>((resolve) => {
      release = resolve;
    });
    const adapter = {
      listModels: async () => [],
      openSession: async () => gate,
    } as unknown as MuseHarnessAdapter;
    const registry = new MuseSessionRegistry(adapter);
    const opened = registry.get("oc", "/tmp");
    // Let the open reach the adapter before the close is issued.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const closed = registry.close("oc");
    release(
      MuseHarnessSession.fromNativeSession(fakeHost().host, { sessionId: "oc", cwd: "/tmp" }, "native"),
    );
    expect(await opened).toBeDefined();
    await closed;
    expect(registry.peek("oc")).toBeUndefined();
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

  test("a turn ack without an id is reconciled when the host names the turn", async () => {
    const { host, commands } = fakeHost();
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const events = await drive(session, async () => {
      await session.startTurn({
        turnId: "t1",
        message: { content: [{ type: "text", text: "hi" }] },
      });
      session.handleNotification({
        method: "turn/started",
        params: { turnId: "native-real", sessionId: "native" },
      } satisfies MuseNotification);
      await session.steerTurn({
        turnId: "t1",
        message: { content: [{ type: "text", text: "more" }] },
      });
    });
    const started = events.filter((event) => event.type === "turn.started");
    expect(started).toHaveLength(1);
    expect(started[0]?.type === "turn.started" ? started[0].turn.id : undefined).toBe("t1");
    expect(started[0]?.type === "turn.started" ? started[0].turn.nativeRef.id : undefined).toBe(
      "native-real",
    );
    const steer = commands.find((entry) => entry.method === "turn/steer");
    expect(steer?.params.expectedTurnId).toBe("native-real");
  });

  test("a turn/started before the ack binds by command id", async () => {
    // The host can name the turn before it answers `turn/start`. The event
    // carries the submitting command id, so the turn is bound without assuming
    // the native id equals the command id, and no second turn is minted.
    const commands: RecordedCommand[] = [];
    let counter = 0;
    let release: ((result: Record<string, unknown>) => void) | undefined;
    const host: SessionHost = {
      connection: {
        mintCommandId: () => `cmd-${counter++}`,
        command: (method: string, params: Record<string, unknown>) => {
          commands.push({ method, params });
          return method === "turn/start"
            ? new Promise<Record<string, unknown>>((resolve) => {
                release = resolve;
              })
            : Promise.resolve({});
        },
      },
      registerSink: () => {},
      unregisterSink: () => {},
    };
    const session = MuseHarnessSession.fromNativeSession(
      host,
      { sessionId: "oc", cwd: "/tmp" },
      "native",
    );
    const events = await drive(session, async () => {
      const pending = session.startTurn({
        turnId: "t1",
        message: { content: [{ type: "text", text: "hi" }] },
      });
      session.handleNotification({
        method: "turn/started",
        params: { turnId: "native-real", commandId: "cmd-0", sessionId: "native" },
      } satisfies MuseNotification);
      release?.({ turnId: "native-real" });
      const turn = await pending;
      expect(turn.nativeRef.id).toBe("native-real");
      await session.steerTurn({
        turnId: "t1",
        message: { content: [{ type: "text", text: "more" }] },
      });
    });
    const started = events.filter((event) => event.type === "turn.started");
    expect(started).toHaveLength(1);
    expect(started[0]?.type === "turn.started" ? started[0].turn.id : undefined).toBe("t1");
    const steer = commands.find((entry) => entry.method === "turn/steer");
    expect(steer?.params.expectedTurnId).toBe("native-real");
  });

  test("a second turn is refused while one is running", async () => {
    const { host, commands } = fakeHost();
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    await drive(session, async () => {
      await session.startTurn({
        turnId: "t1",
        message: { content: [{ type: "text", text: "hi" }] },
      });
      await expect(
        session.startTurn({ turnId: "t2", message: { content: [{ type: "text", text: "again" }] } }),
      ).rejects.toThrow(/still running/);
      expect(commands.filter((entry) => entry.method === "turn/start")).toHaveLength(1);
      // The host's own id here is the command id, because the ack omitted one.
      session.handleNotification({
        method: "turn/completed",
        params: { turnId: "cmd-0", sessionId: "native", terminal: "completed" },
      } satisfies MuseNotification);
      const next = await session.startTurn({
        turnId: "t2",
        message: { content: [{ type: "text", text: "again" }] },
      });
      expect(next.id).toBe("t2");
    });
  });

  test("a second submit is refused while the first is still in flight", async () => {
    // The guard used to run before an await with no turn reserved, so both
    // callers passed it and sent a command; Muse then absorbed the second
    // submit into the first turn and the host carried two turns for one native
    // id.
    const commands: RecordedCommand[] = [];
    let release: ((result: Record<string, unknown>) => void) | undefined;
    const host: SessionHost = {
      connection: {
        mintCommandId: () => "cmd-0",
        command: (method: string, params: Record<string, unknown>) => {
          commands.push({ method, params });
          return method === "turn/start"
            ? new Promise<Record<string, unknown>>((resolve) => {
                release = resolve;
              })
            : Promise.resolve({});
        },
      },
      registerSink: () => {},
      unregisterSink: () => {},
    };
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    await drive(session, async () => {
      const first = session.startTurn({
        turnId: "t1",
        message: { content: [{ type: "text", text: "one" }] },
      });
      // Observe the refusal immediately: it resolves in this same tick, before
      // the ack, and an unobserved rejection fails the run.
      const second = session.startTurn({
        turnId: "t2",
        message: { content: [{ type: "text", text: "two" }] },
      }).then(
        () => null,
        (error: { code?: string }) => error,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      release?.({ turnId: "native-1" });
      const one = await first;
      const refused = await second;
      expect(one.id).toBe("t1");
      expect(refused?.code).toBe("unsupported");
      // Only the admitted turn reached the wire.
      const starts = commands.filter((entry) => entry.method === "turn/start");
      expect(starts).toHaveLength(1);
      expect(starts[0]?.params.input).toEqual([{ type: "text", text: "one" }]);
    });
  });

  test("an absorbed ack is refused instead of remapped", async () => {
    // `disposition: "steered"` means Muse folded the submit into the turn that
    // was already running. Remapping its id onto this host turn would make two
    // host turns own one native turn, so the start is refused and the
    // reservation is dropped.
    const commands: RecordedCommand[] = [];
    const acks: Record<string, unknown>[] = [
      { disposition: "steered", startedNewTurn: false, turnId: "native-1" },
      { disposition: "started", startedNewTurn: true, turnId: "native-2" },
    ];
    let sent = 0;
    const host: SessionHost = {
      connection: {
        mintCommandId: () => `cmd-${sent}`,
        command: async (method: string, params: Record<string, unknown>) => {
          commands.push({ method, params });
          return method === "turn/start" ? (acks[sent++] ?? {}) : {};
        },
      },
      registerSink: () => {},
      unregisterSink: () => {},
    };
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const events = await drive(session, async () => {
      const refused = await session.startTurn({
        turnId: "t1",
        message: { content: [{ type: "text", text: "one" }] },
      }).then(
        () => null,
        (error: { code?: string }) => error,
      );
      expect(refused?.code).toBe("unsupported");
      expect(refused?.message).toMatch(/absorbed this input into turn native-1/);
      expect(refused?.message).toMatch(/steer instead/);

      // The dropped reservation does not block the next turn.
      const next = await session.startTurn({
        turnId: "t2",
        message: { content: [{ type: "text", text: "two" }] },
      });
      expect(next.id).toBe("t2");
      expect(next.nativeRef.id).toBe("native-2");

      // A completion for the absorbed native turn must not settle t2.
      session.handleNotification({
        method: "turn/completed",
        params: { turnId: "native-1", sessionId: "native", terminal: "completed" },
      } satisfies MuseNotification);
    });
    const starts = commands.filter((entry) => entry.method === "turn/start");
    expect(starts).toHaveLength(2);
    expect(starts[1]?.params.input).toEqual([{ type: "text", text: "two" }]);
    expect(events.filter((event) => event.type === "turn.terminal")).toHaveLength(0);
  });

  test("a queued ack adopts the queued turn and settles when it launches", async () => {
    // Measured on Muse 1.4.25: after `turn/completed` the host keeps the old
    // turn active for a moment, so a submit in that window answers `queued`.
    // The id it names is the turn that carries the input, launched 0-50 ms
    // later. Adopting it keeps the input and the host turn together; refusing
    // would leave text the host runs with no host turn reading it.
    const commands: RecordedCommand[] = [];
    const acks: Record<string, unknown>[] = [
      { disposition: "queued", startedNewTurn: false, turnId: "native-1" },
      { disposition: "started", startedNewTurn: true, turnId: "native-2" },
    ];
    let sent = 0;
    const host: SessionHost = {
      connection: {
        mintCommandId: () => `cmd-${sent}`,
        command: async (method: string, params: Record<string, unknown>) => {
          commands.push({ method, params });
          return method === "turn/start" ? (acks[sent++] ?? {}) : {};
        },
      },
      registerSink: () => {},
      unregisterSink: () => {},
    };
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const events = await drive(session, async () => {
      const queued = await session.startTurn({
        turnId: "t1",
        message: { content: [{ type: "text", text: "one" }] },
      });
      expect(queued.id).toBe("t1");
      expect(queued.nativeRef.id).toBe("native-1");

      // The queued turn launches under the id the ack named.
      session.handleNotification({
        method: "turn/started",
        params: { turnId: "native-1", sessionId: "native" },
      } satisfies MuseNotification);
      session.handleNotification({
        method: "turn/completed",
        params: { turnId: "native-1", sessionId: "native", terminal: "completed" },
      } satisfies MuseNotification);

      const next = await session.startTurn({
        turnId: "t2",
        message: { content: [{ type: "text", text: "two" }] },
      });
      expect(next.nativeRef.id).toBe("native-2");
    });
    const started = events.filter((event) => event.type === "turn.started");
    expect(started).toHaveLength(1);
    expect(started[0]?.type === "turn.started" ? started[0].turn.id : undefined).toBe("t1");
    const terminal = events.filter((event) => event.type === "turn.terminal");
    expect(terminal).toHaveLength(1);
    expect(terminal[0]?.type === "turn.terminal" ? terminal[0].turn.id : undefined).toBe("t1");
    expect(commands.filter((entry) => entry.method === "turn/start")).toHaveLength(2);
  });

  test("a completed message whose start was missed emits the turn and both frames", async () => {
    // The start fell in a view gap (or before the subscription). The completion
    // must not be dropped, and the contract still wants turn.started first and
    // message.started before message.completed.
    const { host } = fakeHost();
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const events = await drive(session, async () => {
      await session.startTurn({
        turnId: "t1",
        message: { content: [{ type: "text", text: "hi" }] },
      });
      session.handleNotification({
        method: "item/completed",
        params: {
          sessionId: "native",
          item: {
            itemId: "m1",
            kind: "agentMessage",
            turnId: "native-real",
            status: "completed",
            text: "the answer",
          },
        },
      } satisfies MuseNotification);
    });
    expect(events.filter((event) => event.type !== "session.updated").map((event) => event.type)).toEqual([
      "turn.started",
      "message.started",
      "message.completed",
    ]);
    const completed = events[2];
    expect(completed?.type === "message.completed" ? completed.message.turnId : undefined).toBe(
      "t1",
    );
    expect(
      completed?.type === "message.completed" ? completed.message.content : undefined,
    ).toEqual([{ type: "text", text: "the answer" }]);
  });

  test("a completed tool call whose start was missed is normalized and kept", async () => {
    const { host } = fakeHost();
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const events = await drive(session, async () => {
      await session.startTurn({
        turnId: "t1",
        message: { content: [{ type: "text", text: "hi" }] },
      });
      session.handleNotification({
        method: "item/completed",
        params: {
          sessionId: "native",
          item: {
            itemId: "tool-1",
            kind: "toolCall",
            turnId: "native-real",
            status: "completed",
            tool: "mcp__opencode__lookup",
            args: '{"query":"x"}',
            visibleOutput: "found",
          },
        },
      } satisfies MuseNotification);
    });
    expect(events.filter((event) => event.type !== "session.updated").map((event) => event.type)).toEqual([
      "turn.started",
      "tool.started",
      "tool.completed",
    ]);
    const completed = events[2];
    expect(completed?.type === "tool.completed" ? completed.item.name : undefined).toBe("lookup");
    expect(completed?.type === "tool.completed" ? completed.item.input : undefined).toEqual({
      query: "x",
    });
    expect(completed?.type === "tool.completed" ? completed.item.output : undefined).toBe("found");
  });

  test("a seen start is not re-emitted when its completion arrives", async () => {
    const { host } = fakeHost();
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const events = await drive(session, async () => {
      await session.startTurn({
        turnId: "t1",
        message: { content: [{ type: "text", text: "hi" }] },
      });
      session.handleNotification({
        method: "item/started",
        params: {
          sessionId: "native",
          item: { itemId: "m1", kind: "agentMessage", turnId: "native-real", status: "inProgress" },
        },
      } satisfies MuseNotification);
      session.handleNotification({
        method: "item/completed",
        params: {
          sessionId: "native",
          item: {
            itemId: "m1",
            kind: "agentMessage",
            turnId: "native-real",
            status: "completed",
            text: "the answer",
          },
        },
      } satisfies MuseNotification);
    });
    expect(events.filter((event) => event.type === "message.started")).toHaveLength(1);
    expect(events.filter((event) => event.type === "message.completed")).toHaveLength(1);
    expect(events.filter((event) => event.type === "turn.started")).toHaveLength(1);
  });

  test("an item before the ack starts the turn exactly once", async () => {
    // A fresh turn's id equals its submitting commandId, and `startTurn`
    // registers that id before sending, so the item resolves to the host turn
    // and promotes the reservation; the late ack must not mint a second one.
    const commands: RecordedCommand[] = [];
    let release: ((result: Record<string, unknown>) => void) | undefined;
    const host: SessionHost = {
      connection: {
        mintCommandId: () => "cmd-0",
        command: (method: string, params: Record<string, unknown>) => {
          commands.push({ method, params });
          return method === "turn/start"
            ? new Promise<Record<string, unknown>>((resolve) => {
                release = resolve;
              })
            : Promise.resolve({});
        },
      },
      registerSink: () => {},
      unregisterSink: () => {},
    };
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    const events = await drive(session, async () => {
      const pending = session.startTurn({
        turnId: "t1",
        message: { content: [{ type: "text", text: "hi" }] },
      });
      session.handleNotification({
        method: "item/started",
        params: {
          sessionId: "native",
          item: { itemId: "m1", kind: "agentMessage", turnId: "cmd-0", status: "inProgress" },
        },
      } satisfies MuseNotification);
      release?.({ turnId: "cmd-0" });
      const turn = await pending;
      expect(turn.id).toBe("t1");
      expect(turn.nativeRef.id).toBe("cmd-0");
    });
    const started = events.filter((event) => event.type === "turn.started");
    expect(started).toHaveLength(1);
    expect(started[0]?.type === "turn.started" ? started[0].turn.id : undefined).toBe("t1");
    expect(commands.filter((entry) => entry.method === "turn/start")).toHaveLength(1);
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
  test("approval options carry the decision and feedback capability", async () => {
    const { host, commands } = fakeHost({ "approval/decide": { status: "accepted" } });
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    await drive(session, async () => {
      session.handleNotification({
        method: "approval/requested",
        params: {
          approvalId: "ap2",
          sessionId: "native",
          turnId: "t1",
          availableChoices: [
            { choiceId: "allow", label: "Allow", decision: "approved", acceptsFeedback: false },
            { choiceId: "deny", label: "Deny", decision: "denied", acceptsFeedback: true },
          ],
        },
      } satisfies MuseNotification);
      const request = (await session.getSnapshot()).requests.find((entry) => entry.id === "ap2");
      expect(request?.options).toEqual([
        { id: "allow", label: "Allow", decision: "approved" },
        { id: "deny", label: "Deny", decision: "denied", acceptsFeedback: true },
      ]);
      await session.respondToRequest({
        requestId: "ap2",
        optionId: "deny",
        feedback: "not this file",
      });
    });
    const decide = commands.find((entry) => entry.method === "approval/decide");
    expect(decide?.params.feedback).toBe("not this file");
  });

  test("feedback is refused on a choice that does not accept it", async () => {
    const { host, commands } = fakeHost({ "approval/decide": { status: "accepted" } });
    const session = MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
    await drive(session, async () => {
      session.handleNotification({
        method: "approval/requested",
        params: {
          approvalId: "ap3",
          sessionId: "native",
          turnId: "t1",
          availableChoices: [{ choiceId: "allow", label: "Allow", decision: "approved" }],
        },
      } satisfies MuseNotification);
      await expect(
        session.respondToRequest({ requestId: "ap3", optionId: "allow", feedback: "no" }),
      ).rejects.toThrow(/does not accept feedback/);
    });
    expect(commands.some((entry) => entry.method === "approval/decide")).toBe(false);
  });

  test("a bridge session refuses an approval mode that would refuse the bridge", async () => {
    const { host, commands } = fakeHost({}, ["sessionMcp"]);
    await expect(
      MuseHarnessSession.create(host, {
        sessionId: "oc-bridge",
        cwd: "/tmp",
        approvalMode: "onRequest",
        toolBridge: {
          listTools: () => [],
          callTool: async () => ({ content: [{ type: "text", text: "ok" }], isError: false }),
        },
      }),
    ).rejects.toThrow(/no path that presents a Muse approval/);
    expect(commands).toHaveLength(0);
  });

  test("a bridge session without the sessionMcp grant fails before session/start", async () => {
    const { host, commands } = fakeHost({}, []);
    await expect(
      MuseHarnessSession.create(host, {
        sessionId: "oc-no-mcp",
        cwd: "/tmp",
        toolBridge: {
          listTools: () => [],
          callTool: async () => ({ content: [] }),
        },
      }),
    ).rejects.toThrow(/sessionMcp/);
    expect(commands).toHaveLength(0);
  });

  test("a bridge session with the sessionMcp grant starts", async () => {
    const { host, commands } = fakeHost(
      { "session/start": { session: { sessionId: "native", modelId: "muse-spark-1.3" } } },
      ["sessionMcp"],
    );
    const session = await MuseHarnessSession.create(host, {
      sessionId: "oc-mcp",
      cwd: "/tmp",
      toolBridge: {
        listTools: () => [],
        callTool: async () => ({ content: [] }),
      },
    });
    try {
      expect(commands[0]?.method).toBe("session/start");
      expect(commands[0]?.params).toHaveProperty("config");
    } finally {
      await session.close();
    }
  });

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
    // A verified probe is what lets the preamble be skipped; unknown would
    // send it once by design.
    registry.setPromptDelivery("pass");
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

  test("the prompt is read from the key it was written under, not a fixed name", async () => {
    const { host } = fakeHost({ "turn/start": { turnId: "native-turn" } });
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
    registry.setPromptDelivery("pass");
    // Production passes the model's canonical provider, not PROVIDER_ID.
    const model = new MuseLanguageModel("muse-spark-1.3", {}, registry, "meta");
    const request = {
      prompt: [{ role: "user", content: [{ type: "text", text: "first" }] }],
      tools: [BRIDGE_TOOL],
      providerOptions: { meta: { museAgent: "Be terse." } },
      headers: {
        [HEADERS.kind]: "primary",
        [HEADERS.session]: "oc",
        [HEADERS.directory]: "/tmp",
      },
    } as unknown as LanguageModelV3CallOptions;

    const stream = await model.doStream(request);
    expect(opened[0]?.developerPrompt).toBe("Be terse.");
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

describe("the step cap", () => {
  test("a trailing assistant instruction starts a turn instead of returning nothing", async () => {
    const { host, commands } = fakeHost({ "turn/start": { turnId: "native-turn" } });
    const session = MuseHarnessSession.fromNativeSession(
      host,
      { sessionId: "oc", cwd: "/tmp" },
      "native",
    );
    const adapter = {
      listModels: async () => [],
      openSession: async () => session,
    } as unknown as MuseHarnessAdapter;
    const registry = new MuseSessionRegistry(adapter);
    registry.setPromptDelivery("pass");
    const model = new MuseLanguageModel("muse-spark-1.3", {}, registry, "muse");
    const request = {
      prompt: [
        { role: "system", content: "sys" },
        { role: "user", content: [{ type: "text", text: "hi" }] },
        {
          role: "assistant",
          content: [{ type: "text", text: "CRITICAL - MAXIMUM STEPS REACHED. Respond with text only." }],
        },
      ],
      tools: [BRIDGE_TOOL],
      headers: {
        [HEADERS.kind]: "primary",
        [HEADERS.session]: "oc",
        [HEADERS.directory]: "/tmp",
      },
    } as unknown as LanguageModelV3CallOptions;

    const stream = await model.doStream(request);
    const start = commands.find((entry) => entry.method === "turn/start");
    expect(start).toBeDefined();
    expect(JSON.stringify(start?.params)).toContain("MAXIMUM STEPS REACHED");
    await stream.stream.cancel();
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
    expect(JSON.parse(stored.get(storeKey("oc", ":transcript")) ?? "[]")).toEqual([
      expect.any(String),
    ]);

    await first.stream.cancel();
    await second.stream.cancel();
    await registry.closeAll();
  });

  test("a hook-supplied digest is a checkpoint, but a later rewind still reseeds", async () => {
    const previousFlag = process.env.MUSE_NATIVE_HISTORY;
    process.env.MUSE_NATIVE_HISTORY = "1";
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

    let first: Awaited<ReturnType<typeof model.doStream>> | undefined;
    let second: Awaited<ReturnType<typeof model.doStream>> | undefined;
    let third: Awaited<ReturnType<typeof model.doStream>> | undefined;
    try {
      first = await model.doStream(request([{ role: "user", content: "old" }]));
      // Finish the first turn so the next request is a new turn, not a steer.
      const native = registry.peek("oc")?.muse as MuseHarnessSession | undefined;
      native?.handleNotification({
        method: "turn/completed",
        params: { turnId: "native-turn-0", sessionId: "native-0", terminal: "completed" },
      } as never);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const digest = "Conversation digest (opencode-owned history):\n\nUser: old";
      const digestFingerprint = fingerprintCompactionOutput(digest);
      await registry.recordCompaction("oc", digestFingerprint);
      registry.markNativeCompaction("oc", { fingerprint: digestFingerprint, windowMessages: 1 });

      // The next primary request after the hook keeps the native session; only
      // the new user message is sent.
      second = await model.doStream(
        request([
          { role: "user", content: digest },
          { role: "user", content: "next" },
        ]),
      );
      expect(opened).toHaveLength(1);
      const afterCompaction = hosts[0]?.commands.filter((entry) => entry.method === "turn/start") ?? [];
      expect(afterCompaction.at(-1)?.params.input).toEqual([{ type: "text", text: "next" }]);

      // A rewind also contains the digest, but it is not the checkpoint the
      // hook supplied, so the native session must be replaced.
      third = await model.doStream(request([{ role: "user", content: digest }]));
      expect(opened).toHaveLength(2);
      const afterRewind = hosts[1]?.commands.find((entry) => entry.method === "turn/start");
      expect(afterRewind?.params.input).toEqual([{ type: "text", text: digest }]);
    } finally {
      if (previousFlag === undefined) delete process.env.MUSE_NATIVE_HISTORY;
      else process.env.MUSE_NATIVE_HISTORY = previousFlag;
      await first?.stream.cancel();
      await second?.stream.cancel();
      await third?.stream.cancel();
      await registry.closeAll();
    }
  });

  test("a missing native window is named and reseeded, not mistaken for a checkpoint", async () => {
    const previousFlag = process.env.MUSE_NATIVE_HISTORY;
    process.env.MUSE_NATIVE_HISTORY = "1";
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

    let first: Awaited<ReturnType<typeof model.doStream>> | undefined;
    let second: Awaited<ReturnType<typeof model.doStream>> | undefined;
    try {
      first = await model.doStream(request([{ role: "user", content: "old" }]));
      await finishNativeTurn(registry);

      const digest = "Conversation digest (opencode-owned history):\n\nUser: old";
      const fingerprint = fingerprintCompactionOutput(digest);
      await registry.recordCompaction("oc", fingerprint);
      registry.markNativeCompaction("oc", { fingerprint, windowMessages: 1 });

      // The marker is present but its digest is not in this rewritten prompt.
      second = await model.doStream(request([{ role: "user", content: "rewritten" }]));

      expect(opened).toHaveLength(2);
      expect(registry.peek("oc")?.lastSeedReason).toBe("native_history_missing");
      const start = hosts[1]?.commands.find((entry) => entry.method === "turn/start");
      expect(JSON.stringify(start?.params.input)).toContain("rewritten");
    } finally {
      if (previousFlag === undefined) delete process.env.MUSE_NATIVE_HISTORY;
      else process.env.MUSE_NATIVE_HISTORY = previousFlag;
      await first?.stream.cancel();
      await second?.stream.cancel();
      await registry.closeAll();
    }
  });

  test("an unused precompute marker is consumed without a reseed", async () => {
    const previousFlag = process.env.MUSE_NATIVE_HISTORY;
    process.env.MUSE_NATIVE_HISTORY = "1";
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

    let first: Awaited<ReturnType<typeof model.doStream>> | undefined;
    let second: Awaited<ReturnType<typeof model.doStream>> | undefined;
    try {
      first = await model.doStream(request([{ role: "user", content: "old" }]));
      await finishNativeTurn(registry);

      const digest = "Conversation digest (opencode-owned history):\n\nUser: old";
      const fingerprint = fingerprintCompactionOutput(digest);
      await registry.recordCompaction("oc", fingerprint);
      registry.markNativeCompaction("oc", { fingerprint, windowMessages: 1 });

      // A background precompute can mark the session even when its result is
      // never installed. The next prompt is still a prefix, so nothing reseeds.
      second = await model.doStream(
        request([
          { role: "user", content: "old" },
          { role: "user", content: "next" },
        ]),
      );

      expect(opened).toHaveLength(1);
      expect(registry.peek("oc")?.lastSeedReason).toBe("same");
      const starts = hosts[0]?.commands.filter((entry) => entry.method === "turn/start") ?? [];
      expect(JSON.stringify(starts.at(-1)?.params.input)).toContain("next");
    } finally {
      if (previousFlag === undefined) delete process.env.MUSE_NATIVE_HISTORY;
      else process.env.MUSE_NATIVE_HISTORY = previousFlag;
      await first?.stream.cancel();
      await second?.stream.cancel();
      await registry.closeAll();
    }
  });

  test("a second native compaction keeps the same native session", async () => {
    const previousFlag = process.env.MUSE_NATIVE_HISTORY;
    process.env.MUSE_NATIVE_HISTORY = "1";
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

    let first: Awaited<ReturnType<typeof model.doStream>> | undefined;
    let second: Awaited<ReturnType<typeof model.doStream>> | undefined;
    let third: Awaited<ReturnType<typeof model.doStream>> | undefined;
    try {
      first = await model.doStream(request([{ role: "user", content: "old" }]));
      await finishNativeTurn(registry);

      const digest1 = "Conversation digest (opencode-owned history):\n\nUser: old";
      const fingerprint1 = fingerprintCompactionOutput(digest1);
      await registry.recordCompaction("oc", fingerprint1);
      registry.markNativeCompaction("oc", { fingerprint: fingerprint1, windowMessages: 1 });

      second = await model.doStream(
        request([
          { role: "user", content: digest1 },
          { role: "user", content: "next" },
        ]),
      );
      await finishNativeTurn(registry);
      expect(opened).toHaveLength(1);

      const digest2 = "Conversation digest (opencode-owned history):\n\nUser: digest 2";
      const fingerprint2 = fingerprintCompactionOutput(digest2);
      await registry.recordCompaction("oc", fingerprint2);
      registry.markNativeCompaction("oc", { fingerprint: fingerprint2, windowMessages: 1 });

      third = await model.doStream(
        request([
          { role: "user", content: digest2 },
          { role: "user", content: "next 2" },
        ]),
      );

      expect(opened).toHaveLength(1);
      expect(registry.peek("oc")?.lastSeedReason).toBe("same");
      const starts = hosts[0]?.commands.filter((entry) => entry.method === "turn/start") ?? [];
      expect(JSON.stringify(starts.at(-1)?.params.input)).toContain("next 2");
    } finally {
      if (previousFlag === undefined) delete process.env.MUSE_NATIVE_HISTORY;
      else process.env.MUSE_NATIVE_HISTORY = previousFlag;
      await first?.stream.cancel();
      await second?.stream.cancel();
      await third?.stream.cancel();
      await registry.closeAll();
    }
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

  test("old store keys are ignored, which forces one clean reseed", async () => {
    const opened: Array<Record<string, unknown>> = [];
    const stored = new Map<string, string>([
      ["oc", "old-native"],
      ["oc:transcript", JSON.stringify(["stale"])],
      ["oc:compaction", JSON.stringify(["stale-compaction"])],
    ]);
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
    const registry = new MuseSessionRegistry(adapter, {
      get: async (key) => stored.get(key),
      set: async (key, value) => {
        stored.set(key, value);
      },
    });
    try {
      const live = await registry.get("oc", "/tmp");
      expect(opened[0]).not.toHaveProperty("resumeSessionId");
      expect(live.nativeHasHistory).toBe(false);
      expect(live.transcriptFingerprints).toEqual([]);
      expect(live.compactionFingerprints).toEqual([]);
      expect(stored.get(storeKey("oc"))).toBe("fresh-native");
    } finally {
      await registry.closeAll();
    }
  });

  test("a forked session is seeded with the parent's tool calls and results", async () => {
    const hosts: Array<{ commands: RecordedCommand[] }> = [];
    const adapter = {
      listModels: async () => [],
      openSession: async (input: Record<string, unknown>) => {
        const fake = fakeHost();
        hosts.push({ commands: fake.commands });
        return MuseHarnessSession.fromNativeSession(
          fake.host,
          { sessionId: input.sessionId as string, cwd: input.cwd as string },
          `native-${input.sessionId as string}`,
        );
      },
    } as unknown as MuseHarnessAdapter;
    const registry = new MuseSessionRegistry(adapter);
    const model = new MuseLanguageModel("muse-spark-1.3", {}, registry, "muse");

    const stream = await model.doStream({
      prompt: [
        { role: "user", content: "look it up" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "checking" },
            { type: "tool-call", toolCallId: "t1", toolName: "lookup", input: { q: 1 } },
          ],
        },
        {
          role: "tool",
          content: [
            { type: "tool-result", toolCallId: "t1", toolName: "lookup", output: { type: "text", value: "record 42" } },
          ],
        },
        { role: "user", content: "what did it say?" },
      ],
      tools: [BRIDGE_TOOL],
      headers: {
        [HEADERS.kind]: "primary",
        [HEADERS.session]: "oc-fork",
        [HEADERS.directory]: "/tmp",
      },
    } as unknown as LanguageModelV3CallOptions);

    const start = hosts[0]?.commands.find((entry) => entry.method === "turn/start");
    const seeded = JSON.stringify(start?.params.input ?? []);
    expect(seeded).toContain('<tool_call id=\\"t1\\"');
    expect(seeded).toContain('<tool_result id=\\"t1\\"');
    expect(seeded).toContain("record 42");
    expect(seeded).toContain("[harness note]");

    await stream.stream.cancel();
    await registry.closeAll();
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
      await registry.get("a", "/tmp", undefined, [tool("a-tool")]);
      await registry.get("b", "/tmp", undefined, [tool("b-tool")]);

      const [a, b] = opened;
      if (!a || !b) throw new Error("expected two sessions");
      expect(a.list().map((entry) => entry.name)).toEqual(["a-tool"]);
      expect(b.list().map((entry) => entry.name)).toEqual(["b-tool"]);

      // A later step for one session replaces its list without touching the
      // other session's.
      await registry.get("a", "/tmp", undefined, [tool("a-tool-2")]);
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

describe("turn start admission", () => {
  test("a transport failure replays the start under the same command id", async () => {
    // `Connection.command` replays nothing-admitted refusals itself, but a dead
    // transport or a lost response reaches this layer as a bare failure. The
    // same command id makes the second send a replay rather than a second turn.
    const commands: RecordedCommand[] = [];
    const attempted: string[] = [];
    let calls = 0;
    const host: SessionHost = {
      connection: {
        mintCommandId: () => "cmd-0",
        command: (method: string, params: Record<string, unknown>, options?: { commandId?: string }) => {
          commands.push({ method, params });
          if (method !== "turn/start") return Promise.resolve({});
          calls += 1;
          attempted.push(String(options?.commandId));
          return calls === 1
            ? Promise.reject(new Error("socket closed before the ack"))
            : Promise.resolve({ turnId: "native-real", disposition: "started" });
        },
      },
      registerSink: () => {},
      unregisterSink: () => {},
    };
    const session = MuseHarnessSession.fromNativeSession(
      host,
      { sessionId: "oc", cwd: "/tmp" },
      "native",
    );
    const events = await drive(session, async () => {
      const turn = await session.startTurn({
        turnId: "t1",
        message: { content: [{ type: "text", text: "hi" }] },
      });
      expect(turn.nativeRef.id).toBe("native-real");
    });
    expect(attempted).toEqual(["cmd-0", "cmd-0"]);
    const starts = commands.filter((entry) => entry.method === "turn/start");
    expect(starts).toHaveLength(2);
    // Byte-identical: the connection refuses a reused id with a different payload.
    expect(JSON.stringify(starts[0]?.params)).toBe(JSON.stringify(starts[1]?.params));
    expect(events.filter((event) => event.type === "turn.terminal")).toHaveLength(0);
  });

  test("an unanswered start is replayed once at the deadline", async () => {
    // The wire sets no timeout, so without a local one this step would park for
    // as long as the connection lives.
    let calls = 0;
    const host: SessionHost = {
      connection: {
        mintCommandId: () => "cmd-0",
        command: (method: string) => {
          if (method !== "turn/start") return Promise.resolve({});
          calls += 1;
          return calls === 1
            ? new Promise<Record<string, unknown>>(() => {})
            : Promise.resolve({ turnId: "native-real" });
        },
      },
      registerSink: () => {},
      unregisterSink: () => {},
      ackDeadlineMs: 5,
    };
    const session = MuseHarnessSession.fromNativeSession(
      host,
      { sessionId: "oc", cwd: "/tmp" },
      "native",
    );
    await drive(session, async () => {
      const turn = await session.startTurn({
        turnId: "t1",
        message: { content: [{ type: "text", text: "hi" }] },
      });
      expect(turn.id).toBe("t1");
    });
    expect(calls).toBe(2);
  });

  test("two failed admissions leave no phantom turn and no wedged session", async () => {
    // The host admitted the turn and lost the ack, so its events arrive for an
    // input opencode was told failed. Before this, they materialised a turn
    // whose non-terminal reservation refused every later submit.
    const commands: RecordedCommand[] = [];
    let ids = 0;
    let starts = 0;
    const host: SessionHost = {
      connection: {
        mintCommandId: () => `cmd-${ids++}`,
        command: (method: string, params: Record<string, unknown>) => {
          commands.push({ method, params });
          if (method !== "turn/start") return Promise.resolve({});
          starts += 1;
          return starts <= 2
            ? Promise.reject(new Error("socket closed"))
            : Promise.resolve({ disposition: "started" });
        },
      },
      registerSink: () => {},
      unregisterSink: () => {},
    };
    const session = MuseHarnessSession.fromNativeSession(
      host,
      { sessionId: "oc", cwd: "/tmp" },
      "native",
    );
    const events = await drive(session, async () => {
      const failure = await session
        .startTurn({ turnId: "t1", message: { content: [{ type: "text", text: "hi" }] } })
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(HarnessError);
      expect(failure instanceof HarnessError ? failure.retryable : false).toBe(true);

      // The late truth: `turn/started` and the reply the host really produced.
      session.handleNotification({
        method: "turn/started",
        params: { turnId: "cmd-0", commandId: "cmd-0", sessionId: "native" },
      } satisfies MuseNotification);
      session.handleNotification({
        method: "item/started",
        params: {
          sessionId: "native",
          item: { itemId: "m1", kind: "agentMessage", turnId: "cmd-0", status: "inProgress" },
        },
      } as never);
      session.handleNotification({
        method: "item/completed",
        params: {
          sessionId: "native",
          item: {
            itemId: "m1",
            kind: "agentMessage",
            turnId: "cmd-0",
            status: "completed",
            text: "the answer",
          },
        },
      } as never);
      await new Promise((resolve) => setTimeout(resolve, 5));

      const next = await session.startTurn({
        turnId: "t2",
        message: { content: [{ type: "text", text: "again" }] },
      });
      expect(next.id).toBe("t2");
    });
    expect(events.filter((event) => event.type === "turn.started")).toHaveLength(0);
    expect(events.filter((event) => event.type === "message.completed")).toHaveLength(0);
    expect(commands.some((entry) => entry.method === "turn/interrupt")).toBe(true);
  });

  test("a turn the host announced before the ack still gets its terminal", async () => {
    // `turn/started` beat a lost ack, so opencode saw the turn begin; retiring it
    // must not leave it `running` forever.
    let calls = 0;
    const host: SessionHost = {
      connection: {
        mintCommandId: () => "cmd-0",
        command: (method: string) => {
          if (method !== "turn/start") return Promise.resolve({});
          calls += 1;
          return new Promise<Record<string, unknown>>(() => {});
        },
      },
      registerSink: () => {},
      unregisterSink: () => {},
      ackDeadlineMs: 5,
    };
    const session = MuseHarnessSession.fromNativeSession(
      host,
      { sessionId: "oc", cwd: "/tmp" },
      "native",
    );
    const events = await drive(session, async () => {
      const pending = session
        .startTurn({ turnId: "t1", message: { content: [{ type: "text", text: "hi" }] } })
        .catch((error: unknown) => error);
      session.handleNotification({
        method: "turn/started",
        params: { turnId: "cmd-0", commandId: "cmd-0", sessionId: "native" },
      } satisfies MuseNotification);
      const failure = await pending;
      expect(failure).toBeInstanceOf(HarnessError);
    });
    expect(events.filter((event) => event.type === "turn.started")).toHaveLength(1);
    expect(events.filter((event) => event.type === "turn.terminal")).toHaveLength(1);
    expect(calls).toBe(2);
  });

  test("a step cancelled while the start is in flight retires the turn", async () => {
    const commands: RecordedCommand[] = [];
    let starts = 0;
    const host: SessionHost = {
      connection: {
        mintCommandId: () => "cmd-0",
        command: (method: string, params: Record<string, unknown>) => {
          commands.push({ method, params });
          if (method !== "turn/start") return Promise.resolve({});
          starts += 1;
          return starts === 1
            ? new Promise<Record<string, unknown>>(() => {})
            : Promise.resolve({});
        },
      },
      registerSink: () => {},
      unregisterSink: () => {},
      ackDeadlineMs: 1_000,
    };
    const session = MuseHarnessSession.fromNativeSession(
      host,
      { sessionId: "oc", cwd: "/tmp" },
      "native",
    );
    const controller = new AbortController();
    const events = await drive(session, async () => {
      const pending = session
        .startTurn({
          turnId: "t1",
          signal: controller.signal,
          message: { content: [{ type: "text", text: "hi" }] },
        })
        .catch((error: unknown) => error);
      controller.abort();
      const failure = await pending;
      expect(failure).toBeInstanceOf(HarnessError);
      const next = await session.startTurn({
        turnId: "t2",
        message: { content: [{ type: "text", text: "again" }] },
      });
      expect(next.id).toBe("t2");
    });
    // The turn was never announced, so no event describes it.
    expect(events.filter((event) => event.type === "turn.started")).toHaveLength(0);
    expect(commands.some((entry) => entry.method === "turn/interrupt")).toBe(true);
  });
});

describe("ledger rows", () => {
  /** One assistant message through the native session, delta first. */
  function say(
    native: MuseHarnessSession,
    id: string,
    delta: string | null,
    text: string,
  ): void {
    const item = { itemId: id, kind: "agentMessage", turnId: "native-turn", status: "inProgress" };
    native.handleNotification({ method: "item/started", params: { item } } as never);
    if (delta !== null) {
      native.handleNotification({
        method: "item/delta",
        params: { itemId: id, field: "text", delta },
      } as never);
    }
    native.handleNotification({
      method: "item/completed",
      params: { item: { ...item, status: "completed", text } },
    } as never);
  }

  function finishTurn(native: MuseHarnessSession, usage?: Record<string, number>): void {
    native.handleNotification({
      method: "turn/completed",
      params: {
        turnId: "native-turn",
        sessionId: native.nativeSessionId,
        terminal: "completed",
        ...(usage === undefined ? {} : { usage }),
      },
    } as never);
  }

  /** The last row the run wrote; the append is fire-and-forget, so poll. */
  async function lastRow(directory: string): Promise<Record<string, unknown>> {
    const file = join(
      directory,
      "opencode-muse",
      `usage-${new Date().toISOString().slice(0, 10)}.jsonl`,
    );
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        const lines = (await readFile(file, "utf8")).split("\n").filter((line) => line.trim());
        if (lines.length > 0) return JSON.parse(lines.at(-1)!) as Record<string, unknown>;
      } catch {
        // Not written yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`no ledger row appeared in ${directory}`);
  }

  /** A temp ledger directory, since the row under test is a real write. */
  async function withLedgerDirectory(
    body: (directory: string) => Promise<void>,
  ): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), "muse-ledger-"));
    const previousNode = process.env.NODE_ENV;
    const previousState = process.env.XDG_STATE_HOME;
    // The ledger drops rows under NODE_ENV=test by design (they would pollute
    // the real percentiles). This is a test of the write path itself, so it
    // stands in as a normal run and points the ledger at a temp directory.
    process.env.NODE_ENV = "development";
    process.env.XDG_STATE_HOME = directory;
    try {
      await body(directory);
    } finally {
      if (previousNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNode;
      if (previousState === undefined) delete process.env.XDG_STATE_HOME;
      else process.env.XDG_STATE_HOME = previousState;
    }
  }

  test("a written row carries the admission wait and the tail fill", async () => {
    await withLedgerDirectory(async (directory) => {
      const { host } = fakeHost({ "turn/start": { turnId: "native-turn" } });
      const session = MuseHarnessSession.fromNativeSession(
        host,
        { sessionId: "oc", cwd: "/tmp" },
        "native",
      );
      const adapter = {
        listModels: async () => [],
        openSession: async () => session,
      } as unknown as MuseHarnessAdapter;
      const registry = new MuseSessionRegistry(adapter);
      const model = new MuseLanguageModel("muse-spark-1.3", {}, registry, "muse");
      const stream = await model.doStream({
        prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
        tools: [BRIDGE_TOOL],
        headers: {
          [HEADERS.kind]: "primary",
          [HEADERS.session]: "oc",
          [HEADERS.directory]: "/tmp",
        },
      } as unknown as LanguageModelV3CallOptions);
      try {
        const native = registry.peek("oc")?.muse as MuseHarnessSession | undefined;
        native?.handleNotification({
          method: "turn/started",
          params: { turnId: "native-turn", sessionId: "native" },
        } as never);
        // Half the reply streamed; the frame is what carries the rest.
        say(native!, "m1", "abc", "abcdef");
        finishTurn(native!, { inputTokens: 10, outputTokens: 5 });

        const row = await lastRow(directory);
        expect(row.kind).toBe("primary");
        expect(typeof row.admitMs).toBe("number");
        expect(row.admitMs as number).toBeGreaterThanOrEqual(0);
        expect(row).toMatchObject({
          streamedChars: 3,
          completedChars: 6,
          fillChars: 3,
          fillMessages: 1,
        });
        expect(row.completedChars).toBe((row.streamedChars as number) + (row.fillChars as number));
      } finally {
        await registry.closeAll();
        await stream.stream.cancel().catch(() => {});
      }
    });
  });

  test("a fill from a step that wrote no row is carried into the next row", async () => {
    await withLedgerDirectory(async (directory) => {
      // A fresh native session per open: a rebuild would close the one before.
      let counter = 0;
      const adapter = {
        listModels: async () => [],
        openSession: async () => {
          const fake = fakeHost({ "turn/start": { turnId: "native-turn" } });
          return MuseHarnessSession.fromNativeSession(
            fake.host,
            { sessionId: "oc", cwd: "/tmp" },
            `native-${counter++}`,
          );
        },
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
      const said = (roles: Array<[string, string]>) =>
        roles.map(([role, text]) => ({ role, content: [{ type: "text", text }] }));

      const first = await model.doStream(request(said([["user", "first"]])));
      let second: Awaited<ReturnType<typeof model.doStream>> | undefined;
      try {
        const native = registry.peek("oc")?.muse as MuseHarnessSession | undefined;
        native?.handleNotification({
          method: "turn/started",
          params: { turnId: "native-turn", sessionId: native.nativeSessionId },
        } as never);
        // Step one: the whole reply is a fill, and the turn reports no usage, so
        // the step writes no row at all.
        say(native!, "m1", null, "abc");
        finishTurn(native!);
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Step two, a new turn that extends the transcript opencode would hold.
        // A diverging prompt would rebuild the session (and its converter) and
        // the carried fill would be gone for a different reason.
        second = await model.doStream(
          request(said([["user", "first"], ["assistant", "abc"], ["user", "second"]])),
        );
        const live = registry.peek("oc")?.muse as MuseHarnessSession | undefined;
        say(live!, "m2", "de", "def");
        finishTurn(live!, { inputTokens: 10, outputTokens: 5 });

        const row = await lastRow(directory);
        // 2 and 4, not 1 and 1: the first step's fill survived the missing row.
        expect(row).toMatchObject({ fillMessages: 2, fillChars: 4, streamedChars: 2, completedChars: 6 });
      } finally {
        await first.stream.cancel().catch(() => {});
        await second?.stream.cancel().catch(() => {});
        await registry.closeAll();
      }
    });
  });
});
