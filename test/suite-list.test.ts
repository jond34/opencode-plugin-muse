import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LOCAL_ONLY, missingFromSuite, suitePaths } from "../scripts/suite-list.js";

/**
 * E28: the explicit test list is the only place the suite's coverage is written
 * down, and `bun test` exits 0 when a listed path matches nothing. These cases
 * make the list and the tree agree, on a working checkout and on a runner.
 */

const ROOT = join(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

describe("the test:offline list", () => {
  test("every listed file exists, except the declared local-only three", () => {
    expect(pkg.scripts.test).toMatch(/--path-ignore-patterns=(['"])scratch\/\*\*\1/);
    expect(pkg.scripts["test:offline"]).toMatch(/--path-ignore-patterns=(['"])scratch\/\*\*\1/);
    expect(missingFromSuite(pkg)).toEqual([]);
    // A list that shrank to nothing would also be "consistent".
    expect(suitePaths(pkg).length).toBeGreaterThan(30);
  });

  test("each excused file is gitignored and untracked", () => {
    // This is what keeps the excuse honest: the three are excused because git
    // ignores them (`.gitignore:25-27`), not because a list says so. Excusing a
    // published test, or one git does not ignore, fails here.
    const tracked = new Set(
      execFileSync("git", ["ls-files", "test"], { cwd: ROOT, encoding: "utf8" })
        .trim()
        .split("\n")
        .filter(Boolean),
    );
    const ignored = new Set(
      execFileSync("git", ["check-ignore", ...LOCAL_ONLY], { cwd: ROOT, encoding: "utf8" })
        .trim()
        .split("\n")
        .filter(Boolean),
    );
    expect(LOCAL_ONLY.filter((entry) => tracked.has(entry))).toEqual([]);
    expect(LOCAL_ONLY.filter((entry) => !ignored.has(entry))).toEqual([]);
    // The list should only shrink: a fourth entry means a fourth published test
    // quietly left the suite's coverage.
    expect(LOCAL_ONLY).toHaveLength(3);
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
