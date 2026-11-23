/**
 * `bun run doctor` — what this install is, in one screen.
 *
 * The rules are the ones `codex doctor` and `claude doctor` follow: read-mostly,
 * one row per check with a remediation line, `--json` for a report, and nothing
 * executed that was merely found on `PATH` — with two named exceptions, the
 * host CLIs this plugin is built for: `muse` for the host probe and `opencode`
 * for the plugin entries, which no other surface answers. The only writes are
 * the two explicit trust flags, and the only host interaction is a handshake
 * plus a session that is immediately left — no turn, no allowance, no model
 * call.
 *
 * Redaction is a hard rule: no credential, no identity, and no absolute home
 * path reaches the output. `museHome` and the workspace are printed with the
 * home prefix folded to `~`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { checkAllowance, parseAllowance } from "../src/allowance.js";
import {
  canonicalRoot,
  forgetHookTrust,
  hookGateRefusal,
  hooksDigest,
  hooksFileHandlers,
  hooksFilePath,
  hookTrustPath,
  readHookRows,
  recordHookTrust,
  trustedHandlerHashes,
  type HookRow,
} from "../src/hooks.js";
import { MuseHost, shutdownLadder } from "../src/host.js";
import { hasSchemaDrift, hostFactsFrom } from "../src/host-facts.js";
import { describeFilePermissions, ledgerPath, stateDirectory } from "../src/usage-ledger.js";
import { packageVersion } from "../src/version.js";

type Status = "ok" | "warn" | "fail" | "skipped";

interface Check {
  readonly id: string;
  readonly status: Status;
  readonly detail: string;
  readonly remediation?: string;
}

interface HookReport {
  readonly file: string | null;
  readonly digest: string | null;
  readonly trusted: boolean;
  readonly rows: HookRow[] | null;
  readonly refusal: string | null;
  /** Handlers the workspace file declares, and how many of them are accepted. */
  readonly handlers?: number;
  readonly accepted?: number;
}

interface Report {
  asOf: string;
  checks: Check[];
  hooks: HookReport | null;
}

interface Options {
  readonly json: boolean;
  readonly offline: boolean;
  readonly trustHooks: boolean;
  readonly forgetHooks: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  return {
    json: argv.includes("--json"),
    offline: argv.includes("--offline"),
    trustHooks: argv.includes("--trust-hooks"),
    forgetHooks: argv.includes("--forget-hooks"),
  };
}

/** Fold the home directory to `~` and drop anything credential-shaped. */
export function redact(text: string): string {
  const home = homedir();
  const folded = home.length > 1 ? text.split(home).join("~") : text;
  return folded
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(sk|pk|ghp|gho|github_pat)_[A-Za-z0-9_]{8,}/g, "[redacted]");
}

function versions(): Check {
  const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as {
    version?: string;
    dependencies?: Record<string, string>;
  };
  return {
    id: "versions",
    status: "ok",
    detail: `plugin ${pkg.version ?? packageVersion()}, sdk pin ${pkg.dependencies?.["@muse-code/sdk"] ?? "unknown"}, bun ${process.versions.bun ?? "n/a"}, node ${process.versions.node}`,
  };
}

interface ConfigSource {
  readonly type?: unknown;
  readonly path?: unknown;
  readonly info?: { readonly plugins?: unknown } | null;
}

