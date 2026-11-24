# Round 26 plan: make the evidence match the claims

**Written** 2026-11-24, from `docs/evidence-review-2026-11-24.md`. Branch
`round-26` off `round-25` (`98917f6`). All experiments below are approved by the
owner (2026-11-24). No paid Muse turn is budgeted unless a named gate says so.

This file is the state. Update the status table after every item and write results
into it before moving on. Scratch output goes in `scratch/`; evidence that must
outlive the artifacts goes in `docs/evidence/`.

## Status

| Item | State | Commit | Note |
|---|---|---|---|
| A. Documentation corrections | done | `fc3e023` | one commit |
| B1. JUnit summary + snapshot v2 | done | `84ba90f` | free; 452/41 local after the new tests |
| B2. Skip ledger guard | done | `84ba90f` | free; five Windows skips declared |
| B3. Measured-on notes | done | `fc3e023` | covered by A2 |
| B4. `runner.arch` in workflow | done | `84ba90f` | free |
| B5. Claims table + checker | done | `84ba90f` | free, network; 15/15 current |
| E34. Windows coverage | done | `ab5358f` | 2 dispatches; 416 ran / 3 skipped; EOF close-promise gap recorded |
| E35. Project-scoped plugin hook | done | `c19e854` | installs project-trusted; approve required; session dispatch unmeasured |
| E36. Console target inventory | done | `0a5646b` | found 9 targets; E31 read the collapsed trigger |
| E37. Policy write probe | done | `0a5646b` | UI write; compiled, visible in `document`, not attributable |
| E38. Grandchild survivor | done | `c19e854` | no survivor on the hosted runner; 239 samples, 0 failed; no taskkill |
| E39. `denyUnmatched` wildcard | blocked | | needs a bridged call, which needs a turn; O4 did not fire |
| E40. Citation pass | done | `84ba90f` | 15/15 current; older four not reopened |
| C. Results + decision table applied | done | `5401d54` | final commit |
| O. Owner choices raised | done | | O1–O4 did not fire; O5–O8 remain defaults |

---

## 0. Why this round exists

The review found fifteen claims that do not carry as written. They fall into
three fix classes, and the class decides how much freedom the executor has:

1. **Determined** — the correct sentence is known now. Fix it; no experiment.
   (Findings 5, 6, 12, 13; most of 8, 9, 11.)
2. **Result-selected** — two or three outcomes, each with a pre-written action.
   Run the experiment and apply the row. (Findings 1, 2, 3, 4, 7, 10, 14.)
3. **Owner choice** — only if a result leaves two defensible product postures.
   All such choices are listed in §6; nothing else goes to the owner.

A recommendation is "confident" when the measurement covers the platform and
process shape named in the claim, with at least three samples or a mechanism
citation from the vendor/OS. Otherwise the claim must read "not observed in
build X on date Y by method Z". That rule is the point of the round.

Constraints carried from round 25: never commit to `main`; never tag, publish or
submit; never stage `docs/integration-landscape.md`; harness CLIs under
`zsh -lc`; no new dependency; no `timeout-minutes` to hide a queue; no raising a
timeout without naming the consuming segment in the same commit.

---

## 1. Workstream A — documentation (no experiment)

One commit, `docs: correct the claims the evidence does not carry`. Exact edits:

### A1. `docs/policy-remote.md` — the Console sentences

Replace "a policy cannot be created on this account at all" and "only the UI
cannot make one" with one formulation, used in both places and in the ledger:

> This Console build (`index-OIWtun4R.js`, 2026-11-24) offered one target,
> "Members tagged with…", for a one-member personal workspace, and its Add tag
> and Save were disabled. The Console changelog documents four other targets,
> including "These members, picked by hand"; none appeared in this build's
> builder. Whether a tag can be created through the API is untested (E36/E37).

Add the changelog citation and date. Do not claim "no route exists".

### A2. `docs/decision-coverage.md`

- Row "A `policies` statement that fails validation" (remote half): "cannot be
  probed on this account at all" → "no route was exposed in the Console build
  observed on 2026-11-24".
- Row "Enterprise config planes": reclassify **X → P**. Reason: the managed
  channel binds (vendor 1.4.2 changelog; the plugin's `session/start` refuses
  under it); the local document vocabulary cannot express it; the channel is
  unobservable on this machine. Keep the flip condition (one policy member that
  binds locally).
