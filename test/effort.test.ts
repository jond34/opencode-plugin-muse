import { describe, expect, test } from "bun:test";
import {
  UnsupportedEffortError,
  buildEffortCatalog,
  resolveEffort,
} from "../src/effort.js";

describe("resolveEffort", () => {
  test("no variant leaves the host default alone", () => {
    expect(resolveEffort({ variants: ["low", "high"] }, undefined)).toBeUndefined();
    expect(resolveEffort(undefined, "")).toBeUndefined();
  });

  test("default leaves the host default alone even when the catalog names one", () => {
    const catalog = buildEffortCatalog([
      { modelId: "muse-spark-1.3", defaultReasoningEffort: "max", variants: ["low", "high", "max"] },
    ]);
    expect(resolveEffort(catalog.get("muse-spark-1.3"), "default")).toBeUndefined();
    expect(resolveEffort({ variants: ["low", "high"] }, "default")).toBeUndefined();
  });

  test("off maps to none", () => {
    expect(resolveEffort({ variants: ["low", "high"] }, "off")).toBe("none");
  });

  test("an unknown tier fails closed", () => {
    expect(() => resolveEffort({ variants: ["low"] }, "turbo")).toThrow(UnsupportedEffortError);
  });

  test("a known tier the model does not offer fails closed", () => {
    expect(() => resolveEffort({ variants: ["medium", "high", "xhigh"] }, "ultra")).toThrow(
      UnsupportedEffortError,
    );
  });

  test("a model with no offered tiers fails closed", () => {
    expect(() => resolveEffort({ variants: [] }, "high")).toThrow(UnsupportedEffortError);
    expect(() => resolveEffort(undefined, "high")).toThrow(UnsupportedEffortError);
  });
});

describe("buildEffortCatalog", () => {
  test("reads modelId and string or object variants, ignoring the catalog default", () => {
    const catalog = buildEffortCatalog([
      {
        modelId: "muse-spark-1.3",
        defaultReasoningEffort: "max",
        variants: ["low", { id: "high" }, "max"],
      },
      { modelId: "muse-ember-1.0", variants: [] },
      { displayLabel: "no id" },
    ]);

    expect(catalog.get("muse-spark-1.3")).toEqual({ variants: ["low", "high", "max"] });
    expect(catalog.get("muse-ember-1.0")).toEqual({ variants: [] });
    expect(catalog.size).toBe(2);
  });
});
