# Round 21 plan: make the platform seam real, correct the listing gates, and keep the policy plane honest

Written 2026-11-23. HEAD `631e9a2`. Evidence: `docs/round-21-research.md`
(E-R21-01–E-R21-17).

Round 20 treated the four open items as documentation gaps: the platform matrix
was undispatched, macOS and Windows were unmeasured, the Console policy half was
unobservable, and `opencode.im` had no listing. The research overturns the first
assumption. Windows is likely broken at spawn, not merely unmeasured, and the
`awesome-opencode` action cannot run because the list now has eligibility rules
this repository does not meet. This round separates what can be measured here,
what needs a host, what needs the owner, and what is honestly deferred.

There is no new runtime feature. The only code change is a conditional Windows
spawn/close fix, and only if the evidence supports it. Everything else is
records, experiments, or a public action the owner gates.

## Decisions

**D124 — Windows spawn is a defect risk, not a documentation gap.** The vendor's
Windows install puts `muse` on PATH as a `muse.cmd` shim (or a PowerShell
launcher). Node cannot spawn a `.cmd` without a shell, and the pinned SDK calls
`child_process.spawn` with no `shell` (E-R21-06, E-R21-07). The default path is
therefore likely `spawn EINVAL`. The fix is to resolve the native
`muse-bin-*.exe` next to the shim before spawning; use `cmd.exe /d /s /c` only
if no native exe exists. Do not claim Windows support until a Windows host
passes the spawn and close probes. `MUSE_BIN` remains the escape hatch.

**D125 — Windows close needs a process tree, not a child.** SDK 1.4.24 sets
`ownsProcessGroup = false` on `win32` and has no `taskkill` path
(E-R21-07). If a Windows host shows a surviving `muse-bin` or `conhost` after
`host.close()`, add a Windows tree-kill wrapper (`taskkill /PID <pid> /T /F`)
that treats exit 0, 128 and 255 as success only after verifying the tree is
gone, or send the fix upstream. Do not ignore every nonzero exit; 255 can mean
"a child already exited", but it can also mean the wrong PID. The test is the
process table, not the exit code.

**D126 — The CI matrix is a fixture check, not a seam check.** Dispatching
`test.yml` on macOS and Windows is useful, but its hosts are `.mjs` fixtures
under Node. It cannot prove that `muse.cmd` spawns, that the ledger is `0600`,
that UAC is answered, or that close reaps the tree. A green matrix is not a
parity claim. Dispatch only if a remote branch is authorized; otherwise use a
host.

**D127 — Console policy stays unobservable unless an experiment shows a
source.** The docs now state a six-level precedence order and say Console
changes apply on the next fetch (E-R21-03). On this machine `opencode debug
config` names a `document` and two `directory` sources, no Console source, and
`info.policies` contains local statements (E-R21-05). That is not enough to
attribute a Console policy. Add the precedence table and the sentence "a
Console or managed policy may apply and is not visible here"; no deny-by-effect
probe. If E6 shows a Console policy in `debug config`, add a doctor clause; if
not, the doc stays.

**D128 — Discovery is sequenced by eligibility.** `opencode.im` is the only
actionable channel today: the package has the keyword and an install command,
the site checks daily, and no listing was found (E-R21-13). Submit through the
form and recheck at 24 hours and 7 days. `awesome-opencode` is deferred until
the repository has 25 stars and is 30 days old (earliest 2026-12-18) and its
YAML entry is ready (E-R21-11, E-R21-12). `opendock.net` is verify-only; it
auto-indexes the npm keyword (E-R21-14). No star gaming, no paid placement.

**D129 — Experimental surfaces are snapshots, not contracts.** opencode 2.4.1
shipped after the 2.3.2 snapshot; PR #59880 is still open; #60252 is still open
(E-R21-01, E-R21-02, E-R21-04). Re-baseline on 2.4.1 before claiming
compatibility, keep 2.3.2 as the tested version until then, and check the
watchlist monthly. A change is a new round, not a silent edit.

