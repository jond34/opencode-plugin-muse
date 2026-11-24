/**
 * Render `docs/claims.md` from the canonical `docs/claims.json` ledger.
 *
 * Usage: `bun scripts/render-claims.ts [--check]`
 * `--check` exits 1 when the committed table differs from the ledger.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Claim {
  id: string;
  claim: string;
  url: string;
  label: string;
  quote_md: string;
  as_of: string;
  version: string;
  check: { kind: string };
}

const ROOT = join(import.meta.dir, "..");
const JSON_PATH = join(ROOT, "docs/claims.json");
const MD_PATH = join(ROOT, "docs/claims.md");

const HEADER = `# External claims the ledger rests on

One row per outside statement a decision depends on. The ledger cites the
decision; this file says where the sentence came from, when it was read, and what
would make it stale. \`scripts/check-claims.ts\` reads the JSON mirror and, with
\`--strict\`, fails when a state changed. Warn-only by default (O5).
`;

const ledger = JSON.parse(readFileSync(JSON_PATH, "utf8")) as {
  as_of: string;
  claims: Claim[];
};

const table = [
  "| ID | Claim | Source | Quote | As of | Version | Check |",
  "|---|---|---|---|---|---|---|",
  ...ledger.claims.map(
    (claim) =>
      `| ${claim.id} | ${claim.claim_md} | [${claim.label}](${claim.url}) | ${claim.quote_md} | ${claim.as_of} | ${claim.version} | ${claim.check.kind} |`,
  ),
].join("\n");

const rendered = `${HEADER}\n${table}\n\nThe older \`brew doctor\` and \`a4 doctor\` rows are **not reopened**: no primary\nsource was re-located in round 27, and no product sentence depends on either.\nThey stay in the ledger as historical comparisons, with their original dates.\nAdd a row when a decision starts depending on a new outside sentence, not when a\nsentence is merely quoted.\n`;

if (process.argv.includes("--check")) {
  const current = readFileSync(MD_PATH, "utf8");
  if (current !== rendered) {
    console.error("docs/claims.md is stale; run `npm run claims:render`");
    process.exit(1);
  }
  console.log("docs/claims.md matches docs/claims.json");
} else {
  writeFileSync(MD_PATH, rendered);
  console.log(`rendered ${ledger.claims.length} claims`);
}
