import { describe, expect, test } from "bun:test";
import { decideHistory, isToolOnlyRewrite, type HistoryInput } from "../src/history.js";

function input(overrides: Partial<HistoryInput> = {}): HistoryInput {
  return {
    fresh: true,
    nativeHasHistory: false,
    reseed: false,
    resumed: false,
    resumeFallback: false,
    nativeMissing: false,
    reconciliation: "same",
    toolOnly: false,
    compactionPending: false,
    pressure: false,
    promptHasHistory: false,
    ...overrides,
  };
}

describe("history decision table", () => {
  test("a first request with no history is a delta", () => {
    expect(decideHistory(input())).toEqual({ mode: "delta", reason: "first" });
  });

  test("a later step is always a delta", () => {
    expect(
      decideHistory(
        input({
          fresh: false,
          reseed: true,
          compactionPending: true,
          pressure: true,
          nativeHasHistory: true,
        }),
      ),
    ).toEqual({ mode: "delta", reason: "same" });
  });

  test("a rebuilt session with no native history seeds the whole prompt", () => {
    expect(decideHistory(input({ nativeHasHistory: false, promptHasHistory: true }))).toEqual({
      mode: "full",
      reason: "new_session",
    });
  });

  test("a resume fallback is a restart reseed", () => {
    expect(decideHistory(input({ resumeFallback: true, nativeHasHistory: true }))).toEqual({
      mode: "full",
      reason: "restart",
    });
  });

  test("a known compaction is named separately from a rewrite", () => {
    expect(
      decideHistory(
        input({ reseed: true, reconciliation: "compacted", nativeHasHistory: true }),
      ),
    ).toEqual({ mode: "full", reason: "opencode_compaction" });
  });

  test("a missing native window is named before a general rewrite", () => {
    expect(
      decideHistory(input({ reseed: true, reconciliation: "diverged", nativeMissing: true })),
    ).toEqual({ mode: "full", reason: "native_history_missing" });
    expect(
      decideHistory(
        input({ reseed: true, reconciliation: "diverged", toolOnly: true, nativeMissing: true }),
      ),
    ).toEqual({ mode: "full", reason: "native_history_missing" });
  });

  test("a tool-only rewrite is named, and a general rewrite is not", () => {
    expect(
      decideHistory(input({ reseed: true, reconciliation: "diverged", toolOnly: true })),
    ).toEqual({ mode: "full", reason: "tool_rewrite" });
    expect(decideHistory(input({ reseed: true, reconciliation: "diverged" }))).toEqual({
      mode: "full",
      reason: "rewrite",
    });
  });

  test("a Muse compaction outranks pressure and the restart artifact", () => {
    expect(
      decideHistory(
        input({
          reseed: true,
          compactionPending: true,
          pressure: true,
          resumeFallback: true,
        }),
      ),
    ).toEqual({ mode: "full", reason: "muse_compaction" });
  });

  test("pressure reseeds when nothing more specific applies", () => {
    expect(decideHistory(input({ pressure: true }))).toEqual({ mode: "full", reason: "pressure" });
  });

  test("a resumed session with matching history is a delta", () => {
    expect(decideHistory(input({ resumed: true, nativeHasHistory: true, promptHasHistory: true }))).toEqual({
      mode: "delta",
      reason: "same",
    });
  });
});

describe("tool-only rewrite detection", () => {
  test("only tool entries changing counts", () => {
    expect(isToolOnlyRewrite(["a", "tool-call:1:x"], ["a", "tool-call:1:y"])).toBe(true);
    expect(isToolOnlyRewrite(["a", "tool-call:1:x"], ["b", "tool-call:1:y"])).toBe(false);
  });

  test("a length change or no change is not a tool-only rewrite", () => {
    expect(isToolOnlyRewrite(["a"], ["a", "tool-result:1"])).toBe(false);
    expect(isToolOnlyRewrite(["a"], ["a"])).toBe(false);
    expect(isToolOnlyRewrite([], [])).toBe(false);
  });
});
