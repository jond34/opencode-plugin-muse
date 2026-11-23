# Round 24 kick-off prompt

Paste this into a fresh session. It is self-contained; the state it relies on lives
in `docs/round-24-plan.md`, `docs/round-23-plan.md` and `docs/decision-coverage.md`.

---

You are continuing round 24 in `~/repos/opencode-plugin-muse` (opencode plugin that
spawns Muse Code over MSP stdio). Read `docs/round-24-plan.md` first — it is the
plan, with the five weaknesses, the experiments E22–E28, the gates, and the product
questions. Then read `docs/platform-support.md` and `docs/policy-remote.md` for the
current claims. Do not re-derive anything those files record.

**What round 23 left, in one paragraph.** Round 23 measured Windows install and
close on `windows-latest` (run 45281586619), got macOS green at 406 tests after
fixing a real hook-trust path bug (run 45282185770), and ran a Console probe
(E18). An audit then found five weaknesses: the Windows suite is red on three
product rows and nobody recorded the failing assertions; E18's "this host is bound
to the workspace" rests on an `auth list` label; a per-model switch is not a policy,
so E18 never tested statement compilation; the platform table compares a local 439
against a CI 406 with an explanation the workflow contradicts; and D142's "no
orphan" rests on one 3-second sample.

**Facts you will need.** The Console is *opencode's*, at `opencode.ai/console`;
workspace `Default`, id `wrk_01KYJ6RT2QFFJ0AXV1J2JFEQR6`, plan Go, one member
(owner). The browser tab is already adopted through the `browse` MCP. Credentials
live in SQLite (`opencode debug paths db`), not `auth.json`. Policies are
Providers and Tools rules; a model switch is a workspace setting. The console
builder here offers only "Members tagged with", while the 2026-10-10 changelog says
hand-picked members, all members, and the whole workspace are also scopes — so the
policy scope is a ladder, and you record which rung worked.

**Constraints, non-negotiable.**
- Never commit to `main`, tag, publish, or submit anywhere. Work on a `round-24`
  branch; the owner merges on their own "go".
- Never stage `docs/integration-landscape.md` — it is the owner's uncommitted edit.
- Harness CLIs run under `zsh -lc`, never `bash -lc`. Python work goes through `uv`.
- No new dependency. Scratch files go in `scratch/` (ignored).
- Do not add `timeout-minutes` to hide a queue. A macOS runner that never arrives is
  a capacity fact, not a code fact.
- Console changes must be reverted in the same session, with the cleanup
  verifications in the plan pasted into the plan file.
- The owner approved all experiments. One paid Muse turn is budgeted for E26 arm 2;
  do not spend more to get a tidier transcript.

**Order and gates.**
1. **E22 (free).** `gh run view 45270085792 --json jobs` for the job ids, then
   `gh api /repos/jond34/opencode-plugin-muse/actions/jobs/<id>/logs` — never
   `gh run view --log`, which silently drops the rest of a step after a >64 KiB
   line (`cli/cli#15019`). Confirm the tail says `Ran N tests`. Record each of the
   three failures (name, expected, received) and classify fixture-side vs
   product-side. Gate: fixture → fix in E24; product → fix the code and narrow
   D141 until it is fixed.
2. **E23 (free).** `bun run test:offline -- --reporter=junit
   --reporter-outfile=scratch/local.xml --reporter-junit-suites=flat`, then diff
   test *names* against the macOS log (and read the ubuntu job's tally). Skips are
   counted by bun, so a smaller total means undeclared tests. Gate: ubuntu 439 →
   find and name the 33 (declare them with `test.skipIf` and a reason, or fix the
   load failure); ubuntu 406 → the local number is the outlier and the table cites
   CI only.
3. **E25 (free, reversible).** Binding: `opencode debug paths db` plus a
   `bun:sqlite` read for the `wrk_` record; Console Account → Connected workspaces;
   then the rename probe — `Default` → `Default probe`, wait 90 s, `opencode auth
   list`, restore the name and confirm the label returns. Gate: any positive → cite
   that read in `policy-remote.md`; all negative → drop the word "bound".
4. **E26 (free; one turn).** Only after E25 passes. Create a policy through the first
   rung that exists (member page Controls → Add → Block models…; model page
   Controls → Block for…; builder with tag). Arm 1: Providers rule denying a
   provider this host never uses → wait 90 s → read `opencode debug config
   --standalone` (sources and `info.policies`) and `opencode models --standalone`
   → check Console Logs. Arm 2: swap to a Tools rule denying `read:*`, wait 90 s,
   one `opencode run` that reads a file, capture the exact denial text (this is
   E19's question). Then delete the rule, the policy and any tag, and verify three
   ways: Controls empty, `debug config` back to one document + two directories and
   no Console source, `opencode models` count unchanged. If cleanup fails, stop and
   report the URL of what remains.
5. **E27 (free; one Windows job).** Extend `test/seam/windows-real.mjs` to poll
   `Get-CimInstance Win32_Process` every 250 ms for 60 s after `close()`, fail on
   any `muse-bin-*` including the `.ps1` wrapper's parent, and run three
   spawn/handshake/close cycles. Gate: survivor → reopen D142 and list the reaper
   options; none → keep D142 and add the mechanism sentence (TerminateProcess is
   one PID; libuv's job has `SILENT_BREAKAWAY_OK`; `anomalyco/opencode#62602`).
6. **E24 (~$0.19).** One dispatch carrying the Windows fixture fix (if E22 asked),
   the JUnit reporter plus `actions/upload-artifact` (SHA-pinned) in the matrix job,
   then record the three per-OS counts from the artifacts. This may be the same job
   run as E27 if both are ready.
7. **E28 (free).** Documentation: claims table in `docs/platform-support.md` with
   *claim | evidence | command or run | measured at | frame*; ledger rows and Counts
   link to it; fix `decision-coverage.md:249` ("never dispatched"), `:221` ("macOS
   no runner"), `:191` ("none was connected"); fix the platform table's flip
   condition (a hosted Windows runner cannot take the subscription, so the only
   path is a desktop with a signed-in subscription); add `arm64` to macOS cells.

**Decisions to record, with flip conditions.** D147 Windows status (E22, E24);
D148 what E18/D146 may claim (E25, E26); D149 the table's counting frame (E23,
E24); D150 the orphan sentence (E27); D151 one fact owner per claim (owner's Q35);
D152 CI cadence unchanged (D145, E24's measured cost). Write each into
`docs/decision-coverage.md` and `docs/watchlist.md` where it belongs.

**Verification before you report.** `npm run check:offline` green locally; the
workflow YAML parses (`uv run --with pyyaml python -c ...`); `node --check` on the
seam script; `git diff --check` clean; `git status` shows only round-24 files plus
the owner's unstaged `docs/integration-landscape.md`.

**Report, in this shape.** For each experiment: the command, the result excerpt, the
gate taken, and the cost (turns, dispatches, dollars if the usage endpoint is
readable). Then the decisions recorded, the Console cleanup evidence, what is still
unmeasured and why, and the exact next action if the owner says "land it".
