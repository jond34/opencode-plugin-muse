# Round 31 plan: evidence integrity and release-gate hardening

**Base** `c4053e2` (`round-30`). **Branch** `round-31`. **Run date** 2026-11-23.
**Artifact prefix** `2026-11-26-r31` for sort consistency; each artifact records
the real run date inside.

This round is deliberately not a feature round. It has four jobs:

1. Correct evidence that is now known to be wrong or over-broad.
2. Resolve the one security-relevant scope ambiguity (Muse MCP grants versus
   workspace-scoped shell grants).
3. Make the release gates executable instead of prose.
4. Rehearse **stage and reject**, not approve and publish.

No feature, refactor, new runtime dependency, or public release is in scope.
Past evidence files are not rewritten; corrections are addenda and dated status
tables.

## Status ledger

| ID | Work | Cost | Status | Output |
|---|---|---|---|---|
| A0 | This research, plan, and prompt | free | done | `docs/round-31-*.md` |
| A1 | E55 baseline addendum | free | pending | `docs/evidence/2026-11-26-r31-e55-baseline-addendum.json` |
| A2 | Approval-scope correction | free | pending | `docs/approval.md`, coverage/audit rows |
| A3 | Console-doc consolidation | free | pending | `docs/policy-remote.md` |
| A4 | Platform claim qualification | free | pending | `docs/decision-coverage.md` |
| A5 | Executable release gate and strict claims | free | pending | `scripts/check-release.sh`, workflow, docs |
| A6 | Provenance wording | free | pending | `docs/release.md`, `docs/evidence-audit.md` |
| E61 | Approval scope matrix | ≤3 turns / ≤$1.50 | pending | `docs/evidence/2026-11-26-r31-e61.json` |
| E62 | Fresh project hook + update re-approval | ≤2 turns / ≤$1.00 | pending | `docs/evidence/2026-11-26-r31-e62.json` |
| E55a | Console effect/timing | owner browser, ≤1 turn | pending | `docs/evidence/2026-11-26-r31-e55a.json` |
| E55b | Console tool-deny attribution | owner browser, ≤1 turn | pending | `docs/evidence/2026-11-26-r31-e55b.json` |
| E63 | Runtime dependency trace | free | pending | `docs/evidence/2026-11-26-r31-e63.json` |
| E64 | Second clean builder | free | pending | `docs/evidence/2026-11-26-r31-e64.json` |
| E60 | Stage and reject | free + owner 2FA | pending | `docs/evidence/2026-11-26-r31-e60.json` |
| F | Reconcile docs, run checks, commit | free | pending | commit on `round-31` |

E59/Windows desktop remains blocked. Do not run a substitute and call it a
desktop test.

## 0. State and guardrails

- Work in this repo, not a sibling. Scratch: `scratch/r31-*` (ignored).
- Keep live state in `docs/round-31-status.md`. Do not rewrite this plan or the
  research file to hide a result; append dated status and artifacts.
- Use `zsh -lc` for harness CLIs and anything that needs `~/.zshenv`; use `bash`
  for repo scripts that already use bash.
- Do not edit or stage `docs/integration-landscape.md` (owner file).
- Do not rewrite any existing evidence artifact. Add a new file with
  `supersedes` / `addendumTo` fields.
- Do not copy auth tokens or secret values into evidence. Redact values; record
  paths and hashes.
- Do not approve a stage, publish, tag, create a GitHub release, or push a tag.
  E60 may push only the `round-31` branch if needed to dispatch the workflow,
  and may reject a stage. This is the only push authorization in this round.
- If any command would make `0.1.13` public, stop.
- Commit only the round-31 files. Leave owner-file changes unstaged.

## 1. Documentation and evidence repairs

### A1. Correct the E55 baseline (free)

The retained baseline is valid; the E55 artifact's summary is not.

