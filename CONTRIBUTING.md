# Contributing

Thanks for looking. This is a small, best-effort project maintained by one
person; issues and focused pull requests are welcome, and the owner decides what
lands.

## Setup

Requirements: Node 22 or newer, npm, and Bun 1.4.4 or newer.

```bash
npm ci
npm run build
npm run check:offline
bash scripts/repro.sh
```

`check:offline` typechecks and runs the offline suite. It needs no credentials.
`repro.sh` installs from `package-lock.json`, rebuilds `dist/`, and compares it
with the hash in `docs/provenance.md`; it prints `PASS` or exits non-zero.

The live suites under `test/*-live.test.ts`, `test/tool-bridge.test.ts`, and
`test/conformance.test.ts` spawn a real `muse serve` host and need a logged-in
Muse Code CLI. Do not run them in CI without that login; they are deliberately
outside `check:offline`.

## What to change

- Keep `src/` close to the base tree. New behavior belongs in its own commit, so
  `git show` stays the whole delta; `docs/provenance.md` records the patches.
- Only `src/plugin.ts` may import `@opencode/plugin`, and only `src/host.ts` may
  import `@muse-code/sdk`.
- Add a test for behavior you change. Do not delete, skip, or weaken a test to
  make a gate pass.
- Keep public claims in one place: install and feature summary in `README.md`,
  build identity in `docs/provenance.md`, release gates in `docs/release.md`,
  approval limits in `docs/approval.md`, versions and the public API in
  `docs/compatibility.md`, platform claims in `docs/platform-support.md`, and
  external statements in `docs/claims.json` (rendered to `docs/claims.md`).

Run `npm run check:docs` after editing Markdown. It checks relative links, keeps
packaged root files from linking into paths the npm tarball omits, and verifies
the generated claims table. Regenerate that table with `npm run claims:render`;
do not edit `docs/claims.md` by hand.

## Public and local

Tracked files are public. `scratch/` is ignored and may hold local records;
`scratch/archive/MANIFEST.md` lists what was removed and why. Never link to,
publish, or treat anything under `scratch/` as current public guidance. `bench/`
is a local experiment harness, not part of the public test set.

Never commit `scratch/`, `dist/`, `dist-pkg/`, `node_modules/`, secrets, logs, or
process documents. Do not commit generated evidence unless a public claim cites
it.

## Release

Releases are owner-only. Do not publish, stage, tag, push, or approve a stage
from a pull request. The gate list and rollback are in `docs/release.md`.
