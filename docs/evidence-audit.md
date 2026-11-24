# Evidence audit: where the record is thinner than the decision

**Written** 2026-11-23, on branch `round-24` (HEAD `089af9e`). This is a re-read
of the evidence behind product decisions, not a new round. Each finding names the
decision it supports, what the record says, what re-reading found, and the
smallest thing that would settle it.

Method: every load-bearing claim was traced back to a run id, a job log, an
artifact, a source file or a command that can be re-run today. Upstream citations
were re-fetched from the tracker rather than trusted from the docs. Where a
retained log existed, the number was recounted from it.

Verdict: the decisions themselves hold. Three pieces of *evidence* do not, one
count is wrong, and two instruments can fail open. None of it reverses a decision;
two sentences currently claim more than the measurement shows.

A wider re-review of every decision's evidence, including the fifteen claims that
do not carry as written, is in `docs/evidence-review-2026-11-24.md`.

## Round 25 status (2026-11-24)

| Item | Status | Where |
|---|---|---|
| F1 count 13 vs 14 | **closed** in `ae8306c`; recurrence guarded | `test/suite-list.test.ts` (E28) |
| F2 "scoped" label | **closed** as wording; scope still unmeasured | `docs/policy-remote.md`; E32 Arm C, owner said no |
| F3 #54806 citation | **closed** | `docs/decision-coverage.md` §B, turn-cap row |
| F4 #28186 duplicate | **closed** | same file, MCP Tasks row and §C prose |
| F5 gh truncation tense | **closed**, now versioned to gh ≤ 2.102.0 | `docs/platform-support.md`, E22 section |
| F6 suite can shrink | **closed**; renaming a listed file now fails | `scripts/suite-list.ts`, `test/suite-list.test.ts` |
| F7 orphan sampler fails open | **closed**; failed samples fail the run, descendants counted | `test/seam/windows-real.mjs`; E29 run 45295160232 |
| F8 15 s unnamed | **closed**; cause was the fixture's `SIGSTOP`, budget back to 4 s | `test/fixtures/fake-msp-host.mjs`; E30 runs 45294979663, 45295871849 |
| F9 E26 unpinned | **closed**; build `index-OIWtun4R.js`, request list recorded | `docs/policy-remote.md`; E31 |

Two findings changed shape under measurement rather than argument: F8's cause was
an instrument that could not express "frozen" on Windows, and F9's absence is
narrower than written — tags exist in the Console's data model, only this build's
UI cannot create one. The rest closed as the audit proposed.

## Round 26 status (2026-11-24)

The live table is in `docs/round-26-plan.md` §Status; this one records only what
landed, so the two cannot disagree about counts.

| Item | Status | Where |
|---|---|---|
| A. Claim corrections | in progress | `policy-remote.md`, `decision-coverage.md`, `platform-support.md`, `round-25-plan.md` |
| B1. JUnit summary | done | `scripts/junit-summary.ts`; `docs/evidence/2026-11-24-ab5358f.json` |
| B2. Skip ledger | done | `scripts/skip-ledger.ts`; three Windows skips declared |
| B4. `runner.arch` | done | `.github/workflows/test.yml`; X64 / ARM64 in the artifact |
| B5. Claims table | done | `docs/claims.md`; 15/15 current |
| E34. Windows coverage | done | run 45302817218: 416 ran / 3 skipped; EOF close-promise gap |
| E35. Hook scope | todo | round-26 plan |
| E36/E37. Console route | todo | round-26 plan |
| E38. Grandchild | todo | round-26 plan |
| E39. `denyUnmatched` wildcard | todo | round-26 plan |

---

## F1 — The Windows failure count is wrong: 13, not 14

**Decision:** D147 (Windows suite status), and the E22 record in
`round-24-plan.md` §7a and `platform-support.md`.

**Record says:** "reported **14** failures", split "nine POSIX fixtures, three
`hook gate` refusals, one product bug, one timing failure".

**Re-read:** the first Windows dispatch is run 45270085792, job `138027278561`.
That job's log, fetched with `gh api .../jobs/138027278561/logs`, ends with

```
391 pass
  2 skip
 13 fail
Ran 406 tests across 35 files.
```

and lists exactly 13 failures in its own summary block:

| Group | Tests | Cause |
|---|---|---|
| `hook gate` | 3 | fixed by `1efa66d` (canonicalize on write) |
| `the plugins row` | 2 | the `isPackage` product bug — `C:\…` read as a package name |
| `host config` | 3 | a `0700` mode Windows ignores, a symlink, a POSIX literal comparison |
| `toolset observation` | 2 | POSIX roots compared against a win32 `join` |
| `the policies row` | 1 | a home-directory fold spelled with forward slashes |
| `file permissions` | 1 | the same `0700` mode |
| `resume after a watchdog kill` | 1 | timing |

