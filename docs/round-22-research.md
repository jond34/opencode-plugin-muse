# Round 22 research: the Windows contract, the stub host, and the Console compile

Written 2026-11-23. HEAD `aefec5b`. Round 21 closed with E1 passing on opencode
2.4.1 and E2–E6 blocked: no Windows host, no macOS host, no Console policy
change. This round asks what of that is actually blocked, and finds that two of
the three gates are cheaper than round 21 assumed.

Two findings carry the round.

**The Windows spawn failure is a contract, not a hypothesis.** Node's fix for
CVE-2024-27980 made `child_process.spawn` and `spawnSync` return `EINVAL` when a
`.bat` or `.cmd` file is passed without `shell` — a documented breaking change,
not an accident of one machine (E-R22-01). The vendor's Windows launcher is
public, and it installs a native `muse-bin-<version>.exe` beside itself and
executes that, while `muse.cmd` is the shim on PATH (E-R22-03). So the default
`muse` spawn is broken by specification, and the fix has a known filename.

**The Console half is a personal-workspace task, not an enterprise one.** Console
creates a **Personal** workspace on signup with the user as owner and only
member, and a workspace holds policies (E-R22-06). The vendor documents that a
workspace compiles its policies into ordinary `policies` statements in the
workspace configuration, merged just below managed preferences and the system
file, and that denials from them name the workspace (E-R22-07). That gives E6
two possible observations — a `debug config` source, or a refusal that names the
workspace — instead of the silence round 21 recorded.

What remains genuinely blocked is narrower than round 21 thought: a real Muse
install on Windows (E4's UAC and ACLs, and the SDK's close against the real
host), a Mac, and a real install on macOS.

## Evidence register

| E-id | Claim | Source | Confidence | What it changes |
|---|---|---|---|---|
| E-R22-01 | Node errors `EINVAL` when `child_process.spawn`/`spawnSync` is given a `.bat` or `.cmd` without the `shell` option. This is the fix for CVE-2024-27980, a breaking change in 18.20.2, 20.12.2 and 21.7.3; passing `shell: true` is the documented way to avoid the error when the input is sanitised. | <https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2>; <https://github.com/nodejs/node/issues/52681> | High | The Windows default spawn is broken by contract whenever PATH resolves `muse` to `muse.cmd`. D124 stops being a risk assessment. |
| E-R22-02 | Third-party reports show the same failure in agent tooling that spawns a vendor CLI on Windows, including a 2026 report against a Node 22 host and a 2024 report naming `.cmd` and `.ps1`. | openclaw/acpx#191; nodejs/node#52681; microsoft/playwright#38369 | Medium-high (reproductions, not contracts) | Consistent with E-R22-01; useful as field evidence, not as the basis. |
| E-R22-03 | The vendor's Windows launcher is public at <https://api.meta.ai/muse-launcher.ps1> (28,194 bytes). It resolves its own directory (`$dir = Split-Path -Parent $self`), names the binary `muse-bin-<version>.exe` in that directory, keeps the active version in `.muse-version`, and runs it with `& $binary @args`. Its own comment names `muse.cmd` as the shim users invoke. | Fetched 2026-11-23; lines 54, 532–537, 566, 706, 761 | High | The resolver has an exact target and a vendor-maintained pointer, so it does not need a glob-first design. |
| E-R22-04 | The release channel publishes `muse-x86-windows.exe` and `muse-aarch64-windows.exe` (plus `universal_macos_pkg`), and the installed Linux layout matches the same naming: `~/.local/bin/muse` is a bash launcher with `muse-bin-1.4.25-R9361.1` beside it. | `api.meta.ai/muse-code/channels/muse-stable`; the lookaside manifest; local install | High | Windows gets a native binary per architecture; the `muse-bin-*` convention is the vendor's, not an inference. |
| E-R22-05 | Console creates a **Personal** workspace at signup with the user as owner and only member; a workspace holds members, credits, budgets, providers, policies and service accounts; Owner and Admin roles can manage policies. | <https://opencode.ai/docs/console/workspaces.md> | High | E6 needs no organisation and no second person. It is a ten-minute owner task. |
| E-R22-06 | `/connect` binds opencode to a workspace. Policies follow the connected account: a Console change applies on the next fetch (about a minute), switching workspaces replaces the statements, disconnecting clears them, and an unreachable Console leaves the last statements in effect. | <https://opencode.ai/docs/policies.md#console>; workspaces doc | High | The before/after window is about a minute, and a disconnect is a clean rollback for the experiment. |
| E-R22-07 | A Console workspace "compiles its Providers and Tools policies into regular `policies` statements in the workspace configuration", merged like a config file ranking right below managed preferences and the system file; denials from those statements name the workspace (`Blocked by Acme's policy`). | <https://opencode.ai/docs/policies.md#console> | High | Two attribution paths exist: a config source, and an effect that names the workspace. Round 21 recorded only "no source attribution". |
| E-R22-08 | No policy query surface on 2.4.1: `/api/policies`, `/api/policies/current`, `/api/experimental/policies` and `/api/config/policies` all return 404, although `/api/policies/current` exists as a string in the binary. `/api/integration` does exist and returns `{"data":[]}` with no Console connected. | Local probe 2026-11-23 | High for the 404s; the binary string is a lead, not a surface | The doctor cannot read policies by API on this version; `debug config` stays the surface. |
| E-R22-09 | `dockur/windows` runs Windows 11 in a Docker container on a Linux host with KVM (`/dev/kvm`), 32 GB of disk and 2 GB of RAM, with a web console on 8006 and RDP on 3389; the project was active on 2026-11-21. | <https://github.com/dockur/windows> | High for the project; untested here | A real Windows host is reachable without new hardware, for E3's real host and E4's install. |
| E-R22-10 | Microsoft removed the Windows 11 evaluation virtual-machine downloads in October 2024; the page now points elsewhere. | r/homelab thread and an archived copy of the download page | Medium (forum evidence) | Do not plan around the old eval VM. A plain ISO or Windows Server evaluation is the fallback. |
| E-R22-11 | `taskkill`'s own exit codes are not documented; the searchable material covers the killed process's exit code (`taskkill /F` sets 1), not the tool's. | bugs.python.org#31863 and the absence of a Microsoft table | Medium | An exit-code table cannot be sourced, which supports the round-21 rule: verify the process table, not the code. |
| E-R22-12 | The offline suite leans POSIX: 3 of 43 test files touch `chmod`/`0600`, 8 reference `/tmp` or `/home`, 7 mention `win32` or `platform`, and `test:offline` runs 37 files. | Local grep 2026-11-23 | High | A first Windows dispatch may fail on fixtures. That is a finding, not a seam result, and should not gate the round. |

