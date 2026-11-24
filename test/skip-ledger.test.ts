import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { ledgerProblems, scanSource, scanTree } from "../scripts/skip-ledger.js";

/**
 * B2: a skipped test is coverage that looks green. The live scan is the guard;
 * the synthetic cases prove the guard fails for the two ways a ledger goes bad
 * (an undeclared skip, and an entry whose skip was removed).
 */

const ROOT = join(import.meta.dir, "..");

describe("skip ledger", () => {
  test("the tree declares every skip it has, and every entry is live", () => {
    expect(ledgerProblems(scanTree(ROOT))).toEqual([]);
  });

  test("finds skipIf, skip, and the posixOnly alias", () => {
    const source = `
      test.skipIf(process.platform === "win32")("a mode test", () => {});
      test.skip("a skip", () => {});
      const posixOnly = process.platform === "win32" ? test.skip : test;
      posixOnly(
        "an alias skip",
        () => {},
      );
    `;
    expect(scanSource(source).sort()).toEqual(["a mode test", "a skip", "an alias skip"]);
  });

  test("an undeclared skip is named with the fields it needs", () => {
    const problems = ledgerProblems([{ file: "test/new.test.ts", name: "a new skip" }], []);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("undeclared skip");
    expect(problems[0]).toContain("reason and decisionRow");
  });

  test("a declared entry whose skip disappeared is stale", () => {
    const entry = {
      file: "test/gone.test.ts",
      name: "gone",
      platform: "win32" as const,
      reason: "measured elsewhere",
      decisionRow: "U23",
    };
    expect(ledgerProblems([], [entry])[0]).toContain("stale ledger entry");
  });

  test("an entry without a reason or decision row is rejected", () => {
    const entry = {
      file: "test/one.test.ts",
      name: "one",
      platform: "win32" as const,
      reason: " ",
      decisionRow: "",
    };
    const problems = ledgerProblems([{ file: "test/one.test.ts", name: "one" }], [entry]);
    expect(problems.some((problem) => problem.includes("missing reason"))).toBe(true);
    expect(problems.some((problem) => problem.includes("missing decisionRow"))).toBe(true);
  });
});
