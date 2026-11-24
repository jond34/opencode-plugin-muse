# Round 32 plan: decide the release from the trust path

**Code base** `9cffa53` (`round-31`). **Plan commit** on `round-32`.
**Run date** 2026-11-23.
**Artifact prefix** `2026-11-26-r32` for sort consistency; each artifact records
the real run date inside.

Round 31 stopped the release on E62 B2: a changed Muse plugin hook ran after
`muse plugins update` without re-approval. Round 32 does not assume the stop was
either sufficient or permanent. It answers three questions, in order:

1. Is E62 the documented one-time legacy amnesty, or a recurring update bypass?
2. Does it reach this plugin’s private `muse serve` host, which does not copy the
   user’s Muse settings?
3. If it reaches the host, does the owner want a code gate, a documented caveat,
   a vendor wait, or a release hold?

Only after that does it run the deferred E61, E55a/E55b, E64, and E60. No feature
work is in scope except a possible `plugin`-origin hook gate, and that is a
pre-committed product branch, not a redesign.

## Status ledger

| ID | Work | Cost | Status | Output |
|---|---|---|---|---|
| A0 | Research, this plan, prompt, status | free | done | `docs/round-32-*.md` |
| A1 | Release-fact corrections (reject 2FA, provenance, stage-only) | free | pending | `docs/release.md`, `docs/claims.md` |
| A2 | P5/approval wording addendum | free | pending | `docs/approval.md`, coverage/audit rows |
| A3 | Hook-gate decision note | free | pending | `src/hooks.ts` comment or code, `docs/decision-coverage.md` |
| A4 | Release-gate negative tests | free | pending | `scratch/r32-gate/`, evidence note |
| A5 | Provenance/stage evidence | free | pending | `docs/evidence/2026-11-26-r32-e60.json` |
| E65 | E62 reachability and amnesty flag | free, 2 echo turns | pending | `docs/evidence/2026-11-26-r32-e65.json` |
| E61 | Approval scope matrix | ≤3 turns / ≤$1.50 | pending | `docs/evidence/2026-11-26-r32-e61.json` |
| E55a | Console effect/timing | owner browser, ≤1 turn | pending | `docs/evidence/2026-11-26-r32-e55a.json` |
| E55b | Console tool-deny attribution | owner browser, ≤1 turn | pending | `docs/evidence/2026-11-26-r32-e55b.json` |
| E64 | Second clean builder | free | pending | `docs/evidence/2026-11-26-r32-e64.json` |
| E60 | Stage and reject | owner 2FA at reject | pending | `docs/evidence/2026-11-26-r32-e60.json` |
| F | Reconcile docs, checks, commit, report | free | pending | commit on `round-32` |

E59/Windows desktop remains blocked. Do not run a substitute and call it a
desktop test.

## 0. State and guardrails

- Work in this repo. Scratch: `scratch/r32-*` (ignored).
- Keep live state in `docs/round-32-status.md`. Do not rewrite this plan or the
  research file to hide a result; append dated status and artifacts.
- Use `zsh -lc` for `muse` and anything needing `~/.zshenv`; use `bash` for repo
  scripts that already use bash.
- Do not edit or stage `docs/integration-landscape.md` (owner file).
- Do not rewrite any existing evidence artifact. Add a new file with
  `supersedes` / `addendumTo` fields.
- Do not copy auth tokens or secret values into evidence. Redact values; record
  paths and hashes.
- Do not touch the real Muse config, approval store, or trust store. Every
  experiment uses isolated `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`,
  and `XDG_CACHE_HOME`; symlink `auth.json` read-only if a real model turn is
  needed.
- Do not approve a stage, publish, tag, create a GitHub release, or push a tag.
  E60 may push only `round-32` if needed to dispatch the workflow, and may reject
  a stage. That is the only push authorization in this round.
- E60 reject requires 2FA. Do not call it unattended; if the owner is not
  present, record blocked.
- If any command would make `0.1.13` public, stop.
- Commit only the round-32 files. Leave the owner file unstaged.

## 1. Documentation and evidence corrections

### A1. Correct the release facts (free)

1. In `docs/release.md`, correct the stage table:
   - `npm stage publish`: no 2FA;
   - `npm stage approve`: 2FA;
   - `npm stage reject`: **2FA**.
   Remove any sentence that says reject is unattended.
