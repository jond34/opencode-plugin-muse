# Round 34 plan: publish 0.1.13, or stop at one verified stage

**Base** `b706d21` on `round-33`. **Branch** `round-34`. **Run date** 2026-11-23.
**Artifact prefix** `2026-11-26-r34-` for sort consistency; each artifact records
the real date.

Round 33 closed the trust and packaging questions: E61 B1 (the Muse tool grant
crosses workspaces), E64 B1 (two clean builders produced the same 160-file
`dist/` and byte-identical 165-file tarballs), and a gate-green candidate at
`dist/ 3470ecc9…`, tarball `67c66300…`. E60 then stopped at the one thing that
cannot be automated: `npm stage reject` and `npm stage approve` both need the
owner's 2FA.

Round 34 is therefore a release round, not a research round. It has one
pre-publish defect to fix, one owner handoff to make, and a clear stopping point
if the owner is not present.

## The defect that must be fixed first

`CHANGELOG.md` is inside the npm tarball. It currently says:

```text
## 0.1.13 — local candidate, not published
This entry describes the candidate built from the current tree. It is not a
published release.
```

Publishing 0.1.13 as-is would ship a package whose own changelog says it was not
published. Tarballs are immutable; this cannot be corrected after approval. The
same audit must catch stale counts in `README.md` and the release-notes draft.

## Facts carried in

- The npm package ships only `dist/`, `README.md`, `LICENSE`, `CREDITS.md`, and
  `CHANGELOG.md` (`package.json` `files`). `docs/` and `scripts/` are not in the
  tarball.
- Candidate: `0.1.13`, 160 `dist/` files, `dist/` digest
  `3470ecc97c98ef8358aaf77dbea767cebd1824542762ae0fef50713f46d3a120`, 165-file
  tarball `67c66300921138281f06ba3626ca2658f1325fde5ddc4aa3559a579e96aafd60`.
- `npm stage publish` needs no 2FA; `approve` and `reject` do. A stage has no
  expiry. Rejecting and re-staging the same `name@version` is supported.
- A staged publish generates provenance on parity with a direct publish; the
  attestation transfers on approval. It is not publicly verifiable until the
  version is live.
- Since 2026-07-28 npm scans a version before it becomes available, typically
  5–15 minutes. In the stage queue the approve button is disabled until the scan
  completes. A slow scan is not a failed stage.
- opencode matches an MCP permission as `<server>_<tool>` and a `deny` blocks the
  operation. Issue `anomalyco/opencode#42548` reports that a denied MCP tool can
  still appear in the Code Mode catalog but execution is blocked per call. This
  has not been measured locally against the bridge.
- Muse 1.4.25 is the installed version; no 1.4.26 is observed. The round-33
  watch item stands.

## Status ledger

| ID | Work | Cost | Status | Output |
|---|---|---|---|---|
| A1 | Freeze the packaged copy | free | pending | `CHANGELOG.md`, `README.md` |
| A2 | Correct stage facts and public docs | free | pending | `docs/release.md`, `docs/provenance.md`, `docs/release-notes/0.1.13.md` |
| A3 | Close E61 Arm C as documented | free | pending | `docs/evidence/2026-11-26-r34-e61c.json` |
| A4 | Claims ledger | free | pending | `docs/claims.md`, `docs/claims.json` |
| A5 | Release preflight | free | pending | `docs/evidence/2026-11-26-r34-e60.json` |
| F2 | Rebuild, tests, E64, commit | free | pending | commit on `round-34` |
| E66 | Stage and reject rehearsal | owner 2FA at reject | pending | `docs/evidence/2026-11-26-r34-e66.json` |
| E67 | Stage and owner approve | owner 2FA at approve | pending | `docs/evidence/2026-11-26-r34-e67.json` |
| R | Reconcile, post-publish record, report | free | pending | status + decision docs |

## 1. Copy and documentation (A1–A4)

### A1. Freeze the packaged copy (free)

Only files in `package.json` `files` can change the release artifact. Make these
final before rebuilding:

1. `CHANGELOG.md`: change the heading to `## 0.1.13` and delete the two-sentence
   “local candidate / not a published release” introduction. Keep the release
   content and the “Known limitation” bullet unchanged.
2. `README.md`: run `npm run check:offline` and replace the stale test counts
   (`452` in the two places that describe the checkout) with the measured count.
   Leave the dated Linux/macOS/Windows matrix numbers alone; they are a separate
   dated observation. Do not change install instructions.
