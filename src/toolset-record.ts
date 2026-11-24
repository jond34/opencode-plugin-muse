import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

/**
 * The host's own record of the tool list it applied for a session.
 *
 * `settings.json` says what we asked for (`mcp__opencode__*`). The session log
 * records what Muse resolved that to: a `runtime.session` event whose
 * `payload.event.toolset` carries `{ active_tools, mode, source }`. On the pinned
 * pair that is 13 `mcp__opencode__*` names with `mode: "named"`, `source:
 * "settings"` - host-resolved, not an echo of the request.
 *
 * This is the only surface that can attest containment instead of asserting it,
 * and it costs nothing: the record is written on the first real request.
 */

export interface ToolsetObservation {
  readonly tools: readonly string[];
  /** How the host interpreted the list, as it reported it. */
  readonly mode: string | null;
  /** Where the host says the list came from (`settings`). */
  readonly source: string | null;
  /** Session id (the record's parent directory name), for the evidence line. */
  readonly session: string;
  readonly recordPath: string;
  readonly recordedAt: string | null;
}

export type ToolsetProbe =
  | { readonly status: "observed"; readonly observation: ToolsetObservation }
  | { readonly status: "absent"; readonly root: string }
  | { readonly status: "unreadable"; readonly root: string; readonly error: string };

/**
 * Where the host writes session records, most authoritative source first: an
 * explicit `MUSE_SESSIONS_ROOT`, then the host's own `museHome` (the vendor says
 * to take that path from the handshake, never to build it), and only then the
 * documented XDG layout.
 */
export function sessionsRoot(
  options: { readonly env?: NodeJS.ProcessEnv; readonly museHome?: string | null } = {},
): string {
  const env = options.env ?? process.env;
  const override = env.MUSE_SESSIONS_ROOT;
  if (override !== undefined && override.length > 0) return override;
  const museHome = options.museHome;
  if (museHome !== undefined && museHome !== null && museHome.length > 0) {
    return join(museHome, "sessions");
  }
  return defaultSessionsRoot(env);
}

/** Default session root: `<XDG_DATA_HOME>/muse/sessions`. */
export function defaultSessionsRoot(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.HOME !== undefined && env.HOME.length > 0 ? env.HOME : homedir();
  const data =
    env.XDG_DATA_HOME !== undefined && env.XDG_DATA_HOME.length > 0
      ? env.XDG_DATA_HOME
      : join(home, ".local", "share");
  return join(data, "muse", "sessions");
}

function toolsetBlock(record: unknown): {
  active_tools?: unknown;
  mode?: unknown;
  source?: unknown;
} | null {
  const payload = (record as { payload?: { event?: { toolset?: unknown } } } | null)?.payload;
  const toolset = payload?.event?.toolset;
  return typeof toolset === "object" && toolset !== null
    ? (toolset as { active_tools?: unknown; mode?: unknown; source?: unknown })
    : null;
}

/**
 * The last toolset block in one `session.jsonl` text, or null.
 *
 * Lines that do not parse are skipped: a truncated tail is normal for a log
 * still being written, and it is not evidence either way.
 */
export function toolsetObservationFromJsonl(text: string, recordPath: string): ToolsetObservation | null {
  let found: ToolsetObservation | null = null;
  const session = basename(dirname(recordPath));
  for (const line of text.split("\n")) {
    if (!line.includes("active_tools")) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const block = toolsetBlock(record);
    if (block === null || !Array.isArray(block.active_tools)) continue;
    const tools = block.active_tools.filter((name): name is string => typeof name === "string");
    const recordedAt = (record as { recorded_at?: unknown }).recorded_at;
    found = {
      tools,
      mode: typeof block.mode === "string" ? block.mode : null,
      source: typeof block.source === "string" ? block.source : null,
      session,
      recordPath,
      recordedAt: typeof recordedAt === "string" ? recordedAt : null,
    };
  }
  return found;
}

/** Every `session.jsonl` under a sessions root, newest first. Bounded walk. */
export function sessionRecords(root: string, maxDepth = 6): string[] {
  const paths: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let info;
      try {
        info = statSync(full);
      } catch {
        continue;
      }
      if (info.isDirectory()) walk(full, depth + 1);
      else if (entry === "session.jsonl") paths.push(full);
    }
  };
  walk(root, 0);
  return paths.sort((left, right) => {
    try {
      return statSync(right).mtimeMs - statSync(left).mtimeMs;
    } catch {
      return 0;
    }
  });
}

/**
 * Read the newest session record that carries a toolset block.
 *
 * "absent" (no record at all) and "unreadable" (a record we could not use) stay
 * distinct: the first is normal before the first request, the second means the
 * instrument is broken and must not be reported as a pass.
 */
export function probeToolsetObservation(root: string): ToolsetProbe {
  let paths: string[];
  try {
    paths = sessionRecords(root);
  } catch (error) {
    return { status: "unreadable", root, error: error instanceof Error ? error.message : String(error) };
  }
  if (paths.length === 0) return { status: "absent", root };
  for (const path of paths) {
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    const observation = toolsetObservationFromJsonl(text, path);
    if (observation !== null) return { status: "observed", observation };
  }
  return { status: "unreadable", root, error: "no session record carried a toolset block" };
}
