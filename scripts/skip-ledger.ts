/**
 * Every skipped test must be declared with a reason and the row it leaves
 * unmeasured.
 *
 * The suite-list guard checks that a listed file runs at all; it cannot see a
 * file that runs and skips half its cases. On Windows that was five tests, and
 * only three of them were behaviour. This table makes the difference visible:
 * a new `.skip`/`skipIf`/`posixOnly` without an entry fails offline, and an
 * entry whose skip disappeared also fails, so the table cannot outlive the code.
 *
 * The scanner is deliberately shallow — source text, not an AST — because the
 * patterns are few and the failure is a missing entry, not a false negative in a
 * generated call. It skips its own file, whose patterns would otherwise match
 * themselves.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface PlatformSkip {
  file: string;
  name: string;
  platform: "win32" | "all";
  reason: string;
  /** The decision row this skip leaves unmeasured. */
  decisionRow: string;
}

export const PLATFORM_SKIPS: readonly PlatformSkip[] = [
  {
    file: "test/host-config.test.ts",
    name: "keeps the directory and file private",
    platform: "win32",
    reason: "POSIX mode 0700 is not modelled by Windows ACLs; chmod changes only the write bit",
    decisionRow: "U23",
  },
  {
    file: "test/host-process.test.ts",
    name: "a transport EOF leaves the process alive until something closes it",
    platform: "win32",
    reason: "E34 run 45302325853: the pid dies, but the SDK's close promise does not settle after EOF; E16c measures close of a live host",
    decisionRow: "U22",
  },
  {
    file: "test/platform.test.ts",
    name: "POSIX reports the mode the plugin writes",
    platform: "win32",
    reason: "POSIX mode reporting is not a Windows behaviour; the win32 row is tested separately",
    decisionRow: "U23",
  },
];

export interface SkipHit {
  file: string;
  name: string;
}

const PATTERNS: readonly RegExp[] = [
  /test\.skipIf\s*\([^)]*\)\s*\(\s*"([^"]+)"/g,
  /test\.skip\s*\(\s*"([^"]+)"/g,
  /(?:describe|it)\.skip\s*\(\s*"([^"]+)"/g,
  /posixOnly\s*\(\s*"([^"]+)"/g,
];

/** Find skipped test names in one source file. */
export function scanSource(source: string): string[] {
  const names: string[] = [];
  for (const pattern of PATTERNS) {
    for (const match of source.matchAll(pattern)) names.push(match[1]!);
  }
  return names;
}

/** Walk the test tree and return every skip with its file. */
export function scanTree(root: string, dir = join(root, "test")): SkipHit[] {
  const hits: SkipHit[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      hits.push(...scanTree(root, path));
      continue;
    }
    if (!entry.endsWith(".ts") || entry === "skip-ledger.test.ts") continue;
    const file = relative(root, path).replaceAll("\\", "/");
    for (const name of scanSource(readFileSync(path, "utf8"))) hits.push({ file, name });
  }
  return hits.sort((a, b) => `${a.file}:${a.name}`.localeCompare(`${b.file}:${b.name}`));
}

/**
 * Problems with the ledger: an undeclared hit, a declared entry with no hit, or
 * a missing reason/row. Empty means the table and the tree agree.
 */
export function ledgerProblems(
  hits: readonly SkipHit[],
  ledger: readonly PlatformSkip[] = PLATFORM_SKIPS,
): string[] {
  const problems: string[] = [];
  const key = (hit: { file: string; name: string }) => `${hit.file}\u0000${hit.name}`;
  const declared = new Map(ledger.map((entry) => [key(entry), entry]));
  for (const hit of hits) {
    const entry = declared.get(key(hit));
    if (entry === undefined) {
      problems.push(`undeclared skip: ${hit.file} > "${hit.name}" (add reason and decisionRow)`);
      continue;
    }
    if (entry.reason.trim() === "") problems.push(`missing reason: ${hit.file} > "${hit.name}"`);
    if (entry.decisionRow.trim() === "") problems.push(`missing decisionRow: ${hit.file} > "${hit.name}"`);
  }
  const hitKeys = new Set(hits.map(key));
  for (const entry of ledger) {
    if (!hitKeys.has(key(entry))) {
      problems.push(`stale ledger entry: ${entry.file} > "${entry.name}" (skip is gone; remove it)`);
    }
  }
  return problems;
}
