# Round 24 — closing the evidence gaps the round-23 audit found

**Written** 2026-11-23. Companion to `docs/round-23-plan.md` (execution record) and
`docs/decision-coverage.md` (rows). This round adds no product surface. It repairs
evidence: five claims in the current ledger rest on an instrument that is either
unstated, single-sample, or contradicted by another file.

**Budget.** One to two matrix dispatches (about $0.19 each at the round-23 measured
rates), one paid Muse turn, no new dependency, roughly half a working day.

**Approval.** The owner approved all experiments in round 24 ("i approve all
experiments"). Account changes stay reversible and are reverted in the same
session; nothing is tagged, published, pushed to `main`, or submitted anywhere.

## 1. What is wrong, in the order it should be fixed

| # | Weakness | Claim it currently props up | What is actually missing |
|---|---|---|---|
| W1 | Windows suite red on three product rows, called "informational" | D137, D141, the Windows cell of the platform table | The failing assertions. "Path and home-directory fixtures" is inferred from test names, never recorded |
| W2 | E18's binding premise is a label | D146, `policy-remote.md`'s measured sentence | Proof this host is the connected client. `auth list` prints `OpenCode  Default  stored`; "Default" is also the workspace name |
| W3 | E18 tested a model switch, and a model switch is not a policy | The Console half of the `policies` row | The Console's own vocabulary: policies are **Providers and Tools** rules. A per-model toggle cannot be one |
| W4 | 439 (local Linux) vs 406 (macOS, and Windows) | D144, the comparability of the platform table | Whether 33 tests are *undeclared* on those platforms, or the two numbers are measured by different instruments. Skips are counted in bun's total, so this is not a skip difference |
| W5 | One 3-second process-table sample | D142's "no orphan" | A sample that outlasts a launcher's grandchildren, plus the mechanism that bounds the claim |

Secondary, text-only: the platform table's flip condition names "a turn on a hosted
Windows runner" although a key cannot authenticate one (E16b); the macOS cells omit
`arm64`; three sentences in `decision-coverage.md` still contradict the measured
results (`:249` "never dispatched", `:221` "macOS no runner", `:191` "none was
connected").

## 2. Corrections this plan carries

Research for this round corrected two round-23 sentences; both are recorded here
before any experiment runs.

1. **Tags are not the only scope.** The Console changelog of 2026-10-10 says a
   policy can cover the entire workspace, all members, *these members picked by
   hand*, service accounts, or a tag. The builder observed here offers only
   "Members tagged with" and says "Tag members first". So the path that avoids
   tagging exists in the product but not visibly in this builder version; §5 gives
   the three paths to try in order and requires recording which one worked.
2. **Policies are Providers and Tools rules**, per `opencode.ai/docs/console`, and
   "Provider, tool, and integration rules are enforced by OpenCode itself… only in
   a version of OpenCode 2 that supports them and is connected to your workspace."
   A model toggle on the Models page is a workspace setting, not a policy, so
   round 23's E18 could not have tested statement compilation at all. The measured
   negative stays true for what it measured; it is not evidence about policies.

Also worth carrying into the docs: credentials now live in SQLite
(`opencode debug paths db`), not `auth.json`; the Console has a Logs page that
"names the policy and links straight to it" when a rule turns a request away; and
`anomalyco/opencode#62602` is an open draft PR adding Windows job objects because
`taskkill /T` "finds descendants through parent links" and "an orphan has no link
back".

## 3. Experiments

Free unless marked. Each has a gate: the decision it settles, and the branch taken
when the result is the other way.

### E22 — what the three Windows failures actually are (free)

Method, in this order. `gh run view --log` silently drops the rest of a step after
any line over 64 KiB (`cli/cli#15019`, fixed only in a later release), so never use
it for a verdict:

```bash
gh run view 45270085792 --json jobs --jq '.jobs[] | "\(.databaseId) \(.name) \(.conclusion)"'
gh api /repos/jond34/opencode-plugin-muse/actions/jobs/<windows-job-id>/logs \
  > scratch/windows-suite.log
grep -n "the plugins row\|the policies row\|hook gate" scratch/windows-suite.log | head
tail -5 scratch/windows-suite.log      # must show "Ran N tests" — if not, the log is partial
```

Record, for each of the three: the test's full name, the expected string, the
received string, and whether the mismatch is inside a fixture's construction (a
POSIX literal the test wrote) or inside product output (a path the code produced).

**Gate.** Fixture-side → fix the fixture in E24 and aim for a green Windows suite.
Product-side → the product has a Windows path bug; fix it, and until then D141
reads "resolver, install, configure, handshake, close verified; doctor rows and
hook gate unverified on Windows". Log unavailable → say so and use the run's
artifact if one exists; do not substitute an inference from the test names.

### E23 — where the 33 tests went (free)

Bun counts skipped tests in its total (the docs' own example prints "0 pass, 1
skip, Ran 1 test"), and this repo declares exactly one platform skip
(`test/host-process.test.ts:98`, on `win32`). So a smaller total means tests were
never *declared*, not skipped.

```bash
bun run test:offline -- --reporter=junit --reporter-outfile=scratch/local.xml \
  --reporter-junit-suites=flat
gh api /repos/jond34/opencode-plugin-muse/actions/jobs/<macos-job-id>/logs > scratch/macos-suite.log
gh api /repos/jond34/opencode-plugin-muse/actions/jobs/<ubuntu-job-id>/logs > scratch/ubuntu-suite.log
```

From the macOS log, extract every `(pass)`/`(fail)` name with the file header above
it, strip the `[N ms]` suffix, and diff the name sets against `scratch/local.xml`.
Then read the ubuntu job's closing tally — that single number says whether the
local 439 or the CI 406 is the outlier.

**Gate.** Ubuntu 439 and macOS 406 → 33 tests are platform-conditional or a file
fails to load on darwin; name the file and either declare the tests with
`test.skipIf` (so they appear as skips) or fix the load failure. Ubuntu 406 →
every CI run is 406 and the local number is the outlier; the platform table cites
CI only. Either way the table states the frame (local or runner) for every number.

### E24 — JUnit artifacts, and the Windows fix if E22 found one (~$0.19)

Add to the matrix job, behind the existing workflow:

```yaml
      - run: npm run check:offline -- --reporter=junit --reporter-outfile=junit.xml --reporter-junit-suites=flat
      - uses: actions/upload-artifact@<pinned sha>
        if: always()
        with:
          name: junit-${{ matrix.os }}
          path: junit.xml
```

Plus whatever E22/E23 asked for (fix a fixture, fix a path, declare a skip with a
reason). One dispatch, `real_windows: false`, matrix only. The artifact carries
per-file `tests=` counts and `hostname`/`commit` properties, so the next count
question answers itself.

**Gate.** Windows green → D147 upgrades to "suite green on a hosted runner" with
the JUnit artifact cited. Windows red → the red cell keeps the assertion text from
E22 and D137 is retired in favour of a named cause. Either way the Linux, macOS and
Windows numbers are quoted from the same frame.

### E25 — is this host actually bound to the workspace (free, reversible)

Three reads, cheapest first:

1. `zsh -lc 'opencode debug paths db'`, then with `bun:sqlite` list the tables and
   look for a row holding `wrk_01KYJ6RT2QFFJ0AXV1J2JFEQR6`. A live record with a
   recent timestamp is direct evidence; a row only in session history is not.
2. Console Account → **Connected workspaces**. Per the vendor docs this lists the
   workspaces the *account* is connected to ("Leave beside the workspace"), so it
   bounds the answer but does not name the machine.
3. Rename probe: Settings → General → Name, change `Default` to `Default probe`,
   wait 90 s, `zsh -lc 'opencode auth list'`. If the `OpenCode` entry's label
   follows the rename, the label is live data from the bound workspace. Rename
   back and confirm the label returns.

**Gate.** Any of the three positive → E18's premise holds and `policy-remote.md`
cites the one that proved it. All three negative → reword `policy-remote.md` and
the round-23 audit to "a model restriction applied in a workspace this machine
appears bound to", and demote D146 from measured to consistent-with.

### E26 — the policy experiment E18 should have been (free; one turn for arm 2)

Create a real Providers/Tools policy, measure it, delete it. Try the scopes in this
order and record which existed:

1. Settings → Members → open the owner row → **Controls** → *Add* → "Block models…"
   (the changelog says this creates the member's own policy).
2. Models → open a model → **Controls** → *Block for…* → choose the owner.
3. Controls → *Add policy* → target "These members, picked by hand" (if the picker
   exposes it) or tag the owner in Settings → Members first, then target the tag.

**Arm 1, no turn.** Add a Providers rule denying a provider this host never uses
for Muse work (`mistral` unless the config or `opencode models` shows otherwise).
Wait 90 s, then read:

```bash
zsh -lc 'opencode debug config --standalone' > scratch/dc-policy.json
zsh -lc 'opencode models --standalone'   > scratch/models-policy.txt
node -e 'const d=require("/home/jonat/.local/state/.../dc-policy.json")'  # sources + info.policies
```

Record: does a Console source appear among `sources`? Does `info.policies` gain the
statement? Does the denied provider vanish from `opencode models`? Does Console
Activity → Logs name the policy?

**Arm 2, one turn.** Replace the provider rule with a Tools rule denying
`read:*`, wait 90 s, run one `opencode run` that reads a file, capture the exact
denial text (this is E19's question), then delete the rule.

**Cleanup, mandatory.** Delete the policy (and the tag, if one was made). Verify in
three places: Controls lists no policy, `debug config` returns to the round-23
baseline (one `document`, two `directory`, no Console source), and `opencode
models` matches the pre-experiment count. If any cleanup step fails, stop and tell
the owner immediately with the exact URL of what remains.

**Gate.** A statement appears in `info.policies` or a Console source → the compile
claim is measured, add the doctor clause and the docs sentence (D146 reverses).
Nothing appears → D146 stands as a measured negative **for a policy**, which is the
stronger version of what round 23 recorded. Arm 2's wording goes straight into
`policy-remote.md` either way.

### E27 — the orphan claim, bounded (free; one Windows job run)

Extend `test/seam/windows-real.mjs`:

- poll `Get-CimInstance Win32_Process` every 250 ms for 60 s after `close()`, and
  fail on any process whose `CommandLine` or `Name` matches `muse-bin-*`;
- include the `.ps1` launcher's parent pid in the match, so a surviving wrapper is
  caught;
- run the spawn → handshake → close cycle three times in one job, so a flake reads
  as a flake;
- keep the host's own stderr (`stdin_closed`) as the host-side evidence.

**Gate.** A survivor → D142 reopens; the reaper options in Q34 come back with a
measured case. No survivor in 60 s → D142 keeps its decision and gains the
mechanism sentence from §2 (TerminateProcess is one PID; libuv's job has
`SILENT_BREAKAWAY_OK`; `anomalyco/opencode#62602` documents the same class), so the
claim reads "no survivor observed in the measured case" rather than "no survivor".

### E28 — the ledger stops duplicating facts (free, documentation only)

Not an experiment: the repair that makes W4 and W1 recur less.

1. `docs/platform-support.md` gains a **claims table**: one row per platform claim,
   columns *claim | evidence id | run or command | measured at | frame (local,
   runner, or account)*.
2. `docs/decision-coverage.md`'s platform row and Counts paragraph stop restating
   measurements and link to that table; the decision stays in the ledger, the
   number lives in one place.
3. Fix the three stale sentences (`:249`, `:221`, `:191`), the flip condition, and
   add `arm64` to every macOS cell.
4. Add to the round template's close-out: `grep -n "unmeasured\|never
   dispatched\|no runner\|none was connected" docs/decision-coverage.md` and
   justify each hit.

## 4. Decisions, and the result that flips each

| Ref | Decision | Settles on | Flips if |
|---|---|---|---|
| D147 | Windows status: "suite green on a runner" vs "resolver and seam verified, doctor rows unverified" | E22, E24 | E22 shows a product-side path bug — then the claim narrows until it is fixed |
| D148 | What E18/D146 may claim: a model restriction was invisible in a bound workspace | E25, E26 | E25 fails all three reads (drop "bound"), or E26 shows a source (reverse D146, add the doctor clause) |
| D149 | How the platform table quotes counts: one frame per row, `arm64` stated, gap explained | E23, E24 | E23 finds the gap is a load failure, which is a bug and not a frame question |
| D150 | The orphan sentence: "none observed" plus the mechanism, or a reaper | E27 | A survivor appears |
| D151 | Whether the docs keep a single fact owner per claim | Owner answer to Q35 | Owner prefers prose; then E28 shrinks to the stale-sentence fix |
| D152 | CI cadence and cost unchanged from D145 | E24's measured run cost | The monthly job costs more than the owner accepts |

## 5. Order, because three of these depend on others

1. E22 first: it can invalidate the Windows cell and it feeds E24's content.
2. E23 in the same sitting: both are log reads of runs already paid for.
3. E25 before E26: if the host is not bound, E26 measures nothing and its account
   changes are not worth making.
4. E26 with cleanup in the same session, and never left overnight.
5. E27 as a local edit, then one Windows job run that can carry E24's workflow
   change if both are ready (one dispatch serves both).
6. E28 last, once the results exist, so the claims table is written from measured
   numbers rather than from intent.

## 6. Risks and instrument errors to avoid

- **Truncated logs.** `gh run view --log` loses everything after a >64 KiB line and
  exits 0. Use `gh api .../jobs/<id>/logs` and check the tail for `Ran N tests`.
- **Console latency.** Policies apply "on the next fetch, about once a minute".
  Wait 90 s and read twice before declaring a negative.
- **Leftover policy.** A policy left on the account is the one irreversible-looking
  mistake available here. Cleanup is a step with three verifications, not a note.
- **Runner capacity.** `macos-15` queued fifteen minutes once. Retry, or dispatch
  `macos_only: true` rather than concluding anything about the code.
- **Denominator drift.** If E23 or E24 changes the number of declared tests,
  re-quote the platform table in the same commit; never leave two counts.
- **Allowance.** Arm 2 of E26 is one turn; do not repeat it to get a tidier
  transcript. Record what arrived.

## 7. Product questions this round cannot answer by experiment

These are judgment calls. Each is listed with both sides so the owner can answer in
one line; the recommendation is what the evidence currently supports.

### Q32 — How much Windows support is worth buying?

*For parity:* the plugin's whole promise is that the host is invisible; a doctor
row that has never passed on Windows is where a Windows user meets the first
pre-Windows-only failure. The macOS run just showed that a "platform quirk" can be
a real bug, and the Windows failure set includes the same hook gate.
*Against:* a hosted runner cannot answer UAC, SmartScreen, interactive sign-in, or
a real turn; the only route to those is a desktop machine. Paying for parity on a
runner buys the suite, not the experience.
**Recommendation:** fix the suite until green (cheap, mechanical), keep the desktop
half explicitly out of scope, and say so in one sentence rather than calling the red
suite informational.

### Q33 — Should the Console ever hold a real policy for this account?

*For:* it is the only way to measure the compile claim, and the Logs page gives a
second, vendor-side witness; the experiment is reversible in a minute.
*Against:* it is a live account change on a personal workspace for a question whose
answer cannot change the plugin's behaviour — attribution is what is missing, and
no measurement gives it.
**Recommendation:** run E26 once, delete, and record the answer. Do not keep a
policy behind.

### Q34 — Orphan guarantee: wording or dependency?

*For job objects:* the Windows equivalent of a process group; kills the tree on
handle close, including on a crash; `@seydx/win-job` ships prebuilt binaries.
*Against:* a native dependency on one platform, a behaviour change D142 declined,
and the failure it prevents has never been observed here.
**Recommendation:** stay with wording plus mechanism until a survivor is measured.
The dependency is the right purchase only after E27 shows one.

### Q35 — One fact owner per claim, or prose everywhere?

*For a claims table:* the 439/406 contradiction and the three stale sentences are
all duplication; a table with a frame column could not have drifted silently.
*Against:* the ledger's value is that it reads as an argument, not a database; a
table adds a place to forget to update.
**Recommendation:** table in `platform-support.md`, links from the ledger. Keep the
argument, move the number.

### Q36 — CI cadence after this round

*For monthly:* about $0.19 a run at measured rates, inside the free allowance,
catches dependency drift on three OSes.
*Against:* the offline suite touches no network and the repo moves slowly; a
scheduled red run costs attention even at $0.
**Recommendation:** keep D145's monthly schedule, with E24's JUnit artifacts as the
reason a scheduled run is readable.

### Q37 — Is a 33-test difference acceptable?

*For accepting:* if the tests are platform-conditional by design and declared as
skips, the difference is information, not a hole.
*Against:* today they are undeclared, which means nobody can say which behaviour is
unverified on two platforms.
**Recommendation:** require them to be *declared* (`test.skipIf` with a reason), not
to be equal. Equality is not the goal; visibility is.

## 8. Definition of done

- E22–E27 each recorded with command, output excerpt, and cost (turns, dispatches).
- `docs/platform-support.md` carries the claims table, the frame column, `arm64`,
  and the Windows cell quoting a real assertion or a real JUnit count.
- `docs/policy-remote.md` states what was measured about a *policy*, and whether the
  host is bound, with the one read that proved it.
- `docs/decision-coverage.md` has no sentence contradicting the platform table;
  D147–D152 recorded with flip conditions.
- The Console is back to baseline: no policy, no tag, workspace name restored, and
  the three verification reads pasted into the plan.
- `npm run check:offline` green on Linux, and the Windows/macOS numbers from the
  same frame.
- Nothing on `main`, nothing tagged, nothing published, `docs/integration-landscape.md`
  still unstaged.
