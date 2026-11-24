# Round 25 kick-off prompt

Paste this into a fresh session. It is self-contained; the state it relies on lives
in `docs/round-25-plan.md`, `docs/evidence-audit.md`, `docs/platform-support.md`,
`docs/policy-remote.md` and `docs/decision-coverage.md`.

---

You are running round 25 in `~/repos/opencode-plugin-muse` (an opencode plugin that
spawns Muse Code over MSP stdio). Read `docs/round-25-plan.md` first — it is the
plan: nine audit findings, experiments E28–E33, decisions D153–D159, product
questions Q1–Q6, and the confidence conditions. Then read `docs/evidence-audit.md`,
which is the audit those experiments answer. Do not re-derive anything those files
record; if a measurement contradicts the plan, follow the measurement and record the
deviation in the plan's results section.

**What the audit found, in one paragraph.** The decisions hold, but five pieces of
evidence said more than their instruments showed and one number was wrong. The first
Windows dispatch failed 13 tests, not the 14 the docs claimed (job `138027278561`:
391 pass, 2 skip, 13 fail), and the Console credential only *names* a workspace —
the id sits in `metadata.orgID` of a JSON blob, and the tokens are 39-character
opaque strings, so "scoped" was an inference dressed as a read. Two citations point
at tracker entries that no longer say what they are quoted for, the `gh` truncation
rule is fixed upstream, the suite can silently shrink, and the orphan probe can
report a clean result from a failed query. Two of these were corrected in commit
`ae8306c`; the rest are this round's work.

**Facts you will need.**
- Branch `round-24` is at `ae8306c` and stacked (it is not on `main`). Create
  `round-25` from it. `ci/seam` and `ci/real` are throwaway dispatch pointers.
- Instruments: bun **1.4.4**, node 24.22.1, gh 2.102.0, opencode 2.4.1, Muse
  1.4.25-R9361.1.
- `bun test ./test/version.test.ts ./test/does-not-exist.test.ts` exits 0 on 1.4.4
  — a missing path becomes a filter, so prefixing paths does not fix the suite.
  `oven-sh/bun#44002` is open.
- The last Windows cell is 405/1: `junit-windows-latest`, run `45289611552`,
  `tests="406" failures="1"`, the failure at `test/watchdog-resume.test.ts:117`
  after 15.068 s.
- The orphan probe's CIM filter is `Name LIKE 'muse%'`; Windows reuses pids, so any
  descendant claim must compare `CreationDate` (Microsoft's `Win32_Process` docs say
  so explicitly).
- Console: opencode's, at `opencode.ai/console`, workspace `Default`
  (`wrk_01KYJ6RT2QFFJ0AXV1J2JFEQR6`), browser tab already adopted through the browse
  MCP.
- Dispatch map: pushing `round-25:ci/seam` runs the offline matrix (Ubuntu, macOS,
  Windows) plus the seam job; pushing `round-25:ci/real` runs `real-windows`
  (installer + serve lifecycle). One dispatch each, ~$0.19.

**Constraints, non-negotiable.**
- Never commit to `main`, tag, publish or submit. Never stage
  `docs/integration-landscape.md` — the owner's uncommitted edit.
- Harness CLIs run under `zsh -lc`, never `bash -lc`. Python through `uv`.
- No new dependency; scratch in `scratch/`.
- Do not add `timeout-minutes` to hide a queue, and do not raise a timeout to make a
  test pass unless the segment that consumes it is named in the same commit.
- Console work is read-only unless E31 finds an API route; do not create a second
  workspace, a tag or a policy without an explicit yes on Q3. Any Console change is
  reverted in the same session, with the cleanup reads pasted into the plan.
- Never write raw HAR content: endpoints, build string and the workspace id only. No
  email, cookies or bearer headers.
- The owner approved all experiments. No paid Muse turn is budgeted for this round;
  every question here is about instrumentation or the Console's own surface.

**Steps and gates.**

1. **E28 (free).** Add `scripts/suite-list.ts` exporting
   `missingFromSuite(pkg, exists, localOnly)` that parses `test:offline`, keeps
   `test/…` entries and returns the ones `exists` rejects and `localOnly` does not
   excuse; add `test/suite-list.test.ts` asserting (a) the real package and real
   filesystem return `[]`, and `LOCAL_ONLY` equals the listed entries `git ls-files
   test` does not track — measured today: 38 listed, 35 tracked, the three untracked
   being the bench/bench-stats/native-history-harness files from `.gitignore:24-26`;
   (b) a synthetic list with one missing non-local path returns that path; (c) the
   same path excused by `localOnly` returns `[]`. Add the test to `test:offline`. **Gate:** green suite locally,
   and renaming a listed file makes the new test fail with the path in the message
   (revert the rename).

