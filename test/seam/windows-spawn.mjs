#!/usr/bin/env node
/**
 * E11: the Windows spawn contract, observed on a real Windows runner.
 *
 * Three claims, in the order that matters:
 *
 *   1. A normal install's `muse` on PATH is a `.cmd` shim, and Node cannot
 *      spawn it. The bare name and the explicit `.cmd` may fail differently
 *      (libuv searches PATH for `.exe` only, so the bare name is likely ENOENT
 *      and the explicit file EINVAL); both are recorded, and either is enough
 *      for "not spawnable".
 *   2. `resolveMuseBin` reads `.muse-version` and returns the native binary
 *      beside the shim, with source `version-file`.
 *   3. That binary spawns and runs.
 *
 * No Muse, no login, no licence: the "native binary" is a copy of
 * `hostname.exe`, so a successful spawn prints the machine name.
 *
 * Run it with plain `node` after `npm run build` — the contract under test is
 * Node's, and bun's spawn is a different implementation.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { resolveMuseBinFromProcess } from "../../dist/host.js";

const VERSION = "9.9.9-R1.1";
const STUB = `muse-bin-${VERSION}.exe`;
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
}

/** `spawnSync` returns some errors and throws others (EINVAL is thrown). */
function attempt(file, args) {
  try {
    const run = spawnSync(file, args, { encoding: "utf8", timeout: 15_000, windowsHide: true });
    return { code: run.error?.code ?? undefined, status: run.status ?? undefined, stdout: run.stdout ?? "" };
  } catch (error) {
    return { code: error.code ?? error.name, status: undefined, stdout: "" };
  }
}

const dir = mkdtempSync(join(tmpdir(), "muse-seam-"));
writeFileSync(join(dir, "muse.cmd"), "@echo off\r\nexit /b 0\r\n");
const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
copyFileSync(join(systemRoot, "System32", "hostname.exe"), join(dir, STUB));
writeFileSync(join(dir, ".muse-version"), `${VERSION}\r\n`);

// The runner may have MUSE_BIN set for other jobs; this test is about PATH.
delete process.env.MUSE_BIN;
process.env.PATH = `${dir};${process.env.PATH ?? ""}`;
console.log(`E11 fixture: ${dir}`);

// Claim 1: the shim is not spawnable, however it is named.
const bare = attempt("muse", ["--version"]);
check(
  "shim bare name is not spawnable",
  bare.status === undefined,
  bare.code === undefined ? `spawned anyway (status ${bare.status})` : bare.code,
);
const explicit = attempt(join(dir, "muse.cmd"), ["--version"]);
check(
  "shim explicit .cmd is not spawnable",
  explicit.status === undefined,
  explicit.code === undefined ? `spawned anyway (status ${explicit.status})` : explicit.code,
);

// Claim 2: the resolver follows the installer's pointer.
const bin = resolveMuseBinFromProcess("win32", process.env);
const expected = join(dir, STUB);
check("resolver source is version-file", bin.source === "version-file", bin.source);
check("resolver returns the named binary", bin.command === expected, bin.command);

// Claim 3: that binary is spawnable.
const ran = attempt(bin.command, []);
check("resolved binary spawns", ran.status === 0, `status ${ran.status ?? "none"} ${ran.code ?? ""}`.trim());
check("resolved binary runs", ran.stdout.trim() === hostname(), JSON.stringify(ran.stdout.trim()));

const failed = results.filter((result) => !result.ok);
console.log(`E11 verdict: ${failed.length === 0 ? "pass" : "fail"} (${results.length - failed.length}/${results.length} claims)`);
process.exit(failed.length === 0 ? 0 : 1);
