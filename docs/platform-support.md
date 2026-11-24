# Platform support: what is tested, inferred, and unmeasured

Linux and macOS are the long-tested surfaces, and Windows joined them on
2026-11-24 (run 45302817218): 419 tests declared, 0 failures on `ubuntu-latest`,
`macos-latest` (arm64; the log resolves git at `/opt/homebrew/bin/git`) and
`windows-latest` — Windows ran 416 of them and skipped 3 (2 POSIX-only mode
tests and the transport-EOF arm, named below). That 419 is the *published* frame: a runner checks out the repo
and runs 38 test files, while a local checkout runs 41 and reports 452, because
`.gitignore:25-27` deliberately keeps `test/bench.test.ts`,
`test/bench-stats.test.ts` and `test/native-history-harness.test.ts` out of the
repository (33 tests, local-only records) and the published frame now includes
`test/suite-list.test.ts`, the guard that keeps the list honest (E28). Every count
below says which frame it comes from, because comparing the two silently produced
a phantom gap (D149); the counts are committed in
`docs/evidence/2026-11-24-791840c.json` so they outlive the artifacts. The earlier cancellation was capacity, not
configuration — that job queued fifteen minutes with zero steps — and the retry
was acquired at once. It also found a real bug: three `hook-gate` tests failed
because `os.tmpdir()` on macOS is `/var/folders/...`, a symlink into
`/private/var/folders/...`, and the trust record was written under the unresolved
form while every reader canonicalized it, so an accepted hook would have been
refused forever. `recordHookTrust` now canonicalizes on write (`src/hooks.ts`).

The three Windows skips are: `host config > keeps the directory and file private`
and `platform > POSIX reports the mode the plugin writes` (POSIX mode tests),
plus `host process > a transport EOF leaves the process alive until something
closes it`. E34 ported the other two behaviour tests — the frozen host and the
login link — and both pass on `windows-latest`. The EOF arm stays skipped because
the SDK's transport `closed` promise does not settle after the fixture has
already closed stdout; E42 (run 45315205129) measured `closed` still pending
after 10 s while `close()` settled in 7 ms and killed the pid. E16c measures
close of a live host. Each skip is in the ledger
with its reason, and a new skip without one fails `check:offline`.

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
| Offline suite (`bun run check:offline`) | Tested: 419 published, 0 fail; 452 in a local checkout (41 files, three of them gitignored) | Tested: 419, 0 fail on `macos-15`, arm64 | Tested: 416 ran / 0 fail / 3 skipped of 419. Was 405/1 (`resume after a watchdog kill`, no turn terminal in 15 s) until E30 showed the fixture could not freeze on Windows — `SIGSTOP` is not a Windows signal, so the child exited 100 ms in and the turn was never announced. With a portable freeze the terminal arrives at 260 ms (run 45295871849) and the 4 s budget passes. E34 then ported the frozen-host and login-link tests; only the EOF arm and the two POSIX-mode tests skip. Not informational (D147) — the suite is a support claim on a runner, and the seam job still owns the CLI behaviour | Runs 45302817218 (E34, all three), 45296080862 (previous), 45295871849 (Windows E30), 45289611552 (earlier), JUnit artifacts per OS; `docs/evidence/2026-11-24-ab5358f.json`; local run 2026-11-24; D126, D147 |
| Spawn resolution | `muse` on `PATH`, tested | POSIX path: the launcher script on `PATH`; the suite passes, a real launch is unmeasured | Resolved: `MUSE_BIN`, then `muse.exe` on PATH, then `muse-bin-<version>.exe` named by `.muse-version` beside the shim, then the newest `muse-bin-*.exe`. Observed on `windows-latest` with a stub: bare name `ENOENT`, explicit `.cmd` `EINVAL`, resolved binary spawns | E11 (run 45270085792); `src/host.ts`; E-R22-01, E-R22-03 |
| Shutdown / close | Drain, then `SIGTERM`, then `SIGKILL` | Same code path; the suite passes, no real launch | No graceful rung (Node documents `SIGTERM` as forceful there), and the SDK's Windows path is **child-only**: `ownsProcessGroup` is false on `win32` and it has no `taskkill` route. Measured on a real host (E16c): `muse serve` itself recorded `exit reason recorded: stdin_closed` and the process was gone after `close()` | `src/watchdog.ts`; E16c (run 45281586619); E-R21-07; E-D135 |
| Orphaned process after close | Not observed | Not observed | No survivor of the child the fixture spawned at any sample across three cycles (E38 then spawned a *detached grandchild*: it was seen alive after `close()`, then gone, with no survivor at the end and 0 failed samples; `taskkill` was not needed). A real `muse serve` was alive and visible in each (`1428|muse-bin-1.4.25-R9361.1.exe|1056`, then 5540, then 8844), `close()` returned, and the whole process table was read every 250 ms for 60 s, then 20 s twice, every sample succeeded (E29: a failed read is now a failed assertion), and neither the image-matched list nor the linked-descendant list held anything. The host's own stderr says it ended on stdin EOF. Bounded, not a guarantee: `TerminateProcess` names one pid, libuv's job object carries `SILENT_BREAKAWAY_OK`, and `anomalyco/opencode#62602` documents the same leak class — so the claim is "none observed in the measured case", not "cannot happen". A stub `.cmd` under `child.kill()` did leak a grandchild (E12); the detached E38 sleeper did not survive the hosted runner. E45 (run 45316675044) read `IsProcessInJob` and found the host and the detached grandchild both in a job object, so the runner's reaping is the job object; a desktop without one remains unmeasured | E16c/E27 (run 45289291661), E29 (run 45295160232, `failed=0`); E12; E-R21-07, E-R21-08; Paseo #6193; #62602 |
| Token ledger mode | `0600` on POSIX | Same code path; unmeasured | Inherited ACL, not `0600`: Node's `chmod` changes only the write bit, and ACLs are not modeled | `src/usage-ledger.ts`; Node `fs` docs; E-D134 |
| Hook trust-record mode | `0600` on POSIX | Same code path; unmeasured | Inherited ACL, not `0600`; same write-bit limit | `src/hooks.ts`; Node `fs` docs; E-D134 |
| UAC on a headless spawn | Not applicable | Not applicable | The vendor documents a UAC prompt when the sandbox initialises; a headless spawn cannot answer it, and it surfaces 900 s later as `host_idle_timeout`, which names the wrong cause. No Windows host here | Vendor Windows list; `scripts/doctor.ts` `platform()`; E-D136 |
| Sandbox setup inventory | Not applicable | Not applicable | Setup creates persistent local users, a group, profiles, a ProgramData root and workspace ACL/sharing changes, and issue #138 reports that none of it is disclosed before the prompt. Open upstream | E-R21-09; `meta-models/muse-code-sdk#138` |

