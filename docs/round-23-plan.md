# Round 23 plan: close the three unmeasured cells

Round 22 shipped the Windows resolver and measured the spawn contract. What is
left is not code: it is a host, a queue, and a workspace. Each is bounded below
with the exact command, the cost, and the decision it settles. `round-23-research.md`
holds the evidence these steps rest on.

## Gates

| Gate | Status | Meaning |
|---|---|---|
| Experiments | **approved** (owner, this round) | run every step below without asking again |
| Paid model turns | **approved, capped at 2** | only E19 spends one; the Windows turn is withdrawn (below) |
| `main` commits | **not approved** | nothing lands on `main` until the owner says go |
| Tag, publish, opencode.im | **not approved** | unchanged from round 22 |
| `docs/integration-landscape.md` | **never staged** | the owner's edit |
| Console workspace | **owner-only** | one account, one `/connect`, two page edits |
| Repo secret `META_API_KEY` | **not needed** | withdrawn with E16b: the plugin deletes that variable from the child env, so a key tests an unsupported route |
| `user`-scoped `gh` token | **owner-only** | needed by E21 |

## Cost

| Step | Runner minutes | Model turns | Money at list price |
|---|---|---|---|
| E16a + E16c | ~6 Windows | 0 | ~$0.06 |
| E17 | ~4 macOS (if acquired) | 0 | ~$0.25 |
| E18 | 0 | 0 | 0 |
| E19 | 0 | 1 | one turn |

Allowance context: GitHub's pricing reference gives Windows at $0.010/min and
macOS at $0.062/min, and a November 2026 write-up reports the private-repo
allowance is now a dollar amount ($12 Free, $18 Pro/Team) rather than minutes.

## E16a — a real install on a hosted Windows runner, no credential

**Question.** Does the vendor installer produce the layout the resolver expects,
on a machine with nothing but the runner image, and does the resolver then start
the real binary?

**Why it can run without a key.** The launcher downloads the artifact
anonymously first and only retries with a token after an auth denial
(`Invoke-WithLogin`). If the runner's install fails on auth, that itself is the
finding, and it is worth knowing before any user hits it.

**Steps** (new job `real-windows` in `.github/workflows/test.yml`, guarded by a
`workflow_dispatch` input `real: true` so the matrix stays cheap):

1. `powershell -Command "irm https://dev.meta.ai/install.ps1 | iex"`, capture the
   exit code and the last 40 lines.
2. Print `%LOCALAPPDATA%\Programs\muse` and list it. Record: `muse.cmd`,
   `.muse-launcher.ps1`, `.muse-version`, `.muse-channel`, `muse-bin-<v>.exe`.
3. Print `.muse-version` and compare it to the filename it implies.
4. `npm ci && npm run build`, then `node test/seam/windows-real.mjs` (new, ~60
   lines): `resolveMuseBinFromProcess({ platform: 'win32' })` with `MUSE_BIN`
   unset, assert `source` is `version-file` (or `muse-exe` if the vendor ships
   one), assert the path is under the install dir, `spawn` it with `--version`,
   assert exit 0 and that stdout names a Muse version.
5. `spawn` the resolved binary with `config validate --plane policy` and
   `{"schema_version":1}` on stdin: exit 0 proves the native binary runs a real
   subcommand, not just `--version`.
6. `node test/seam/windows-real.mjs --layout` also asserts the negative: a
   `spawn` of the bare `muse` still fails `ENOENT` after install, so the resolver
   is not optional.

**What each outcome decides.**

- Install succeeds, resolver finds the binary, both spawns pass → D141's Windows
  claim moves to "tested on a hosted Windows Server runner".
- Install fails on auth → the doc gains "a first install may need a signed-in
  `muse`", and the resolver's message gains that sentence. E16a is still a
  success, because it answered the question.
- Install succeeds but the layout differs (no `.muse-version`, different name) →
  the resolver is wrong and the round becomes a code round, with the observed
  layout as the new fixture.

