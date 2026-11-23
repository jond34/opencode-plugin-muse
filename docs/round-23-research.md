# Round 23 research: the three cells that are still unmeasured

Round 22 closed the Windows spawn contract with a stub binary on a hosted runner.
Three cells stayed open, and this round exists to close or bound them: a real
Windows host, macOS, and whether a connected Console workspace shows up in
`opencode debug config`. This file is the evidence; `round-23-plan.md` is the
experiments.

## Where each cell stands

| Cell | Blocker after round 22 | What this round found |
|---|---|---|
| Real Windows host (E16) | No Windows machine; Q25 chose not to build a VM | The vendor installer can run on a hosted runner, and it already downloads the binary, so most of E16 needs no Muse credential |
| macOS (E15) | The job was cancelled after 15 minutes with no runner | It is arm64 capacity, not billing and not this repo's workflow |
| Console source (E13) | No workspace connected; only the owner can connect one | The compile is documented, and a `provider.use` deny costs no turn to observe |

## macOS: the annotation names capacity

The job's raw metadata and annotations, fetched with `gh api` on 2026-11-23:

```
status: completed, conclusion: cancelled, runner_id: 0, runner_name: "", steps: []
failure: The job was not acquired by Runner of type hosted even after multiple attempts
notice:  Due to capacity constraints, jobs targeting macOS arm64 runners may experience longer queue times.   (x3)
```

So the queue was never about this repository. GitHub's broker tried to acquire a
hosted runner repeatedly, failed, and cancelled the job; the notices say why.

That rules out the billing hypothesis I would otherwise have held. GitHub's
pricing reference puts macOS at $0.062/min, and a November 2026 write-up reports
that since 2026-10-28 a private repo's allowance is a dollar amount rather than a
minute count — $12 on Free, $18 on Pro and Team — so $18 is about 290 macOS
minutes. If money had been the cause, the annotation would be the budget message
("The job was not started because…"), not "not acquired".
E21 checks the billing side anyway with a `user`-scoped token, because a
zero balance and a capacity drought look identical from the outside until you
read the second number.

The label table matters for the retry, and it narrows the options:

| Label | OS | Arch | Pool |
|---|---|---|---|
| `macos-latest` (= `macos-26`) | macOS 26 | arm64 | standard, capacity-constrained |
| `macos-15` | macOS 15 | arm64 | standard, same arm64 capacity |
| `macos-26-intel`, `macos-15-intel`, `macos-latest-large` | macOS 26/15 | x64 | **larger runners, paid, not the free pool** |
| `macos-14` | — | — | retired 2026-11-02 |

So the free pool is arm64 only, and every standard label draws on the same
capacity. A retry is a bet on the time of day, not a configuration fix. The Intel
images are a real escape hatch but they are larger runners: they need a plan that
includes them and they bill at a different SKU, which is a product question, not
a workflow edit.

## Windows: the installer, read as source

`install.ps1` (fetched 2026-11-23) does this on Windows:

