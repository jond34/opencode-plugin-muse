#!/usr/bin/env bash
# Typecheck, then run the offline test suite.
set -euo pipefail
cd "$(dirname "$0")/.."

npx tsc --noEmit -p tsconfig.json

if ! command -v bun >/dev/null 2>&1; then
  echo "bun not found; tests need bun >= 1.4.4 (see mise.toml)" >&2
  exit 1
fi

bun --version
# The live suites (tool-bridge, containment, fork-live, conformance) spawn a real
# `muse serve`
# host and need a logged-in Muse Code CLI. Run `bun test` to include them.
bun run test:offline
