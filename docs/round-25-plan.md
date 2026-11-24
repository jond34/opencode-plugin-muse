# Round 25 plan: make the record reproducible

**Written** 2026-11-23, from `docs/evidence-audit.md` (commit `ae8306c`, branch
`round-24`). The audit found nine weaknesses in the evidence behind product
decisions. This round closes the ones that can make a *future* decision wrong, and
settles the one platform path the record currently leaves unnamed.

The theme is different from rounds 22–24. Those added claims; this one makes the
claims checkable by someone who was not here: a number that comes from an artifact,
a probe that cannot report a clean result from a failed read, and a suite that
cannot shrink without saying so.

## 1. What is actually open

| Audit item | Status | This round |
|---|---|---|
| F1 count 13 vs 14 | **fixed** in `ae8306c` | guard against recurrence (E28) |
| F2 "scoped" → "names one workspace" | **fixed** in `ae8306c` | scope probe only if an owner choice says yes (E32) |
| F3 #54806 cited as support | open | one-sentence correction (E33) |
| F4 #28186 closed duplicate | open | re-cite open #63257/#49929 (E33) |
| F5 gh truncation stated as permanent | open | version the rule (E33) |
| F6 suite can shrink silently | **reproduced on bun 1.4.4** | guard test (E28) |
| F7 orphan sampler fails open | open | hardening + one dispatch (E29) |
| F8 15 s Windows budget unnamed | open | instrumented run (E30) |
| F9 E26 has no Console build pin | open | build pin + request capture (E31); tag path if it exists (E32) |

Two facts that set the shape:

- `bun test ./test/version.test.ts ./test/does-not-exist.test.ts` on bun **1.4.4**
  runs 3 tests and exits **0**. The `./` prefix does not help when another path
  matches; `oven-sh/bun#44002` is open. So no runner flag fixes F6 — the fix is a
  test that reads the list.
- The Console is a web app. Its own requests are observable, which is a stronger
  instrument than a disabled button's appearance, and it needs no policy to be
  created (F9).

## 2. State at the start

- Branch `round-24`, HEAD `ae8306c`; `ci/seam` points at `7d154fe`, `ci/real` at
  the E27 commit. `main` is untouched; nothing is pushed from this round yet.
- `docs/evidence-audit.md` is the audit; `docs/platform-support.md` owns counts;
  `docs/policy-remote.md` owns the Console record; `docs/decision-coverage.md` owns
  the ledger.
- Instruments: bun 1.4.4, node 24.22.1, gh 2.102.0, opencode 2.4.1, Muse
  1.4.25-R9361.1, Console workspace `Default` / `wrk_01KYJ6RT2QFFJ0AXV1J2JFEQR6`.
- The last Windows cell is 405/1 (`junit-windows-latest`, run 45289611552), the one
  failure being `resume after a watchdog kill` at 15.068 s.

## 3. Experiments

### E28 — a test that cannot let the suite shrink (free, local)

`test:offline` names 38 files; three do not exist in a runner checkout
(`test/bench.test.ts`, `test/bench-stats.test.ts`,
`test/native-history-harness.test.ts`). Bun treats an unmatched path as a filter,
so a rename runs 380-odd tests and exits 0.

Build:

1. `scripts/suite-list.ts` —
   `missingFromSuite(pkg: {scripts?: Record<string,string>}, exists: (p: string) => boolean, localOnly: readonly string[]): string[]`
   parses the `test:offline` command, splits on whitespace, keeps entries starting
   `test/`, and returns those the predicate rejects **and** that are not declared
   local-only. The `localOnly` argument is what makes the guard work on both frames:
   locally the three gitignored files exist, on a runner they do not, and neither is
   a missing test (verified in the prototype: 38 listed, 3 excused, `[]` missing).
   No dependencies.
2. `test/suite-list.test.ts` — three cases:
   - the real `package.json` and real filesystem return `[]` (the case that passes on
     a runner), **and** `LOCAL_ONLY` equals the listed entries that `git ls-files
     test` does not track. Measured 2026-11-23: 38 listed, 35 tracked, and the three
     untracked are exactly `test/bench.test.ts`, `test/bench-stats.test.ts` and
     `test/native-history-harness.test.ts` (`.gitignore:25-27`). That equality is
     what keeps the excuse from widening: commit one of the three and the test fails
     until the list shrinks;
   - a synthetic `["test/version.test.ts", "test/gone.test.ts"]` with the second
     missing and nothing excused returns `["test/gone.test.ts"]` — the checker
     fails, it does not merely pass today;
   - the same synthetic list with the second path in `localOnly` returns `[]`, so
     the parameter is shown to be what excuses a path, not a blanket skip.