**D130 — Windows UAC and persistent sandbox accounts are a disclosure issue.**
The vendor documents a UAC prompt on first sandbox initialization, and issue
#138 reports persistent local users, a group, profiles, a ProgramData root and
workspace sharing changes without pre-disclosure (E-R21-09). Document it in
`docs/platform-support.md` and add a doctor note on `win32`; do not block the
spawn. The plugin is not the sandbox owner, and a block would make the plugin
unusable on a platform the vendor supports. The honest posture is informed
consent, not silence.

**D131 — No new runtime surface.** No ACP surface, no new provider, no
auto-update, no telemetry, no new dependency. Code only for the Windows
spawn/close evidence. Everything else is a record, a test, or a host probe.

**D132 — Public actions are owner-gated.** An `opencode.im` submission, an
`awesome-opencode` PR, a branch push, a tag, and a publish are not experiments.
They speak for the repository in public. Prepare them, then stop for the owner.

## Experiments

Each experiment has a hypothesis, a method, a pass/fail, and the decision it
moves. "Local" means this checkout can run it without a new host or a public
action. "Host" means macOS or Windows. "Owner" means a Console workspace or a
public submission.

### E1 — Re-baseline on the installed opencode 2.4.1 (local, high priority)

**Hypothesis.** The plugin loads on 2.4.1, lists `muse/*`, keeps each model
record's limits, and keeps the `canonical` label without inheriting the
catalog's limits.

**Method.** The owner updated the installed host to 2.4.1 during the round, so
use that binary; do not install a second host. Confirm the version first. Then
use isolated `XDG_*` directories and a temporary config that points at this
checkout:

```bash
opencode --version
cd ~/repos/opencode-plugin-muse
mkdir -p scratch/round-21
tmp=$(mktemp -d scratch/round-21/xdg.XXXXXX)
mkdir -p "$tmp/config/opencode"
printf '%s\n' '{"plugins":["/home/jonat/repos/opencode-plugin-muse"]}' \
  > "$tmp/config/opencode/opencode.jsonc"
XDG_CONFIG_HOME=$tmp/config XDG_DATA_HOME=$tmp/data \
XDG_STATE_HOME=$tmp/state XDG_CACHE_HOME=$tmp/cache \
  opencode models --standalone | grep '^muse/'
```

On 2.4.1, the round-20 read returns an empty list:

```bash
XDG_CONFIG_HOME=$tmp/config XDG_DATA_HOME=$tmp/data \
XDG_STATE_HOME=$tmp/state XDG_CACHE_HOME=$tmp/cache \
  opencode api get /api/model --standalone | jq '{count:(.data|length)}'
```

If the count is 0, do not call that a plugin failure. Record "model read empty
on 2.4.1" and read the limit half through the unit test and source:

```bash
bun test test/contributor-models.test.ts
```

The test pins that the model record's limit wins and `canonical` is left to the
provider. If a later 2.4.x exposes the record again, add the API read back.
The package still pins `@opencode/plugin` 2.3.2 while the host is 2.4.1
(E-R21-19); record whether it loads without a warning, but do not bump the
dependency as part of this experiment.

**Pass.** `muse/muse-spark-1.3` (or the current catalog) appears; the focused
test passes; `canonical` remains `"meta"` and the limit is not `meta`'s catalog
value in the source/test. No new warning about the plugin API.

**Fail.** The plugin does not load, the provider is absent, the focused test
fails, or `canonical` starts inheriting. Stop and report; do not edit the
expectation.

**Decision.** Pass: update the README sentence to "tested on 2.3.2; loads on
2.4.1; limit read via the model record test" and record the probe. Fail: keep
2.3.2 as tested, file the regression, and pin the plugin API.

### E2 — Windows spawn resolution (host, high priority)

**Hypothesis.** `spawn("muse", ["--version"])` on Windows resolves to
`muse.cmd` and fails `EINVAL`; the adjacent `muse-bin-*.exe` works.

**Method.** On a Windows 11 host with Muse Code installed:

```powershell
Get-Command muse -All | Select-Object CommandType,Source
muse --version
node -e "const{spawn}=require('child_process');const c=spawn('muse',['--version'],{stdio:'inherit'});c.on('error',e=>console.log('ERR',e.code,e.message));"
Get-ChildItem "$env:LOCALAPPDATA\Programs\muse" | Select-Object Name
$exe = Get-ChildItem "$env:LOCALAPPDATA\Programs\muse\muse-bin-*.exe" |
  Select-Object -First 1 -ExpandProperty FullName
node -e "const{spawn}=require('child_process');const c=spawn(process.argv[1],['--version'],{stdio:'inherit'});c.on('error',e=>console.log('ERR',e.code,e.message));" "$exe"
```

Then repeat with the plugin's real path: `MUSE_BIN=$exe` and a `muse serve`
handshake. Record the exact `Get-Command` source and the exe name.

**Pass.** `muse` fails `EINVAL`; `$exe` prints the version; the handshake
answers. This confirms D124 and the resolver.

**Fail.** `muse` is already a spawnable `.exe`, or the exe path does not work.
Then the resolver is unnecessary or wrong; record it and do not ship code.

**Decision.** Pass: implement a resolver in `src/host.ts` that prefers
`MUSE_BIN`, then the native `muse-bin-*.exe` next to `muse.cmd`/`muse`, then
`muse` on POSIX. Add unit tests with injected `platform`, `env` and directory
listings; no Windows host is needed for the unit test. Do not add `shell: true`.
Fail: document the actual resolution and close D124.

### E3 — Windows close and process tree (host, high priority)

**Hypothesis.** With the native exe, `host.close()` ends the child; with the
`.cmd` shim, it can leave `muse-bin` or `conhost` alive because the SDK's
Windows path is child-only.

**Method.** On the same Windows host, spawn the chosen binary with stdio pipes,
do `initialize` → `initialized` → `account/read`, then:

1. end stdin, wait 10 s, and inspect the process table;
2. if still alive, call `host.close()` and wait 10 s;
3. inspect descendants with PowerShell:

```powershell
Get-CimInstance Win32_Process |
  Select-Object ProcessId,ParentProcessId,Name,CommandLine |
  Where-Object { $_.Name -match 'muse|conhost|powershell|cmd' }
```

Record the tree before and after, the exit code, and the elapsed time. Repeat
once with a turn in flight if a paid turn is authorized; otherwise record that
the in-flight case is untested.

**Pass.** No `muse-bin` or `conhost` descendant remains after close; the exit is
observed.

**Fail.** An orphan remains, or close throws. Then D125 applies: add a Windows
tree-kill wrapper, or patch the SDK upstream. Test the exit-code policy against
0, 128 and 255, and verify the process table, not just the code.

**Decision.** Pass: no code; record the Windows close as tested. Fail: implement
the smallest wrapper that reaps the tree, with a unit test for the exit-code
mapping and a host test for the process table. Do not claim Windows support
until the host test passes.

### E4 — Windows ACLs and UAC (host, medium)

**Hypothesis.** The ledger and trust record are inherited ACLs, not `0600`; the
doctor says so; a headless spawn may trigger UAC and surface as
`host_idle_timeout`.

**Method.** On Windows:

```powershell
bun run doctor
muse sandbox windows check
icacls "$env:USERPROFILE\.local\share\opencode" 2>$null
```

Read the ledger path from the doctor output, then `icacls` that file. Start a
headless spawn with a short timeout and record whether a UAC prompt appears or
the run times out. Do not click through UAC unattended; record the block.

**Pass.** The doctor prints "inherited ACL (Windows chmod changes only the
write bit)" and does not claim `0600`; the UAC behavior is documented.

**Fail.** The doctor claims `0600`, or a headless spawn hangs without naming
UAC. Fix the wording and add the `win32` note; do not add a fake permission
check.

**Decision.** Docs and doctor text only. This is D130; no runtime block.

### E5 — macOS seam (host, medium)

