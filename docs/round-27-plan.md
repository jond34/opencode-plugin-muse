# Round 27 plan: close the sentences round 26 left standing

**Written** 2026-11-24, from round 26's final report and
`docs/round-27-research.md`. Branch `round-27` off `round-26` (`46004ce`). The
owner approved every experiment on 2026-11-24. This file is the state: update
the status table after every item, and write results here before moving on.
Scratch output stays in `scratch/`; evidence that must outlive the artifacts
goes in `docs/evidence/`.

The round has one rule: **do not add a mechanism to answer a documentation
question.** Seven items remain. Five are sentences; two (E42, E44) could change
code, and only if their branches say so.

## Status

| Item | State | Commit / run | Note |
|---|---|---|---|
| A. Documentation corrections | todo | | E35 timing, E39 plane, E19 source, tag API, claims |
| E41. `SessionStart` on 1.4.25 | todo | | free, `--provider echo` |
| E42. Close after EOF | todo | | 1 dispatch, diagnostic |
| E43. Console denial sentence | todo | | 1 run, no model turn if denied |
| E44. MCP rule under `denyUnmatched` | todo | | 2–3 turns, capped; replaces E39 |
| E45. E38 job membership | todo | | 1 dispatch |
| E46. Windows desktop kit | todo | | owner-assisted, 45 min |
| E47. Older claim rows | todo | | free |
| C. Results + decision table | todo | | final commit |
| O. Owner choices | todo | | only O9/O11 may need a reply |

---

## 0. What changed since round 26

Round 26 closed E34, E35, E36, E37 and E38, and left E39 blocked. Reading the
vendor docs after that report changed three premises:

1. `SessionStart` is dispatched lazily at the first prompt, not at
   `session/start`. E35's "instrument gap" is expected ordering, not a defect.
   Muse's echo provider fires the lifecycle without a paid model call.
2. Muse 1.4.0 can save MCP tool approvals across sessions, and the protocol has
   a `tool` subject with `localPersistent` scope. The "saved rules cannot name
   an MCP tool" sentence is too strong. The store is opaque, so the workable
   mode may still be `allowAll`, but that is now a question, not a conclusion.
3. The `tool.use` wildcard E39 proposed is opencode's policy vocabulary, not
   Muse's approval policy. E39 as written would test the wrong engine.

The research file carries the URLs, quotes and confidence for each. The plan
below assumes they hold; where a measurement contradicts one, the measurement
wins and the deviation is recorded.

Constraints carried forward: never commit to `main`; never tag, publish or
submit; never stage or edit `docs/integration-landscape.md`; run `gh`, `muse`,
`opencode` under `zsh -lc`; no new dependency; no `timeout-minutes` to hide a
queue; do not raise a test timeout without naming the consuming segment.

---

## 1. Workstream A — documentation that needs no experiment

One commit, before the experiments, so a later result edits only its own row.

### A1. `docs/decision-coverage.md` — E35 wording

Replace the P5 sentence "One instrument gap remains: the MSP `session/start`
path did not dispatch the SessionStart hook" with:

> Muse dispatches `SessionStart` at the first prompt, not at `session/start`
> (1.4.7 field probe; 1.4.25 docs), so round 26's `session/start` observation is
> expected ordering. Firing on 1.4.25 is unmeasured until E41; the approval gate
> is not in doubt.

Do not delete the measured install/approve facts. If E41 fires, replace
"unmeasured until E41" with the run id and marker; if it does not, keep the
sentence and add the branch.

### A2. `docs/decision-coverage.md` — the authority-order row

Current sentence: "Muse's saved rules are command-prefix scoped and cannot name
an MCP tool." Replace with:

> Muse's shell rules are argv-prefix scoped; MCP tool approvals can be saved
> locally since 1.4.0 (`tool` subject, `localPersistent` scope), but the store's
> path and matcher are unpublished and the plugin cannot pre-seed it. An
> unseeded `denyUnmatched` refuses a bridged call (E-D24); `allowAll` is the only
> mode that works without an opaque per-user approval. E44 tests whether a
> saved bridge rule is usable.

Same edit in `src/session.ts`'s comment and in `README.md` if the same absolute
appears there. Keep the E-D24 result; it is still true for the unseeded case.

### A3. `docs/policy-remote.md` — the sentence the user sees