**Failure to look for.** `Unblock-File` and Defender on the runner; a PowerShell
5.1-vs-7 difference (the shim pins `powershell.exe`, which is 5.1); a user-PATH
change that does not reach the job's later steps (the installer sets the *user*
PATH, and a runner's later steps inherit the old `PATH` — so the resolver's PATH
scan may legitimately miss it, which is why the install dir is the primary route).

## E16c — does a real `muse serve` leave a real orphan?

**Question.** Round 22 measured a `ping` under a `.cmd` surviving `child.kill()`.
Does a real `muse serve` — with the SDK's Windows close path, which is
child-only — leave a live process after `host.close()`?

**Steps.** Same job, after E16a: `muse serve` over the pinned SDK, `initialize`,
`session/start` with the same params the plugin sends, then `close()`. Then
`tasklist /FI "IMAGENAME eq muse-bin-*.exe" /FO CSV` and the same for
`powershell.exe`. Record survivors, and whether `taskkill /PID <pid> /T /F`
clears them. If `session/start` is refused for lack of a credential, record that
and treat the close as measured anyway — the process tree exists before any turn.

**What it decides.** D142. A survivor justifies the reaper; no survivor makes the
reaper unnecessary and the orphan note in `platform-support.md` becomes the
documentation of a hazard that does not occur.

**Steelman for the reaper, in one line.** The plugin owns the spawn, so it owns
the reap; `taskkill /T /F` is documented, dependency-free and already behind a
`win32` switch. **Strawman.** A tree kill the SDK does not know about, untestable
on Linux, guarding a leak nobody has measured.

## E16b — withdrawn, and the credential question closed

**Was.** One real turn on Windows, gated on a repo secret holding
`META_API_KEY`.

**Why not.** `muse auth` is provider-key storage, not the subscription login
(`muse auth --help` on 1.4.25; round 21, E-R21-15). The subscription credential
is `auth.json`, which the plugin links in rather than reads
(`src/host-config.ts:249`) — and it deletes `META_API_KEY` from the child
environment outright (line 150). So a key would exercise a route the plugin
scrubs, while the actual product premise is that opencode never holds a
credential. Running a turn on a runner would instead need the owner's personal
login blob: refresh-rotating (a runner can invalidate the desktop session) and a
personal credential on an external service, which the house rules put behind a
PII review.

**What replaces it.** E16c, which starts a real `muse serve` through the plugin's
own path and closes it. That covers every Windows-specific step: spawn, stdio
framing, `initialize`, the session grant, the close ladder. The outbound model
call is the SDK's code, identical on both platforms, and Linux already measures
it live.

**If a turn on Windows is ever required**, the honest route is a borrowed
Windows desktop signed in as the owner, not a secret. Record that as the trigger
rather than pretending a key would have covered it.

## E17 — the macOS retry, bounded to two attempts

**Question.** Was the cancellation a one-off capacity drought?

**Steps.** Dispatch the `offline` job with the matrix narrowed to macOS, first
`macos-15`, then `macos-26` if the first is cancelled. After each, fetch the job
JSON and the check-run annotations and quote them. Two attempts, then stop.

**What each outcome decides.**

- Green → macOS is tested, `platform-support.md` gains the cell, and D144 says
  macOS is claimed.
- Red on fixtures → the same finding Windows produced, recorded as such; the
  plugin is not implicated and the doc says which rows fail and why.
- Cancelled with the same "not acquired" annotation twice → macOS is
  **unobtainable on the free pool**, and the doc says exactly that instead of
  "unmeasured". The decision is then claim-level, not code-level: either accept
  "expected to work, unverified" (POSIX, and every macOS-specific branch is the
  POSIX one) or pay for a larger Intel runner / a real Mac.

