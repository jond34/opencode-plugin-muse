# Round 34 execution prompt

Execute `docs/round-34-plan.md` in `~/repos/opencode-plugin-muse`. The owner has
approved all experiments and the defaults below. Publishing is not an
experiment: E67 requires the owner's explicit “publish 0.1.13” and the owner
runs `npm stage approve`; the agent never does.

## Read first

1. `README.md` and the repo `AGENTS.md`.
2. `docs/round-34-plan.md`, `docs/round-34-research.md`,
   `docs/round-34-status.md`.
3. `docs/round-33-status.md`, `docs/round-33-research.md`,
   `docs/evidence/2026-11-26-r33-e60.json`,
   `docs/evidence/2026-11-26-r33-e61.json`,
   `docs/evidence/2026-11-26-r33-e64.json`.
4. `docs/release.md`, `docs/provenance.md`, `docs/approval.md`,
   `docs/release-notes/0.1.13.md`.

Then verify:

```bash
git status --short
git log -3 --oneline
```

Expect branch `round-34` with the plan commit as HEAD and `docs/round-34-*.md`
present, with only `docs/integration-landscape.md` modified and unstaged. Do not
stage or edit the owner file.

## Guardrails

- Scratch: `scratch/r34-*`. Evidence: `docs/evidence/2026-11-26-r34-*`.
- `zsh -lc` for `muse` and anything needing `~/.zshenv`; `bash` for repo scripts.
- Do not edit or stage `docs/integration-landscape.md`.
- Do not create a tag, a GitHub Release, or push anything except `round-34`.
- Do the agent run `npm stage approve`, `npm stage reject`, or handle an OTP.
  The owner runs both commands in their terminal or uses the npmjs.com Staged
  Packages tab. The agent may run `npm stage list`, `view`, and `download`.
- A stage is not a public version. Do not announce or claim publication until
  `npm view` resolves `0.1.13` and the attestation URL is 200.
- Do not weaken a test or a release check. Preserve exit status.
- Do not copy auth tokens or secret values into evidence.
- Do not rewrite old evidence. New files carry `addendumTo` when they correct
  one.
- Stop if any command would make a version public outside the owner's explicit
  approval.

## Defaults already chosen

| Choice | Default |
|---|---|
| O45. Packaged copy | A: fix the changelog and stale counts, rebuild, rerun E64. |
| O46. Release motion | A: stage → reject → stage → approve. |
| O47. Approval authority | A: the owner runs `npm stage approve`; never the agent. |
| O48. Version | A: keep `0.1.13`. |
| O49. E61 C / E55 | A: close Arm C as documented; E55 stays owner-only. |
| O50. Blocked approval | A: leave the verified stage pending and report its ID. |
| O51. GitHub Release | A: owner creates it after publish; the agent does not. |

If a result changes a default, record the measured branch, mark the affected
choice open, and report the minimum decision. The only automatic stop is a stop
condition below.

## Work order

### 1. A1 — freeze the packaged copy

Only these files are in the npm tarball: `dist/`, `README.md`, `LICENSE`,
`CREDITS.md`, `CHANGELOG.md`.

- `CHANGELOG.md`: change the heading to `## 0.1.13` and delete the “local
  candidate, not published” introduction. Keep the content and “Known
  limitation” bullet.
- `README.md`: run `npm run check:offline`; replace the stale `452` counts with
  the measured number. Leave the dated platform matrix alone.
- Verify `package.json` and `package-lock.json` both say `0.1.13`.

Acceptance:

```bash
grep -n "not published" CHANGELOG.md   # no output
npm pack --dry-run --json              # expected files, no src/test/docs/scratch
```

### 2. A2 — correct the stage facts and public docs

- `docs/release.md`: provenance is generated for a staged publish and transfers
  on approval; it is not publicly verifiable until the version is live. Add
  npm’s scan gate (approve disabled until the scan finishes, typically 5–15
  minutes), the fact that stages do not expire, and that reject-then-restage the
  same version works.
- `docs/provenance.md`: remove the false claim that the npm tarball “carries
  this file” (`docs/provenance.md` is not packaged). Replace “independent
  rebuild pending” with E64 B1: two clean builders on one machine/toolchain;
  cross-machine still pending.
- `docs/release-notes/0.1.13.md`: remove “local candidate” and “not published”;
  use the measured verification counts. Do not invent a published date; R adds
  it.
- Do not rewrite round-33 research.

### 3. A3 — close E61 Arm C as documented

Write `docs/evidence/2026-11-26-r34-e61c.json` with:

- `status: "documented-not-measured"`;
- the opencode docs facts: MCP action is `<server>_<tool>`, a `deny` blocks the
  operation;
- the correction that the opencode action is `opencode_bash`, not
  `mcp__opencode__bash`;
- `anomalyco/opencode#42548` as supporting evidence that execution is blocked
  per call even when the Code Mode catalog leaks the tool;
- the limit: no local bridge measurement, no B3 claim.

Do not spend a Muse turn. Do not add a test that claims to measure opencode.

### 4. A4 — claims

Run `bun scripts/check-claims.ts --strict`. Add, if the docs now depend on them:

- `npm-stage-provenance`: staged publishes generate provenance on parity with
  direct publishes, URL
  `https://github.com/orgs/community/discussions/196675`, quote “Provenance is
  generated for staged packages on parity with direct publishes”.
- `opencode-mcp-deny`: URL `https://opencode.ai/docs/permissions`, quote “Any
  `deny` denies the operation”.

Do not add a claim for the catalog leak.

### 5. A5 — release preflight

Record in `docs/evidence/2026-11-26-r34-e60.json`:

```bash
npm view @jonathand34/opencode-plugin-muse versions --json
npm view @jonathand34/opencode-plugin-muse dist-tags --json
npm whoami
npm stage list --json
gh repo view jond34/opencode-plugin-muse --json visibility,isPrivate
gh workflow list --json
```

Stop before staging if `0.1.13` is public, a `0.1.13` stage exists, npm is
unauthenticated, the repo is not PUBLIC, or `publish.yml` is absent.

### 6. F2 — rebuild, test, E64, commit

A1 changed packaged files, so the tarball hash changes even if `dist/` does not.

```bash
npm run check:offline
bun test $(git ls-files 'test/*.test.ts' | sed "s|^|$PWD/|")
bun scripts/check-claims.ts --strict
bash scripts/check-release.sh
git diff --check
```

Then:

```bash
mkdir -p scratch/r34-f2/pkg
npm pack --pack-destination scratch/r34-f2/pkg --silent
sha256sum scratch/r34-f2/pkg/*.tgz
tar -tzf scratch/r34-f2/pkg/*.tgz | wc -l
find dist -type f | sort | xargs sha256sum | sha256sum
```

- Update `scripts/repro.sh` `EXPECTED` only if `dist/` changed.
- Update the candidate tarball hash in `docs/provenance.md`.
- `bash scripts/repro.sh` must PASS.
- Rerun E64: two `git archive HEAD` copies, each with fresh `HOME`,
  `npm_config_cache`, and `TMPDIR`; `npm ci`, build, pack. Compare `dist/`,
  per-file hashes, and tarballs. B1/B2 continues; content drift stops. Record
  `docs/evidence/2026-11-26-r34-e64.json` with `addendumTo` the round-33 file.
- Commit the frozen candidate on `round-34`; leave the owner file unstaged.

### 7. E66 — stage and reject rehearsal

Preconditions: F2 committed; E64 B1/B2; the owner is available for a reject.

1. Re-run A5. Stop on any change.
2. Push only `round-34`; dispatch `publish.yml`; record the run URL.
3. `npm stage list --json` → stage ID. Wait for the run if needed; do not publish
   locally.
4. `npm stage download <stage-id> <dir>` and record:
   - raw SHA-256 of the staged tarball;
   - `npm stage view <stage-id> --json`;
   - `tar -tzf` file list and per-file SHA-256, compared with the local pack.
5. CI mtimes can differ from a local pack. If raw hashes differ, unpack both,
   normalize mtimes to the commit time, and compare the sorted content digest.
   Content drift is a stop; header drift is not. Record which happened.
6. If content matches, ask the owner to run:

   ```bash
   npm stage reject <stage-id>
   ```

   Wait for the owner to confirm. Do not run reject and do not ask for the OTP.
7. Verify the stage is gone and `npm view` still has no `0.1.13`.

**Branches:** B1 content matches, reject succeeds, nothing public; B2 content
mismatch → owner rejects, stop; B3 workflow/stage fails → stop; B4 no owner →
leave the stage pending (O50 A), record the stage ID, stop.

### 8. E67 — stage and owner approval

Preconditions: E66 B1; the same commit; the owner has explicitly said “publish
0.1.13.”

1. Dispatch `publish.yml` again; verify the new stage’s content exactly as in
   E66.
2. Wait for npm’s scan. Poll `npm stage view` / `npm stage list` until the stage
   is approvable, up to 30 minutes. Do not approve during the scan and do not
   re-stage because the button is disabled.
3. Ask the owner to run:

   ```bash
   npm stage approve <stage-id>
   ```

   Never run approve and never accept an OTP in chat.
4. Poll `npm view ... versions --json` and `dist-tags --json` for up to 30
   minutes. Availability can lag approval.
5. Verify:
   - `0.1.13` is in `versions`, `latest` is `0.1.13`;
   - `dist.integrity` and `dist.shasum` match the staged tarball;
   - `dist.attestations.provenance` exists and its URL is 200;
   - `npm audit signatures` passes in a clean install;
   - a clean install imports the default export;
   - the registry tarball content matches the staged/candidate content.

**Branches:** B1 published and verified; B2 approval blocked → stage pending;
B3 scan blocked/held → stop, do not appeal or re-stage; B4 integrity/content
mismatch → stop.

### 9. R — reconcile and report

Update `docs/provenance.md` (published row: version, date, tarball SHA-256,
integrity, attestation URL), `docs/release.md`, `docs/round-34-status.md`,
`docs/decision-evidence.md`, `docs/decision-coverage.md`, and
`docs/evidence-audit.md` with the actual branches.

If O51 A and the release published, the owner creates the GitHub Release from
`docs/release-notes/0.1.13.md`; the agent verifies the tag/release names the same
commit but does not create it.

Final report must include:

1. Status table (A/F/E/R).
2. New candidate hashes and the packaged-changelog check.
3. E64 branch and builder comparison.
4. E66 stage ID, raw/normalized hashes, reject result, public-version check.
5. E67 stage ID, approve result, public version, integrity, attestation, install.
6. Checks with exact counts.
7. O45–O51 with defaults and changes.
8. Blocked items and what would unblock them.
9. Commit hash, files changed, files intentionally left unstaged.

## Stop conditions

Stop and report, do not improvise, if:

- a packaged file still claims the release is unpublished;
- E64 or the stage shows content drift (not header drift);
- `0.1.13` is already public or a `0.1.13` stage exists at preflight;
- the agent would have to run `npm stage approve` or handle an OTP;
- npm’s scan blocks or holds the package;
- registry integrity/content does not match the staged tarball;
- a command would publish, tag, or make a version public outside the owner’s
  explicit approval;
- a secret would enter an artifact or the transcript.