Add one paragraph after the E37 result:

> E37's Console policy compiled into `debug config`'s `document` source, the
> same source a local file uses. opencode maps document statements to "Blocked
> by configuration policy"; only organization statements carry "Blocked by
> <workspace>'s policy". Whether this build shows the workspace name is E43, not
> assumed from the vendor docs.

### A4. Tag API

In `docs/policy-remote.md` and the claims row, close the tag question:

> Tag creation through the API is untested. It is not on the measured route:
> E36 found the hand-picked member target, and E37 created the policy without a
> tag. No tag API is needed for the documented path.

### A5. Claims table

Add the four older claims as rows or explicit "not reopened" markers. Do not
invent a quote. `brew` and `a4` may be marked "historical, no product
dependency" if no primary source is found; codex and Vue Doctor have current
sources in the research file.

**Acceptance for A:**

```bash
rg "MSP `session/start` path did not dispatch|cannot name an MCP tool" \
  docs/decision-coverage.md src/session.ts README.md
git diff --check
```

The only hits allowed are quoted history in the review/audit records. The
round-27 plan and research quote the old sentence on purpose, so they are not in
that target list.

---

## 2. Experiments

Each entry: question, method, branches, action, cost, artifact. Branch actions
are pre-committed. Owner choices are only §4's `O#`; everything else is applied.

### E41 — does `SessionStart` fire on 1.4.25 without a paid turn? (free)

**Question.** Does an approved plugin's `SessionStart` hook write its marker
when `muse exec --provider echo` runs on 1.4.25?

**Method.**

1. In `scratch/r27/e41/`, create `repo/` and `plugin/` with
   `.muse-plugin/plugin.json` and one `SessionStart` hook whose command appends
   a line to an absolute path (`/tmp/r27-e41-marker`; the hook environment is
   cleared and `E41_MARKER` will not reach it).
2. `cd repo && muse plugins install ../plugin --scope project`, then
   `muse plugins approve <plugin-id>`. Record the install/approve output.
3. `muse exec --provider echo --trust-workspace "ok"` in `repo/`. Record exit
   code, stdout, and whether the marker exists. The echo provider makes no
   model call.
4. Control: a fresh clone at a different path with no approval; the marker must
   not be written.
5. If the marker does not appear, repeat once with `--trust-workspace` and once
   with the plugin approved at user scope, to separate approval from timing.
   Stop after two negatives.

**Branches.**

| Result | Action |
|---|---|
| Marker written on the first prompt, not before | E35 closed; A1 gets the run id; docs say "measured on 1.4.25" |
| Marker written before the prompt | Lazy claim false for this build; record the ordering and reopen E35's gap |
| No marker with approval | Record the install/approve output; do not infer a code bug from one run; leave the sentence "unmeasured" and file the transcript in the audit |
| `--provider echo` refuses | Record the refusal; E41 blocked, no paid turn substituted |

**Cost:** free. **Artifact:** `docs/evidence/2026-11-24-e41.json` with install
report, marker path and timestamps. No plugin contents beyond the manifest.

### E42 — why does `close()` not settle after EOF on Windows? (1 dispatch)

**Question.** When the fixture has already closed stdout and its pid has died,
which promise is `close()` waiting on?

**Method.**

1. Add `test/seam/windows-close.mjs` using the existing SDK:
   spawn the fixture with `FAKE_MSP_MODE=eof-alive` and
   `shutdownTimeoutMs: 0`; await `connection.connection.closed`; record whether
   `connection.exited` is already settled (`Promise.race` with 50 ms), whether
   the pid is alive, then race `connection.close()` against 10 s.
2. Print one JSON line:
   `{exitedBeforeClose, pidAliveBeforeClose, close:"settled"|"pending", pidAliveAfter, elapsedMs}`.
3. Add a `continue-on-error: true` step to the existing `seam-windows` job, like
   E38's. Do not change the test's 15 s budget or the skip.
4. Push `round-27:ci/seam`; read the step log with `gh run view --job <id> --log`.

**Branches.**

