# Round 22 plan: prove the Windows contract, make the stub host honest, and read the Console compile

Written 2026-11-23. HEAD `aefec5b`. Evidence: `docs/round-22-research.md`
(E-R22-01–E-R22-12).

Round 21 left five experiments blocked and one held. The research moves two of
the gates: the Windows spawn failure is a documented Node contract with a known
fix filename, and the Console policy half is a personal-workspace task that
compiles into a config document. What stays blocked is narrower and more
expensive: a real Muse install on Windows, and a Mac.

This round ships one piece of code — a Windows binary resolver — plus tests and
a CI seam job. It adds no runtime dependency and no protocol surface.

## Decisions

**D133 — The Windows spawn failure is a contract, not a risk.** Node returns
`EINVAL` for a `.cmd` or `.bat` passed to `spawn` without `shell`, as a fix for
CVE-2024-27980 (E-R22-01). The vendor's launcher installs `muse-bin-<version>.exe`
and puts `muse.cmd` on PATH (E-R22-03). So `spawn("muse")` is broken by
specification on a normal Windows install, not probabilistically. Docs stop
saying "likely"; the README stops implying a Windows user might get lucky.

**D134 — The resolver reads the vendor's pointer before it globs.** Order on
`win32`: `MUSE_BIN`; then the first `muse.exe` on PATH (already spawnable); then,
in the directory of the first `muse.cmd`/`muse.bat`/`muse.ps1` on PATH, the
version named by `.muse-version` as `muse-bin-<version>.exe`; then the newest
`muse-bin-*.exe` in that directory; then `muse` as a last resort. On POSIX it is
`MUSE_BIN` or `muse`. The version file is the launcher's own pointer, so the
resolver does not pick a stale binary left by an interrupted update
(E-R22-03). No `shell: true`: Node documents it as the mitigation for sanitised
input (E-R22-01), but it re-opens the quoting class the CVE fix closed and the
vendor ships a native binary for exactly this.

**D135 — A missing native binary fails with an instruction, not `EINVAL`.** When
the resolver falls through to `muse` on `win32`, the host start must fail with a
message that names `MUSE_BIN`, the expected `muse-bin-<version>.exe`, and the
directory it searched. A bare `EINVAL` from Node is the failure round 21 was
trying to explain; the plugin should not reproduce it.

**D136 — The Windows seam test runs on `windows-latest` with stubs.** A CI job
creates a temporary directory with a `muse.cmd` shim, a native stub exe named
`muse-bin-9.9.9-R1.1.exe` (a copy of a real Windows exe such as `hostname.exe`),
and a `.muse-version` file, then asserts three things: `spawn("muse", …)` fails
`EINVAL`; the resolver returns the stub exe; spawning that path exits 0. This is
E2's mechanism on real Windows without Muse, a login, or a licence. It gates the
resolver; it is not a support claim.

**D137 — The matrix stays informational; the seam job gates.** The offline suite
leans POSIX — 3 of 43 test files touch `chmod`/`0600`, 8 reference `/tmp` or
`/home` (E-R22-12) — so a first Windows dispatch may fail on fixtures. That is a
finding to triage, not a seam result, and it must not fail the round or invite
"fix all fixtures" scope. The seam job is the only gating job; the suite jobs
report.

**D138 — `child.kill()` on a `.cmd` is the orphan mechanism, and it is testable
without the SDK.** E-R21-07 recorded the SDK's Windows close as child-only with
no `taskkill`. The platform behaviour behind that can be observed directly: a
`.cmd` that starts a grandchild, killed with `child.kill()`, leaves the
grandchild alive on Windows. A timeboxed CI job records it. This justifies a
tree-kill wrapper by mechanism plus source; it does not replace a real host for
the end-to-end close, and it does not justify building a fake MSP server to
drive the SDK.

**D139 — E4 needs a real install and stays documentation.** UAC, the persistent
accounts in #138, and the ledger's inherited ACL all require `muse serve` to
initialise on Windows with a signed-in subscription. The cheapest route is a
Windows 11 container under KVM (E-R22-09), which is an owner decision because it
installs Muse and logs in. Until then the rows stay documented and unmeasured;
no block is added.

