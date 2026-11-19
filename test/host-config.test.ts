import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BRIDGE_TOOLSET,
  CONTROL_SYSTEM_PROMPT,
  MUSE_REMINDERS,
  collectSkillsOff,
  collectSkillsOffReport,
  userMuseConfigDir,
  writeMuseHostConfig,
  type HostConfigOptions,
} from "../src/host-config.js";

interface Settings {
  schema_version: number;
  run: {
    toolset: string[];
    system_prompt: string;
    workflow_trigger_mode: string;
    context_usage_message_enabled: boolean;
    context_slimming: {
      meta_context_note_enabled: boolean;
      session_identity_enabled: boolean;
    };
  };
  runtime_capabilities: Record<string, { enabled: boolean }>;
  skills?: { activation: Record<string, Record<string, "off">> };
  context: { foreign_personal_rules: boolean; foreign_personal_skills: boolean };
  context_compaction: { soft_threshold: number; hard_threshold: number };
}

function home(): string {
  return mkdtempSync(join(tmpdir(), "muse-home-"));
}

/** Never let a test invoke the real `muse` binary. */
function write(options: HostConfigOptions = {}) {
  return writeMuseHostConfig({ listSkills: async () => ({}), ...options });
}

function settingsAt(path: string): Settings {
  return JSON.parse(readFileSync(path, "utf8")) as Settings;
}

describe("host config", () => {
  test("writes a private settings file that contains Muse to the bridge", async () => {
    const base = home();
    const config = await write({ baseDir: base, homeDirectory: base });
    try {
      const settings = settingsAt(config.settingsPath);
      expect(settings.schema_version).toBe(1);
      expect(settings.run.toolset).toEqual([...BRIDGE_TOOLSET]);
      expect(settings.run.system_prompt).toBe(CONTROL_SYSTEM_PROMPT);
      expect(settings.run.workflow_trigger_mode).toBe("off");
      expect(settings.run.context_usage_message_enabled).toBe(false);
      expect(settings.run.context_slimming).toEqual({
        meta_context_note_enabled: false,
        session_identity_enabled: false,
      });
      expect(settings.context_compaction).toEqual({ soft_threshold: 0.99, hard_threshold: 0.995 });
      expect(settings.context).toEqual({
        foreign_personal_rules: false,
        foreign_personal_skills: false,
      });
      expect(settings.skills).toBeUndefined();
      expect(config.diagnostics.skills).toBe("empty");
    } finally {
      config.remove();
    }
  });

  test("disables every observer reminder", async () => {
    const base = home();
    const config = await write({ baseDir: base, homeDirectory: base });
    try {
      const settings = settingsAt(config.settingsPath);
      expect(Object.keys(settings.runtime_capabilities)).toHaveLength(MUSE_REMINDERS.length);
      for (const name of MUSE_REMINDERS) {
        expect(settings.runtime_capabilities[`plugin:tbh-reminders:reminder:${name}`]).toEqual({
          enabled: false,
        });
      }
    } finally {
      config.remove();
    }
  });

  test("turns every enumerated skill off", async () => {
    const base = home();
    const config = await write({
      baseDir: base,
      homeDirectory: base,
      listSkills: async () => ({
        user: { "/home/u/.config/muse/skills/one": "off" },
        project: { "/work/.muse/skills/two": "off" },
      }),
    });
    try {
      const settings = settingsAt(config.settingsPath);
      expect(settings.skills).toEqual({
        activation: {
          user: { "/home/u/.config/muse/skills/one": "off" },
          project: { "/work/.muse/skills/two": "off" },
        },
      });
      expect(config.diagnostics.skills).toBe("enumerated");
    } finally {
      config.remove();
    }
  });

  test("keeps the directory and file private", async () => {
    const base = home();
    const config = await write({ baseDir: base, homeDirectory: base });
    try {
      expect(statSync(config.xdg).mode & 0o777).toBe(0o700);
      expect(statSync(config.settingsPath).mode & 0o777).toBe(0o600);
    } finally {
      config.remove();
    }
  });

  test("links the user's login instead of copying it", async () => {
    const base = home();
    const realDir = join(base, ".config", "muse");
    mkdirSync(realDir, { recursive: true });
    const authSource = join(realDir, "auth.json");
    writeFileSync(authSource, '{"token":"test"}\n');

    const config = await write({ baseDir: base, homeDirectory: base, env: {} });
    try {
      const link = join(config.xdg, "muse", "auth.json");
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(readFileSync(link, "utf8")).toBe('{"token":"test"}\n');
    } finally {
      config.remove();
    }
  });

  test("writes no login when the user has none", async () => {
    const base = home();
    const config = await write({ baseDir: base, homeDirectory: base, env: {} });
    try {
      expect(existsSync(join(config.xdg, "muse", "auth.json"))).toBe(false);
    } finally {
      config.remove();
    }
  });

  test("honours prompt, toolset, and threshold overrides", async () => {
    const base = home();
    const config = await write({
      baseDir: base,
      homeDirectory: base,
      systemPrompt: "custom",
      toolset: ["mcp__other__*"],
      softThreshold: 0.9,
      hardThreshold: 0.95,
    });
    try {
      const settings = settingsAt(config.settingsPath);
      expect(settings.run.system_prompt).toBe("custom");
      expect(settings.run.toolset).toEqual(["mcp__other__*"]);
      expect(settings.context_compaction).toEqual({ soft_threshold: 0.9, hard_threshold: 0.95 });
    } finally {
      config.remove();
    }
  });

  test("remove() deletes the private directory", async () => {
    const base = home();
    const config = await write({ baseDir: base, homeDirectory: base });
    expect(existsSync(config.xdg)).toBe(true);
    config.remove();
    expect(existsSync(config.xdg)).toBe(false);
    rmSync(base, { recursive: true, force: true });
  });

  test("a missing muse binary fails open with no skill map", async () => {
    await expect(collectSkillsOff("definitely-not-a-muse-binary-xyz", {})).resolves.toEqual({});
  });

  test("a failed skill probe is reported instead of looking empty", async () => {
    const report = await collectSkillsOffReport("definitely-not-a-muse-binary-xyz", {});
    expect(report.off).toEqual({});
    expect(report.status).toBe("failed");
    expect(report.error).toBeTruthy();
  });

  test("resolves the real config dir per platform", () => {
    expect(
      userMuseConfigDir({ platform: "linux", homeDirectory: "/home/u", env: {} }),
    ).toBe("/home/u/.config/muse");
    expect(
      userMuseConfigDir({
        platform: "linux",
        homeDirectory: "/home/u",
        env: { XDG_CONFIG_HOME: "/cfg" },
      }),
    ).toBe("/cfg/muse");
    expect(
      userMuseConfigDir({
        platform: "win32",
        homeDirectory: "C:\\Users\\u",
        env: { LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" },
      }),
    ).toBe("C:\\Users\\u\\AppData\\Local\\muse");
  });
});
