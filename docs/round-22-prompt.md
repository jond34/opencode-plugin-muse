# Round 22 execution prompt

You are executing round 22 in `~/repos/opencode-plugin-muse`. This prompt is
self-contained; the external state is in:

- `docs/round-22-research.md` — evidence E-R22-01–E-R22-12.
- `docs/round-22-plan.md` — decisions D133–D141, experiments E10–E16, product
  choices Q21–Q26, confidence conditions, and gates.

Read both before touching anything. Do not rely on chat memory. If this prompt
and the plan disagree, the plan wins; if the plan and a primary source disagree,
stop and report.

## What changed since round 21

Round 21 closed with E1 passing on opencode 2.4.1 and E2–E6 blocked. The
research moves two gates:

- Windows spawn failure is a **contract**: Node returns `EINVAL` for a `.cmd`
  passed to `spawn` without `shell` (CVE-2024-27980 fix), and the vendor's
  launcher installs `muse-bin-<version>.exe` beside `muse.cmd`.
- The Console policy half is a **personal-workspace** task: Console creates a
  Personal workspace on signup, and a workspace compiles its policies into the
  workspace configuration, which may be a source `debug config` can name.

Still blocked: a real Muse install on Windows (UAC, ACLs, the real close), a Mac
with a login, and a policy change only the owner can make.

## Hard rules

- No push beyond an approved `ci/seam` branch. No tag, no publish, no
  `opencode.im` submission (Q17 remains held). No `muse acp`. No new project
  dependency. Never write the host's log. Scratch stays in `scratch/`.
- `docs/integration-landscape.md` is the owner's edit: never stage it.
- Commits only after the owner says go. This prompt ends at a report and a
  proposed commit sequence.
- E14 spends a turn and does not run without the owner's explicit approval.
- Do not build a fake MSP host to drive the SDK. If the SDK's close cannot be
  exercised cheaply, record that and stop.
- A red Windows suite job is a finding, not a round failure; do not expand into
  fixture work.
- Use `zsh -lc` for harness CLIs and keys, never `bash -lc`.
- Every new claim carries an E-id or a source. Do not say "Windows supported",
  "parity", or "the stub proves Muse".

## Phase 0 — baseline

```bash
cd ~/repos/opencode-plugin-muse
git status -sb
git log --oneline -3
opencode --version
muse --version
bun --version
```

Expect HEAD `aefec5b` or later. If `src/` is dirty, stop and report. Leave
`docs/integration-landscape.md` alone if modified.

## Phase 1 — E10: the resolver

Implement `resolveMuseBin` in `src/host.ts` as specified in the plan's
"Implementation sketch": injected `platform`, `env`, `pathEntries`, `readFile`,
`readdir`, `statMtime`; returns `{ command, source }`.

Order:

1. `MUSE_BIN` non-empty → `env`.
2. POSIX → `muse`, source `fallback`.
3. `win32`: first `muse.exe` on PATH → `path-exe`.
4. Otherwise the directory of the first `muse.cmd`/`muse.bat`/`muse.ps1`:
   `.muse-version` → `muse-bin-<version>.exe` if it exists → `version-file`.
5. Otherwise the newest `muse-bin-*.exe` in that directory → `newest`.
6. Nothing → `muse`, source `fallback`.

Wire it into the host start so the spawned command is the resolved one. When the
source is `fallback` on `win32`, the failure must name `MUSE_BIN`, the expected
`muse-bin-<version>.exe`, and the searched directory (D135). Log `source` at
debug level only.

Tests: `test/muse-bin.test.ts` covering every rule, including a `.ps1` shim, a
version file naming a missing binary, PATH order, and POSIX ignoring shims.

```bash
bun test test/muse-bin.test.ts
bun run check:offline
```

If a rule cannot be expressed with injected inputs, record which one and ship
only the testable rules.

## Phase 2 — E11/E12: the CI seam jobs

Add `test/seam/windows-spawn.mjs`:

- Create a temp dir; write `muse.cmd` (`@echo off` and `exit /b 0`); copy
  `%SystemRoot%\System32\hostname.exe` to `muse-bin-9.9.9-R1.1.exe`; write
  `.muse-version` with `9.9.9-R1.1`.
- Assert `spawn("muse", ["--version"])` with that dir first on PATH fails
  `EINVAL`.
- Assert the resolver returns the stub exe with source `version-file`.
- Assert spawning that path exits 0.
- Exit non-zero on any failure; print one line per claim.

Add `test/seam/windows-kill.mjs` (timeboxed):

- Spawn a `.cmd` that starts a long-lived grandchild; kill the child; wait; look
  for the grandchild (`Get-CimInstance Win32_Process` via `powershell -NoProfile`,
  or `tasklist`).
- Repeat with the native stub exe spawning the same grandchild.
- Print what survived. If process inspection is flaky on the runner, print
  `inconclusive` and exit 0.

Add a `seam-windows` job to `.github/workflows/test.yml` on `windows-latest`,
Node 24, `npm ci`, then the two scripts. Keep the existing `offline` matrix job
as-is and mark it report-only in the job name or a comment (D137): it is not the
gate. Pin actions by SHA as the file already does.

Do not run the suite on Windows locally; there is no Windows host here.

