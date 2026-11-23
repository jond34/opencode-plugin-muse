/**
 * Repo-supplied Muse hooks, and the record that says a person accepted them.
 *
 * Workspace trust is granted because the tool bridge does not start without it,
 * and trust is what makes Muse load the workspace's `.muse/hooks.json`. A hook
 * is a command Muse runs on an event, outside opencode's permission engine, so
 * a repository that supplies one is asking for execution that no approval
 * surface of ours covers. The host reports each installed handler with its
 * origin (`hook/list` → `handlerKind`), which is what this module reads:
 * `project` and `plugin` rows are refused until the exact file is accepted.
 *
 * The acceptance is a record, not a prompt: `@opencode/plugin` 2.3.2 has no
 * dialog surface, so the record is written by the doctor or by the env override
 * below, and it names the file's hash so an edited file asks again.
 */
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { SessionHost } from "./session.js";
import { stateDirectory } from "./usage-ledger.js";

/** The workspace file Muse loads hook handlers from. */
export const HOOKS_RELATIVE_PATH = join(".muse", "hooks.json");

/** Accept the repo's hooks for this run, without a trust record. */
export const PROJECT_HOOKS_ENV = "MUSE_ALLOW_PROJECT_HOOKS";

/** Origins that mean "the workspace or a plugin installed into it supplies this". */
const BLOCKING_KINDS: ReadonlySet<string> = new Set(["project", "plugin"]);

/** One installed handler, as `hook/list` reports it. */
export interface HookRow {
  readonly enabled: boolean;
  readonly event: string;
  readonly handlerKind: string;
  readonly key: string;
}

/** One accepted hooks file. `hooksSha256` is the digest of the file's bytes. */
export interface HookTrustEntry {
  readonly canonicalPath: string;
  readonly hooksSha256: string;
  readonly acceptedAtMs: number;
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

/** Enabled handlers whose origin is the workspace or a workspace plugin. */
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
    return (
      typeof row?.canonicalPath === "string" &&
      typeof row.hooksSha256 === "string" &&
      typeof row.acceptedAtMs === "number"
    );
  });
}

/** Replace the record for this path, keeping every other path's entry. */
export function recordHookTrust(entry: HookTrustEntry, env: NodeJS.ProcessEnv = process.env): void {
  const path = hookTrustPath(env);
  const entries = readHookTrust(env).filter((row) => row.canonicalPath !== entry.canonicalPath);
  entries.push(entry);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`, { mode: 0o600 });
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
  const kept = existing.filter((row) => row.canonicalPath !== canonicalPath);
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

/** A readable list of hook keys, capped so a refusal stays one message. */
function describeKeys(rows: readonly HookRow[]): string {
  const keys = rows.slice(0, 3).map((row) => `${row.event}:${row.key}`);
  const rest = rows.length - keys.length;
  return rest > 0 ? `${keys.join(", ")} and ${rest} more` : keys.join(", ");
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
  const digest = hooksDigest(file);
  if (hooksTrusted(root, digest, env)) return null;
  const exists = existsSync(file);
  const subject = exists ? file : "an installed Muse plugin";
  return (
    `Muse would load ${blocking.length} workspace-supplied hook(s) in ${canonicalRoot(root)}: ` +
    `${describeKeys(blocking)}. Hooks are commands Muse runs outside opencode's permissions, ` +
    `so this session is refused. Accept ${subject} for one run with ${PROJECT_HOOKS_ENV}=1, ` +
    `or record it as trusted with the plugin's doctor (bun run doctor --trust-hooks).`
  );
}