function safeReal(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** The name this package is installed under, read from its own manifest. */
function packageName(): string {
  const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as {
    name?: string;
  };
  return pkg.name ?? "";
}

/**
 * Every `plugins` entry that names this package, and whether any is this checkout.
 *
 * OpenCode loads every entry it finds, so the question a run cannot answer from
 * inside itself is only *which copy*. `opencode debug config` lists each source
 * with its own array, and a relative entry resolves from the file that carries
 * it — the rule the vendor documents. Resolution of ids is left to opencode;
 * this row names the sources and the match, and never re-derives precedence.
 */
export function pluginRow(documents: unknown, root: string, pkgName: string): Check {
  if (!Array.isArray(documents)) {
    return {
      id: "plugins",
      status: "skipped",
      detail: "`opencode debug config` did not answer; plugin entries unknown",
      remediation: "run `opencode debug config` directly to see why",
    };
  }
  const entries: Array<{ source: string; entry: string }> = [];
  for (const document of documents) {
    const doc = document as ConfigSource | null;
    const plugins = doc?.info?.plugins;
    if (!Array.isArray(plugins)) continue;
    const source =
      typeof doc?.path === "string" ? doc.path : typeof doc?.type === "string" ? doc.type : "config";
    for (const entry of plugins) {
      if (typeof entry === "string") entries.push({ source, entry });
    }
  }
  const isPackage = (entry: string): boolean => !/^[./~]/.test(entry);
  const resolveEntry = (source: string, entry: string): string => {
    const expanded = entry.startsWith("~") ? join(homedir(), entry.slice(1)) : entry;
    return isAbsolute(expanded) ? expanded : resolve(dirname(source), expanded);
  };
  const rootReal = safeReal(root);
  const matches = entries.filter(({ source, entry }) =>
    isPackage(entry)
      ? entry === pkgName || entry.startsWith(`${pkgName}@`)
      : safeReal(resolveEntry(source, entry)) === rootReal,
  );
  const sourcesOf = (packageEntries: boolean): string =>
    [...new Set(matches.filter((match) => isPackage(match.entry) === packageEntries).map((match) => redact(match.source)))].join(", ");

  if (matches.length === 0) {
    return {
      id: "plugins",
      status: "warn",
      detail: `no plugins entry names ${pkgName} in any config source; the plugin will not load`,
      remediation: `add this directory to the config the run will use: "plugins": ["${redact(root)}"]`,
    };
  }
  const checkout = sourcesOf(false);
  const published = sourcesOf(true);
  if (checkout.length > 0 && published.length > 0) {
    return {
      id: "plugins",
      status: "warn",
      detail:
        published === checkout
          ? `two copies load from ${published}: ${pkgName} and this checkout`
          : `two copies load: ${pkgName} from ${published}, and this checkout from ${checkout}`,
      remediation: "keep one entry; a package entry and a local directory both load, and only one copy is what you tested",
    };
  }
  if (checkout.length > 0) {
    return { id: "plugins", status: "ok", detail: `this checkout, from ${checkout}` };
  }
  return {
    id: "plugins",
    status: "warn",
    detail: `${pkgName} from ${published}; this checkout is not listed, so a run from here loads the published build`,
    remediation: `list this directory instead ("${redact(root)}"), or run with a config that lists it`,
  };
}

/** `opencode debug config`, or undefined when the CLI is absent or refuses. */
function opencodeConfig(): unknown {
  const result = spawnSync("opencode", ["--standalone", "debug", "config"], {
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error !== undefined || result.status !== 0) return undefined;
  try {
    return JSON.parse(result.stdout) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * What this platform actually gives the plugin.
 *
 * Three behaviours differ on Windows and none of them is measurable from here:
 * the shutdown ladder has no graceful rung (`SIGTERM` is a forceful kill), the
 * ledger's mode is an inherited ACL rather than `0600`, and the vendor's sandbox
 * may ask for UAC consent at init — which a headless spawn cannot answer, so it
 * surfaces 900 s later as `host_idle_timeout`. Saying so is the whole check.
 */
function platform(): Check {
  const windows = process.platform === "win32";
  return {
    id: "platform",
    status: "ok",
    detail:
      `${process.platform}: shutdown ${shutdownLadder().join(" -> ")}; ` +
      `ledger ${describeFilePermissions(ledgerPath(new Date(), process.env))}` +
      (windows ? "; a UAC prompt at sandbox init can surface as host_idle_timeout" : ""),
  };
}

function containment(env: NodeJS.ProcessEnv): Check {
  const on = (name: string): string => {
    const value = env[name]?.trim();
    return value === undefined || value.length === 0 ? "off" : value;
  };
  return {
    id: "containment",
    status: "ok",
    detail:
      `MUSE_CONTAINMENT=${on("MUSE_CONTAINMENT")} MUSE_CONTRIBUTOR_MODE=${on("MUSE_CONTRIBUTOR_MODE")} ` +
      `MUSE_NATIVE_HISTORY=${on("MUSE_NATIVE_HISTORY")} MUSE_STRICT_HOST=${on("MUSE_STRICT_HOST")}`,
  };
}

function ledger(env: NodeJS.ProcessEnv): Check {
  const path = ledgerPath(new Date(), env);
  if (!existsSync(path)) {
    return { id: "ledger", status: "ok", detail: `no rows today at ${redact(path)}` };
  }
  const counts = new Map<string, number>();
  let rows = 0;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim().length === 0) continue;
    rows += 1;
    let kind = "unreadable";
    try {
      const parsed = JSON.parse(line) as { type?: unknown };
      kind = typeof parsed.type === "string" ? parsed.type : "turn";
    } catch {
      // Counted as unreadable; the file is append-only and a torn line is real.
    }
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const summary = [...counts.entries()].map(([kind, count]) => `${kind}=${count}`).join(" ");
  return { id: "ledger", status: "ok", detail: `${redact(path)} (${rows} rows today: ${summary})` };
}

function trustState(env: NodeJS.ProcessEnv, root: string): HookReport {
  const file = hooksFilePath(root);
  const exists = existsSync(file);
  const digest = hooksDigest(file);
  const handlers = hooksFileHandlers(file);
  const trustedHashes = trustedHandlerHashes(root, env);
  const trusted = handlers.length > 0 && handlers.every((handler) => trustedHashes.has(handler.sha256));
  return {
    file: exists ? redact(file) : null,
    digest: digest === null ? null : digest.slice(0, 12),
    trusted,
    handlers: handlers.length,
    accepted: handlers.filter((handler) => trustedHashes.has(handler.sha256)).length,
    rows: null,
    refusal: null,
  };
}

/**
 * The posture this host actually serves, read on the doctor's own connection.
 *
 * `permissionState` is only served to a connection that declared
 * `experimentalApi` (E-D37), which is why the doctor asks for it and the user's
 * session does not (D38). What this cannot see is the part the note is about:
 * saved approvals and any managed policy outrank the profile, and neither is on
 * the wire here.
 */
export async function postureCheck(
  host: MuseHost,
  session: Record<string, unknown>,
): Promise<Check> {
  const state = session.permissionState as Record<string, unknown> | null | undefined;
  if (state === null || state === undefined) {
    return {
      id: "posture",
      status: "skipped",
      detail: "the host served no permissionState on this connection",
      remediation: "an older host, or the beta capability was refused; the plugin's own sessions never read it",
    };
  }
  const axes = (state.axes ?? {}) as Record<string, unknown>;
  const profile = typeof state.profileId === "string" ? state.profileId : "unknown";
  let catalog = "";
  try {
    const listed = (await host.connection.request("permissionProfile/list", {})) as {
      profiles?: unknown;
    };
    const rows = Array.isArray(listed.profiles) ? (listed.profiles as Array<Record<string, unknown>>) : [];
    const ids = rows
      .map((row) => row.profileId)
      .filter((id): id is string => typeof id === "string");
    if (ids.length > 0) catalog = `; catalog ${ids.join(", ")}`;
  } catch {
    // A refused catalog does not make the state above unread.
  }
  const open = axes.filesystem === "unrestricted" || axes.network === "enabled";
  return {
    id: "posture",
    status: open ? "warn" : "ok",
    detail:
      `${profile} (filesystem ${String(axes.filesystem ?? "unknown")}, network ${String(axes.network ?? "unknown")}, reviewer ${String(axes.reviewer ?? "unknown")})${catalog}; ` +
      "these axes govern Muse's own shell, not the calls this plugin bridges; " +
      "read from the host, not saved approvals or a managed policy; a policy that " +
      "denies this plugin cannot be seen from inside it — the plugin is not loaded " +
      "and the turn fails as Model unavailable",
    ...(open
      ? {
          remediation:
            "the plugin pins no profile, so Muse starts under your saved default; `:auto-review` or `:read-only` keeps the sandbox on",
        }
      : {}),
  };
}

async function probeHost(
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<{ checks: Check[]; hooks: HookRow[] | null; usage: unknown }> {
  const checks: Check[] = [];
  let host: MuseHost | undefined;
  try {
    host = await MuseHost.spawn({ cwd: root, trustWorkspace: true, experimentalApi: true });
  } catch (error) {
    checks.push({
      id: "host",
      status: "fail",
      detail: redact(error instanceof Error ? error.message : String(error)),
      remediation: "check that `muse` is installed and logged in (`muse login`)",
    });
    return { checks, hooks: null, usage: null };
  }
  try {
    const facts = hostFactsFrom(host.initializeResult, host.fingerprintWarning);
    checks.push({
      id: "host",
      status: hasSchemaDrift(facts) ? "warn" : "ok",
      detail: `${facts.serverName ?? "unknown"} ${facts.serverVersion ?? "?"}, schema ${facts.schemaVersion ?? "?"} (${facts.schemaFingerprint ?? "no fingerprint"}), sessionMcp ${facts.grantedCapabilities.includes("sessionMcp") ? "granted" : "withheld"}, durability ${facts.sessionDurability ?? "unknown"}, platform ${facts.platform === null ? "unknown" : `${facts.platform.os}/${facts.platform.family}`}`,
      ...(hasSchemaDrift(facts)
        ? { remediation: "the CLI is newer than the SDK pin; MUSE_STRICT_HOST=1 refuses this host" }
        : {}),
    });

    let usage: unknown = null;
    try {
      usage = await host.connection.request("usage/read", {});
    } catch {
      // An older host without the method leaves the allowance row skipped.
    }

    const started = await host.connection.command(
      "session/start",
      { workspaceRoot: root },
      { commandId: host.connection.mintCommandId() },
    );
    const startedSession = (started?.session ?? {}) as Record<string, unknown>;
    checks.push(await postureCheck(host, startedSession));
    const sessionId = String(startedSession.sessionId ?? "");
    let hooks: HookRow[] | null = null;
    if (sessionId.length > 0) {
      try {
        hooks = readHookRows(await host.connection.request("hook/list", { sessionId }));
      } catch {
        hooks = null;
      }
      await host.connection
        .command("session/leave", { sessionId, stop: true }, { commandId: host.connection.mintCommandId() })
        .catch(() => undefined);
    }
    return { checks, hooks, usage };
  } catch (error) {
    checks.push({
      id: "host-probe",
      status: "fail",
      detail: redact(error instanceof Error ? error.message : String(error)),
    });
    return { checks, hooks: null, usage: null };
  } finally {
    await host.close().catch(() => undefined);
  }
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  const env = process.env;
  const root = process.cwd();
  const report: Report = { asOf: new Date().toISOString(), checks: [], hooks: null };
  report.checks.push(versions(), platform(), containment(env));

  if (options.offline) {
    report.checks.push({
      id: "plugins",
      status: "skipped",
      detail: "--offline: opencode's config was not read",
    });
  } else {
    report.checks.push(pluginRow(opencodeConfig(), join(import.meta.dir, ".."), packageName()));
  }

  const trust = trustState(env, root);

  if (options.trustHooks || options.forgetHooks) {
    const file = hooksFilePath(root);
    if (options.trustHooks && !existsSync(file)) {
      report.checks.push({
        id: "hooks-trust",
        status: "fail",
        detail: `no hooks file at ${redact(file)}`,
        remediation: "run this from the workspace that supplies one",
      });
    } else if (options.trustHooks) {
      const digest = hooksDigest(file) as string;
      const handlers = hooksFileHandlers(file);
      // A file with no handler this module can read is not recorded as trusted:
      // the record would name nothing, and the gate would then refuse anyway.
      if (handlers.length === 0) {
        report.checks.push({
          id: "hooks-trust",
          status: "fail",
          detail: `${redact(file)} declares no hook handler this plugin can read`,
          remediation: "check the file's shape; nothing was recorded",
        });
      } else {
        recordHookTrust(
          {
            canonicalPath: canonicalRoot(root),
            handlers: handlers.map((handler) => ({ sha256: handler.sha256, label: handler.label })),
            acceptedAtMs: Date.now(),
          },
          env,
        );
        trust.trusted = true;
        trust.accepted = handlers.length;
        report.checks.push({
          id: "hooks-trust",
          status: "ok",
          detail: `recorded ${handlers.length} handler(s) from ${redact(file)} (${digest.slice(0, 12)}) in ${redact(hookTrustPath(env))}`,
        });
      }
    } else {
      const removed = forgetHookTrust(canonicalRoot(root), env);
      trust.trusted = false;
      report.checks.push({
        id: "hooks-trust",
        status: removed ? "ok" : "warn",
        detail: removed
          ? `forgot ${canonicalRoot(root)}`
          : `no record for ${redact(canonicalRoot(root))}`,
      });
    }
  }

  if (options.offline) {
    report.checks.push({
      id: "host",
      status: "skipped",
      detail: "--offline: no host spawned, so auth, schema, posture, hooks and allowance are unknown",
    });
  } else {
    const probe = await probeHost(root, env);
    report.checks.push(...probe.checks);
    trust.rows = probe.hooks;
    if (probe.hooks === null) {
      report.checks.push({
        id: "hooks",
        status: "warn",
        detail: "the host did not report a hook catalog",
      });
    } else {
      const refusal = hookGateRefusal(probe.hooks, root, env);
      trust.refusal = refusal === null ? null : redact(refusal);
      report.checks.push({
        id: "hooks",
        status: refusal === null ? "ok" : "warn",
        detail:
          probe.hooks.length === 0
            ? "no installed handlers"
            : `${probe.hooks.length} handler(s), ${trust.accepted ?? 0} of ${trust.handlers ?? 0} declared accepted: ${probe.hooks
                .map(
                  (row) =>
                    `${row.handlerKind}/${row.event}` +
                    `${row.handlerKind === "plugin" ? " (installed plugin)" : ""}` +
                    `${row.enabled ? "" : " (disabled)"}`,
                )
                .join(" ")}`,
        ...(refusal === null
          ? {}
          : { remediation: "MUSE_ALLOW_PROJECT_HOOKS=1 for one run, or --trust-hooks" }),
      });
    }
    const usage = parseAllowance(probe.usage);
    if (usage === null) {
      report.checks.push({ id: "allowance", status: "skipped", detail: "no usage observation" });
    } else {
      const percent = usage.window?.usedPercent;
      report.checks.push({
        id: "allowance",
        status: percent !== undefined && percent >= 90 ? "warn" : "ok",
        detail:
          percent === undefined
            ? `tier ${usage.tier ?? "unknown"}: no window reported`
            : `tier ${usage.tier ?? "unknown"}, window ${percent}% used, resets ${usage.window?.resetsAtMs === null || usage.window?.resetsAtMs === undefined ? "unknown" : new Date(usage.window.resetsAtMs).toISOString()}`,
      });
      // The warning path itself is exercised, so the doctor and the plugin
      // agree on when a user is told; the doctor logs nothing itself.
      await checkAllowance({ read: async () => probe.usage }, env, () => undefined);
    }
  }

  if (trust.file !== null) {
    report.checks.push({
      id: "hooks-file",
      status: trust.trusted ? "ok" : trust.refusal === null ? "warn" : "warn",
      detail: `${trust.file} sha256:${trust.digest ?? "unknown"}, ${trust.trusted ? "accepted" : "not accepted"}`,
      ...(trust.trusted
        ? {}
        : { remediation: "this workspace's hooks are refused until accepted (--trust-hooks)" }),
    });
  }
  report.checks.push(ledger(env));
  report.hooks = trust;

  const failed = report.checks.some((check) => check.status === "fail");

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const check of report.checks) {
      console.log(`${check.status.padEnd(7)} ${check.id.padEnd(12)} ${check.detail}`);
      if (check.remediation !== undefined) console.log(`        ${" ".repeat(12)} -> ${check.remediation}`);
    }
    console.log(`\nstate: ${redact(stateDirectory(env))}`);
  }
  return failed ? 1 : 0;
}

// Guarded so a test can import the rows without running the doctor.
if (import.meta.main) process.exitCode = await main();
