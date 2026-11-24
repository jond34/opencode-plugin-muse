# Round 28 plan: close the last cells, then decide what ships

**Written** 2026-11-24, on branch `round-28` off `round-27` (`332a400`). The
owner approved every experiment on 2026-11-24 and asked for this plan. This file
is the state: update the status table after every item, and write results in §8
before moving on. Scratch output stays in `scratch/`; evidence that must outlive
the artifacts goes in `docs/evidence/`.

The round has one rule: **do not add a mechanism to answer a documentation
question.** Only E48 can change code, and only if its result says the plugin
should offer a second approval posture. Everything else is a measurement, a
sentence, or a release gate.

## Status

| Item | State | Commit / run | Note |
|---|---|---|---|
| A1. E44 premise correction | done | `69c6dfc` | Auto-review vs Ask me; no past evidence rewrite |
| A2. Release status paragraph | done | `69c6dfc` | current tree is unreleased; npm latest 0.1.12 |
| E48. Saved MCP rule under `:ask-me` | done | `docs/evidence/2026-11-25-e48.json` | D194; 4 turns across 3 attempts (selector repair) |
| E49. Console denial sentence | done | `docs/evidence/2026-11-25-e49.json` | D201; generic `Model unavailable`; no Console-typed source |
| E50. Windows desktop | blocked | | owner-assisted; no desktop JSON yet |
| R1. Release readiness audit | done | `docs/evidence/2026-11-25-r1.json` | D208; dist hash stale, no rebuild |
| C. Results and choices | done | final commit | §8, §9 |
| O. Owner choices | done | defaults applied | O15/O16/O17 A; O18–O20 A; no live reply required |

---

## 0. State at handoff

- Branch `round-28`, HEAD `332a400` plus this round's docs. `main` is untouched.
- `docs/integration-landscape.md` is the owner's uncommitted file: never stage
  or edit it. `git status` is expected to show it.
- Baseline: `npm run check:offline` is 452 pass / 0 fail / 41 files;
  `bun scripts/check-claims.ts` is 17/17. Re-run both before changing code.
- npm latest is 0.1.12. This tree carries patches 3–5, which no published
  tarball carries; `docs/provenance.md` records a hash for `bcfabcb` and says
  `scripts/repro.sh` fails until the recorded hash is refreshed.
- Constraints: never commit to `main`; never tag, publish or submit; run `gh`,
  `muse` and `opencode` under `zsh -lc`; no new dependency; scratch in `scratch/`.
- Do not add `timeout-minutes` to hide a queue. Do not raise a test timeout
  without naming the consuming segment in the same commit.

The owner has approved the experiments; do not ask permission to run one. Ask
only if O15 or O17 is live and the default would change what a user is promised.
Batch that into one message with a recommendation.

---

## 1. Workstream A — documentation that needs no experiment

One commit, before the experiments, so a later result edits only its own row.

### A1. Correct the E44 premise in the current record

`docs/decision-coverage.md` row C currently says E44 found no approval offered
and no policy store, and that the bridge still needs `allowAll`. Add the missing
condition, without changing the result:

> E44 ran its first session on the host's default **Auto-review** permission
> profile, not Ask me. Auto-review lets Muse's judge clear an eligible MCP call,
> so "no approval offered" does not show that MCP tool approvals are unavailable.
> E48 selects `:ask-me` with `requirePermissionProfile` and repeats the question.
> Until E48, the saved-rule half stays unmeasured, not answered.

Do the same in `src/session.ts` only if the absolute appears there and would now
be false. Do not edit `docs/evidence/2026-11-24-e44.json`; a past result is not
rewritten, it gets an addendum in the new evidence file.

### A2. State the release status where a reader looks

`docs/provenance.md` already says the tree's hash is stale. Add one sentence
next to it:

> The current tree is unreleased. The latest npm tarball is 0.1.12; patches 3–5
> exist only in this checkout, and a 0.1.13 release is a separate owner decision
> (O15), not an implication of a green suite.

