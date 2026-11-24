# Round 30 plan: close the evidence gaps before the next release claim

**Written** 2026-11-23. **Base** `96df6ba` on `round-29`. **Branch** `round-30`.
This is an evidence and release-readiness round, not a feature round.

The review that precedes this plan is in `docs/round-30-research.md`. It records
the primary sources, the steelman/strawman options, and why each default was
chosen. This file is the work: status, exact experiments, pre-committed
decisions, and the small set of owner choices left after the measurements.

## Purpose

Close or narrow the seven issues that can still change a product or release
decision:

1. the approval record contradicts itself across E-D24 and E48;
2. E48 is narrower than “the saved-rule half is settled”;
3. E44’s profile was never recorded;
4. E37 and E49 disagree about Console provider policies, with fetch timing and
   source attribution as the likely confounders;
5. project-scoped plugin hook firing is unmeasured;
6. the staged-publish path and approval command are unexercised;
7. the release gates omit dependency risk and package-doc links.

## Non-goals

- No feature work, no new dependency, no API redesign.
- No `npm publish`, `npm stage publish`, `npm stage approve`, tag, push, GitHub
  Release, or vendor contact unless a step explicitly says the owner has
  authorized it.
- Do not edit or stage `docs/integration-landscape.md` without explicit owner
  permission. It is the owner's file.
- Do not rewrite past evidence files. Add an addendum or a new artifact.
- Scratch output goes in `scratch/r30-*`; durable evidence goes in
  `docs/evidence/`.
- Run `gh`, `muse`, and `opencode` under `zsh -lc`.

## Status

| Item | State | Artifact | Result |
|---|---|---|---|
| A0. This plan | done | `docs/round-30-plan.md` | — |
| A1. Correct the approval trace | pending | `docs/decision-evidence.md`; `docs/evidence/2026-11-26-r30-e44-addendum.json` | |
| A2. Correct release instructions | pending | `docs/release.md`; `SECURITY.md` | |
| A3. Decide package-doc links | pending | `package.json` or absolute README links | |
| A4. Add dependency gate | pending | `docs/release.md`; `docs/evidence/2026-11-26-r30-dep.json` | |
| A5. Explain E52 warnings | pending | `docs/evidence/2026-11-26-r30-e52-addendum.json` | |
| E55. Console fetch/source matrix | pending | `docs/evidence/2026-11-26-r30-e55.json` | |
| E56. Project-scope hook firing | pending | `docs/evidence/2026-11-26-r30-e56.json` | |
| E57. E48 durability matrix | pending | `docs/evidence/2026-11-26-r30-e57.json` | |
| E58. One-prompt spike | conditional | `docs/evidence/2026-11-26-r30-e58.json` | |
| E59. Windows desktop | owner-assisted | `docs/evidence/2026-11-26-r30-e59.json` | |
| E60. Stage rehearsal | owner-gated | `docs/evidence/2026-11-26-r30-e60.json` | |
| F. Final record | pending | plan §Results; evidence audit | |

Dates in artifact names are placeholders for the run date. Rename consistently
if the round runs later.

## 1. Documentation and release corrections (free)

### A1 — Correct the approval trace without rewriting history

`docs/decision-evidence.md` E-D24 and D27 still say a saved rule cannot match a
bridged MCP tool and that `denyUnmatched` and the bridge cannot coexist. E48
proved a `tool_action` rule for `mcp__opencode__bash` survives into a second
`denyUnmatched` session.

Do this:

1. Add a `Superseded by E48` note to E-D24 and D27. Keep the original text.
2. Change the live sentence in `docs/approval.md` and `README.md` only if it
   still says “cannot”; the current versions already say “without a pre-existing
   saved rule.” Do not broaden them.
3. Add `docs/evidence/2026-11-26-r30-e44-addendum.json`, not an edit to E44:
   - `experiment`: `E44-addendum`;
   - `finding`: E44 did not record `permissionState`; the later Auto-review
     explanation is an inference, not a measurement;
   - `superseded_by`: `E48` for the `:ask-me` path.
