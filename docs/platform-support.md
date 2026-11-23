# Platform support: what is tested, inferred, and unmeasured

Linux is the tested surface. macOS and Windows are configured in the offline
matrix and unmeasured: the workflow is `workflow_dispatch` only, it has never
been dispatched, and it cannot be dispatched until this tree exists on a remote
branch (`gh workflow run test.yml` is a 404 from local `HEAD`). The matrix would
prove the suite's fixtures, not the seam; the three Windows unknowns below need a
Windows host.

| Surface | Linux | macOS | Windows | Evidence |
|---|---|---|---|---|
| Offline suite (`bun run check:offline`) | Tested: 418 tests, 0 fail | Configured in `.github/workflows/test.yml`; never run | Configured; never run. The suite's hosts are `.mjs` fixtures under node, so a pass would not exercise the CLI seam | `test.yml`; local run 2026-11-23 |
| Token ledger mode | `0600` on POSIX | Same code path; unmeasured | Inherited ACL, not `0600`: Node's `chmod` changes only the write bit, and ACLs are not modeled | `src/usage-ledger.ts`; Node `fs` docs; E-D134 |
| Hook trust-record mode | `0600` on POSIX | Same code path; unmeasured | Inherited ACL, not `0600`; same write-bit limit | `src/hooks.ts`; Node `fs` docs; E-D134 |
| Shutdown ladder | Drain, then `SIGTERM`, then `SIGKILL` | Same code path; unmeasured | No graceful rung: Node documents `SIGTERM` as unsupported, and `SIGKILL`/`SIGTERM`/`SIGINT`/`SIGQUIT` terminate forcefully, so the ladder collapses to one hard kill | `src/watchdog.ts`; Node `process` and `child_process` docs; E-D135 |
| UAC on a headless spawn | Not applicable | Not applicable | The vendor documents a UAC prompt when the sandbox initialises; a headless spawn cannot answer it, and it surfaces 900 s later as `host_idle_timeout`, which names the wrong cause. No Windows host here | Vendor Windows list; `scripts/doctor.ts` `platform()`; E-D136 |
| Spawn resolution | `muse` on `PATH`, tested | Vendor ships a native binary; unmeasured | Vendor ships a native binary and a PowerShell installer; `muse` must resolve on `PATH`; unmeasured | Vendor platform page; `src/host.ts` |

## What the matrix would and would not show

It would show whether the offline suite passes on each runner with that runner's
Node and filesystem. It would not show the three Windows behaviours above: the
suite writes fixture files, not the ledger or the trust record; it does not run a
real `muse serve`; and it cannot answer a UAC prompt. The doctor's `platform`
row prints the ladder the current machine actually has, which is the read a user
can rely on.

## Condition that changes this record

A macOS or Windows host producing evidence, or a dispatched matrix. Neither is
available from this checkout: the first needs the hardware, the second needs the
branch pushed. Until then the honest status is "tested on Linux; macOS and
Windows unmeasured", not parity.