**Hypothesis.** The offline suite passes; `muse serve` spawns; the ledger is
`0600`; close leaves nothing behind.

**Method.** On macOS:

```bash
bun run check:offline
bun run doctor
```

Then spawn `muse serve` through the plugin, run one turn if spend is authorized,
inspect the ledger mode, and close. Check `ps` for an orphan.

**Pass.** Suite passes, doctor answers, ledger is `0600`, no orphan.

**Fail.** Record the failing row; do not generalize from Linux.

**Decision.** Update `docs/platform-support.md` with the macOS result. No code
unless the failure is in this plugin.

### E6 — Console policy visibility (owner Console, high for docs)

**Hypothesis.** A Console workspace policy does not appear in `opencode debug
config` with a source the doctor can attribute; the remote half stays
unobservable.

**Method.** With the owner's Console workspace, add one harmless policy (for
example, deny `provider.use` for a provider this checkout does not use). Then:

```bash
opencode auth list
opencode debug config --standalone |
  jq -c '.[] | {type, path, policies: (.info.policies // null)}'
```

Compare before and after. Do not print credentials or provider settings; only
`type`, `path` and `policies`. If the policy appears, note which source carries
it and whether the doctor's existing `--print-logs debug config` sees it. If it
does not, record "no source attribution" and stop.

**Pass.** The policy appears in a source the doctor can name. Then add a doctor
clause and a docs sentence; no probe.

**Fail.** It does not appear, or it appears without a source. Keep D127; the
docs say "may apply, not visible".

**Decision.** Docs, plus a doctor clause only on pass. No deny-by-effect probe.

### E7 — `opencode.im` submission (owner-gated public action)

**Hypothesis.** The package is eligible for review but not yet listed.

**Method.** Submit `@jonathand34/opencode-plugin-muse` at
<https://opencode.im/submit>. Record the timestamp. Recheck
`https://opencode.im/plugin/opencode-plugin-muse` and
`https://opencode.im/plugins?search=muse` at 24 hours and 7 days.

**Pass.** A listing appears with the correct install command and description.

**Fail.** A rejection is recorded with its reason. No response after 7 days is
"no listing found", not "rejected".

**Decision.** D128. The owner approves the public submission; the executor
prepares the text and stops at the form.

### E8 — `awesome-opencode` and `opendock.net` (read-only, low)

**Hypothesis.** `awesome-opencode` is hard-blocked by eligibility; `opendock`
may index automatically.

**Method.**

```bash
gh repo view jond34/opencode-plugin-muse \
  --json stargazerCount,createdAt,pushedAt,isArchived,visibility
curl -s -o /dev/null -w '%{http_code}\n' \
  https://www.opendock.net/plugins/opencode-plugin-muse
curl -s 'https://www.opendock.net/plugins?search=muse' |
  grep -io 'opencode-plugin-muse\|jonathand34' | sort -u
```

Recheck on or after 2026-12-18 for the 30-day rule, and only submit the YAML
when the star count is at least 25. The entry is:

```yaml
name: Muse Code
repo: https://github.com/jond34/opencode-plugin-muse
tagline: Muse Code subscription provider for OpenCode; the credential stays in the muse CLI.
description: |
  Registers the muse provider and drives the signed-in muse CLI over MSP, so a
  Muse Code subscription works in OpenCode without the credential leaving the
  CLI. OpenCode V2 only; 2.3.2 or newer.
scope:
  - global
min_version: "2.3.2"
installation: |
  ## Install
  ```bash
  opencode plugin add @jonathand34/opencode-plugin-muse
  ```
  Sign in with `muse login`, then restart OpenCode. The plugin never holds the
  credential.
```

**Pass.** The repository meets both gates and the YAML validates.

**Fail.** Either gate is unmet. Defer; do not game stars.

**Decision.** D128. No PR now.

### E9 — Watchlist (monthly, low)