- U16 row: replace "Ubuntu green, Windows red on fixtures, macOS no runner" with
  the round-25 result and the remaining desktop gap.
- U22 row: replace "No code path is claimed to work on Windows that a test has
  run there" with the real residual (Windows cannot honour the ladder; that is a
  platform fact, not an untested path).
- "MCP Tasks" row: "SEP-2663 Tasks (final, 2026-07-28)" → "SEP-2663 Tasks
  extension (Final; created 2026-04-27; `io.modelcontextprotocol/tasks`)";
  "no task-get" → "no `tasks/get` handle". Add "task creation is server-elected"
  as a second reason the bridge cannot use it.
- "OS isolation" row: keep N, add the opt-in routes — core PRs #63599 (open,
  non-draft) and #64093 (open, draft), and `universal-opencode-sandbox` 0.4.1
  (MXC) — plus "re-read the v2 `external_directory` default from the tree" and a
  recheck date.
- Rows whose Basis cites 2.3.2 or 2.0.29: append "(measured on 2.3.2)" or
  "(audited 2.0.29)" to the Basis sentence. Do not add a new column.

### A3. `docs/platform-support.md`

- Opening and claims row: "410 tests, 0 failures" → the honest count after E34;
  until then "410 declared, 405 ran, 5 skipped on Windows (2 POSIX-only modes,
  3 behaviour)".
- Orphan row: say "the child the fixture spawned" and name the grandchild gap.
- Claims table: add the skip count and the E34 run id when it lands.
- Q6 desktop paragraph: keep pending; no change to the claim.

### A4. `docs/round-25-plan.md` §12

Add a dated correction under the results: the Windows green was 405 ran + 5
skipped; three are behaviour; E30 fixed the fixture but not the platform coverage.
Point at the skip ledger.

### A5. `docs/evidence-audit.md`

Append a "Round 26" status table mirroring this plan's items; keep the round-25
table as history.

**Acceptance for A:** `rg "cannot be probed|cannot be created on this account|every install scope|Windows red on fixtures" docs/` returns nothing except quoted
history inside the review and audit records.

---

## 2. Workstream B — instruments (no external evidence)

### B1. `scripts/junit-summary.ts` + `test/junit-summary.test.ts`

Read a directory of JUnit XML files and emit one JSON object:

```json
{
  "generatedAt": "...",
  "commit": "...",
  "run": 0,
  "frames": {
    "published": {
      "os": {"ubuntu-latest": {"tests": 0, "assertions": 0, "failures": 0, "skipped": 0, "suites": []}}
    },
    "local": {"tests": 0, "failures": 0, "skipped": 0}
  },
  "arch": "..."
}
```

No dependency: a small regex/XML scan is enough because bun's JUnit is flat. The
test uses inline fixtures: one clean suite, one with a skipped case, one with a
failure. Add `junit:summary` to `package.json` as
`bun scripts/junit-summary.ts <dir>`, not to `check:offline`.

Regenerate `docs/evidence/2026-11-24-791840c.json` from
`scratch/junit-final/` in the v2 shape (keep the old fields as well, so the
round-25 claim remains readable).

### B2. Skip ledger guard

New `test/skip-ledger.test.ts`: scan `test/**/*.ts` for `.skip`, `skipIf`,
`test.skip`, `posixOnly`, and `describe.skip`; each hit must appear in a
`PLATFORM_SKIPS` table with `{file, name, platform, reason, decisionRow}`.
The table lives beside the scanner. Failure message names the unlisted skip and
the required reason field. Initial entries: the five Windows skips, each with
its reason; the three that E34 ports are removed as they are ported.

This is the check the file-count guard cannot provide: a listed file that runs
nothing is still a hole.

### B3. Measured-on notes

Covered by A2; no separate script. The claims table's `Recheck` column stays the
place a reader looks for freshness.

### B4. `runner.arch`

In `.github/workflows/test.yml`, on each matrix job, after setup:

```yaml
- name: Record runner
  run: echo "runner=${{ runner.os }}-${{ runner.arch }}" >> "$GITHUB_STEP_SUMMARY"
```

Add the same value to the JUnit summary invocation via an env var
(`RUNNER_ARCH`) so the snapshot can carry it.

### B5. Claims table + checker

