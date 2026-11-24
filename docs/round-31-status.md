# Round 31 status

**Run date** 2026-11-23. Base `c4053e2`; branch `round-31`. This is the live
table; the plan and research files are not rewritten when a result differs.

| ID | Work | Status | Evidence / output |
|---|---|---|---|
| A1 | E55 baseline addendum | done | `docs/evidence/2026-11-26-r31-e55-baseline-addendum.json`; 3 sources, 6 provider policies; retained and fresh SHA-256 match |
| A2 | Approval-scope correction | done | `docs/approval.md`; `decision-coverage.md`; Muse `localPersistent` separated from opencode project-scoped approvals |
| A3 | Console documentation | done | `docs/policy-remote.md`; old build marked superseded; current E36/E37 finding retained |
| A4 | Platform qualification | done | `decision-coverage.md`; POSIX `0600`, Windows ACLs; POSIX reaping, Windows EOF skipped |
| A5 | Executable release gate | done | `scripts/check-release.sh`; strict claims 20/20, pack 165 files, audit 25/0/0, installed import pass |
| A6 | Provenance wording | done | `docs/release.md`, `docs/provenance.md`; independent rebuild pending |
| E61 | Approval scope matrix | not run | stopped after E62 B2 |
| E62 | Fresh project hook + update | **security finding** | `docs/evidence/2026-11-26-r31-e62.json`; changed hook ran after `muse plugins update` without re-approval (B2) |
| E55a | Console effect/timing | blocked | `docs/evidence/2026-11-26-r31-e55a.json`; no owner-authenticated browser |
| E55b | Console tool-deny attribution | blocked | `docs/evidence/2026-11-26-r31-e55b.json`; no owner-authenticated browser |
| E63 | Runtime dependency trace | done | `docs/evidence/2026-11-26-r31-e63.json`; no path to `@opencode/util`, glob/minimatch, gaxios, gcp-metadata, or rimraf |
| E64 | Second clean builder | not run | release stopped at E62 B2 |
| E60 | Stage and reject | not run | release stopped at E62 B2 |
| F | Reconcile, check, commit | done | `f1fd11f` on `round-31`; owner file left unstaged |

## A5 packaging note

The first gate run exposed a conflict between the plan’s pack assertions and the
then-current `files` list: the package intentionally shipped `src/` and three
`docs/` files, and `exports` pointed at `src/index.ts`. Node could not import
that entry because `src/index.ts` imports `./plugin.js`, which does not exist.

The candidate now publishes the built `dist/` entry only. `main`, `module`,
`exports`, and `types` point at `dist`; `files` is `dist`, README, LICENSE,
CREDITS, and CHANGELOG. This is a packaging correction required by the gate, not
a new runtime feature. `dist/` bytes are unchanged by the package-entry change.
The pack is now 165 files instead of 208; the tarball hash will change.

## Stop condition reached: E62 B2

E62 is a security finding, not a wording result. A fresh project-scoped install
reported `review_needed` and did not run its hook until `muse plugins approve`.
After changing only the hook command and running `muse plugins update`, inspect
reported `modified` and `modified_definition_hash`; the next `muse exec` still
ran the new hook and rewrote the stored trusted hash with
`legacy_hook_trust_amnesty_applied: true`.

Consequences:

- The release is stopped. E61, E64, and E60 were not run after this result.
- E55a/E55b remain blocked on an owner-authenticated Console browser.
- No stage, approve, publish, tag, or push was performed.
- `docs/approval.md` and the P5 rows now record the update caveat; P5 moves from
  H to P and the ledger counts move to `H 40 · D 34 · P 4 · X 4 · U 0 · N 3`.

## Verification

| Check | Result |
|---|---|
| `bash scripts/check-release.sh` | PASS; strict claims 20/20, pack 165 files, audit 25 moderate / 0 high / 0 critical, installed import pass |
| `npm test` first run | 458 pass / 1 fail / 47 files; the failure was `test/conformance.test.ts` (Muse queued input) |
| `bun test test/conformance.test.ts` rerun | 1 pass / 0 fail |
| `npm test` final | 459 pass / 0 fail / 47 files; 1162 expect calls; 84.33 s |
| `bun scripts/check-claims.ts --strict` | 20/20 current |
| `bash scripts/repro.sh` | PASS; `15a64cdd…` (160 files) |
| `npm pack --dry-run` | pass; 165 files; shasum `9307d690…` |
| Tarball SHA-256 | `b1b8fde031aa6797e2d174433d8736edbadc8eb252423f69d2870ec37052b0c1` (204,860 bytes) |
| `git diff --check` | pass |
| E63 trace | 371 unique files; no target package in the file list |
