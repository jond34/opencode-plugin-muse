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
 * call. The config rows spawn `opencode --print-logs debug config` and read this
 * run's own stderr, because that stream is the only place a dropped statement or
 * a rejected file is reported, and it belongs to this spawn by construction
 * (E-D64, E-D70).
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
  schemaVersion: 1;
  pluginVersion: string;
  asOf: string;
  checks: Check[];
  hooks: HookReport | null;
}

/**
 * P1 A's caveat, in the doctor rather than in a gate. A plugin-origin hook is
 * allowed, but this host cannot see the approval that would make Muse run it.
 */
export const PLUGIN_HOOK_LIMITATION =
  "installed plugin hooks are outside this record; this host runs them only from an approval in its private config, which the plugin never creates";

/** The hooks row: advisory only. `plugin` rows warn; they never refuse. */
export function hooksRow(
  rows: readonly HookRow[],
  refusal: string | null,
  accepted = 0,
  handlers = 0,
): Check {
  const plugin = rows.some((row) => row.handlerKind === "plugin");
  const detail =
    rows.length === 0
      ? "no installed handlers"
      : `${rows.length} handler(s), ${accepted} of ${handlers} declared accepted: ${rows
          .map(
            (row) =>
              `${row.handlerKind}/${row.event}` +
              `${row.handlerKind === "plugin" ? " (installed plugin)" : ""}` +
              `${row.enabled ? "" : " (disabled)"}`,
          )
          .join(" ")}`;
  return {
    id: "hooks",
    status: refusal !== null || plugin ? "warn" : "ok",
    detail: plugin ? `${detail}; ${PLUGIN_HOOK_LIMITATION}` : detail,
    ...(refusal === null
      ? {}
      : { remediation: "MUSE_ALLOW_PROJECT_HOOKS=1 for one run, or --trust-hooks" }),
  };
}

