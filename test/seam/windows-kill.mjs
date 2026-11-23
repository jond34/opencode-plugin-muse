#!/usr/bin/env node
/**
 * E12: what `child.kill()` does to a `.cmd`'s grandchild on Windows.
 *
 * The SDK's Windows close is child-only, with no `taskkill` (round 21,
 * E-R21-07). This script observes the platform behaviour that sits under it,
 * without the SDK and without a Muse install:
 *
 *   - a `.cmd` that starts `ping` is killed; if the `ping` survives, the
 *     grandchild is the orphan the SDK would leave;
 *   - a native exe (a copy of `ping.exe`) is killed; its own process should end.
 *
 * Informational and timeboxed: hosted runners use job objects, which may reap
 * the tree a desktop would not, so a clean result here is "inconclusive", not
 * "no orphan". It never fails the job — it prints what it saw.
 */
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** PIDs of live `ping.exe` processes, or undefined when the table is unreadable. */
function pingPids() {
  try {
    const out = execFileSync("tasklist", ["/FI", "IMAGENAME eq PING.EXE", "/FO", "CSV", "/NH"], {
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
    });
    return [...out.matchAll(/"PING\.EXE","(\d+)"/gi)].map((match) => Number(match[1]));
  } catch {
    return undefined;
  }
}

function killTree(pid) {
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      timeout: 10_000,
      windowsHide: true,
    });
  } catch {
    // Already gone, or the runner refused; nothing left to do.
  }
}

const dir = mkdtempSync(join(tmpdir(), "muse-kill-"));

async function observe(label, start, readPids) {
  const before = readPids();
  if (before === undefined) return "inconclusive";
  const child = start();
  await delay(1500);
  const during = readPids() ?? [];
  const spawned = during.filter((pid) => !before.includes(pid));
  if (spawned.length === 0) {
    child.kill();
    return "inconclusive";
  }
  child.kill();
  await delay(2000);
  const after = readPids() ?? [];
  const survivors = spawned.filter((pid) => after.includes(pid));
  for (const pid of survivors) killTree(pid);
  console.log(`E12 ${label}: child=${child.pid} pings=${spawned.length} survivors=${survivors.length}`);
  return survivors.length > 0 ? "orphan" : "clean";
}

const deadline = setTimeout(() => {
  console.log("E12 verdict: inconclusive (timeboxed out)");
  process.exit(0);
}, 60_000);

const shim = join(dir, "spawner.cmd");
writeFileSync(shim, "@echo off\r\nping -n 30 127.0.0.1 >nul\r\n");
const shimVerdict = await observe(
  "cmd-shim",
  () => spawn("cmd.exe", ["/d", "/s", "/c", shim], { stdio: "ignore", windowsHide: true }),
  pingPids,
);

const native = join(dir, "native.exe");
copyFileSync(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "ping.exe"), native);
const nativeVerdict = await observe(
  "native-exe",
  () => spawn(native, ["-n", "30", "127.0.0.1"], { stdio: "ignore", windowsHide: true }),
  pingPids,
);

clearTimeout(deadline);
console.log(`E12 verdict: shim=${shimVerdict} native=${nativeVerdict}`);
process.exit(0);
