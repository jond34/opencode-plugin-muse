import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessEvent, HarnessToolBridge } from "../src/contract/index.js";
import { MuseHarnessSession, type SessionHost } from "../src/session.js";
import {
  createTurnWatchdog,
  isSubstantiveProgress,
  watchdogConfigFromEnv,
  WATCHDOG_DEFAULTS,
} from "../src/watchdog.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const saved = {
  first: process.env.MUSE_FIRST_BYTE_TIMEOUT_MS,
  idle: process.env.MUSE_IDLE_TIMEOUT_MS,
  warn: process.env.MUSE_IDLE_WARN_MS,
};

afterEach(() => {
  for (const [key, value] of [
    ["MUSE_FIRST_BYTE_TIMEOUT_MS", saved.first],
    ["MUSE_IDLE_TIMEOUT_MS", saved.idle],
    ["MUSE_IDLE_WARN_MS", saved.warn],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("watchdog clocks", () => {
  test("defaults are 900 s, 180 s, 90 s and each can be disabled", () => {
    expect(watchdogConfigFromEnv({})).toEqual(WATCHDOG_DEFAULTS);
    expect(watchdogConfigFromEnv({ MUSE_IDLE_TIMEOUT_MS: "0" }).idleMs).toBe(0);
    // A typo is not a budget: the default stays rather than the clock vanishing.
    expect(watchdogConfigFromEnv({ MUSE_IDLE_TIMEOUT_MS: "soon" }).idleMs).toBe(180_000);
  });

  test("only substantive frames count as progress", () => {
    for (const method of [
      "turn/started",
      "item/delta",
      "item/started",
      "item/completed",
      "approval/requested",
      "userInput/requested",
      "turn/modelRetryScheduled",
      "turn/foregroundCompleted",
    ]) {
      expect(isSubstantiveProgress(method)).toBe(true);
    }
    for (const method of [
      "session/tokenUsage",
      "session/contextUsage",
      "session/statusChanged",
      "view/gap",
      "keepalive",
    ]) {
      expect(isSubstantiveProgress(method)).toBe(false);
    }
  });

  test("the warn clock fires once per silence episode", async () => {
    const warns: number[] = [];
    const watchdog = createTurnWatchdog({
      firstByteMs: 0,
      idleMs: 0,
      warnMs: 10,
      onWarn: (silent) => warns.push(silent),
      onExpire: () => {},
    });
    await sleep(30);
    expect(warns).toHaveLength(1);
    // A substantive frame opens a new episode; silence after it warns again.
    watchdog.touch(true);
    await sleep(30);
    expect(warns).toHaveLength(2);
    watchdog.stop();
  });

  test("idle expires only after a first substantive frame", async () => {
    const expiries: string[] = [];
    const watchdog = createTurnWatchdog({
      firstByteMs: 0,
      idleMs: 10,
      warnMs: 0,
      onExpire: (reason) => expiries.push(reason),
    });
    await sleep(30);
    // No frame ever arrived, so the idle clock was never armed; the first-byte
    // clock is the one that owns this state.
    expect(expiries).toHaveLength(0);
    watchdog.touch(true);
    await sleep(30);
    expect(expiries).toEqual(["idle"]);
  });

  test("frames keep the turn alive", async () => {
    let expired = false;
    const watchdog = createTurnWatchdog({
      firstByteMs: 0,
      idleMs: 25,
      warnMs: 0,
      onExpire: () => {
        expired = true;
      },
    });
    for (let index = 0; index < 5; index += 1) {
      await sleep(10);
      watchdog.touch(true);
    }
    expect(expired).toBe(false);
    watchdog.stop();
  });

  test("non-substantive frames do not keep it alive", async () => {
    const expiries: string[] = [];
    const watchdog = createTurnWatchdog({
      firstByteMs: 0,
      idleMs: 15,
      warnMs: 0,
      onExpire: (reason) => expiries.push(reason),
    });
    watchdog.touch(true);
    for (let index = 0; index < 4; index += 1) {
      await sleep(8);
      watchdog.touch(false);
    }
    expect(expiries).toEqual(["idle"]);
  });

  test("first byte expires a silent turn", async () => {
    const expiries: string[] = [];
    const watchdog = createTurnWatchdog({
      firstByteMs: 10,
      idleMs: 1_000,
      warnMs: 0,
      onExpire: (reason) => expiries.push(reason),
    });
    await sleep(30);
    expect(expiries).toEqual(["first_byte"]);
  });

  test("zero disables every clock", async () => {
    let warned = false;
    let expired = false;
    const watchdog = createTurnWatchdog({
      firstByteMs: 0,
      idleMs: 0,
      warnMs: 0,
      onWarn: () => {
        warned = true;
      },
      onExpire: () => {
        expired = true;
      },
    });
    await sleep(30);
    expect(warned).toBe(false);
    expect(expired).toBe(false);
  });

  test("a pending bridge call suspends the idle clock and resumes it", async () => {
    const expiries: string[] = [];
    const watchdog = createTurnWatchdog({
      firstByteMs: 0,
      idleMs: 20,
      warnMs: 0,
      onExpire: (reason) => expiries.push(reason),
    });
    watchdog.touch(true);
    watchdog.setBridgePending(true);
    // Longer than the idle budget: the silence belongs to our tool, not the host.
    await sleep(60);
    expect(expiries).toHaveLength(0);
    watchdog.setBridgePending(false);
    await sleep(60);
    expect(expiries).toEqual(["idle"]);
  });

  test("a retry extends the idle clock by the delay the host reported", async () => {
    const expiries: string[] = [];
    const watchdog = createTurnWatchdog({
      firstByteMs: 0,
      idleMs: 20,
      warnMs: 0,
      retryCapMs: 600_000,
      onExpire: (reason) => expiries.push(reason),
    });
    watchdog.touch(true);
    watchdog.noteRetry(100);
    await sleep(60);
    expect(expiries).toHaveLength(0);
    watchdog.stop();
  });

  test("the last scheduled attempt does not extend the idle clock", async () => {
    const expiries: string[] = [];
    const watchdog = createTurnWatchdog({
      firstByteMs: 0,
      idleMs: 20,
      warnMs: 0,
      retryCapMs: 600_000,
      onExpire: (reason) => expiries.push(reason),
    });
    watchdog.touch(true);
    // Attempt 1 of 3 is a backoff: the host's own delay plus grace outlasts the
    // window, and the turn is not a wedge.
    watchdog.noteRetry(400, 1, 3);
    await sleep(60);
    expect(expiries).toHaveLength(0);
    // Attempt 3 of 3 is the last: nothing more is scheduled, so the normal
    // window applies and a silent host is a wedge again.
    watchdog.noteRetry(400, 3, 3);
    await sleep(60);
    expect(expiries).toEqual(["idle"]);
  });

  test("the tool ceiling is off unless it is configured", async () => {
    const expiries: string[] = [];
    const watchdog = createTurnWatchdog({
      firstByteMs: 0,
      idleMs: 0,
      warnMs: 0,
      onExpire: (reason) => expiries.push(reason),
    });
    watchdog.setBridgePending(true);
    await sleep(50);
    expect(expiries).toHaveLength(0);
    watchdog.stop();
  });

  test("a late frame cannot revive an expired turn", async () => {
    let calls = 0;
    const watchdog = createTurnWatchdog({
      firstByteMs: 10,
      idleMs: 10,
      warnMs: 0,
      onExpire: () => {
        calls += 1;
      },
    });
    await sleep(25);
    watchdog.touch(true);
    await sleep(25);
    expect(calls).toBe(1);
    expect(watchdog.expired).toBe(true);
  });
});

interface LadderHost {
  host: SessionHost;
  steps: string[];
}

/** A host that admits one turn and then never sends a frame. */
function wedgedHost(): LadderHost {
  const steps: string[] = [];
  let counter = 0;
  const host: SessionHost = {
    connection: {
      mintCommandId: () => `cmd-${counter++}`,
      command: async (method: string) => {
        steps.push(method);
        if (method === "session/start") return { session: { sessionId: "native-1" } };
        if (method === "turn/start") return { turnId: "native-turn-1", startedNewTurn: true };
        // `turn/interrupt` never settles on a wedged host.
        if (method === "turn/interrupt") return new Promise(() => {});
        return {};
      },
    },
    registerSink: () => {},
    unregisterSink: () => {},
    close: async () => {
      steps.push("host.close");
    },
  };
  return { host, steps };
}

async function collect(session: MuseHarnessSession): Promise<HarnessEvent[]> {
  const events: HarnessEvent[] = [];
  void (async () => {
    for await (const event of session.subscribe()) events.push(event);
  })();
  return events;
}

/**
 * E-D13: a bridged call is the host waiting on *us*, so it is not silence.
 *
 * The fake host receives the real bridge URL in `session/start` and posts a real
 * `tools/call` to it over loopback, which is the same request Muse's own MCP
 * client makes. The tool then parks, which is what a long build looks like from
 * this side of the bridge.
 */
function bridgeHost(
  onTurnStart: (server: { url: string; headers: Record<string, string> }) => void,
  options: { rejectWaits?: boolean } = {},
): { host: SessionHost; steps: string[]; commands: Array<Record<string, unknown>> } {
  const steps: string[] = [];
  const commands: Array<Record<string, unknown>> = [];
  let counter = 0;
  let started: Record<string, unknown> = {};
  const host: SessionHost = {
    connection: {
      mintCommandId: () => `cmd-${counter++}`,
      command: async (method: string, params?: Record<string, unknown>) => {
        steps.push(method);
        commands.push({ method, ...(params ?? {}) });
        if (
          options.rejectWaits === true &&
          (method === "session/declareExternalWait" || method === "session/clearExternalWait")
        ) {
          throw new Error("method not found");
        }
        if (method === "session/start") {
          started = params ?? {};
          return { session: { sessionId: "native-1" } };
        }
        if (method === "turn/start") {
          const config = (started.config ?? {}) as {
            mcpServers?: Record<string, { url?: string; headers?: Record<string, string> }>;
          };
          const server = config.mcpServers?.opencode;
          if (server?.url !== undefined) {
            // After the ack, so the turn is admitted before the call arrives.
            setTimeout(() => onTurnStart({ url: server.url as string, headers: server.headers ?? {} }), 10);
          }
          return { turnId: "native-turn-1", startedNewTurn: true };
        }
        if (method === "turn/interrupt") return new Promise(() => {});
        return {};
      },
    },
    registerSink: () => {},
    unregisterSink: () => {},
    close: async () => {
      steps.push("host.close");
    },
  };
  return { host, steps, commands };
}

function parkedBridge(): { bridge: HarnessToolBridge; calls: () => number; release: () => void } {
  let calls = 0;
  let release: (() => void) | undefined;
  const bridge: HarnessToolBridge = {
    listTools: () => [
      { name: "bash", description: "run a command", inputSchema: { type: "object" } },
    ],
    callTool: () => {
      calls += 1;
      return new Promise((resolve) => {
        release = () => resolve({ content: [{ type: "text", text: "done" }] });
      });
    },
  };
  return {
    bridge,
    calls: () => calls,
    release: () => release?.(),
  };
}

describe("a turn waiting on a bridged tool", () => {
  test("a call longer than the idle window does not fail the turn", async () => {
    process.env.MUSE_IDLE_TIMEOUT_MS = "60";
    process.env.MUSE_FIRST_BYTE_TIMEOUT_MS = "1000";
    process.env.MUSE_IDLE_WARN_MS = "0";
    const root = await mkdtemp(join(tmpdir(), "muse-bridge-"));
    const { host } = bridgeHost((server) => {
      void fetch(server.url, {
        method: "POST",
        headers: { ...server.headers, "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: { name: "bash", arguments: { command: "npm test" } },
        }),
      }).catch(() => undefined);
    });
    const parked = parkedBridge();
    const session = await MuseHarnessSession.create(host, {
      sessionId: "oc",
      cwd: root,
      toolBridge: parked.bridge,
    });
    const events = await collect(session);
    await session.startTurn({ turnId: "t1", message: { content: [{ type: "text", text: "hi" }] } });
    // One frame proves the stream opened; the idle clock is the one at issue.
    session.handleNotification({ method: "item/delta", params: { sessionId: "native-1" } } as never);
    await sleep(250);

    expect(parked.calls()).toBe(1);
    expect(events.filter((event) => event.type === "turn.terminal")).toHaveLength(0);
    expect(session.hostExited).toBe(false);

    parked.release();
    await sleep(60);
    expect(session.hostExited).toBe(false);
    await session.close();
  }, 10_000);

  test("a host that dies during a bridged call fails the turn as host death", async () => {
    process.env.MUSE_IDLE_TIMEOUT_MS = "1000";
    process.env.MUSE_FIRST_BYTE_TIMEOUT_MS = "1000";
    process.env.MUSE_IDLE_WARN_MS = "0";
    const root = await mkdtemp(join(tmpdir(), "muse-bridge-"));
    const { host } = bridgeHost((server) => {
      void fetch(server.url, {
        method: "POST",
        headers: { ...server.headers, "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 9,
          method: "tools/call",
          params: { name: "bash", arguments: {} },
        }),
      }).catch(() => undefined);
    });
    const parked = parkedBridge();
    const session = await MuseHarnessSession.create(host, {
      sessionId: "oc",
      cwd: root,
      toolBridge: parked.bridge,
    });
    const events = await collect(session);
    await session.startTurn({ turnId: "t1", message: { content: [{ type: "text", text: "hi" }] } });
    // An announced turn is one opencode is waiting on, so its death is reported.
    session.handleNotification({
      method: "turn/started",
      params: { sessionId: "native-1", turnId: "native-turn-1" },
    } as never);
    await sleep(60);
    expect(parked.calls()).toBe(1);
    session.handleHostExit();
    await sleep(30);
    const terminal = events.find((event) => event.type === "turn.terminal");
    expect(terminal && "failure" in terminal ? terminal.failure?.code : undefined).toBe(
      "event_stream_failed",
    );
  }, 10_000);

  test("an optional ceiling still bounds a tool that never returns", async () => {
    process.env.MUSE_IDLE_TIMEOUT_MS = "1000";
    process.env.MUSE_FIRST_BYTE_TIMEOUT_MS = "1000";
    process.env.MUSE_IDLE_WARN_MS = "0";
    process.env.MUSE_TOOL_CEILING_MS = "40";
    try {
      const root = await mkdtemp(join(tmpdir(), "muse-bridge-"));
      const { host } = bridgeHost((server) => {
        void fetch(server.url, {
          method: "POST",
          headers: { ...server.headers, "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 8,
            method: "tools/call",
            params: { name: "bash", arguments: {} },
          }),
        }).catch(() => undefined);
      });
      const parked = parkedBridge();
      const session = await MuseHarnessSession.create(host, {
        sessionId: "oc",
        cwd: root,
        toolBridge: parked.bridge,
      });
      const events = await collect(session);
      await session.startTurn({ turnId: "t1", message: { content: [{ type: "text", text: "hi" }] } });
      session.handleNotification({ method: "item/delta", params: { sessionId: "native-1" } } as never);
      await sleep(200);
      const terminal = events.find((event) => event.type === "turn.terminal");
      expect(terminal && "failure" in terminal ? terminal.failure?.message : undefined).toContain(
        "bridged tool call",
      );
    } finally {
      delete process.env.MUSE_TOOL_CEILING_MS;
    }
  }, 10_000);
});

/**
 * E-D14: a provider retry is the host saying "I am backing off", not silence.
 * The wire carries `turn/modelRetryScheduled` with the delay the host chose, so
 * the clock can be extended from a durable fact rather than guessed.
 */
describe("provider retries", () => {
  function retryFrame(delayMs: number): never {
    return {
      method: "turn/modelRetryScheduled",
      params: {
        sessionId: "native-1",
        turnId: "native-turn-1",
        attempt: 1,
        maxAttempts: 5,
        retryDelayMs: delayMs,
        errorKind: "rate_limit",
        httpStatus: 429,
      },
    } as never;
  }

  test("a retry longer than the idle window does not fail the turn", async () => {
    process.env.MUSE_IDLE_TIMEOUT_MS = "50";
    process.env.MUSE_FIRST_BYTE_TIMEOUT_MS = "1000";
    process.env.MUSE_IDLE_WARN_MS = "0";
    const root = await mkdtemp(join(tmpdir(), "muse-retry-"));
    const { host } = wedgedHost();
    const session = await MuseHarnessSession.create(host, { sessionId: "oc", cwd: root });
    const events = await collect(session);
    await session.startTurn({ turnId: "t1", message: { content: [{ type: "text", text: "hi" }] } });
    session.handleNotification({
      method: "turn/started",
      params: { sessionId: "native-1", turnId: "native-turn-1" },
    } as never);
    session.handleNotification(retryFrame(200));
    await sleep(150);
    session.handleNotification({
      method: "item/delta",
      params: { sessionId: "native-1", turnId: "native-turn-1", itemId: "i", delta: { type: "text", text: "x" } },
    } as never);
    session.handleNotification({
      method: "turn/completed",
      params: { sessionId: "native-1", turnId: "native-turn-1", terminal: "completed" },
    } as never);
    await sleep(30);
    const terminal = events.find((event) => event.type === "turn.terminal");
    expect(terminal && "failure" in terminal ? terminal.failure : "none").toBeNull();
    expect(session.hostExited).toBe(false);
    await session.close();
  }, 10_000);

  test("the end-of-turn gate is progress, not silence", async () => {
    process.env.MUSE_IDLE_TIMEOUT_MS = "400";
    process.env.MUSE_FIRST_BYTE_TIMEOUT_MS = "1000";
    process.env.MUSE_IDLE_WARN_MS = "0";
    const root = await mkdtemp(join(tmpdir(), "muse-eot-"));
    const { host } = wedgedHost();
    const session = await MuseHarnessSession.create(host, { sessionId: "oc", cwd: root });
    const events = await collect(session);
    await session.startTurn({ turnId: "t1", message: { content: [{ type: "text", text: "hi" }] } });
    session.handleNotification({
      method: "turn/started",
      params: { sessionId: "native-1", turnId: "native-turn-1" },
    } as never);
    await sleep(250);
    // Foreground work is done; Muse's end-of-turn reminder gate is running and
    // will be silent for longer than the window that was already ticking.
    session.handleNotification({
      method: "turn/foregroundCompleted",
      params: { sessionId: "native-1", turnId: "native-turn-1" },
    } as never);
    await sleep(250);
    expect(events.find((event) => event.type === "turn.terminal")).toBeUndefined();
    session.handleNotification({
      method: "turn/completed",
      params: { sessionId: "native-1", turnId: "native-turn-1", terminal: "completed" },
    } as never);
    await sleep(30);
    const terminal = events.find((event) => event.type === "turn.terminal");
    expect(terminal?.turn.status).toBe("completed");
    expect(terminal && "failure" in terminal ? terminal.failure : "none").toBeNull();
    expect(session.hostExited).toBe(false);
    await session.close();
  }, 10_000);

  test("the extension is capped, so a retry storm still ends", async () => {
    process.env.MUSE_IDLE_TIMEOUT_MS = "50";
    process.env.MUSE_FIRST_BYTE_TIMEOUT_MS = "1000";
    process.env.MUSE_IDLE_WARN_MS = "0";
    process.env.MUSE_RETRY_CAP_MS = "80";
    try {
      const root = await mkdtemp(join(tmpdir(), "muse-retry-"));
      const { host } = wedgedHost();
      const session = await MuseHarnessSession.create(host, { sessionId: "oc", cwd: root });
      const events = await collect(session);
      await session.startTurn({ turnId: "t1", message: { content: [{ type: "text", text: "hi" }] } });
      session.handleNotification({
        method: "turn/started",
        params: { sessionId: "native-1", turnId: "native-turn-1" },
      } as never);
      session.handleNotification(retryFrame(200));
      await sleep(200);
      const terminal = events.find((event) => event.type === "turn.terminal");
      expect(terminal && "failure" in terminal ? terminal.failure?.code : undefined).toBe(
        "host_idle_timeout",
      );
    } finally {
      delete process.env.MUSE_RETRY_CAP_MS;
    }
  }, 10_000);
});

/**
 * E-D15: the wait is declared on the session while a bridged call runs, so a
 * client can show "waiting on bash" instead of silence. The live probe proved
 * the host serves `externalWait`; this pins when the plugin sends the pair.
 */
describe("declaring the wait", () => {
  test("a bridged call is declared once and cleared when it settles", async () => {
    process.env.MUSE_IDLE_TIMEOUT_MS = "1000";
    process.env.MUSE_FIRST_BYTE_TIMEOUT_MS = "1000";
    process.env.MUSE_IDLE_WARN_MS = "0";
    const root = await mkdtemp(join(tmpdir(), "muse-wait-"));
    const { host, commands } = bridgeHost((server) => {
      void fetch(server.url, {
        method: "POST",
        headers: { ...server.headers, "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 11,
          method: "tools/call",
          params: { name: "bash", arguments: { command: "npm test" } },
        }),
      }).catch(() => undefined);
    });
    const parked = parkedBridge();
    const session = await MuseHarnessSession.create(host, {
      sessionId: "oc",
      cwd: root,
      toolBridge: parked.bridge,
    });
    await session.startTurn({ turnId: "t1", message: { content: [{ type: "text", text: "hi" }] } });
    await sleep(80);
    expect(parked.calls()).toBe(1);
    const declares = commands.filter((row) => row.method === "session/declareExternalWait");
    expect(declares).toHaveLength(1);
    expect(declares[0]?.reason).toBe("bash: npm test");

    parked.release();
    await sleep(80);
    const clears = commands.filter((row) => row.method === "session/clearExternalWait");
    expect(clears).toHaveLength(1);
    expect(declares).toHaveLength(1);
    await session.close();
  }, 10_000);

  test("a host that rejects the declaration does not fail the turn", async () => {
    process.env.MUSE_IDLE_TIMEOUT_MS = "1000";
    process.env.MUSE_FIRST_BYTE_TIMEOUT_MS = "1000";
    process.env.MUSE_IDLE_WARN_MS = "0";
    const root = await mkdtemp(join(tmpdir(), "muse-wait-"));
    const { host, steps } = bridgeHost(
      (server) => {
        void fetch(server.url, {
          method: "POST",
          headers: { ...server.headers, "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 12,
            method: "tools/call",
            params: { name: "bash", arguments: {} },
          }),
        }).catch(() => undefined);
      },
      { rejectWaits: true },
    );
    const parked = parkedBridge();
    const session = await MuseHarnessSession.create(host, {
      sessionId: "oc",
      cwd: root,
      toolBridge: parked.bridge,
    });
    const events = await collect(session);
    await session.startTurn({ turnId: "t1", message: { content: [{ type: "text", text: "hi" }] } });
    session.handleNotification({
      method: "turn/started",
      params: { sessionId: "native-1", turnId: "native-turn-1" },
    } as never);
    await sleep(80);
    expect(steps).toContain("session/declareExternalWait");
    parked.release();
    session.handleNotification({
      method: "turn/completed",
      params: { sessionId: "native-1", turnId: "native-turn-1", terminal: "completed" },
    } as never);
    await sleep(40);
    const terminal = events.find((event) => event.type === "turn.terminal");
    expect(terminal && "failure" in terminal ? terminal.failure : "none").toBeNull();
    await session.close();
  }, 10_000);
});