**D140 — E5 splits: suite by CI, seam by Mac.** A hosted macOS runner can run
the suite and the close contrast; it cannot have a Muse login, so the seam stays
unmeasured. Do not generalise from Linux, and do not call a green macOS suite a
macOS support claim.

**D141 — No new runtime dependency, no new protocol surface.** The resolver uses
`node:fs`, `node:path` and `process.env`. The seam tests are scripts and workflow
steps. No cross-spawn, no shell wrapper library, no fake host.

## Implementation sketch

`src/host.ts` gains one exported resolver, injected for testability:

```ts
export interface MuseBinInput {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  pathEntries: readonly string[];
  readFile(path: string): string | undefined;   // .muse-version
  readdir(path: string): readonly string[];
  statMtime(path: string): number | undefined;
}

export interface MuseBin {
  command: string;
  source: "env" | "path-exe" | "version-file" | "newest" | "fallback";
}

export function resolveMuseBin(input: MuseBinInput): MuseBin;
```

Rules:

- `env.MUSE_BIN` non-empty → `{ command, source: "env" }`.
- POSIX → `{ command: "muse", source: "fallback" }` unless `MUSE_BIN` is set.
- `win32`: scan `pathEntries` in order for `muse.exe`, then `muse.cmd`,
  `muse.bat`, `muse.ps1`. A `muse.exe` wins outright.
- For a shim directory: read `.muse-version`, trim it, match the launcher's
  version pattern, and accept `muse-bin-<version>.exe` if it exists.
- Otherwise list `muse-bin-*.exe` in that directory and take the newest mtime.
- Nothing found → `{ command: "muse", source: "fallback" }`, and the caller
  raises D135's message.

The resolver is called once per host start and its `source` is logged at debug
level, so a bug report can say which rule fired without exposing paths in the
default output.

Unit tests (bun, no host): `MUSE_BIN` wins; POSIX ignores shims; `muse.exe` beats
`muse.cmd`; version file selects the named binary; a version file naming a
missing binary falls through to newest; no exe falls back with `fallback`; a
`.ps1` shim is recognised; ordering of PATH entries is respected.

## Experiments

### E10 — resolver unit tests (local, gating)

**Hypothesis.** The resolver's rules are fully testable with injected platform,
environment, PATH and filesystem, and no Windows host is needed for the logic.

**Method.** `bun test test/muse-bin.test.ts` after the resolver lands.

**Pass.** Every rule above is pinned by a test; the suite stays green on Linux.

**Fail.** A rule cannot be expressed without real Windows behaviour (for example
`fs.stat` rounding). Record which rule and stop.

**Decision.** Pass: the resolver ships with the round. Fail: ship only the rules
that are testable, and record the rest.

### E11 — Windows seam on `windows-latest` (CI, gating for D133/D134)

**Hypothesis.** On a normal Windows PATH entry, `spawn("muse")` fails `EINVAL`,
the resolver returns the native exe, and the exe spawns successfully.

**Method.** A `seam-windows` job: create a temp directory; write `muse.cmd`
(`@echo off` + `exit /b 0`); copy `%SystemRoot%\System32\hostname.exe` to
`muse-bin-9.9.9-R1.1.exe`; write `.muse-version` containing `9.9.9-R1.1`; prepend
the directory to `PATH` for the job; run `node test/seam/windows-spawn.mjs`,
which asserts the three claims and exits non-zero on any failure.

**Pass.** `EINVAL` observed for the shim, `source` is `version-file`, the exe
spawns and exits 0.

**Fail.** `muse` spawns (a native `muse.exe` is found first) or the exe does not
run. Then the hypothesis is wrong for this layout: record it, do not ship the
resolver's `version-file` rule as if it were observed.

**Decision.** Pass: D133 and D134 are confirmed on real Windows; the README may
say the resolver handles the shim. Fail: stop and report.

### E12 — Windows kill semantics on `windows-latest` (CI, timeboxed, informs D125)

**Hypothesis.** `child.kill()` on a `.cmd` leaves its grandchild running, while a
direct native child exits.

**Method.** `node test/seam/windows-kill.mjs`: spawn a `.cmd` that starts a
long-lived grandchild, kill the child, wait, and look for the grandchild in
`Get-CimInstance Win32_Process` (or `tasklist`). Repeat with the native stub exe
spawning the same grandchild. Timebox: if the process inspection is flaky on the
runner, record "inconclusive" and stop.

