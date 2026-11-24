# Evidence review: does the record carry the decisions?

**Written** 2026-11-24, against `round-25` (`98917f6`). Scope: all 85 ledger
rows, the platform and policy claims, the nine audit findings, and the round-25
results. Method: re-read each load-bearing sentence against the tree and the
committed artifacts, then checked the external claims against primary sources.
Search used: GitHub code/issue search, Parallel, You, Microsoft Learn. No code
changed; nothing here is committed.

The verdict in one paragraph: the decisions mostly carry, but fifteen claims do
not carry as written. Five are contradicted — one by our own later evidence, one
by the vendor's docs, three by another sentence in the same file. Five are thin:
single platform, single sample, or a doc read presented as a measurement. Three
are stale against 2.4.1 and against a moving upstream. One is an instrument gap
and one is systemic. None reverses a product decision. Two change a security
argument, and three change what the Console and Windows sentences are allowed to
say.

---

## 1. The findings, ranked by decision risk

| # | Finding | Decision it touches | Class | Severity |
|---|---|---|---|---|
| 1 | The `plugin`-origin hook rationale says every install scope is user-side; Muse 1.4.0 added `--scope project` | D19 / P5 hook gate | Contradicted (external) | High |
| 2 | Windows `410/0` hides 5 skipped tests; three are behaviour, not modes | D147 / D151 platform claim | Thin (coverage) | High |
| 3 | "No survivor" rests on one 3 s sample of a host that spawns no grandchild | D142 / D138 / orphan row | Thin (scope) | High |
| 4 | "No policy route" contradicts the Console changelog's hand-picked-members target and round 24's own plan | D148 / E26 / E32 | Contradicted (external) | Medium |
| 5 | "A policy cannot be created on this account at all" contradicts the paragraph 20 lines below it | D148 / E19 | Contradicted (internal) | Medium |
| 6 | Enterprise planes marked X while the same paragraph says a managed policy makes the plugin's start refuse | Row G "Enterprise config planes" | Contradicted (internal) | Medium |
| 7 | Two platform-neutral H rows are pinned only by POSIX-only tests | Rows B "Wedged host", "Reaping a dead child" | Thin (coverage) | Medium |
| 8 | Measurements on 2.3.2 / 2.0.29 now read as current against a 2.4.1 host | Rows B, G (turn cap, policies, installs) | Stale (version) | Medium |
| 9 | The OS-isolation row cites a 2.0.29 audit and misses two core PRs plus an MXC plugin | Row C "OS isolation" | Stale (landscape) | Medium |
| 10 | "No rule can name an MCP tool" is one deny shape presented as a rule-class fact | D21 / `allowAll` | Thin (inference) | Medium |
| 11 | The committed snapshot stores totals only, so it cannot show a skip | D158 | Instrument | Medium |
| 12 | U16 and U22 still say Windows is red and untested | U16, U22 | Contradicted (internal) | Low |
| 13 | SEP-2663 citation conflates the SEP date with the spec version and uses the wrong method name | Row C "MCP Tasks" | Stale (precision) | Low |
| 14 | macOS `arm64` is inferred from a runner label, not reported by the runner | D149 | Thin (instrument) | Low |
| 15 | The doctor-gate field survey has been wrong three times in four rounds | D75–D100 | Systemic | Medium |

---

## 2. Detail

### 1. The hook gate's reason is not the reason (security-adjacent)

`src/hooks.ts:9-14` says:

> A `plugin` row is allowed: every install scope writes into the user's own store
> ("Nothing is written into the repository"), so it is code the person installed
> and approved, not a file a checkout can plant.

Muse's own changelog for 1.4.0 says:

> `/plugins` install accepts `--scope user` or `--scope project`, so a local
> plugin can be installed for the project instead of only for you

So the premise "every install scope writes into the user's store" is not true as
stated, and the sentence this gate rests on was never measured — it is quoted
from vendor docs. That does not prove a hole: 1.4.0 also added "Review pending
plugin hooks at startup, with options to trust them or continue without
approval", and 1.4.24 re-asks when an update changes the hook code. Muse may
already gate the plugin path. But the plugin's argument is now an unverified
claim about a scope that exists, in a module whose whole purpose is to refuse
repo-supplied execution.

**Ways forward** (pick by what the experiment shows):

