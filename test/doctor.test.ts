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
import {
  configDiagnostics,
  pluginRow,
  policyRow,
  postureCheck,
  readLogDelta,
  type ConfigLog,
} from "../scripts/doctor.js";

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

  test("a rejected file is named instead of claiming there is no entry", () => {
    const root = mkdtempSync(join(tmpdir(), "muse-checkout-"));
    const rejected = "/tmp/opencode/opencode.jsonc";
    const row = pluginRow([config("/tmp/opencode/opencode.json", ["other"])], root, PKG, [rejected]);
    expect(row.status).toBe("warn");
    expect(row.detail).toContain(rejected);
    expect(row.detail).not.toContain("will not load");
    expect(row.remediation).toContain("rejected");
  });

  test("offline reports the row as skipped without spawning anything", () => {
    const { root, state } = workspace();
    const { code, out } = run(["--json", "--offline"], root, state);
    expect(code).toBe(0);
    const row = parse(out).checks.find((check) => check.id === "plugins");
    expect(row?.status).toBe("skipped");
  });
});

/**
 * D59: the host's own diagnostic is the answer, and `ok` needs the log to have
 * named a file. E-D62 measured the delta; E-D64 measured a rejected file, which
 * is absent from the documents, so these fixtures feed the row the log facts it
 * would have read rather than a copy of the file.
 */
describe("the policies row", () => {
  const document = (path: string, policies: unknown) => ({ type: "document", path, info: { policies } });
  const log = (
    diagnostics: Array<{ source: string; path: string; action: string }> = [],
    overrides: Partial<ConfigLog> = {},
  ): ConfigLog => ({ reason: null, live: true, diagnostics, ...overrides });

  test("a statement the host dropped is named, with its source and pointer", () => {
    const path = "/tmp/opencode/opencode.jsonc";
    const row = policyRow(
      [document(path, [{ action: "tool.use" }])],
      log([{ source: path, path: "$.policies.1", action: "skipped malformed recognized value" }]),
    );
    expect(row.status).toBe("warn");
    expect(row.detail).toContain(path);
    expect(row.detail).toContain("$.policies.1");
    expect(row.detail).toContain("skipped malformed recognized value");
    expect(row.remediation).toContain("server log");
    expect(row.remediation).toContain("nothing matching means the action is allowed");
  });

  test("a drop under experimental.policies keeps its own pointer", () => {
    const path = "/tmp/opencode/opencode.jsonc";
    const row = policyRow(
      [document(path, [{}])],
      log([{ source: path, path: "$.experimental.policies.0", action: "skipped malformed recognized value" }]),
    );
    expect(row.status).toBe("warn");
    expect(row.detail).toContain("$.experimental.policies.0");
  });

  test("a drop is attributed to its own file, not to the other source", () => {
    const global = "/tmp/opencode/opencode.jsonc";
    const project = "/tmp/project/opencode.jsonc";
    const row = policyRow(
      [document(global, [{}]), document(project, [{}])],
      log([{ source: project, path: "$.policies.0", action: "skipped malformed recognized value" }]),
    );
    expect(row.status).toBe("warn");
    expect(row.detail).toContain(project);
    expect(row.detail).not.toContain(global);
  });

  test("a rejected file is deferred to the config row, and never reads as ok", () => {
    const valid = "/tmp/opencode/opencode.json";
    const rejected = "/tmp/opencode/opencode.jsonc";
    const row = policyRow(
      [document(valid, [{}])],
      log([{ source: rejected, path: "$", action: "rejected malformed JSON or JSONC document" }]),
    );
    expect(row.status).toBe("skipped");
    expect(row.detail).toContain(rejected);
    expect(row.detail).toContain("config row");
  });

  test("a log that named no config source is skipped, not ok", () => {
    const row = policyRow([document("/tmp/opencode/opencode.json", [{}])], log([], { live: false }));
    expect(row.status).toBe("skipped");
    expect(row.detail).toContain("named no config source");
  });

  test("a log that could not be read is skipped, with its reason", () => {
    const row = policyRow(
      [document("/tmp/opencode/opencode.json", [{}])],
      log([], { reason: "no log at ~/.local/share/opencode/log/opencode.log", live: false }),
    );
    expect(row.status).toBe("skipped");
    expect(row.detail).toContain("not read");
    expect(row.detail).toContain("no log at");
  });

  test("a live log with no diagnostic is ok, and counts what the host enforces", () => {
    const row = policyRow(
      [document("/tmp/opencode/opencode.jsonc", [{}, {}])],
      log(),
    );
    expect(row.status).toBe("ok");
    expect(row.detail).toContain("2 statement(s) from 1 source(s)");
    expect(row.detail).toContain("no drop");
  });

  test("a config that declares no policies is skipped, not ok", () => {
    const row = policyRow([document("/tmp/opencode/opencode.json", null)], log());
    expect(row.status).toBe("skipped");
  });

  test("a CLI that does not answer is skipped, not guessed", () => {
    expect(policyRow(undefined, log()).status).toBe("skipped");
  });

  test("a path under the home directory is folded", () => {
    const path = join(homedir(), "cfg", "opencode.jsonc");
    const row = policyRow(
      [document(path, [{}])],
      log([{ source: path, path: "$.policies.1", action: "skipped malformed recognized value" }]),
    );
    expect(row.status).toBe("warn");
    expect(row.detail).not.toContain(homedir());
    expect(row.detail).toContain("~/cfg/opencode.jsonc");
  });

  test("offline reports the row as skipped without spawning anything", () => {
    const { root, state } = workspace();
    const { code, out } = run(["--json", "--offline"], root, state);
    expect(code).toBe(0);
    expect(parse(out).checks.find((check) => check.id === "policies")?.status).toBe("skipped");
  });
});