Do not bump `package.json`; do not rebuild `dist/`; do not run `npm publish`.

### A3. Leave the Windows and Console sentences alone

E45's job-object sentence is already a runner result. E43's Console arm is
already marked unmeasured. A1 is the only correction this round needs before the
experiments. If a result changes one of those sentences, edit it in the same
commit as the result, not here.

**Acceptance for A:**

```bash
rg "E44 found no approval offered|Auto-review|E48" docs/decision-coverage.md src/session.ts README.md
git diff --check
```

The only `E44 found no approval offered` hit allowed is quoted history in
`docs/round-27-plan.md`, `docs/round-27-research.md`, or the evidence file. Commit:
`docs: correct the E44 approval premise and state the release status`.

---

## 2. Experiments

Each entry: question, method, branches, action, cost, artifact. Branch actions
are pre-committed. Owner choices are only §6's `O#`; everything else is applied.

### E48 — does an MCP tool approval exist under Ask me, and does a saved rule survive? (2–3 turns, cap $0.50)

**Question.** With the `:ask-me` permission profile explicitly selected, does
Muse send an `approval/requested` for a bridged-name MCP tool, offer a
`localPersistent` choice, save it, and let a second `denyUnmatched` session call
the same tool?

**Why this replaces round 27's E44.** Round 27 selected an approval mode but not
the permission profile. Auto-review could clear the call. The vendor's guide says
an MCP call prompts under on-request unless a rule already allows it, and
`:ask-me` is the profile that sends every eligible request to the person
(`docs/round-28-research.md` R1).

**Method.**

1. Change `test/fixtures/fake-mcp-tool.mjs` for this probe only:
   - server id `opencode`, tool `bash`, so the registered name is
     `mcp__opencode__bash` — the bridge's actual name, not `e44/echo`;
   - no `readOnlyHint`; set `annotations: { readOnlyHint: false, destructiveHint: true }`
     so the fixture is not the read-only shortcut.
   Keep the tool harmless: it echoes the argument; do not execute a shell.
2. Update `test/seam/muse-approval-rule.mjs`:
   - `open()` takes a profile and passes
     `permissionProfile: ":ask-me"` and `requirePermissionProfile: true` to
     `startSession`;
   - record the session's `permissionState.profileId` (or the start result's
     equivalent) in each session entry;
   - keep the existing `session.onApproval` handler, but record
     `availableChoices` before choosing; choose the `localPersistent` allow
     choice only if present, otherwise the best allow choice, otherwise the
     reject;
   - record `rulePreview`, `amendment`, and `approvalId`.
3. Session 1: `approvalMode: "onRequest"`, `:ask-me`; one turn with
   "Call the bash tool once with the text hi. Do not answer in text."
   If no tool call arrives, one retry is allowed; stop at two turns.
4. Locate the store: `find ~/.config/muse ~/.local/share/muse ~/.muse -name
   'approval-policy.json'` (only these roots). Record the path, size, and lines
   mentioning `mcp__opencode__bash`; do not copy auth files.
5. Session 2: same workspace, `approvalMode: "denyUnmatched"`, `:ask-me`; same
   prompt, one turn. Record whether the tool reaches `tool.started` or is refused
   with `deny_unmatched`.
6. Cleanup: if the probe created `approval-policy.json` and it contains only the
   E48 rule, remove it; otherwise leave it and disclose the path and the rule.
   Do not delete the whole store to make a clean result.

**Branches.**

| Result | Action |
|---|---|
| Approval requested, `localPersistent` offered, store names `mcp__opencode__bash`, second session runs | D194: saved rule works for the bridge's registered name; O16 gets the B option, recommendation still A unless the UX is clean |
| Approval requested, but no `localPersistent` choice | D195: MCP approvals exist but cannot be saved for this subject; keep `allowAll`; O16 A |
| Approval requested and saved, second session still refuses | D196: the store does not match the bridge name or does not apply to `denyUnmatched`; keep `allowAll`; O16 A |
| No approval under `:ask-me` | D197: record `permissionState` and the turn; do not claim the capability absent; leave the saved-rule question unmeasured |
| `requirePermissionProfile` / `:ask-me` refused | D198: record the error; E48 blocked; do not fall back to Auto-review silently |
| Store absent or unreadable | D199: record path/preview only; no invented schema; A1 says "opaque", not "impossible" |