So 3 hook gate + 2 product + 7 fixtures + 1 timing = **13**. The "9 fixtures / 1
product" split in the docs is wrong in both directions, and the total is off by
one. The later counts are solid: run 45289276968 → 3 (`scratch/win2.log`), run
45289611552 → 1 (`junit-windows-latest`, `failures="1"`, `tests="406"`).

**Why it matters:** the number is quoted in a claims table that is supposed to be
the single owner of counts (D151). A count that cannot be reproduced from its own
run undermines the table's authority more than the error itself.

**Path:** cut the 14 to 13 and the split to the table above, citing job
`138027278561`. Then make the count mechanical: the JUnit artifact already carries
`tests`/`failures`, so the claims table cites the artifact's own numbers, never a
hand count from a log. Cost: two sentences, no run.

---

## F2 — "Scoped to the workspace" is a label, not a measurement

**Decision:** D148, and the E25 paragraph in `policy-remote.md`.

**Record says:** "its `credential` table holds one active `opencode` row … whose
value contains `wrk_01KYJ6RT2QFFJ0AXV1J2JFEQR6` … **The stored token is scoped to
that workspace**". `platform-support.md`'s claims table repeats it: "The Console
credential is scoped to workspace `Default`".

**Re-read:** the value is a JSON object, not a token with inspectable claims:

```json
{"type":"oauth","methodID":"device","refresh":"rt_…","access":"st_…",
 "expires":…,"metadata":{"server":…,"accountID":…,"email":…,
 "orgID":"wrk_01KYJ6RT2QFFJ0AXV1J2JFEQR6","orgName":…}}
```

The workspace id lives in `metadata.orgID` — a *client-side label* the app writes,
alongside `email` and `accountID`. The tokens are 39-character opaque strings with
no scope to read. What the evidence proves is: **one active credential, labelled
with exactly one workspace id, and no second binding record**. It does not prove
the token is rejected for another workspace, because there is no second workspace
to try it against.

**Why it matters:** round 24's correction was specifically "binding rested on a
label; E25 replaced it with a direct read". The read is direct, but the *claim*
rests on `orgID` being authoritative — which is the same shape of inference as
the `Default` label it replaced, one layer down.

**Path (cheap → decisive):**

1. Reword now to what the read shows: "the stored credential carries exactly one
   workspace id (`metadata.orgID`) and there is no second binding record." No run.
2. To prove *scope*, spend one probe: ask the API for a resource in a workspace
   the token does not name, and record the status. That needs a second workspace
   in the account, which is an owner decision, and a scratch resource to read
   (or a 403 on a name that cannot exist). This is the only step that turns
   "labelled" into "scoped".

---

## F3 — A citation that says the opposite of the claim it supports

**Decision:** the turn-cap row in `decision-coverage.md` §B (D39: the plugin
builds no cap; `agent.<name>.steps` is the knob).

**Record says:** "on v2 (retested on 2.0.27, `anomalyco/opencode#54806`) the call
at the limit is refused with 'Tools are disabled after the maximum agent steps'".

**Re-read:** #54806 is closed **`not_planned`**, twenty minutes after it was
opened, and its body reports the opposite — with `steps: 2` the loop "keeps
sending requests with the full tool list until it is killed". Open issue #53356
(`subagent: tool remains advertised at the maximum session depth`) carries the
same symptom for subagents. The claim in the row is true *for this path* only
because round 10 measured it: E-D52 saw the third step of three come back as the
capped text answer, with tools in play. The citation adds nothing and misleads a
reader who opens it.

**Path:** cite E-D52 as the evidence, and add one clause: "the vendor declined
#54806 (`not_planned`); #53356 is open for the subagent-depth variant, which this
plugin does not use (D21)". Cost: one sentence.

---

## F4 — A stale citation under a live decision

**Decision:** the MCP Tasks row in `decision-coverage.md` §C (no task handle
returned from `tools/call`; no polling client).

**Record says:** "opencode's own MCP client … sends no progress token at all
(`anomalyco/opencode#28186`), so a handle would never be polled".

**Re-read:** #28186 was closed as a **duplicate** on 2026-06-10. The behaviour it
describes is still absent, but the live witnesses are open issues: #63257
(`client-mcp: expose native tool invocation identity, progress and cancellation to
handlers`) and #49929 (`Surface MCP tool progress in the TUI`, itself reviving a
closed duplicate). Citing a closed duplicate as standing evidence is how a row
goes stale without anyone editing it.

**Path:** point the row at #63257/#49929 (open), keep the MSP half (`MspMethod`
has no task-get) as the primary reason, and add the recheck condition "an opencode
release that sends `progressToken` on `tools/call`".

---