Check and record: opencode release tag, PR #59880, issue #60252,
`@muse-code/sdk` version, `muse --version`, `muse login --help`, and
`opencode --version`. If any changes, open a new round; do not silently edit the
snapshot. The record lives in `docs/watchlist.md`.

## Documentation corrections

These are proven by the research and do not need a host.

**S1. `docs/ecosystem.md`.** Replace the README `<details>` block with the YAML
shape and the eligibility rules. State: no `opencode.im` listing found; submit
through the form; `awesome-opencode` is deferred until 25 stars and 30 days;
`opendock.net` has no direct listing and auto-indexes the npm keyword; the bare
domain does not resolve, `www` does; the ACP Registry is still agents-only.

**S2. `docs/platform-support.md`.** Change the spawn row from "unmeasured" to
"likely `spawn EINVAL` until the native `muse-bin-*.exe` is resolved". Add the
SDK's Windows child-only close and the orphan risk. Add the UAC/persistent
accounts disclosure and issue #138. Keep the matrix caveat: it proves fixtures,
not the seam. Do not claim macOS or Windows parity.

**S3. `docs/policy-remote.md`.** Replace `config status --json` with
`opencode debug config`; note that it lists `document` and `directory` sources
and no Console source on this machine. Add the six-level precedence table and
the Console fetch/outage behavior. Keep "local H, remote unobservable, no
probe". Add the condition: a queryable source or #60252 shipping.

**S4. `README.md`.** Change "as of opencode 2.3.2" to "tested on 2.3.2; 2.4.1
is installed, loads, and its limit read is pending" until E1 passes. Add the platform link's
"Windows likely needs `MUSE_BIN`" sentence only if E2 confirms. Add the Console
"may apply, not visible" sentence to the `policies` paragraph.

**S5. `docs/decision-coverage.md`.** Update the platform and policy basis cells
with E-R21-06–E-R21-09 and E-R21-03–E-R21-05. Keep both rows P. Do not change
the counts unless a new row is opened; the platform row already owns the
dimension. Preserve the owner's U16→P and 85/85 edits.

**S6. `docs/watchlist.md`.** New file: surface, snapshot, last checked, trigger,
action. Rows: opencode host/plugin API, `canonical`/PR #59880, `policies`/#60252,
Muse SDK/MSP, `muse acp`, platform hosts, discovery listings.

## Implementation sequence

1. **Records first (S1–S6).** Correct the stale docs before running anything
   that could change them. No code.
2. **E1.** Re-baseline the installed 2.4.1. Record pass/fail in
   `docs/round-21-research.md` and update the README sentence if it passes.
3. **E2/E3/E4/E5.** Run the host probes that are available. If no Windows or
   macOS host, record "blocked: no host" and do not write a support claim.
4. **E6.** Run the Console probe if the owner can add a harmless policy;
   otherwise record "blocked: no Console workspace".
5. **E7/E8.** Prepare the `opencode.im` submission and the `awesome-opencode`
   YAML; stop at the owner gate. Verify `opendock` only.
6. **Conditional code.** Only if E2/E3 show the defect: resolver and/or
   tree-kill wrapper, with unit tests and a host test. No other runtime change.
7. **Verify.** `bun run check:offline`; `git diff --check`; the greps below;
   `git status -s`. Record the actual test count; do not hardcode 418.
8. **Commit gate.** Commit only after the owner says go. Never stage
   `docs/integration-landscape.md`.

## Verification greps

```bash
grep -n "opencode.im\|awesome-opencode\|25 stars\|30 days" docs/ecosystem.md
grep -n "EINVAL\|muse-bin\|child-only\|#138\|UAC" docs/platform-support.md
grep -n "debug config\|precedence\|Console\|60252" docs/policy-remote.md
grep -n "2.4.1\|2.3.2\|Console" README.md
grep -n "D124\|D125\|D126\|D127\|D128\|D129\|D130" docs/round-21-plan.md
git diff --check
git status -s
```

## Product choices

These are the choices that do not fall directly out of an experiment. Each has a
default; the owner only needs to answer the three in "Minimal decision layer".

