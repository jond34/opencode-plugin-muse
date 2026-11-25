import { beforeEach, describe, expect, test } from "bun:test";
import {
  allowanceMessage,
  allowanceWarnPercent,
  checkAllowance,
  parseAllowance,
  resetAllowanceWarning,
  shouldWarn,
} from "../src/allowance.js";

const RESET = Date.parse("2026-11-22T18:00:00.000Z");
/** A clock inside the fixture's window, before its reset. */
const NOW = Date.parse("2026-11-22T16:00:00.000Z");

function usage(usedPercent: number, resetsAtMs = RESET) {
  return {
    usage: {
      observedAtMs: Date.parse("2026-11-22T15:00:00.000Z"),
      tier: "pro",
      weekly: { usedPercent: 42, resetsAtMs: Date.parse("2026-11-25T00:00:00.000Z") },
      window: { usedPercent, resetsAtMs, windowDurationMins: 300 },
    },
  };
}

beforeEach(() => {
  resetAllowanceWarning();
});

describe("parsing", () => {
  test("reads the envelope and the bare usage object alike", () => {
    const fromEnvelope = parseAllowance(usage(91));
    const fromBare = parseAllowance(usage(91).usage);
    expect(fromEnvelope).toEqual(fromBare);
    expect(fromEnvelope?.window?.usedPercent).toBe(91);
    expect(fromEnvelope?.tier).toBe("pro");
  });

  test("a result with no window and no weekly is nothing to warn about", () => {
    expect(parseAllowance({})).toBeNull();
    expect(parseAllowance({ usage: { tier: "pro" } })).toBeNull();
    expect(parseAllowance(null)).toBeNull();
  });

  test("a missing reset stamp is tolerated", () => {
    const parsed = parseAllowance({ usage: { window: { usedPercent: 95 } } });
    expect(parsed?.window).toEqual({ usedPercent: 95, resetsAtMs: null });
  });
});

describe("threshold", () => {
  test("defaults to 90 and can be disabled", () => {
    expect(allowanceWarnPercent({})).toBe(90);
    expect(allowanceWarnPercent({ MUSE_ALLOWANCE_WARN_PERCENT: "0" })).toBe(0);
    expect(allowanceWarnPercent({ MUSE_ALLOWANCE_WARN_PERCENT: "eighty" })).toBe(90);
  });

  test("warns at or above the threshold, not below", () => {
    const parsed = parseAllowance(usage(90));
    expect(parsed).not.toBeNull();
    if (parsed === null) return;
    expect(shouldWarn(parsed, 90)).toBe(true);
    expect(shouldWarn(parsed, 91)).toBe(false);
    expect(shouldWarn(parseAllowance(usage(89)) as never, 90)).toBe(false);
    expect(shouldWarn(parsed, 0)).toBe(false);
  });

  test("the message names the number, the threshold, and the reset", () => {
    const parsed = parseAllowance(usage(93));
    const message = allowanceMessage(parsed as never, 90, NOW);
    expect(message).toContain("93% used");
    expect(message).toContain("warning threshold 90%");
    expect(message).toContain("2026-11-22T18:00:00.000Z");
  });

  test("the message says how old the reading is", () => {
    const parsed = parseAllowance(usage(93));
    expect(allowanceMessage(parsed as never, 90, NOW)).toContain("observed 1h 00m ago");
    const unobserved = parseAllowance({ usage: { window: { usedPercent: 93, resetsAtMs: RESET } } });
    expect(allowanceMessage(unobserved as never, 90, NOW)).not.toContain("observed");
  });
});

describe("checkAllowance", () => {
  test("warns once per window, and again after the window resets", async () => {
    const lines: string[] = [];
    const source = { read: async () => usage(95) };
    expect(await checkAllowance(source, {}, (line) => lines.push(line), NOW)).not.toBeNull();
    expect(await checkAllowance(source, {}, (line) => lines.push(line), NOW)).toBeNull();
    expect(lines).toHaveLength(1);

    const nextWindow = { read: async () => usage(95, RESET + 5 * 60 * 60 * 1000) };
    const nextNow = RESET + 4 * 60 * 60 * 1000;
    expect(
      await checkAllowance(nextWindow, {}, (line) => lines.push(line), nextNow),
    ).not.toBeNull();
    expect(lines).toHaveLength(2);
  });

  test("a window that has already reset stays quiet, and does not block the live one", async () => {
    const lines: string[] = [];
    const expired = { read: async () => usage(95) };
    // The observation is from a block that ended before this run: the number is
    // history, and "resets at" would name an instant already in the past.
    expect(
      await checkAllowance(expired, {}, (line) => lines.push(line), RESET + 60_000),
    ).toBeNull();
    expect(lines).toHaveLength(0);

    // The skip did not claim the warn-once key: the next live window speaks.
    const live = { read: async () => usage(95, RESET + 60 * 60 * 1000) };
    expect(
      await checkAllowance(live, {}, (line) => lines.push(line), RESET + 30 * 60 * 1000),
    ).not.toBeNull();
    expect(lines).toHaveLength(1);
  });

  test("stays quiet below the threshold and when disabled", async () => {
    const lines: string[] = [];
    expect(
      await checkAllowance({ read: async () => usage(50) }, {}, (l) => lines.push(l), NOW),
    ).toBeNull();
    expect(
      await checkAllowance(
        { read: async () => usage(99) },
        { MUSE_ALLOWANCE_WARN_PERCENT: "0" },
        (l) => lines.push(l),
        NOW,
      ),
    ).toBeNull();
    expect(lines).toHaveLength(0);
  });

  test("a failed read is silent", async () => {
    const lines: string[] = [];
    const message = await checkAllowance(
      {
        read: async () => {
          throw new Error("host said no");
        },
      },
      {},
      (l) => lines.push(l),
      NOW,
    );
    expect(message).toBeNull();
    expect(lines).toHaveLength(0);
  });
});