3. `CREDITS.md`, `LICENSE`, `package.json`, `package-lock.json`: verify the
   version is `0.1.13` everywhere and no file claims the release is unpublished.

**Acceptance:** `grep -n "not published" CHANGELOG.md` returns nothing; a dry
pack lists the expected 165 files and the packaged `CHANGELOG.md` no longer
claims to be a candidate.

### A2. Correct the stage facts and public docs (free)

1. `docs/release.md`: correct the provenance sentence. Provenance is generated
   for a staged publish and transfers on approval; it is not publicly verifiable
   until the version is live. Add the scan gate (approve disabled until npm’s
   scan finishes, typically 5–15 minutes, poll rather than retry), the fact that
   stages have no expiry, and that reject-then-restage the same version works.
2. `docs/provenance.md`: remove the false sentence that the npm tarball “carries
   this file” — `docs/provenance.md` is not packaged. Replace “independent
   rebuild pending” with the E64 B1 result: two clean builders on one machine
   and toolchain, cross-machine still pending.
3. `docs/release-notes/0.1.13.md`: remove “local candidate” and the “not
   published” block. Use the measured verification counts from A1. Leave the
   published date and npm link for R; do not invent them.
4. `docs/round-34-research.md` records the npm facts and sources; do not rewrite
   round-33 research.

**Acceptance:** no public-facing doc says provenance is generated only at public
publish, and no doc says the tarball contains `provenance.md`.

### A3. Close E61 Arm C as documented (free)

Write `docs/evidence/2026-11-26-r34-e61c.json` with:

- `status: "documented-not-measured"`;
- the opencode docs quote for `<server>_<tool>` and “Any deny denies the
  operation”;
- issue `anomalyco/opencode#42548` as supporting evidence that execution is
  blocked per call even when the Code Mode catalog leaks a denied tool;
- the correction that the Muse name `mcp__opencode__bash` is **not** the
  opencode permission action; the opencode action is `opencode_bash`;
- an explicit limit: no local bridge measurement, no B3 claim.

Do not add a `plugin`-side test that claims to measure opencode. Do not spend a
Muse turn on this arm.

### A4. Claims (free)

Run `bun scripts/check-claims.ts --strict`. Add only if a doc now depends on the
outside sentence:

- `npm-stage-provenance` — staged publishes generate provenance on parity with
  direct publishes, URL the npm community FAQ
  (`https://github.com/orgs/community/discussions/196675`), quote “Provenance is
  generated for staged packages on parity with direct publishes”.
- `opencode-mcp-deny` — MCP tools are matched as `<server>_<tool>` and a deny
  blocks the operation, URL `https://opencode.ai/docs/permissions`, quote “Any
  `deny` denies the operation”.

Do not add a claim for the catalog leak; it is a limitation, not a promise.

## 2. Release preflight (A5)

Record in `docs/evidence/2026-11-26-r34-e60.json`:

```bash
npm view @jonathand34/opencode-plugin-muse versions --json
npm view @jonathand34/opencode-plugin-muse dist-tags --json
npm whoami
npm stage list --json
gh repo view jond34/opencode-plugin-muse --json visibility,isPrivate
gh workflow list --json
```

Stop before staging if `0.1.13` is public, a `0.1.13` stage already exists, npm
is unauthenticated, the repository is not PUBLIC, or `publish.yml` is absent.

## 3. Rebuild and second-builder rerun (F2)

A1 changed packaged files, so the tarball hash changes even if `dist/` does not.

1. Run, preserving status:

   ```bash
   npm run check:offline
   bun test $(git ls-files 'test/*.test.ts' | sed "s|^|$PWD/|")
   bun scripts/check-claims.ts --strict
   bash scripts/check-release.sh
   git diff --check
   ```

2. `npm pack` to a fresh directory; record the new tarball SHA-256, file count,
   and `dist/` digest.
3. Update `scripts/repro.sh` `EXPECTED` only if `dist/` changed; update the
   candidate tarball hash in `docs/provenance.md`.
4. Run `bash scripts/repro.sh` and require PASS.
5. Rerun E64 from a clean commit: two `git archive HEAD` copies, separate
   `HOME`/cache/`TMPDIR`, `npm ci`, build, pack. B1 or B2 continues; content
   drift stops. Record `docs/evidence/2026-11-26-r34-e64.json` as an addendum to
   round 33, with the new tarball hash.