**Q15. Windows resolver now, or docs-only until a Windows host?**
(A) Implement the resolver now, with unit tests and no support claim —
**recommended.** The code evidence is strong (E-R21-06, E-R21-07), the resolver
is testable on Linux, and `MUSE_BIN` already exists as a workaround.
(B) Docs-only until a host confirms EINVAL. Cheaper, but leaves a likely broken
default in place.
(C) Declare Windows unsupported. Honest, but stronger than the evidence; the
vendor supports Windows and the fix is small.

**Q16. Windows UAC disclosure: README only, README + doctor note, or block?**
(A) README + doctor note — **recommended.** The UAC prompt and the persistent
sandbox accounts are a consent issue (E-R21-09); the doctor is where a user
looks before a spawn.
(B) README only. Less code, easier to miss.
(C) Block Windows until #138 is fixed. Overcorrects; the sandbox still works.

**Q17. Discovery sequencing: opencode.im now, or wait for both?**
(A) Submit `opencode.im` now; defer `awesome-opencode`; verify `opendock` —
**recommended.** It is the only eligible channel (E-R21-13); the curated list
cannot accept the repo yet (E-R21-11, E-R21-12).
(B) Wait for both. Slower with no benefit.
(C) Do nothing. Leaves the only actionable channel unused.

**Q18. Policy docs: precedence table + "not visible", or local-only?**
(A) Add the table and the sentence — **recommended.** The docs now describe a
six-level order (E-R21-03); the current record is incomplete.
(B) Keep local-only. Simpler, but a user with a Console workspace gets a false
sense of completeness.
(C) Add a probe. Rejected: it cannot distinguish denial from absence, and it
may spend a turn (D127).

**Q19. Experimental cadence: monthly watch, pin forever, or track latest?**
(A) Monthly watch + re-baseline on releases — **recommended.** 2.4.1 already
shipped (E-R21-01); a pin without a watch rots.
(B) Pin 2.3.2 indefinitely. Safe until a user hits a 2.4-only bug.
(C) Track latest automatically. Rejected: the plugin API is experimental; an
auto-update can break a working install.

**Q20. CI matrix: no push, or push a branch and dispatch?**
(A) No push; use macOS/Windows hosts — **recommended.** A push is a public
action (D132), and the matrix cannot prove the seam (D126).
(B) Push a short-lived `ci/platform-matrix` branch and dispatch. Useful for the
fixture signal; delete the branch after. Requires the owner's explicit push
approval.
(C) Never run it. Loses the fixture signal for no reason.

## Steelmen and strawmen

**Windows spawn.** Steelman for "it works": the vendor supports Windows, ships a
native binary, and documents a PowerShell installer; a native exe on PATH would
spawn. Steelman against: Node cannot spawn a `.cmd` without a shell, the SDK
does not use one, and two independent harnesses reproduced `EINVAL`. Strawman
one: "Windows is unsupported" — the vendor supports it; this is a client bug.
Strawman two: "the CI matrix proves Windows" — it does not spawn `muse`.

**Windows close.** Steelman for the SDK: it observes the real exit and escalates
SIGTERM→SIGKILL. Steelman against: on `win32` it has no process group, so a
grandchild can hold the pipes; `taskkill /T` exits 255 when a child is already
gone. Strawman one: "taskkill fixes everything" — it can kill the wrong tree if
the PID is a shell. Strawman two: "an orphan is harmless" — it holds the
workspace and the next spawn can collide.

**Console policy.** Steelman for observability: the docs give a precedence
order, and `debug config` already prints local `info.policies`. Steelman
against: it names no Console source on this machine, and #60252 says the remote
decoder is silent. Strawman one: "remote policies do not apply" — they do.
Strawman two: "the doctor can read them" — no source attribution yet.

**Discovery.** Steelman for auto-indexing: the package has the keyword, the
README has an install command, and both directories check daily. Steelman
against: no listing after five days, and the curated list has a 25-star gate
this repo fails. Strawman one: "listing is marketing" — it is the difference
between found and not found. Strawman two: "the package is already everywhere"
— it is not in `awesome-opencode`, `opencode.im` or `opendock` today.