**Do not** add a `timeout-minutes` to hide the queue: the 15 minutes is GitHub's
own acquisition retry window, not this workflow's, and a shorter one would turn a
capacity finding into a workflow failure.

## E18 — does a Console workspace compile into `debug config`?

**Question.** When a workspace is connected and a policy exists, does the host's
config surface name it?

**Owner step (about 3 minutes).** Sign in to the Console, open the Personal
workspace, Policies page, add `provider.use` / `openai` / `deny`. Run `/connect`
in an OpenCode session and choose the workspace. Wait one minute.

**Scripted read (no turn).**

```bash
opencode debug config --standalone > scratch/config-after.json
opencode models --standalone > scratch/models-after.json
curl -s localhost:4096/api/integration
```

Compare with the round-21 baseline (`scratch/config-before.json`, E-R21-05:
one `document` source, two `directory` sources, no Console source). Record:
whether a source appears, whether `info.policies` gains the statement, whether
`openai` leaves the catalog.

**What each outcome decides.** A named source → the doctor gains a clause that
attributes it, and `policy-remote.md` moves rank 3 from "unobservable" to
"observable when connected". No source and no catalog change → the compile is
invisible to this plugin, the doc's claim stands, and the row stays P with the
reason recorded.

**Why `provider.use`/`openai`.** This machine does not use that provider, so the
probe changes nothing the user depends on and spends no turn.

## E19 — the denial message, one turn

**Question.** Does a Console denial name the workspace, as the docs say
(`Blocked by Acme's policy`), or is it the same `Blocked by configuration policy`
a local statement produces?

**Steps.** Change the workspace policy to `tool.use` / `read:*` / `deny`; wait a
minute; one turn that reads a file; capture the tool result text and the model's
reaction. Revert the policy afterwards and confirm the revert with a second
`debug config` read (no turn).

**What it decides.** Whether `policy-remote.md`'s "indistinguishable from a typo"
sentence survives, and whether a doctor row could ever say "denied by workspace
policy" without probing.

## E20 — the desktop questions (conditional, not planned)

UAC prompts, SmartScreen and the interactive login flow cannot be measured on a
runner. They become worth a machine only if a user-facing claim depends on them.
`dockur/windows` needs KVM, ~32 GB of free disk and 2 GB of RAM; a cloud Windows
VM needs a paid account. **Recommendation: do not build either this round.** If
the owner wants the desktop claim, the cheapest real option is one hour on any
Windows 11 machine, running the doctor and one turn, with the output pasted back.

## E21 — is money involved at all?

**Steps.** `gh auth refresh -h github.com -s user`, then
`gh api users/jond34/settings/billing/actions` and
`gh api users/jond34/settings/billing/shared-storage`. Record included minutes
and spend. One command, owner-scoped.

**What it decides.** Nothing about macOS capacity — the annotation already said
that — but it bounds the *next* capacity drought: if the allowance is nearly
spent, a green retry still costs real money and D145's cadence matters.

## Decisions this round can reach

| ID | Decision | Basis | Confidence |
|---|---|---|---|
| D141 | Windows claim level: "tested on a hosted Windows Server runner; best effort on a desktop" | E11, E16a, E16c | High once E16a runs |
| D142 | Reaper: `taskkill /T /F` on `win32` close, or documentation only | E16c | High either way — the measurement is binary |
| D143 | No shell fallback to `muse.cmd`; keep the explicit error | installer source (install mode downloads the binary) | High — no experiment needed |
| D144 | macOS wording and the two-attempt retry policy | E17 | Medium if capacity persists; the wording is then a product call |
| D145 | Matrix stays dispatch-only, not scheduled | E21 + the cost table | High |
| D146 | Console clause in the doctor and `policy-remote.md` | E18 | High once the read exists |

## Product questions for the owner

Each has a recommended default, so "all recommended" is a valid answer.

