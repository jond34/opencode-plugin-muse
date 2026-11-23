# Decision plan: run the experiments, then hand back sentences

**Written** 2026-11-22 by the session that produced `decision-coverage.md` and
`decision-evidence.md`. That session's context is gone; this file is the state.
Read this file first, then `decision-evidence.md` (what is already recorded), then
the row in `decision-coverage.md` (the dimension itself).

The owner's brief: defer product direction where possible, and narrow the rest by
experiment, so what comes back is a few sentences to accept or reject instead of a
list of open questions. **All experiments here are approved.** None runs
`muse acp`, and none spends allowance.

## State at handoff

- HEAD `09c4a54`. Untracked: the five decision docs (`decision-coverage.md`,
  `decision-evidence.md`, `decision-plan.md`, `implementation-plan.md`,
  `integration-landscape.md`), the new `test/fixtures/fake-msp-host.mjs`,
  `test/host-process.test.ts`, `.github/workflows/test.yml`, and a modified
  `src/host.ts`, `test/host-death.test.ts`, `package.json`, `README.md`.
  Nothing committed, nothing pushed, no remote touched.
- `bun run check:offline`: **304 pass / 0 fail / 759 expect / 30 files**, tsc clean.
- All seven experiments are answered: E-D1, E-D6 (before this run), E-D2, E-D3,
  E-D4, E-D5, E-D7 (this run). E-D8 is configured but unmeasured. Every result is
  in `decision-evidence.md` § "Results already in hand" — do not re-derive any.
- What is left is S8 and the owner: six sentences to accept or reject. Two of the
  ten open dimensions would be code only after that (U5's watchdog, U12's
  warning); the rest are sentences, one CI dispatch (U16), and one email (U14).

## Steps

Work top to bottom. Each step ends by writing its result into
`decision-evidence.md`, so a later session resumes at the first unchecked box.

- [x] **S0** Reference numbering in the gaps table — done 2026-11-22. The table's
      `#` column was a second, unrelated 1–16; `Ref` now carries the canonical
      `U#`.
- [x] **S1** E-D4: reap the child on transport EOF (code + two tests) — done
      2026-11-22. `announceExit` calls `this.child.close()` on the `transportEof`
      arm; two cases in `test/host-death.test.ts`. Result in evidence § E-D4.
- [x] **S2** E-D3: does a custom CA reach the host (test) — done 2026-11-22. It
      does: the child inherits the environment. Result in evidence § E-D3.
- [x] **S3** E-D2: what a frozen host does to a turn (test) — done 2026-11-22.
      Nothing settles, interrupt included; only ending the process recovers. The
      U5 row's "cancel recovers it" was wrong. Result in evidence § E-D2.
- [x] **S4** E-D5: is `MUSE_STRICT_HOST=1` usable against the installed host — done
      2026-11-22. No: the CLI (1.4.25) has already drifted from the 1.4.24 pin, so
      the strict gate refuses the host this repo tests against.
- [x] **S5** E-D7: record the existing reseed numbers for U7 — done 2026-11-22, docs
      only, no run.
- [x] **S6** E-D8: platform matrix — done 2026-11-22 (`.github/workflows/test.yml`).
      No result until it is dispatched; U16 stays open.
- [x] **S7** Close the doc rows and propose the sentences — done 2026-11-22. Nine
      rows closed in `decision-coverage.md`, six sentences now stand in
      `decision-evidence.md` § Owner calls.
- [ ] **S8** Owner gate: report, commit only on approval, never push
- [x] **S9** Round 3 of `implementation-plan.md` § 8 executed 2026-11-22 (W0–W6:
      hook gate, three-clock watchdog, resume-after-kill, allowance warning,
      doctor, doc close-out). E-D9, E-D10 and E-D12 are recorded in
      `decision-evidence.md`; the phase table is § 8.9. W7 (report, then commit
      only on approval) is the remaining step.

---

## S1 — E-D4: reap the child on transport EOF

The only real bug in the twenty rows. A host whose stdout closed while the
process lives is announced (`host.ts:352`) and then abandoned: `announceExit`
latches and notifies sinks, but nothing calls `close()`, so the process outlives
opencode. (`MuseHost` already keeps the child: `private readonly child:
MuseServeChild`, `host.ts:194`.)