**Pass.** Grandchild survives under the `.cmd`, and the native child's tree is
clean or explicitly reported.

**Fail.** The runner reaps the tree anyway (job objects), so the observation is
inconclusive on CI. Record it; a real host decides.

**Decision.** Informs D125 only. An orphan on the runner justifies the wrapper's
design; it does not prove the real host's behaviour, and it does not justify
building a fake MSP host to drive the SDK.

### E13 — Console policy source diff (owner, ~10 minutes, answers E6's source half)

**Hypothesis.** A Console workspace policy appears in `opencode debug config` as
a source the doctor can name, because the workspace compiles into a config
document (E-R22-07).

**Method.** With the owner's **Personal** workspace (E-R22-05), connected via
`/connect`:

1. `opencode debug config --standalone | jq -c '.[] | {type, path}'` — the before.
2. In the Console, add one harmless policy: `provider.use` deny on a provider
   this checkout never uses, or `mcp.use` deny on an MCP server not configured.
3. Wait about a minute (E-R22-06), then repeat the read — the after.
4. `opencode api get /api/integration --standalone` to record which workspace is
   connected.

Print only `type`, `path` and the policy count; no credentials, no provider
settings.

**Pass.** A new source appears, or an existing source's `policies` changes, and
the doctor can name it. Then add the doctor clause and the docs sentence, and
move D127's remote half from "unobservable" to "observable when connected".

**Fail.** No source changes. Record "the compile is not visible in
`debug config` on 2.4.1" and keep D127; the workspace-config sentence still
belongs in the docs because the vendor states it.

**Decision.** Docs plus, on pass, one doctor clause. No deny-by-effect probe in
this experiment.

### E14 — Console denial names the workspace (owner, optional, spends one turn)

**Hypothesis.** A `tool.use` deny delivered by Console fails with a message that
names the workspace (`Blocked by <workspace>'s policy`), which local statements
do not do (E-R22-07).

**Method.** With the Console policy from E13 still connected, add
`tool.use` deny on `read:*`, run one scripted turn that reads a file, and record
the error text. Remove the policy and disconnect afterwards.

**Pass.** The message names the workspace. Then the docs can say the effect is
attributable, and the no-probe rule is narrowed: still not a diagnostic, but no
longer indistinguishable from a typo.

**Fail.** The message is generic, or the turn is blocked by something else.
Record it; the no-probe rule stands unchanged.

**Decision.** Optional. It costs a turn, so the owner approves the spend
explicitly; the plan does not spend it by default.

### E15 — macOS suite on `macos-latest` (CI, informational)

**Hypothesis.** The offline suite passes on macOS, and the POSIX close path is
clean.

**Method.** Dispatch the existing matrix; read the macOS job. If E12's script
runs there too, record the contrast.

**Pass.** Suite green; record the macOS suite cell as measured.

**Fail.** Record the failing tests; do not generalise and do not claim the seam.

**Decision.** Documentation only. No macOS support claim without a real host.

### E16 — a real Windows host (owner decision, closes E3's host and E4)

**Hypothesis.** On a real install, `muse serve` starts through the resolver, the
ledger is an inherited ACL, UAC appears on first sandbox init, and `host.close()`
leaves nothing behind.

**Method.** Either a borrowed Windows machine or `dockur/windows` on this Linux
box (KVM, 32 GB disk, 2 GB RAM; E-R22-09). Install Muse Code, `muse login`, then
run round 21's E2/E3/E4 probes as written, plus `icacls` on the ledger.

**Pass.** Each row gets a host result; the platform table is updated with what
was seen.

**Fail.** Any row that fails is recorded as a failure, not as "unmeasured".

**Decision.** The only route to E4 and to the end-to-end close. Deferred unless
the owner wants Windows support to move this round.

## Documentation steps

**S1. `docs/platform-support.md`.** Replace "likely `spawn EINVAL`" with the
contract: Node returns `EINVAL` for a `.cmd` without a shell, and the vendor's
`muse.cmd` shim is what PATH resolves. Add the resolver order and the CI seam
job's scope (mechanism, not support). Add the VM route as the only E4 path, and
the eval-VM removal so nobody plans around it.

