import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  hookGateRefusal,
  hooksDigest,
  hooksFileHandlers,
  hooksFilePath,
  hooksFileTrusted,
} from "../src/hooks.js";

/**
 * E-D12: is the doctor's output stable and secret-free?
 *
 * Every run is `--offline`, so these tests never spawn a host. The online shape
 * was checked by hand against the installed CLI; what a test can hold is the
 * contract: one row per check, no home path, no credential shape, and two runs
 * that differ only in their timestamp.
 */

const SCRIPT = join(import.meta.dir, "..", "scripts", "doctor.ts");

function run(args: string[], cwd: string, state: string) {
  const result = Bun.spawnSync({
    cmd: [process.execPath, SCRIPT, ...args],
    cwd,
    env: { ...process.env, XDG_STATE_HOME: state },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() };
}

function workspace(): { root: string; state: string } {
  const root = mkdtempSync(join(tmpdir(), "muse-doctor-"));
  const state = mkdtempSync(join(tmpdir(), "muse-doctor-state-"));
  return { root, state };
}

function parse(out: string): {
  asOf: string;
  checks: Array<{ id: string; status: string; detail: string; remediation?: string }>;
  hooks: { file: string | null; trusted: boolean } | null;
} {
  return JSON.parse(out);
}

describe("doctor --json", () => {
  test("reports one row per check and skips the host offline", () => {
    const { root, state } = workspace();
    const { code, out } = run(["--json", "--offline"], root, state);
    expect(code).toBe(0);
    const report = parse(out);
    const ids = report.checks.map((check) => check.id);
    expect(ids).toContain("versions");
    expect(ids).toContain("containment");
    expect(ids).toContain("host");
    expect(ids).toContain("ledger");
    expect(report.checks.find((check) => check.id === "host")?.status).toBe("skipped");
    expect(report.hooks?.file).toBeNull();
  });

  test("two runs differ only in their timestamp", () => {
    const { root, state } = workspace();
    const first = run(["--json", "--offline"], root, state);
    const second = run(["--json", "--offline"], root, state);
    const strip = (out: string) => out.replace(/"asOf": "[^"]*"/, '"asOf": "X"');
    expect(strip(first.out)).toBe(strip(second.out));
  });

  test("no home path and no credential shape reaches the output", () => {
    const { root, state } = workspace();
    const { out } = run(["--json", "--offline"], root, state);
    expect(out).not.toContain(homedir());
    expect(out).not.toMatch(/Bearer\s+[A-Za-z0-9]/);
    expect(out).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
  });
});

describe("doctor trust flags", () => {
  test("--trust-hooks records the handlers the session gate then accepts", () => {
    const { root, state } = workspace();
    mkdirSync(join(root, ".muse"), { recursive: true });
    writeFileSync(
      hooksFilePath(root),
      '{"hooks":{"sessionStart":[{"hooks":[{"type":"command","command":"bun run setup"}]}]}}',
    );
    const env = { ...process.env, XDG_STATE_HOME: state };

    expect(hooksFileTrusted(root, env)).toBe(false);
    const { code, out } = run(["--json", "--offline", "--trust-hooks"], root, state);
    expect(code).toBe(0);
    expect(hooksFileTrusted(root, env)).toBe(true);
    // The record is per handler, and the doctor says how many it wrote.
    expect(hooksFileHandlers(hooksFilePath(root))).toHaveLength(1);
    expect(parse(out).checks.find((check) => check.id === "hooks-trust")?.detail).toContain(
      "recorded 1 handler(s)",
    );
    const projectRow = {
      enabled: true,
      event: "sessionStart",
      handlerKind: "project",
      key: "k",
    };
    expect(hookGateRefusal([projectRow], root, env)).toBeNull();
  });

  test("--trust-hooks refuses a file with no readable handler, and records nothing", () => {
    const { root, state } = workspace();
    mkdirSync(join(root, ".muse"), { recursive: true });
    writeFileSync(hooksFilePath(root), '{"hooks":{}}');
    const env = { ...process.env, XDG_STATE_HOME: state };
    const { code, out } = run(["--json", "--offline", "--trust-hooks"], root, state);
    expect(code).toBe(1);
    expect(parse(out).checks.find((check) => check.id === "hooks-trust")?.detail).toContain(
      "declares no hook handler",
    );
    expect(hooksFileTrusted(root, env)).toBe(false);
  });

  test("--forget-hooks revokes it", () => {
    const { root, state } = workspace();
    mkdirSync(join(root, ".muse"), { recursive: true });
    writeFileSync(
      hooksFilePath(root),
      '{"hooks":{"sessionStart":[{"hooks":[{"type":"command","command":"bun run setup"}]}]}}',
    );
    const env = { ...process.env, XDG_STATE_HOME: state };
    run(["--json", "--offline", "--trust-hooks"], root, state);
    expect(hooksFileTrusted(root, env)).toBe(true);
    const { code } = run(["--json", "--offline", "--forget-hooks"], root, state);
    expect(code).toBe(0);
    expect(hooksFileTrusted(root, env)).toBe(false);
  });

  test("trusting a workspace with no hooks file fails, with a reason", () => {
    const { root, state } = workspace();
    const { code, out } = run(["--json", "--offline", "--trust-hooks"], root, state);
    expect(code).toBe(1);
    const row = parse(out).checks.find((check) => check.id === "hooks-trust");
    expect(row?.status).toBe("fail");
    expect(row?.detail).toContain("no hooks file");
  });
});