`docs/claims.md`: one row per external claim the ledger relies on, with
`claim | url | quote | as_of | version | check`. Start with the fifteen cited in
the review (Console changelog, Muse 1.4.0/1.4.24, opencode PRs, issues #54806,
#53356, #63257, #49929, #60252, SEP-2663, taskkill, Node signals, brew/codex/a4
if kept).

`scripts/check-claims.ts`: reads a JSON mirror (`docs/claims.json`), checks HTTP
status for URLs (HEAD/GET with a short timeout) and `gh api` state for GitHub
issues/PRs; exits non-zero only with `--strict`, warn-only by default. Add
`check:claims` to `package.json`, not to `check:offline` (it needs network).

**Acceptance for B:** `npm run check:offline` still passes; the new tests fail
when a skip is added or a fixture's `skipped` changes; the snapshot regenerates
byte-identically from the same artifacts.

---

## 3. Workstream C — experiments

Each entry states the question, method, result branches, and the action each
branch selects. Branch actions are pre-committed: the executor applies them
without asking, except where §6 says the owner chooses.

### E34 — Windows coverage (1–2 dispatches)

**Question:** can the three behaviour skips run on `windows-latest`, and what is
the true count?

**Method:**

1. Split `posixOnly` in `test/host-process.test.ts` into per-test gates:
   - "a frozen host settles nothing, including an interrupt" — port. The fixture
     already freezes portably (`freezeForever`); the test should hold on win32.
   - "a transport EOF leaves the process alive until something closes it" — port
     with a Windows variant: the fixture writes its `.term` marker on any
     termination it can observe; on win32 the test asserts only that the pid is
     alive before `close()` and dead after, dropping the SIGTERM-marker
     assertion (Node's Windows signal is forceful and abrupt, which the fixture
     cannot intercept).
2. Port the "links the user's login instead of copying it" test: create the
   symlink, and if it throws `EPERM`/`EACCES`, assert the documented fallback
   (no `auth.json`, host still starts) instead of skipping. Keep the POSIX mode
   tests skipped.
3. Add the skip ledger from B2 and `runner.arch` from B4.
4. Push `round-26:ci/seam`, run twice (a runner flake is a result, not a retry
   to hide).

**Branches:**

| Result | Action |
|---|---|
| All three pass; Windows skipped = 2 (mode only) | Claims say "410 ran / 2 POSIX-only skips"; remove the 3 behaviour entries from `PLATFORM_SKIPS` |
| Frozen passes, EOF variant fails for a plugin reason | Keep EOF skipped; row "Reaping a dead child" says "drain window measured on POSIX; Windows close measured by E16c"; file a note in the audit |
| Login link fails `EPERM` | Keep the fallback assertion; document "Windows needs symlink permission to link the login; without it the host reports the missing login" and add the doctor note only if §6 O3 says so |
| Runner flakes twice | Record both logs; do not raise the 4 s budget without naming the segment; keep 405/5 |

**Cost:** 1–2 dispatches (~$0.19 each). **Artifacts:** JUnit per OS, logs in
`scratch/e34-*.log`, snapshot v2.

### E35 — project-scoped plugin hook (1–2 real runs)

**Question:** can a project-scoped Muse plugin contribute a hook whose
`handlerKind` is `plugin`, and does the gate then allow it?

**Method:**

1. In `scratch/e35/`, create `repo/` and `plugin/` with
   `.muse-plugin/plugin.json` and a SessionStart hook whose command appends a
   line to `$E35_MARKER` (absolute path).
2. `cd repo && muse plugins install ../plugin --scope project` (try without the
   experimental flag first; 1.4.3 says management is on by default). Record the
   install report and whether a review prompt appears.
3. `find repo -maxdepth 3 -newer ...` and `find ~/.config/muse ~/.muse` for what
   the install wrote. Record paths, not contents.
4. `bun run doctor --json` in `repo/` and in a fresh clone at a different path;
   capture the `hooks` row's origin for the handler. The doctor spawns its own
   host, which is enough for `hook/list`; a turn is not needed.
5. Start one session through the existing seam/doctor path with the marker env
   set, if a SessionStart hook is needed to prove firing; stop before any model
   call.
6. Control: repeat with `--scope user` in a clean `HOME`-like temp config, to
   see the origin label for the user case.

**Branches:**