2. Add a short “What is verified when” table:
   - candidate tarball: local pack + SHA-256;
   - staged tarball: `npm stage download` + SHA-256;
   - provenance: generated at public publish, not verifiable before approval;
   - public version: `npm view` after approval only.
3. Add the trusted-publisher facts:
   - stage-only is an owner-side setting; the workflow only calls
     `npm stage publish`;
   - a new trusted-publisher configuration expires after 2 days without a first
     successful publish;
   - the repo is PUBLIC, so provenance is not blocked by repository visibility;
   - do not add `--provenance`; trusted publishing generates it automatically.
4. In `docs/claims.md`, add a manual row only if no HTTP/GitHub quote exists:
   “npm stage reject requires 2FA” with the npm CLI URL and a recheck date. Do
   not add a `manual` kind to `claims.json`.

**Acceptance:** `rg -n "reject|provenance|2FA" docs/release.md` finds no
sentence that says reject is unattended or that a staged package has verified
provenance.

### A2. P5 and approval wording (free)

Do not change P5 until E65 reports. The E62 addendum stays.

1. In `docs/approval.md`, replace “Treat a plugin hook approval as fresh-install
   evidence” with a three-row table:
   - fresh install: approval required (E62);
   - update with the amnesty flag absent: bypass observed (E62);
   - update with the flag set, and private host: fill from E65.
2. In `docs/decision-coverage.md`, keep the P5 row at P until E65. If E65 H1/H2,
   the row can say “fresh install holds; update bypass is a Muse migration bug
   outside this plugin’s private host; P5 stays P for the general
   `plugin`-origin claim.” If E65 H3, keep P and add the code branch.
3. In `docs/evidence-audit.md`, add the E65 row and the “private host vs user
   store” distinction.

**Acceptance:** no sentence claims an update re-asks without naming the flag or
the private-host result.

### A3. Hook-gate decision note (free)

1. Update the `src/hooks.ts` header comment only after E65:
   - current: “a plugin row is allowed … approval is keyed to the capability
     definition hash”;
   - new: name E62’s update gap and E65’s reachability result. Do not say
     “keyed to the hash” without the update caveat.
2. If E65 H3 or the owner chooses P1 B, implement the smallest gate:
   - add `plugin` to `BLOCKING_KINDS`;
   - add `MUSE_ALLOW_PLUGIN_HOOKS=1` for one run (or reuse the existing
     `MUSE_ALLOW_PROJECT_HOOKS` name only if the semantics are identical; they
     are not, so use a separate variable);
   - extend `test/hook-gate.test.ts` with a plugin-origin refusal and the env
     override.
   No other behavior change.
3. If E65 H1/H2 and P1 A, make no code change; only the comment and docs.

**Acceptance:** `bun test test/hook-gate.test.ts` passes; if code changed,
`npm test` passes and the doctor prints the plugin origin as before.

### A4. Release-gate negative tests (free)

The gate passed, but its failure branches were never exercised. Do this in a
throwaway copy, never the candidate:

1. `git archive HEAD` into `scratch/r32-gate/src`; copy `scripts/`,
   `package.json`, `package-lock.json`, `tsconfig.json`, and symlink
   `node_modules` from the checkout.
2. Add `src/forbidden.txt` and append `"src"` to `files`; run
   `bash scripts/check-release.sh`; expect non-zero at pack inspection.
3. Put a fake `npm` earlier on `PATH` that delegates every command except
   `audit --omit=dev --json`, where it prints a synthetic report with
   `high: 1`; run the gate; expect non-zero at the audit assertion.
4. Record the exact failure text and exit codes in
   `docs/evidence/2026-11-26-r32-gate.json`.
5. Do not commit the throwaway copy.

**Acceptance:** both negative cases fail closed; the normal gate still passes.

### A5. Provenance and stage evidence (free)

Before E60, record:

- `npm view @jonathand34/opencode-plugin-muse@0.1.12 dist.attestations --json`
  (does the current release have an attestation?);
- `npm view @jonathand34/opencode-plugin-muse dist-tags --json` (no 0.1.13);
- `npm stage list --json` (no existing 0.1.13 stage);
- `gh repo view --json visibility` (PUBLIC).

