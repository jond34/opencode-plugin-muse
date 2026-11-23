# Platform support: what is tested, inferred, and unmeasured

Linux is the tested surface. macOS and Windows are configured in the offline
matrix, and the matrix has been dispatched once (2026-11-23, branch `ci/seam`):
Ubuntu passed, Windows failed on path and home-directory fixtures, and macOS was
never given a runner — the job sat queued for fifteen minutes with zero steps
and was cancelled. macOS therefore stays unmeasured for a reason that has
nothing to do with this code. The matrix proves the suite's fixtures, not the
seam: its hosts are `.mjs` fixtures under node, so a green run says nothing
about `muse.cmd`, the ledger mode, UAC, or a close that leaves a process behind
(D126). The Windows rows below still need a Windows host.

**The Windows spawn row is a contract, and the resolver meets it.** The vendor's
Windows install puts `muse` on PATH as a `muse.cmd` shim, and Node refuses to
spawn a batch file without a shell — the fix for CVE-2024-27980 (E-R22-01).
Measured on `windows-latest` (E11): the bare name fails `ENOENT`, because
libuv's PATH search appends `.exe` only, and the explicit `muse.cmd` fails
`EINVAL`. The installer also writes a native `muse-bin-<version>.exe` beside the
shim and names the active one in `.muse-version` (E-R22-03), so the plugin reads
that pointer at startup and spawns the native binary; `MUSE_BIN` still wins over
everything. When nothing resolves, the start fails with a message naming
`MUSE_BIN`, the expected `muse-bin-<version>.exe` and the directory it searched,
rather than Node's bare `EINVAL` (D135). The seam job proves that mechanism with
a stub binary; it does not run `muse serve`, and no real Windows host has run
the plugin.

| Surface | Linux | macOS | Windows | Evidence |
|---|---|---|---|---|
| Offline suite (`bun run check:offline`) | Tested: 439 tests, 0 fail | Dispatched 2026-11-23: no runner was assigned; the job was cancelled after 15 minutes in the queue | Dispatched 2026-11-23: fails on path and home-directory fixtures (`the plugins row`, `the policies row`, `hook gate`). Informational by D137, and the suite's hosts are `.mjs` fixtures under node, so a pass would not exercise the CLI seam | Run 45270085792; local run 2026-11-23; D126, D137 |
| Spawn resolution | `muse` on `PATH`, tested | Vendor ships a native binary; unmeasured | Resolved: `MUSE_BIN`, then `muse.exe` on PATH, then `muse-bin-<version>.exe` named by `.muse-version` beside the shim, then the newest `muse-bin-*.exe`. Observed on `windows-latest` with a stub: bare name `ENOENT`, explicit `.cmd` `EINVAL`, resolved binary spawns | E11 (run 45270085792); `src/host.ts`; E-R22-01, E-R22-03 |
| Shutdown / close | Drain, then `SIGTERM`, then `SIGKILL` | Same code path; unmeasured | No graceful rung (Node documents `SIGTERM` as forceful there), and the SDK's Windows path is **child-only**: `ownsProcessGroup` is false on `win32` and it has no `taskkill` route, so a grandchild can survive `host.close()` and hold the pipes | `src/watchdog.ts`; E-R21-07; E-D135 |
| Orphaned process after close | Not observed | Unmeasured | Observed in miniature: a `ping` started by a `.cmd` survived `child.kill()` on `windows-latest` (E12); the native child's tree read inconclusive there. No real host has run `host.close()`. A third-party harness needed `taskkill /PID /T /F`, found the tree gone but `taskkill` exiting 255 because a child had already exited, and threw on it: treat the process table as the test, not the exit code | E12; E-R21-07, E-R21-08; Paseo #6193 (third party) |
| Token ledger mode | `0600` on POSIX | Same code path; unmeasured | Inherited ACL, not `0600`: Node's `chmod` changes only the write bit, and ACLs are not modeled | `src/usage-ledger.ts`; Node `fs` docs; E-D134 |
| Hook trust-record mode | `0600` on POSIX | Same code path; unmeasured | Inherited ACL, not `0600`; same write-bit limit | `src/hooks.ts`; Node `fs` docs; E-D134 |
| UAC on a headless spawn | Not applicable | Not applicable | The vendor documents a UAC prompt when the sandbox initialises; a headless spawn cannot answer it, and it surfaces 900 s later as `host_idle_timeout`, which names the wrong cause. No Windows host here | Vendor Windows list; `scripts/doctor.ts` `platform()`; E-D136 |
| Sandbox setup inventory | Not applicable | Not applicable | Setup creates persistent local users, a group, profiles, a ProgramData root and workspace ACL/sharing changes, and issue #138 reports that none of it is disclosed before the prompt. Open upstream | E-R21-09; `meta-models/muse-code-sdk#138` |

## What a Windows user is consenting to

The UAC prompt is not the whole of it. The vendor documents the prompt, and an
open issue reports what the setup leaves behind: local accounts, a group, user
profiles, a shared ProgramData directory, and workspace sharing changes — with
no inventory shown before consent (E-R21-09). The plugin does not own the
sandbox and cannot enumerate that state, so the honest posture is disclosure
rather than a block: the doctor says the prompt may appear, this file says what
may follow it, and the user decides before installing Muse Code. Blocking the
spawn would make the plugin unusable on a platform the vendor supports without
removing the consent question, which belongs to the CLI.

## What the matrix would and would not show

It shows whether the offline suite passes on each runner with that runner's
Node and filesystem. It does not show any Windows behaviour in the table above:
the suite writes fixture files, not the ledger or the trust record; it does not
run a real `muse serve`; it cannot answer a UAC prompt; and it does not spawn a
`.cmd`. That is why the seam job exists separately: it reproduces the
installer's layout with a stub binary and asserts the spawn contract, which the
suite never touches. Neither job proves the handshake. The doctor's `platform`
row prints the ladder and the permission mode the current machine actually has,
which is the read a user can rely on.

## Condition that changes this record

A macOS runner that is actually assigned, or a real Windows host. The first is
a queue problem, not a code one: the 2026-11-23 dispatch got no macOS runner at
all. The second needs the hardware; a Windows 11 VM under KVM is the cheapest
route, and Microsoft's evaluation VMs were withdrawn in October 2024
(E-R22-09). Until then the honest status is "tested on Linux; Windows resolved
and seam-checked, unverified on a real host; macOS unmeasured", not parity, and
Windows is not claimed as working.