4. Add a one-line note to `docs/decision-coverage.md` pointing at the addendum.
5. Do not edit `docs/integration-landscape.md`; it is the owner's file. Record
   the exact stale sentence in the final report for the owner to apply.

Acceptance:

```bash
rg -n 'cannot coexist|command-prefix scoped' docs/decision-evidence.md \
  docs/approval.md docs/decision-coverage.md README.md
git diff --check
```

Only historical text with a superseded marker may remain.

### A2 — Correct the release instructions

`docs/release.md` is correctly generic, but the actual approval command needs a
stage ID. Add the exact sequence and the 2FA boundary:

```bash
npm stage list --json
npm stage view <stage-id>
npm stage download <stage-id>
# inspect the tarball and compare its digest
npm stage approve <stage-id>
```

State that `npm stage publish` does not require 2FA, approval does, and the
trusted publisher must be **stage-only**. Remove any wording that suggests a
package spec is a valid approval target. Keep the rollback rule: reject a bad
stage; do not unpublish a published version.

Also check `SECURITY.md`’s provenance sentence against npm’s conditions:
automatic provenance requires trusted publishing/OIDC, a public repository, and
a public package. This repo is public and the package is public, so the sentence
is supportable; record the condition so it does not become an accidental
guarantee for a future private mirror.

Acceptance: a reader can stage, list, view, download, verify, approve, reject,
and explain the 2FA boundary without guessing.

### A3 — Decide how documentation reaches npm readers

`README.md` links to `docs/approval.md`, `docs/platform-support.md`,
`docs/policy-remote.md`, and `docs/release.md`. The 0.1.13 tarball contains only
`docs/compatibility.md`, `docs/native-history-evidence.md`, and
`docs/provenance.md`.

Choose one:

- **A3-A:** add the linked docs to `package.json` `files` (larger tarball;
  offline-readable);
- **A3-B:** use absolute GitHub URLs for docs that are not shipped (smaller
  tarball; requires network).

Default: **A3-B**, because the package is already published with only three
docs and the README is the npm landing page. If A3-A is chosen, rerun E51 and
record the new hash.

Acceptance: every relative `docs/...` link in `README.md` either resolves inside
the tarball or is an absolute URL.

### A4 — Add a dependency-risk gate

Add to `docs/release.md`:

- `npm audit --omit=dev` runs against a clean install of the packed tarball.
- High or critical: block.
- Moderate: record the count, the dependency path, and whether the vulnerable
  code is reachable at runtime; accept only with a written review date.
- Do not run `npm audit fix --force` as part of a release.

Record the current candidate result in
`docs/evidence/2026-11-26-r30-dep.json`. The audit already observed 25 moderate
advisories in the E52 tree, all transitive through `@opencode/plugin@2.3.2` and
its npm CLI libraries. Re-run against the final packed candidate; do not copy
this count forward.

Acceptance: the release checklist has a pass/fail rule, not a raw count.

### A5 — Explain E52’s containment warnings

E52 correctly records install/import/plugin-load only, but it also records
`schema fingerprint differs` and `containment blocked:
 tools.bridge-only-observed=degraded prompt.instructions=unknown`. Those are
expected on a fresh install: the toolset record is absent until a session
record exists, and prompt delivery is unknown before a session.

Add `docs/evidence/2026-11-26-r30-e52-addendum.json` with:

- `experiment`: `E52-addendum`;
- the expected-state explanation and the source lines;
- `not_claimed`: no `muse/*` model listing and no live turn;
- `release_effect`: none, unless a session with auth shows a different verdict.

Acceptance: a reader cannot mistake the fresh-install state for a regression.

## 2. Experiments

### E55 — Console policy fetch and source matrix (free, owner browser, reversible)

**Question.** Does a Console provider policy actually remove the model and name
the workspace, and after how long? Is the source typed as Console, unpathed
document, or something else?