If the 0.1.12 attestation is absent, say so; it does not prove the next publish
will lack one, but it removes a false “provenance already works” claim.

## 2. Experiments

All experiments record: exact commands, versions (`node`, `npm`, `muse`,
`opencode`), start/end time, model/provider, turn count, cost if known, raw
output paths, and limits. Redact secrets.

### E65. E62 reachability and amnesty flag (free; 2 echo turns)

**Question:** Is E62 the one-time legacy migration, does it recur, and does it
reach this plugin’s private `muse serve` host?

**Setup:**

- `scratch/r32-e65/{store-a,store-b,ws-a,ws-b,private-config}`.
- Reuse the E62 probe plugin shape: `e65-probe` 0.1.0, SessionStart hook that
  writes `marker-a.txt`; changed hook writes `marker-b.txt`.
- Isolate all XDG dirs. Seed `trust.json` for each workspace before install.
- Record the exact Muse version and binary SHA-256.
- Do not use the real store.

**Arm A — flag set before the fresh approval (1 echo turn):**

1. In `store-a/config/muse/settings.json`, write the **pair** E62 records after
   migration, before any install:

   ```json
   {
     "schema_version": 1,
     "legacy_hook_trust_amnesty_applied": true,
     "runtime_capabilities": {
       "legacy_hook_trust_amnesty_applied": {
         "enabled": false,
         "trusted_definition_hash": "tbh:amnesty-applied:v1"
       }
     }
   }
   ```

   Record the file hash. The top-level boolean alone may not suppress the
   migration; the sentinel row is the state E62 wrote.
2. Install project-scope, inspect (`review_needed`), approve, run one echo turn;
   confirm marker A. Record whether Muse rewrites either flag part.
3. Change only the hook command; `muse plugins update`; inspect.
4. Run one echo turn. Record marker A/B, inspect status, settings hash, and
   whether `legacy_hook_trust_amnesty_applied` stays true.
5. Expected if the flag is the migration guard: inspect `modified`, no marker B,
   hash unchanged until approval.

**Arm B — flag absent control (no new turn):**

Use E62’s recorded run as the control. Do not repeat it unless Arm A’s setup
differs in a way that makes comparison invalid; record why.

**Arm C — private host (free; no model turn):**

1. Use the approved plugin from Arm A in `store-a/data`, but write a private
   `XDG_CONFIG_HOME` like `writeMuseHostConfig()`: `schema_version`, `run`,
   `runtime_capabilities` only for the six reminders, no e65 approval entry.
2. Point `XDG_DATA_HOME` at `store-a/data` so the plugin package/record is
   visible; keep `XDG_STATE_HOME`/`CACHE` isolated.
3. Run `muse exec --json --provider echo --trust-workspace` with the private
   config. Record whether marker A runs.
