/**
 * E42: which promise is `close()` waiting on after a transport EOF on Windows?
 *
 * The fixture ends stdout and keeps its process alive (`eof-alive`). The test
 * arm at `test/host-process.test.ts` is skipped on win32 because `close()` did
 * not settle within 15 s even though the pid died. This probe records the state
 * at the moment `close()` is called: whether `closed` and `exited` had already
 * settled, whether the pid was alive, and whether `close()` settles within a
 * diagnostic 10 s.
 *
 * This is a measurement, not a gate. It never changes the test's 15 s budget.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnMspConnection } from "@muse-code/sdk";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "..", "fixtures", "fake-msp-host.mjs");
const DELAY_MS = 10_000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function settleWithin(promise, ms) {
  return Promise.race([
    promise.then(
      () => "settled",
      () => "settled",
    ),
    delay(ms).then(() => "pending"),
  ]);
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const dir = mkdtempSync(join(tmpdir(), "muse-close-eof-"));
const pidFile = join(dir, "host.pid");
const connection = await spawnMspConnection({
  command: process.execPath,
  args: [FIXTURE],
  env: {
    ...process.env,
    FAKE_MSP_MODE: "eof-alive",
    FAKE_MSP_PIDFILE: pidFile,
  },
  shutdownTimeoutMs: 0,
}).initialize({
  clientInfo: { name: "e42_probe", version: "0" },
  capabilities: { requestedCapabilities: ["sessionMcp"] },
});

const pid = Number(readFileSync(pidFile, "utf8"));
const closed = await settleWithin(connection.connection.closed, DELAY_MS);
const exitedBeforeClose = await settleWithin(connection.exited, 50);
const pidAliveBeforeClose = alive(pid);
const started = Date.now();
const close = await settleWithin(connection.close(), DELAY_MS);
const elapsedMs = Date.now() - started;
const pidAliveAfter = alive(pid);

console.log(
  JSON.stringify({
    closed,
    exitedBeforeClose,
    pidAliveBeforeClose,
    close,
    pidAliveAfter,
    elapsedMs,
  }),
);

// Leave no fixture behind, and do not let an unresolved SDK promise hold the
// probe open after the evidence is printed.
if (pidAliveAfter) {
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Already gone between the check and the signal.
  }
}
rmSync(dir, { recursive: true, force: true });
process.exit(0);