## F5 — The truncated-log citation has expired upstream

**Decision:** the instrument rule in `round-24-plan.md` ("use `gh api …/jobs/<id>/logs`;
`gh run view --log` silently drops the rest of a step").

**Record says:** present tense, as if the trap is permanent.

**Re-read:** `cli/cli#15019` is **closed `completed`** on 2026-11-18. The
installed gh is 2.102.0 (2026-09-30), which predates the fix, so the rule is still
correct *here*; a re-run today on the 3-failure run did not truncate (2 failures
visible, job completed), because the trap needs a line over 64 KiB to fire.

**Path:** version the rule instead of stating it as a fact about gh: "on gh ≤
2.102.0, `--log` truncates after a >64 KiB line and exits 0 (#15019, fixed
2026-11-18); quote job logs from the API when a count is going into a record."
That keeps the instruction and stops it reading as a vendor bug that no longer
exists.

---

## F6 — The suite can silently shrink, and nothing notices

**Decision:** D149 and every claim that rests on "406 tests, 0 failures".

**Record says:** the 439/406 gap is three gitignored files; "a published test file
that is renamed would silently disappear from CI" is noted as a side effect.

**Re-read:** confirmed, and worse than "drops the path" — `bun test` treats a
missing path as a **name filter**:

```
$ bun test test/definitely-missing.test.ts; echo $?
note: To treat the "test/definitely-missing.test.ts" filter as a path, run "bun test ./test/…"
exit=0
```

So a renamed file matches zero tests and exits 0, with only a note on stdout that
no CI step reads. `test:offline` still lists `test/bench.test.ts`,
`test/bench-stats.test.ts` and `test/native-history-harness.test.ts`, which do not
exist in a runner checkout.

**Why it matters:** this is the one finding that can make a *future* decision
wrong without any wrong sentence: a green suite that covers 380 of 406 tests still
reports green.

**Path (pick one, ~20 lines):**

1. **Guard test (cheapest):** one test that reads `package.json`'s `test:offline`,
   parses the paths, and asserts each exists — with an explicit allowlist of the
   three local-only files, so the gitignored case is a *statement* rather than an
   accident. Fails loudly on a rename.
2. **Glob + exclusions:** run `bun test './test/*.test.ts'` with a documented
   exclusion list. One source of truth, but changes the invocation everywhere
   (CI, README, the claim's "35 files").
3. **Bun flag:** none exists for "error on unmatched path"; the note is not an
   exit code, so there is no config-only fix.

Recommendation: option 1. It costs a test, changes no invocation, and converts a
silent shrink into a red cell.

---

## F7 — The orphan probe can report a clean result from a failed query

**Decision:** D150 / D142 ("no reaper; none observed in the measured case").

**Record says:** "polled every 250 ms for 60 s … the process table held nothing".

**Re-read:** two narrowings in `test/seam/windows-real.mjs`:

- `museProcesses()` runs `Get-CimInstance Win32_Process -Filter "Name LIKE 'muse%'"`
  and **returns `[]` on any error**. `sampleFor()` treats that `[]` as a clean
  final sample, so a `powershell` failure at the last tick reports
  `survivors=[]`. The script already guards the *live* half (`probe saw the live
  host`), but not the final sample.
- The filter is image name, so the claim is about **processes whose image starts
  with `muse`**, not "the process table". A grandchild with another name (a shell,
  a helper) is invisible.

**Why it matters:** this is the same failure the E16c rewrite was built to
prevent — an empty reading reported as good news — surviving one layer down.

**Path (small script change, one dispatch):**

1. Make `museProcesses()` return `{rom, ok}` (or throw) and `sampleFor()` count
   failures; `check()` that every cycle's final sample succeeded. A failed sample
   becomes an inconclusive cell, not a pass.
2. Either widen the filter (walk `ParentProcessId` descendants of the spawned pid)
   or, cheaper, narrow the claim in the docs to "no process whose image name
   begins with `muse` survived" — which is the claim the seam actually needs.

---

## F8 — A timeout raised to make a Windows test pass, and it still fails

**Decision:** D147 ("suite is a support claim; 405 of 406 pass, one named
failure").

**Record says:** "given 15 s, it took 15.07 s and produced no turn terminal …
Cause not yet named", and the test is left red rather than skipped.

**Re-read:** leaving it red is right. The weakness is what the 15 s budget does to
the *claim*: the POSIX arm passes in ~4 s, so a Windows turn takes ≥3.75× longer or
never terminates. Three different facts would produce this reading — a slow fake
host, a watchdog timer that does not fire on Windows, a resume that never sends
its terminal — and the suite cannot distinguish them. Reporting it as "one failing
test" invites a reader to assume flake.

**Path:** one instrumented run (no behaviour change):

1. Log timestamps at the four transitions the test already touches — turn start,
   watchdog kill, `session/resume` sent, terminal received — and print them on
   Windows. That places the 15 s inside one segment.
2. If the kill never fires, it is a product bug in the watchdog on Windows (a real
   user-facing hang) and the docs' framing must change from "suite" to "timeout
   path unverified on Windows". If the fake host is merely slow, the budget returns
   to 4 s with a recorded reason.

Cost: one dispatch, no paid turn. Order it before any further Windows claim.

---

## F9 — E26 is an absence claim about a UI, with no build pin

**Decision:** D148 / the E26 paragraph ("a policy cannot be made: the builder
targets member tags and no tag control exists").

**Record says:** `/policies/new` offers "Members tagged with…", `Add tag` is
disabled, Settings → Members has only View/Invite.

**Re-read:** the observation is specific and consistent across three surfaces, and
the doc already downgrades the compile question to "unmeasured rather than
negative", which is the right shape. Two gaps remain:

- **No Console build/version is recorded**, so the reader cannot tell whether a
  later build added tagging. The only timestamp is the date.
- **The check is UI-shaped.** A tag, or a policy, could exist server-side without a
  control (the changelog route the research quoted). The Console is a web app, so
  its own requests are observable — that is a stronger instrument than a disabled
  button's appearance.

**Path:** record the Console build (the page's footer/version string, or the
`x-…-version` response header) and, once, capture the policy page's own network
calls from the existing browser session (DevTools/HAR). If the page calls an
endpoint that accepts a tag id, then "cannot make a policy" becomes "the UI cannot
make a tag", which is a different, narrower claim. No policy needs to be created
to read the request shape. Cost: minutes, no account change beyond read-only
inspection.

---

## What held up on re-read

Worth stating, because an audit that only lists holes misrepresents the record:

- **The 406/1 Windows artifact is accurate.** `junit-windows-latest` for run
  45289611552 has `tests="406" failures="1"`, one `<failure>` at
  `test/watchdog-resume.test.ts:117`. The claims table's citation is right.
- **The macOS row is honest about arm64.** The runner resolves git at
  `/opt/homebrew/bin/git`; the table says arm64 and the frame "published checkout".
- **The `0600`/ACL distinction was already handled** in round 5 (D25b) and survives
  re-reading: the table says "inherited ACL, not `0600`", README says the same, and
  the doctor reports the real mode per platform. The one unqualified sentence is
  `decision-coverage.md:147` ("mode 0600"), which the README qualifies.
- **The orphan mechanism is stated, not hidden.** D150 says `TerminateProcess`
  names one pid and libuv's job carries `SILENT_BREAKAWAY_OK`, so "none observed"
  is bounded rather than presented as a guarantee.
- **E27 improves on E16c in the right direction.** The move from a single 3 s
  sample to 60 + 20 + 20 s of 250 ms sampling, with a `known` set so only this
  run's pids count, is the correct instrument change; F7 is a refinement, not a
  reversal.

## The pattern behind F1–F5

Four of the five are the same error: **a claim outlived the instrument that
produced it**, and the doc kept the sentence while dropping the frame. F1 lost the
frame (hand count vs artifact). F2 lost the layer (label vs read). F3 and F4 kept a
citation after the tracker changed its state. F5 kept a present tense after the
vendor fixed the tool.

Two mechanical rules would have caught all five:

1. **A number is cited, never counted.** Every count in a record comes from an
   artifact or a job log with its run id, in the same sentence. Hand-added counts
   are how 13 became 14.
2. **Every claim carries its frame and its instrument.** "406 tests" is
   meaningless without "published checkout, JUnit, run <id>"; "no survivor" is
   meaningless without "image `muse*`, every 250 ms, query succeeded"; "cannot make
   a policy" is meaningless without the Console build. The claims table in
   `platform-support.md` has a frame column — the failure was that F1's number went
   in without one.

## Order of work, if this becomes a round

| # | Item | Cost | Settles |
|---|---|---|---|
| 1 | F1 count fix, F2 wording, F3/F4/F5 citations | ~30 min, no run | the record stops contradicting its own logs |
| 2 | F6 guard test | ~20 lines + local suite | the suite cannot silently shrink |
| 3 | F7 sampler hardening | small script change, 1 dispatch | the orphan claim stops resting on a fail-open read |
| 4 | F8 instrumented Windows run | 1 dispatch, no paid turn | whether the 15 s is a Windows watchdog bug |
| 5 | F9 Console build pin + request capture | minutes, read-only | whether E26 is a UI gap or a product gap |
| 6 | F2 scope probe | owner decision (second workspace) | "scoped" vs "labelled" |

Items 1–3 are corrections to what exists. Items 4–6 are new evidence. Nothing in
the list needs a paid Muse turn.