1. Re-read `scratch/r30-e55/before-config.json`. Confirm:
   - top-level `length == 3`;
   - types are `document`, `directory`, `directory`;
   - the `document` source holds six `provider.use` statements: `*` deny plus
     allows for `openai`, `opencode`, `opencode-go`, `muse`, `deepseek`.
2. Compute `sha256sum` of the retained file and of a fresh
   `opencode debug config --standalone`. Record the equality; do not replace the
   retained file.
3. Write `docs/evidence/2026-11-26-r31-e55-baseline-addendum.json` with:
   - `addendumTo: "docs/evidence/2026-11-26-r30-e55.json"`
   - `status: "baseline-artifact-corrected"`
   - `sourceCount: 3`, `sourceTypes`, `documentPolicies`, `hashes`
   - `originalArtifactWasWrong: "sourceCount:0 and empty sources; retained file is valid"`
   - `limits`: “This corrects the baseline only. It does not establish Console
     attribution or provider-policy effect.”
4. Add a dated row to `docs/evidence-audit.md` pointing at the addendum.

**Do not** re-run E55 as a provider-deny attribution test. That is E55a/E55b.

### A2. Approval scope correction (free)

E57 is valid evidence that a Muse `localPersistent` MCP tool rule applied in a
second workspace. The docs currently blur that with opencode saved approvals.

1. In `docs/approval.md`, split the two systems explicitly:
   - **Muse approval choice:** `once`, `session`, `localPersistent`; shell
     command-prefix grants carry `workspaceRoot` and the UI says “Always allow
     in this workspace”; `tool` grants carry only `toolName` and
     `localPersistent` is “saved in the local policy store.” E57 observed the
     tool rule cross workspaces.
   - **opencode saved approval:** durable, project-scoped `allow` rule; never
     overrides a configured `deny`.
   - **Never** map Muse `localPersistent` to an opencode saved approval without
     a visible global-scope warning.
2. Add a short “What ‘Always allow’ means” table with the four rows from
   `docs/round-31-research.md` §1.
3. Update the approval row in `docs/decision-coverage.md`:
   - keep O16 A as current;
   - mark O16 B “not built; one-prompt/single-use still open”;
   - replace any unqualified “saved approval” with “opencode project-scoped
     saved approval” or “Muse local persistent grant (user store).”
4. Add a note to `docs/evidence-audit.md`: E57 is cross-workspace for the MCP
   tool subject; it is not evidence that shell prefixes cross workspaces.

**Acceptance:** `rg -n "saved approval|localPersistent|Always allow" docs` shows
no sentence that treats the two scopes as the same.

### A3. Console documentation consolidation (free)

`docs/policy-remote.md` still has present-tense claims contradicted by E36/E37
and the round-23 model toggle.

1. Mark the old “tag-only / no way to scope” paragraph as **historical** with
   the build/date it applied to. Do not delete it; move it under a dated
   “Superseded” heading.
2. Keep the current E36/E37 finding: Console rules compile into normal
   policies, and the hand-picked route can scope by policy content.
3. Replace “no per-model control” with the current model-toggle finding, or
   scope that sentence to the old build.
4. Add a one-line status: “E55 baseline showed three local sources; Console
   source attribution remains unproven (E55a/E55b).”
5. Update the corresponding `docs/decision-coverage.md` row.

**Acceptance:** no present-tense “no way to scope” or “no per-model control”
remains outside a historical marker.

### A4. Platform claim qualification (free)

1. In `docs/decision-coverage.md`:
   - ledger row: “mode `0600` on POSIX; Windows uses inherited ACLs, which Node
     `fs.access` does not check.” Do not say “mode 0600” unqualified.
   - reaping row: “POSIX child reaping tested; Windows EOF arm skipped; Windows
     close measured separately.”
2. `docs/platform-support.md` is already correct; only align wording if needed.
3. Add a dated audit row noting the correction.

**Acceptance:** `rg -n "0600|reap|EOF" docs/decision-coverage.md
docs/platform-support.md` every hit is qualified.

### A5. Make the release gate executable (free)

This is the largest code change in the round. Keep it small and dependency-free.