1. **Test it (recommended).** A temp repo, a plugin with one hook, installed with
   `--scope project`; then `hook/list` on a real host: record `handlerKind`,
   whether the plugin gate blocks, whether Muse prompts at install, what the
   install writes (repo or user store), and whether a fresh clone reproduces it.
2. **Re-derive the reason.** If Muse's install review covers it, say that
   instead: "plugin handlers are reviewed by Muse at install and re-reviewed on
   update; the plugin does not duplicate that gate." That is a defensible
   argument even without a scope guarantee.
3. **Gate by scope, not origin.** If the experiment shows a project-scoped plugin
   can carry a handler into a clone, add the plugin name/scope to the record and
   refuse unknown plugin handlers until accepted. This is the only option that
   changes code.

Cost: one real-host run (E35). Acceptance: the experiment's transcript is quoted
in `hooks.ts` or in `decision-evidence.md`, and the sentence "not a file a
checkout can plant" is either replaced or supported.

### 2. Windows `410/0` is really `405 ran, 5 skipped`

The committed snapshot and the claims table both say 410 tests, 0 failures on
`windows-latest`. The JUnit root says:

```
tests="410" assertions="1010" failures="0" skipped="5"
```

against `assertions="1023" skipped="0"` on Ubuntu and macOS. The five skipped
cases are:

- `host config` — "keeps the directory and file private" (legitimate: POSIX mode)
- `host config` — "links the user's login instead of copying it" (behaviour)
- `the process behind the seam` — "a transport EOF leaves the process alive until
  something closes it" (behaviour; row B "Reaping a dead child")
- `the process behind the seam` — "a frozen host settles nothing, including an
  interrupt" (behaviour; the E-D2 basis for the wedged-host ladder)
- `file permissions` — "POSIX reports the mode the plugin writes" (legitimate)

A file count cannot catch this: the E28 guard proves a file is listed, not that
its tests ran. The number that matters for a support claim is "ran", and neither
the claims table nor the snapshot can produce it.

**Ways forward:**

1. Record `skipped` and `assertions` in the snapshot, and print "410 declared /
   405 ran / 5 skipped (2 mode, 3 behaviour)" in the claims table.
2. Add a skip allowlist to `suite-list.test.ts`, keyed by platform, each entry
   naming its reason. An unexplained skip then fails offline, the same way a
   missing file does.
3. Port the three behaviour tests. `freezeForever` already exists; the EOF test
   needs a fixture that exits on force-kill rather than SIGTERM. If a test cannot
   be ported, say which decision row it leaves unmeasured on which platform.

Cost: free for (1) and (2); one dispatch for (3). Acceptance: Windows reports
410 ran or 408 ran with two named mode skips, and the snapshot differs by OS only
in ways the table explains.

### 3. "No survivor" does not cover the grandchild the docs already warn about

`platform-support.md` says, correctly, that the SDK's Windows close path is
child-only (`ownsProcessGroup` is false on `win32`, no `taskkill` route) and that
"a grandchild can survive `host.close()`". The orphan row then concludes "no
survivor" from a host that only spawns the `muse-bin` child, and D142 says no
`taskkill` reaper is warranted.

Both sentences can be true only if the tested host never spawns a grandchild —
which is the case, and is not the scenario the warning is about. E16c sampled
three seconds after close; E29 sampled 60 + 20 + 20 s with an image-or-descendant
filter, but a detached child reparented to init is invisible to both lists, as
the round-25 text itself notes.

**Ways forward:**

1. Add a fixture host that spawns a detached long-sleeper, then close and sample.
   This is the missing cell, not a rerun of the same one.
2. If it survives, decide explicitly: (a) `taskkill /PID <pid> /T /F` as a win32
   fallback — Microsoft documents `/t` as ending "the specified process and any
   child processes started by it"; (b) ask the SDK for a job-object or
   process-group close; or (c) document the residual and make the doctor say it.
3. Scope D142's sentence to "the child" and leave grandchildren named as the
   residual until (1) runs.

Cost: one dispatch (E38). Acceptance: the orphan row says which process shapes
were tested, and the reaper decision names the shape it covers.

### 4. The Console "no route" claim now has two contradictions

`docs/policy-remote.md` says the builder "offers one target, 'Members tagged
with…'", and E26 concluded "a policy cannot be created on this account at all".
The Console's own changelog for 2026-10-10 documents five targets:

> - **Entire workspace**, with one budget shared by every member and service account.
> - **All members**, including people who join later.
> - **Members tagged with** something like `engineering`, or everyone without that tag.
> - **These members**, picked by hand, or everyone except them.
> - **All service accounts**, a few chosen ones, or all but a few.