**Why this is the right experiment.** E37 read `opencode models` immediately
after creating a single-provider deny and saw the model still listed. E49 waited
90 seconds and saw the model disappear under an allowlist policy. The opencode
docs say Console changes apply on the next fetch, about once a minute, and that
denials from these statements name the workspace. The two prior runs did not
separate fetch timing, policy shape, and source identity.

**Preconditions.** Owner-authenticated Console browser, one reversible policy at
a time, no member invite, no service account, no credential or cookie recorded.
Use the current build and record `opencode --version`, `muse --version`, Console
build hash if visible, and the date.

**Method.**

1. Baseline in a scratch shell:
   ```bash
   mkdir -p scratch/r30-e55
   zsh -lc 'opencode debug config' > scratch/r30-e55/before-config.json
   zsh -lc 'opencode models --standalone' > scratch/r30-e55/before-models.txt
   ```
2. Create one Console Providers policy against a provider this machine does not
   need. Use the smallest available target (the sole member / hand-picked), no
   tag. Record the UI labels and the exact compiled statement.
3. Poll at **0, 30, 60, 90, and 120 seconds** after save. At each point record:
   - `opencode debug config` full JSON, not just `sources.length`;
   - every source's `type`, `path`, and `info.policies`;
   - `opencode models --standalone` line count and whether the target appears;
   - `opencode --print-logs debug config` stderr, for policy diagnostics.
4. Run once:
   ```bash
   zsh -lc 'opencode run --standalone --model deepseek/deepseek-flash "say ok"'
   ```
   If the model is still selectable, stop after this one attempt; cap one turn.
   Record the exact sentence and whether a workspace name appears.
5. Repeat with the **allowlist shape** (`deny *`, allow two providers), then
   with a **tool deny** if it can be done reversibly. Do not reuse the same
   policy window without restoring the baseline.
6. Delete the policy. Poll at 0, 30, 60, 90, and 120 seconds and record whether
   the baseline returns, whether the unpathed document remains, and whether any
   cached workspace policy set returns.
7. Restore Controls to “No policies yet.” If deletion fails, stop and record the
   exact account state; do not call it restored.

**Branches.**

| Result | Decision |
|---|---|
| At 60–120 s the provider disappears and a denial names the workspace | D232-A: Console policy is effective and attributable for this shape; record the exact source type |
| Provider disappears but the denial is generic `Model unavailable` | D232-B: effect observed, attribution not observed; narrow the documentation |
| Provider remains at 120 s | D232-C: not enforced on this build; do not claim Console enforcement |
| Source is unpathed `document`, not Console-typed | Record as an attribution gap even if the effect works |
| Policy cannot be created or browser unavailable | D232-D: blocked; no new Console claim |

**Cost:** free; no model turn expected. **Artifact:**
`docs/evidence/2026-11-26-r30-e55.json`.

### E56 — Project-scoped plugin hook firing (free, owner-assisted if trust is needed)

**Question.** After a project-scoped plugin is approved, does its `SessionStart`
hook fire at the first prompt, not just at `session/start`?

**Why.** E35 measured project-scope install/approval and no `session/start`
dispatch. E41 measured first-prompt firing for a **user-scope** install. The
intersection is unmeasured.

**Method.**

1. Reuse the isolated E35 store if it still exists; otherwise build a temp
   workspace with one plugin hook that writes a marker file. Do not write inside
   the repo.
2. Install with `muse plugins install ./plugin --scope project --json`; record
   `trust`, `manifest_family`, `cache`, and any untrusted-workspace refusal.
3. Approve the hook with `muse plugins approve <id> --json`; record the stable
   id and definition hash.
4. In the trusted temp workspace run:
   ```bash
   zsh -lc 'muse exec --json --provider echo --trust-workspace "ok"'
   ```
5. Record whether the marker exists, its timestamp relative to the prompt event
   and `run.lifecycle.started`, and whether an unapproved control writes any
   marker.
