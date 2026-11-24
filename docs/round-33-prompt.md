# Round 33 execution prompt

Execute `docs/round-33-plan.md` in `~/repos/opencode-plugin-muse`. The owner has
approved all experiments and the product defaults below. Do not re-ask them
unless a named result changes the branch.

## Read first

1. `README.md` and the repo `AGENTS.md`.
2. `docs/round-33-plan.md`, `docs/round-33-research.md`,
   `docs/round-33-status.md`.
3. `docs/round-32-p1-p2-decision.md`, `docs/round-32-status.md`,
   `docs/evidence/2026-11-26-r32-e65.json`,
   `docs/evidence/2026-11-26-r32-e65b.json`,
   `docs/approval.md`, `docs/release.md`.
4. The E48/E57 approval evidence and the round-31 E62 artifact for the Muse
   command shapes you will reuse.

Then verify:

```bash
git status --short
git log -3 --oneline
```

Expect branch `round-33` with the plan commit as HEAD and `docs/round-33-*.md`
present, with only `docs/integration-landscape.md` modified and unstaged. Do not
stage or edit the owner file.

## Guardrails

- Scratch: `scratch/r33-*`. Evidence: `docs/evidence/2026-11-26-r33-*`.
- `zsh -lc` for `muse` and anything needing `~/.zshenv`; `bash` for repo scripts.
- Isolate every Muse experiment with `XDG_CONFIG_HOME`, `XDG_DATA_HOME`,
  `XDG_STATE_HOME`, and `XDG_CACHE_HOME` under `scratch/r33-*`. Never touch the
  real Muse config, approval store, or trust store. Symlink `auth.json`
  read-only; never copy a secret.
- Do not approve a stage, publish, tag, create a release, or push a tag. E60 may
  push only `round-33` to dispatch the workflow, and may reject a stage.
- `npm stage reject` requires 2FA. Do not call it unattended; if the owner is not
  present, mark E60 blocked.
- Do not claim provenance for a staged package. Provenance is generated at
  public publish; a stage/reject run cannot verify it before approval.
- Do not rewrite old evidence. Add new JSON with `addendumTo` / `supersedes`.
- Preserve exit status. Do not pipe a check in a way that hides its code.
- Every experiment records versions, commands, start/end time, turns, cost, raw
  output paths, observations, and limits.

## Defaults already chosen

Record the branch; do not silently pick a new posture.

| Choice | Default |
|---|---|
| P1. `plugin`-origin posture | A: keep the allow; doctor `warn` detail plus docs; no gate. |
| P2. Release under E65 | A: resume after E61/F1/E64/E60; hold only on a stop condition. |
| P3. Provenance proof | A: stage/reject only; no disposable prerelease. |
| P4. Console claim | B: labelled vendor-doc note if E55 is blocked; A only with E55a/E55b. |
| O31. Approval posture | A this release. If E61 B2, schedule the O16 B spike separately (O44 A), do not hold. |
| O32. Console wording | D/B vendor-doc note until E55. |
| O33. Gate strictness | A. |
| O34. Reproducibility claim | B if E64 B1, or B2 with normalized content match. |
| O35. Dependency risk | A. |
| O36. Windows desktop | A, retired. |
| O37. Stage proof | A partial: stage/reject with owner 2FA; approval/provenance documented, not measured. |
| O38. Doctor surface | A: extend the existing `hooks` row with `warn` and one sentence; no new row, no startup warning. |
| O39. Caveat placement | A: CHANGELOG "Known limitation" + README + `approval.md` + `release.md`. |
| O40. Watch cadence | A: next Muse minor or schema drift, and by 2027-02-28. |
| O41. Provenance proof | A. |
| O42. Console claim | B. |
| O43. E64 header drift | A: "content-identical; `npm pack` headers vary". |
| O44. E61 B2 | A: ship under O31 A; one-prompt spike is a follow-up. |

If a result changes a default, record the measured branch, mark the affected
choice open, and report the minimum decision. The only automatic stop is a stop
condition below.

## Work order

### 1. A1 — doctor warning

Extend the existing `hooks` row in `scripts/doctor.ts`:

- If any `probe.hooks` row has `handlerKind === "plugin"`, set the row status to
  `warn` (it must not gate) and append:
  `installed plugin hooks are outside this record; this host runs them only from an approval in its private config, which the plugin never creates`.
- Change nothing in `hookGateRefusal`, `BLOCKING_KINDS`, or env vars.
- Add a doctor test for the warn + sentence and keep the project-refusal test.
- Run `bun test test/doctor.test.ts test/hook-gate.test.ts`.

### 2. A2/A3 — wording and watch item

- `CHANGELOG.md` 0.1.13: a "Known limitation" bullet with both facts: the private
  host sees no user approval; a private config that holds its own approval is
  amnestied by `muse plugins update` on 1.4.25.
- `README.md` near the hook gate: the same fact in two sentences and the doctor
  command that shows it.