| Result | Action |
|---|---|
| `exitedBeforeClose=true`, pid dead, `close=pending` | SDK promise bookkeeping after an already-exited child; keep the skip, file an upstream issue with the JSON, and name the row "close after EOF: SDK promise does not settle" |
| pid alive, `close=pending` | SDK kill path did not reach the child; keep the skip, upstream issue, and check whether `ownsProcessGroup` is false on win32 (already known) |
| `close=settled` under 10 s | The 15 s test was a timing artifact; unskip only if the measured elapsed plus a named segment fits 15 s; otherwise keep the skip and record the latency |
| `closed` never resolves | Fixture/transport issue, not close; fix the fixture and rerun once |

**Cost:** 1 dispatch (~$0.19). **Artifact:**
`docs/evidence/2026-11-24-e42.json` plus the job log path. Do not raise a
timeout.

### E43 — which sentence does a Console denial show? (1 run)

**Question.** With a `provider.use` deny compiled from the Console, does
`opencode run` say "Blocked by <workspace>'s policy" or "Blocked by
configuration policy"?

**Method.**

1. **Local control (free, no Console):** in a temp project under
   `scratch/r27/e43/`, write a project `opencode.json` with
   `policies: [{action:"provider.use", resource:"mistral", effect:"deny"}]`.
   Run `opencode run --model mistral "say ok"` and record the exact stderr.
   This establishes the `document`-source sentence on this build.
2. **Console arm (only if the E37 browser session is still available):**
   recreate the same deny for the sole member through Controls, wait 90 s,
   confirm it appears in `opencode debug config`, run the same command, record
   the sentence, then delete the policy and verify Controls is as found.
3. If the command starts a model turn instead of failing, stop it before the
   first token if possible; if a turn is spent, record the cost. Do not use a
   provider the account needs for Muse work.

**Branches.**

| Result | Action |
|---|---|
| Console sentence names the workspace | A3 says the vendor behavior is observed; the `document` source is an implementation detail, not a user gap |
| Console sentence is generic ("configuration policy") | A3 states the attribution gap is confirmed on this build; `docs/policy-remote.md` keeps P and names the sentence |
| No denial; the provider is usable | Record it; the Console policy did not compile this time; do not generalise from E37's single write |
| Command cannot run without a turn | Stop; record "unmeasured"; do not spend a turn for this sentence |

**Cost:** one local command; one Console write if the session exists; no model
turn expected. **Artifact:** `docs/evidence/2026-11-24-e43.json` with the exact
sentences, no tokens or cookies.

### E44 — can a saved MCP tool rule survive `denyUnmatched`? (2–3 turns, capped)

**Question.** Does a locally-persistent `tool` approval for the bridge's
registered name let a bridged call run under `denyUnmatched`, or does Muse
still refuse it?

**Why this replaces E39.** E39's `tool.use` wildcard is opencode's vocabulary
(R3). Muse's rule is a `tool` subject with `toolName`, stored by an approval
choice. The experiment must create that choice, not write an opencode policy.

**Method (scriptable, one probe).**

1. Add `test/fixtures/fake-mcp-tool.mjs`: a stdio JSON-RPC server that answers
   `initialize`, `tools/list` with one `echo` tool, and `tools/call` by echoing
   its argument. No dependency; newline-delimited JSON is enough.