6. Commit the frozen candidate on `round-34`, leaving
   `docs/integration-landscape.md` unstaged.

**Acceptance:** the commit’s tarball hash is the one E66 compares against, and
the packaged `CHANGELOG.md` has no unpublished claim.

## 4. Stage and reject rehearsal (E66)

Preconditions: A1–A5 and F2 are committed; E64 is B1/B2; npm auth works; the
owner is present for a reject.

1. Re-run the A5 preflight. Stop on any change.
2. Push **only** `round-34`; dispatch `publish.yml`; record the run URL.
3. `npm stage list --json` → stage ID. If absent, wait for the run; do not run a
   local publish.
4. `npm stage download <stage-id> <dir>`; record:
   - raw SHA-256 of the staged tarball;
   - `npm stage view <stage-id> --json` (shasum/integrity if present);
   - `tar -tzf` file list and per-file SHA-256, compared with the local pack.
5. CI mtimes can differ from a local pack. If raw hashes differ, unpack both,
   normalize mtimes to the commit time, and compare the sorted content digest.
   **Content drift is a stop; header drift is not.** Record which happened.
6. If content matches, hand the owner exactly:

   ```bash
   npm stage reject <stage-id>
   ```

   The owner runs it in their terminal or rejects in the npmjs.com Staged
   Packages tab; both require 2FA. The agent must not run reject unattended and
   must not ask for the OTP.
7. Verify `npm stage list --json` no longer holds the stage and `npm view`
   shows no `0.1.13`.

**Branches:** B1 stage content matches, owner rejects, nothing public; B2 content
mismatch → owner rejects, stop; B3 workflow/stage fails → record, stop; B4 no
owner 2FA → leave the stage pending (O50 A), record the stage ID, stop.

## 5. Stage and owner approval (E67)

Preconditions: E66 B1; the same commit; the owner has explicitly agreed to
publish 0.1.13.

1. Dispatch `publish.yml` again; verify the new stage’s content against the same
   candidate exactly as in E66.
2. Wait for npm’s scan. Poll `npm stage view <stage-id>` / `npm stage list` until
   the stage is approvable, up to 30 minutes. Do not approve during the scan and
   do not re-stage because the button is disabled.
3. Hand the owner exactly:

   ```bash
   npm stage approve <stage-id>
   ```

   The agent never runs approve and never accepts an OTP in chat.
4. Poll `npm view @jonathand34/opencode-plugin-muse versions --json` and
   `dist-tags --json` for up to 30 minutes after approval. Availability can lag
   the approval.
5. Verify, in order:
   - `0.1.13` is in `versions` and `latest` points at it;
   - `dist.integrity` and `dist.shasum` match the staged tarball;
   - `dist.attestations.provenance` exists and the attestation URL is 200;
   - `npm audit signatures` passes in a clean install of `0.1.13`;
   - a clean install imports the default export;
   - the registry tarball’s content matches the staged/candidate content (raw
     bytes may differ only in headers).
6. If the owner does not approve, leave the stage pending, record the stage ID,
   and stop. A pending stage is not a public version.

**Branches:** B1 published and verified; B2 approval/2FA blocked → stage pending;
B3 npm scan blocked or held → stop, do not appeal or re-stage; B4 registry
integrity/content mismatch → stop, deprecate only if already public.

## 6. Reconcile and report (R)

Update `docs/provenance.md` with the published row (version, date, tarball
SHA-256, integrity, attestation URL), `docs/release.md` current state,
`docs/round-34-status.md`, `docs/decision-evidence.md`,
`docs/decision-coverage.md`, and `docs/evidence-audit.md`.

If O51 A and the release published, the owner creates the GitHub Release from
`docs/release-notes/0.1.13.md`; the agent verifies the tag/release names the same
commit but does not create it.

## 7. Pre-committed decisions

