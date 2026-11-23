/**
 * Repo-supplied Muse hooks, and the record that says a person accepted them.
 *
 * Workspace trust is granted because the tool bridge does not start without it,
 * and trust is what makes Muse load the workspace's `.muse/hooks.json`. A hook
 * is a command Muse runs on an event, outside opencode's permission engine, so
 * a repository that supplies one is asking for execution that no approval
 * surface of ours covers. The host reports each installed handler with its
 * origin (`hook/list` → `handlerKind`), which is what this module reads:
 * `project` rows are refused until the exact file is accepted. A `plugin` row
 * is allowed: every install scope writes into the user's own store ("Nothing is
 * written into the repository"), so it is code the person installed and
 * approved, not a file a checkout can plant. The doctor still prints the origin
 * of every handler, so an installed plugin is visible rather than silent.
 *
 * The acceptance is a record, not a prompt: the server half's `Context` has no
 * dialog surface, so the record is written by the doctor or by the env override
 * below. The record is **per handler**, keyed by the handler's own content, so
 * editing one handler asks about that handler and not about its neighbours, and
 * an edited command cannot ride a stable key or a stable position into trust.
 * The gate itself stays all-or-nothing, because the host loads the whole file
 * once the workspace is trusted: per handler is accounting, not execution. (A package
 * may ship a `./tui` part that can ask — that is how the allowance warning
 * reaches a TUI — but this gate runs before any UI exists, so the record stays
 * the mechanism and the TUI stays a notice.)
 */
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { SessionHost } from "./session.js";
import { stateDirectory } from "./usage-ledger.js";

/** The workspace file Muse loads hook handlers from. */
export const HOOKS_RELATIVE_PATH = join(".muse", "hooks.json");

/** Accept the repo's hooks for this run, without a trust record. */
export const PROJECT_HOOKS_ENV = "MUSE_ALLOW_PROJECT_HOOKS";

/** Origins that mean "the workspace supplies this". A plugin is the user's install. */
const BLOCKING_KINDS: ReadonlySet<string> = new Set(["project"]);

/** One installed handler, as `hook/list` reports it. */
export interface HookRow {
  readonly enabled: boolean;
  readonly event: string;
  readonly handlerKind: string;
  readonly key: string;
}

/**
 * One accepted handler, keyed by its own content. `sha256` is the digest of the
 * handler's canonical JSON together with its event and matcher, so editing the
 * command, the matcher, a timeout or a nested `onFailure` asks again, and an
 * edit to a neighbour does not.
 */
export interface HookHandlerTrust {
  readonly sha256: string;
  readonly label: string;
}

/**
 * One accepted hooks file.
 *
 * v2 (`handlers`) is what this module writes now. v1 (`hooksSha256`, the
 * digest of the file's bytes) is still read: it accepted the whole file, so
 * every handler in a file that still hashes to that digest is trusted. The
 * migration is a read-side rule, not a rewrite — the next `--trust-hooks`
 * writes v2.
 */
export interface HookTrustEntry {
  readonly canonicalPath: string;
  readonly hooksSha256?: string;
  readonly handlers?: readonly HookHandlerTrust[];
  readonly acceptedAtMs: number;
}

/** One handler as the workspace file declares it, with the hash that names it. */
export interface FileHookHandler {
  readonly event: string;
  readonly sha256: string;
  readonly label: string;
}

/** JSON with sorted keys, so the hash depends on content and not on spelling. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** A one-line description of a handler, for the refusal and the doctor. */
function handlerLabel(event: string, handler: Record<string, unknown>): string {
  const command = typeof handler.command === "string" ? handler.command : undefined;
  const kind = typeof handler.type === "string" ? handler.type : undefined;
  const what = command ?? (kind === undefined ? "handler" : kind);
  const clipped = what.length > 60 ? `${what.slice(0, 57)}…` : what;
  return `${event}: ${clipped}`;
}

/**
 * Every handler the workspace file declares, hashed by content.
 *
 * The shape is the vendor's: `hooks` keyed by event, each event an array of
 * groups, each group a matcher plus a `hooks` array (a group that is itself a
 * handler is accepted too, because the file format is the workspace author's).
 * A file that cannot be parsed, or that declares nothing, returns `[]` — and
 * the gate treats that as "nothing can be accounted for", never as "nothing to
 * run".
 */
export function hooksFileHandlers(file: string): FileHookHandler[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
  const hooks = (parsed as { hooks?: unknown } | null)?.hooks;
  if (hooks === null || typeof hooks !== "object" || Array.isArray(hooks)) return [];
  const out: FileHookHandler[] = [];
  for (const [event, groups] of Object.entries(hooks as Record<string, unknown>)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (group === null || typeof group !== "object") continue;
      const record = group as Record<string, unknown>;
      const matcher = typeof record.matcher === "string" ? record.matcher : undefined;
      const handlers = Array.isArray(record.hooks) ? record.hooks : [record];
      for (const handler of handlers) {
        if (handler === null || typeof handler !== "object") continue;
        const body = handler as Record<string, unknown>;
        const sha256 = createHash("sha256")
          .update(canonicalJson([event, matcher ?? null, body]))
          .digest("hex");
        out.push({ event, sha256, label: handlerLabel(event, body) });
      }
    }
  }
  return out;
}