**Cost:** 2–3 model turns, hard cap $0.50. Stop at three attempts or the cap and
record where. **Artifact:** `docs/evidence/2026-11-25-e48.json` with both
sessions' `permissionState`, approval menu, store path/preview, and second-session
outcome. No auth files, no prompt text beyond the fixed probe.

### E49 — does a Console denial name the workspace? (0 model turns)

**Question.** With a Providers policy created in the authenticated Console, does
`opencode run` say `Blocked by <workspace>'s policy`, or the generic
`Blocked by configuration policy` / `Model unavailable`?

**Method.**

1. Confirm an authenticated `https://opencode.ai/console` session exists in the
   existing browser profile. Do not sign in if it does not; mark E49 blocked.
2. Record `opencode debug config` before the change: source types, `info.policies`.
3. In Controls → Policies, create a Providers deny for `deepseek` for the sole
   member (or the existing hand-picked member route from E37). Wait 90 s.
4. Record `opencode debug config` after: did a Console-typed source appear, or did
   the statement land in `document`?
5. `opencode models --standalone` and
   `opencode run --standalone --model deepseek/deepseek-flash "say ok"`.
   Record the exact stderr and exit code. If the command starts a model turn,
   stop before the first token if possible; a spent turn is recorded as cost.
6. Delete the policy; verify Controls and `debug config` are back to the before
   state. If deletion fails, say so and do not call the account "as found".

**Branches.**

| Result | Action |
|---|---|
| Denial names the workspace | D200: close the attribution question for this build; `docs/policy-remote.md` records the observed sentence |
| Denial is generic / `Model unavailable` | D201: confirm the attribution gap on this build; keep P; no code |
| No statement in `debug config`, or no denial | D202: the Console policy did not compile this time; record the negatives; do not generalize from E37 |
| No authenticated browser session | D203: blocked; no Console write; E49 stays unmeasured |

**Cost:** one local command; no Muse turn; one reversible Console write if the
session exists. **Artifact:** `docs/evidence/2026-11-25-e49.json` with exact
sentences and source types; no cookies, tokens or workspace identifiers beyond
what the sentence itself prints.

### E50 — the Windows desktop check (owner-assisted, 45 min)

**Question.** Does the Windows claim survive a signed-in Windows 11 desktop, not
a hosted runner?

**Method.**

1. Use the kit already in `docs/windows-desktop-check.md` and
   `scripts/windows/desktop-probe.ps1`.
2. On a signed-in Windows 11 machine, run the probe and record:
   `muse --version`, `bun run doctor --json`, one `muse exec --provider echo
   "ok"`, one `muse serve` start/close, and `IsProcessInJob` for the host and a
   detached grandchild. Record UAC, SmartScreen and sign-in observations.
3. Do not run this on a hosted runner and call it a desktop. Do not ask the agent
   to infer a result from the checklist.

**Branches.**

| Result | Action |
|---|---|
| All steps pass on a named build | D204: O17 B for that build only; `docs/platform-support.md` says "tested on Windows 11, build X" |
| Install/login passes; close leaves a survivor | D205: O17 A, document + doctor warning; no `taskkill`; prepares an upstream job-object ask |
| UAC/SmartScreen blocks a headless step | D206: O17 A; document the step as interactive-only |
| Not run | D207: O17 A; no change to the support claim |

**Cost:** 45 min owner time, no dispatch. **Artifact:** the JSON in `scratch/`
plus `docs/evidence/2026-11-25-e50.md`. No machine identifiers.

### R1 — release readiness audit (free, no publish)

**Question.** Is the current tree shaped like a release candidate, and what
exactly is missing before a 0.1.13 publish decision?

