/**
 * Check public Markdown links and the generated claims table.
 *
 * - every relative link in a tracked Markdown file must resolve;
 * - packaged root Markdown must not use a relative link into a path the npm
 *   tarball does not carry (`docs/`, `evidence/`, `media/`, `src/`, `test/`,
 *   `bench/`);
 * - `docs/claims.md` must match `docs/claims.json`.
 *
 * Usage: `bun scripts/check-docs.ts`
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PACKAGED = new Set(["README.md", "CHANGELOG.md", "CREDITS.md"]);
const PACKAGED_MISSING = /^(docs|evidence|media|src|test|bench)\//;

const files = execFileSync("git", ["ls-files", "*.md"], { cwd: ROOT, encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

const problems: string[] = [];
let links = 0;

for (const file of files) {
  const text = readFileSync(join(ROOT, file), "utf8");
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const raw = match[1].replace(/^<|>$/g, "");
    if (/^(https?:|mailto:|#)/.test(raw)) continue;
    links += 1;
    const target = raw.split("#")[0].split("?")[0];
    if (!target) continue;
    const resolved = normalize(join(dirname(file), target));
    if (!existsSync(join(ROOT, resolved))) {
      problems.push(`${file}: missing relative link ${target}`);
      continue;
    }
    if (PACKAGED.has(file) && PACKAGED_MISSING.test(target)) {
      problems.push(`${file}: packaged relative link escapes the tarball: ${target}`);
    }
  }
}

const claims = execFileSync("bun", ["scripts/render-claims.ts", "--check"], {
  cwd: ROOT,
  encoding: "utf8",
  stdio: "pipe",
});
void claims;

console.log(`checked ${files.length} Markdown files and ${links} relative links`);
if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log("public docs links and claims are current");
