/**
 * Check the external claims in `docs/claims.json`.
 *
 * Warn-only by default: a vendor rename should be visible, not a red build.
 * `--strict` exits 1 on a changed state or a dead URL. GitHub rows use `gh`,
 * which carries its own auth; HTTP rows use a 10 s GET, enough for a status and
 * not a scrape. The quote is checked by a human — this only answers "is it still
 * there, and is the issue still in the state the ledger says".
 *
 * Usage: `bun scripts/check-claims.ts [--strict] [--only id]`
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface Claim {
  id: string;
  claim: string;
  url: string;
  quote: string;
  version: string;
  check:
    | { kind: "http" }
    | { kind: "github-issue"; repo: string; number: number; state: string }
    | { kind: "github-pr"; repo: string; number: number; state: string; draft?: boolean };
}

interface Result {
  id: string;
  ok: boolean;
  detail: string;
}

const ROOT = join(import.meta.dir, "..");
const claims = (
  JSON.parse(readFileSync(join(ROOT, "docs/claims.json"), "utf8")) as { claims: Claim[] }
).claims;

async function checkHttp(claim: Claim): Promise<Result> {
  try {
    const response = await fetch(claim.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { "user-agent": "opencode-plugin-muse claims check" },
    });
    return {
      id: claim.id,
      ok: response.status >= 200 && response.status < 400,
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    return { id: claim.id, ok: false, detail: `fetch failed: ${String(error)}` };
  }
}

function checkGithub(claim: Claim): Result {
  const check = claim.check;
  if (check.kind !== "github-issue" && check.kind !== "github-pr") {
    return { id: claim.id, ok: false, detail: "not a GitHub row" };
  }
  const endpoint =
    check.kind === "github-issue"
      ? `repos/${check.repo}/issues/${check.number}`
      : `repos/${check.repo}/pulls/${check.number}`;
  const jq = check.kind === "github-pr" ? ".state + \" \" + (.draft|tostring)" : ".state";
  const result = spawnSync("gh", ["api", endpoint, "--jq", jq], { encoding: "utf8" });
  if (result.error !== undefined) {
    return { id: claim.id, ok: false, detail: `gh unavailable: ${String(result.error)}` };
  }
  if (result.status !== 0) {
    return { id: claim.id, ok: false, detail: `gh exited ${result.status}: ${result.stderr.trim()}` };
  }
  const value = result.stdout.trim();
  if (check.kind === "github-pr") {
    const [state, draft] = value.split(/\s+/);
    const ok = state === check.state && (check.draft === undefined || draft === String(check.draft));
    return { id: claim.id, ok, detail: `${state} draft=${draft}` };
  }
  return { id: claim.id, ok: value === check.state, detail: value };
}

const args = new Set(process.argv.slice(2));
const only = process.argv.indexOf("--only");
const onlyId = only === -1 ? undefined : process.argv[only + 1];
const strict = args.has("--strict");

const results: Result[] = [];
for (const claim of claims) {
  if (onlyId !== undefined && claim.id !== onlyId) continue;
  results.push(claim.check.kind === "http" ? await checkHttp(claim) : checkGithub(claim));
  console.log(`${results.at(-1)!.ok ? "ok  " : "WARN"} ${claim.id}: ${results.at(-1)!.detail}`);
}

const bad = results.filter((result) => !result.ok);
console.log(`\n${results.length - bad.length}/${results.length} claims current as of ${new Date().toISOString().slice(0, 10)}`);
if (strict && bad.length > 0) process.exit(1);