**S2. `README.md`.** Windows paragraph: the resolver picks the native
`muse-bin-<version>.exe`; `MUSE_BIN` remains the override; Windows is still
unverified on a real host. Do not say "supported".

**S3. `docs/policy-remote.md`.** Add the Console compile (E-R22-07), the
lifecycle table (fetch, switch, disconnect, outage; E-R22-06), the personal
workspace fact (E-R22-05), the absence of a policy API (E-R22-08), and the
narrowed no-probe rule if E14 runs.

**S4. `docs/watchlist.md`.** Add rows: the Node `.cmd` contract, the vendor
launcher's binary layout, the Console policy lifecycle.

**S5. `docs/decision-coverage.md`.** Update the platform basis cell after the
results; keep the row P and the counts unchanged unless a new row is opened. The
policy row's basis gets the Console compile, not a status change.

**S6. `docs/round-22-*`.** Research, plan and prompt, plus the execution record
once the round runs.

## Sequence

1. **E10 + resolver.** Write `resolveMuseBin`, wire it into host start, unit
   tests. No CI yet.
2. **E11/E12 scripts.** `test/seam/windows-spawn.mjs`,
   `test/seam/windows-kill.mjs`, and a `seam-windows` job in
   `.github/workflows/test.yml`. Local run is impossible; the job needs a branch.
3. **Gate for the push.** Owner approves a short-lived `ci/seam` branch, or the
   round stops after step 1.
4. **E15.** Dispatch the matrix; read the macOS and Windows suite jobs.
5. **E13, then optionally E14.** Owner runs the Console diff; record the source
   answer, and the effect only if the spend is approved.
6. **S1–S5.** Docs corrected from the results, not from the hypotheses.
7. **Verify.** `bun run check:offline`, `git diff --check`, the greps, and the
   recorded test count.
8. **Commit gate.** Three commits: resolver plus tests; CI seam job; docs and
   records. No push beyond the approved `ci/seam` branch, no tag, no publish.

## Verification

```bash
bun run check:offline                      # resolver + unit tests
node --test test/seam/windows-spawn.mjs    # on Windows only; CI
git diff --check
grep -n "EINVAL\|muse-bin\|resolver\|MUSE_BIN" src/host.ts docs/platform-support.md README.md
grep -n "Console\|workspace configuration\|policies/current" docs/policy-remote.md
grep -n "seam-windows\|windows-latest" .github/workflows/test.yml
git status -s
```

Record the actual test count; do not carry 418 forward if the suite changed.

## Product choices

These do not fall out of an experiment. Defaults are recommended; only the first
three need an answer.

**Q21. Is a short-lived branch push approved for the CI seam jobs?**
(A) Yes, a `ci/seam` branch, deleted after — **recommended.** E11 and E12 are the
only cheap Windows evidence, and the branch is public for hours, not permanent.
(B) No. Then the resolver ships unit-tested but unobserved, and E2 stays
"confirmed by spec, not by run".
(C) Push to `main`. Rejected: a public action with no reason to be permanent.

**Q22. Ship the resolver before any host has run it?**
(A) Yes, with unit tests and the CI seam job — **recommended.** The defect is
contractual (E-R22-01) and the target is vendor-confirmed (E-R22-03); the risk of
shipping is a wrong path, which the fallback message makes debuggable.
(B) Wait for a real host. Safer, but leaves a broken default in place for weeks.
(C) Ship behind an env flag. Adds a switch nobody asked for; `MUSE_BIN` already
exists.

**Q23. Does the Console effect probe (E14) get one paid turn?**
(A) Yes, after E13 — **recommended.** It is the only way to know whether a
Console denial is attributable, and it settles whether the no-probe rule can be
narrowed.
(B) No; stop at the `debug config` answer. Cheaper, leaves the effect question
open.
(C) Do it first, before E13. Wastes a turn if the source already answers it.

**Q24. How should the README describe Windows after the resolver ships?**
(A) "The resolver picks the native binary; Windows is unverified on a real host"
— **recommended.** True, actionable, no parity claim.
(B) "Windows is supported." Rejected: no host has run it.
(C) "Windows requires `MUSE_BIN`." Understates the resolver and puts work on the
user.