describe("the abort ladder", () => {
  test("an idle turn fails as a timeout, interrupts, then closes the host", async () => {
    process.env.MUSE_IDLE_TIMEOUT_MS = "20";
    process.env.MUSE_FIRST_BYTE_TIMEOUT_MS = "1000";
    process.env.MUSE_IDLE_WARN_MS = "0";
    const root = await mkdtemp(join(tmpdir(), "muse-watchdog-"));
    const { host, steps } = wedgedHost();
    const session = await MuseHarnessSession.create(host, { sessionId: "oc", cwd: root });
    const events = await collect(session);
    await session.startTurn({ turnId: "t1", message: { content: [{ type: "text", text: "hi" }] } });
    // One frame proves the stream opened, then silence.
    session.handleNotification({ method: "item/delta", params: { sessionId: "native-1" } } as never);
    await sleep(80);

    const terminal = events.find((event) => event.type === "turn.terminal");
    expect(terminal).toBeDefined();
    expect(terminal && "failure" in terminal ? terminal.failure?.code : undefined).toBe(
      "host_idle_timeout",
    );
    expect(steps).toContain("turn/interrupt");
    // The interrupt never answers, so the ladder waits out its 2 s budget and
    // then closes the host; the order is what the record shows.
    await sleep(2_300);
    expect(steps).toContain("host.close");
    expect(steps.indexOf("turn/interrupt")).toBeLessThan(steps.indexOf("host.close"));
    expect(session.hostExited).toBe(true);
  }, 10_000);

  test("a turn with no first frame expires on the first-byte clock", async () => {
    process.env.MUSE_FIRST_BYTE_TIMEOUT_MS = "20";
    process.env.MUSE_IDLE_TIMEOUT_MS = "1000";
    process.env.MUSE_IDLE_WARN_MS = "0";
    const root = await mkdtemp(join(tmpdir(), "muse-watchdog-"));
    const { host } = wedgedHost();
    const session = await MuseHarnessSession.create(host, { sessionId: "oc", cwd: root });
    const events = await collect(session);
    await session.startTurn({ turnId: "t1", message: { content: [{ type: "text", text: "hi" }] } });
    await sleep(80);
    const terminal = events.find((event) => event.type === "turn.terminal");
    expect(terminal && "failure" in terminal ? terminal.failure?.message : undefined).toContain(
      "no frame within 20 ms",
    );
  }, 10_000);

  test("a turn that completes normally never reaches the ladder", async () => {
    process.env.MUSE_IDLE_TIMEOUT_MS = "20";
    process.env.MUSE_FIRST_BYTE_TIMEOUT_MS = "1000";
    process.env.MUSE_IDLE_WARN_MS = "0";
    const root = await mkdtemp(join(tmpdir(), "muse-watchdog-"));
    const { host, steps } = wedgedHost();
    const session = await MuseHarnessSession.create(host, { sessionId: "oc", cwd: root });
    const events = await collect(session);
    await session.startTurn({ turnId: "t1", message: { content: [{ type: "text", text: "hi" }] } });
    session.handleNotification({
      method: "turn/completed",
      params: { sessionId: "native-1", turnId: "native-turn-1", terminal: "completed" },
    } as never);
    await sleep(60);
    const terminal = events.find((event) => event.type === "turn.terminal");
    expect(terminal && "failure" in terminal ? terminal.failure : "none").toBeNull();
    expect(steps).not.toContain("turn/interrupt");
    expect(steps).not.toContain("host.close");
    await session.close();
  }, 10_000);
});