## What this changes about round 21

`docs/platform-support.md` says Windows is "likely `spawn EINVAL` until the
native `muse-bin-*.exe` beside `muse.cmd` is resolved". With E-R22-01 and
E-R22-03 that becomes: `EINVAL` is what Node guarantees for a `.cmd` without a
shell, and the vendor's launcher puts the exe exactly there. The row should say
"broken unless the native binary is resolved or `MUSE_BIN` is set", and the
README should stop implying that a Windows user might get lucky.

The resolver design also gets sharper than "glob `muse-bin-*.exe`". The launcher
writes the active version to `.muse-version` and the binary is
`muse-bin-<version>.exe`. Reading that pointer first is deterministic and avoids
picking a stale binary left by an interrupted update; the glob is the fallback,
not the primary.

`docs/policy-remote.md` says the Console half is unobservable with no source
attribution. E-R22-07 says the workspace compiles into the workspace
configuration, which is a config document, so `opencode debug config` may name
it — and a `tool.use` denial names the workspace in its message, which is
distinguishable from a typo in a way local statements are not. Round 21's "no
probe" rule was written for a silence that may not be total.

## What is still blocked, and why

- **A real Muse install on Windows.** UAC, the persistent accounts in #138, the
  ledger's inherited ACL, and the SDK's close against the real host all need
  `muse serve` to start on Windows with a signed-in subscription. A stub host
  cannot produce any of them. The VM route (E-R22-09) is the cheapest way to
  get one, and it is an owner decision because it installs Muse and logs in.
- **A Mac.** The matrix gives the suite and filesystem behaviour on macOS; the
  seam needs `muse serve` with a login, which a hosted runner cannot have.
- **A Console policy change.** Only the owner can add one, but E-R22-05 makes it
  a personal-workspace task rather than an enterprise one.
- **A branch push.** The CI jobs cannot run from local `HEAD`; the workflow is
  `workflow_dispatch` only and the branch is not remote.

## Search method and limits

Searches used TinyFish, Exa, Keenable and You.com through the MCP proxy, plus
direct fetches of primary pages: the Node security release, the vendor's channel
manifest and Windows launcher, the opencode Console and policies docs, the
issue #60252 body, and the dockur repository. Parallel and Linkup were not used
this round; round 21 recorded both returning credit or funding errors.

The vendor launcher was read as source, not run. Its line numbers are from the
2026-11-23 fetch and can move with a new release. Nothing here was measured on
Windows, macOS, or a Console workspace; those are the experiments, not the
evidence.

## Observed in round 22

The seam job ran on `windows-latest` (run 45270085792, branch `ci/seam`,
2026-11-23). It corrects one number in this register and confirms the rest:

| Claim | Observed | Register |
|---|---|---|
| Bare `muse` on a PATH entry holding only `muse.cmd` | `ENOENT` — libuv's PATH search appends `.exe` only | E-R22-01 said `EINVAL`; the `.cmd` needs the explicit name for that |
| Explicit `muse.cmd` to `spawn` without `shell` | `EINVAL` | E-R22-01, confirmed |
| `.muse-version` → `muse-bin-<version>.exe` | resolver returns `version-file` and that path | E-R22-03, confirmed |
| The resolved binary spawns | exit 0, printed the runner's hostname | — |
| `child.kill()` on a `.cmd`'s grandchild | the `ping` survived; the native contrast was inconclusive | E-R21-07's mechanism, now measured |

The offline matrix was dispatched in the same run: Ubuntu passed, Windows failed
on path and home-directory fixtures (`the plugins row`, `the policies row`,
`hook gate`), and macOS was cancelled after fifteen minutes in the queue with no
runner assigned and zero steps. So E15's hypothesis is untested rather than
falsified, and the macOS cell stays unmeasured.

E13 and E14 were not run: `/api/integration` returns an empty list on this
machine, so no Console workspace is connected and there is nothing to deny.
