import { execFile } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, win32 } from "node:path";
import { promisify } from "node:util";

/**
 * A private Muse config dir for one host process.
 *
 * Muse takes its prompt and toolset from `settings.json` at startup, and there
 * is no per-session or command-line way to pass them. A redirected
 * `XDG_CONFIG_HOME` with a bridge-authored file is therefore the only way to
 * keep Muse to inference: the file pins the toolset to the opencode bridge and
 * replaces Muse's own base prompt. The user's real config is never read or
 * written; only `auth.json` is linked in so the existing login keeps working.
 */

/** The bridge's MCP server name, and the only tool namespace Muse may use. */
export const BRIDGE_TOOLSET: readonly string[] = ["mcp__opencode__*"];

/**
 * Replaces Muse's ~64k-character base prompt. It keeps the one fact the model
 * cannot infer from the turn (that opencode owns the session) and tells it to
 * ignore the skill catalog Muse still injects separately.
 */
export const CONTROL_SYSTEM_PROMPT = [
  "You are the language model inside an opencode session.",
  "opencode owns the agent loop, the tools, the permissions, and the history.",
  "Use only the tools in the tool list; never assume a tool you were not given.",
  "The session's role and instructions arrive as developer context or the first user message; follow them.",
  "Ignore any skill catalog, reminder, or workflow text in this prompt, and answer concisely.",
].join("\n");

/**
 * Muse's observer agents. Each one is an extra billed model call that competes
 * with opencode for control of the loop, so all six are off.
 */
export const MUSE_REMINDERS = [
  "goal-reminder",
  "verify-reminder",
  "skill-reminder",
  "todo-reminder",
  "memory",
  "scope-reminder",
] as const;

/** `{ [scope]: { [path]: "off" } }`, the shape Muse's skill activation reads. */
export type SkillsOff = Record<string, Record<string, "off">>;

export type SkillsProbeStatus = "enumerated" | "empty" | "failed";

export interface SkillsProbeReport {
  readonly off: SkillsOff;
  readonly status: SkillsProbeStatus;
  readonly error?: string;
}

export interface HostConfigPaths {
  /** The config root to export as `XDG_CONFIG_HOME`. */
  readonly xdg: string;
  /** `<xdg>/muse/settings.json`. */
  readonly settingsPath: string;
  /** The settings written, for tests and telemetry. */
  readonly settings: Record<string, unknown>;
  /** Whether the skill lockdown was enumerated, empty, or unavailable. */
  readonly diagnostics: {
    readonly skills: SkillsProbeStatus;
    readonly skillsError?: string;
  };
  /** Remove the private directory and everything in it. */
  remove(): void;
}

export interface HostConfigOptions {
  /** Prompt written to `run.system_prompt`; defaults to the control prompt. */
  readonly systemPrompt?: string;
  /** Toolset allowlist; defaults to the bridge namespace. */
  readonly toolset?: readonly string[];
  /**
   * Compaction thresholds. Opencode owns compaction: Muse compacts only its
   * own native history, and a Muse-side compaction would rewrite context this
   * plugin cannot see or fingerprint. The host requires soft < hard and
   * refuses 1/1, so the defaults sit at the window's edge, above opencode's
   * own limit, leaving the decision to opencode.
   */
  readonly softThreshold?: number;
  readonly hardThreshold?: number;
  /** Parent for the temporary directory; defaults to `os.tmpdir()`. */
  readonly baseDir?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly homeDirectory?: string;
  /** Muse executable used to enumerate skills; defaults to `muse`. */
  readonly museBin?: string;
  /** Test seam: return the activation map instead of running the CLI. */
  readonly listSkills?: () => Promise<SkillsOff>;
}

/**
 * The user's real Muse config dir.
 *
 * Used only to find `auth.json` for the symlink. Nothing here reads the file.
 */
export function userMuseConfigDir(options: HostConfigOptions = {}): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const homeDirectory = options.homeDirectory ?? homedir();
  if (platform === "win32") {
    const appData = env.LOCALAPPDATA;
    const root = appData && win32.isAbsolute(appData)
      ? appData
      : win32.join(homeDirectory, "AppData", "Local");
    return win32.join(root, "muse");
  }
  const root = env.XDG_CONFIG_HOME && isAbsolute(env.XDG_CONFIG_HOME)
    ? env.XDG_CONFIG_HOME
    : join(homeDirectory, ".config");
  return join(root, "muse");
}

const execFileAsync = promisify(execFile);

/**
 * Enumerate Muse's registered skills in a throwaway config dir and turn every
 * one off.
 *
 * `muse skills list --json` is the only catalog source that names the scope and
 * path Muse's activation map expects. It never sees the private host config:
 * the probe gets its own empty XDG root, and the contributor switch is stripped
 * so the listing matches the ordinary model path. Any failure returns `{}`; the
 * control prompt is the fallback, and a missing skill lockdown must not stop the
 * host.
 */
