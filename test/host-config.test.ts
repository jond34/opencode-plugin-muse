import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BRIDGE_TOOLSET,
  CONTROL_SYSTEM_PROMPT,
  userMuseConfigDir,
  writeMuseHostConfig,
} from "../src/host-config.js";

interface Settings {
  schema_version: number;
  run: { toolset: string[]; system_prompt: string };
  context: { foreign_personal_rules: boolean };
  context_compaction: { soft_threshold: number; hard_threshold: number };
}

function home(): string {
  return mkdtempSync(join(tmpdir(), "muse-home-"));
}

function settingsAt(path: string): Settings {
  return JSON.parse(readFileSync(path, "utf8")) as Settings;
}

describe("host config", () => {
  test("writes a private settings file that contains Muse to the bridge", () => {
    const base = home();
    const config = writeMuseHostConfig({ baseDir: base, homeDirectory: base });
    try {
      const settings = settingsAt(config.settingsPath);
      expect(settings.schema_version).toBe(1);
      expect(settings.run.toolset).toEqual([...BRIDGE_TOOLSET]);
      expect(settings.run.system_prompt).toBe(CONTROL_SYSTEM_PROMPT);
      expect(settings.context_compaction).toEqual({ soft_threshold: 0.99, hard_threshold: 0.995 });
      expect(settings.context.foreign_personal_rules).toBe(false);
    } finally {
      config.remove();
    }
  });

  test("keeps the directory and file private", () => {
    const base = home();
    const config = writeMuseHostConfig({ baseDir: base, homeDirectory: base });
    try {
      expect(statSync(config.xdg).mode & 0o777).toBe(0o700);
      expect(statSync(config.settingsPath).mode & 0o777).toBe(0o600);
    } finally {
      config.remove();
    }
  });

  test("links the user's login instead of copying it", () => {
    const base = home();
    const realDir = join(base, ".config", "muse");
    mkdirSync(realDir, { recursive: true });
    const authSource = join(realDir, "auth.json");
    writeFileSync(authSource, '{"token":"test"}\n');

    const config = writeMuseHostConfig({ baseDir: base, homeDirectory: base, env: {} });
    try {
      const link = join(config.xdg, "muse", "auth.json");
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(readFileSync(link, "utf8")).toBe('{"token":"test"}\n');
    } finally {
      config.remove();
    }
  });

  test("writes no login when the user has none", () => {
    const base = home();
    const config = writeMuseHostConfig({ baseDir: base, homeDirectory: base, env: {} });
    try {
      expect(existsSync(join(config.xdg, "muse", "auth.json"))).toBe(false);
    } finally {
      config.remove();
    }
  });

  test("honours prompt and toolset overrides", () => {
    const base = home();
    const config = writeMuseHostConfig({
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

  test("remove() deletes the private directory", () => {
    const base = home();
    const config = writeMuseHostConfig({ baseDir: base, homeDirectory: base });
    expect(existsSync(config.xdg)).toBe(true);
    config.remove();
    expect(existsSync(config.xdg)).toBe(false);
    rmSync(base, { recursive: true, force: true });
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