3. Add the new test to `test:offline`.

Gate: `bun run check:offline` green; deliberately renaming a listed file locally
makes the new test fail with that path named (revert immediately).

Cost: no run. ~25 lines.

### E29 — the orphan probe must fail loudly, and the claim must match the filter (free + one dispatch)

Two narrowings in `test/seam/windows-real.mjs` (audit F7):

1. **Fail-open.** `museProcesses()` returns `[]` on any `powershell` error, and the
   final sample is what decides a survivor. Change it to return
   `{rows, ok}`; have `sampleFor` count `failedSamples`; add
   `check("E16c every sample succeeded", failedSamples === 0)`. A failed query then
   produces an inconclusive cell, not a pass.
2. **Filter scope.** The CIM filter is `Name LIKE 'muse%'`, so the claim is about
   processes whose image begins with `muse`. Two choices, and the experiment
   measures rather than argues:
   - keep the image filter and narrow the sentence in the docs to match it;
   - additionally collect descendants: rows carry `CreationDate`, and a child is a
     descendant when its `ParentProcessId` equals a pid this run spawned **and** its
     `CreationDate` is not earlier than that parent's (Microsoft documents PPID
     reuse and prescribes exactly this check). No new dependency; one extra field in
     the existing CIM call.

Ship both: the counter always, the descendant walk in the same script, printed as a
separate list so the record shows both numbers.

Gate: run `ci/real` (one dispatch). Outcomes:

- survivor in either list → reopen D150 with the pid, image, parent and creation
  times, and propose the reaper;
- zero survivors and zero failed samples → D150 stands; the docs sentence gains
  "image `muse*` or a recorded descendant of the spawned pid, every 250 ms, every
  sample successful";
- any failed sample → inconclusive; re-run once, then record it as inconclusive.

### E30 — where the 15 seconds go (free + one dispatch, no paid turn)

`resume after a watchdog kill` takes 4.07 s on POSIX and 15.07 s on Windows with
the 15 s budget, producing no terminal. Three different facts fit; the suite cannot
tell them apart (audit F8).

Instrument, change no assertion:

- emit `MUSE_RESUME_TRACE=1`-style lines from the test at four points: turn start,
  watchdog kill fired, `session/resume` sent, terminal received;
- print each segment's duration on failure, and the last point reached on success;
- keep the 15 s budget so the failing case still completes the measurement rather
  than being cut off at 4 s.

Gate: run `ci/seam` (one dispatch; the matrix includes `windows-latest`). Outcomes:

| Reading | Conclusion | Next |
|---|---|---|
| kill never fires within 15 s | watchdog timer path is broken on Windows — a user-facing hang | product fix, new E34; the platform claim narrows to "suite green except the timeout path" |
| kill fires, `session/resume` sent, no terminal | host-side or fake-host; distinguish by the host's stderr | one more instrumented run before any product change |
| all four points quick, terminal arrives after ~15 s | the fake host's cold start, not the plugin | restore 4 s and record why (this is the cheapest outcome) |

Do not raise the budget again, and do not skip the test, until one of those rows is
named.

### E31 — pin the Console build and read its own requests (free, read-only)

E26's claim ("the builder targets member tags; no tag control exists") is a UI
absence claim with no build recorded (audit F9).

1. Record the build: the page's footer/version string, or a response header such as
   `x-…-version` from any Console request. Put it in `policy-remote.md` beside the
   observation, with the date.
2. Capture the policy page's own requests through the existing browser session
   (network panel or HAR). Read-only: open `/policies/new`, let it load, export the
   request list. Look for an endpoint that takes a tag id or a member id.
3. Redact before anything is written down: drop `email`, `accountID`, cookies and
   bearer headers. The workspace id is already public in this repo's docs and may
   stay.

Outcomes:

- **an endpoint exists that accepts a tag id or member id** → "cannot create a
  policy" becomes "the UI cannot create a tag". E32 can then ask to create one tag
  and one provider rule through that route, but a Console *write* still needs an
  explicit yes — the standing approval covers experiments, not account state.
- **no endpoint beyond rendering** → E26 stands; add "UI gap in build <x>" and the
  recheck condition "a Console build with a tag control".

### E32 — scoped or labelled (conditional; owner decision Q3)

Only if E31 finds a usable route, or the owner allows a second workspace.

- Arm A (second workspace): read a resource in workspace 2 with the credential that
  `metadata.orgID` names workspace 1. Answers "scoped" directly.
- Arm B (no second workspace): request a resource under a fabricated `wrk_` id and
  record the status. Only conclusive if 403 and 404 are distinguishable; if they
  are not, this arm is recorded as inconclusive and nothing changes.
- Arm C (no-op): keep "names exactly one workspace" and mark scope unmeasured.

Cleanup for Arm A: delete anything created, then re-read the credential row and
`opencode auth list` to show the original state.

### E33 — citations that outlived their trackers (free)

Apply the audit's F3–F5 corrections:

- turn-cap row: cite E-D52 as the evidence; add "vendor closed #54806
  `not_planned`; #53356 is open for the subagent-depth variant, which this plugin
  does not use (D21)";