/** Absolute path of the hooks file for a workspace root. */
export function hooksFilePath(root: string): string {
  return join(root, HOOKS_RELATIVE_PATH);
}

/**
 * The workspace root as the trust record keys it: symlinks resolved when the
 * path exists, so a record cannot be reused through a second spelling of it.
 */
export function canonicalRoot(root: string): string {
  try {
    return realpathSync.native(root);
  } catch {
    return resolve(root);
  }
}

/** sha256 of the hooks file, or `null` when there is no file. */
export function hooksDigest(file: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}

/** Narrow the `hook/list` result to rows this module understands. */
export function readHookRows(result: unknown): HookRow[] {
  const rows = (result as { hooks?: unknown } | null | undefined)?.hooks;
  if (!Array.isArray(rows)) return [];
  const parsed: HookRow[] = [];
  for (const raw of rows) {
    const row = raw as Record<string, unknown> | null;
    if (row === null || typeof row !== "object") continue;
    if (typeof row.handlerKind !== "string" || typeof row.key !== "string") continue;
    parsed.push({
      enabled: row.enabled !== false,
      event: typeof row.event === "string" ? row.event : "",
      handlerKind: row.handlerKind,
      key: row.key,
    });
  }
  return parsed;
}

/**
 * The installed handlers for a session, or `null` when the host cannot answer.
 *
 * `hook/list` is per-session (`{sessionId}`), so this runs after
 * `session/start` and before the first turn. A host that does not implement the
 * method is reported as unknown rather than as "no hooks": the gate below
 * treats unknown as nothing to refuse, because a probe failure must not take
 * every session down.
 */
export async function readHookCatalog(
  host: SessionHost,
  sessionId: string,
): Promise<HookRow[] | null> {
  const request = host.connection.request;
  if (request === undefined) return null;
  try {
    return readHookRows(await request.call(host.connection, "hook/list", { sessionId }));
  } catch {
    return null;
  }
}

/** Enabled handlers whose origin is the workspace's own file. */
export function blockingHooks(rows: readonly HookRow[]): HookRow[] {
  return rows.filter((row) => row.enabled && BLOCKING_KINDS.has(row.handlerKind));
}

/** The env override, spelled the same way as the other switches. */
export function projectHooksAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[PROJECT_HOOKS_ENV]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "on";
}

/** `$XDG_STATE_HOME/opencode-muse/hooks-trust.json`, beside the ledger. */
export function hookTrustPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(stateDirectory(env), "hooks-trust.json");
}

/** Every accepted file. A missing or malformed record is an empty record. */
export function readHookTrust(env: NodeJS.ProcessEnv = process.env): HookTrustEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(hookTrustPath(env), "utf8"));
  } catch {
    return [];
  }
  const entries = (parsed as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry): entry is HookTrustEntry => {
    const row = entry as Partial<HookTrustEntry> | null;
    if (typeof row?.canonicalPath !== "string" || typeof row.acceptedAtMs !== "number") {
      return false;
    }
    // v1 accepted the whole file; v2 accepted named handlers.
    if (typeof row.hooksSha256 === "string") return true;
    return (
      Array.isArray(row.handlers) &&
      row.handlers.every(
        (handler) =>
          typeof (handler as Partial<HookHandlerTrust> | null)?.sha256 === "string" &&
          typeof (handler as Partial<HookHandlerTrust> | null)?.label === "string",
      )
    );
  });
}

/**
 * Replace the record for this path, keeping every other path's entry.
 *
 * The path is canonicalized before it is stored, the same way every reader
 * canonicalizes it: `os.tmpdir()` on macOS is `/var/folders/...` while its
 * resolved form is `/private/var/folders/...`, and a record keyed by the
 * unresolved form would silently never match — the user accepts a hook and is
 * asked again. A caller passing either form now lands on one key.
 */
export function recordHookTrust(entry: HookTrustEntry, env: NodeJS.ProcessEnv = process.env): void {
  const path = hookTrustPath(env);
  const stored = { ...entry, canonicalPath: canonicalRoot(entry.canonicalPath) };
  const entries = readHookTrust(env).filter((row) => row.canonicalPath !== stored.canonicalPath);
  entries.push(stored);
  const version = stored.handlers === undefined ? 1 : 2;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ version, entries }, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    // A filesystem without POSIX modes keeps the umask; nothing to report.
  }
}