- `docs/approval.md`: add the doctor surface sentence.
- `docs/release.md`: add the limitation to "What not to promise" and the watch
  trigger/recheck date (next Muse minor or 2027-02-28).

Do not claim the update re-asks or that Muse is fixed.

### 3. A4 — claims

Run `bun scripts/check-claims.ts --strict`. Add a row only for a new
load-bearing outside sentence; do not add a `manual` kind.

### 4. A5 — E60 preflight

Record in `docs/evidence/2026-11-26-r33-e60.json`:

```bash
npm view @jonathand34/opencode-plugin-muse versions --json
npm view @jonathand34/opencode-plugin-muse dist-tags --json
npm view @jonathand34/opencode-plugin-muse@0.1.12 dist.attestations --json
npm whoami
npm stage list --json
gh repo view jond34/opencode-plugin-muse --json visibility,isPrivate
```

If `npm stage list` is `E401`, record blocked and continue. Do not stage.

### 5. E61 — approval scope matrix

Follow plan §3. Create the dependency-free stdio MCP server, register it with
`muse mcp add opencode -- <node> <server.mjs>`, trust both workspaces, and use
the E48 `:ask-me` shape. Cap: 3 turns / $1.50.

- Arm A: choose "Always allow this MCP tool"; record the rule (no
  `workspaceRoot`).
- Arm B: ws-b; no prompt → B1; prompt → deny once and record B2.
- Arm C: if A wrote a rule, add an opencode `deny` for `mcp__opencode__bash` and
  run again. A deny must win.

Branches: **B1** cross-workspace → O31 A; **B2** workspace-local → O31 A this
release + O44 A; **B3** deny ignored → stop the release; **B4** blocked → no
claim, continue F1/E64.

Artifact: `docs/evidence/2026-11-26-r33-e61.json`.

### 6. F1 — checks and commit

Run, preserving status:

```bash
npm test
bun scripts/check-claims.ts --strict
bash scripts/check-release.sh
bash scripts/repro.sh
npm pack --dry-run
git diff --check
```

Fix failures caused by this round; never weaken a test. Record exact counts,
`dist/` hash, and tarball SHA-256. Commit on `round-33`, leaving the owner file
unstaged.

### 7. E64 — second clean builder

Follow plan §3. Two independent `git archive` copies, each with fresh `HOME`,
npm cache, and `TMPDIR`; `npm ci`, build, pack in both. Compare `dist/index.js`,
the sorted `dist/` digest, the tarball SHA-256, and file counts.

- Raw match → B1.
- Dist matches, tarball differs only in headers → unpack, normalize mtimes to
  the commit time, compare the sorted content digest → B2.
- A file hash differs → B3, stop; no release claim.
- `npm ci`/build fails → B4; use `--ignore-scripts` only if the build does not
  need lifecycle scripts, and say so.

Artifact: `docs/evidence/2026-11-26-r33-e64.json`.

### 8. E55a/E55b — only with an owner browser

Use the round-32 protocols. If no owner-authenticated browser exists, mark both
blocked and use O42 B. Do not substitute a local config test.

### 9. E60 — stage and reject

Only if E61 is not B3, E64 is B1/B2, `npm whoami` works, and the owner is
present for reject 2FA.

Re-run preflight; stop if 0.1.13 is public or a stage exists. Push only
`round-33`; dispatch `publish.yml`; record the run URL and stage list. Download
the stage, compare SHA-256 with the candidate, inspect `npm stage view`, then
**reject**. Never approve. Verify no 0.1.13 is public and the stage is gone.

Branches: B1 stage/reject success; B2 digest mismatch → reject and stop; B3
stage-only rejects a direct publish → record, do not test; B4 2FA/auth blocked →
record, leave unpublished.

Artifact: `docs/evidence/2026-11-26-r33-e60.json`.

### 10. R — reconcile and report

Update `docs/round-33-status.md`, `docs/decision-evidence.md`,
`docs/evidence-audit.md`, `docs/decision-coverage.md`, `docs/approval.md`,
`docs/release.md`, `docs/claims.md`, and `docs/provenance.md` with the actual
branches. Do not rewrite the plan or research.

Final report must include:

1. Status table (A/E/F/R).
2. E61 branch, the grant shape, and the store rule.
3. E64 branch with dist hash, tarball hash, and the header caveat if B2.
4. E60 stage ID, candidate/stage hashes, reject result, public-version check.
5. Checks with exact counts and hashes.
6. O31–O44 and P1–P4, with defaults and changes.
7. Blocked items and what would unblock them.
8. Commit hash, files changed, and files intentionally left unstaged.

## Stop conditions

Stop and report, do not improvise, if:

- E61 B3: an opencode `deny` is ignored.
- E64 B3: an unexplained dist content mismatch.
- E60 digest mismatch, a stage would be approved, or no owner 2FA for reject.
- An experiment exceeds its cap (E61 3 turns / $1.50).
- A command would touch the real Muse config or approval store.
- A secret would be written to an artifact.
- Any command would publish, tag, or make `0.1.13` public.