- MCP Tasks row: cite open #63257 / #49929 instead of closed-as-duplicate #28186;
- gh rule: "on gh ≤ 2.102.0, `--log` drops the rest of a step after a >64 KiB line
  and exits 0 (#15019, closed 2026-11-18); quote job logs from the API when a count
  goes into a record."

Add a `Recheck` column to the claims table for rows whose evidence expires (artifact
retention, tracker state, Console build), so a stale row is visible before someone
reads it.

## 4. Decisions and what flips each

| ID | Decision | Chosen now | Flips on |
|---|---|---|---|
| D153 | How the suite list stays honest | Guard test that names the three local-only files (`E28`) | Bun ships `#44002` **and** the invocation prefixes every path; even then the guard is harmless, so this is a low-stakes keep |
| D154 | What the orphan claim covers | "No process whose image begins with `muse`, or a recorded descendant of the spawned pid, survived any sample; every sample succeeded" (`E29`) | A survivor in either list, or a failed sample that repeats |
| D155 | The Windows resume row | Unnamed until `E30` names the segment; test stays red, budget stays 15 s | `E30` row 1 → product bug; row 3 → 4 s restored with the reason recorded |
| D156 | E26's shape | "UI gap in Console build <x>; compile unmeasured", with the build pinned (`E31`) | A tag or member-target endpoint appears → `E32` becomes possible |
| D157 | Scope wording | "Names exactly one workspace id; refusal in another workspace unmeasured" (`E32` Arm C) | Arm A/B produces a distinguishable 403 |
| D158 | Where numbers live | `platform-support.md` table stays the owner; every row cites run id or command; no generated manifest (Q4) | A second consumer of the counts appears (a README badge, a release gate) |
| D159 | CI cadence | Monthly unchanged; the Windows cell may be red while `D155` is unnamed, and a red cell with a named cause is not hidden | The Windows cell stays red for two rounds with no movement → Q1 |

## 5. Order, cost, and why this order

F28 first (free, and it protects every later count), then E33 (free, pure editing),
then E30 and E29 in either order (one dispatch each), then E31 (free, read-only),
then E32 if it is unlocked.

| Item | Dispatches | Paid turns | Wall time |
|---|---|---|---|
| E28 | 0 | 0 | 20 min |
| E33 | 0 | 0 | 20 min |
| E29 | 1 (`ci/real`) | 0 | 15 min + dispatch |
| E30 | 1 (`ci/seam`) | 0 | 15 min + dispatch |
| E31 | 0 | 0 | 20 min |
| E32 | 0 | 0 | 20 min, conditional |
| Docs + verify | 0 | 0 | 40 min |

About $0.38 at the measured rate. No paid Muse turn: every question here is about
instrumentation or the Console's own surface.

## 6. Risks and instrument errors

- **bun's filter fallback** is the reason E28 exists; do not "fix" it by prefixing
  paths, which was tested and does not work on 1.4.4.
- **CIM PPID reuse**: a pid can be reused after the parent dies, so a descendant
  match must compare `CreationDate` (Microsoft's own guidance). Without it, the walk
  can name an unrelated process as a survivor.
- **Runner job objects**: a hosted runner may reap a tree that a desktop would leak.
  The claim stays "none observed in the measured case", never "cannot happen".
- **JUnit artifacts expire** (90 days). A count that only lives in an artifact is
  temporary; that is Q4.
- **HAR captures contain PII**: the Console session's headers carry cookies, email
  and account id. Store nothing raw; write the endpoint list and the build string
  only.
- **gh 2.102.0 truncates** `--log` after a long line; use `gh api` for any log that
  feeds a count.
- **Do not raise a timeout to make a test pass** unless the segment that consumes it
  is named in the same commit.

## 7. Product questions (raised after the experiments)

Each is a binary with a recommendation, so the decision layer stays small. Details
and the opposing case are in §8.

- **Q1 — Windows cell with one known failure.** (A) Keep it red and let the Windows
  job fail until the cause is fixed. (B) Move the one test to a named
  known-failure list run by a separate non-gating job, so the gating job can be
  green. **Recommend A while E30 is pending; revisit B only if E30 names a fixture
  cause.** A red cell with a named cause is information; a red cell everyone has
  stopped reading is not.
- **Q2 — What the orphan sentence claims.** (A) Processes whose image begins with
  `muse`, plus recorded descendants, with the sample-success count stated.
  (B) Any process at all. **Recommend A**: B needs a whole-table diff and would
  claim more than the seam can attribute to this plugin.
- **Q3 — Spend a second Console workspace to prove scope.** (A) Yes, if the Console
  allows creating one and it can be deleted cleanly. (B) No; keep "names one
  workspace" and mark scope unmeasured. **Recommend B unless E31 unlocks an API
  route**, because a doc sentence is not worth a new account surface, and Arm B may
  not distinguish 403 from 404 anyway.
- **Q4 — Do counts get a committed snapshot?** (A) Commit a small
  `docs/evidence/<date>-<sha>.json` per dispatch (tests, failures, OS, run id) so a
  cited number survives artifact expiry. (B) Rely on artifacts and run ids.
  **Recommend A for the three numbers the docs actually cite** — it is ~15 lines and
  it is the only thing that makes F1 impossible to repeat.
- **Q5 — Where the audit lives.** (A) Keep `docs/evidence-audit.md` as its own file,
  linked once from the ledger. (B) Fold it into `decision-coverage.md`.
  **Recommend A**: the ledger is categorical; the audit is dated and narrative.
- **Q6 — The Windows desktop claim.** (A) Keep it pending, but say "unverified
  until an owner-supplied machine exists" so it stops reading like a step anyone can
  take. (B) Retire it: state Windows as **runner-verified only** (suite, resolver,
  install, close) and remove the desktop row until a machine appears. **Recommend
  A** for one round — it costs nothing and a machine may appear — with B as the
  default if the next round ends without one. This is the only question here that
  cannot be closed by any experiment, because it needs hardware rather than an
  instrument.

## 8. Steelmen and strawmen

**Q1, keep it red.** Steelman: CI exists to tell you what changed; a red cell that
only a named product question explains still blocks a merge that makes it worse.
Strawman: "honesty means never going green." The strongest counter-case is a team
that stops reading a permanently red job — that is B's real argument, and it wins
only when nobody is looking at the failure any more.

**Q1, known-failure lane.** Steelman: Swift's "expected failure" and Go's
`t.Skip` with an issue link preserve intent better than a red that trains people to
ignore colour. Strawman: "known failures are how suites rot." The distinction that
matters is whether the list is enumerated in one place with an owner and a recheck
date.

**Q2, narrow claim.** Steelman: a claim should be about what the seam owns; a
whole-table diff says "this plugin caused nothing anywhere", which no probe can
support. Strawman: "if we widen enough we will eventually be right."

**Q3, second workspace.** Steelman: a word like "scoped" is a security claim, and
security claims should be measured or dropped. Strawman: "create account resources
to defend a sentence", when the sentence can simply be weaker and true.

**Q4, committed snapshot.** Steelman: the docs cite numbers that outlive the
artifacts that prove them, which is exactly F1. Strawman: "commit every CI artifact",
which turns the repo into a log store.

**E30's premise.** Steelman for "it is a product bug": a Windows-only session
method hang has an open upstream witness (`anomalyco/opencode#64686`, ACP session
methods hanging on Windows), and platform-specific hangs are exactly the class that
a 4 s → 15 s budget would hide. Strawman: "Windows is slow, raise the budget" —
which is what produced the current unnamed 15 s.

## 9. Conditions for confidence

- A reader who was not present can recount every number in `platform-support.md`
  from a run id and an artifact, or from a committed snapshot.
- Renaming a listed test file turns the suite red with that path in the message.
- `scratch/win-samples.log` shows, for each cycle, a successful sample count and
  both survivor lists (image-matched and descendant).
- The Windows resume row names one of E30's three segments, or says "unnamed" and
  states what would name it.
- `policy-remote.md` carries a Console build string and a request list with no PII.
- No claim says "scoped", "cannot", or "none" without its frame and its confound.

## 10. Prohibitions (inherited)

- Never commit to `main`, tag, publish or submit. Never stage
  `docs/integration-landscape.md` (owner's uncommitted edit).
- Harness CLIs under `zsh -lc`, never `bash -lc`; Python through `uv`.
- No new dependency; scratch in `scratch/`.
- No `timeout-minutes` to hide a queue.
- Console changes reverted in the same session, with the cleanup reads pasted into
  the plan.
- Nothing from the Console's HAR beyond endpoint shape, build string and the
  workspace id.

## 11. Definition of done

1. `bun run check:offline` green, including the new `test/suite-list.test.ts`.
2. Both dispatches read, with their artifacts or job logs cited by id.
3. `docs/evidence-audit.md` items F3–F9 marked closed or explicitly deferred, each
   with the reason.
4. `docs/platform-support.md` claims table carries a `Recheck` column, and no row
   states a number without an artifact or snapshot.
5. `docs/round-25-plan.md` gains a results section: per-experiment command, result,
   gate, cost, and the decision it moved.
6. `git diff --check` clean; `git status` shows only round-25 files plus the owner's
   uncommitted `docs/integration-landscape.md`.

---

## 12. Results

Branch `round-25`, stacked on `round-24`. Four dispatches, no paid turns, no new
dependency. Runs: 45294979663 (E30, first), 45295160232 (E29), 45295871849 (E30,
second), 45296080862 (final matrix at 4 s).

### E28 — suite-list guard (free, local)

`scripts/suite-list.ts` + `test/suite-list.test.ts`, added to `test:offline`.
Result: 4 cases pass. Gate reproduced — renaming `test/version.test.ts` fails the
guard with that path in the message; restored, green again. Suite is 443/0 across
39 files locally.

Deviation from the plan: the planned "exactly the untracked subset" assertion
cannot hold before the guard file itself is committed, and an `exists` that rejects
local-only paths returns `[]` because the allowlist excuses them regardless. The
test now asserts each `LOCAL_ONLY` entry is **both untracked and gitignored**, and
that the list has three entries, which is the property that matters: a published
test can never be excused.

Also corrected: the gitignored trio is `.gitignore:25-27`, not 24-26 (the plan and
the platform doc both said 24-26).

### E33 — citations and the Recheck column (free)

F3/F4/F5 applied. Turn-cap row cites E-D52 and records that the vendor declined
#54806; MCP Tasks rows point at open #63257/#49929; the `gh` rule is versioned to
gh ≤ 2.102.0 with #15019 closed 2026-11-18. `platform-support.md`'s claims table
gained a `Recheck` column on all nine rows.

### E30 — where the 15 s went (two dispatches)

First run 45294979663, Windows job 138112958152: kill observed at **+131 ms**, no
terminal at 15 s. That ruled out "slow cold start" and put the failure in the
fixture: `freeze-after-start` calls `process.kill(pid, "SIGSTOP")`, which Windows
does not support — the throw killed the child, the turn's `turn/started` never
arrived, and the adapter deliberately retires an unannounced turn without a
terminal (contract rule, not a bug).

Fix: `freezeForever()` — `Atomics.wait` on a shared buffer on win32, `SIGSTOP`
elsewhere. Second run 45295871849, Windows job 138115971364: terminal at **260 ms**,
host gone at 2.275 s, `reopen.resumed` at 2.32 s, events
`turn.updated,turn.terminal,session.updated`. With the budget returned to 4 s,
run 45296080862 is green on all three systems.

Gate outcome: the middle row of the table — kill fires, nothing after it — but the
cause was the instrument, not the plugin. The `host_idle_timeout` path is now
measured on Windows, and the 15 s budget is gone rather than documented.

### E29 — sampler hardening (one dispatch)

Run 45295160232, real-windows job 138113568167: `PASS E16c baseline sample
succeeded`, `3/3` handshakes, `probe saw the live host`, `every sample succeeded —
failed=0`, `survivors=[]`, no survivor in either list. The full-table query with
`CreationDate` and the descendant walk cost no measurable time (three cycles still
60 + 20 + 20 s, dominated by the sampling windows).

Gate outcome: D150 stands with the sharper sentence — image `muse*` **or a linked
descendant**, every 250 ms, every sample successful. The instrument now states its
blind spot: a child whose parent has already left the table is unattributable and
counted by neither list.

### E31 — Console build pin and request capture (free, read-only)

Build pin: `/console/assets/index-OIWtun4R.js`, observed 2026-11-24 (no footer
version, no `x-…-version` header). The builder is at
`/console/<wrk-id>/policies/new`; `/console/policies/new` without the workspace
segment is a 404, which is worth knowing before quoting a URL.

Requests (GET only, cookies and email never recorded): `/console/api/policies`,
`/console/api/members?page=1&pageSize=100`, `/console/api/orgs/current`,
`/console/api/orgs?expect=<wrk-id>`, `/console/api/auth/session`,
`/console/api/invites`. No tag endpoint, because no tag exists to read.

The find: the members page's per-member menu (never opened in round 24) has only
"View details" and "Remove…", and the builder's "Tag members first" link points at
that page — so the control is absent from the page the builder sends you to. But
the client bundle carries a tag model: the member schema includes `tags` and the
members list accepts a `tags` filter. So tags exist server-side; only the UI cannot
create one.

Gate outcome: no tag-create endpoint observed, so E32 is not unlocked and E26 is
pinned. The claim narrows to "this build cannot create a member tag", not "tags are
unsupported".

### E32 — not run (Arm C)

The owner's answer on Q3 was no unless E31 unlocked a route; it did not. The doc
keeps "names exactly one workspace id; refusal in another workspace unmeasured".

### Q4 — committed snapshot

`docs/evidence/2026-11-24-791840c.json`: 410/0 on each of three hosted systems,
36 published files, 443/0 local across 39. Read from the JUnit artifacts'
`testsuites` attributes, not counted by hand.

### Decision table, as taken

| ID | Taken | Because |
|---|---|---|
| D153 | Guard test; published frame is 410/36 | Renaming a file now fails, and the allowlist cannot excuse a tracked test |
| D154 | Orphan claim: image or linked descendant, every sample succeeded | E29 measured both lists and zero failed samples |
| D155 | Windows resume row: 4 s budget, green, `host_idle_timeout` measured | E30 showed the 15 s measured a `SIGSTOP` crash |
| D156 | E26: UI gap in build `index-OIWtun4R.js`; tags exist server-side | E31's request list and bundle schema |
| D157 | Scope wording unchanged, scope unmeasured | Q3 = no; E31 found no API route |
| D158 | Counts live in the table + a committed JSON snapshot | The artifact expires 2027-02-21; the docs outlive it |
| D159 | Cadence unchanged | The Windows cell is green; no known-failure lane needed |

### Owner answers, recorded

- **Q1:** red while E30 was pending — and it stayed red, which is how the fixture
  bug was found; no known-failure lane is needed now.
- **Q2:** the narrow claim (image + linked descendant), implemented in E29.
- **Q3:** no second workspace; E32 stays at Arm C.
- **Q4:** implemented.
- **Q5:** the audit stays its own file, linked from the ledger.
- **Q6:** pending for this round, with the wording "unverified until an
  owner-supplied machine exists"; retire to runner-verified-only if the next round
  ends without one.

### Costs

Four dispatches (~$0.76 at ~$0.19 each), zero paid Muse turns, no new dependency.
Two more than the plan: the second E30 measurement the gate table asked for, and
one confirmation run after the budget returned to 4 s. Both happened because a
measurement contradicted the plan, which is the case the plan says to follow.