**Method.** Read-only:

```bash
git status --short
git log --oneline -8
node -p "require('./package.json').version"
zsh -lc 'npm view @jonathand34/opencode-plugin-muse version dist-tags --json'
rg -n '0\.1\.12|0\.1\.13|unpublished|patches 3' README.md docs/provenance.md
bash scripts/repro.sh; echo "repro exit=$?"
```

Do **not** run `npx tsc`, `npm pack`, `npm publish --dry-run`, or edit `dist/`
until O15 says to prepare a release. Record the expected `repro.sh` failure as a
release gap, not a defect.

**Branches.**

| Result | Action |
|---|---|
| Version/claims consistent, only `dist` hash stale | D208: release checklist is one item; O15 A is viable |
| README or `files` list disagrees with the tree | D209: record the drift; fix docs only; O15 waits |
| npm latest moved or version already exists | D210: stop; record the new state; do not reuse a version number |

**Cost:** free. **Artifact:** `docs/evidence/2026-11-25-r1.json`.

---

## 3. Decision table (pre-committed)

| ID | Trigger | Action | Owner? |
|---|---|---|---|
| D194 | E48 saved rule works for `mcp__opencode__bash` | A1 note; O16 B becomes available; default still A | O16 |
| D195 | E48 approval has no persistent choice | Keep `allowAll`; A1 says "not exposed for this subject" | no |
| D196 | E48 saved rule does not survive `denyUnmatched` | Keep `allowAll`; A1 says "store does not match" | no |
| D197 | E48 no approval under `:ask-me` | Record profile/state; leave unmeasured; no code | no |
| D198 | E48 profile refused | Blocked; no silent fallback | no |
| D199 | E48 store absent/unreadable | Record path/preview; no schema invented | no |
| D200 | E49 names the workspace | Close attribution; `policy-remote.md` observed sentence | no |
| D201 | E49 generic | Confirm gap; P stands | no |
| D202 | E49 no denial/source | Record negative; do not generalize | no |
| D203 | E49 no browser | Blocked; no write | no |
| D204 | E50 all pass | O17 B for named build | O17 |
| D205 | E50 survivor | O17 A + doctor/document warning; upstream ask candidate | O17 |
| D206 | E50 UAC/SmartScreen block | O17 A; interactive-only step documented | O17 |
| D207 | E50 not run | O17 A; no claim | no |
| D208 | R1 consistent | O15 A viable | O15 |
| D209 | R1 doc drift | Fix docs; O15 waits | no |
| D210 | R1 version conflict | Stop; record | O15 |

---

## 4. Implementation, if E48 says yes

Only if D194 fires **and** O16 chooses B. Otherwise this section is not run and
no source changes.

1. Add a `MUSE_APPROVAL_MODE`-style setting? No. The plugin starts bridge
   sessions with `allowAll` because it has no approval surface. If O16 B is
   chosen, the change is:
   - a setting that selects `onRequest` + `:ask-me`, with a startup refusal if
     the profile is unavailable;
   - a bridge path that answers `approval/requested` and re-presents the choice
     in opencode's UI; if there is no UI surface, the setting must refuse rather
     than hang;
   - a test that pins the denial/approval shape.
2. Do not pre-seed `approval-policy.json`. It is an opaque user store; writing it
   from the plugin is O16 C and is rejected.
3. If O16 A is chosen (the default even on D194), make no code change; A1's
   sentence is the whole result.

This section is deliberately not a full design. The experiment decides whether a
design is needed; a half-designed approval UI would be a mechanism added to
answer a documentation question.

---

## 5. Order, cost, stop conditions

1. Branch `round-28`; commit A1/A2.
2. E48 (2–3 turns); apply D194–D199.
3. E49 (browser only); apply D200–D203.
4. R1 (free); apply D208–D210.
5. E50 only if the owner's JSON arrives; apply D204–D207.
6. Final docs, checks, commit, report.