6. If project-scope install needs saved trust this session cannot create, stop
   and mark blocked. Do not substitute a user-scope result.

**Branches.**

| Result | Decision |
|---|---|
| Approved project hook fires after the prompt | D233-A: P5 stands; add the project-scope sentence |
| Approved project hook does not fire | D233-B: narrow P5 to install/approval; do not claim firing |
| Install blocked by saved trust | D233-C: record blocked; narrow the sentence |
| Unapproved control writes a marker | D233-D: stop; security escalation, do not publish |

**Cost:** free. **Artifact:** `docs/evidence/2026-11-26-r30-e56.json`.

### E57 — E48 rule durability (2 turns, cap $0.50)

**Question.** Does the saved `tool_action` rule survive a host restart and a
second workspace, or only the same host process?

**Why.** E48 proved the rule works in a second session on the same host. The
claim “saved-rule half is settled” is too broad without restart and scope.

**Method.**

1. Use the E48 fixture and the same `:ask-me` + `localPersistent` flow.
2. Save the rule; close the host; spawn a new host against the same isolated
   store; run one `denyUnmatched` session with the same fixture tool.
3. Repeat in a second temp workspace with the same store.
4. Remove only the rule this probe created; if the store cannot be edited
   safely, leave it and disclose the path.
5. Do not claim the production bridge is covered; this is still the fixture
   named `opencode`.

**Branches.**

| Result | Decision |
|---|---|
| Rule survives restart and second workspace | D234-A: saved-rule claim at name level |
| Rule survives restart but not second workspace | D234-B: scope it to the same workspace |
| Rule does not survive restart | D234-C: narrow to same-host session |
| No turn or no store | D234-D: unmeasured; do not broaden |

**Cost:** 2 turns, cap $0.50. **Artifact:**
`docs/evidence/2026-11-26-r30-e57.json`.

### E58 — One-prompt approval spike (conditional, 2 turns, cap $0.50)

Run **only if** O16 B is still live or the owner wants the double-gate question
closed. This is a scratch spike; no production code ships.

**Question.** If Muse’s approval is presented before a bridged call, does
opencode ask a second time for the same call, and can a `once` choice remain
single-use?

**Method.** Build a throwaway plugin/harness in `scratch/r30-e58` that:

1. registers one plugin tool or uses the bridge shim;
2. asks Muse for a `tool` approval through the available API;
3. records every `permission.asked`/approval request, the choice map, and the
   tool execution count;
4. tests approve-once, approve-session, deny, and a host with no reviewer;
5. never writes a persistent rule unless the test explicitly chooses it.

The spike must not change `src/` or the shipped plugin. If the needed
non-prompting check or single-use admission is absent, stop and record it.

**Branches.**

| Result | Decision |
|---|---|
| One prompt, explicit mapping, denial tested, no broader saved rule | D235-A: O16 B is implementable; design it, do not ship it |
| Two prompts or a saved rule broader than the user saw | D235-B: keep O16 A |
| API missing or no usable host | D235-C: keep O16 A; record the upstream blocker |

**Cost:** 2 turns, cap $0.50. **Artifact:**
`docs/evidence/2026-11-26-r30-e58.json`.

### E59 — Windows desktop (owner-assisted, 45–60 minutes)

**Question.** Does a signed-in Windows 11 desktop, in a **standard-user**
interactive session, install the build, sign in, run a turn, and leave no
survivor after close?

Use `docs/windows-desktop-check.md`. Prefer the owner’s physical Windows machine
or a Hyper-V VM with a standard user. Windows Sandbox is a useful smoke test but
must not be the sole evidence: it is a disposable elevated environment and can
produce a false pass for UAC/ACL/process-tree questions.

Record: Windows build, `muse --version`, architecture, whether the session is
elevated, install result, login result, one turn, doctor JSON, close result, and
process-table samples. No credentials, cookies, or account identifiers.

**Branches.**