| Result | Action |
|---|---|
| `--scope project` is refused or not supported in 1.4.25 | Reword `hooks.ts`: "Muse supports a project scope in the changelog; this 1.4.25 install refused it" — no code change |
| Installs, handler is `plugin`, Muse prompts for review at install/update, gate allows | Reword the rationale to cite Muse's review (1.4.0, 1.4.24); no code change |
| Installs, handler is `plugin`, fires in a fresh clone with no review | Security fix required: gate unknown plugin handlers until accepted. Owner choice O1 selects the shape |
| Handler is `project` for project scope | Gate already covers it; correct the comment and close the finding |

**Cost:** one Linux run; a Windows repeat only if the Linux result is branch 3.
**Artifacts:** `scratch/e35-*.log`, `docs/evidence/2026-11-24-e35.json` with the
install report, write paths, origin rows, and marker result. No credentials, no
plugin contents beyond the manifest.

### E36 — Console target inventory (free, read-only)

**Question:** did the builder hide targets, or does this build lack them?

**Method:**

1. From `scratch/e31-console-network.json`, list the `/console/assets/*.js`
   URLs. Use the browse MCP (read-only session) to `fetch` each chunk in page
   context and search for: `These members`, `picked by hand`, `Service accounts`,
   `Members tagged with`, `tags`, `/api/tags`, `/api/members`.
2. Re-open `/console/wrk_01KYJ6RT2QFFJ0AXV1J2JFEQR6/policies/new` and dump the
   visible text and the target control's DOM (select/combobox/listbox). Record
   whether the control is collapsed and what options it offers.
3. Record the asset hash again; if it changed since `index-OIWtun4R.js`, say so.

**Branches:**

| Result | Action |
|---|---|
| Hand-picked/other targets exist in the DOM or bundle | A1 becomes "the target exists; the builder was not opened"; if the owner row is selectable, proceed to E37 |
| Only tag target, strings absent | A1 stands as "this build lacks the targets"; cite the string search as the method |
| Only tag target, strings present but conditional | A1 says "present in the bundle, not offered for a one-member personal workspace"; E37 optional |

**Cost:** free. **Artifacts:** `scratch/e36-targets.json`, a text dump (no PII;
member emails redacted).

### E37 — tag/policy write probe (approved; reversible)

**Question:** can a tag and a Providers policy be created through the API, and
does a compiled policy appear in `debug config`?

**Method (only if E36 finds an endpoint):**

1. Discover the tag endpoint from the bundle; create one tag on the owner
   (`POST`), record status. If 404/403/405, stop and record.
2. Create a Providers policy denying `mistral` (a provider this host does not
   use for Muse work) scoped to that tag; record the response and the policy id.
3. Wait 90 s; run `opencode debug config` and `opencode models` in this repo;
   record whether a Console source or policy appears, and whether `mistral`
   disappears.
4. Delete the policy and the tag; re-read Controls and Members; confirm the
   account is as found.

**Branches:**

| Result | Action |
|---|---|
| Policy compiles; `debug config` gains a Console source | E26 becomes "route exists; the UI gap was the blocker"; row 191's remote half moves toward measured, and E19 becomes reachable (O4 decides the turn) |
| Policy compiles; no source in `debug config` | The policy exists but the plugin cannot attribute it; keep P and say exactly that |
| Write refused | A1's "API untested" becomes "API write refused on 2026-11-24"; keep P |

**Cost:** free; account writes are reverted in-session. **Artifacts:**
`docs/evidence/2026-11-24-e37.json` with status codes and the pre/post diff of
Controls, no cookies, no token.

### E38 — grandchild survivor (1 dispatch)

**Question:** does a detached grandchild survive `host.close()` on Windows, and
does the sampler see it?

**Method:**

1. Add a fixture mode `spawn-detached`: on start it spawns
   `node -e "setTimeout(()=>{}, 60000)"` with `detached: true, stdio: "ignore"`,
   writes the pid to a file, then freezes.
2. Run the existing `windows-real` seam with that fixture; after `close()`, read
   the pid file and check liveness every 250 ms for 60 s, then twice for 20 s.
3. Record the sampler's two lists and the direct pid check side by side.
4. Run `taskkill /PID <host-pid> /T /F` after the host is gone; record exit code
   and whether the sleeper dies. Do not run it against an unrelated pid.

**Branches:**

| Result | Action |
|---|---|
| Sleeper alive, sampler blind | Document the blind spot in the orphan row; scope D142 to "the child"; owner choice O2 on the reaper |
| Sampler catches it (descendant or image) | Keep D142; record which list caught it |
| Sleeper dies on close | D142 stands more strongly; note the mechanism (job object or console teardown) if visible |

