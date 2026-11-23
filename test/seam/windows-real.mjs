/**
 * E16a/E16c: the real Muse install on a hosted Windows runner.
 *
 * E16a asks whether the vendor installer produces the layout the resolver
 * expects, and whether that binary is spawnable. E16c asks whether the plugin's
 * own `close()` reaps the process tree a real `muse serve` builds.
 *
 * No credential is involved, and none is wanted: `src/host-config.ts` deletes
 * `META_API_KEY` from the child environment, so a key would test a path the
 * plugin does not ship. The handshake below stays local to the host process; a
 * model turn needs the user's browser login, which has no place on a runner.
 *
 * The E16a assertions are gating. The E16c measurements are printed, not
 * asserted: a hosted runner may reap the tree with a job object, so "no
 * survivor" is inconclusive rather than good news.
 *
 * Run after `npm run build`, with Muse installed by the vendor script.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
import { MuseHost, museBinFailure, resolveMuseBinFromProcess } from "../../dist/host.js";

let failures = 0;

/** Record one claim: a pass prints, a failure counts and prints its detail. */
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail === "" ? "" : ` — ${detail}`}`);
  if (!ok) failures += 1;
}

/** The installer's target, from the vendor launcher's own `$dir`. */
function installDir() {
  const local = process.env.LOCALAPPDATA;
  return local === undefined ? undefined : win32.join(local, "Programs", "muse");
}

/**
 * Every running Muse process, as `pid|image|parentPid`.
 *
 * `tasklist` does not accept wildcards and the binary's name carries a version
 * (`muse-bin-1.4.25-R9361.1.exe`). CIM also reports the parent, which is the
 * whole point of an orphan check: the survivor's parent is the process that
 * should have reaped it.
 */
function museProcesses() {
  const script =
    "Get-CimInstance Win32_Process -Filter \"Name LIKE 'muse%'\" | ForEach-Object { '{0}|{1}|{2}' -f $_.ProcessId, $_.Name, $_.ParentProcessId }";
  try {
    const out = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
      encoding: "utf8",
      timeout: 30_000,
    });
    return out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (error) {
    console.log(`process query failed: ${(error instanceof Error ? error.message : String(error)).split("\n")[0]}`);
    return [];
  }
}

const pidOf = (row) => Number.parseInt(row.split("|")[0], 10);
const dir = installDir();
console.log(`install dir: ${dir ?? "(LOCALAPPDATA unset)"}`);
if (dir !== undefined) {
  try {
    const rows = readdirSync(dir);
    console.log(`layout (${rows.length}): ${rows.sort().join(", ")}`);
  } catch (error) {
    console.log(`layout: unreadable (${error instanceof Error ? error.message : String(error)})`);
  }
  try {
    console.log(`.muse-version: ${readFileSync(join(dir, ".muse-version"), "utf8").trim()}`);
  } catch {
    console.log(".muse-version: absent");
  }
  // The installer prepends its directory to the *user* PATH. A workflow step
  // does not re-read that, so a fresh shell is simulated here; without it the
  // resolver would see no shim and fall back, which is true of this process and
  // false of the user's next shell.
  const path = process.env.PATH ?? "";
  if (!path.toLowerCase().split(";").includes(dir.toLowerCase())) {
    process.env.PATH = `${dir};${path}`;
    console.log("PATH: install dir prepended (simulating a new shell after install)");
  }
}

// E16a.1: the resolver finds the installed binary without help.
const bin = resolveMuseBinFromProcess("win32", process.env);
const located = ["version-file", "path-exe", "newest"];
console.log(`resolved: source=${bin.source} command=${bin.command} version=${bin.version ?? "(none)"}`);
check("resolver found the installer's binary", located.includes(bin.source), `source=${bin.source}`);
check("resolver did not need the fallback", museBinFailure(bin) === undefined, museBinFailure(bin) ?? "");
if (dir !== undefined) {
  check("binary lives in the install dir", bin.command.startsWith(dir), bin.command);
}

// E16a.2: the binary runs.
const version = spawnSync(bin.command, ["--version"], { encoding: "utf8", timeout: 60_000 });
const versionText = `${version.stdout ?? ""}${version.stderr ?? ""}`.trim().split(/\r?\n/)[0] ?? "";
console.log(`--version: status=${version.status} first="${versionText}"`);
check(
  "binary runs --version",
  version.status === 0,
  `status ${version.status} ${version.error?.message ?? ""}`.trim(),
);
check("--version names Muse", /Muse/i.test(versionText), versionText);

// E16a.3: a real subcommand, not just `--version`.
const scratch = mkdtempSync(join(tmpdir(), "muse-seam-"));
const doc = join(scratch, "policy.json");
writeFileSync(doc, `${JSON.stringify({ schema_version: 1 }, null, 1)}\n`);
const validate = spawnSync(bin.command, ["config", "validate", "--plane", "policy", "--file", doc], {
  encoding: "utf8",
  timeout: 60_000,
});
const validateOut = `${validate.stdout ?? ""}${validate.stderr ?? ""}`
  .trim()
  .split(/\r?\n/)
  .slice(0, 3)
  .join(" | ");
console.log(`config validate: status=${validate.status} "${validateOut}"`);
check("binary runs config validate", validate.status === 0, `status ${validate.status}`);

// E16a.4: the negative half — the shim is not spawnable, so the resolver is not
// optional. Informational only: it depends on the shim surviving on PATH.
const bare = spawnSync("muse", ["--version"], { encoding: "utf8", timeout: 60_000, shell: false });
console.log(`bare muse: ${bare.error?.code ?? `status ${bare.status}`} (informational)`);

/**
 * Poll the process table for a settled window, returning the last sample.
 *
 * E27: a single sample three seconds after close cannot see a grandchild that a
 * launcher outlives, and cannot tell "reaped" from "not dead yet". The loop
 * samples every 250 ms for the whole window and returns every row it saw, so the
 * verdict is "nothing from this run was alive at any sample".
 */
async function sampleFor(ms) {
  const started = Date.now();
  const seen = new Map();
  let last = [];
  while (Date.now() - started < ms) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    last = museProcesses();
    for (const row of last) seen.set(pidOf(row), row);
  }
  return { last, seen: [...seen.values()], elapsedMs: Date.now() - started };
}

// E16c: the real serve lifecycle, closed exactly as the plugin closes it.
// Three cycles: one clean close can be a race that happened to lose, and a
// survivor that appears once in three is a flake in the product, not a pass.
const before = museProcesses();
console.log(`E16c before: [${before.join(" ")}]`);
const known = new Set(before.map(pidOf));
const cycleWindows = [60_000, 20_000, 20_000];
let handshakes = 0;
let probesSawHost = 0;
const survivorPids = new Set();

for (const [index, windowMs] of cycleWindows.entries()) {
  const cycle = index + 1;
  let during = [];
  try {
    const host = await MuseHost.spawn({
      museBin: bin.command,
      cwd: scratch,
      shutdownTimeoutMs: 5_000,
      clientName: "opencode_muse_seam",
      clientVersion: "0.0.0-seam",
      onStderr: (chunk) => process.stderr.write(`[host stderr] ${chunk}`),
    });
    handshakes += 1;
    console.log(
      `cycle ${cycle} handshake: museHome=${host.museHome} granted=[${host.grantedCapabilities().join(", ")}]`,
    );
    during = museProcesses();
    if (during.length > 0) probesSawHost += 1;
    console.log(`cycle ${cycle} during: [${during.join(" ")}]`);
    await host.close();
    console.log(`cycle ${cycle} close: returned`);
  } catch (error) {
    check(
      `cycle ${cycle} real serve completed the handshake`,
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  // Every pid this cycle ever showed that was not running before it, and still
  // runs in the window's last sample, is a survivor. A pid that vanished from
  // the table was reaped by the close path.
  const sampled = await sampleFor(windowMs);
  const lastPids = new Set(sampled.last.map(pidOf));
  const seenNow = new Set([...during, ...sampled.seen].filter((row) => !known.has(pidOf(row))).map(pidOf));
  const alive = sampled.last.filter((row) => seenNow.has(pidOf(row)) && lastPids.has(pidOf(row)));
  for (const pid of alive.map(pidOf)) survivorPids.add(pid);
  console.log(
    `cycle ${cycle} sampled ${sampled.elapsedMs} ms: last=[${sampled.last.join(" ")}] survivors=[${alive.join(" ")}]`,
  );
}

check("E16c three cycles completed the handshake", handshakes === cycleWindows.length, `${handshakes}/3`);
// A live host must be visible to the probe. If it is not, the survivor count
// below means nothing, so say that instead of reporting a clean close.
check("E16c probe saw the live host", probesSawHost > 0, `cycles=${probesSawHost}/${cycleWindows.length}`);

const survivors = [...survivorPids]
  .map((pid) => museProcesses().find((row) => pidOf(row) === pid))
  .filter((row) => row !== undefined);
console.log(`E16c survivors=[${survivors.join(" ")}]`);

if (survivors.length > 0) {
  for (const row of survivors) {
    const pid = pidOf(row);
    const killed = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { encoding: "utf8" });
    console.log(`taskkill ${pid}: status=${killed.status} ${(killed.stdout ?? "").trim()}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  const remainder = museProcesses().filter((row) => !before.some((old) => pidOf(old) === pidOf(row)));
  console.log(`E16c after taskkill: survivors=[${remainder.join(" ")}]`);
  console.log(
    remainder.length === 0
      ? "E16c: close() left an orphan and taskkill /T /F cleared it"
      : "E16c: close() left an orphan that taskkill /T /F did not clear",
  );
} else if (probesSawHost > 0) {
  console.log("E16c: no survivor at any sample — 60 s for cycle 1, 20 s for 2 and 3");
} else {
  console.log("E16c: measurement invalid — the probe never saw the host");
}

rmSync(scratch, { recursive: true, force: true });

console.log(failures === 0 ? "E16a: all assertions passed" : `E16a: ${failures} assertion(s) failed`);
process.exit(failures === 0 ? 0 : 1);
