/**
 * The `test:offline` list, checked rather than trusted.
 *
 * `bun test` treats a path it cannot find as a *name filter*: it runs whatever
 * does match, prints a note, and exits 0. Reproduced on bun 1.4.4 —
 * `bun test ./test/version.test.ts ./test/does-not-exist.test.ts` ran 3 tests and
 * exited 0 — and open upstream as `oven-sh/bun#44002`. The `./` prefix does not
 * help once another path matches. So a renamed or deleted test file leaves CI
 * green with fewer tests, which is the one finding in the round-25 audit (F6) that
 * can make a later decision wrong without any wrong sentence.
 *
 * There is no runner flag for "error on an unmatched path", and a glob migration
 * would change every invocation and the published file count. A test that reads
 * the list is the smallest instrument that fails loudly.
 */
import { existsSync } from "node:fs";

/**
 * Entries in `test:offline` that are deliberately absent from a runner checkout:
 * three gitignored local harness files. They are excused by
 * name, not by absence, so any other missing entry is still reported — and the
 * accompanying test requires each one to be both untracked and ignored, so a
 * published test cannot be excused and the list cannot widen silently.
 */
export const LOCAL_ONLY: readonly string[] = [
  "test/bench.test.ts",
  "test/bench-stats.test.ts",
  "test/native-history-harness.test.ts",
];

export interface PackageScripts {
  scripts?: Record<string, string>;
}

/** Every path `test:offline` names, in the order the script names them. */
export function suitePaths(pkg: PackageScripts): string[] {
  const command = pkg.scripts?.["test:offline"];
  if (command === undefined) throw new Error("package.json has no test:offline script");
  return command.split(/\s+/).filter((entry) => entry.startsWith("test/"));
}

/**
 * Listed paths that `exists` rejects, minus the entries excused by `localOnly`.
 * An empty array means the list and the tree agree on both frames: a working
 * checkout, where the gitignored files are present, and a runner checkout, where
 * they are not.
 */
export function missingFromSuite(
  pkg: PackageScripts,
  exists: (path: string) => boolean = existsSync,
  localOnly: readonly string[] = LOCAL_ONLY,
): string[] {
  return suitePaths(pkg).filter((entry) => !exists(entry) && !localOnly.includes(entry));
}
