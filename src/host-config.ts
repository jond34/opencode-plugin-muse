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
  "The first user message carries the session's role and instructions; follow them.",
  "Ignore any skill catalog, reminder, or workflow text in this prompt, and answer concisely.",
].join("\n");

export interface HostConfigPaths {
  /** The config root to export as `XDG_CONFIG_HOME`. */
  readonly xdg: string;
  /** `<xdg>/muse/settings.json`. */
  readonly settingsPath: string;
  /** Remove the private directory and everything in it. */
  remove(): void;
}

export interface HostConfigOptions {
  /** Prompt written to `run.system_prompt`; defaults to the control prompt. */
  readonly systemPrompt?: string;
  /** Toolset allowlist; defaults to the bridge namespace. */
  readonly toolset?: readonly string[];
  /**
   * Compaction thresholds. Muse requires soft < hard and refuses 1/1.
   * Defaults sit above opencode's own limit so Muse stops compacting first.
   */
  readonly softThreshold?: number;
  readonly hardThreshold?: number;
  /** Parent for the temporary directory; defaults to `os.tmpdir()`. */
  readonly baseDir?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly homeDirectory?: string;
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

/**
 * Write a private `settings.json` and link the user's login into it.
 *
 * The directory is 0700 and the file 0600. If `auth.json` cannot be linked
 * (Windows without symlink permission, for example) the host still starts; the
 * caller can surface the login failure Muse reports.
 */
export function writeMuseHostConfig(options: HostConfigOptions = {}): HostConfigPaths {
  const xdg = mkdtempSync(join(options.baseDir ?? tmpdir(), "opencode-muse-"));
  const dir = join(xdg, "muse");
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const settings = {
    schema_version: 1,
    run: {
      toolset: [...(options.toolset ?? BRIDGE_TOOLSET)],
      system_prompt: options.systemPrompt ?? CONTROL_SYSTEM_PROMPT,
    },
    context: { foreign_personal_rules: false },
    // Muse compacts its own history below opencode's limit. Deferring both
    // thresholds to the window's edge leaves compaction to opencode.
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
    remove: () => rmSync(xdg, { recursive: true, force: true }),
  };
}