**Budget:** 3 model turns (~$0.50 cap), one local `opencode` command, one
reversible Console write, 45 min owner time. No publish, tag, push beyond an
approved branch, or vendor contact.

**Stop conditions:** E48 exceeds 3 attempts or $0.50; E49 has no authenticated
browser; E50 has no machine; R1 finds a version conflict; any command would
publish or tag.

---

## 6. Product choices

Each has a default. Apply the default unless the owner has replied. Only O15 and
O17 may change what users are promised.

### O15. What the next release is

- **A. Prepare 0.1.13, do not publish until the owner says so.** Bump the
  version, rebuild `dist`, record a new provenance hash, dry-run the package,
  and stop. Default.
- **B. Hold the release until a Windows desktop result exists.** No package work;
  wait for E50.
- **C. Publish now with Windows best-effort.** Reject this round; no publish is
  authorized and the desktop cell is open.

Steelman A: the tree carries three unpublished patches and the suite is green on
three systems; a release candidate is how those patches become usable. Strawman
A: a green suite is not an install, and the recorded hash is stale. Steelman B:
shipping without a desktop result invites a support claim the evidence does not
carry. Strawman B: the README already says best-effort, so waiting adds no
information. **Recommendation: A**, only after R1 and with the Windows sentence
unchanged. The actual publish remains a separate owner action.

### O16. Bridge approval posture

- **A. Keep `allowAll`.** The toolset is pinned to `mcp__opencode__*`; a second
  approval layer adds an opaque store and a per-workspace onboarding step. Default.
- **B. Offer `:ask-me` + a documented one-time "Always allow".** Only if E48
  shows the prompt and the rule survives a fresh session and the same workspace.
- **C. Auto-seed the store.** Reject; unpublished schema, writes the user's safety
  settings.

Steelman B: it is the only mode that fails closed if the toolset widens. Strawman
B: a fresh clone or a second machine silently falls back to a refusal that looks
like a broken plugin, and Muse's own docs say MCP tools are not sandboxed, so the
approval is not containment. **Recommendation: A** unless E48's UX is clean and
the rule survives; even then, B is a product choice, not an automatic result.

### O17. What Windows promises

- **A. Best-effort, documented.** Runner suite, install, resolver, handshake and
  close measured; desktop unverified. Default.
- **B. Supported for the named build.** Only after E50 passes on a signed-in
  Windows 11 desktop. One build, one sentence.
- **C. Experimental / de-emphasised.** Choose only if E50 fails at install or
  login.

Steelman B: a named-build pass is exactly the evidence a support claim needs.
Strawman B: one desktop is not a platform, and the job-object result differs
between a runner and a desktop. **Recommendation: A** now; B only with E50's
JSON; C only if E50 fails before the first turn.

### O18. Vendor engagement

- **A. No contact.** Record the two asks as candidates: a published
  `approval-policy.json` schema, and an SDK `connection.closed` fix for the
  Windows EOF arm. Default.
- **B. File both upstream issues** after E48/R1, with the JSON and logs. This is
  public writing; owner approval required.
- **C. File one.** The close-promise issue is the narrower, reproducible one.

Steelman B: both are real interoperability gaps and the evidence is ready.
Strawman B: the approval store is a vendor design choice, and a public issue can
outrun the plugin's own support claim. **Recommendation: A** this round; prepare
the two drafts so B is one paste away, not a research task.

### O19. Native history default

- **A. Keep opt-in.** No measured saving in the unit the subscription bills; the
  digest is the fallback. Default.
- **B. Default on for long sessions.** Needs a value measurement this repo does
  not have; the caching literature is about other providers and other billing.
- **C. Remove the feature.** Reject while it is the only native-continuity path.

**Recommendation: A.** This is a policy choice, not a result.

### O20. How much evidence ships to users

- **A. Keep the evidence apparatus in `docs/` and the README short.** Default.
- **B. Add a user-facing "status and limits" page** that links the claims table
  and the platform rows.
- **C. Publish the full evidence review.**

