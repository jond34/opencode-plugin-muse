#!/usr/bin/env bash
# Rebuild dist/ from the committed lockfile and compare against the recorded hash.
set -euo pipefail
cd "$(dirname "$0")/.."

# 0.1.13 local candidate: patches 3 through 5, not published. The published
# 0.1.9 and older recorded hashes stay in docs/provenance.md.
EXPECTED=3470ecc97c98ef8358aaf77dbea767cebd1824542762ae0fef50713f46d3a120

[[ -f package-lock.json ]] || { echo "missing package-lock.json" >&2; exit 1; }

npm ci --no-audit --no-fund
rm -rf dist
npx tsc -p tsconfig.json

ACTUAL="$(find dist -type f | sort | xargs sha256sum | sha256sum | cut -d' ' -f1)"
COUNT="$(find dist -type f | wc -l | tr -d ' ')"

echo "expected $EXPECTED"
echo "actual   $ACTUAL  ($COUNT files)"

if [[ "$ACTUAL" == "$EXPECTED" ]]; then
  echo PASS
else
  echo FAIL
  exit 1
fi
