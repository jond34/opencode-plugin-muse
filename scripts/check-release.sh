#!/usr/bin/env bash
# Release gate: build, strict claims, pack inspection, clean install/import, audit.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p scratch

TMP="$(mktemp -d "${TMPDIR:-/tmp}/opencode-plugin-muse-release.XXXXXX")"
cleanup() {
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "== build =="
npm run build

echo "== strict claims =="
bun scripts/check-claims.ts --strict

echo "== packed file list =="
npm pack --dry-run --json > scratch/r31-pack.json
node --input-type=module - scratch/r31-pack.json <<'NODE'
import { readFileSync } from "node:fs";

const file = process.argv[2];
const report = JSON.parse(readFileSync(file, "utf8"));
const entry = Array.isArray(report) ? report[0] : report;
const paths = (entry?.files ?? []).map((item) => item.path);
const required = ["dist/index.js", "package.json", "README.md", "LICENSE"];
const forbidden = [
  ["src/", (path) => path.startsWith("src/")],
  ["test/", (path) => path.startsWith("test/")],
  ["scratch/", (path) => path.startsWith("scratch/")],
  ["docs/", (path) => path.startsWith("docs/")],
  [".env", (path) => path === ".env" || path.startsWith(".env.")],
];
const errors = [];
for (const path of required) {
  if (!paths.includes(path)) errors.push(`missing required file: ${path}`);
}
for (const [label, matches] of forbidden) {
  const hit = paths.find(matches);
  if (hit !== undefined) errors.push(`forbidden file (${label}): ${hit}`);
}
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`pack: ${paths.length} files; required present; no forbidden paths`);
NODE

echo "== clean packed install =="
TARBALL_NAME="$(npm pack --pack-destination "$TMP" --silent | tail -n 1)"
TARBALL="$TMP/$TARBALL_NAME"
APP="$TMP/app"
mkdir -p "$APP"
cd "$APP"
npm init -y >/dev/null
npm install --no-audit --no-fund "$TARBALL" >/dev/null

echo "== dependency audit =="
npm audit --omit=dev --json > "$ROOT/scratch/r31-audit.json" || true
cd "$ROOT"
node --input-type=module - scratch/r31-audit.json <<'NODE'
import { readFileSync } from "node:fs";

const file = process.argv[2];
const report = JSON.parse(readFileSync(file, "utf8"));
const counts = report?.metadata?.vulnerabilities;
if (counts === undefined) {
  console.error("audit: no metadata.vulnerabilities in npm audit output");
  process.exit(1);
}
const high = Number(counts.high ?? 0);
const critical = Number(counts.critical ?? 0);
const moderate = Number(counts.moderate ?? 0);
if (high > 0 || critical > 0) {
  console.error(`audit: ${high} high, ${critical} critical; release blocked`);
  process.exit(1);
}
console.log(`audit: ${moderate} moderate, ${high} high, ${critical} critical`);
NODE

echo "== installed package import =="
cd "$APP"
node --input-type=module -e '
const name = "@jonathand34/opencode-plugin-muse";
const imported = await import(name);
if (typeof imported.default !== "object" && typeof imported.default !== "function") {
  console.error(`${name}: missing default export`);
  process.exit(1);
}
console.log(`${name}: default export loaded (${typeof imported.default})`);
'

echo "== diff check =="
cd "$ROOT"
git diff --check

echo "PASS release gate"