2. **E33 (free).** Apply audit F3–F5: the turn-cap row cites E-D52 and records that
   #54806 was closed `not_planned` (#53356 is the open subagent variant); the MCP
   Tasks row cites open #63257/#49929 instead of closed-duplicate #28186; the gh rule
   is versioned ("gh ≤ 2.102.0; #15019 closed 2026-11-18"). Add a `Recheck` column to
   the claims table for rows whose evidence expires.

3. **E30 (one dispatch, no turns).** Instrument `test/watchdog-resume.test.ts` to
   stamp four transitions — turn start, watchdog kill, `session/resume` sent,
   terminal received — and print segment durations on failure. Keep the 15 s budget;
   change no assertion. Push `round-25:ci/seam`. **Gate:** name which segment holds
   the 15 s, using the plan's outcome table:
   kill never fires → product bug (propose E34, narrow the Windows claim);
   kill fires and resume is sent but no terminal → one more instrumented run before
   any product change; everything quick and the terminal late → fake-host cold
   start, restore 4 s and record why.

4. **E29 (one dispatch).** Harden `test/seam/windows-real.mjs`: `museProcesses()`
   returns `{rows, ok}`; `sampleFor` counts failed samples; add a check that every
   sample succeeded. Collect `CreationDate` in the CIM call and print both lists per
   cycle — image-matched survivors, and recorded descendants of a pid this run
   spawned (match `ParentProcessId`, then reject a parent whose `CreationDate` is
   later than the child's). Push `round-25:ci/real`. **Gate:** survivor → reopen D150
   with pid, image, parent, timestamps and propose the reaper; none and zero failed
   samples → D150 stands with the filter and sample count in the sentence; failed
   sample → re-run once, then record inconclusive.

5. **E31 (free, read-only).** Record the Console build string (footer/version, or an
   `x-…-version` response header) beside the E26 paragraph in `policy-remote.md`.
   Capture the policy page's request list through the browser session — open
   `/policies/new`, let it load, read the requests. **Gate:** an endpoint that takes
   a tag id or member id → E26 becomes "the UI cannot create a tag" and E32 is
   unlocked; otherwise E26 stands with "UI gap in build <x>" and a recheck
   condition.

6. **E32 (conditional).** Only if E31 unlocks a route, or the owner says yes on Q3.
   Preferred arm is read-only: request a resource under a fabricated `wrk_` id and
   record whether 403 and 404 are distinguishable. If they are not, record
   inconclusive and keep the plan's wording. Clean up anything created and re-read
   the credential row plus `opencode auth list` to show the original state.

7. **Q4 snapshot (small, reversible).** Commit `docs/evidence/<date>-<sha>.json` with
   the three numbers the docs cite — tests, failures, OS, run id, HEAD sha — read
   from each JUnit artifact. Nothing else goes in it.

8. **Docs and verify.** Close or defer each audit item F3–F9 with a reason; make
   `platform-support.md` quote only artifact or snapshot numbers; add a results
   section to `docs/round-25-plan.md` (per-experiment command, result, gate, cost,
   decision moved); answer Q1–Q6 in the plan with the owner's choice or "pending
   owner". Then run `npm run check:offline`, `node --check` on any changed seam
   script, a YAML parse of `.github/workflows/test.yml` if it changed,
   `git diff --check`, and `git status`. Commit on `round-25`; do not push to `main`.

**Decision mapping.** E28 → D153. E29 → D154. E30 → D155. E31 → D156. E32 → D157.
Q4 → D158. Cadence stays D159 unless the Windows cell is red for two rounds with no
movement.

**Stop conditions.** Stop and report instead of improvising if: a dispatch cannot be
triggered from inside one `zsh -lc` (pushes have failed that way before); the
Console requires a write to proceed and Q3 is unanswered; a Console cleanup read
does not return to the recorded baseline; or either dispatch fails for a reason
unrelated to the experiment (queue capacity, runner image change).

**Report format.** Per experiment: command, result, gate outcome, cost. Then the
decisions actually taken, the docs changed, the checks run with their output, and
anything left unmeasured with the reason.

---

## For the owner, after the run

Q1 (Windows cell red vs a named known-failure lane), Q2 (orphan claim scope),
Q3 (second workspace for the scope probe), Q4 (committed evidence snapshot),
Q5 (audit stays its own file) and Q6 (is a signed-in Windows 11 machine available)
are in the plan with a recommendation each; Q4 and Q5 are implemented by default
because they are cheap and reversible.
