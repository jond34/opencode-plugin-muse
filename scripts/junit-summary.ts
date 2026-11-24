/**
 * Read bun's JUnit XML and emit one JSON object.
 *
 * The counts in the docs are only as good as the artifact they came from, and
 * the artifact is flat enough that a small scan is honest: bun writes one
 * `<testsuites>` root with `tests`, `assertions`, `failures` and `skipped`, and
 * one `<testsuite file="...">` per file (with nested suites carrying the same
 * file attribute). No dependency, and no attempt to parse XML in general.
 *
 * Usage: `bun scripts/junit-summary.ts scratch/junit-final`
 * A directory with per-OS subdirectories is a published frame; a directory
 * holding `junit.xml` directly is the local frame.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

export interface SuiteCounts {
  file: string;
  tests: number;
  assertions: number;
  failures: number;
  skipped: number;
}

export interface FrameCounts {
  tests: number;
  assertions: number;
  failures: number;
  skipped: number;
  suites: SuiteCounts[];
}

export interface Snapshot {
  generatedAt: string;
  commit: string | null;
  run: number | null;
  arch: string;
  frames: {
    published?: Record<string, FrameCounts>;
    local?: FrameCounts;
  };
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of tag.matchAll(/([A-Za-z_:][-A-Za-z0-9_:.]*)="([^"]*)"/g)) {
    out[match[1]!] = match[2]!;
  }
  return out;
}

function number(value: string | undefined): number {
  return value === undefined ? 0 : Number.parseInt(value, 10) || 0;
}

/** Count one JUnit file. Exported so the test can use inline fixtures. */
export function summarizeJunit(xml: string): FrameCounts {
  const rootTag = xml.match(/<testsuites\b([^>]*)>/)?.[1];
  const root = rootTag === undefined ? {} : attrs(rootTag);
  const suites: SuiteCounts[] = [];
  const seen = new Set<string>();
  for (const match of xml.matchAll(/<testsuite\b([^>]*)>/g)) {
    const attributes = attrs(match[1]!);
    const file = attributes.file?.replaceAll("\\", "/");
    // Nested suites repeat the file; count each file once, at the outer tag.
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    suites.push({
      file,
      tests: number(attributes.tests),
      assertions: number(attributes.assertions),
      failures: number(attributes.failures),
      skipped: number(attributes.skipped),
    });
  }
  suites.sort((a, b) => a.file.localeCompare(b.file));
  return {
    tests: number(root.tests),
    assertions: number(root.assertions),
    failures: number(root.failures),
    skipped: number(root.skipped),
    suites,
  };
}

function metadata(xml: string): { commit: string | null; run: number | null } {
  const properties = xml.match(/<properties>([\s\S]*?)<\/properties>/)?.[1] ?? "";
  const commit = properties.match(/name="commit"\s+value="([^"]+)"/)?.[1] ?? null;
  const ci = properties.match(/name="ci"\s+value="([^"]+)"/)?.[1] ?? "";
  const run = ci.match(/\/runs\/(\d+)/)?.[1];
  return { commit, run: run === undefined ? null : Number.parseInt(run, 10) };
}

function xmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...xmlFiles(path));
    else if (entry.endsWith(".xml")) out.push(path);
  }
  return out.sort();
}

/** Read a directory: per-OS subdirectories are published, a bare XML is local. */
export function summarizeDir(dir: string): Snapshot {
  const files = xmlFiles(dir);
  if (files.length === 0) throw new Error(`no JUnit XML under ${dir}`);
  const published: Record<string, FrameCounts> = {};
  let local: FrameCounts | undefined;
  let commit: string | null = null;
  let run: number | null = null;
  for (const file of files) {
    const xml = readFileSync(file, "utf8");
    const meta = metadata(xml);
    commit ??= meta.commit;
    run ??= meta.run;
    const parent = basename(join(file, ".."));
    const frame = summarizeJunit(xml);
    if (parent === basename(dir)) local = frame;
    else published[parent] = frame;
  }
  return {
    generatedAt: new Date().toISOString(),
    commit,
    run,
    arch: process.env.RUNNER_ARCH ?? process.arch,
    frames: local === undefined ? { published } : { local },
  };
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (dir === undefined) {
    console.error("usage: bun scripts/junit-summary.ts <dir>");
    process.exit(2);
  }
  console.log(JSON.stringify(summarizeDir(dir), null, 2));
}
