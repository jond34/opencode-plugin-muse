import { afterEach, describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessEvent } from "../src/contract/index.js";
import { MuseHarnessAdapter } from "../src/adapter.js";
import { MuseSessionRegistry, type SessionStore } from "../src/session-registry.js";

/**
 * E-D9: after a watchdog kill, does a new host serve the same session without a
 * reseed?
 *
 * A real child process is the only honest way to ask: the freeze is a SIGSTOP,
 * the kill is the SDK's SIGTERM→SIGKILL ladder, and the second host is spawned
 * by the adapter after it drops the first. The fixture's mode comes from a file
 * so the same adapter can spawn a freezing host and then a resuming one.
 */

const FIXTURE = join(import.meta.dir, "fixtures", "fake-msp-host.mjs");
const HOST_RUNTIME = "node";

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

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return predicate();
}

/**
 * E30: when `pid` stops being alive, as an absolute timestamp, or null if it
 * outlives the budget.
 *
 * The Windows failure is a 15 s wait that produces no terminal, and three
 * different facts fit that reading: a watchdog kill that never fires, a resume
 * that never answers, or a fake host that is merely slow. Watching the pid and
 * the event stream concurrently separates them without changing an assertion.
 */
async function whenGone(pid: number, ms: number): Promise<number | null> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!alive(pid)) return Date.now();
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return alive(pid) ? null : Date.now();
}

/** One line per stamp, offsets from the first, sorted by arrival. */
function printTrace(trace: Array<{ at: number; label: string }>): void {
  const base = trace.reduce((min, entry) => Math.min(min, entry.at), Number.POSITIVE_INFINITY);
  const lines = [...trace]
    .sort((a, b) => a.at - b.at)
    .map((entry) => `[E30] +${String(entry.at - base).padStart(5)}ms ${entry.label}`);
  console.error(lines.join("\n"));
}

function memoryStore(): SessionStore {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key),
    set: async (key, value) => {
      values.set(key, value);
    },
  };
}

describe("resume after a watchdog kill", () => {
  test("the next open resumes the native session instead of reseeding", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "muse-resume-"));
    // `MuseHost` builds `[serve, ...args]`, and the fixture must be node's
    // script argument: a copy named `serve` in the child's cwd is the shape
    // that keeps both true without a second spawn path in the host.
    copyFileSync(FIXTURE, join(scratch, "serve"));
    const modeFile = join(scratch, "mode");
    const methodsFile = join(scratch, "methods");
    const pidFile = join(scratch, "host.pid");
    writeFileSync(modeFile, "freeze-after-start");

    // E30: the four transitions this test already touches, stamped rather than
    // inferred. Printed on Windows unconditionally, elsewhere only on failure.
    const trace: Array<{ at: number; label: string }> = [];
    const mark = (label: string) => trace.push({ at: Date.now(), label });

    process.env.MUSE_FIRST_BYTE_TIMEOUT_MS = "250";
    process.env.MUSE_IDLE_TIMEOUT_MS = "1000";
    process.env.MUSE_IDLE_WARN_MS = "0";

    const adapter = new MuseHarnessAdapter({
      hostOptions: {
        museBin: HOST_RUNTIME,
        cwd: scratch,
        env: {
          ...process.env,
          FAKE_MSP_MODE_FILE: modeFile,
          FAKE_MSP_METHODS_FILE: methodsFile,
          FAKE_MSP_PIDFILE: pidFile,
        },
        shutdownTimeoutMs: 0,
      },
    });
    const registry = new MuseSessionRegistry(adapter, memoryStore());

    const live = await registry.get("oc", scratch);
    const events: HarnessEvent[] = [];
    void (async () => {
      for await (const event of live.muse.subscribe()) events.push(event);
    })();

    mark("turn.requested");
    await live.muse.startTurn({
      turnId: "t1",
      message: { content: [{ type: "text", text: "hi" }] },
    });
    mark("turn.accepted");
    const firstPid = Number(readFileSync(pidFile, "utf8"));
    mark(`host.pid=${firstPid}`);

    // The idle clock is what ends the turn (1000 ms); the rest is starting a
    // bun child and its handshake. On Windows that cold start measured ~4.0 s
    // in two runs, so the budget there is the spawn cost, not a shorter claim
    // (E22).
    const terminalBudgetMs = process.platform === "win32" ? 15_000 : 4_000;
    // Watched concurrently: awaiting the death first would spend the budget
    // twice when the host never dies, and the 20 s test timeout would eat the
    // trace this instrumentation exists to print (E30).
    const gone = whenGone(firstPid, terminalBudgetMs);
    const terminalSeen = await waitFor(
      () => events.some((event) => event.type === "turn.terminal"),
      terminalBudgetMs,
    );
    mark(terminalSeen ? "terminal.received" : "terminal.missing-at-budget");
    const goneAt = await gone;
    if (goneAt === null) mark("host.alive-at-budget");
    else trace.push({ at: goneAt, label: "host.gone" });
    if (!terminalSeen || process.platform === "win32") printTrace(trace);
    expect(terminalSeen).toBe(true);
    const terminal = events.find((event) => event.type === "turn.terminal");
    expect(terminal && "failure" in terminal ? terminal.failure?.code : undefined).toBe(
      "host_idle_timeout",
    );
    // The frozen child is reaped by the shutdown ladder, not left behind.
    expect(await waitFor(() => !alive(firstPid), 8_000)).toBe(true);
    // The old session produced exactly one terminal; nothing arrives after it.
    expect(events.filter((event) => event.type === "turn.terminal")).toHaveLength(1);

    // A new host, and the adapter must have dropped the closed one first.
    writeFileSync(modeFile, "resume-answer");
    mark("reopen.requested");
    const reopened = await registry.get("oc", scratch);
    mark(`reopen.${reopened.muse.resumeOutcome}`);
    expect(reopened.muse.resumeOutcome).toBe("resumed");
    expect(reopened.resumed).toBe(true);
    if (process.platform === "win32") printTrace(trace);

    const methods = readFileSync(methodsFile, "utf8").split("\n");
    expect(methods.filter((method) => method === "session/resume")).toHaveLength(1);
    // One start (the first host) and no second: a reseed would have shown up as
    // a fresh session instead of a resume.
    expect(methods.filter((method) => method === "session/start")).toHaveLength(1);

    await registry.closeAll();
    await adapter.close();
  }, 20_000);
});
