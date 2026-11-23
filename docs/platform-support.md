# Platform support: what is tested, inferred, and unmeasured

Linux is the tested surface, and macOS joined it on 2026-11-23 (run 45282185770,
`macos-15`): 406 tests, 0 failures. The earlier cancellation was capacity, not
configuration — that job queued fifteen minutes with zero steps — and the retry
was acquired at once. It also found a real bug: three `hook-gate` tests failed
because `os.tmpdir()` on macOS is `/var/folders/...`, a symlink into
`/private/var/folders/...`, and the trust record was written under the unresolved
form while every reader canonicalized it, so an accepted hook would have been
refused forever. `recordHookTrust` now canonicalizes on write (`src/hooks.ts`).

The matrix proves the suite, not the seam: its hosts are `.mjs` fixtures under
node, so a green run says nothing about `muse.cmd`, the ledger mode, UAC, or a
close that leaves a process behind (D126). Windows is measured separately, with
the vendor's installer and a real `muse serve` (E16a/E16c, run 45281586619); the
rows below say which Windows surfaces that covers and which it does not.

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
rather than Node's bare `EINVAL` (D135).

Measured with the vendor installer on `windows-latest` (E16a, run 45281586619):
the install ran unauthenticated and exited 0, leaving `.muse-version`
(`1.4.25-R9361.1`), `muse-bin-1.4.25-R9361.1.exe` (413,176,056 bytes), `muse.cmd`
(176 bytes), `.muse-launcher.ps1`, `.muse-channel` and `.muse-release-info.json`
— and no `muse.exe`, so the `path-exe` branch has no vendor-made instance. The
resolver returned `source=version-file` for that binary, `--version` printed
`Muse Code 1.4.25 (1.4.25-R9361.1)` with exit 0, and `config validate --plane
policy` accepted `{"schema_version":1}`. The bare `muse` still failed `ENOENT`
after install. The stub seam job keeps the contract testable without a 413 MB
download; this one proves the resolver against the real thing.

| Surface | Linux | macOS | Windows | Evidence |
|---|---|---|---|---|
| Offline suite (`bun run check:offline`) | Tested: 439 tests, 0 fail | Tested: 406 tests, 0 fail on `macos-15` (the CI subset is smaller than a local run) | Fails on path and home-directory fixtures (`the plugins row`, `the policies row`, `hook gate`). Informational by D137, and the suite's hosts are `.mjs` fixtures under node, so a pass would not exercise the CLI seam | Runs 45282185770 (macOS), 45270085792 (first dispatch); local run 2026-11-23; D126, D137 |
| Spawn resolution | `muse` on `PATH`, tested | POSIX path: the launcher script on `PATH`; the suite passes, a real launch is unmeasured | Resolved: `MUSE_BIN`, then `muse.exe` on PATH, then `muse-bin-<version>.exe` named by `.muse-version` beside the shim, then the newest `muse-bin-*.exe`. Observed on `windows-latest` with a stub: bare name `ENOENT`, explicit `.cmd` `EINVAL`, resolved binary spawns | E11 (run 45270085792); `src/host.ts`; E-R22-01, E-R22-03 |
| Shutdown / close | Drain, then `SIGTERM`, then `SIGKILL` | Same code path; the suite passes, no real launch | No graceful rung (Node documents `SIGTERM` as forceful there), and the SDK's Windows path is **child-only**: `ownsProcessGroup` is false on `win32` and it has no `taskkill` route. Measured on a real host (E16c): `muse serve` itself recorded `exit reason recorded: stdin_closed` and the process was gone after `close()` | `src/watchdog.ts`; E16c (run 45281586619); E-R21-07; E-D135 |
| Orphaned process after close | Not observed | Not observed | No survivor in the measured case: a real `muse serve` was alive and visible (`8728|muse-bin-1.4.25-R9361.1.exe|8744`), `close()` returned, and three seconds later the process table held nothing. The host's own stderr says it ended on stdin EOF, which is host-side evidence rather than the runner reaping it. A stub `.cmd` under `child.kill()` did leak a grandchild (E12), and a third-party harness needed `taskkill /PID /T /F` — treat the process table as the test, not the exit code | E16c (run 45281586619); E12; E-R21-07, E-R21-08; Paseo #6193 |
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

A Windows desktop, or a turn on a hosted Windows runner. The desktop questions —
UAC, SmartScreen, the interactive sign-in — cannot be answered on a runner; one
hour on any signed-in Windows 11 machine, with the doctor and one turn, settles
them. The turn needs a subscription login, not an API key: `muse auth` stores
provider keys and `src/host-config.ts` deletes `META_API_KEY` from the child
environment, so a key would test a route the plugin does not ship (round 23,
E16b withdrawn). Until then the honest status is "tested on Linux and macOS;
Windows spawn, install, configure, handshake and close measured on a hosted
Server runner; best effort on a desktop" — not parity, and no Windows desktop
claim.