**Q25. Is a real Windows host worth it this round?**
(A) Not now; revisit when a Windows user reports a failure or E4 becomes
material — **recommended.** The VM costs half a day and a Muse login inside it.
(B) Yes, `dockur/windows` now. Closes E3's host and E4; highest confidence.
(C) Buy a Windows machine. Overkill for two rows.

**Q26. If the Windows suite job is red, what happens?**
(A) Record the failures, scope the job to report-only, fix fixtures in a later
round — **recommended.** Keeps this round's claim about the seam clean.
(B) Fix every fixture now. Unbounded, and unrelated to the seam.
(C) Drop the suite job. Loses the signal that macOS/Linux already give.

## Steelmen and strawmen

**Resolver.** Steelman for the version-file rule: the launcher writes
`.muse-version` on every update and names the binary after it, so reading the
pointer is the vendor's own answer to "which binary is current", and it is
testable without a host. Steelman against: the layout can change without notice,
and a resolver that guesses is worse than a clear error — which is why the
fallback names `MUSE_BIN`. Strawman one: "just set `shell: true`" — Node
documents it (E-R22-01), but it is the quoting class the CVE fix closed, and the
vendor ships an exe. Strawman two: "glob and pick any exe" — an interrupted
update leaves two binaries, and the newest is not always the active one.

**CI seam.** Steelman for: real Windows kernel, real `cmd.exe`, real Node, zero
hardware, and the exact three claims that matter. Steelman against: a stub is not
Muse, so it proves the spawn contract and nothing about the handshake. Strawman
one: "CI proves Windows support" — it does not; no `muse serve` runs. Strawman
two: "a stub can drive the SDK close" — that needs a fake MSP server, which is a
second product (D138).

**Kill semantics.** Steelman for the test: `child.kill()` on a `.cmd` is exactly
the mechanism the SDK relies on (E-R21-07), and a grandchild surviving it is the
orphan in miniature. Steelman against: Windows runners use job objects, so the
runner may reap what a desktop would not, making a green result meaningless.
Strawman: "a surviving grandchild means the plugin leaks" — the plugin does not
own the tree; the SDK does.

**Console.** Steelman for observability: the workspace compiles into a config
document (E-R22-07), the docs give a precedence rank, and denials name the
workspace. Steelman against: #60252 shows the remote decoder filters silently, so
a compiled statement may never reach a printed source. Strawman one: "remote
policies do not apply" — they do. Strawman two: "the doctor can already read
them" — only if E13 shows a source.

**VM.** Steelman for: the only route to UAC, ACLs and a real close, on hardware
already present. Steelman against: a clean VM is not a user's machine — no
corporate policy, no vendor tooling, no real PATH — and it needs a Muse login
inside it. Strawman: "a VM result is a support claim" — it is one host, and the
table should say so.

**macOS.** Steelman for the runner: real macOS filesystem semantics, real POSIX
close path, free. Steelman against: no Muse, no login, so the seam is untested.
Strawman: "the macOS suite passing means macOS works" — it means the fixtures
pass.

## Conditions for confidence

| Decision | Confident when | Flip when |
|---|---|---|
| D133 EINVAL is contractual | E11 observes it, or Node's release note is accepted as the contract | A Windows host spawns `muse` successfully |
| D134 resolver order | E10 covers every rule and E11 observes `version-file` | The vendor renames the binary or drops `.muse-version` |
| D135 actionable failure | A test asserts the message names `MUSE_BIN` and the searched directory | The message cannot be produced without leaking a path in default output |
| D136 seam job | The job runs on `windows-latest` and fails when a rule is broken | The runner's PATH behaviour makes the stub layout unrepresentative |
| D137 informational matrix | The first dispatch is recorded with its failures triaged | Windows fixtures are green, so the job can gate |
| D138 kill semantics | The runner shows a surviving grandchild, or a host does | Runner job objects mask it and a host shows a clean tree |
| D139 E4 documented | A real install produces the UAC prompt and the ACL read | A host shows no UAC, or the ledger is `0600` |
| D140 E5 split | The macOS suite is recorded and the seam is called unmeasured | A Mac with a login runs the seam |
| D141 no new dependency | The resolver imports only `node:` builtins | A layout requires path globbing the stdlib cannot express |

## Minimal decision layer

The default plan runs to the push gate without further choices. Three decisions
need the owner:

1. **Q21:** approve the short-lived `ci/seam` branch (A, recommended), or stop
   after the resolver and unit tests (B).
