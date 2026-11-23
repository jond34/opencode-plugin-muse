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
 * call. The config rows also read the log `opencode debug config` writes, at the
 * path the host itself names, because that log is the only place a dropped
 * statement or a rejected file is reported (E-D62, E-D64).
 *
 * Redaction is a hard rule: no credential, no identity, and no absolute home
 * path reaches the output. `museHome` and the workspace are printed with the
 * home prefix folded to `~`.
 */
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readSync, realpathSync, statSync } from "node:fs";
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
 * What the host wrote to its log about this run.
 *
 * `reason` is set when the log could not be read at all, and `live` is false when
 * it was read but names no candidate config file. Neither may be read as "no
 * drop": a raised level or a rotated log produces an empty delta that looks
 * exactly like a clean run (E-D62), so a row only says `ok` when the log itself
 * mentioned a file it could have warned about.
 */
export interface ConfigLog {
  readonly reason: string | null;
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
 * Diagnostics in a log delta that belong to this run's config files.
 *
 * The filter is by source first. A parallel run's delta holds another process's
 * diagnostics, so "every diagnostic in the delta" is not a drop test (E-D62).
 *
 * `live` is what makes an empty result mean something, and it has to accept two
 * shapes: a diagnostic names the file in `source=`, while a clean run's watcher
 * lines name its config directory in `path=` and never mention the file at all.
 * The directory is included only as the parent of a candidate file, so the
 * `~/.opencode` scan every run performs cannot make a run look logged.
 */
export function configDiagnostics(
  delta: string,
  sources: readonly string[],
): { live: boolean; diagnostics: ConfigDiagnostic[] } {
  const files = new Set(sources.map((source) => safeReal(source)));
  const directories = new Set(sources.map((source) => safeReal(dirname(source))));
  let live = false;
  const diagnostics: ConfigDiagnostic[] = [];
  for (const line of delta.split("\n")) {
    const source = field(line, "source");
    const named = field(line, "path");
    if (
      (source !== undefined && files.has(safeReal(source))) ||
      (named !== undefined && (files.has(safeReal(named)) || directories.has(safeReal(named))))
    ) {
      live = true;
    }
    if (source === undefined || !files.has(safeReal(source))) continue;
    if (!line.includes(DIAGNOSTIC_MESSAGE)) continue;
    const path = field(line, "path");
    if (path === undefined) continue;
    diagnostics.push({ source, path, action: field(line, "action") ?? "dropped" });
  }
  return { live, diagnostics };
}

/** Bytes written after `offset`, or why they could not be read. */
export function readLogDelta(path: string, offset: number): { text: string } | { reason: string } {
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return { reason: `no log at ${redact(path)}` };
  }
  // A log that shrank rotated between the offset and this read. Reading from the
  // stale offset would return nothing, which reads exactly like "no drop".
  if (size < offset) return { reason: "the log was truncated during the run" };
  const length = Math.min(size - offset, 4 * 1024 * 1024);
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buffer, 0, length, size - length);
  } finally {
    closeSync(fd);
  }
  return { text: buffer.toString("utf8") };
}