## The Windows suite, assertion by assertion (E22)

The first dispatch (run 45270085792, commit `972c74f`, before the hook-trust
canonicalization landed) reported **13** failures (job `138027278561`: 391 pass,
2 skip, 13 fail), not the three a truncated log read had suggested. Reading the job log through `gh api .../jobs/<id>/logs` —
`gh run view --log` drops the rest of a step after any line over 64 KiB and still
exits 0 on gh ≤ 2.102.0 (`cli/cli#15019`, closed 2026-11-18; the installed gh
predates the fix, and the trap needs a line that long to fire) — separated them by
what they measure:

- **Seven POSIX fixtures**: `the policies row` (a home-directory fold the test
  spelled with forward slashes), `host config` ×3 (a `0700` mode Windows ignores,
  a symlink a runner cannot create, and a POSIX literal compared against a win32
  path), `file permissions` (the same mode), `toolset observation` ×2 (POSIX roots
  compared against a win32 `join`).
- **Three `hook gate` refusals** — a real Windows defect *of that commit*: the
  trust record was written under the unresolved path. `1efa66d` fixes it, and the
  rerun passes all twenty `hook gate` tests.
- **Two, from one product bug**: a plugin entry written as an absolute Windows
  path (`C:\...`) was read as a *package name*, so the doctor answered "this
  checkout is not listed" for a config that listed it, and the two-copies case
  compared package against package. Fixed in `scripts/doctor.ts` by excluding
  `isAbsolute` entries from the package test; both `the plugins row` cases pass
  now without a fixture change, which is how the bug was found rather than
  argued.
- **One timing failure**: `resume after a watchdog kill` waits for a turn
  terminal, and a Windows cold start exceeded the budget.

Three dispatches later the count was **1**: the same resume test, now given 15 s,
took 15.07 s and produced no terminal, and was left failing rather than skipped —
it is the only Windows row that is a code path claim rather than a fixture.