2. **Q23:** approve one paid turn for the Console effect probe (A), or stop at
   the `debug config` answer (B).
3. **Q25:** skip the real Windows host this round (A, recommended), or run the
   VM now (B).

Q22, Q24 and Q26 have defaults and need no separate answer.

## Gates

- No push beyond the approved `ci/seam` branch. No tag, no publish, no
  `opencode.im` submission (Q17 stays held). No `muse acp`. No new dependency.
- `docs/integration-landscape.md` is the owner's edit: never stage it.
- Commits only after the owner says go.
- E14 spends a turn: it does not run without Q23's explicit approval.
- A red Windows suite is a finding, not a failure of the round; do not expand
  scope to fixtures.
- Every claim carries an E-id or a source. Do not say "Windows supported",
  "parity", or "the stub proves Muse".

## Execution record (2026-11-23)

Q21 = A (branch push), Q23 = B (no paid turn), Q25 = A (no VM). E13 and E14
were not reached for a different reason than Q23: no Console workspace is
connected here, so there is nothing to deny or to read.

| Experiment | Result |
|---|---|
| E10 resolver unit tests | **Pass.** 21 tests in `test/muse-bin.test.ts`; `bun run check:offline` is 439 tests in 38 files, 0 fail (was 418/37) |
| E11 Windows seam | **Pass, 6/6.** Bare `muse` → `ENOENT`, explicit `muse.cmd` → `EINVAL`, resolver `version-file`, resolved binary exits 0 and prints the hostname. Run 45270085792 |
| E12 kill semantics | **Orphan.** `E12 cmd-shim: child=896 pings=1 survivors=1`; the native contrast read `inconclusive` |
| E13 Console source | **Blocked.** `/api/integration` → `{"data":[]}`; no workspace connected |
| E14 denial message | **Not run.** Same blocker, and Q23 was B |
| E15 macOS suite | **Blocked.** The job sat queued for 15 minutes with zero steps and was cancelled; no macOS runner was assigned |
| E16 real Windows host | **Deferred** by Q25 |

The matrix's Windows job failed on path and home-directory fixtures — `the
plugins row`, `the policies row`, `hook gate` — which is the D137 finding, not a
seam result. No fixture work was done.

D133 is confirmed for the explicit `.cmd` and corrected for the bare name: the
plugin's default call was never going to fail `EINVAL`, it was going to fail
`ENOENT`. D134's version-file rule is observed, D135's message is unit-tested,
D138's mechanism is observed on the runner.

### Files changed

- `src/host.ts` — `resolveMuseBin`, `pathEntriesFrom`, `museBinFailure`,
  `resolveMuseBinFromProcess`; no new dependency, `node:` builtins only.
- `src/plugin.ts` — one resolution at setup, feeding both the host config and the
  adapter; a Windows fallback throws D135's message instead of spawning.
- `test/muse-bin.test.ts`, `package.json` — the new test in `test:offline`.
- `test/seam/windows-spawn.mjs`, `test/seam/windows-kill.mjs`,
  `.github/workflows/test.yml` — the seam job, and the offline job marked
  informational in a comment.
- `docs/platform-support.md`, `README.md`, `docs/policy-remote.md`,
  `docs/watchlist.md`, `docs/decision-coverage.md`, `docs/round-22-research.md`
  — results, not hypotheses.

### Checks run

`bun test test/muse-bin.test.ts` (21 pass), `bun run check:offline` (439 pass, 0
fail), `node --check` on both seam scripts, YAML parse of the workflow,
`git diff --check`.

### The branch

Q21's `ci/seam` branch was pushed to run E11/E12, because `workflow_dispatch`
needs the workflow on the default branch and this file is not there yet. It
carries the two code commits plus a branch-only `push:` trigger; it is to be
deleted after the results are read, and the `push:` trigger does not go to
`main`.

### Commit sequence (awaiting the owner's go)

1. `Resolve the Windows Muse binary before spawning` — resolver, host wiring,
   unit tests, `package.json`.
2. `Add the Windows seam jobs` — `test/seam/*`, the `seam-windows` job.
3. `Record the Windows contract and the Console compile` — the five docs plus
   the round-22 records.

Never stage `docs/integration-landscape.md`.