**Change** — `src/host.ts`, inside `announceExit`, after `this.resolveGone(reason)`:

```ts
// A transport EOF can leave the process running with no reader left to hear
// it. The SDK owns that process, so hand it the shutdown it will never get;
// the `exited` arm needs nothing, because the child is already gone.
if (reason === "transportEof") void this.child.close().catch(() => undefined);
```

Deliberately not `kill()`: `close()` already does stdin EOF, the drain window,
then SIGTERM→SIGKILL on the process group (`spawn.js:304-371`), and it is
idempotent with the intentional-shutdown path (which sets `closed` first, so
`announceExit` returns early and never reaches this line).

**Tests.**
1. `test/host-death.test.ts`: teach `bareHost` to accept a `child` override
   (it currently sets `child: {}`), then two cases — a transport EOF calls
   `child.close()` exactly once, and a real `exited` calls it zero times.
2. `test/host-process.test.ts` (new file, see "The fixture host"): spawn the
   fixture in `eof-alive` mode through `spawnMspConnection`, assert
   `spawned.connection.closed` settles while `process.kill(pid, 0)` still
   succeeds, then assert `spawned.close()` ends it (`ESRCH`).

**Record.** `decision-evidence.md` under Results: "E-D4 — the SDK's `closed`
resolves on stdout EOF with the process alive; `close()` ends it; `announceExit`
now calls it." Then U6 in `decision-coverage.md` moves from **U** to **H** with
the test names in the basis.