E30 named the cause, and it was fixture-side. The fixture froze itself with
`SIGSTOP`, which Windows does not have, so `process.kill` threw and the child
exited 100 ms in: the "frozen host" never existed, the turn was never announced,
and the 15 s budget was measuring a crash, not a slow start. The freeze now blocks
the main thread on a shared buffer there — no stdin read, no timer. Measured on
run 45295871849: terminal at 260 ms, host gone at 2.275 s, resume at 2.32 s. With
the budget back at 4 s, the suite is green. E34 (run 45302817218) narrowed the
Windows count to 416 ran / 0 failed / 3 skipped of 419 (419/0 on Ubuntu and
macOS): the frozen host and the login link now pass there, and the EOF arm plus
the two mode tests skip. So the `host_idle_timeout` path is measured on Windows
rather than assumed. The three skips are listed in the claims table; they are not
a pass.

## Claims, one owner each (D151)

Every number in this file comes from one place. The ledger links here instead of
restating it, which is what stops a count from drifting in three sentences.

| Claim | Evidence | Run or command | Measured at | Frame | Recheck |
|---|---|---|---|---|---|
| Offline suite passes on Linux | 452/0, 41 files | `bun run test:offline`, local run | 2026-11-24 | local checkout | re-run locally; the count moves with the three local-only files and the round-26 instruments |
| Offline suite passes on `ubuntu-latest` | 419/0, 38 files | run 45302817218, artifact `junit-ubuntu-latest`; snapshot `2026-11-24-ab5358f.json` | 2026-11-24 | published checkout | artifact expires 2027-02-21; re-run the workflow |
| Offline suite passes on `macos-15` (arm64) | 419/0 | run 45302817218, artifact `junit-macos-latest`; snapshot `2026-11-24-ab5358f.json` | 2026-11-24 | published checkout | artifact expires 2027-02-21; re-run the workflow |
| Offline suite on `windows-latest` | 416 ran / 0 failed / 3 skipped (419 declared) | run 45302817218, artifact `junit-windows-latest`; snapshot `2026-11-24-ab5358f.json` | 2026-11-24 | published checkout | artifact expires 2027-02-21; EOF transport-`closed` gap recorded (E42); re-run after an SDK connection change |
| Installer layout, resolver, `--version`, `config validate` on Windows | all pass | run 45289291661 (E16a) | 2026-11-23 | hosted runner | a vendor installer release; re-read `.muse-version` |
| `close()` leaves no Muse process on Windows | none alive at any 250 ms sample, 3 cycles, 60+20+20 s | run 45289291661 (E16c/E27) | 2026-11-23 | hosted runner | re-run `ci/real`; sampler hardened in E29 |
| The Console credential names exactly one workspace | `credential` row `cred_14b22fd9b001apW4pAdrUmjbtt`, `metadata.orgID` = `wrk_01KYJ6RT2QFFJ0AXV1J2JFEQR6`; one active row, empty `workspace` table | `bun:sqlite` read of `opencode debug paths db` | 2026-11-23 | this account | re-read after any `opencode auth login` |
| A Console policy is visible in `debug config` but not attributable | `info.policies` gains the statement inside the `document` source; no Console-typed source | `opencode debug config` before/during/after E37 | 2026-11-24 | this account | E37; re-read after a Console build change |
| A Console policy can target hand-picked members | E37 created a Providers/Tools policy for selected members; it compiled into the unpathed `document` source rather than a Console-typed one, and E49's denial surfaced as a generic `Model unavailable` | Console `/policies/new`; `opencode debug config`; E37 and E49 | 2026-11-25 | this account | re-read after a Console build change; the source is still not attributable |

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

## Windows desktop status: unmeasured, not pending

Round 25's Q6 kept the desktop row for one round and said it would retire to
runner-verified-only if that round ended without a machine. Round 28 ended
without one, and round 29 found no owner-supplied desktop JSON (E53). The row is
retired: the runner evidence above stands, and the honest status is "tested on
Linux and macOS; Windows spawn, install, configure, handshake, close and the
offline suite measured on a hosted Server runner; best effort on a desktop" —
not parity, and no Windows desktop claim. No further round is reserved for it.

A hosted Windows runner cannot stand in for a desktop: it cannot answer UAC or
SmartScreen, cannot complete the interactive sign-in, and has no subscription
credential to spend a turn with (`muse auth` stores provider keys, and
`src/host-config.ts` deletes `META_API_KEY` from the child environment, so a key
would test a route the plugin does not ship — round 23, E16b withdrawn). An
owner-supplied signed-in Windows 11 machine, one hour, with the doctor and one
turn, would reopen the row and settle the desktop questions. Until then, the
claim stays best-effort and no desktop support is promised.