export async function collectSkillsOffReport(
  museBin: string,
  env: NodeJS.ProcessEnv,
): Promise<SkillsProbeReport> {
  const root = mkdtempSync(join(tmpdir(), "opencode-muse-skills-"));
  const xdg = join(root, "config");
  mkdirSync(join(xdg, "muse"), { recursive: true, mode: 0o700 });
  const clean: NodeJS.ProcessEnv = { ...env };
  delete clean.META_API_KEY;
  delete clean.MUSE_CONTRIBUTOR_MODE;
  try {
    const { stdout } = await execFileAsync(museBin, ["skills", "list", "--json"], {
      env: { ...clean, XDG_CONFIG_HOME: xdg, MUSE_NO_AUTO_UPDATE: "1" },
      timeout: 30_000,
      maxBuffer: 16 << 20,
      encoding: "utf8",
    });
    const parsed = JSON.parse(stdout) as unknown;
    const rows = Array.isArray(parsed)
      ? parsed
      : (parsed as { skills?: unknown } | null)?.skills;
    const off: SkillsOff = {};
    if (!Array.isArray(rows)) return { off, status: "empty" };
    for (const row of rows) {
      if (typeof row !== "object" || row === null) continue;
      const scope = (row as { scope?: unknown }).scope;
      const path = (row as { path?: unknown }).path;
      if (typeof scope !== "string" || typeof path !== "string") continue;
      (off[scope] ??= {})[path] = "off";
    }
    return { off, status: Object.keys(off).length === 0 ? "empty" : "enumerated" };
  } catch (error) {
    return {
      off: {},
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Compatibility wrapper for callers that only need the activation map. */
export async function collectSkillsOff(
  museBin: string,
  env: NodeJS.ProcessEnv,
): Promise<SkillsOff> {
  return (await collectSkillsOffReport(museBin, env)).off;
}

/**
 * Write a private `settings.json` and link the user's login into it.
 *
 * The directory is 0700 and the file 0600. If `auth.json` cannot be linked
 * (Windows without symlink permission, for example) the host still starts; the
 * caller can surface the login failure Muse reports.
 *
 * Skills are enumerated before the file is written. That is the only async
 * step: everything in `settings.json` except the activation map is static, so a
 * failed probe simply omits the map and leaves the control prompt in charge.
 */
export async function writeMuseHostConfig(
  options: HostConfigOptions = {},
): Promise<HostConfigPaths> {
  const skillsReport: SkillsProbeReport = options.listSkills
    ? await options.listSkills().then((off) => ({
        off,
        status: Object.keys(off).length === 0 ? "empty" : "enumerated",
      }))
    : await collectSkillsOffReport(options.museBin ?? "muse", options.env ?? process.env);
  const skillsOff = skillsReport.off;

  const xdg = mkdtempSync(join(options.baseDir ?? tmpdir(), "opencode-muse-"));
  const dir = join(xdg, "muse");
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const settings: Record<string, unknown> = {
    schema_version: 1,
    run: {
      toolset: [...(options.toolset ?? BRIDGE_TOOLSET)],
      system_prompt: options.systemPrompt ?? CONTROL_SYSTEM_PROMPT,
      workflow_trigger_mode: "off",
      context_usage_message_enabled: false,
      context_slimming: {
        meta_context_note_enabled: false,
        session_identity_enabled: false,
      },
    },
    runtime_capabilities: Object.fromEntries(
      MUSE_REMINDERS.map((name) => [`plugin:tbh-reminders:reminder:${name}`, { enabled: false }]),
    ),
    ...(Object.keys(skillsOff).length === 0 ? {} : { skills: { activation: skillsOff } }),
    context: {
      foreign_personal_rules: false,
      foreign_personal_skills: false,
    },
    // Muse must not compact. Deferring both thresholds to the window's edge
    // (the host refuses 1/1, and exposes no disable switch) leaves compaction
    // to opencode, which owns the transcript this provider is asked to render.
    context_compaction: {
      soft_threshold: options.softThreshold ?? 0.99,
      hard_threshold: options.hardThreshold ?? 0.995,
    },
  };
  const settingsPath = join(dir, "settings.json");
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 1)}\n`, { mode: 0o600 });

  const authSource = join(userMuseConfigDir(options), "auth.json");
  try {
    if (existsSync(authSource) && lstatSync(authSource).isFile()) {
      symlinkSync(authSource, join(dir, "auth.json"));
    }
  } catch {
    // A raced or refused link leaves the host to report the missing login.
  }

  return {
    xdg,
    settingsPath,
    settings,
    diagnostics: {
      skills: skillsReport.status,
      ...(skillsReport.error === undefined ? {} : { skillsError: skillsReport.error }),
    },
    remove: () => rmSync(xdg, { recursive: true, force: true }),
  };
}
