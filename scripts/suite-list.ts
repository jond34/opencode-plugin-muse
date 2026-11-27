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
 *
 * The list drifted in both directions: it named the three gitignored harness
 * files, which a runner checkout does not have, and it had never named
 * `test/step-cap.test.ts`, a published test that runs offline. `unlistedTests`
 * closes the second direction: every tracked test belongs in the list unless it
 * needs a real host, and `LIVE_ONLY` is that exception written down.
 */
import { existsSync } from "node:fs";

/**
 * Entries in `test:offline` that are deliberately absent from a runner
 * checkout. Empty: the three local harness files (`bench`, `bench-stats`,
 * `native-history-harness`) are no longer listed, because a runner never has
 * them and a listed path that matches nothing is the silent shrink this module
 * exists to prevent. Run them by hand from `bench/`.
 */
export const LOCAL_ONLY: readonly string[] = [];

/**
 * Published tests that spawn a real `muse serve` host and need a logged-in CLI,
 * so they cannot run in the offline job. `CONTRIBUTING.md` names them. Four
 * follow the `-live` convention; the two harness suites predate it. The test
 * beside this module requires each entry to exist and be tracked, so an excuse
 * cannot outlive its file.
 */
export const LIVE_ONLY: readonly string[] = [
  "test/containment-live.test.ts",
  "test/fork-live.test.ts",
  "test/model-live.test.ts",
  "test/restart-live.test.ts",
  "test/conformance.test.ts",
  "test/tool-bridge.test.ts",
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

/**
 * Tracked tests the list does not name. Every published test belongs in the
 * offline suite unless it needs a real host; `liveOnly` is the set that does.
 */
export function unlistedTests(
  tracked: readonly string[],
  suite: readonly string[],
  liveOnly: readonly string[] = LIVE_ONLY,
): string[] {
  return tracked.filter(
    (entry) => entry.endsWith(".test.ts") && !liveOnly.includes(entry) && !suite.includes(entry),
  );
}