1. Add `scripts/check-release.sh` with `set -euo pipefail` and
   `mkdir -p scratch` (the directory is ignored, but CI may not have it):
   - `npm run build` (so the pack inspection sees `dist/`, even though
     `repro.sh` also builds)
   - `bun scripts/check-claims.ts --strict`
   - `npm pack --dry-run --json > scratch/r31-pack.json`; assert the tarball
     contains `dist/index.js`, `package.json`, `README.md`, `LICENSE`; assert it
     does not contain `src/`, `test/`, `scratch/`, `docs/`, or `.env`.
   - Build a tarball into a temp dir, install it into a fresh temp app with
     `npm install --no-audit --no-fund`, then run
     `npm audit --omit=dev --json > scratch/r31-audit.json || true` **in that
     temp app**; parse `.metadata.vulnerabilities` and fail only if `high > 0`
     or `critical > 0`; print moderate count. This is the clean packed-install
     audit the release page already promises.
   - Import the installed package by its `package.json` name with
     `node --input-type=module`; fail on import error or missing default export.
   - `git diff --check`.
2. Add scripts in `package.json`:
   - `"check:claims:strict": "bun scripts/check-claims.ts --strict"`
   - `"release:check": "bash scripts/check-release.sh"`
3. In `.github/workflows/publish.yml`, run `bash scripts/check-release.sh`
   after `npm ci` and `bash scripts/repro.sh`, and before `npm stage publish`.
   Add `issues: read` and
   `pull-requests: read` permissions and `GH_TOKEN: ${{ github.token }}` to the
   step or job; otherwise `check-claims --strict` cannot read the GitHub rows.
   Keep `id-token: write` only where needed.
4. In `docs/release.md`, replace the eight-item prose list with a table:
   `Gate | Enforced by | Evidence | Owner-only?`. Mark claims strict, audit,
   pack inspect, isolated install, and diff check as enforced. Mark the stage
   approval itself as owner-only.
5. Add the npm stage-only facts to `docs/release.md`:
   - `npm stage publish` does not need 2FA; `npm stage approve` does.
   - a stage-only trusted publisher rejects direct publish.
   - a new trusted-publisher configuration expires if its first successful
     publish is not completed within 2 days.
6. Add rows for:
   - “Muse approval grants are durable”
   - “MCP tools are not sandboxed”
   - “an opencode saved approval never overrides a configured deny”
   Add a row to **both** `docs/claims.md` and `docs/claims.json` only when it
   has a primary-source URL and a real quote and uses an existing checker kind
   (`http`, `github-issue`, or `github-pr`). If no quote exists, put the row in
   `docs/claims.md` only, mark it `manual` with a recheck date, and say it is
   not machine-checked. Do not add a `manual` kind to `claims.json`; the checker
   would treat it as a GitHub row and fail.

**Acceptance:** `bash scripts/check-release.sh` exits 0 on the candidate;
temporarily introducing a high-severity audit entry or a forbidden tarball file
makes it exit non-zero (do this in a throwaway copy, not the candidate).

### A6. Provenance wording (free)

Until E64 passes, replace the claim-bearing wording, not every use of the word:

- `docs/release.md`: “prepared locally, reproducible” → “prepared locally;
  locally reproducible, independent rebuild pending.”
- `docs/provenance.md`: “treat this as reproducible-in-principle” → “treat this
  as locally reproducible; independent rebuild pending.” Leave the generic
  definition sentence (“a reproducible build is a property of verification”)
  alone; it is explaining the standard, not claiming it.

If E64 passes, use “reproduced in a second clean workspace/cache; separate-OS
rebuild pending.” Do not claim independent verification from one machine.

## 2. Experiments

All experiments record: exact commands, versions (`node`, `npm`, `muse`,
`opencode`), start/end time, model/provider, turn count, cost if known, raw
output paths, and limits. Redact secrets.

### E61. Approval scope matrix (≤3 turns, ≤$1.50)