Round 24's own plan expected exactly that: "target 'These members, picked by
hand' (if the picker exposes it)". So either the observed build lags the
changelog, the one-member personal workspace hides the hand-picked and
service-account targets, or the builder's target control was collapsed to its
default and never opened. The current sentence picks the strongest reading
("cannot") from the weakest evidence (one page view).

**Ways forward:**

1. Static check of the pinned bundle and every chunk for the target strings
   ("These members", "service accounts", "tag"). If the strings are present, the
   route exists behind a condition; if absent, the build genuinely lacks it.
2. Re-open `/policies/new` and inspect the target control itself — is it a
   dropdown? Does it list more than the tag option? `Save` was disabled because
   no tag exists, which is not evidence that no other target exists.
3. If the target is member-count-conditional, invite a second member (an account
   change; owner) and re-read. That is smaller than a second workspace and tests
   the actual hypothesis.
4. Only if all three fail: an API write probe (owner), which is E32.

Cost: free for (1) and (2); owner gate for (3) and (4) (E36/E37). Acceptance:
the sentence distinguishes "not observed in build X on date Y" from "cannot".

### 5. "Cannot be created at all" and "the UI cannot make one" sit in one file

`docs/policy-remote.md` line 122: "a policy cannot be created on this account at
all". Line 145, same file: "only the UI cannot make one. A write through the API
might still work". The ledger repeats the stronger form: "cannot be probed on
this account at all". E31 was specifically run to narrow this claim, and the
narrowing landed in one paragraph without updating the other.

**Way forward:** one edit, three places, one sentence: "This build's UI cannot
create a member tag, so a policy cannot be created through the UI here; the API
write is untested." Then either E37 or no further claim.

### 6. Enterprise planes are marked impossible while the paragraph describes them working

The row says:

> X stands for "an admin can bind this plugin": the plugin's own `session/start`
> is one of the things that refuses, and nothing here can name a policy

If a managed policy makes this plugin's `session/start` refuse, then an admin
*has* bound the plugin — that is the binding. The unavailability is narrower: the
local document vocabulary cannot express the binding, and this machine cannot
observe the managed channel. The vendor changelog cited in the same row confirms
the behaviour ships.

**Ways forward:**

1. Reclassify to **P**: the managed channel binds (vendor changelog), the local
   vocabulary cannot name it, and the channel is unobservable here.
2. Or keep **X** but define it narrowly: "the local policy document cannot
   express a binding". Then the row title needs to change too, because the
   dimension is enterprise planes, not one file format.

Recommend (1); it is a better statement of what the evidence shows. Cost: free.

### 7. Two platform-neutral H rows are pinned only by POSIX tests

Rows "Wedged host (alive, silent)" and "Reaping a dead child" claim H with no
platform qualifier. The tests that pin them are skipped on Windows (finding 2),
and the host-process test's own comment says "measured on Linux only (and macOS
by construction, not by run)" — but macOS does run them (`skipped="0"`), so the
comment is stale in the other direction.

**Way forward:** port the frozen-host test with `freezeForever`; port the EOF
test with a force-kill fixture; until then, add "POSIX-only; Windows unmeasured"
to both rows. Cost: one dispatch (E34), included with finding 2.

### 8. The ledger's versions have moved under it

The installed CLI is `opencode v2.4.1`. The ledger cites 2.3.2 eight times and
2.0.29 once; the newest measurements are round 23/25. That is not automatically
wrong — a 2.3.2 measurement can still describe 2.4.1 — but no row says "measured
on", and three of the rows are about behaviour the v2 docs describe differently
(plugin entries, `external_directory` defaults, install dedupe).

**Ways forward:**

1. Add a `Measured on` column to the ledger (or a suffix in Basis: "on 2.3.2").
2. Put the versions in `doctor --json` and in the claims table footer, so a
   reader can see what the run actually exercised.
3. Recheck the five cheapest high-traffic rows on 2.4.1 in one session (turn cap,
   two installs, headless run, `policies` deny, plugin load order).

Cost: free for (1) and (2); one session for (3), no paid turn unless the
turn-cap row needs one.

### 9. The OS-isolation row is a 2.0.29 snapshot of a moving target

