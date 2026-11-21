import { describe, expect, test } from "bun:test";
import { MuseHarnessAdapter } from "../src/adapter.js";
import { packageVersion } from "../src/version.js";
import manifest from "../package.json" with { type: "json" };

describe("reported versions", () => {
  test("packageVersion is the manifest version, not a literal", () => {
    expect(packageVersion()).toBe(manifest.version);
    expect(packageVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("adapter info reports the version on disk", () => {
    const adapter = new MuseHarnessAdapter();
    expect(adapter.info.version).toBe(manifest.version);
    expect(adapter.info.id).toBe("muse");
  });

  test("no source file hardcodes a version for the adapter or client", async () => {
    // The two literals this replaced: 1.4.15 (adapter) and 0.1.0 (clientInfo).
    const sources = ["../src/adapter.ts", "../src/host.ts"];
    for (const path of sources) {
      const text = await Bun.file(new URL(path, import.meta.url)).text();
      expect(text).not.toMatch(/version:\s*"\d+\.\d+\.\d+"/);
    }
  });
});