4. If it does not, run `muse plugins approve e65-probe` under the private config
   (this is the only way to make the private host's approval explicit), then
   update the hook and run again. Record whether marker B runs without a new
   approval.
5. If possible, use a small `muse serve` client to call `hook/list` and record
   the `plugin` row's `enabled`/`key`; do not expect a trust status, because the
   SDK type has none.

**Branches:**

- **H1:** flag true prevents the amnesty, and the private host does not run the
  user-approved plugin hook → E62 is a Muse migration bug outside this host;
  release may resume after E64/E60, with P5 corrected.
- **H2:** flag true does not prevent the amnesty (recurring bypass), but the
  private host is inert → Muse-wide bug, no code gate yet; release may resume
  with a caveat and a watch item, or hold at owner discretion.
- **H3:** the private host runs the updated plugin hook without a new approval →
  E62 reaches this plugin; stop and choose P1 B (block) or hold.
- **H4:** the private host does not run even an approved plugin hook → record
  that the private config is inert for plugin hooks; the gate is defense in
  depth, not a live path.
- **H5:** probe cannot run (echo hook does not fire, install fails) → record
  blocked; no claim.

**Artifact:** `docs/evidence/2026-11-26-r32-e65.json` with `arms`, `settings`,
`markers`, `inspect`, `privateHost`, `hookList`, `result`, `limits`.

### E61. Approval scope matrix (≤3 turns / ≤$1.50)

Run the Round 31 E61 design, with one correction: the MCP server must be created
for the test, not assumed.

1. `scratch/r32-e61/{config,data,state,cache,ws-a,ws-b}`; symlink `auth.json`
   read-only; do not copy secrets.
2. Write a 20-line Node stdio MCP server exposing one tool, `bash`, which
   executes only `echo r32-e61` and returns stdout. No dependency.
3. Register it at user scope with
   `muse mcp add opencode -- <node> <server.mjs>`; record `muse mcp list --json`.
4. Project-trust both workspaces; use a `:ask-me` profile with
   `denyUnmatched`; record the profile.
5. Arm A: in workspace A, call the tool, choose “Always allow this MCP tool”;
   record the exact choice and the store rule. Confirm no `workspaceRoot`.
6. In workspace B, same prompt/profile. If it runs without a Muse prompt, the
   grant crosses workspaces. If it prompts, deny once; do not create a second
   grant. Record whether the turn survives.
7. Arm C (only if A shows a saved rule): in workspace B, add an opencode `deny`
   for `mcp__opencode__bash`; run the same prompt. A configured deny must win.
8. Record store path/schema, rule fields, turns, cost, and cleanup.

**Branches:**

- B1: grant crosses workspaces → O31 A; no mapping to an opencode saved
  approval.
- B2: grant is workspace-local → update A2; O31 B becomes plausible only with a
  one-prompt spike.
- B3: opencode deny ignored → **stop release**; high-severity finding.
- B4: menu/tool absent → blocked; no claim.

**Artifact:** `docs/evidence/2026-11-26-r32-e61.json`.

### E55a. Console effect and timing (owner browser, ≤1 turn)

Use the Round 31 protocol, with the vendor-doc expectation recorded first:
Console changes apply on the next fetch, about once a minute; a provider deny
removes the model before an action.

1. Record baseline `opencode debug config --standalone` hash, source count/types,
   `opencode models`, and the Console policy count.
2. Add one provider restriction that denies a currently allowed provider while
   leaving another available. Record the exact statement and the connected
   workspace.
3. At 0/30/60/90/120 seconds, record config source/types, statement presence,
   model list, and any error text.
4. Delete; poll to baseline; confirm no policies.
5. Do not infer workspace attribution from a provider restriction.

**Branches:** B1 model disappears by 60–120s → O32 B (effect/timing only);
B2 model stays selectable but calls fail → selection caveat; B3 no visible
change → no claim; B4 blocked (no owner browser) → O32 C.

**Artifact:** `docs/evidence/2026-11-26-r32-e55a.json`.

### E55b. Console tool-deny attribution (owner browser, ≤1 turn)

1. Add a Console policy denying `read` for the workspace; record the exact
   statement and source.
2. Run: “Use the `read` tool, not bash, to read
   `scratch/r32-e55b/secret.txt`; report the exact error.”
3. Record the exact output. Route-around is not attribution.
4. Delete; poll to baseline; confirm no policies.

**Branches:** B1 exact `Blocked by <workspace>'s policy` → O32 C (attribution for
this shape); B2 generic denial or route-around → no attribution; B3 statement
still `document` → no provenance claim; B4 blocked.

**Artifact:** `docs/evidence/2026-11-26-r32-e55b.json`.

### E64. Second clean builder (free)

Precondition: candidate committed on `round-32` (F1) after A1–A5 and E65/E61.

1. `git archive HEAD` into `scratch/r32-e64/src`.
2. Fresh `HOME`, `npm_config_cache`, and `TMPDIR` under `scratch/r32-e64`.
3. `npm ci`, `npm run build`, `npm pack --pack-destination ...`.
4. Compare:
   - `dist/index.js` SHA-256;
   - sorted per-file `dist/` digest;
   - tarball SHA-256;
   - file count and `node -v`, `npm -v`, `uname -a`.
5. Compare with the same commands in the candidate worktree. On mismatch,
   `diff -r` and record the first difference.

**Branches:** B1 match → A6 wording “second clean workspace/cache; separate-OS
rebuild pending”; B2 mismatch → investigate, no release; B3 `npm ci` fails →
record, use `--ignore-scripts` only if the build does not need them and say so.

**Artifact:** `docs/evidence/2026-11-26-r32-e64.json`.

### E60. Stage and reject (owner 2FA at reject)

Preconditions: E65 is H1/H2/H4 (not H3), E61 is not B3, E64 is B1, candidate
committed, owner present for reject 2FA.

1. `npm view <pkg> versions --json`; `npm stage list --json`; stop if 0.1.13 is
   public or a stage already exists.
2. `npm pack --dry-run`; `bash scripts/check-release.sh`.
3. Push only `round-32`; dispatch `publish.yml`; record the run URL and
   `npm stage list --json`.
4. `npm stage download <stage-id> <dir>`; compare SHA-256 with the candidate.
5. `npm stage view <stage-id> --json`; record whether provenance/attestation
   metadata is present. Do not claim it if absent.
6. `npm stage reject <stage-id>` with the owner’s 2FA. Do not approve.
7. Verify `npm view <pkg> versions --json` and `dist-tags` show no 0.1.13.
8. Confirm the stage list no longer holds the stage.

**Branches:** B1 stage created, digest matches, reject succeeds, no public version
→ O37 A partial (reject verified; approval/provenance unmeasured); B2 digest
mismatch → reject, investigate; B3 stage-only config rejects direct publish →
record, do not test a direct publish; B4 blocked by 2FA/permissions → record,
leave unpublished.

**Artifact:** `docs/evidence/2026-11-26-r32-e60.json` with `stageId`,
`tarballHash`, `candidateHash`, `stageView`, `reject`, `publicVersions`, `2fa`,
`limits`.

## 3. Pre-committed decisions

These are decided by results, not a meeting. Record the branch in the artifact
and in `docs/decision-evidence.md`.

| ID | Trigger | Decision |
|---|---|---|
| D252 | E65 H1 | Flag true prevents the amnesty and the private host is inert; correct P5, resume release after E64/E60. |
| D253 | E65 H2 | Recurring bypass but private host inert; resume only with a caveat/watch item, or hold at owner discretion. |
| D254 | E65 H3 | Bypass reaches the private host; stop and gate `plugin` origins or hold. |
| D255 | E65 H4 | Private host inert for approved plugin hooks; no live path, but keep the gate claim honest. |
| D256 | E61 B1/B2/B3 | Cross-workspace → O31 A; workspace-local → O31 B spike; opencode deny ignored → stop release. |
| D257 | E55a B1/B2/B3/B4 | Effect/timing only, selection caveat, no claim, or blocked. |
| D258 | E55b B1/B2/B3/B4 | Attribution only with the exact sentence; otherwise no claim. |
| D259 | E64 B1/B2 | Match → second-clean-builder wording; mismatch → no release claim. |
| D260 | E60 B1/B2/B3/B4 | Reject verified → O37 A partial; mismatch → reject; blocked → hold. |
| D261 | E65 + E64 + E60 | Release resumes only if the trust path, builder, and stage/reject all pass; otherwise hold. |

## 4. Owner choices

### O31. Approval posture (product/security; default A)

- **A. Keep `allowAll`; document the Muse MCP grant.** No new code. Recommended
  if E61 B1.
- **B. Build O16 B with `once`/`session` only.** Requires E61 B2 plus a
  one-prompt spike and a denial test.
- **C. Map `localPersistent` with a global warning.** Not recommended.

### O32. Console wording (product; default A)

- **A. Effect/timing only** if E55a B1.
- **B. Attribution for the tool-deny shape** if E55b B1.
- **C. No Console claim** if E55a/E55b are blocked.
- **D. Vendor-doc note** only: label it as vendor documentation, not local
  measurement. This is the fallback if the owner browser is unavailable.

### O33. Release-gate strictness (implementation; default A)

- **A. Enforce all gates in CI, and add the negative tests.** Recommended.
- **B. Owner checklist.** Not recommended.

### O34. Reproducibility claim (product/trust; default B)

- **A. Single-builder label.** Honest if E64 is not run.
- **B. Second clean builder.** Recommended if E64 B1; still not an independent
  OS/toolchain.
- **C. Separate builder/CI container.** Stronger; out of scope unless E64 B2.

### O35. Dependency risk (owner risk; default A)

- **A. Accept moderate with the trace and a review date.** Recommended if E63
  B1; E65 does not change it.
- **B. Block on moderate.** Safest, currently unshippable.
- **C. Remove/peer the `@opencode/plugin` subtree.** Long-term.

### O36. Windows desktop (product scope; default A)

- **A. Retire the desktop claim.** Recommended; E59 remains blocked.
- **B. Test on a real standard-user Windows 11 machine.** Reopens E59.
- **C. Hosted runner.** Not a desktop; not recommended.

### O37. Stage proof (release/security; default A)

- **A. Stage/reject only, with owner 2FA at reject.** Recommended. Approval and
  provenance remain documented, not measured.
- **B. Approve a disposable prerelease to observe approval 2FA and provenance.**
  Publishes a version; separate release decision.
- **C. No rehearsal.** Not recommended.

### P1. `plugin`-origin hook posture (product/security; after E65)

- **A. Keep allow; correct the claim and warn.** Default unless E65 H3.
- **B. Block `plugin` origins until a person records them.** Recommended if E65
  H3; requires a new record or env switch because `hook/list` has no hash.
- **C. Warn only.** Weakest; no new refusal.

### P2. Release under E62 (owner risk; after E65)

- **A. Resume with a documented caveat** if E65 H1/H2/H4 and E64/E60 pass.
- **B. Hold for a vendor fix** if E65 H2 and the caveat is not acceptable, or
  E65 H3 without a code gate.
- **C. Resume only with a code gate** if E65 H3 and P1 B.

### P3. Provenance proof (release/trust; after E60)

- **A. Accept “not verifiable before approval”** and keep stage/reject.
  Recommended; no public artifact.
- **B. Approve a disposable prerelease** to verify provenance and approval 2FA.
  Separate release decision; publishes a version.

### P4. Console claim (product; after E55)

- **A. Measured effect/timing or attribution** if E55a/E55b pass.
- **B. Vendor-doc note** if blocked; clearly labeled, no local claim.
- **C. No Console claim.** Safest fallback.

## 5. Execution order

1. A1–A5 (free).
2. E65 (free; two echo turns).
3. If E65 H3: stop and report, or implement P1 B only if the owner pre-approves
   the code branch. Do not run E64/E60 on a reachable bypass.
4. E61 (paid cap).
5. E55a/E55b if the owner browser is available; otherwise mark blocked and use
   O32 D.
6. Run `npm test`, strict claims, `check-release.sh`, `repro.sh`, `pack`,
   `diff --check`.
7. Commit the candidate on `round-32` (F1).
8. E64.
9. E60 with owner 2FA at reject.
10. Reconcile docs and evidence; final checks; commit; report.

## 6. Stop conditions

Stop and report, do not improvise, if:

- E65 H3 and no owner-approved code gate.
- E61 B3: a saved Muse rule overrides an opencode `deny`.
- E64 B2: dist/tarball mismatch is unexplained.
- E60 digest mismatch, a stage would be approved, or the owner is absent for
  reject 2FA.
- An experiment exceeds its turn/cost cap.
- A command would touch the real Muse config or real approval store.
- A secret would be written to an artifact.
- Any command would publish/tag or make `0.1.13` public.

## 7. Verification

Run from the repo root, preserving exit status:

```bash
npm test
bun scripts/check-claims.ts --strict
bash scripts/check-release.sh
bash scripts/repro.sh
npm pack --dry-run
git diff --check
```

Also assert:

- `git status --short` does not include `docs/integration-landscape.md` as
  staged.
- No evidence file contains a token, key, or auth value.
- Every new evidence file has `experiment`, `date`, `commands`, `observations`,
  `limits`, and `artifacts`.
- Parent artifacts are unchanged (`git diff --exit-code` for them).
- The gate negative tests failed closed in the throwaway copy.

## 8. Final report format

1. Status table (A/E/F, done/blocked/failed).
2. E65 hypothesis taken (H1–H5) and why.
3. Branches taken (D252–D261) and why.
4. Checks with exact outputs.
5. Candidate commit, repro hash, tarball hash, stage/reject result.
6. O31–O37 and P1–P4 with current recommendations.
7. Blocked items and what would unblock them.
8. Files changed and files intentionally left unstaged.
