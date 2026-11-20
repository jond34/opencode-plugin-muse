import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendLedgerRow,
  appendUsage,
  ledgerPath,
  summarizeUsage,
  type UsageEntry,
} from "../src/usage-ledger.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempEnv(): NodeJS.ProcessEnv {
  const dir = mkdtempSync(join(tmpdir(), "muse-ledger-"));
  dirs.push(dir);
  return { XDG_STATE_HOME: dir };
}

const entry = (overrides: Partial<UsageEntry> = {}): UsageEntry => ({
  ts: "2026-11-19T12:00:00.000Z",
  sessionID: "oc-session",
  step: 1,
  kind: "primary",
  model: "muse-ember-1.0",
  input: 100,
  cached: 40,
  cacheWrite: 10,
  output: 5,
  toolCalls: 1,
  wallMs: 1_234,
  seed: "delta",
  ...overrides,
});

describe("usage ledger", () => {
  test("sums turns and reports the reseed rate and percentiles", async () => {
    const env = tempEnv();
    await appendUsage(entry(), env);
    await appendUsage(entry({ step: 2, input: 200, cached: 20, output: 10, seed: "full" }), env);

    const summary = await summarizeUsage(ledgerPath(new Date("2026-11-19T12:00:00.000Z"), env));
    expect(summary).toMatchObject({
      turns: 2,
      input: 300,
      cached: 60,
      cacheWrite: 20,
      output: 15,
      toolCalls: 2,
      reseeds: 1,
      reseedRate: 0.5,
      p50Input: 100,
      p90Input: 200,
      historyRows: 0,
    });
  });

  test("input is the total, matching toAIUsage, not a fresh-only count", async () => {
    const env = tempEnv();
    await appendUsage(entry({ input: 100, cached: 40, cacheWrite: 10 }), env);
    const summary = await summarizeUsage(ledgerPath(new Date("2026-11-19T12:00:00.000Z"), env));
    expect(summary.input).toBe(100);
    expect(summary.cached).toBe(40);
    expect(summary.cacheWrite).toBe(10);
  });

  test("skips malformed lines instead of failing", async () => {
    const env = tempEnv();
    await appendUsage(entry(), env);
    appendFileSync(ledgerPath(new Date("2026-11-19T12:00:00.000Z"), env), "not json\n{}\n", { mode: 0o600 });
    const summary = await summarizeUsage(ledgerPath(new Date("2026-11-19T12:00:00.000Z"), env));
    expect(summary.turns).toBe(1);
    expect(summary.input).toBe(100);
  });

  test("sums priced cost and counts provisional turns", async () => {
    const env = tempEnv();
    await appendUsage(entry({ costUsd: 0.02 }), env);
    await appendUsage(entry({ step: 2, costUsd: 0.03, costPartial: true }), env);
    const summary = await summarizeUsage(ledgerPath(new Date("2026-11-19T12:00:00.000Z"), env));
    expect(summary).toMatchObject({ costUsd: 0.05, pricedTurns: 2, partialCost: 1 });
  });

  test("a missing file summarizes as empty", async () => {
    const env = tempEnv();
    const summary = await summarizeUsage(ledgerPath(new Date("2026-11-19T12:00:00.000Z"), env));
    expect(summary).toMatchObject({ turns: 0, reseedRate: 0, p50Input: 0, p90Input: 0 });
  });

  test("history rows explain reseeds without inflating turn totals", async () => {
    const env = tempEnv();
    await appendUsage(entry({ seed: "full", seedReason: "muse_compaction" }), env);
    await appendLedgerRow(
      {
        type: "history",
        ts: "2026-11-19T12:00:01.000Z",
        sessionID: "oc-session",
        event: "compaction",
        reason: "muse_compaction",
        tokensBefore: 90_000,
        tokensAfter: 12_000,
      },
      env,
    );
    const summary = await summarizeUsage(ledgerPath(new Date("2026-11-19T12:00:00.000Z"), env));
    expect(summary.turns).toBe(1);
    expect(summary.input).toBe(100);
    expect(summary.reseeds).toBe(1);
    expect(summary.historyRows).toBe(1);
    expect(summary.compactions).toBe(1);
    expect(summary.reseedReasons).toEqual({ muse_compaction: 1 });
    expect(summary.seedReasons).toBe(1);
  });

  test("legacy turn rows without a type still summarize", async () => {
    const env = tempEnv();
    await appendUsage(entry(), env);
    const summary = await summarizeUsage(ledgerPath(new Date("2026-11-19T12:00:00.000Z"), env));
    expect(summary.turns).toBe(1);
    expect(summary.historyRows).toBe(0);
    expect(summary.seedReasons).toBe(0);
  });

  test("a write failure is swallowed", async () => {
    const env = { XDG_STATE_HOME: "/dev/null/not-a-directory" };
    await expect(appendUsage(entry(), env)).resolves.toBeUndefined();
  });
});