**Q26 — withdrawn.** There is no API key to add: the plugin deletes
`META_API_KEY` from the child environment, so a key would test a route it does
not ship. The Windows evidence comes from E16a/E16c instead. What the owner
would have to supply is a *subscription* login on a real desktop, and only if a
turn there ever becomes a claim worth making.

**Q27 — Any Windows desktop work (E20)?**
*Recommended: no.* The desktop-only questions (UAC, SmartScreen, interactive
login) do not change what the plugin does; they change what a user sees. One hour
on a borrowed machine beats a VM, if the claim is ever needed.

**Q28 — Claim wording.**
*Recommended:* "Tested on Linux; the Windows spawn contract and installer layout
are tested on a hosted Windows Server runner; macOS is expected to work and is
unverified." *Alternative if E17 goes green:* promote macOS to tested.
*What would change my mind:* a red macOS run on POSIX fixtures would mean the
suite, not the platform, and the wording should then say which rows fail.

**Q29 — Ship the reaper if E16c finds an orphan?**
*Recommended: yes, four lines behind the existing `win32` switch, with a doctor
line and a test that fakes `taskkill`.* *Against:* the SDK may fix it upstream;
the plugin then double-kills, which is harmless but noisy. *What would change my
mind:* if `muse serve`'s own idle timeout collects the orphan within a minute,
the documentation is enough.

**Q30 — CI cadence.**
*Recommended: dispatch-only, as today*, plus one scheduled run per month if the
allowance has room (E21 answers that). macOS at $0.062/min is the reason not to
schedule the matrix weekly.

**Q31 — Console coverage in the product.**
*Recommended: no new surface.* If E18 shows a source, add one doctor sentence
that names it and stop; a `--probe-policy` stays rejected (round 21, D127).
*Alternative:* a doctor row that says "a Console workspace may apply; this plugin
cannot read it" — honest, but it is a row that always says the same thing.

## Docs to change, per outcome

| Outcome | Files |
|---|---|
| E16a pass | `docs/platform-support.md` (real-host row), `README.md` (claim sentence), `docs/watchlist.md` (installer layout row gains the runner evidence) |
| E16c orphan | `src/host.ts` + `test/` (reaper), `docs/platform-support.md` (orphan row), `README.md` (one clause) |
| E17 green | `docs/platform-support.md` (macOS cell), `README.md`, `docs/watchlist.md` |
| E17 cancelled twice | `docs/platform-support.md` (capacity sentence with the annotation quoted), `docs/watchlist.md` (trigger: a runner is actually assigned) |
| E18 source | `docs/policy-remote.md`, `docs/decision-coverage.md` (row 187 basis), `src/doctor.ts` + test if the clause ships |
| E18 no source | `docs/policy-remote.md` (one sentence: measured, still invisible) |

## The question that sent me back to the source

"We're using the sub — opencode will never see a key. Is it needed?" No, and it
was the wrong secret besides. `muse auth` stores provider API keys; the
subscription lives in `auth.json`; `src/host-config.ts` scrubs `META_API_KEY`
from the child env. E16b is withdrawn and replaced by E16c.

- `bun run check:offline` after any code change; the count moves only with new
  tests, and the docs must cite the measured number.
- `git diff --check`; the three greps round 22 used (resolver order, claim
  wording, test count).
- Every doc sentence that says "tested" must name the run it came from.
- `git status -s` before any commit; `docs/integration-landscape.md` never staged.

## Commit sequence

1. `Test the real Windows install and close path` — workflow job, seam script,
   any reaper.
2. `Record the Windows host, macOS capacity, and the Console compile` — the docs.
3. Nothing else. The round-22 branch still holds two unlanded commits; this round
   stacks on it and neither lands until the owner says go.

## What would let me stop asking

- E16a pass + E16c no orphan → D141, D142, D143 settle themselves; only Q28's
  wording remains.

## Execution record (2026-11-23)

Branch `round-22`, commits pushed to throwaway refs `ci/real` and `ci/mac` and
deleted after use. Nothing on `main`.