| ID | Trigger | Decision |
|---|---|---|
| D268 | A1–A2 | The packaged copy is frozen before the final rebuild; a tarball that claims “not published” must not ship. |
| D269 | F2/E64 | The new tarball must be B1/B2; content drift stops. Header drift is recorded, not treated as tampering. |
| D270 | E66 | Stage content matches and reject succeeds → O37 A proven; mismatch → reject and stop. |
| D271 | E67 | Owner approves, public version/provenance/install verify → release complete. No owner approval → stage pending, no publish. |
| D272 | A3 | E61 Arm C is documented, not measured; the correct opencode action is `opencode_bash`, not `mcp__opencode__bash`. |
| D273 | A5/E66 | Any 0.1.13 stage or public version at preflight stops the run; do not stack stages. |
| D274 | E67 scan | A disabled approve button is a scan wait, not a failure; never approve during the scan or re-stage to “fix” it. |

## 8. Owner choices (product/ops, defaults pre-chosen)

### O45. Packaged copy (default A)

- **A. Fix the changelog and stale counts, rebuild, rerun E64.** Recommended:
  the alternative ships a false statement permanently.
- **B. Publish the current tarball unchanged.** Rejected; the package would say
  it is not published.

### O46. Release motion (default A)

- **A. Stage → reject → stage → approve.** Proves the reject path and the stage
  digest while the owner is already at the 2FA prompt. Recommended.
- **B. Stage → approve once.** One fewer OTP and stage, but O37 stays unproven.
- **C. Stop at one verified stage.** No publish this round; the stage has no
  expiry, so the owner can approve later.

### O47. Approval authority (default A)

- **A. The owner runs `npm stage approve`.** Recommended: 2FA is the
  proof-of-presence, and the agent must not hold or relay the OTP.
- **B. The owner approves in the npmjs.com UI.** Equivalent; use if the CLI
  prompt is inconvenient.
- **C. The agent runs approve with an OTP pasted into chat.** Rejected: it
  defeats the human gate and leaks a live second factor into the transcript.

### O48. Version (default A)

- **A. Keep `0.1.13`.** Recommended: `package.json`, lockfile, changelog, and
  the 165-file candidate already agree; changing now invalidates E64 and the
  staged evidence.
- **B. Renumber to `0.2.0`.** Defensible for the scope, but a new candidate and
  a new rebuild for no user-visible gain.

### O49. E61 Arm C and E55 (default A)

- **A. Close Arm C as documented and keep E55 owner-only.** Recommended: the
  release does not depend on either; the deny claim is limited to the vendor
  docs plus issue #42548, and O42 B already covers Console.
- **B. Build an opencode bridge harness and retry E55.** More evidence, more
  rounds, no change to 0.1.13.

### O50. If approval is blocked (default A)

- **A. Leave the verified stage pending and report its ID.** Recommended: stages
  do not expire, and nothing is public; the owner can approve later.
- **B. Reject the stage and stop.** Cleaner queue, but throws away the verified
  artifact and forces a new stage later.

### O51. GitHub Release (default A)

- **A. Owner creates it from `docs/release-notes/0.1.13.md` after publish.**
  Recommended if the draft is final; it gives the version a public note.
- **B. No GitHub Release.** The npm page and changelog are the record.

## 9. Execution order

1. A1–A4 (free).
2. A5 preflight (free).
3. F2 rebuild, checks, E64 rerun, commit.
4. E66 stage/reject rehearsal with owner 2FA.
5. E67 stage/approve with owner 2FA, then verify public.
6. R reconcile and report.

If the owner is not available at E66/E67, stop at the last safe point. Do not
approve anything, do not create a tag, and do not push anything except
`round-34`.

## 10. Stop conditions

Stop and report, do not improvise, if:

- a packaged file still claims the release is unpublished;
- E64 or the stage shows content drift (not header drift);
- `0.1.13` is already public or a `0.1.13` stage already exists at preflight;
- the agent would have to run `npm stage approve` or handle an OTP;
- npm’s scan blocks or holds the package;
- registry integrity/content does not match the staged tarball;
- a command would publish, tag, or make a version public outside the owner’s
  explicit approval;
- a secret would enter an artifact or the transcript.

## 11. Final report format

1. Status table (A/F/E/R, done/blocked/failed).
2. New candidate hashes: `dist/`, tarball, file count, packaged changelog check.
3. E64 branch and whether the two builders matched.
4. E66 stage ID, raw and normalized hashes, reject result, public-version check.
5. E67 stage ID, approve result, public version, integrity, attestation, install,
   registry content check.
6. Checks with exact counts.
7. O45–O51 with defaults and changes.
8. Blocked items and what would unblock them.
9. Commit hash, files changed, files intentionally left unstaged.
