import { describe, expect, test } from "bun:test";
import {
  FALLBACK_CONTEXT_LIMIT,
  FALLBACK_OUTPUT_LIMIT,
  baseModelId,
  resolveModelLimits,
} from "../src/model-limits.js";

describe("model limits", () => {
  test("a null catalog limit never falls back above a known window", () => {
    const limits = resolveModelLimits({ modelId: "muse-spark-1.3", contextLimit: null }, {});
    expect(limits.context).toEqual({ value: FALLBACK_CONTEXT_LIMIT, source: "fallback" });
    expect(limits.context.value).toBeLessThan(1_048_576);
    expect(limits.output).toEqual({ value: FALLBACK_OUTPUT_LIMIT, source: "fallback" });
  });

  test("the catalog wins when it is a finite positive number", () => {
    const limits = resolveModelLimits({ modelId: "muse-spark-1.3", contextLimit: 1_007_997 }, {});
    expect(limits.context).toEqual({ value: 1_007_997, source: "catalog" });
  });

  test("a non-finite or non-positive catalog value is ignored", () => {
    expect(resolveModelLimits({ contextLimit: Number.NaN }, {}).context.source).toBe("fallback");
    expect(resolveModelLimits({ contextLimit: Infinity }, {}).context.source).toBe("fallback");
    expect(resolveModelLimits({ contextLimit: 0 }, {}).context.source).toBe("fallback");
    expect(resolveModelLimits({ contextLimit: -1 }, {}).context.source).toBe("fallback");
  });

  test("the table is keyed by base id, so a contributor shares its limits", () => {
    expect(baseModelId("muse-spark-1.3-contributor")).toBe("muse-spark-1.3");
    const table = { "muse-spark-1.3": 200_000 };
    expect(
      resolveModelLimits({ modelId: "muse-spark-1.3-contributor", contextLimit: null }, {}, table).context,
    ).toEqual({ value: 200_000, source: "table" });
  });

  test("an explicit override wins over catalog, table, and fallback", () => {
    const table = { "muse-spark-1.3": 200_000 };
    const limits = resolveModelLimits(
      { modelId: "muse-spark-1.3", contextLimit: 100_000, outputLimit: 4_000 },
      { MUSE_CONTEXT_LIMIT: "64000", MUSE_OUTPUT_LIMIT: "2048" },
      table,
    );
    expect(limits.context).toEqual({ value: 64_000, source: "override" });
    expect(limits.output).toEqual({ value: 2_048, source: "override" });
  });

  test("an invalid override is ignored rather than reported", () => {
    const limits = resolveModelLimits(
      { modelId: "muse-spark-1.3", contextLimit: null },
      { MUSE_CONTEXT_LIMIT: "not-a-number" },
    );
    expect(limits.context).toEqual({ value: FALLBACK_CONTEXT_LIMIT, source: "fallback" });
  });
});