**Question:** Does a Muse `localPersistent` MCP tool grant apply in a second
workspace, and does an opencode `deny` still win over it?

**Setup:**

- `scratch/r31-e61/{config,data,state,cache,ws-a,ws-b}`.
- Isolate mutable XDG dirs. Symlink auth/credential files read-only from the
  real config; never copy secret values into scratch. Record which files were
  symlinked.
- Create a local stdio MCP server named `opencode` exposing a harmless `bash`
  tool that runs `echo r31-e61`. Register it at user scope if supported so both
  workspaces see it; record the exact registration command and scope.
- Project-trust both workspaces. Use a `:ask-me` profile with
  `denyUnmatched`; confirm the profile JSON.
- Use the cheapest configured provider that supports tool calls. Record it.

**Arm A — MCP grant crosses workspaces (2 turns):**

1. In workspace A, run one prompt: “Call the `bash` MCP tool with
   `echo r31-a`, then report.” Choose the approval labeled “Always allow this
   MCP tool” (or the `allow_local_mcp_tool` choice). Record the exact choice.
2. Inspect the isolated policy store. Record path, schema version, rule fields,
   and `toolName`. Confirm no `workspaceRoot`.
3. In workspace B, same prompt and profile. If the tool runs with no Muse
   prompt, the grant crossed workspaces. If Muse prompts, record that and choose
   “Deny once” (do not create a second grant).
4. Record whether the session/turn survives a denied tool.

**Arm C — opencode deny precedence (1 turn, only if A shows a saved rule):**

1. In workspace B, add an opencode `deny` for the exact exposed bridge tool
   name (verify it in `opencode debug config`; likely
   `mcp__opencode__bash`). Record the config.
2. Run the same prompt with the saved Muse rule still present.
3. Record whether the tool is blocked and whether the turn continues or errors.
   A configured deny must win. If it does not, stop and file a security finding.

**Branches:**

- **B1:** grant crosses workspaces → document global MCP scope; do not map
  `localPersistent` to an opencode saved approval; default O31 A.
- **B2:** grant does not cross workspaces → update A2; scope is workspace-local;
  O31 B becomes plausible only with a one-prompt spike.
- **B3:** opencode deny ignored → **stop release**; high-severity product bug.
- **B4:** approval menu absent or tool not exposed → record blocked; no claim.

**Artifact:** `docs/evidence/2026-11-26-r31-e61.json` with `arms`, `store`,
`config`, `turns`, `cost`, `result`, `limits`, `cleanup`.

### E62. Fresh project hook + update re-approval (≤2 turns, ≤$1.00)

**Question:** Does a fresh project-scoped plugin install require approval, and
does changing the hook command re-ask?

1. Isolated store and fresh workspace C. Install the plugin at project scope
   with the documented command; record it.
2. Create a hook that writes a unique marker to a scratch file. Approve the
   plugin. Run one cheap turn; confirm the marker appears.
3. Change the hook command (new marker path). Run `muse plugins inspect`; expect
   `review_needed` (or equivalent). Run a turn; confirm the new marker does
   **not** appear and the old hook does not run.
4. Re-approve. Run a turn; confirm the new marker appears.
5. In a second fresh workspace D, install project-scope but do not approve. Run
   a turn; record whether the hook is blocked or the plugin is untrusted.

**Branches:**

- **B1:** fresh install requires approval and update re-asks → P5 stands with
  fresh evidence; no change.
- **B2:** update does **not** re-ask → security finding; stop release; document
  the exact command and hash.
- **B3:** echo provider does not produce a hook-running turn → record no-turn;
  use one cheap real turn; do not claim a pass from echo.

**Artifact:** `docs/evidence/2026-11-26-r31-e62.json` with `markers`,
`inspect`, `approval`, `workspaceD`, `limits`.

### E55a. Console effect and timing (owner browser, ≤1 turn)

**Question:** Does a Console provider restriction change the model list, and how
long does it take? This is **not** an attribution test.