| Result | Decision |
|---|---|
| All steps pass on a named build, standard user | D236-A: O17 B for that build only |
| Install/login passes, close leaves a survivor | D236-B: O17 A; document + doctor warning |
| UAC/SmartScreen blocks a headless step | D236-C: O17 A; mark interactive-only |
| No machine or no signed-in run | D236-D: O17 A; no desktop claim |

**Cost:** owner time only. **Artifact:**
`docs/evidence/2026-11-26-r30-e59.json` or `.md`.

### E60 — Staged-publish rehearsal (owner-gated)

Do **not** run until A1–A5 and E55–E57 are committed and the owner explicitly
authorizes a push/stage in the execution prompt. Nothing here authorizes a
public release. E58 and E59 may follow the release; they do not change the
package bytes.

1. Freeze the candidate. Run `bash scripts/repro.sh`, `npm run check:offline`,
   `bun scripts/check-claims.ts`, and `npm pack --dry-run`; record the hash.
2. Run `npm stage publish --dry-run`; record exit, file count, shasum, and
   integrity. A dry-run is not a stage.
3. Owner sets the trusted publisher to **stage-only**.
4. Push the branch; dispatch `publish.yml` from that ref.
5. Record the stage ID from `npm stage list --json`.
6. `npm stage view <stage-id>` and `npm stage download <stage-id>`; inspect the
   tarball and compare its sha256 to the candidate.
7. Approve with `npm stage approve <stage-id>` only after the digest and
   contents match; otherwise `npm stage reject <stage-id>`.

**Branches.**

| Result | Decision |
|---|---|
| Stage created, digest matches, approval works | D239-A: O22 A verified |
| Stage created, digest mismatch or bad contents | D239-B: reject; fix; new candidate |
| Workflow fails or stage-only rejects `npm stage publish` | D239-C: fix config; no publish |
| Owner does not authorize | D239-D: stay at dry-run; record unmeasured |

**Cost:** free (2FA owner time). **Artifact:**
`docs/evidence/2026-11-26-r30-e60.json`.

## 3. Pre-committed decisions

| ID | Trigger | Decision |
|---|---|---|
| D231 | A1 applied | Approval record is corrected without rewriting E-D24/E44 |
| D232-A | E55 enforced, workspace named | Console behavior documented for that shape |
| D232-B | E55 effect observed, no attribution | Narrow to “unattributable enforcement” |
| D232-C | E55 not enforced at 120 s | No Console enforcement claim |
| D232-D | E55 blocked | Unmeasured; no new claim |
| D233-A | E56 marker fires | P5 stands with project-scope evidence |
| D233-B/C | E56 no marker or blocked | Narrow P5 |
| D233-D | Unapproved control fires | Security escalation; stop release |
| D234-A | E57 survives restart + workspace | Saved-rule claim at name level |
| D234-B/C | E57 partial or fails | Narrow to measured scope |
| D234-D | E57 unmeasured | No broadening |
| D235-A | E58 one prompt, denial tested | O16 B implementable, not shipped |
| D235-B/C | E58 two prompts or API absent | O16 A |
| D236-A | E59 named-build standard-user pass | O17 B for that build |
| D236-B/C | E59 survivor/UAC block | O17 A + warning |
| D236-D | E59 no machine | O17 A |
| D237-A | Audit has high/critical | Block release |
| D237-B | Moderate reachable | Owner O25 |
| D237-C | Moderate unreachable | Accept with note and review date |
| D237-D | Upgrade removes advisory | Update, rerun E51, record new hash |
| D238-A | Add docs to tarball | Rerun E51; update hash/provenance |
| D238-B | Absolute links | Rerun E51 only if package bytes change |
| D239-A | Stage ID + digest match | O22 A verified |
| D239-B/C/D | Mismatch/failure/no authorization | Reject or leave unmeasured |
| D240-A | All gates pass | Candidate ready locally |
| D240-B | Any block | Hold; no publish |

## 4. Owner choices left after the evidence

These are product/risk choices, not experiment outcomes. The defaults are what
the measurements alone cannot decide.

