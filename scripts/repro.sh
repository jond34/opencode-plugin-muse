#!/usr/bin/env bash
# Rebuild dist/ from the committed lockfile and compare against the recorded hash.
set -euo pipefail
cd "$(dirname "$0")/.."

# 1.2.0 candidate: patches 1-5, the /connect and 1.2.0 fixes, the doctor
# capability removal, the queued-turn ack, and the local title framing. The
# published 0.1.9 and 1.0.0/1.0.1/1.1.0 recorded hashes stay in
# docs/provenance.md.
EXPECTED=c17dfc2b5c7a6450d8172d9efa4ab3299461603edb0822360c912da4625f6698

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