/** Drop this path's record. Returns whether one was there. */
export function forgetHookTrust(
  canonicalPath: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const existing = readHookTrust(env);
  const canonical = canonicalRoot(canonicalPath);
  const kept = existing.filter((row) => row.canonicalPath !== canonical);
  if (kept.length === existing.length) return false;
  const path = hookTrustPath(env);
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ version: 1, entries: kept }, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
  return true;
}

/** True when this exact file, under this exact path, has been accepted. */
export function hooksTrusted(
  root: string,
  digest: string | null,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (digest === null) return false;
  const canonical = canonicalRoot(root);
  return readHookTrust(env).some(
    (entry) => entry.canonicalPath === canonical && entry.hooksSha256 === digest,
  );
}

/**
 * The handler hashes this workspace has accepted.
 *
 * A v1 entry accepted the file's bytes, so a file that still hashes to that
 * digest is exactly the file that was accepted: every handler in it is trusted,
 * which is the migration rule D23 states. A changed byte voids the v1 entry and
 * only the v2 handlers survive, which is why the migration cannot widen trust.
 */
export function trustedHandlerHashes(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const canonical = canonicalRoot(root);
  const file = hooksFilePath(root);
  const digest = hooksDigest(file);
  const trusted = new Set<string>();
  for (const entry of readHookTrust(env)) {
    if (entry.canonicalPath !== canonical) continue;
    if (entry.handlers !== undefined) {
      for (const handler of entry.handlers) trusted.add(handler.sha256);
      continue;
    }
    if (digest !== null && entry.hooksSha256 === digest) {
      for (const handler of hooksFileHandlers(file)) trusted.add(handler.sha256);
    }
  }
  return trusted;
}

/**
 * True when every handler the file declares has been accepted.
 *
 * A file with no parsable handlers is *not* trusted: the host reports a project
 * handler and this module cannot account for it, which is the fail-closed side
 * of a format this plugin does not own.
 */
export function hooksFileTrusted(root: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const handlers = hooksFileHandlers(hooksFilePath(root));
  if (handlers.length === 0) return false;
  const trusted = trustedHandlerHashes(root, env);
  return handlers.every((handler) => trusted.has(handler.sha256));
}

/** A readable list of hook keys, capped so a refusal stays one message. */
function describeKeys(rows: readonly HookRow[]): string {
  const keys = rows.slice(0, 3).map((row) => `${row.event}:${row.key}`);
  const rest = rows.length - keys.length;
  return rest > 0 ? `${keys.join(", ")} and ${rest} more` : keys.join(", ");
}

/** The same cap for handler labels, which come from the file rather than the host. */
function describeHandlers(handlers: readonly FileHookHandler[]): string {
  const labels = handlers.slice(0, 3).map((handler) => handler.label);
  const rest = handlers.length - labels.length;
  return rest > 0 ? `${labels.join(", ")} and ${rest} more` : labels.join(", ");
}

/**
 * The refusal message for this workspace, or `null` when a session may open.
 *
 * Unknown rows (`null`) never refuse: the catalog could not be read, and the
 * plugin's own containment checks already report that. Rows whose origin is
 * `managed` or `user` are the person's own configuration and are allowed.
 */
export function hookGateRefusal(
  rows: readonly HookRow[] | null,
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (rows === null) return null;
  const blocking = blockingHooks(rows);
  if (blocking.length === 0) return null;
  if (projectHooksAllowed(env)) return null;
  const file = hooksFilePath(root);
  const handlers = hooksFileHandlers(file);
  const trusted = trustedHandlerHashes(root, env);
  const untrusted = handlers.filter((handler) => !trusted.has(handler.sha256));
  if (handlers.length > 0 && untrusted.length === 0) return null;
  // Two ways to be refused, and they need different sentences. Either the file
  // declares handlers and some are new (name those, not the whole file), or it
  // declares none this module can account for while the host says it loaded
  // project handlers (fail closed: a format we do not own is not a reason to
  // trust what we cannot read).
  const what =
    handlers.length === 0
      ? `${blocking.length} repo-supplied hook(s) in ${canonicalRoot(root)}: ${describeKeys(blocking)}, ` +
        `which ${file} does not declare in a shape this plugin can account for`
      : `${untrusted.length} new repo-supplied hook(s) in ${canonicalRoot(root)}: ` +
        `${describeHandlers(untrusted)}` +
        (handlers.length > untrusted.length
          ? ` (${handlers.length - untrusted.length} other handler(s) there are already accepted)`
          : "");
  return (
    `Muse would load ${what}. Hooks are commands Muse runs outside opencode's permissions, ` +
    `so this session is refused. Accept them for one run with ${PROJECT_HOOKS_ENV}=1, ` +
    `or record ${file} as trusted with the plugin's doctor (bun run doctor --trust-hooks).`
  );
}