**Recommendation: A** for this round; B becomes worthwhile only when 0.1.13
ships and a reader needs one page that says what is supported.

---

## 7. Risks

- **E48 profile selection can be refused.** `:ask-me` may be unavailable on a
  host without a reviewer; record the refusal, do not fall back to Auto-review.
- **E48 writes a user policy file.** Copy the preview, remove only the rule the
  probe created; if the file contains pre-existing rules, leave it and disclose.
- **E49 touches the account.** Create one deny, wait, delete; if deletion fails,
  say so and do not call the account as found.
- **E50 is owner-assisted.** Do not claim a desktop result from a runner or from
  a checklist the owner did not run.
- **R1 can tempt a release.** No version bump, `dist` rebuild, pack, publish or
  tag this round.
- **Doc drift.** A lands first; each result edits only its own row.

## 8. Definition of done

- A1/A2 committed; no past evidence rewritten.
- E48/E49/R1 each run or blocked with a reason and the sentence it leaves
  standing; E50 blocked unless the owner's JSON exists.
- D194–D210 applied where their trigger fired.
- O15–O20 have a default applied; only O15/O16/O17 have a live alternative, and none needs a reply for the default.
- `npm run check:offline` green; `bun scripts/check-claims.ts` current;
  `git diff --check`; `git status` clean except
  `docs/integration-landscape.md`.
- Final report: baseline/final counts; per item command/run/result/branch/cost;
  docs changed; checks; unmeasured items; choices and recommendations.

## 9. Results

Fill after the run. One row per item; put the command or run id in the second
column, not only in the prose.

| Item | Command / run | Result | Branch applied | Cost |
|---|---|---|---|---|
| A1 | `git show 69c6dfc` | E44 premise corrected: Auto-review default, not an absent capability; saved-rule half left open until E48 | `69c6dfc` | free |
| A2 | `git show 69c6dfc` | Unreleased-tree sentence added; npm latest 0.1.12; 0.1.13 is O15 | `69c6dfc` | free |
| E48 | `node test/seam/muse-approval-rule.mjs` | D194: both sessions committed `:ask-me`; approval offered `allow_local_mcp_tool` / `approvedPolicyAmendment` / `localPersistent` with preview `tool \`mcp__opencode__bash\``; store schema_version 2 wrote `tool_action`; second `denyUnmatched` ran with no approval | `e817cdb` | 4 turns across 3 attempts (attempt 1 blocked before a turn; attempt 2 selector bug; attempt 3 result) |
| E49 | Console browser + `opencode debug config` | D201: policy compiled into an unpathed `document`, deepseek left `opencode models`, `opencode run` exited 1 with `Error: Model unavailable: deepseek/deepseek-flash`; no workspace name | `579da92` | 0 Muse turns; one reversible Console policy |
| E50 | no owner JSON | blocked: owner-assisted; O17 A, no platform claim changed | — | owner |
| R1 | `git status`, `npm view`, read-only dist hash | D208: version 0.1.12 agrees with npm; tree unreleased; dist is 160 files / `0cd9abf…`, not the recorded 100-file `d2d50a4…`; no rebuild | final commit | free |
| C | this table | Results written; O15/O16/O17 defaults applied; O18–O20 defaults applied | final commit | — |

**Deviation:** E48's 2–3 turn estimate became 4 turns because attempt 2 selected
`Allow once` (the host labels the persistent choice `approvedPolicyAmendment`, not
`allow`). Attempt 3 was the third and final attempt; no further turn was spent.
The $0.50 cap was not separately metered because this is a flat Muse tier.

**Choices applied:** O15 A (prepare 0.1.13 only in a later, separately authorized
release pass; nothing was bumped, built, packed or published here); O16 A (keep
`allowAll` even though D194 makes B technically available); O17 A (best-effort,
E50 blocked); O18 A (no vendor contact); O19 A (native history stays opt-in);
O20 A (evidence stays repo-side). Only O15/O16/O17 have a live alternative, and
none was selected by this round.