**Cost:** 1 dispatch. **Artifacts:** `scratch/e38-*.log`,
`docs/evidence/2026-11-24-e38.json`.

### E39 — `denyUnmatched` wildcard (1 H run)

**Question:** does a wildcard or tool-shaped rule under `denyUnmatched` refuse a
bridged call, or is `allowAll` genuinely the only mode?

**Method:** use the fixture/host harness that E-D24 used. Cases:

1. `{action:"tool.use", resource:"*", effect:"deny"}`
2. `{action:"tool.use", resource:"read:*", effect:"deny"}` (control)
3. a resource shaped like the MCP tool name, if the host accepts it.

Record `state.status`, `error`, and whether the model routes around.

**Branches:**

| Result | Action |
|---|---|
| Wildcard refuses the call | Row C "Authority order" says "no *scoped* rule can name an MCP tool"; `allowAll` remains the only practical mode, not the only possible one |
| Wildcard allows the call | Row stands as written; add the tested shapes |

**Cost:** one H run, no turn. **Artifacts:** `scratch/e39-*.log`.

### E40 — citation pass (free)

**Method:** build `docs/claims.md` and `docs/claims.json` from B5; verify each
row's URL/quote/state; add `as_of` and the version. Include the claims the
review corrected (Console targets, Muse scope, sandbox PRs, SEP-2663, taskkill,
Node signals) and the older ones the review did not reopen (brew, codex, a4,
Vue Doctor).

**Branches:** stale claim → correct the ledger row in the same commit; live claim
→ leave, with the quote.

**Cost:** free, ~2 hours.

---

## 4. Decision table (pre-committed)

The executor applies these without asking. `O#` means the owner chooses from §6.

| ID | Trigger | Action | Owner? |
|---|---|---|---|
| D160 | E35 branch 1 or 2 | Reword `hooks.ts`; no code | no |
| D161 | E35 branch 3 | Gate unknown plugin handlers; shape from O1 | O1 |
| D162 | E35 branch 4 | Comment fix only | no |
| D163 | E34 all pass | Claims "410 ran / 2 mode skips"; remove entries | no |
| D164 | E34 partial | Keep skip; name the row it leaves unmeasured | no |
| D165 | E34 login `EPERM` | Document the requirement; doctor note if O3 | O3 |
| D166 | E38 survivor | Orphan row scoped; reaper shape from O2 | O2 |
| D167 | E38 no survivor | D142 stands; note the list that caught it | no |
| D168 | E37 policy + source | Remote half measured; E19 turn from O4 | O4 |
| D169 | E37 policy, no source | Keep P; say "compiled but unattributable" | no |
| D170 | E37 refused | Keep P; say "API refused on date" | no |
| D171 | E36 target found | A1 wording changes; E37 optional | no |
| D172 | E39 wildcard refuses | Narrow the "only mode" sentence | no |
| D173 | E39 wildcard allows | Keep row; add tested shapes | no |
| D174 | B2 lands | Any new skip without a reason fails offline | no |
| D175 | B5 lands | `check:claims` warn-only; CI gate from O5 | O5 |
| D176 | Always | Enterprise planes P; SEP corrected; U16/U22 corrected | no |

---

## 5. Execution order and cost

1. Branch `round-26`; commit A (docs) and B1–B3 (instruments) separately.
2. E36 (free, may dissolve the Console question).
3. E34 (dispatch); apply D163/D164/D165.
4. E35 (real run); apply D160–D162; if O1, stop that thread and continue.
5. E38 (dispatch); apply D166/D167; if O2, stop that thread and continue.
6. E37 (account writes); apply D168–D170; if O4, ask once.
7. E39 (H run); apply D172/D173.
8. E40 + B4/B5; final docs; commit; report.

Budget: 3–4 dispatches (~$0.57–0.76), 2–3 real-host runs, 0–1 paid turn (O4),
one account session for E37. If E34 needs a third dispatch, stop and report the
flake rather than raise a timeout.

---

## 6. Product-sense choices for the owner (only if their branch fires)

Each is written so the default is obvious and the cost of choosing is small.

### O1. If a project-scoped plugin can carry a hook past the gate

- **A. Strict gate** — refuse `plugin` handlers until their plugin id/scope is
  accepted; one env override for CI. Safe, more friction for plugin users.