/**
 * E-D62: the delta is only a drop test when it is filtered and when something in
 * it proves the run was logged at all.
 */
describe("the config log", () => {
  // The shapes are copied from a real delta: a clean run names the config
  // directory in `path=`, and only a diagnostic names the file, in `source=`.
  const watcher = (dir: string) =>
    `timestamp=2026-11-23T10:00:00.000Z level=INFO run=e8222caa message="watcher subscribe" path=${dir} type=directory ignores=6 role=server`;
  const drop = (source: string, pointer: string) =>
    `timestamp=2026-11-23T10:00:01.000Z level=WARN run=e8222caa message="configuration normalization diagnostic" source=${source} path=${pointer} kind=invalid action="skipped malformed recognized value" role=server`;

  test("a clean run's watcher line is liveness, not a drop", () => {
    const source = "/tmp/opencode/opencode.jsonc";
    const { live, diagnostics } = configDiagnostics(watcher("/tmp/opencode"), [source]);
    expect(live).toBe(true);
    expect(diagnostics).toHaveLength(0);
  });

  test("a watcher line for another directory is not liveness", () => {
    const { live } = configDiagnostics(watcher("/tmp/other"), ["/tmp/opencode/opencode.jsonc"]);
    expect(live).toBe(false);
  });

  test("a diagnostic for another process's config is not ours", () => {
    const ours = "/tmp/opencode/opencode.jsonc";
    const theirs = "/tmp/other/opencode.jsonc";
    const { live, diagnostics } = configDiagnostics(
      `${watcher("/tmp/opencode")}\n${drop(theirs, "$.policies.0")}`,
      [ours],
    );
    expect(live).toBe(true);
    expect(diagnostics).toHaveLength(0);
  });

  test("a quoted source with a space, and the pointer, are parsed", () => {
    const source = "/tmp/r12 space/opencode/opencode.jsonc";
    const { diagnostics } = configDiagnostics(drop(`"${source}"`, "$.policies.0"), [source]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.source).toBe(source);
    expect(diagnostics[0]?.path).toBe("$.policies.0");
    expect(diagnostics[0]?.action).toBe("skipped malformed recognized value");
  });

  test("a log that names no candidate is not live", () => {
    const { live } = configDiagnostics(drop("/tmp/other/opencode.json", "$"), ["/tmp/opencode/opencode.json"]);
    expect(live).toBe(false);
  });

  test("a shrunken log is reported, not read as an empty delta", () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-log-"));
    const file = join(dir, "opencode.log");
    writeFileSync(file, "older\n");
    expect(readLogDelta(file, 4096)).toEqual({ reason: "the log was truncated during the run" });
    expect(readLogDelta(join(dir, "absent.log"), 0)).toHaveProperty("reason");
  });

  test("only the bytes after the offset are read", () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-log-"));
    const file = join(dir, "opencode.log");
    writeFileSync(file, "before\nafter\n");
    const delta = readLogDelta(file, 7);
    expect(delta).toEqual({ text: "after\n" });
  });
});