**Terms.** Steelman for "inside the harness": the credential is used by
`muse serve`, which is the vendor's documented headless surface, and the plugin
never holds it. Steelman against: the request originates in opencode, and Meta
has not endorsed this client. Strawman one: "publishing violates §3.2" — the
clause is about the credential's use, not the tarball. Strawman two: "Meta
endorses plugins" — it does not say so.

**Experimental surfaces.** Steelman for pinning: 2.3.2 is tested and 2.4.1 is
one day old. Steelman against: 2.4.1 is already the current release, and a pin
without a watch becomes a stale claim. Strawman one: "never update" — the
plugin will rot. Strawman two: "always latest" — the API is experimental.

## Conditions for confidence

| Decision | Confident when | Flip when |
|---|---|---|
| D124 Windows resolver | A Windows host shows `EINVAL` for `muse` and a working `muse-bin-*.exe`; or the resolver's unit tests cover the path | `muse` is already a spawnable `.exe`, or the native exe path is unstable |
| D125 Windows tree kill | A host shows an orphan after close; the wrapper reaps it; the process table is empty | SDK 1.4.25 fixes the Windows group; or the orphan is not reproducible |
| D126 matrix | The workflow runs on all three runners; the jobs pass | A host probe shows the seam fails despite a green matrix |
| D127 Console policy | A Console policy appears in `debug config` with a source the doctor can name | #60252 ships, or the host exposes a query surface |
| D128 discovery | `opencode.im` lists the package; `awesome-opencode` meets 25 stars and 30 days | A directory rejects the package, or the star/date gate is unmet |
| D129 2.4.1 baseline | The plugin loads, lists `muse/*`, and keeps the record's limits | A regression appears; pin 2.3.2 and file it |
| D130 UAC disclosure | The Windows host shows the UAC prompt or the doctor names the risk | Issue #138 is fixed, or the vendor documents the inventory |
| D131 no new surface | No evidence requires a new runtime path | A host probe shows a missing capability |
| D132 public gate | The owner approves the specific action | The owner declines, or the action would publish without review |

## Minimal decision layer

The default plan runs without further choices. Only three decisions need the
owner:

1. **Q15:** implement the Windows resolver now (A, recommended) or wait for a
   host (B).
2. **Q17:** submit `opencode.im` now (A, recommended) or wait (B).
3. **Q20:** keep the matrix unpushed and use hosts (A, recommended), or approve
   a short-lived branch push (B).

Q16, Q18 and Q19 have defaults (A) and do not need a separate answer unless the
owner disagrees.

## Gates

- No push, tag or publish. No `muse acp`. No new dependency. Never write the
  host's log. Scratch stays in `scratch/`. `docs/integration-landscape.md` is
  the owner's edit: never stage. Commits only after the owner says go.
- Public actions (`opencode.im`, `awesome-opencode`, push, tag, publish) are
  owner-gated even though the owner approved experiments (D132).
- Every new claim carries an E-id or a source. Do not say "Windows supported",
  "parity", or "the matrix proves the seam".
- Do not claim the Console policy is readable until E6 shows a source.
- Do not submit `awesome-opencode` before 2026-12-18 and 25 stars.
- If a check disagrees with the research, stop and report rather than editing
  the expectation.

## Outcome (2026-11-23)

Records first, then the probes: E1 passed on the installed 2.4.1, and every
experiment that needed a host, a Console change or a public action is blocked or
held by the owner rather than answered. The owner held the product choices,
including the `opencode.im` submission, so Q17 is open and no public action ran;
Q15 and Q20 are moot this round because E2/E3 are blocked and no branch was
pushed. No runtime code changed, so D131 holds.

The full result table, the blocked reasons and the one measurement correction
(the `opencode.im` search page is client-rendered, so its HTML is not evidence)
are in `docs/round-21-research.md` under "Round 21 execution record".