**E16a — pass, and the install needs no credential.** Run 45281586619,
`windows-latest`. The vendor script exited 0 with "Installed muse to
~\AppData\Local\Programs\muse\muse.cmd". Layout: `.muse-version` =
`1.4.25-R9361.1`, `muse-bin-1.4.25-R9361.1.exe` (413,176,056 bytes), `muse.cmd`
(176), `.muse-launcher.ps1` (28,194), `.muse-channel`, `.muse-release-info.json`.
No `muse.exe`, so `path-exe` has no vendor-made instance. Resolution:
`source=version-file` → the 413 MB binary. `--version` → `Muse Code 1.4.25
(1.4.25-R9361.1)`, exit 0. `config validate --plane policy --file` → `valid:
plane=policy schema_version=1`, exit 0. Bare `muse` → `ENOENT` even after
install. **D141 stands as written, D143 confirmed.**

**E16c — no orphan, and the first probe was wrong.** The live host was visible
as `8728|muse-bin-1.4.25-R9361.1.exe|8744`; `close()` returned; three seconds
later the table was empty, and the host's own stderr read `muse serve: exit
reason recorded: stdin_closed`. The first attempt used `Get-Process -Name
'muse-bin-*'`, printed an empty list *while the host was alive*, and would have
reported a clean close from no evidence; the script now samples with CIM and
fails the measurement if the live sample is empty. **D142: no reaper.** Keep the
`taskkill` note as documentation of what a future leak would need.

**E17 — green, and it found a bug.** First attempt (45281817519) was acquired on
`macos-15` — so round 22's cancellation was capacity — and failed 403/3: three
`hook-gate` tests where `hooksTrusted` canonicalizes the workspace but the record
was written with `os.tmpdir()`'s `/var/folders/...` while the real path is
`/private/var/folders/...`. Accepted hooks would be refused forever. Fixed in
`src/hooks.ts` (`recordHookTrust` and `forgetHookTrust` canonicalize on write),
reproduced locally with a symlinked `TMPDIR`, and the retry (45282185770) passed
406/0. **D144: macOS is tested**, and the wording can say so.

**E16b — withdrawn before it ran.** `muse auth` stores provider API keys; the
subscription lives in `auth.json`, which the plugin links in and whose sibling
env var it deletes. No secret was created.

**E21 — allowance is nowhere near the limit.** The documented route is gone:
`users/{u}/settings/billing/actions` and `.../shared-storage` both return **410
This endpoint has been moved** (2026-11-23). The live one is
`users/{u}/settings/billing/usage?year=&month=`, which reports per-SKU quantity
and a gross/net split. November 2026 for this repo: 11 Linux minutes ($0.066),
6 Windows ($0.060), 1 macOS ($0.062) — gross $0.188, **net $0.00**. Across all
repos: gross $3.84, net $0.00. Nothing has left the allowance, so a scheduled
monthly matrix (≈$0.20) is affordable; weekly macOS runs would be about $1 a
month. **D145: schedule monthly once the workflow is on the default branch** —
a `schedule:` trigger only fires from the default branch, so this cannot be
added today.

**E18, E19 — still blocked.** Both need a Console workspace and a policy, which
is an owner action; the Console cell stays unmeasured.

Checks actually run: `npm run build`; `bun run check:offline` (439 tests, 38
files, 0 fail); `bun test test/hook-gate.test.ts` under a symlinked `TMPDIR`
(20 pass) — that symlink reproduces the macOS path shape on Linux, and it is how
the fix was confirmed without a Mac; YAML parsed with pyyaml; `node --check` on
the seam script. Not run: the full `ci/seam` matrix (its Windows and macOS cells
are already known and would spend macOS minutes for no new information).
- E18 source appears → D146 settles itself.
- E17 cancelled twice → the only open question is money (Q27/Q28), not code.
