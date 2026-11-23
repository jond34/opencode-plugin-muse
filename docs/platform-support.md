# Platform support: what is tested, inferred, and unmeasured

Linux is the tested surface. macOS and Windows are configured in the offline
matrix and unmeasured: the workflow is `workflow_dispatch` only, it has never
been dispatched, and it cannot be dispatched until this tree exists on a remote
branch (`gh workflow run test.yml` is a 404 from local `HEAD`). The matrix would
prove the suite's fixtures, not the seam — the suite's hosts are `.mjs` fixtures
under node, so a green run says nothing about `muse.cmd`, the ledger mode, UAC,
or a close that leaves a process behind (D126). The Windows rows below need a
Windows host.

**The Windows spawn row is a defect risk, not only a gap.** The vendor's Windows
install puts `muse` on PATH as a `muse.cmd` shim (or a PowerShell launcher), and
Node cannot spawn a `.cmd` without a shell. The pinned SDK calls
`child_process.spawn` with no `shell` (E-R21-06, E-R21-07), so the default path
is likely `spawn EINVAL`. No Windows host was available in this round, so that
is recorded as likely, not observed.

| Surface | Linux | macOS | Windows | Evidence |
|---|---|---|---|---|
| Offline suite (`bun run check:offline`) | Tested: 418 tests, 0 fail | Configured in `.github/workflows/test.yml`; never run | Configured; never run. The suite's hosts are `.mjs` fixtures under node, so a pass would not exercise the CLI seam | `test.yml`; local run 2026-11-23; D126 |
| Spawn resolution | `muse` on `PATH`, tested | Vendor ships a native binary; unmeasured | Likely `spawn EINVAL` until the native `muse-bin-*.exe` beside `muse.cmd` is resolved. The shim is a batch file; Node refuses to spawn one without a shell, and the SDK passes none. `MUSE_BIN` is the workaround today | E-R21-06, E-R21-07; `src/host.ts` |
| Shutdown / close | Drain, then `SIGTERM`, then `SIGKILL` | Same code path; unmeasured | No graceful rung (Node documents `SIGTERM` as forceful there), and the SDK's Windows path is **child-only**: `ownsProcessGroup` is false on `win32` and it has no `taskkill` route, so a grandchild can survive `host.close()` and hold the pipes | `src/watchdog.ts`; E-R21-07; E-D135 |
| Orphaned process after close | Not observed | Unmeasured | Possible. A third-party harness needed `taskkill /PID /T /F`, found the tree gone but `taskkill` exiting 255 because a child had already exited, and threw on it. Treat the process table as the test, not the exit code | E-R21-08; Paseo #6193 (third party) |
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

It would show whether the offline suite passes on each runner with that runner's
Node and filesystem. It would not show any Windows behaviour in the table above:
the suite writes fixture files, not the ledger or the trust record; it does not
run a real `muse serve`; it cannot answer a UAC prompt; and it does not spawn a
`.cmd`. The doctor's `platform` row prints the ladder and the permission mode the
current machine actually has, which is the read a user can rely on.

## Condition that changes this record

A macOS or Windows host producing evidence, or a dispatched matrix. Neither is
available from this checkout: the first needs the hardware, the second needs the
branch pushed. Until then the honest status is "tested on Linux; macOS and
Windows unmeasured", not parity, and Windows is not claimed as working.
