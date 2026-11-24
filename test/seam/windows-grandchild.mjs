/**
 * E38: does a detached grandchild survive `host.close()` on Windows, and does
 * the seam's sampler see it?
 *
 * The fixture spawns a sleeper detached from itself, then stays alive as a fake
 * MSP host. After the handshake, this script closes the host and samples both
 * the sleeper's pid and the Windows process table for 60 s, then 20 s twice.
 * That is the shape a real host's tool subprocess can take: the plugin owns the
 * host pid, not the grandchild.
 *
 * This is a measurement, not a gate: a hosted runner may reap the tree with a
 * job object. `taskkill /T` is tried only against the fixture's own recorded
 * host pid, and only after checking the sleeper's creation time, because `/T`
 * rebuilds the tree from numeric parent ids and a reused pid would hit an
 * unrelated process.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnMspConnection } from "@muse-code/sdk";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "..", "fixtures", "fake-msp-host.mjs");

function processTable() {
  const script =
    "Get-CimInstance Win32_Process | ForEach-Object { '{0}|{1}|{2}|{3}' -f $_.ProcessId, $_.Name, $_.ParentProcessId, $_.CreationDate.ToUniversalTime().ToString('o') }";
  try {
    const out = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
      encoding: "utf8",
      timeout: 30_000,
    });
    return {
      ok: true,
      rows: out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [pid, image, ppid, created] = line.split("|");
          return {
            pid: Number.parseInt(pid, 10),
            image: image ?? "",
            ppid: Number.parseInt(ppid, 10),
            created: created ?? "",
          };
        })
        .filter((row) => Number.isFinite(row.pid)),
    };
  } catch (error) {
    console.log(`process query failed: ${String(error).split("\n")[0]}`);
    return { ok: false, rows: [] };
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const dir = mkdtempSync(join(tmpdir(), "muse-grandchild-"));
const pidFile = join(dir, "host.pid");
const connection = await spawnMspConnection({
  command: process.execPath,
  args: [FIXTURE],
  env: {
    ...process.env,
    FAKE_MSP_MODE: "spawn-detached",
    FAKE_MSP_PIDFILE: pidFile,
  },
  shutdownTimeoutMs: 0,
}).initialize({
  clientInfo: { name: "e38_probe", version: "0" },
  capabilities: { requestedCapabilities: ["sessionMcp"] },
});

const hostPid = Number(readFileSync(pidFile, "utf8"));
let grandchildPid;
for (let i = 0; i < 40 && grandchildPid === undefined; i += 1) {
  try {
    grandchildPid = Number(readFileSync(`${pidFile}.grandchild`, "utf8"));
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
}
if (grandchildPid === undefined) {
  console.log("FAIL the fixture did not record a grandchild pid");
  await connection.close().catch(() => undefined);
  process.exit(1);
}

const before = processTable();
const beforeRow = before.rows.find((row) => row.pid === grandchildPid);
console.log(
  JSON.stringify({
    hostPid,
    grandchildPid,
    grandchildSeenBeforeClose: beforeRow !== undefined,
    grandchildCreated: beforeRow?.created ?? null,
    tableOk: before.ok,
  }),
);

const closeResult = await Promise.race([
  connection.close().then(() => "settled", () => "settled"),
  new Promise((resolve) => setTimeout(() => resolve("pending"), 10_000)),
]);
console.log(`close=${closeResult} hostAlive=${alive(hostPid)}`);

const samples = [];
async function sample(label, ms) {
  const until = Date.now() + ms;
  let next = 0;
  while (Date.now() < until) {
    const table = processTable();
    const row = table.rows.find((item) => item.pid === grandchildPid);
    const linked = table.rows.some((item) => item.ppid === hostPid);
    samples.push({
      label,
      at: Date.now(),
      directAlive: alive(grandchildPid),
      inTable: row !== undefined,
      linked,
      tableOk: table.ok,
    });
    if (Date.now() < next) await new Promise((resolve) => setTimeout(resolve, next - Date.now()));
    next = Date.now() + 250;
  }
}

await sample("60s", 60_000);
await sample("20s-a", 20_000);
await sample("20s-b", 20_000);
rmSync(dir, { recursive: true, force: true });

const stillAlive = alive(grandchildPid);
const seen = samples.some((item) => item.inTable);
const last = samples.at(-1);
console.log(
  JSON.stringify({
    samples: samples.length,
    failedSamples: samples.filter((item) => !item.tableOk).length,
    directAliveAtEnd: stillAlive,
    inTableAtEnd: last?.inTable ?? null,
    everInTable: seen,
    last,
  }),
);

// The sleeper is the fixture's own recorded grandchild, checked against the
// creation time read before close; a mismatch means the pid was reused.
if (stillAlive) {
  const now = processTable().rows.find((row) => row.pid === grandchildPid);
  const sameProcess = beforeRow !== undefined && now?.created === beforeRow.created;
  console.log(`taskkill-target sameProcess=${sameProcess} created=${now?.created ?? "(gone)"}`);
  if (sameProcess) {
    const kill = spawnSync("taskkill", ["/PID", String(hostPid), "/T", "/F"], { encoding: "utf8" });
    console.log(`taskkill /T host status=${kill.status} out=${(kill.stdout ?? "").trim()}`);
    console.log(`afterTaskkill directAlive=${alive(grandchildPid)}`);
    spawnSync("taskkill", ["/PID", String(grandchildPid), "/T", "/F"], { encoding: "utf8" });
  }
}
