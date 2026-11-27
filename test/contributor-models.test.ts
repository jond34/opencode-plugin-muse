import { describe, expect, test } from "bun:test";
import { Provider } from "@opencode/plugin";
import {
  contributorModeFromEnv,
  contributorModelEntries,
  resolveSessionLog,
  serveArgs,
  type CatalogRow,
} from "../src/host.js";
import { toModelInfo } from "../src/plugin.js";

const providerID = Provider.ID.make("muse");

const visible = [
  {
    modelId: "muse-spark-1.3",
    displayLabel: "muse-spark-1.3",
    contextLimit: 1007997,
    outputLimit: 128000,
    variants: ["minimal", "high"],
    releaseDate: "2026-09-02",
  },
  {
    modelId: "muse-ember-1.0",
    displayLabel: "muse-ember-1.0",
    contextLimit: 1007997,
    outputLimit: 128000,
    variants: ["minimal", "high"],
    releaseDate: "2026-10-01",
  },
];

describe("contributorModeFromEnv", () => {
  test("accepts Muse's documented 1 so the same env name means the same thing", () => {
    expect(contributorModeFromEnv("1")).toBe("on");
    expect(contributorModeFromEnv(" 1 ")).toBe("on");
  });

  test("accepts the words a shell user is likely to write", () => {
    expect(contributorModeFromEnv("on")).toBe("on");
    expect(contributorModeFromEnv("TRUE")).toBe("on");
  });

  test("keeps the privacy-safe default for 0, off, and anything unclear", () => {
    for (const value of [undefined, "", "0", "false", "off", "yes", "1x"]) {
      expect(contributorModeFromEnv(value)).toBe("off");
    }
  });
});

describe("contributorModelEntries", () => {
  test("clones the base row under the contributor id", () => {
    const rows: CatalogRow[] = [
      {
        model_id: "muse-spark-1.3-contributor",
        display_label: "muse-spark-1.3-contributor",
        description: "Your content may be used for product improvement.",
      },
    ];
    const entries = contributorModelEntries(visible, rows);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      modelId: "muse-spark-1.3-contributor",
      displayLabel: "muse-spark-1.3-contributor",
      description: "Your content may be used for product improvement.",
      contextLimit: 1007997,
      outputLimit: 128000,
      variants: ["minimal", "high"],
      releaseDate: "2026-09-02",
    });
  });

  test("a contributor row with no visible base model contributes nothing", () => {
    const rows: CatalogRow[] = [
      { model_id: "muse-unknown-1.0-contributor", display_label: "x", description: null },
    ];
    expect(contributorModelEntries(visible, rows)).toEqual([]);
  });

  test("rows without the contributor suffix are ignored", () => {
    const rows: CatalogRow[] = [{ model_id: "muse-image-1.0", display_label: "x", description: null }];
    expect(contributorModelEntries(visible, rows)).toEqual([]);
  });

  test("a missing description leaves the base row untouched", () => {
    const rows: CatalogRow[] = [
      { model_id: "muse-ember-1.0-contributor", display_label: "muse-ember-1.0-contributor", description: null },
    ];
    expect(contributorModelEntries(visible, rows)[0]).not.toHaveProperty("description");
  });
});

describe("toModelInfo", () => {
  test("does not mark provider compaction, which opencode rejects for AI SDK providers", () => {
    const info = toModelInfo(providerID, { modelId: "muse-spark-1.3" });
    expect(info.settings?.compaction).toBeUndefined();
  });

  // The plugin-path probe (E-D124) showed a provider with canonical: "meta"
  // keeping its own model limits; opencode copies the label, not the catalog's
  // numbers. Pin the local half: the record's limits win, and `canonical` is
  // left to the provider so there is one source for the label.
  test("keeps the model record's limits and leaves canonical to the provider", () => {
    const info = toModelInfo(providerID, {
      modelId: "muse-spark-1.3",
      contextLimit: 111111,
      outputLimit: 22222,
    });
    expect(info.limit).toEqual({ context: 111111, output: 22222 });
    expect(info.canonical).toBeUndefined();
  });

  test("names contributor entries the way models.dev does", () => {
    const name = (modelId: string) =>
      toModelInfo(providerID, { modelId, displayLabel: modelId }).name;
    expect(name("muse-spark-1.3")).toBe("Muse Spark 1.3");
    expect(name("muse-spark-1.3-contributor")).toBe("Muse Spark 1.3 Contributor");
    expect(name("muse-ember-1.0")).toBe("Muse Ember");
  });

  // A subscription covers usage, so opencode's ChatGPT and Claude Agent
  // logins both carry `cost: []`; the picker then shows no price. A non-empty
  // all-zero tier would instead be labelled "Free".
  test("declares no per-token price", () => {
    expect(toModelInfo(providerID, { modelId: "muse-ember-1.0" }).cost).toEqual([]);
  });
});

describe("serveArgs", () => {
  test("forwards the preset, contributor mode, and trust flag", () => {
    expect(serveArgs({ preset: "empty", contributorMode: "off", trustWorkspace: true })).toEqual([
      "serve",
      "--preset",
      "empty",
      "--contributor-mode",
      "off",
      "--trust-workspace",
      "--disable-request-user-input",
    ]);
  });

  test("leaves write and shell posture alone so bridged tools match other models", () => {
    // Muse reports `--disable-write` to the model, which then declines the
    // bridged write opencode would have run. The toolset allowlist is the
    // fence; the posture flags only cost parity.
    expect(serveArgs({})).toEqual(["serve", "--disable-request-user-input"]);
  });

  test("passes --no-session-log only when the transcript is turned off", () => {
    expect(serveArgs({ sessionLog: true })).toEqual(["serve", "--disable-request-user-input"]);
    expect(serveArgs({ sessionLog: false })).toEqual([
      "serve",
      "--no-session-log",
      "--disable-request-user-input",
    ]);
  });
});

describe("resolveSessionLog", () => {
  test("defaults on, so an unset option changes nothing", () => {
    expect(resolveSessionLog({}, undefined)).toEqual({ enabled: true, source: "default", warnings: [] });
  });

  test("the option can turn it off", () => {
    expect(resolveSessionLog({ sessionLog: false }, undefined)).toEqual({
      enabled: false,
      source: "option",
      warnings: [],
    });
  });

  test("the environment wins, so a repo config cannot erase the switch", () => {
    expect(resolveSessionLog({ sessionLog: false }, "1").enabled).toBe(true);
    expect(resolveSessionLog({ sessionLog: true }, "0").enabled).toBe(false);
  });

  test("an unparseable environment value is ignored and reported", () => {
    const resolved = resolveSessionLog({ sessionLog: false }, "sometimes");
    expect(resolved.enabled).toBe(false);
    expect(resolved.source).toBe("option");
    expect(resolved.warnings).toHaveLength(1);
  });

  test("a non-boolean option is ignored and reported", () => {
    const resolved = resolveSessionLog({ sessionLog: "false" }, undefined);
    expect(resolved.enabled).toBe(true);
    expect(resolved.source).toBe("default");
    expect(resolved.warnings).toHaveLength(1);
  });
});
