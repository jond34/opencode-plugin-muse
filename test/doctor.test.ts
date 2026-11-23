import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { MuseHost } from "../src/host.js";
import {
  hookGateRefusal,
  hooksDigest,
  hooksFileHandlers,
  hooksFilePath,
  hooksFileTrusted,
} from "../src/hooks.js";
import { pluginRow, postureCheck } from "../scripts/doctor.js";

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

/**
 * D37: the posture row reads the host on the doctor's own connection, and says
 * what it cannot see. These stub the connection; the live read is E-D37.
 */
describe("doctor posture row", () => {
  const host = (request: () => Promise<unknown>) =>
    ({ connection: { request } }) as unknown as MuseHost;
  const catalog = (ids: string[]) => async () => ({ profiles: ids.map((profileId) => ({ profileId })) });

  test("a sandboxed profile is ok, and the row names the catalog and the limit", async () => {
    const row = await postureCheck(host(catalog([":read-only", ":auto-review"])), {
      permissionState: {
        profileId: ":auto-review",
        axes: { filesystem: "sandboxed", network: "off", reviewer: "autoReview" },
      },
    });
    expect(row.id).toBe("posture");
    expect(row.status).toBe("ok");
    expect(row.detail).toContain(":auto-review");
    expect(row.detail).toContain("filesystem sandboxed, network off");
    expect(row.detail).toContain("catalog :read-only, :auto-review");
    expect(row.detail).toContain("not saved approvals or a managed policy");
    // The axes fence Muse's own shell; a bridged call runs in opencode's process.
    expect(row.detail).toContain("not the calls this plugin bridges");
    // A `plugin.use` deny is unobservable by construction: nothing of the plugin
    // runs, so the row can only name the shape of the failure.
    expect(row.detail).toContain("a policy that denies this plugin cannot be seen from inside it");
    expect(row.detail).toContain("fails as Model unavailable");
    expect(row.remediation).toBeUndefined();
  });

  test("an unrestricted default warns, because the plugin pins no profile", async () => {
    const row = await postureCheck(host(catalog([":unrestricted"])), {
      permissionState: {
        profileId: ":unrestricted",
        axes: { filesystem: "unrestricted", network: "enabled", reviewer: "none" },
      },
    });
    expect(row.status).toBe("warn");
    expect(row.remediation).toContain(":auto-review");
  });

  test("a host that serves no state is skipped, not failed", async () => {
    const row = await postureCheck(host(catalog([])), {});
    expect(row.status).toBe("skipped");
    expect(row.detail).toContain("no permissionState");
  });

  test("a refused catalog still reports the state it did read", async () => {
    const row = await postureCheck(
      host(async () => {
        throw new Error("permissionProfile/list requires experimentalApi capability");
      }),
      {
        permissionState: {
          profileId: ":read-only",
          axes: { filesystem: "sandboxed", network: "restricted", reviewer: "human" },
        },
      },
    );
    expect(row.status).toBe("ok");
    expect(row.detail).toContain(":read-only");
    expect(row.detail).not.toContain("catalog");
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

describe("the plugins row", () => {
  const PKG = "@jonathand34/opencode-plugin-muse";
  const config = (path: string, plugins: string[]) => ({ type: "document", path, info: { plugins } });

  test("a config that lists only the package warns that this checkout is not listed", () => {
    const root = mkdtempSync(join(tmpdir(), "muse-checkout-"));
    const row = pluginRow([config("/tmp/opencode/opencode.json", [PKG])], root, PKG);
    expect(row.status).toBe("warn");
    expect(row.detail).toContain("published build");
    expect(row.remediation).toContain(root);
  });

  test("a local entry that resolves to this checkout is ok", () => {
    const root = mkdtempSync(join(tmpdir(), "muse-checkout-"));
    const row = pluginRow([config("/tmp/opencode/opencode.json", [root])], root, PKG);
    expect(row.status).toBe("ok");
    expect(row.detail).toContain("this checkout");
  });

  test("a relative entry resolves from the file that carries it", () => {
    const parent = mkdtempSync(join(tmpdir(), "muse-checkout-"));
    const root = join(parent, "plugin");
    mkdirSync(root);
    const row = pluginRow([config(join(parent, "opencode.json"), ["./plugin"])], root, PKG);
    expect(row.status).toBe("ok");
  });

  test("both a package and the checkout warn about two copies", () => {
    const root = mkdtempSync(join(tmpdir(), "muse-checkout-"));
    const row = pluginRow(
      [config("/tmp/opencode/opencode.json", [PKG]), config("/tmp/project/opencode.json", [root])],
      root,
      PKG,
    );
    expect(row.status).toBe("warn");
    expect(row.detail).toContain("two copies");
  });

  test("no entry at all warns that the plugin will not load", () => {
    const root = mkdtempSync(join(tmpdir(), "muse-checkout-"));
    const row = pluginRow([config("/tmp/opencode/opencode.json", ["some-other-plugin"])], root, PKG);
    expect(row.status).toBe("warn");
    expect(row.detail).toContain("will not load");
  });

  test("a CLI that does not answer is skipped, not guessed", () => {
    const row = pluginRow(undefined, "/tmp", PKG);
    expect(row.status).toBe("skipped");
  });

  test("offline reports the row as skipped without spawning anything", () => {
    const { root, state } = workspace();
    const { code, out } = run(["--json", "--offline"], root, state);
    expect(code).toBe(0);
    const row = parse(out).checks.find((check) => check.id === "plugins");
    expect(row?.status).toBe("skipped");
  });
});
