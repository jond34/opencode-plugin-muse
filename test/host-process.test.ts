import { afterEach, describe, expect, test } from "bun:test";
import { spawnMspConnection, type SpawnedMspConnection } from "@muse-code/sdk";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MuseHost } from "../src/host.js";

/**
 * The seam across a real process boundary, against `fixtures/fake-msp-host.mjs`.
 *
 * These are the three questions no fake object can answer, because each one is
 * about what the OS and the SDK do to a live child: does a transport EOF leave
 * the process running (E-D4), does a spawned host inherit the parent's
 * environment including `NODE_EXTRA_CA_CERTS` (E-D3), and what does a frozen
 * host do to a request (E-D2).
 */

const FIXTURE = join(import.meta.dir, "fixtures", "fake-msp-host.mjs");

/**
 * The fixture runs under node, not `process.execPath`.
 *
 * Under bun, a bun child that closes its own stdout does not end the parent's
 * async iteration over that pipe, so `connection.closed` never settles — a bun
 * stdio artefact, not host behaviour. `muse` is not a bun program either, so
 * node is also the more faithful stand-in for the real child.
 */
const HOST_RUNTIME = "node";

let scratch: string | undefined;
const spawned: SpawnedMspConnection[] = [];

function scratchDir(): string {
  scratch ??= mkdtempSync(join(tmpdir(), "muse-fixture-"));
  return scratch;
}

function pidFile(): string {
  return join(scratchDir(), "host.pid");
}

function pid(): number {
  return Number(readFileSync(pidFile(), "utf8"));
}

/** Whether the process with this pid still exists. */
function alive(pidToCheck: number): boolean {
  try {
    process.kill(pidToCheck, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Spawn the fixture and complete the handshake.
 *
 * `shutdownTimeoutMs: 0` skips the drain window: these hosts are not going to
 * drain anything, and the default 30 s budget would outlast the test.
 */
async function spawnFixture(mode: string): Promise<SpawnedMspConnection> {
  const connection = await spawnMspConnection({
    command: HOST_RUNTIME,
    args: [FIXTURE],
    env: { ...process.env, FAKE_MSP_MODE: mode, FAKE_MSP_PIDFILE: pidFile() },
    shutdownTimeoutMs: 0,
  }).initialize({
    clientInfo: { name: "open_test", version: "0" },
    capabilities: { requestedCapabilities: ["sessionMcp"] },
  });
  spawned.push(connection);
  return connection;
}

/** Resolve with the promise's outcome, or with `"pending"` once `ms` pass. */
async function settleWithin<T>(promise: Promise<T>, ms: number): Promise<"settled" | "pending"> {
  return Promise.race([
    promise.then(
      () => "settled" as const,
      () => "settled" as const,
    ),
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), ms)),
  ]);
}

afterEach(async () => {
  for (const connection of spawned.splice(0)) await connection.close().catch(() => undefined);
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe("the process behind the seam", () => {
  // SIGSTOP, SIGTERM and process-group signalling are POSIX: on Windows the
  // first two are not the same signals, so these two results are measured on
  // Linux only (and macOS by construction, not by run). The inheritance test
  // below is platform-neutral.
  const posixOnly = process.platform === "win32" ? test.skip : test;

  posixOnly(
    "a transport EOF leaves the process alive until something closes it",
    async () => {
      const connection = await spawnFixture("eof-alive");

      // The premise of the whole arm: stdout ends, the process does not.
      await connection.connection.closed;
      expect(alive(pid())).toBe(true);
      expect(await settleWithin(connection.exited, 100)).toBe("pending");

      // And the SDK's own close is what ends it, by the ladder rather than by
      // luck: the fixture only exits when SIGTERM reaches it.
      await connection.close();
      expect(existsSync(`${pidFile()}.term`)).toBe(true);
      expect(alive(pid())).toBe(false);
    },
    15_000,
  );

  posixOnly(
    "a frozen host settles nothing, including an interrupt",
    async () => {
      const connection = await spawnFixture("freeze");

      // Both probes are left unattended on purpose, so their eventual rejection
      // (the close in `afterEach` finishing the connection) is swallowed here
      // rather than surfacing as an unhandled rejection in a later test.
      const listed = connection.connection.request("session/list", {}).catch(() => undefined);
      expect(await settleWithin(listed, 1_000)).toBe("pending");

      // Interrupt rides the same stdin, so a host that stopped reading cannot
      // be cancelled either. This is the fact the live-turn-timeout row rests on.
      const interrupted = connection.connection.command(
        "turn/interrupt",
        { sessionId: "session-1" },
        { maxAttempts: 1 },
      ).catch(() => undefined);
      expect(await settleWithin(interrupted, 500)).toBe("pending");

      // Nothing in the seam noticed the freeze: only ending the process frees
      // the callers above.
      expect(await settleWithin(connection.connection.closed, 100)).toBe("pending");
      await connection.close();
      expect(alive(pid())).toBe(false);
    },
    15_000,
  );

  test(
    "a spawned host inherits NODE_EXTRA_CA_CERTS from the parent",
    async () => {
      const caFile = join(scratchDir(), "fixture-ca.pem");
      const previous = process.env.NODE_EXTRA_CA_CERTS;
      process.env.NODE_EXTRA_CA_CERTS = caFile;
      try {
        // The exact call `MuseHost.spawn` makes, with `env` omitted: the SDK
        // drops the key from the spawn options entirely (`host.ts` forwards it
        // only when the caller set one), so this is inheritance or nothing.
        // Not through `MuseHost` itself: it runs `<museBin> serve <args>`, and
        // the fixture is the whole program here, not a subcommand of one.
        const connection = await spawnMspConnection({
          command: HOST_RUNTIME,
          args: [FIXTURE],
        }).initialize({
          clientInfo: { name: "open_test", version: "0" },
          capabilities: { requestedCapabilities: ["sessionMcp"] },
        });
        spawned.push(connection);
        expect(connection.initializeResult.userAgent).toBe(caFile);
      } finally {
        if (previous === undefined) delete process.env.NODE_EXTRA_CA_CERTS;
        else process.env.NODE_EXTRA_CA_CERTS = previous;
      }
    },
    15_000,
  );
});