### O25 — Dependency risk appetite

- **A. Accept moderate, documented.** Default if all moderate paths are
  unreachable at runtime and no high/critical exists.
- **B. Block until fixed.** Strongest safety, but currently no fix exists.
- **C. Refactor the dependency.** Make `@opencode/plugin` a peer or reduce the
  npm CLI subtree; highest effort and compatibility risk.

Steelman A: the advisories are in CLI tooling transitive to a runtime package,
and the package already documents that reproducibility is not a dependency
audit. Steelman B: a public plugin should not ship known moderate advisories
without a fix plan. Steelman C: removing the subtree removes the class, not one
advisory.

### O26 — Documentation delivery

- **A. Include docs in the tarball.** Offline-readable; larger package; hash
  changes.
- **B. Absolute GitHub links.** Smaller package; requires network; no duplicate
  docs.

Default: **B**.

### O27 — Windows desktop effort

- **A. Owner machine or Hyper-V VM with a standard user.** Best evidence.
- **B. Windows Sandbox smoke only.** Cheap, but elevated/disposable context can
  produce a false pass.
- **C. Retire the desktop claim.** Honest; no owner time.

Default: **C** if no machine is available; **A** if one is.

### O28 — Release timing

- **A. Release 0.1.13 after A1–A5, E55–E57, and the dependency decision;
  E58/E59 can follow.** Default if the dependency policy is acceptable.
- **B. Hold the release until E58/E59 finish too.** Slower; only needed if the
  owner wants approval or desktop evidence before any release.

Default: **A**, because E55/E56 are documentation/claim experiments and E57 is
two turns; E58/E59 do not change the package bytes. The dependency decision is
the only release blocker.

### O29 — Approval posture

- **A. Keep `allowAll`.** Default unless E58 produces a clean one-prompt path.
- **B. Build O16 B.** Only if E58 passes all four acceptance points.

Default: **A**.

### O30 — Console wording if E55 is ambiguous

- **A. Say “effect observed, attribution not observed.”** Default.
- **B. Remove the Console claim until a Console-typed source appears.**
- **C. Wait for a vendor fix before documenting.**

Default: **A**.

## 5. Execution order

1. **A1–A5** — free, no owner gate except the owner file.
2. **E55, E56, E57** — independent; E55 needs the owner browser, E56 may need
   saved trust, E57 costs two turns.
3. **E58** — only if O16 B is live.
4. **E59** — owner Windows time.
5. **E60** — only after the candidate and docs are frozen and the owner
   authorizes push/stage.
6. **F** — write results, apply D231–D240, update `evidence-audit.md`,
   `decision-coverage.md`, and `release.md`; run checks; commit.

## 6. Definition of done

- Every item in §Status is done, blocked with a reason, or explicitly not run.
- D231–D240 are applied where their trigger fired.
- O25–O30 have a default or an owner reply; no silent choice.
- No past evidence file was rewritten; addenda are separate.
- `git diff --check` clean; only the owner's integration file may remain
  unstaged.
- `npm run check:offline` and `bun scripts/check-claims.ts` green after docs and
  package changes.
- Final report: baseline/final counts, per-item command/result/artifact/cost,
  decisions applied, owner choices, unmeasured items, and the exact next owner
  action.

## 7. Execution prompt

Use the prompt in the final response or the short form below:

> Execute round 30 in `~/repos/opencode-plugin-muse` on branch `round-30` from
> `96df6ba`. Read `docs/round-30-plan.md` and `docs/round-30-research.md` first.
> Apply A1–A5, run E55–E57, run E58 only if O16 B is live, leave E59 owner-
> assisted, and run E60 only if the prompt explicitly authorizes push/stage.
> Do not publish, approve a stage, tag, push, or contact a vendor otherwise.
> Write evidence after each item, apply D231–D240, keep
> `docs/integration-landscape.md` untouched unless the owner permits it, and
> finish with the report in §6.
