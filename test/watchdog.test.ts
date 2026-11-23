import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessEvent } from "../src/contract/index.js";
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