## Phase 3 — the push gate (Q21)

If the owner approved a `ci/seam` branch: create it, commit the workflow and
scripts there, push that branch only, and dispatch the workflow. Record the run
URL. Delete the branch after the results are read, if the owner asks.

If the owner did not approve: record E11 and E12 as "blocked: no branch push",
keep the scripts and workflow in the tree for a later run, and continue.

## Phase 4 — read the results

For E11: record whether `EINVAL` was observed, which `source` the resolver
returned, and whether the exe spawned. Pass means all three.

For E12: record whether the grandchild survived the `.cmd` kill, whether the
native child's tree was clean, and whether the runner made it inconclusive.

For E15: dispatch the matrix and read the macOS and Windows suite jobs. Record
the macOS suite result and every Windows suite failure as a finding, not a seam
result. Do not fix fixtures.

## Phase 5 — E13, then optionally E14

E13 (owner, ~10 minutes):

```bash
opencode auth list
opencode debug config --standalone | jq -c '.[] | {type, path}'
opencode api get /api/integration --standalone | jq '{count:(.data|length)}'
```

Then the owner adds one harmless Console policy (`provider.use` deny on a
provider this checkout never uses, or `mcp.use` deny on an MCP server not
configured), waits about a minute, and the same two reads run again. Print only
`type`, `path`, the policy count, and the integration count; never credentials
or provider settings.

Pass: a source appears or an existing source's policies change, and the doctor
can name it. Then add the doctor clause and the docs sentence.

Fail: record "the compile is not visible in `debug config` on 2.4.1" and keep
D127.

E14 only with explicit approval: add `tool.use` deny on `read:*` from the
Console, run one scripted turn that reads a file, record the error text, then
remove the policy and disconnect. If the message names the workspace, narrow the
no-probe rule in `docs/policy-remote.md`; if not, leave it.

## Phase 6 — docs

- **S1** `docs/platform-support.md`: the contract (not "likely"), the resolver
  order, what the CI seam job does and does not prove, the VM route for E4, and
  the eval-VM removal.
- **S2** `README.md`: Windows paragraph — resolver picks the native binary,
  `MUSE_BIN` still overrides, unverified on a real host. No "supported".
- **S3** `docs/policy-remote.md`: Console compile, lifecycle table, personal
  workspace, no policy API on 2.4.1, and E13/E14's result.
- **S4** `docs/watchlist.md`: Node `.cmd` contract, vendor launcher layout,
  Console lifecycle.
- **S5** `docs/decision-coverage.md`: platform basis cell after results; keep the
  row P and the counts unchanged.
- **S6** `docs/round-22-*`: append the execution record.

## Phase 7 — verify

```bash
bun run check:offline
git diff --check
grep -n "EINVAL\|muse-bin\|MUSE_BIN" src/host.ts docs/platform-support.md README.md
grep -n "Console\|workspace configuration\|policies/current" docs/policy-remote.md
grep -n "seam-windows\|windows-latest" .github/workflows/test.yml
git status -s
```

Record the actual test count. If only docs changed, say so and do not claim the
suite was rerun.

## Phase 8 — report and commit gate

Report:

- E10: resolver rules implemented and tested, with the test count;
- E11/E12: observed, blocked, or inconclusive, with the runner and exact output;
- E13/E14: source found or not, and the effect message if E14 ran;
- E15: macOS suite result and Windows suite failures;
- files changed, checks run, and what remains unmeasured;
- the proposed commit sequence.

Suggested commits:

1. `Resolve the Windows Muse binary before spawning` — resolver, host wiring,
   unit tests.
2. `Add the Windows seam jobs` — `test/seam/*`, workflow job.
3. `Record the Windows contract and the Console compile` — docs.

Do not commit until the owner says go. Never stage `docs/integration-landscape.md`.

## Decision mapping

| Result | Action |
|---|---|
| E10 pass | Ship the resolver with the round. |
| E10 partial | Ship the testable rules; record the rest as unverified. |
| E11 pass | D133/D134 confirmed on real Windows; README may name the resolver. |
| E11 fail (`muse` spawns) | Stop; the hypothesis is wrong for that layout; do not claim the rule. |
| E12 orphan | D125's wrapper is justified by mechanism; design it, do not ship without a host test. |
| E12 clean or inconclusive | No wrapper this round; record which. |
| E13 source found | Doctor clause + docs; D127's remote half becomes observable when connected. |
| E13 no source | Keep D127; docs still record the compile. |
| E14 names the workspace | Narrow the no-probe rule; docs sentence. |
| E14 generic message | No change; record it. |
| E15 macOS pass | Record the suite cell; no support claim. |
| E15 macOS fail | Record failures; do not generalise. |
| Q21 not approved | E11/E12 recorded blocked; resolver ships unit-tested only. |
| Q23 not approved | E14 skipped; E13 alone answers the source question. |

## Stop conditions

Stop and report, without editing the expectation, if:

- a Windows host spawns `muse` successfully (D133 would be wrong);
- the resolver cannot be wired without touching the SDK's spawn path;
- the seam script needs a real Muse install or a login;
- E13 shows a policy change but `debug config` cannot name any source;
- a check contradicts `docs/round-22-research.md`;
- the owner has not approved the branch push, the paid turn, or a commit.
