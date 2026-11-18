#!/usr/bin/env bash
# Rebuild dist/ from the committed lockfile and compare against the recorded hash.
set -euo pipefail
cd "$(dirname "$0")/.."

EXPECTED=b90a36974cfeaf2957bec91a687546ba850adf5a0dc94d6eb95b60ebb0f040c3

[[ -f package-lock.json ]] || { echo "missing package-lock.json" >&2; exit 1; }

npm ci --no-audit --no-fund
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