Row C says "a source audit of 2.0.29 finds no seatbelt, landlock, docker or
devcontainer". As of November 2026 that is still true of core, but incomplete:
issue #48411 carries two implementation attempts — #63599 (bubblewrap + Seatbelt,
no Windows backend) and #64093 (Microsoft MXC, all three platforms, fail-closed)
— and a third-party plugin, `universal-opencode-sandbox` 0.4.1, already ships MXC
for shell commands. Two independent 2026 write-ups also say v2 changed the
`external_directory` default to allow unless a rule says otherwise, which means
the row's sentence "every agent's base policy allows everything except `.env`
reads" describes v1 and should be re-read from the v2 tree before it is repeated.

**Ways forward:**

1. Keep N (the harness still ships no sandbox) but add the opt-in routes and a
   recheck date; a reader who needs containment today has a path.
2. Re-read the v2 default from the tree, not from blog posts, and quote the line.
3. Add a flip condition: a core release that enforces a sandbox, or a v2 default
   that changes what "allow everything" means.

Cost: free. No decision change.

### 10. "No rule can name an MCP tool" is an inference, not a measurement

E-D24 measured one `denyUnmatched` shape and saw the bridged call refused with
`deny_unmatched`. The row then generalises: "Muse's saved rules are
command-prefix scoped, so no rule can name an MCP tool. `allowAll` is the only
mode that lets a bridged call through." A wildcard rule, or a resource shaped
like a tool name, was not tried. If a `*` rule refuses the bridged call, the
"only mode" sentence is too strong and the `allowAll` decision needs a narrower
reason.

**Way forward:** one fixture or one host run with (a) a `*` rule and (b) a
tool-shaped resource under `denyUnmatched`; record both outcomes. Cost: one H run
(E39) or a fixture if the mode is client-side. Acceptance: the row says which
shapes were tried.

### 11. The snapshot cannot answer the question it exists to answer

`docs/evidence/2026-11-24-791840c.json` stores per-OS `tests`, `failures`,
`files`, and the commit. It does not store `skipped`, `assertions`, per-suite
results, or the artifact URL. That is why finding 2 survived the round that was
about counts: the snapshot records the number that was quoted, not the numbers
that distinguish "ran" from "declared".

**Way forward:** snapshot schema v2 — per suite: `tests`, `assertions`,
`failures`, `skipped`; top level: `arch`, `runner`, `artifact_url`, `workflow
run`. Regenerate for 45296080862 from the artifacts already in `scratch/`. Cost:
free (E41).

### 12. U16 and U22 are now false

U16: "the matrix ran on 2026-11-23 (Ubuntu green, Windows red on fixtures, macOS
no runner)". Round 25 ran all three green; macOS ran. U22: "No code path is
claimed to work on Windows that a test has run there". Round 23 ran the installer
and a real `muse serve`; round 25 ran the suite. Both sentences were true when
written and are now contradicted by the same repo's newer evidence.

**Way forward:** rewrite both to the current residual (desktop only; UAC,
SmartScreen, interactive sign-in, a real turn). Cost: free, same commit as
finding 5.

### 13. SEP-2663 is an extension, and the citation says otherwise

The SEP is Final, Extensions Track, created 2026-04-27, extension identifier
`io.modelcontextprotocol/tasks`, with `tasks/get` / `tasks/update` /
`tasks/cancel` and server-directed task creation. The row says "SEP-2663 Tasks
(final, 2026-07-28)" and "no task-get". The decision (D) does not depend on the
date or the method name, but a reader checking it will find the mismatch.

**Way forward:** cite the SEP id and date correctly, say `tasks/get`, and note
that task creation is server-elected — which is an extra reason the bridge cannot
use it. Cost: free.

### 14. macOS arm64 is an inference

The platform doc says "`macos-latest` (arm64; the log resolves git at
`/opt/homebrew/bin/git`)". The homebrew path is strong but indirect; the runner
label moved to arm64 and could move again. If the claim matters (it does, because
the row is about architecture-specific behaviour), have the workflow echo
`runner.arch` and store it in the snapshot.

**Way forward:** one line in the job, plus the snapshot field from finding 11.
Cost: free.

### 15. The field survey has been wrong three times; that is a process signal

Round 15: brew was recorded as not gating; it gates (`fatal: true`, exit 1).
Round 18: `codex doctor` was recorded with a status value it does not have.
Round 19: `a4 doctor`'s exit ladder was attributed to the doctor; it belongs to
the CLI. Each was caught and corrected, which is the system working — but the
same class of error recurred because the convention allows a summary sentence
where a quote is needed.