interface Options {
  readonly json: boolean;
  readonly offline: boolean;
  readonly noStrict: boolean;
  readonly trustHooks: boolean;
  readonly forgetHooks: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  return {
    json: argv.includes("--json"),
    offline: argv.includes("--offline"),
    noStrict: argv.includes("--no-strict"),
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
export function pluginRow(
  documents: unknown,
  root: string,
  pkgName: string,
  rejected: readonly string[] = [],
): Check {
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
  // A package name has no path shape. `C:\...` and `\\server\share` are
  // absolute on Windows and were read as package names there, so a config that
  // listed this checkout by full path reported "this checkout is not listed".
  const isPackage = (entry: string): boolean => !/^[./~]/.test(entry) && !isAbsolute(entry);
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
    if (rejected.length > 0) {
      return {
        id: "plugins",
        status: "warn",
        detail: `no plugins entry names ${pkgName} in the sources the host printed, but ${rejected.length} config file(s) were rejected before they could be read: ${rejected.map(redact).join(", ")}`,
        remediation: "fix the rejected file; an entry in it is not loaded while the file is unreadable",
      };
    }
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

interface PolicySource {
  readonly type?: unknown;
  readonly path?: unknown;
  readonly info?: { readonly policies?: unknown } | null;
}

/**
 * What this run's own log output said about the config files it read.
 *
 * The host is spawned with `--print-logs`, so its log arrives on the doctor's own
 * stderr. That is what makes attribution exact: the stream belongs to this spawn,
 * so a diagnostic on it cannot be another process's, and no list of candidate
 * paths is needed (E-D70). `live` is false when the stream carried no structured
 * line at all, which is also what a host without the flag looks like; neither it
 * nor an empty diagnostic list may be read as "no drop" (D64).
 */
export interface ConfigLog {
  readonly live: boolean;
  readonly diagnostics: readonly ConfigDiagnostic[];
}

export interface ConfigDiagnostic {
  /** The config file the host was reading. */
  readonly source: string;
  /** A JSON pointer into it, or `$` for the whole file. */
  readonly path: string;
  /** The host's own words, e.g. `skipped malformed recognized value`. */
  readonly action: string;
}

const DIAGNOSTIC_MESSAGE = 'message="configuration normalization diagnostic"';

/** One `key=value` field of a log line, quoted or bare. */
function field(line: string, key: string): string | undefined {
  const match = new RegExp(`\\b${key}=("([^"]*)"|(\\S+))`).exec(line);
  if (match === null) return undefined;
  return match[2] ?? match[3];
}

/**
 * Diagnostics in this run's own log output.
 *
 * There is no source filter: the stream is this spawn's stderr, so a diagnostic
 * on it is ours (E-D70). `live` accepts any structured line, because every run
 * opens with `message="cli starting"` (E-D70, E-D71); requiring a config file to
 * be named would make a clean run indistinguishable from a silent one, and a
 * silent stream must never read as a clean config (D64).
 */
export function configDiagnostics(stderr: string): ConfigLog {
  let live = false;
  const diagnostics: ConfigDiagnostic[] = [];
  for (const line of stderr.split("\n")) {
    if (field(line, "timestamp") === undefined || field(line, "level") === undefined) continue;
    live = true;
    if (!line.includes(DIAGNOSTIC_MESSAGE)) continue;
    const source = field(line, "source");
    const path = field(line, "path");
    if (source === undefined || path === undefined) continue;
    diagnostics.push({ source, path, action: field(line, "action") ?? "dropped" });
  }
  return { live, diagnostics };
}

/** What one `opencode debug config` spawn printed. */
export interface ConfigRun {
  /** Parsed stdout, or undefined when the CLI refused or printed no JSON. */
  readonly documents: unknown;
  /** This run's own log, which carries the host's config diagnostics. */
  readonly stderr: string;
  /** The exit status, or null when the spawn itself failed. */
  readonly status: number | null;
}

/**
 * Statements the host says it will enforce, from its own documents.
 *
 * This is vendor output, not a reading of the file. The count exists to say
 * something in the `ok` row; it never stands in for the diagnostics, because a
 * file that was rejected is not among the documents at all (E-D64).
 */
function enforcedStatements(documents: unknown[]): { total: number; sources: number } {
  let total = 0;
  let sources = 0;
  for (const document of documents) {
    const policies = (document as PolicySource | null)?.info?.policies;
    if (!Array.isArray(policies)) continue;
    total += policies.length;
    sources += 1;
  }
  return { total, sources };
}

/**
 * D59: is every statement the config declares actually enforced?
 *
 * The answer comes from the host's own diagnostic, not from reading the file
 * (E-D62, E-D63). A statement that fails validation is dropped with a line in
 * this run's log output, and a file that fails to parse is not printed at all
 * (E-D64), so a count of declared versus printed statements cannot see the case
 * that matters: a rejected file beside a valid one leaves the count reporting
 * `ok` while a whole file's policies were thrown away. The row reports each drop
 * with its pointer. `ok` means this run printed a structured log line and
 * reported no drop; a stream with no such line is `skipped`, because a host that
 * stopped printing `--print-logs` looks exactly like a clean run (D64).
 *
 * Limits the row states by staying quiet: the remote (Console-delivered) path is
 * not visible at all, and nothing here re-derives the action enum, which is what
 * keeps the row from drifting with a new action name.
 */
export function policyRow(documents: unknown, log: ConfigLog): Check {
  if (!Array.isArray(documents)) {
    return {
      id: "policies",
      status: "skipped",
      detail: "`opencode debug config` did not answer; policy statements unknown",
      remediation: "run `opencode debug config` directly to see why",
    };
  }
  const enforced = enforcedStatements(documents);
  const rejected = log.diagnostics.filter((diagnostic) => diagnostic.path === "$");
  const drops = log.diagnostics.filter((diagnostic) => diagnostic.path !== "$");
  if (drops.length > 0) {
    return {
      id: "policies",
      status: "warn",
      detail: `policy statements are not all enforced: ${drops
        .map((drop) => `${redact(drop.source)}: ${drop.path} (${drop.action})`)
        .join("; ")}`,
      remediation:
        "a statement that fails validation is dropped with a warning in this run's own log output, and nothing matching means the action is allowed; check the action and effect names",
    };
  }
  if (rejected.length > 0) {
    return {
      id: "policies",
      status: "skipped",
      detail: `${rejected.map((diagnostic) => redact(diagnostic.source)).join(", ")} ${
        rejected.length === 1 ? "was" : "were"
      } rejected by the host, so nothing it declares is enforced; see the config row`,
    };
  }
  if (!log.live) {
    return {
      id: "policies",
      status: "skipped",
      detail: `${enforced.total} statement(s) enforced, but the host printed no log output for this run; drops unknown`,
      remediation: "run `opencode --standalone --print-logs debug config` directly to see why",
    };
  }
  if (enforced.total === 0) {
    return {
      id: "policies",
      status: "skipped",
      detail: "no config source declares `policies`; nothing to enforce",
    };
  }
  return {
    id: "policies",
    status: "ok",
    detail: `${enforced.total} statement(s) from ${enforced.sources} source(s) enforced, and this run's log reported no drop`,
  };
}

/**
 * D60: one finding for a config file the host refused.
 *
 * Neither row can produce it: a rejected file is absent from the documents
 * (E-D64), so it is emitted once here and the other two defer. A rejected file
 * takes every plugin entry and every policy statement in it with it, which is
 * the silent case all three rows exist for.
 */
export function configRow(log: ConfigLog): Check | undefined {
  const rejected = log.diagnostics.filter((diagnostic) => diagnostic.path === "$");
  if (rejected.length === 0) return undefined;
  return {
    id: "config",
    status: "warn",
    detail: `${rejected
      .map((diagnostic) => `${redact(diagnostic.source)} (${diagnostic.action})`)
      .join("; ")}: the host did not read the file, so no plugin entry or policy in it is enforced`,
    remediation:
      "fix its JSON or JSONC; the host drops the whole file rather than the one bad statement; " +
      "if you cannot edit this file, ask whoever administers it",
  };
}

/**
 * `opencode debug config`, with this run's own log on stderr.
 *
 * `--print-logs` is what makes the diagnostic attributable: it is on the stream
 * of the process we spawned, so no path list is consulted (D63, E-D70). A CLI
 * that is absent, refuses, or prints no JSON still returns its stderr, so a
 * diagnostic from a run that failed later is not thrown away.
 */
export function opencodeConfig(): ConfigRun {
  const result = spawnSync("opencode", ["--standalone", "--print-logs", "debug", "config"], {
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const stderr = result.stderr ?? "";
  const status = result.status ?? null;
  if (result.error !== undefined || result.status !== 0) {
    return { documents: undefined, stderr, status };
  }
  try {
    return { documents: JSON.parse(result.stdout) as unknown, stderr, status };
  } catch {
    return { documents: undefined, stderr, status };
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

async function probeHost(
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<{ checks: Check[]; hooks: HookRow[] | null; usage: unknown }> {
  const checks: Check[] = [];
  let host: MuseHost | undefined;
  try {
    host = await MuseHost.spawn({ cwd: root, trustWorkspace: true });
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

/**
 * D68/D69/D75/D83: what the run's exit code says, and what the flags add.
 *
 * The default answers *did this run check the config it was asked about*: a
 * `config` row (the host refused a file) and a `policies` warn (a statement was
 * dropped) both mean the user's own config is not in force, which is the failure
 * rounds 11 to 14 kept finding. The rule is the property, not who wrote the check:
 * a finding gates when it means a declaration the user made is not in force, and
 * `rustc`'s own `dead_code` is the counterexample that keeps the rule narrow (D82).
 *
 * Two orthogonal flags. `--no-strict` reports only. `--offline` does not look, so
 * the gate cannot certify what it did not read: it exits 1 like an unanswered run,
 * and `--offline --no-strict` is the report-only offline invocation (D83, D84).
 *
 * The rows about the machine and the install stay advisory at every level: on this
 * machine a working run warns `host`, and this checkout's own run warns `plugins`
 * too, so gating them would fail a tree that works (E-D73, E-D77).
 *
 * One code, not a ladder: 1 is already what `fail` returns, and a caller that gates
 * asks whether it may ship (D71). `policies: skipped` because the config declares
 * no statements is not a failure — nothing was dropped.
 */
export interface Gate {
  /** `--no-strict`: report only, never gate. */
  readonly gated: boolean;
  /** False under `--offline`: the user asked for a run that does not look. */
  readonly asked: boolean;
  /** Whether `opencode debug config` answered, so the config rows describe a run. */
  readonly answered: boolean;
}

export function exitCode(checks: readonly Check[], gate: Gate): number {
  if (checks.some((check) => check.status === "fail")) return 1;
  if (!gate.gated) return 0;
  if (!gate.asked) return 1;
  if (!gate.answered) return 1;
  const discarded = checks.some((check) => check.id === "config");
  const dropped = checks.some((check) => check.id === "policies" && check.status === "warn");
  return discarded || dropped ? 1 : 0;
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  const env = process.env;
  const root = process.cwd();
  const report: Report = {
    schemaVersion: 1,
    pluginVersion: packageVersion(),
    asOf: new Date().toISOString(),
    checks: [],
    hooks: null,
  };
  report.checks.push(versions(), platform(), containment(env));

  // Whether `opencode debug config` answered: the one fact the checks cannot
  // carry, because a skipped row is also what a clean config looks like.
  let read = false;

  if (options.offline) {
    report.checks.push({
      id: "plugins",
      status: "skipped",
      detail: "--offline: opencode's config was not read",
    });
    report.checks.push({
      id: "policies",
      status: "skipped",
      detail: "--offline: opencode's config was not read",
    });
  } else {
    const run = opencodeConfig();
    read = Array.isArray(run.documents);
    const log = configDiagnostics(run.stderr);
    const config = configRow(log);
    if (config !== undefined) report.checks.push(config);
    const rejected = log.diagnostics
      .filter((diagnostic) => diagnostic.path === "$")
      .map((diagnostic) => diagnostic.source);
    report.checks.push(pluginRow(run.documents, join(import.meta.dir, ".."), packageName(), rejected));
    report.checks.push(policyRow(run.documents, log));
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
      detail: "--offline: no host spawned, so auth, schema, hooks and allowance are unknown",
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
      report.checks.push(hooksRow(probe.hooks, refusal, trust.accepted, trust.handlers));
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

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const check of report.checks) {
      console.log(`${check.status.padEnd(7)} ${check.id.padEnd(12)} ${check.detail}`);
      if (check.remediation !== undefined) console.log(`        ${" ".repeat(12)} -> ${check.remediation}`);
    }
    console.log(`\nstate: ${redact(stateDirectory(env))}`);
  }
  return exitCode(report.checks, {
    gated: !options.noStrict,
    asked: !options.offline,
    answered: read,
  });
}

// Guarded so a test can import the rows without running the doctor.
if (import.meta.main) process.exitCode = await main();