/** Where the host writes its log, from the host itself. */
function logFile(): string | undefined {
  const result = spawnSync("opencode", ["debug", "paths", "log"], {
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error !== undefined || result.status !== 0) return undefined;
  const dir = result.stdout
    .replace(/\x1b\[[0-9;]*m/g, "")
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .pop();
  return dir === undefined ? undefined : join(dir, "opencode.log");
}

/**
 * The config files this run could have read: what the host printed, plus the
 * candidates in the config directory and the working directory.
 *
 * The second part is the point. A file the host rejected is not printed at all
 * (E-D64), so the printed list alone can never name it, and a rejected file is
 * exactly what the rows have to report.
 */
function configCandidates(documents: unknown, env: NodeJS.ProcessEnv): string[] {
  const candidates = new Set<string>();
  if (Array.isArray(documents)) {
    for (const document of documents) {
      const doc = document as PolicySource | null;
      // A directory document is a scan root, not a file this run read: every run
      // has one for `~/.opencode`, and counting it would make liveness trivial.
      if (typeof doc?.path === "string" && doc.type !== "directory") candidates.add(doc.path);
    }
  }
  const configHome = env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  for (const dir of [join(configHome, "opencode"), process.cwd(), join(homedir(), ".opencode")]) {
    for (const name of ["opencode.json", "opencode.jsonc"]) {
      const path = join(dir, name);
      if (existsSync(path)) candidates.add(path);
    }
  }
  return [...candidates];
}

/** One `debug config` spawn, with the log read around it. */
function readConfig(
  documents: () => unknown,
  env: NodeJS.ProcessEnv,
): { documents: unknown; log: ConfigLog } {
  const file = logFile();
  let offset = 0;
  if (file !== undefined) {
    try {
      offset = statSync(file).size;
    } catch {
      offset = 0;
    }
  }
  const printed = documents();
  if (file === undefined) {
    return {
      documents: printed,
      log: { reason: "`opencode debug paths log` did not answer", live: false, diagnostics: [] },
    };
  }
  const delta = readLogDelta(file, offset);
  if ("reason" in delta) {
    return { documents: printed, log: { reason: delta.reason, live: false, diagnostics: [] } };
  }
  const { live, diagnostics } = configDiagnostics(delta.text, configCandidates(printed, env));
  return { documents: printed, log: { reason: null, live, diagnostics } };
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
 * (E-D62, E-D63). A statement that fails validation is dropped with a line in the
 * server log, and a file that fails to parse is not printed at all (E-D64), so a
 * count of declared versus printed statements cannot see the case that matters:
 * a rejected file beside a valid one leaves the count reporting `ok` while a
 * whole file's policies were thrown away. The row reports each drop with its
 * pointer. `ok` means the log named a config file and reported no drop; a log
 * that names none is `skipped`, because an empty delta is also what a raised
 * level or a rotated log looks like.
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
        "a statement that fails validation is dropped with a warning in the server log, and nothing matching means the action is allowed; check the action and effect names",
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
  if (log.reason !== null) {
    return {
      id: "policies",
      status: "skipped",
      detail: `${enforced.total} statement(s) enforced, but the host log was not read (${log.reason}); drops unknown`,
      remediation: "run `opencode debug paths log`, then check that the file it names is readable",
    };
  }
  if (!log.live) {
    return {
      id: "policies",
      status: "skipped",
      detail: `${enforced.total} statement(s) enforced, but the host log named no config source for this run; drops unknown`,
      remediation: "run `opencode debug config`, then check the log at `opencode debug paths log`",
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
    detail: `${enforced.total} statement(s) from ${enforced.sources} source(s) enforced, and the host log reported no drop`,
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
function configRow(log: ConfigLog): Check | undefined {
  const rejected = log.diagnostics.filter((diagnostic) => diagnostic.path === "$");
  if (rejected.length === 0) return undefined;
  return {
    id: "config",
    status: "warn",
    detail: `${rejected
      .map((diagnostic) => `${redact(diagnostic.source)} (${diagnostic.action})`)
      .join("; ")}: the host did not read the file, so no plugin entry or policy in it is enforced`,
    remediation:
      "fix its JSON or JSONC; the host drops the whole file rather than the one bad statement",
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
    report.checks.push({
      id: "policies",
      status: "skipped",
      detail: "--offline: opencode's config was not read",
    });
  } else {
    const { documents, log } = readConfig(opencodeConfig, env);
    const config = configRow(log);
    if (config !== undefined) report.checks.push(config);
    const rejected = log.diagnostics
      .filter((diagnostic) => diagnostic.path === "$")
      .map((diagnostic) => diagnostic.source);
    report.checks.push(pluginRow(documents, join(import.meta.dir, ".."), packageName(), rejected));
    report.checks.push(policyRow(documents, log));
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