1. install dir `%LOCALAPPDATA%\Programs\muse` (overridable with `MUSE_INSTALL_DIR`);
2. writes `.muse-launcher.ps1` and a three-line `muse.cmd` shim that runs
   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .muse-launcher.ps1 %*`;
3. adds that directory to the **user** PATH, not the machine PATH;
4. runs the launcher in install mode (`MUSE_LAUNCHER_INSTALL=1`).

The launcher (768 lines, fetched the same day) then does the part the resolver
depends on:

- `.muse-version` holds the version string; `Get-ActiveBinary` returns the binary
  only when **both** that file exists and `muse-bin-<version>.exe` is present,
  otherwise `$null`;
- install mode calls `Update-Binary`, which downloads the channel manifest, then
  the artifact, checks size and SHA-256, calls `Unblock-File`, moves the file into
  place, writes `.muse-version`, `.muse-channel` and `.muse-release-info.json`;
- then it **deletes every other `muse-bin-*.exe`** in the directory;
- the artifact download goes through `Invoke-WithLogin`, which tries anonymously
  and only retries with a token after an auth denial.

Four consequences, three of which change a decision:

1. The resolver's `.muse-version` branch is exactly the vendor's own rule. Keep it.
2. The `muse-bin-*.exe` glob fallback is close to dead code — the launcher prunes
   to one binary — but it costs nothing and covers a half-finished update.
3. **A fresh install already has the binary**, because install mode downloads it.
   The "no native binary, so shell out to `muse.cmd`" fallback therefore has no
   user to serve, which settles that question without an experiment.
4. An unauthenticated install may succeed, because the download is anonymous
   first. That is what makes E16a possible without a Meta credential.

The shim is the other half: `muse.cmd` → `powershell.exe` → `.muse-launcher.ps1`
→ the native binary. Three processes deep, which is why round 22's `EINVAL` is not
a quirk to work around but the right refusal: spawning that chain through
`cmd.exe` would be a quoting surface, and the native binary is one `spawn` away.

## Console: the compile is documented, and one probe costs nothing

`opencode.ai/docs/console` states the model: every account starts with a Personal
workspace where the owner is the only member; `/connect` in OpenCode chooses a
workspace; "Providers and Tools rules from the Policies page apply to every
OpenCode client connected to the workspace… delivered as policy statements that
outrank the member's user and project configuration and take effect within about
a minute"; managed preferences and the system file still outrank the workspace.

`opencode.ai/docs/policies` adds the vocabulary: `action` is one of `provider.use`,
`tool.use`, `integration.connect`, `integration.use`, `mcp.use`, `skill.use`,
`plugin.use`, `websearch.use`; `experimental.policies` still merges into
`policies`.

That is enough to design a probe that spends no model turn: deny a provider this
machine does not use (`provider.use` / `openai` / `deny`), then read
`opencode debug config` and `opencode models`. If the workspace compiles into the
config, either the source list or the catalog changes; if neither does, the
compile is invisible to this plugin and the doc's claim stands unmodified.

The denial-message question (E14) is different: it needs a policy that blocks
something a turn actually does, so it costs one turn and one Console edit.

## Process-tree kill

`taskkill /T` ends a process and its children, `/F` forces it; Microsoft
documents both. Node's Windows close path in the pinned SDK is child-only
(`ownsProcessGroup` false on `win32`), and round 22 measured the consequence: a
`ping` started by a `.cmd` survived `child.kill()` on the runner.

So a reaper is implementable — `spawn('taskkill', ['/PID', String(pid), '/T', '/F'])`
— and it is the plugin's call to make, because the plugin owns the spawn. What
the runner cannot say is whether a **real** `muse serve` leaves a real orphan,
because the stub binary has no children. That is E16c.

## How the field words platform claims

For the wording decision, three peers:

- **Codex**: native Windows sandbox is the default, Windows 11 recommended, a
  fully updated Windows 10 "best effort", WSL optional. The repo's install page
  still says Windows 11, so the docs and the repo disagree in public.
- **Claude Code**: names Windows requirements explicitly rather than claiming
  parity.
- **opencode**: ships native Windows binaries and states which package managers
  are unsupported on Windows.

Nobody claims parity; the norm is a named, tested surface plus a stated best-effort
band. That is the shape a Windows claim here should take if E16a passes.

## Steelman and strawman for the three contested calls

### A reaper for the Windows process tree

**For.** The plugin spawns `muse serve`; if it cannot end it, it leaks a process
that holds a credential, a port and a model session. The user's next start may
collide with it. `taskkill /T /F` is documented, needs no dependency, and is four
lines behind the existing platform switch, which already has a `win32` branch for
the shutdown ladder. A doctor row can say whether the reaper is available.

**Against.** It kills a tree the SDK believes it owns, so a future SDK fix would
double-kill; `taskkill` can fail on permissions and produce a second error path
nobody can test on Linux; and it is a platform branch whose only verification is a
hosted runner with a stub. The cheap alternative is to document the orphan and
let `muse serve`'s own idle timeout collect it — but nobody has measured that
timeout on Windows either.

**Where that leaves it.** E16c decides: if a real `muse serve` leaves a live child
after close, the reaper is justified by a measurement; if it does not, the
documentation is.

### Shelling out to `muse.cmd`

**For.** It is the only path that works if the native binary is absent, and it
needs no knowledge of the vendor's layout.

**Against.** `cmd.exe /c` re-opens exactly the argument-quoting class that
CVE-2024-27980 was about; the shim then runs PowerShell, so arguments cross two
shells; and the vendor's own install already guarantees the binary exists. A
fallback that exists for a state the installer cannot produce is a maintenance
cost with no user.

**Where that leaves it.** The source settles it: no shell fallback. Keep the
explicit error, and make it say "run `muse` once" only if E16a shows the binary
can be missing after install.

### The claim level

**For "supported on Windows".** E11 proves the spawn contract on a real kernel;
E16a would prove install, resolution, config and doctor rows; the plugin's own
code is platform-neutral.

**Against.** No interactive desktop, no UAC prompt, no Defender/SmartScreen, no
real turn, no real close on a desktop. A "supported" badge would outrun the
evidence by exactly the things Windows users hit first.

**Where that leaves it.** "Tested on a hosted Windows Server runner; best effort
on a desktop" — the Codex shape — unless the turn runs too, in which case the
turn is named as tested and the desktop caveats stay.

### The credential: why the turn is not run on a runner

The plan first gated a Windows turn on a repo secret holding `META_API_KEY`. The
source says that is the wrong credential, twice over.

- `muse auth --help` on 1.4.25: "store provider API credentials", `auth set
  --api-key-stdin`. It is provider-key storage, not the subscription login;
  round 21 measured the same thing (E-R21-15) and D114 stands on it.
- The subscription login lives in `auth.json`, which on this machine holds
  `{schema_version, providers}`. `src/host-config.ts:249` links that file into
  the throwaway config dir and, at line 150, **deletes `META_API_KEY` from the
  child environment**. A key is a route the plugin deliberately scrubs.

So a turn on a runner would need the owner's personal login blob, which is
refresh-rotating (a runner could invalidate the desktop session) and is exactly
the "personal credential to an external service" the house rules gate on PII
review. The Windows-specific surface meanwhile — spawn, stdio framing,
`initialize`, the close ladder — is local to the host process and needs no
credential at all; only the outbound model call does, and that code is the SDK's,
identical on both platforms.

**Conclusion.** Withdraw E16b. A turn is not the missing Windows evidence; a real
`muse serve` starting and closing is. That is E16c, and it costs nothing.

## Limits

Nothing in this file was measured on the day it was written: no runner, no
workspace, no Windows host. The installer and launcher were read as source, and
their line numbers will move with a release. Parallel returned 402 (insufficient
credit) and was dropped from the tool set for this round; Exa, Keenable, You and
TinyFish answered.