**Verify.** `bun run check:offline` — **304 pass / 0 fail / 30 files**, tsc clean.
`test/host-process.test.ts` is in the `test:offline` list. (The fixture runs under
`node`, not `process.execPath`: under bun, a child that ends its own stdout does
not end the parent's async iteration over that pipe, so `closed` never settles.)

---

## S2 — E-D3: does a custom CA reach the host?

`MuseHost.spawn` passes `env` only when the caller sets it (`host.ts:225`), and
the SDK's `buildSpawnOptions` likewise omits it (`spawn.js:414-418`), so Node's
inheritance should apply — the value in the parent's `process.env` reaches the
child with no plumbing. Test it rather than assume it.

**Method.** Fixture in `answer` mode, spawned with `env` **omitted**, after
setting `process.env.NODE_EXTRA_CA_CERTS = "/tmp/fixture-ca-<rand>.pem"` inside
the test (restore in `finally`). The fixture echoes that variable back as
`serverInfo.userAgent` (see the fixture spec), so the assertion is one
`toEqual` on `spawned.initializeResult.userAgent`.

**Record.** If it inherits, U2 closes as **D** ("honour the env var; no code"):
`decision-coverage.md` basis gets the test name, `README` gains one line in
`## Environment` — `NODE_EXTRA_CA_CERTS` is honoured because the host inherits
the environment. If it does not inherit, U2 stays open and the fix is an explicit
pass-through in `host.ts`, which needs its own experiment.

**Cost.** F.

---

## S3 — E-D2: what a frozen host does to a turn

Two facts decide P2/U5: (a) a request to a host that is alive and stopped never
settles; (b) nothing else in the seam notices, so only ending the process frees
the caller. If both hold, a plugin-side watchdog is the only mitigation, and it
cannot distinguish frozen from slow.

**Method.** Fixture in `freeze` mode: answer `initialize`, then
`process.kill(process.pid, "SIGSTOP")` the moment the next line arrives. Then:

1. Send one command (`connection.command("session/list", {})`, params `{}`).
   Assert it is still pending after 1 s (`Promise.race` with a timer) and that
   `spawned.connection.closed` has not settled.
2. Try `connection.command("turn/interrupt", …)` on the same frozen host and
   assert it also stays pending: interrupt rides the same stdin, so a frozen host
   cannot be cancelled either. This is the fact that makes the current wording in
   `decision-coverage.md` ("only the UI's cancel recovers it") wrong if it holds.
3. `spawned.close()` with `shutdownTimeoutMs: 0` (SIGTERM at once, then the fixed
   2 s grace) and assert it settles and the pid is gone.

Keep the test under ~5 s: bun's default per-test timeout.

**Record.** The result decides U5's wording, not its code: with (1) and (2) both
true, the honest closure is "no watchdog — a frozen host is indistinguishable
from a slow one; recovery is ending the process", and `decision-coverage.md`'s
live-turn-timeout row is corrected from "only the UI's cancel recovers it" to
what the test showed. If (2) turns out to settle, cancel *is* a recovery and the
row closes as documented behaviour.

**Cost.** F.

---

## S4 — E-D5: is `MUSE_STRICT_HOST=1` usable as shipped?

P4 asks only whether the strict gate should be the default. The mechanism exists
(`host-facts.ts:84-103`) and `README` already documents the variable, so the
experiment is about the installed host, not the code.

**Method.** A throwaway script in `scratch/` (never committed, needs credentials):
`museBin: "muse"`, `env: {...process.env, MUSE_STRICT_HOST: "1"}`, `MuseHost.spawn`,
log `initializeResult.schema.fingerprint` and `fingerprintWarning`, then
`host.close()`. Run with `zsh -lc 'bun run scratch/strict-gate.ts'` (keys load
from `~/.zshenv`; `bash -lc` gets none). One handshake, no turn, no allowance.

**Decides.** Whether "strict by default" is a coherent choice for the host users
actually have, or a flag that would refuse the very host this repo tests
against. Record the fingerprint and the refusal outcome; do not record an email
or an account id.

**Cost.** H (one handshake).

---

## S5 — E-D7: the reseed numbers are already taken

U7 (mid-turn compaction) needs no run: `evidence/measurements.md:159-195` already
prices a reseed at 2.7× and 1.9× the fresh turn, and the cached-read share is
analysed there (2,929 of 3,365 input tokens). **Docs only:** move those figures
into the U7 row and into `decision-evidence.md` as E-D7's result, and write the
one decision it supports — accept the reseed and document it, because the
alternative (buffering the window across the boundary) is a feature with no
measurement behind it. Do not spend allowance re-measuring.

**Cost.** F.

---

## S6 — E-D8: platform matrix

`.github/workflows/publish.yml` is `workflow_dispatch` only, and every job is
`ubuntu-latest`; platform support is therefore unstated *and* unmeasured. Add a
second job to that workflow (or a new `test.yml`) with a matrix of
`ubuntu-latest`, `macos-latest`, `windows-latest`, steps: checkout pinned by SHA,
`oven-sh/setup-bun` pinned by SHA, `npm ci`, `npm run check:offline`. Do not put
`scripts/repro.sh` in the matrix (bash-only, and it is a reproduce script, not a
test).

**Limitation to state plainly:** the config change is free, but no result exists
until the workflow is dispatched, which needs the owner's GitHub action. Until
then U16 stays **U** with "matrix configured, never run" as the basis. Do not
claim platform support from a local Linux pass.

**Cost.** F (CI minutes on dispatch).

---

## S7 — Close the doc rows, propose the sentences

After S1–S6, apply these. Each is one edit; none needs a decision from anyone.

| Row | Where | What to write |
|---|---|---|
| U1 | README `## Limits of the seam` | One host per user, spawned over its own stdio; there is no shared or remote host and no socket to one |
| U3 | same bullet list | One signed-in identity per host; switching accounts means `muse logout` first |
| U4 | same bullet list | Offline operation needs a live host; there is no local inference path |
| U8 | same bullet list | Images only: the wire's attachment vocabulary is `"image"` in v1, so PDFs and text files have no surface to travel on |
| U9 | README (native history section) | The transcript is opencode's and portable; the native Muse session is a cache |
| U10 | README (native history section) | The usage ledger is `usage-*.jsonl` under `$XDG_STATE_HOME/opencode-muse`, mode 0600, counts only — no prompt or tool text |
| U11 | `decision-coverage.md` basis | Cached tokens are measured and split (`events.ts:145-174`); state the range from `evidence/measurements.md:159-195` instead of "unknown" |
| U13 | `decision-coverage.md` basis | Nothing leaves the process: the only network write in `src/` is the loopback bridge URL (`bridge.ts:198`); the ledger is the whole telemetry story |
| U12 | `decision-coverage.md` basis | `usage/read` answers over the existing connection with no model call, and `usage/changed` pushes updates — so a warning is one command; only the threshold is undecided |

Then the **sentences**, written as proposals in `decision-evidence.md`
§ Owner calls, each with its cost, for the owner to accept or reject. Six, not
five: E-D2 added the watchdog one, and E-D5 removed the strict-default question
by answering it with a measurement.

1. **P3 fence.** "Approvals are opencode's. Muse runs with every call allowed
   because its only caller is this plugin, and every bridged call already crossed
   opencode's permission engine." Cost: one README sentence.
2. **P1 denial.** "If Muse refuses the client (403 `client_attestation_denied`),
   the turn fails with Muse's own message and is not retried; re-login or update
   the CLI." Optional extra: map that kind to `auth` in `toFailureClass`, so the
   failure reads as an auth problem instead of a protocol one. Cost: one sentence,
   or one `case` plus a test.
3. **U12 warning.** "Warn once at session start when the weekly allowance is
   ≥ 90 % used." Cost: one `usage/read` call and a log line — only if accepted.
4. **U13 telemetry.** "None. Counts stay in the local ledger." Cost: zero, since
   it is already true.
5. **U14/U15.** "Not affiliated with, or endorsed by, the vendor; MIT under this
   repository's `LICENSE`; `CREDITS.md` names the upstream package." Cost: one
   sentence next to the licence.
6. **U5 watchdog.** "A host that stops answering is ended after N minutes and the
   turn fails as a timeout." Cost: a timer per live turn; a slow turn pays with
   its host. Alternative sentence: "a wedged host means restart opencode" — free
   and honest. Added after E-D2 measured that cancel cannot reach a frozen host.

---

## S8 — Owner gate

Report what each experiment found, in one line per row. Then ask before
committing. Standing rules for this repo: **ask before committing, never push,
never tag**, do not weaken or delete an assertion to make a check pass, and run
`bun run check:offline` after any `src/` change.

---

## The fixture host (shared by S1–S3)

One file, `test/fixtures/fake-msp-host.mjs`, ~60 lines, no dependencies, run as
`command: process.execPath, args: [fixturePath]` so it works under bun and node
and on every platform (no shebang, no exec bit).

- Read stdin as lines; `JSON.parse` each; answer `initialize` with
  `{jsonrpc:"2.0", id, result}` where `result` is a minimal `InitializeResult`:
  `schema:{fingerprint:"fixture-fingerprint"}`, `grantedCapabilities:["sessionMcp"]`,
  `museHome: os.tmpdir()`, `platformFamily`/`platformOs` strings, `userAgent` set
  from `process.env.NODE_EXTRA_CA_CERTS ?? "env-absent"` (that is E-D3's probe),
  `serverInfo:{name:"fixture",version:"0"}`, `experimentalApi:true`,
  `sessionDurability:"durable"`. The SDK rejects a result with no
  `schema.fingerprint` (`spawn.js:564-569`), so that field is not optional.
- Ignore every other method (E-D2 needs a host that simply never answers).
- `FAKE_MSP_MODE` selects behaviour: `answer` (stay alive), `eof-alive` (after the
  handshake, `process.stdout.end()` and keep a `setInterval` alive; write
  `process.pid` to `FAKE_MSP_PIDFILE` and, on SIGTERM, write a `.term` marker
  beside it), `freeze` (`process.kill(process.pid, "SIGSTOP")` on the next line
  after `initialize`).
- Always pass `shutdownTimeoutMs: 0` in these tests, or cleanup waits the 30 s
  drain window.

Add `test/host-process.test.ts` to the `test:offline` list in `package.json`;
`bun test` picks it up either way, but the offline list is what `check:offline`
runs.

## What this plan does not do

- No `muse acp` call, no allowance spend, no new dependency, no new env var.
- No turn timeout, no telemetry, no file attachments, no account switching —
  every one of those is conditional on a sentence in S7 being accepted.
- No claim about field frequency: a fixture proves what the adapter does with a
  shape, never how often the shape occurs.