- **B. Trust Muse's review** — keep allowing `plugin`; cite 1.4.0/1.4.24. Lower
  friction; depends on the vendor's review being what the changelog says.
- **C. Gate only project-scoped plugins** — accept user-scope installs, refuse
  project-scope ones until reviewed. Middle ground; needs the scope in
  `hook/list`, which may not exist.

Steelman A: the plugin's posture is "refuse repo-supplied execution"; a scope
that can be cloned is exactly that. Strawman A: it breaks every legitimate
project-scope plugin and duplicates a review the vendor already performs.
Steelman B: Muse prompts at install and re-prompts on code change; duplicating it
adds a second trust record users will click through. Strawman B: the plugin's
one job is the boundary the vendor does not own, and "the vendor gates it" is a
sentence about a different product.

**Recommendation:** B if E35 shows a review prompt and no silent fire; A if not.
Confident either way once the transcript exists.

### O2. If a detached grandchild survives on Windows

- **A. Do nothing but document** — the SDK owns the spawn; the plugin cannot
  safely kill a tree it did not create.
- **B. Document + doctor warning** — the doctor's platform row says a detached
  helper can outlive a Windows host; users who need cleanup use a container.
- **C. Add `taskkill /PID <pid> /T /F`** — immediate cleanup, but Microsoft's
  own `/T` rebuilds from numeric parent ids: it misses orphans whose parent
  exited and can hit an unrelated tree after PID reuse (Codex #36258, pi #11854).
- **D. Ask the SDK for a job object** — the correct Windows mechanism
  (`KILL_ON_JOB_CLOSE`, membership at launch); upstream work, not this round.

Steelman C: a user closing a session expects no leftover processes, and a stale
PID is rare. Strawman C: the plugin would be the process that kills an unrelated
build because Windows reused a number. Steelman D: job objects are the OS
answer and pi shipped a 6.5 KB helper to get them. Strawman D: a preview SDK
will not grow a helper for one plugin's cleanup.

**Recommendation:** B now, D as the upstream ask; do not add C. The plugin does
not own the spawn, and `/T` is the mechanism with the known failure mode.

### O3. Windows credential linking

- **A. Document** — "linking the login needs symlink permission; without it the
  host reports the missing login".
- **B. Document + doctor note** — one line in the platform row.
- **C. Copy `auth.json`** — works everywhere; violates the no-token posture and
  leaves a second credential copy. Not recommended.
- **D. Hardlink** — same volume only, and Windows ACLs still differ from POSIX;
  not worth the branch.

**Recommendation:** B. Copying is out by A2; a doctor note is one string.

### O4. One paid turn to measure the denial wording

Only if E37 creates a policy and `debug config` shows a Console source. The turn
would use the denied provider path and record the error sentence.
**Recommendation:** yes if the Console source appears (one turn, the evidence
would close E19); no otherwise. Cost: one turn.

### O5. `check:claims` in CI

- **A. Warn-only** — no red builds on a vendor rename; drift is visible in logs.
- **B. Gate on issues/PRs, warn on URLs** — catches the cases that matter.
- **C. Full gate** — strictest, most brittle.

**Recommendation:** A for two runs, then B. The failures this prevents are
silent stale citations, not build breaks.

### O6. Windows wording in README

- **A. Keep the suite sentence factual** ("the offline suite passes on all three
  hosted runners") and no support claim.
- **B. Add "Windows support"** — not supported by the desktop evidence; not
  recommended.

**Recommendation:** A, unchanged.

### O7. Windows positioning (not experiment-derived)

The suite is green on all three runners, but the desktop is unmeasured. The
product question is what the docs promise, not what the runner proves.

- **A. Best-effort, documented** — status quo: suite green, spawn/install/close
  measured on a Server runner, desktop unverified.
- **B. Supported** — requires one hour on an owner-supplied signed-in Windows 11
  machine (doctor + one turn); until then the word is unsupported by evidence.
- **C. De-emphasise** — present Linux/macOS as the supported surfaces and
  Windows as experimental.

**Recommendation:** A now; B only after the one-hour desktop test. C would throw
away measured Windows work for a wording problem.

### O8. How far to invest in the remote policy path (not experiment-derived)

Even if E37 creates a policy, the plugin still cannot attribute a Console
statement to a decision. The question is whether that gap is worth more work.

- **A. Stop at P** — document what is known; the doctor says it cannot attribute
  a Console statement; no probe.
- **B. Ask for a diagnostic** — a follow-up to #60252 asking for a compiled-policy
  source line or a local read; cheap, no code.
- **C. Build a deny-by-effect probe** — side-effectful, ambiguous (a refusal
  cannot distinguish policy from misconfiguration), and spends a turn. Round 21
  rejected this; keep it rejected.

**Recommendation:** A, plus B if the owner wants a vendor conversation. C is the
option the existing no-probe rule exists to prevent.

---

## 6b. Results

| Item | Command / run | Result | Branch applied | Cost |
|---|---|---|---|---|
| A | commit `fc3e023` | Console wording narrowed; enterprise X→P; U16/U22/SEP/OS fixed | D176 | free |
| B1 | `bun scripts/junit-summary.ts scratch/junit-final` | v2 snapshot: skipped/assertions/per-suite/arch fields | D174, D175 | free |
| B2 | `npm run check:offline` | 452/0 local; five skips declared, then three | D174 | free |
| B4 | workflow | `RUNNER_ARCH` X64 / ARM64 in the artifacts | — | free |
| B5 | `bun scripts/check-claims.ts` | 15/15 current; npm registry URL avoids the 403 | D175 (warn-only) | free |
| E34 | runs 45302325853, 45302817218 | 419 declared; Windows 416 ran / 0 fail / 3 skipped; frozen and login pass | D164 (EOF kept skipped), no O3 | 2 dispatches |
| E35 | `muse plugins install ./plugin --scope project`; approve; hook test | install is user-store, `project-trusted`; hook `review_needed` until approve; test fires | D160 | one real run |
| E36 | bundle `controls-Bf3Y4t9I.js` + live menu | 9 targets, including `members`/`except-members`; E31 read the collapsed trigger | D171 | free |
| E37 | Console UI, one reversible policy | compiled into `debug config`'s `document`; models unchanged; deleted | D169 | account writes, reverted |
| E38 | run 45304563000, job 138145110157 | detached grandchild not a survivor; 239 samples, 0 failed; no taskkill | D167, no O2 | 1 dispatch |
| E39 | — | blocked: needs a bridged call and a model turn; O4 did not fire | not applied | none |
| E40 | `docs/claims.md` + checker | 15/15 current | — | free |

**Deviations from the plan.** E34's first dispatch failed the EOF arm with a 15 s
`close()` timeout; the pid dies but the promise does not settle after the
transport closed, so the arm stays POSIX and is declared in the ledger (D164).
E36 changed A1's Console sentence: the hand-picked target was in the menu all
along. E37 was a UI write, not an API write, and produced a statement inside the
`document` source rather than a Console-typed source, so D169 applied and O4 did
not fire. E38 produced no survivor, so D167 applied and O2 did not fire. E39 is
blocked, not passed.

**Not reopened.** The four older external claims (brew, codex, a4, Vue Doctor)
were outside the review's fifteen; the claims table carries the fifteen the review
opened, plus the install/approval and MXC rows E35/E36 needed.

---

## 7. Risks

- **Account writes (E37)** can leave a tag or policy behind. Mitigation: delete
  and verify in the same session; record pre/post; no second workspace, no
  invite without an email.
- **E35 can be confounded by Muse's own review.** Record the install output
  before inferring anything from the hook firing.
- **E38's taskkill test can hit an unrelated process** if the PID is stale.
  Only target the fixture's own recorded pid, immediately, and stop on a
  mismatch in creation time if one can be read.
- **E34's Windows port can overfit to the fixture.** Assert semantics (pid
  dead, no terminal after freeze), not timings; keep the 4 s budget.
- **Doc drift while experiments run.** Land A first; each experiment's result
  edits only its own rows.
- **Search sources age.** Every external claim gets `as_of`; a live check is B5.

---

## 8. Definition of done

- A merged into `round-26` with no forbidden absolutes left.
- B1–B5 in, `check:offline` green, snapshot v2 present.
- E34–E40 each either run (with result in this file and an artifact) or blocked
  with the reason and the sentence it leaves unweathered.
- D160–D176 applied; only O1–O8 remain open, each with a recommendation.
- `git status` clean except `docs/integration-landscape.md`; no `main`, no tag.
- Final report: per experiment command/result/branch/cost; doc changes; checks;
  unmeasured items with reasons.
