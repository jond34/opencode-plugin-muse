#!/usr/bin/env bash
# Rebuild dist/ from the committed lockfile and compare against the recorded hash.
set -euo pipefail
cd "$(dirname "$0")/.."

# This tree carries patches 3 through 5; the published 0.1.9 hash is recorded
# in docs/provenance.md for the tree before them.
EXPECTED=d2d50a429436ec085bc1fa107073e0489e2864bad088edd4fe06b2ed608b5867

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