**Ways forward:**

1. Require, for every external claim, `{url, quote, as_of, version}` in the
   Basis cell or a linked claims file. A quote is checkable; a paraphrase is not.
2. Add a `check:claims` script that verifies the mechanical parts — issue state
   via `gh api`, URL 200, version strings — and fails when a cited issue closes
   or a cited version no longer matches.
3. Keep the `Recheck` column (added in round 25) and require every row that cites
   an external artifact to fill it.

Cost: free, ongoing; the first pass is E40.

---

## 3. What held up

Not everything is soft. These were re-checked and carry as written:

- **The watchdog defaults** (900 s / 180 s / 90 s) match `src/watchdog.ts:43-45`.
- **The E28 guard** does fail on a renamed listed file; the allowlist cannot
  excuse a tracked test. It is the right kind of check, just file-level.
- **E29's sampler** now fails on a failed sample and reports both lists; the
  `failed=0` and `survivors=[]` results are real for the shapes it tests.
- **Round 25's Windows diagnosis** is the strongest evidence in the repo: a
  fixture crash, an instrument fix, a measured 260 ms terminal, and a green run
  afterwards. The deviation from the plan was recorded, not smoothed over.
- **The doctor-gate property** (a finding gates when a user's declaration is not
  in force) is coherent and survives the counterexamples; the field survey around
  it is what was error-prone, not the rule.
- **The MCP Tasks decision** holds: MSP has no task handle and the bridge returns
  a result, regardless of SEP-2663's precise date.
- **The turn-cap row** is correctly N, and the vendor's `not_planned` closure is
  cited as a closure, not as confirmation.
- **The local-only vs published frame** distinction is now real and guarded, and
  the committed snapshot is the right shape of artifact — it just needs two more
  fields.

---

## 4. Proposed path

### Now, free, no owner gate (one commit)

1. Narrow the Console sentences (findings 4, 5) to "not observed in build
   `index-OIWtun4R.js` on 2026-11-24", in `policy-remote.md`, the ledger, and the
   audit status block.
2. Reclassify enterprise planes to P, or narrow X to the local vocabulary
   (finding 6).
3. Fix U16/U22 (finding 12) and the SEP citation (finding 13).
4. Snapshot v2 with `skipped`, `assertions`, per-suite, `arch`, artifact URL
   (findings 2, 11, 14), regenerated from `scratch/junit-final`.
5. Add `Measured on` to the ledger rows that cite 2.3.2 / 2.0.29 (finding 8).
6. Rewrite the OS-isolation row with the opt-in routes and a recheck date
   (finding 9).

### One round, three dispatches, no paid turns

| ID | Experiment | Cost | Exit criteria |
|---|---|---|---|
| E34 | Skip accounting + port the three Windows skips + `runner.arch` | 1 dispatch | Windows says 410 ran or 408 ran / 2 named skips; snapshot agrees |
| E35 | Project-scoped plugin hook origin on a real host | 1 real run | `handlerKind` recorded; gate sound or code change proposed |
| E38 | Grandchild survivor fixture, win32 + POSIX | 1 dispatch | Orphan row names the process shapes; reaper decision scoped |
| E39 | `denyUnmatched` wildcard / tool-shaped rule | fixture or 1 H run | "allowAll is the only mode" stands or narrows |

### Owner-gated

- **E36** — re-read the Console target control and scan the bundle strings
  (read-only, free). Recommended first, because it may dissolve finding 4.
- **E37** — create one tag, one Providers deny, read `debug config`, delete
  (account change). Only if E36 leaves the API question open.

### Process

- Add the external-claim schema (`url`, `quote`, `as_of`, `version`) and a
  `check:claims` pass (finding 15, E40). This is the fix that prevents the next
  brew/codex/a4 correction.
- Adopt one rule for negative claims: absence may be stated only as "not observed
  in build X, date Y, by method Z", never as "cannot". That single rule would
  have caught findings 4 and 5 before they shipped.

---

## 5. What this does not change

No product decision is reversed by this review. The hook gate may need different
words or a narrower guard, not a different posture; the platform row stays P for
the desktop; the policy row stays P for the remote half; the Windows suite claim
gets more honest, not smaller. The pattern worth naming is that the ledger's
weakest sentences are the ones that generalise from one observation — "cannot",
"only", "every", "no rule" — and those are also the sentences a reader is most
likely to rely on.