1. Open the Console; record the current policy count and a full
   `opencode debug config --standalone` hash before any change.
2. Add one provider restriction that denies a currently allowed provider
   (for example `openai`) while leaving another provider available. Record the
   exact statement and its source type.
3. At 0/30/60/90/120 seconds, record:
   - `opencode debug config --standalone` (source count/types, statement);
   - `opencode models` (whether the denied provider's models disappear);
   - any `Model unavailable` text.
4. Delete the statement. Poll until the full config hash returns to baseline.
   Confirm the Console shows no policies.

**Branches:**

- **B1:** model disappears by 60–120s → document effect/timing only.
- **B2:** model remains selectable but calls fail → document the selection
  caveat; do not claim model removal.
- **B3:** no visible change → record; no claim.
- Never infer workspace attribution from a provider restriction.

**Artifact:** `docs/evidence/2026-11-26-r31-e55a.json`.

### E55b. Console tool-deny attribution (owner browser, ≤1 turn)

**Question:** Does a Console tool deny produce a workspace-named denial?

1. Use a scratch file readable only through the tool you deny (for example
   `read`). Add a Console policy denying that tool for the workspace. Record the
   exact statement and source type.
2. Run one prompt: “Use the `read` tool, not bash, to read
   `scratch/r31-e55b/secret.txt`; report the exact error.”
3. Record the exact output. If the model routes around the deny with another
   tool, record that; do not count it as attribution.
4. Delete the policy; poll until the baseline hash returns; confirm no policies.

**Branches:**

- **B1:** output contains `Blocked by <workspace>'s policy` → attribution for
  this shape; update docs with the exact sentence and source type.
- **B2:** generic denial or route-around → no attribution claim.
- **B3:** statement still source `document` → no provenance claim.

**Artifact:** `docs/evidence/2026-11-26-r31-e55b.json`.

### E63. Runtime dependency trace (free)

**Question:** Does the packed entry load the vulnerable `glob`/`minimatch`
subtree at runtime?

1. Build the candidate (`npm run build`).
2. Run a trace of `dist/index.js` with `npx --yes @vercel/nft` (scratch only;
   do not add it to the repo). Record the exact invocation and the traced file
   list.
3. Run `npm ls @opencode/util glob minimatch` and record the paths.
4. Search the traced list for `@opencode/util`, `glob`, `minimatch`, `gaxios`,
   `gcp-metadata`, `rimraf`. Record hits and whether they are reachable from
   the entry.
5. Record the audit counts (25 moderate / 0 high / 0 critical) and the three
   fixable advisories.

**Branches:**

- **B1:** no vulnerable module in the traced entry → O25 A (“no path found”),
  with review date.
- **B2:** vulnerable module traced → owner O35; do not claim “not reachable.”
- **B3:** trace tool fails → keep static graph; record the limitation.

**Artifact:** `docs/evidence/2026-11-26-r31-e63.json`.

### E64. Second clean builder (free)

**Question:** Does a fresh checkout, `HOME`, and npm cache produce the same
`dist/` and tarball bytes?

1. Commit the candidate locally on `round-31` first (F1). Record the commit.
2. `git archive HEAD` into `scratch/r31-e64/src`. Fresh `HOME`, `npm_config_cache`,
   and `TMPDIR` under `scratch/r31-e64`.
3. `npm ci`, `npm run build`, `npm pack --pack-destination ...`.
4. Compute:
   - SHA-256 of `dist/index.js`;
   - sorted per-file SHA-256 of `dist/`, hashed once;
   - SHA-256 of the `.tgz`;
   - `node -v`, `npm -v`, `uname -a`.
5. Compare with the same commands run in the candidate worktree. If hashes
   differ, `diff -r` the two `dist/` trees and record the first difference.

**Branches:**

- **B1:** dist and tarball match → A6 wording “second clean workspace/cache;
  separate-OS rebuild pending.”
- **B2:** mismatch → investigate; do not claim reproducibility; record the
  diff. Do not release until explained.
- **B3:** `npm ci` fails in the clean copy → record; use `npm ci --ignore-scripts`
  only if the build does not need lifecycle scripts, and say so.

**Label:** same OS/toolchain. This is not an independent builder and does not
support “independently reproduced.”

**Artifact:** `docs/evidence/2026-11-26-r31-e64.json`.

### E60. Stage and reject (free + owner 2FA)

**Preconditions:** A1–A6 done, E61/E62/E63/E64 done, candidate committed,
E64 pass, owner present for 2FA. If any precondition fails, record blocked.

1. Confirm the package version is the intended candidate and that `0.1.13` is
   not already public (`npm view <pkg> versions --json`). Check
   `npm stage list --json`; if a stage for `0.1.13` already exists, stop and
   report it rather than creating a duplicate.
2. Run `npm pack --dry-run` and `bash scripts/check-release.sh`.
3. If the workflow supports it, run `npm stage publish --dry-run`; record the
   output. Do not substitute a direct `npm publish`.
4. Push only the `round-31` branch. Dispatch `publish.yml`; it runs
   `npm stage publish`. Record the run URL.
5. `npm stage list --json`; record the stage ID, package, version, and time.
6. `npm stage download <stage-id> <dir>`; compare the downloaded tarball SHA-256
   with the candidate tarball. If they differ, **reject** and record mismatch.
7. `npm stage reject <stage-id>`. Do **not** run `npm stage approve`.
8. Verify `npm view <pkg> versions --json` and `dist-tags` show no new public
   version. Record the stage list after rejection.
9. Record the 2FA boundary: stage publish and reject did not require approval;
   approval is documented but unmeasured. Record the stage-only config date and
   the 2-day expiry note.

**Branches:**

- **B1:** stage created, digest matches, reject succeeds, no public version →
  O22 A remains partial: stage/reject verified; approval path documented, not
  measured.
- **B2:** digest mismatch → reject; no release; investigate.
- **B3:** stage-only config rejects direct publish, as documented → record; do
  not attempt a direct publish to test it.
- **B4:** blocked by 2FA or permissions → record; leave unpublished; do not
  approve.

**Artifact:** `docs/evidence/2026-11-26-r31-e60.json` with `stageId`,
`tarballHash`, `candidateHash`, `reject`, `publicVersions`, `2fa`, `limits`.

## 3. Pre-committed decisions

These are decided by results, not by a meeting. Record the branch taken in the
artifact and in `docs/decision-evidence.md`.

| ID | Trigger | Decision |
|---|---|---|
| D241 | E55 baseline recheck | The artifact is corrected by addendum; no Console claim follows from E55. |
| D242 | E57 scope | Document Muse MCP grants as user-store/cross-workspace; do not equate them with opencode project-scoped approvals. O16 B stays unbuilt unless E61 B2 and a one-prompt spike pass. |
| D243 | E61 B1 | MCP grant is global; no `localPersistent` mapping; O31 default A. |
| D244 | E61 B2 | MCP grant is workspace-scoped; update A2; O31 B becomes possible only with a one-prompt spike. |
| D245 | E61 B3 | opencode deny is ignored by a saved Muse rule → stop release; high-severity finding. |
| D246 | E62 B1/B2 | Fresh install/update re-approval holds, or it does not; B2 stops release. |
| D247 | E55a B1/B2/B3 | Record effect/timing shape only; no attribution. |
| D248 | E55b B1/B2 | Attribution only with the exact workspace-named sentence; otherwise no claim. |
| D249 | E63 B1/B2 | No runtime path → O25 A with review date; path → owner O35. |
| D250 | E64 B1/B2 | Match → second-clean-builder wording; mismatch → no release claim. |
| D251 | E60 B1/B2 | Stage/reject verified → O22 A partial; mismatch → reject and investigate. |

## 4. Owner choices after the experiments

Only these need the owner. Defaults are pre-committed so execution does not
wait.

### O31. Approval posture (product/security; default A)

- **A. Keep `allowAll`; document global MCP grants.** No new code. Recommended
  unless E61 B2 and a one-prompt spike pass.
- **B. Build O16 B with `once`/`session` only.** No `localPersistent` mapping.
  Requires a one-prompt spike and a denial test.
- **C. Build O16 B and map `localPersistent` with a global warning.** Not
  recommended.

### O32. Console wording (product; default A)

- **A. Effect/timing only.** Recommended.
- **B. Attribution for the tool-deny shape** if E55b B1 produces the exact
  sentence.
- **C. No Console claim.** Fallback if E55a/b are blocked.

### O33. Release-gate strictness (implementation; default A)

- **A. Enforce all gates in CI.** Recommended.
- **B. Owner checklist.** Not recommended.

### O34. Reproducibility claim (product/trust; default B)

- **A. Single-builder label.** Honest, no new work.
- **B. Second clean builder.** Recommended if E64 is cheap; still not
  independent OS.

### O35. Dependency risk (owner risk; default A)

- **A. Accept moderate with runtime trace and review date.** Recommended if E63
  B1.
- **B. Block on moderate.** Safest, currently unshippable.
- **C. Refactor `@opencode/plugin` to peer/remove subtree.** Long-term.

### O36. Windows desktop (product scope; default A)

- **A. Retire the desktop claim.** Current O27 C. Recommended.
- **B. Test on a real standard-user Windows 11 machine.** Reopens E59.
- **C. Best-effort hosted runner.** Not recommended; not a desktop.

### O37. Stage proof (release/security; default A)

- **A. Stage/reject only.** Recommended; approval path remains documented, not
  measured.
- **B. Approve a disposable prerelease to observe 2FA.** Publishes a version;
  needs a separate release decision.
- **C. No rehearsal.** Not recommended.

## 5. Execution order

1. A1–A6 (free).
2. E62 (cheap) and E63 (free).
3. E61 (paid cap), E55a/E55b (owner browser).
4. Update docs/evidence with results; resolve D241–D251.
5. Run `npm test` and `bash scripts/check-release.sh`; fix failures.
6. Commit candidate locally (F1).
7. E64 clean builder (needs the commit).
8. E60 stage/reject (owner 2FA; push branch only).
9. F: reconcile, run final checks, commit, report.

If the owner is unavailable for E55a/E55b or E60, run everything else and mark
those blocked. Do not substitute a weaker test.

## 6. Verification

Run from the repo root, preserving exit status:

```bash
npm test
bun scripts/check-claims.ts --strict
bash scripts/check-release.sh
bash scripts/repro.sh
npm pack --dry-run
git diff --check
```

Record exact pass/fail counts, repro hash, tarball hash/file count, and commit.
If `npm test` is the 452-pass suite, report it as such; do not claim more.

Also assert:

- `git status --short` does not include `docs/integration-landscape.md` as
  staged.
- No evidence file contains a token, key, or auth value.
- Every new evidence file has `experiment`, `date`, `commands`, `observations`,
  `limits`, and `artifacts`.
- Parent artifacts are unchanged (`git diff --exit-code` for them).

## 7. Stop conditions

Stop and report, do not improvise, if:

- E61 B3: a saved Muse rule overrides an opencode `deny`.
- E62 B2: a changed hook runs without re-approval.
- E64 B2: dist/tarball mismatch is unexplained.
- E60 digest mismatch, or any step would approve/publish/tag.
- An experiment exceeds its turn/cost cap.
- A command would touch the real Muse config or real approval store.
- A secret would be written to an artifact.

## 8. Final report format

1. Status table (A/E/F, done/blocked/failed).
2. Branches taken (D241–D251) and why.
3. Checks with exact outputs.
4. Candidate commit, repro hash, tarball hash.
5. Owner choices O31–O37 with defaults and any changed recommendation.
6. Blocked items (E59, E60 if no 2FA) and what would unblock them.
7. Files changed and files intentionally left unstaged.