2. Add `test/seam/muse-approval-rule.mjs` using `spawnMspConnection`:
   - start `muse serve` through the existing helper;
   - `session/start` with `approvalMode:"onRequest"`, `config.mcpServers`
     pointing at the fixture (stdio, `mode:"required"`);
   - `turn/start` with "Call the echo tool once with the word hi. Do not answer
     in text.";
   - register `session.onApproval` (or the SDK's approval handler), wait for the
     `approval/requested` whose subject `kind:"tool"`, and choose the choice
     whose `scope:"localPersistent"` (label usually "Always allow"). Record
     `rulePreview`, `amendment`, and the resolved decision.
   - close the session.
3. Locate the policy store with
   `find ~/.config/muse ~/.local/share/muse -name 'approval-policy.json'`.
   Record the path, the rule text, and whether it names `mcp__<server>__echo`.
   Do not copy credentials; the file is local policy, not auth.
4. Second session with `approvalMode:"denyUnmatched"` and the same MCP server;
   `turn/start` with the same prompt. Record whether the tool call reaches
   `tool.started`/runs, or is refused with `deny_unmatched`.
5. Clean up only the rule this probe created; if the store cannot be edited
   safely, leave it and say so in the artifact. Do not delete the whole file.

**Branches.**

| Result | Action |
|---|---|
| Second session runs the tool with no approval | `allowAll` is not the only workable mode; D185 → O9. A2's sentence becomes "a saved bridge rule can carry `denyUnmatched`; the plugin does not seed it" |
| Second session refuses with `deny_unmatched` | The saved rule does not match the bridge name (or does not apply to MCP); A2 stands; D186 |
| First approval offers no `localPersistent` choice for a `tool` subject | The 1.4.0 changelog capability is not exposed for this case; record the choices and keep A2 |
| Model never calls the tool after 2 prompts | Stop; record "unmeasured"; A2's "cannot pre-seed" remains, not "cannot save" |
| Store unreadable/undocumented | Record the path and rule preview only; no invented schema; A2 says "store opaque" |

**Cost:** 2–3 model turns, cap $0.50 and 3 attempts. Stop at the cap and record
where. **Artifact:** `docs/evidence/2026-11-24-e44.json` with the choice menu,
rule preview, store path, and second-session outcome. No auth files.

### E45 — was the E38 grandchild inside a job object? (1 dispatch)

**Question.** Are the fixture host and the detached grandchild members of the
runner's job object, which would explain the reaping?

**Method.**

1. In `test/seam/windows-grandchild.mjs`, after the pids are known, add a
   PowerShell/C# `IsProcessInJob` check:
   `Add-Type` a small class importing `kernel32.dll`'s `IsProcessInJob`, open
   each pid with `Get-Process -Id`, pass `.Handle`, and print
   `{hostInJob, grandchildInJob, jobOk}`. `IntPtr.Zero` asks "any job".
2. Keep the existing direct/table sampling. Print one JSON line with membership
   before `close()` and, if possible, after.
3. Push `round-27:ci/seam`; read the E38 step log. One dispatch.

**Branches.**

| Result | Action |
|---|---|
| Both in a job | Orphan row says the runner's job object reaped the tree; desktop remains unmeasured; D188 |
| Host in a job, grandchild not | The grandchild broke away/was not inherited; record the flag; the desktop gap widens |
| Neither in a job | The death has another cause; record it, do not claim a job object; D189 |
| `IsProcessInJob` unavailable/denied | Record the error; mechanism stays unmeasured; no code change |

**Cost:** 1 dispatch. **Artifact:** `docs/evidence/2026-11-24-e45.json`.

### E46 — the Windows desktop check (owner-assisted, 45 min)

**Question.** Does the supported-build claim survive a signed-in Windows 11
desktop, not a hosted runner?

**Method.**

1. Add `docs/windows-desktop-check.md`: a checklist with the exact build
   (`muse --version`), signed-in state, `bun run doctor --json`, one
   `muse exec --provider echo "ok"` (free), one `muse serve` start/close, and a
   detached-helper check.
2. Add `scripts/windows/desktop-probe.ps1` that runs doctor, starts the seam
   fixture, records `IsProcessInJob`, closes, and writes
   `scratch/windows-desktop-<date>.json`. It must not require an agent turn.
3. The owner runs it on a signed-in Windows 11 machine and records UAC,
   SmartScreen, and sign-in observations. The agent does not claim a desktop
   result it did not see.

**Branches.**

| Result | Action |
|---|---|
| All steps pass on the owner's build | O11 B for that build (supported, with the build named); docs say "tested on Windows 11, build X" |
| Install/login passes; close leaves a survivor | O13: document + doctor warning, no `taskkill`; upstream job-object ask |
| UAC/SmartScreen blocks a headless step | O11 A (best-effort); document the step as interactive-only |
| Not run | O11 A; no change to the support claim |

**Cost:** 45 min owner time, no dispatch. **Artifact:** the JSON in `scratch/`
plus a short `docs/evidence/2026-11-24-e46.md` with the answers. No machine
identifiers.

### E47 — the older claims (free)

**Method.** Add four rows to `docs/claims.md`/`.json`:

- `codex-doctor`: exit 1 only when `overall_status == Fail` (source in R6).
- `vue-doctor`: `--strict` exits 3 on an analyzer failure/skip; default
  `--fail-on none` (source in R6).
- `brew-doctor`: find a primary source for "fatal: true" or mark
  "historical, not reopened".
- `a4-doctor`: find a primary source for "reports unknown and exits 0" or mark
  the same.

Run `bun scripts/check-claims.ts`; warn-only. Do not add a CI gate (O12).

**Cost:** free. **Artifact:** the claims rows themselves.

---

## 3. Decision table (pre-committed)

| ID | Trigger | Action | Owner? |
|---|---|---|---|
| D177 | E41 marker fires on 1.4.25 | Close E35; A1 gets the run; docs say measured | no |
| D178 | E41 no marker with approval | Keep "unmeasured"; record the transcript; no code change | no |
| D179 | E42 close pending, pid dead | Keep skip; file upstream with JSON; name the sentence | no |
| D180 | E42 close settled under 10 s | Unskip only if elapsed + named segment fits 15 s; otherwise keep skip | no |
| D181 | E42 pid alive | Keep skip; upstream; note `ownsProcessGroup` | no |
| D182 | E43 names the workspace | A3 records the observed sentence; no gap | no |
| D183 | E43 generic sentence | A3 confirms the attribution gap; P stands | no |
| D184 | E43 no denial | Record; do not generalise; leave E19 open | no |
| D185 | E44 rule allows under `denyUnmatched` | A2 narrows; O9 | O9 |
| D186 | E44 still refuses | A2 stands; `allowAll` remains the workable mode | no |
| D187 | E44 store unreadable | Record path/preview; A2 says "opaque", not "impossible" | no |
| D188 | E45 both in job | Orphan row names the runner job object; desktop gap remains | no |
| D189 | E45 neither/unknown | Mechanism unmeasured; no job-object sentence | no |
| D190 | E46 pass | O11 B for the named build | O11 |
| D191 | E46 fail at close | O13 document + doctor warning; no reaper | O13 |
| D192 | E47 stale row | Correct it in the same commit | no |

---

## 4. Product choices that a result can trigger

Each has a default. The executor applies the default unless the owner has
already replied; ask only when the trigger fires and the default would change
what users are promised.

### O9. Bridge approval posture, if E44 proves a saved MCP rule works

- **A. Keep `allowAll`** — the toolset already pins `mcp__opencode__*`; a saved
  rule adds a second, opaque store and an onboarding approval. Default.
- **B. Offer `denyUnmatched` + a documented one-time "Always allow"** —
  stronger fence: only the bridge tool can run, host tools cannot. Costs a
  per-workspace approval and depends on an unpublished matcher.
- **C. Auto-seed the rule** — strongest, but writes the user's policy store
  from the plugin, against an unpublished schema. Reject.
- **D. Ask the vendor for a documented scoped rule** — no code, a cleaner B
  later.

Steelman B: it is the only mode that fails closed if the toolset widens, and
the plugin's whole posture is "the bridge is the only tool". Strawman B: the
store is user-local and opaque, so a fresh clone or a second machine silently
falls back to a refusal, which looks like a broken plugin. Steelman C: the
plugin already writes `settings.json`; one more local file is not a new class
of action. Strawman C: a schema the vendor does not publish is a file the next
release can invalidate, and a bad write can weaken every session.

**Recommendation:** A. Revisit B only if E44 shows the rule is stable across a
fresh workspace and a second session, and the approval has a clear label. C is
out.

### O10. Console attribution, if E43 shows the generic sentence

- **A. Document only** — the doctor says it cannot attribute a Console
  statement; users are told to read `debug config`. Default.
- **B. Ask the vendor for a source line** — a follow-up to #60252; cheap, no
  code.
- **C. Build a deny-by-effect probe** — ambiguous and side-effectful; already
  rejected in round 21.

**Recommendation:** A + B. C stays rejected.

### O11. What Windows promises, after E46

- **A. Best-effort, documented** — the status quo: suite green, spawn/install/
  close measured on a runner, desktop unverified. Default until E46.
- **B. Supported for the named build** — only after E46 passes on a signed-in
  Windows 11 desktop. One build, one sentence, no "all Windows".
- **C. De-emphasise** — Linux/macOS supported, Windows experimental. Choose
  only if E46 fails at install or login.

**Recommendation:** A now; B if E46's JSON is complete; C if E46 fails before
the first turn.

### O12. Claims checker in CI

- **A. Warn-only** — default, already applied.
- **B. Gate issues/PRs, warn on URLs** — catches the cases that matter.
- **C. Full gate** — brittle on vendor renames.

**Recommendation:** A for two clean runs, then B. Do not gate URLs.

### O13. Desktop cleanup, if E46 or E45 shows a survivor

- **A. Document only** — the SDK owns the spawn, the plugin does not.
- **B. Doctor warning** — one line: a detached helper can outlive a Windows
  host outside a job object. Default with A.
- **C. `taskkill /T /F`** — PID reuse and orphan misses; reject.
- **D. Upstream job object** — the correct OS mechanism, not this round.

**Recommendation:** A + B, D as an upstream ask, no C.

### O14. `SessionStart` timing as a product statement

- **A. Document "first prompt"** — default; no code.
- **B. Doctor note** — "hooks fire at first prompt, not session/start"; useful
  only if a user asks why a hook did not run on resume.
- **C. Add a `UserPromptSubmit` workaround** — no; the hook is the vendor's
  lifecycle, not the plugin's.

**Recommendation:** A, plus B if E41's marker is late enough to confuse a user.

---

## 5. Product-sense choices not derived from an experiment

These are posture choices; none blocks the work above. State the default so the
owner can leave them alone.

### P1. How much paid evidence is worth having

The remaining questions are narrow. E44 is the only one that could change a
product posture, and it costs a few turns. **Default:** spend up to $0.50 on
E44; document the rest. If the owner prefers zero turns, E44 is skipped and A2
keeps "opaque store" as the reason.

### P2. Vendor engagement

The useful asks are a published `approval-policy.json` schema (E44) and a
compiled-policy source line (E43/#60252). **Default:** file neither without the
owner's words; record them as "candidate upstream asks" in the plan. No
vendor contact in this round.

### P3. How the docs describe Windows

The suite is green on a runner; the desktop is unmeasured. **Default:** keep
"best-effort" and the measured runner facts; do not add a support badge until
E46. This is O11, restated because it is a product promise, not a test result.

---

## 6. Order, cost, stop conditions

1. Branch `round-27`; commit A (docs), including the E35/E39 wording changes.
2. E41 (free); apply D177/D178; edit A1 only.
3. E42 (dispatch); apply D179–D181.
4. E43 (local command; Console only if the session exists); apply D182–D184.
5. E44 (2–3 turns, capped); apply D185–D187; if O9 is live, ask once with A/B/C.
6. E45 (dispatch); apply D188/D189.
7. E46 (owner kit; do not block the round if the owner cannot run it); apply
   D190/D191 only when the JSON exists.
8. E47 (claims); final docs; commit; report.

**Budget:** 2 dispatches (~$0.38), 2–3 turns (~$0.50 cap), one local `opencode`
run, 45 min owner time. No account writes except E43's reversible Console policy
if the session exists. If E42 needs a second dispatch, stop and report the
flake rather than retrying.

**Stop conditions:** E44 exceeds 3 attempts or $0.50; E43's command would start
a model turn and no denial is visible; E41's echo provider refuses; E46 cannot
be run.

---

## 7. Risks

- **E44's approval handler** may pick the wrong choice or miss the request.
  Record the full `availableChoices` before choosing; never construct a choice
  id. If no `localPersistent` choice exists, that is the result.
- **E44 writes a local policy file.** Clean up only the rule created; if the
  file cannot be edited safely, leave it and disclose the path in the artifact.
- **E43's Console write** can outlive the run. Re-read Controls after deletion;
  if the delete fails, say so and do not call the account "as found".
- **E42's 10 s race** is diagnostic, not a new budget. Do not change the test's
  15 s budget in the same commit.
- **E45's `IsProcessInJob`** can fail on a protected process; a failed query is
  not "not in a job".
- **E46 is owner-assisted.** Do not claim a desktop result from a runner or
  from a checklist the owner did not run.
- **Doc drift.** A lands first; each experiment edits only its own rows.

---

## 8. Definition of done

- A has no absolute left that the round contradicts.
- E41–E47 each either run (result + artifact in `docs/evidence/`) or blocked
  with the reason and the sentence it leaves standing.
- D177–D192 applied.
- O9–O14 have a default applied; only O9/O11 may need an owner reply.
- `npm run check:offline` green; `bun scripts/check-claims.ts` reports the new
  rows; `git diff --check`; `git status` clean except
  `docs/integration-landscape.md`.
- Final report: baseline/final counts, per item command/run/result/branch/cost,
  docs changed, checks, unmeasured items, open choices with recommendations.
