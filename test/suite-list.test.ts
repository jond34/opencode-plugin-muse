import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LIVE_ONLY, missingFromSuite, suitePaths, unlistedTests } from "../scripts/suite-list.js";

/**
 * E28: the explicit test list is the only place the suite's coverage is written
 * down, and `bun test` exits 0 when a listed path matches nothing. These cases
 * make the list and the tree agree, on a working checkout and on a runner.
 */

const ROOT = join(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

describe("the test:offline list", () => {
  test("every listed file exists", () => {
    expect(pkg.scripts.test).toMatch(/--path-ignore-patterns=(['"])scratch\/\*\*\1/);
    expect(pkg.scripts["test:offline"]).toMatch(/--path-ignore-patterns=(['"])scratch\/\*\*\1/);
    expect(missingFromSuite(pkg)).toEqual([]);
    // A list that shrank to nothing would also be "consistent".
    expect(suitePaths(pkg).length).toBeGreaterThan(30);
  });

  test("every tracked test is listed, except the live suites", () => {
    const tracked = execFileSync("git", ["ls-files", "test/*.test.ts"], { cwd: ROOT, encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(unlistedTests(tracked, suitePaths(pkg))).toEqual([]);
    // An excuse cannot outlive its file: a renamed or deleted live suite leaves
    // a stale entry here.
    expect(LIVE_ONLY.filter((entry) => !tracked.includes(entry))).toEqual([]);
  });

  test("a tracked test outside the list is reported, a live one is not", () => {
    expect(
      unlistedTests(
        ["test/a.test.ts", "test/b.test.ts", "test/c-live.test.ts"],
        ["test/a.test.ts"],
        ["test/c-live.test.ts"],
      ),
    ).toEqual(["test/b.test.ts"]);
  });

  test("a missing entry with no excuse is reported", () => {
    const synthetic = {
      scripts: { "test:offline": "bun test test/version.test.ts test/gone.test.ts" },
    };
    expect(missingFromSuite(synthetic, (path) => path.endsWith("version.test.ts"), [])).toEqual([
      "test/gone.test.ts",
    ]);
  });

  test("the same entry is excused only when it is named", () => {
    const synthetic = {
      scripts: { "test:offline": "bun test test/version.test.ts test/gone.test.ts" },
    };
    expect(
      missingFromSuite(synthetic, (path) => path.endsWith("version.test.ts"), [
        "test/gone.test.ts",
      ]),
    ).toEqual([]);
  });
});
