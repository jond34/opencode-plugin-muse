/**
 * D25: the three Windows behaviours, as far as Linux can hold them.
 *
 * None of these is measurable on this machine — there is no Windows host here,
 * and U16 is the row that would run the suite there. What a test can pin is that
 * the plugin *says* the right thing for each platform, and that the platform is
 * injected rather than read from `process` inside the code under test, so the
 * Windows branch is reachable by a test on any OS.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shutdownLadder } from "../src/host.js";
import { describeFilePermissions, ledgerPath } from "../src/usage-ledger.js";

const SCRIPT = join(import.meta.dir, "..", "scripts", "doctor.ts");

describe("the shutdown ladder is platform-shaped", () => {
  test("POSIX keeps the graceful rung", () => {
    expect(shutdownLadder("linux")).toEqual(["stdin-eof", "drain", "sigterm", "sigkill"]);
    expect(shutdownLadder("darwin")).toEqual(["stdin-eof", "drain", "sigterm", "sigkill"]);
  });

  test("Windows collapses the last two into one hard kill", () => {
    // Node: SIGTERM/SIGKILL/SIGINT "terminate the process forcefully and
    // abruptly", and SIGTERM is not supported at all.
    expect(shutdownLadder("win32")).toEqual(["stdin-eof", "drain", "hard-kill"]);
    expect(shutdownLadder("win32")).not.toContain("sigterm");
  });
});

describe("file permissions are described, not assumed", () => {
  test("POSIX reports the mode the plugin writes", () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-mode-"));
    const file = join(dir, "usage.jsonl");
    writeFileSync(file, "{}\n", { mode: 0o600 });
    expect(describeFilePermissions(file, "linux")).toBe("0600");
  });

  test("Windows reports the inherited ACL, not a mode it cannot set", () => {
    // fs.chmod on Windows: "only the write permission can be changed".
    expect(describeFilePermissions("/nonexistent", "win32")).toContain("inherited ACL");
    expect(describeFilePermissions("/nonexistent", "win32")).not.toMatch(/^0[0-7]{3}$/);
  });

  test("a ledger that does not exist yet says so", () => {
    const env = { XDG_STATE_HOME: mkdtempSync(join(tmpdir(), "muse-state-")) };
    expect(describeFilePermissions(ledgerPath(new Date(), env), "linux")).toBe("unknown (no file yet)");
  });
});

describe("the doctor says which platform it is on", () => {
  test("--offline reports the ladder and the ledger mode", () => {
    const root = mkdtempSync(join(tmpdir(), "muse-doctor-platform-"));
    const state = mkdtempSync(join(tmpdir(), "muse-state-"));
    const result = Bun.spawnSync({
      cmd: [process.execPath, SCRIPT, "--json", "--offline"],
      cwd: root,
      env: { ...process.env, XDG_STATE_HOME: state },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout.toString()) as {
      checks: Array<{ id: string; detail: string }>;
    };
    const row = report.checks.find((check) => check.id === "platform");
    expect(row).toBeDefined();
    expect(row?.detail).toContain(process.platform);
    expect(row?.detail).toContain(shutdownLadder().join(" -> "));
    if (process.platform === "win32") {
      expect(row?.detail).toContain("UAC prompt");
    } else {
      // The UAC sentence is Windows-only: a POSIX run must not claim it.
      expect(row?.detail).not.toContain("UAC prompt");
    }
  });
});
