# Decision evidence: what is already answered, and what would answer the rest

**Written** 2026-11-22. Companion to `decision-coverage.md`, which asked "is there
a decision". This asks the second question: "is there evidence behind it, or is
the row a sentence?" A row with a recorded decision needs no development; a row
without one gets the smallest experiment that would let the owner decide.

Cost labels: **F** free (offline fixture or a local read), **H** one `muse serve`
handshake or turn (seconds, no ACP), **Q** spends allowance. No proposal here
runs `muse acp`; that surface is spent (plan §2 E5).

The run order, the resumable step list, and the change each result would trigger
are in `decision-plan.md`. This file is the record; that file is the work.

## Corrections to `decision-coverage.md`

Five rows were wrong or stale when checked against the tree. The rows there are
corrected in place; the reasons are here so the evidence does not get re-derived.

1. **U11 prompt caching is not unknown.** The wire reports it and the ledger
   stores it: `cachedTokens` is split from fresh input at `events.ts:145-174`,
   every fixture carries `cacheReadTokens`, and `evidence/measurements.md:159-195`
   already analyses the cached-read share of reseeds (2,929 of 3,365 input tokens
   on the second of two identical sessions; the later preflight read 0). What is
   missing is a sentence, not a measurement.
2. **U6 "every failed spawn leaks a process" overstates.** The SDK's spawned
   transport `close()` sends SIGTERM then SIGKILL to the process group
   (`dist/src/connection/spawn.js:304-371`). A rejected spawn leaves no child to
   reap, and a crashed child is already gone. The real hole is narrower: the
   transport-EOF arm announces the death (`host.ts:352`) but nothing calls
   `close()`, so a host whose stdout closed while the process lives stays alive
   until opencode exits.
3. **P4 "still no semver gate" understates.** A gate exists and fails closed
   when asked: `MUSE_STRICT_HOST=1` refuses a host that serves no fingerprint,
   any drift tier, or no `sessionMcp` (`host-facts.ts:84-103`). The default is
   advisory. The open question is therefore a default, not a mechanism.
4. **U8 `acceptsFiles: false` is a wire fact, not an oversight.** The attachment
   vocabulary is `"image"` in v1 (`msp.d.ts:1517`), and the adapter forwards
   images only (`language-model.ts:339-342`). PDF or text-file intake has no MSP
   surface to send it on.
5. **P2 and U5 are one question.** "Wedged host" and "no live-turn timeout" are
   the same failure seen from two ends: an alive host that never answers. One
   experiment covers both.

## Already answered: document, do not build

| Row | Decision on record | Evidence in the tree | What closes it |
|---|---|---|---|
| U1 shared/remote host | Per-user stdio is the deployment shape | MSP host is spawned over its own stdio (`host.ts:223`); no socket or discovery path | One paragraph: one host per user, by construction |
| U3 multi-account | One signed-in account | `muse login` / `muse auth set` store a credential; neither lists or switches accounts | One line: one identity per host; switching means `muse logout` first |
| U4 offline / air-gapped | Needs a live host | A12: signed-in CLI is the only lane | One sentence in the requirements |
| U8 files / PDF | No wire surface | Correction 4 | One line in the capability table |
| U9 export off Muse | Transcript is opencode's | README:41,106 — opencode owns history and compaction; the native session is a cache | One line saying the session file is portable today |
| U10 retention / redaction | Session store is opencode's; ledger holds counts | `usage-ledger.ts:240-266` sums tokens, calls, cost — no prompt or tool text | Say where the ledger lives and that it carries no content |
| U11 prompt caching | Measured, not modelled | Correction 1 | Replace "unknown" with the measured range |
| U12 allowance headroom | No warning today; the number exists | E-D6: `muse usage --json` reports live `weekly.usedPercent` / `window.usedPercent`; the wire's `usage/read` returns the same block over the connection the plugin already has, and `usage/changed` pushes changes | Only a threshold and a display surface are left |

## Open rows: the smallest experiment that decides

The table is empty. Every proposed experiment is answered below, and the one that
cannot be answered from this machine (E-D8, the platform matrix) is configured and
waiting on a dispatch.

## Results already in hand

Five are recorded here so nobody re-derives them. E-D2, E-D3, and E-D4 came from
one fixture (`test/fixtures/fake-msp-host.mjs`) and one test file
(`test/host-process.test.ts`), which stay in the tree as the regression surface.

### E-D1 — an attestation denial is already a fail-closed `protocol` failure

`toFailure` (`events.ts:116`) on the shape a denial arrives in:

```
{kind:"client_attestation_denied", message:"Client attestation denied (403)"}
  -> {class:"protocol", code:"client_attestation_denied",
      message:"Client attestation denied (403)", retryable:false}
{kind:"client_attestation_denied"}          // no message
  -> {class:"protocol", code:"client_attestation_denied",
      message:"Turn failed", retryable:false}
```

So the turn already fails closed with the host's own words and the kind preserved
as `code`; nothing degrades to a plain completion, and nothing retries. P1 is not
a behaviour gap. What is left is one label: the contract has an `auth` class
(`contract/entities.ts:109`) that no kind maps to — unknown kinds default to
`protocol` (`events.ts:95-113`). Either label is defensible, and either closes P1:
`protocol` is the status quo (document only, zero code); `auth` is more actionable
for the user (re-login or update the CLI) and costs one `case` in `toFailureClass`.
Neither needs a live denial, which is uninducible on an entitled account.

### E-D6 — `muse usage --json` reports a live percentage, and costs no turn

Run 2026-11-22 against Muse Code 1.4.25 (`zsh -lc 'muse usage --json'`), exit 0,
no model turn. Shape, schema version 1:

```
allowance.asOfMs            number   (equal to now: the read is live, not cached)
allowance.source            string   ("mint")
allowance.tier              string   (the account's plan name)
allowance.weekly.usedPercent      number
allowance.weekly.resetsAtMs       number
allowance.window.usedPercent      number
allowance.window.resetsAtMs       number
hint                        null on this account
reason                      null on this account
schemaVersion               number   (1)
```

U12 was written as "if it reports a remaining figure, a warning is cheap; if only
spend, the row closes as impossible". It reports remaining headroom directly as
`usedPercent` for both the rolling window and the week, with reset times. So the
warning is buildable with no allowance spend and no model turn, and the only
product input left is display policy: nothing, a one-line session-start warning
above a threshold, or a figure surfaced only in an existing command. Mid-turn is
the wrong place to look for it — `quota` arrives as a `usage_limit` *failure*
(`events.ts:131`), which is the wall itself, not a warning.

There is a cheaper path than the CLI, and it was in the schema all along:
`usage/read` (`msp.d.ts:4542-4543`) returns `SubscriptionUsage` — `observedAtMs`,
`tier`, `weekly.usedPercent` + `resetsAtMs`, `window.usedPercent` +
`resetsAtMs` + `windowDurationMins` — over the connection the plugin is already
holding, "without a model call", and the host pushes `usage/changed` when the
observation moves. So U12 needs no second process and no extra credential: a
warning is one command, or one notification listener. That is why the row is a
threshold question and nothing else.

### E-D4 — the EOF child is alive, and `close()` is the ladder that ends it

Method: the fixture in `eof-alive` mode — it answers the handshake, ends its own
stdout, and keeps running — spawned through `spawnMspConnection` with
`shutdownTimeoutMs: 0` so the drain window cannot mask the result.

Observed, in this order:

- `connection.closed` settles (the transport saw the EOF) while `spawned.exited`
  stays pending and `kill(pid, 0)` still succeeds. The process outlives the
  transport with nothing left to read it, which is the hole itself.
- `spawned.close()` ends it, and by the SDK's ladder rather than by luck: the
  fixture's SIGTERM marker exists afterwards and the pid is gone (`ESRCH`).
  `close()` is stdin EOF, the drain window, then SIGTERM→SIGKILL, and it is
  idempotent with the intentional-shutdown path.

So `announceExit` now calls `this.child.close()` on the `transportEof` arm only,
and two unit tests in `test/host-death.test.ts` pin the choice: one close on a
transport EOF, zero on a real exit (`exited` means the child is already gone).
U6 is closed.

Side finding, recorded in the test file rather than fixed: with **bun** as the
child's runtime, a child that ends its own stdout does not end the parent's async
iteration over that pipe, so `closed` never settles and the EOF arm never fires.
The fixture therefore runs under `node`. This is a bun stdio artefact, not host
behaviour, and a real `muse` is not a bun program either.

### E-D3 — a custom CA reaches the host with no plumbing

Method: the fixture in `answer` mode, spawned through `spawnMspConnection` with
`env` **omitted** — exactly what `MuseHost.spawn` does, since `host.ts:225`
forwards `env` only when the caller set one and the SDK drops the key entirely
(`spawn.js:414-418`). Before the spawn the test sets
`process.env.NODE_EXTRA_CA_CERTS` to a scratch path; the fixture echoes that
variable back as `userAgent`.

Result: `initializeResult.userAgent` equals the path. The child inherits the
parent's environment, so `NODE_EXTRA_CA_CERTS` reaches Node inside the host for
free. U2 closes as **D** — one line in README `## Environment`, no code.

### E-D2 — a frozen host freezes everything, including cancel

Method: the fixture in `freeze` mode SIGSTOPs itself on the first request after
the handshake, so the process is alive, reading nothing, with the request sitting
in the pipe.

- `session/list` is still pending after 1 s.
- `turn/interrupt` is still pending after 500 ms. Interrupt rides the same stdin,
  so a frozen host cannot be cancelled. `interruptTurn` (`session.ts:911`) awaits
  that command, so the harness's own cancel path inherits the hang instead of
  recovering from it.
- `connection.closed` stays pending: nothing in the seam notices, no event fires.
- `close()` does end it — SIGTERM while stopped, then SIGKILL after the fixed 2 s
  grace — so recovery costs the grace and then the process.

Consequence for U5: the row's "only the UI's cancel recovers it" is **wrong**.
Cancel is a command, and a frozen host cannot read one. The measured choices are
"hang until the user gives up and restarts", or a plugin-side watchdog that ends
the host at a deadline. A watchdog cannot tell frozen from slow, so a legitimately
slow turn pays with its host and a retry. That is a product call, not a
measurement, and it is sentence 6 in S7 — nothing here builds it.

### E-D5 — the strict gate would refuse the host this repo ships against

Method: one handshake with the installed host, no turn, no allowance
(`scratch/strict-gate.ts`, run under `zsh -lc`; the gate is client-side at
`plugin.ts:262`, so only the facts matter).

```
facts    muse 1.4.25 schema=drift(pinned sha256:b7fb9137267a) sha256:6bf518067b06 sessionMcp=granted durability=durable
refusal  the host schema differs from the pin (sha256:6bf518067b06…)
```

So `MUSE_STRICT_HOST=1` refuses the exact host this repository is tested
against, today, because the SDK pin (1.4.24) trails the installed CLI (1.4.25).
P4 is decided by the fact rather than by taste: **strict cannot be the default** —
it would break every user whose CLI is ahead of the pin, which is the normal case
for a plugin that ships at the SDK's pace. It stays the opt-in escape hatch it
already is, and the README line for it gains the reason.

### E-D7 — the reseed is already the cheap side of the trade

No new run. `evidence/measurements.md:159-195` prices the two arms on the same
workload: the tool-loop run (four reps) costs 2.7x fresh / 1.9x total input to
keep the native context, and the five-rep run 2.4x / 1.9x; per-rep total ratios
ranged 1.28-3.63. The reseed's cached-read share was 0.31 against 0.04, and the
cut and size matrices only narrow the gap (1.5x fresh at 1,500-word turns).

Read the direction carefully: those numbers price *keeping* the native context
against reseeding, so they are an upper bound on what "buffer the window across
compaction" could buy, and it is not a token saving. The wire has no option to
turn on either — `SessionForkParams` carries no cache-preservation setting — so
the alternative is a new feature whose best case is parity. U7 closes as
**accept the reseed and document it**, with those numbers as the reason.

### E-D8 — configured, and unmeasured on purpose

`.github/workflows/test.yml` runs `npm ci` and `npm run check:offline` on
`ubuntu-latest`, `macos-latest`, and `windows-latest`, actions pinned by SHA like
the publish job. `workflow_dispatch` only, so **no result exists** until the owner
dispatches it, and U16 stays open with "matrix configured, never run" as its
basis. This is the one row in the plan whose result cannot be produced from here.

### E-D10 — `hook/list` reports the handler kind, and a project hook is visible

Run 2026-11-22 against Muse Code 1.4.25, two handshakes in throwaway temp
workspaces (`scratch/hook-list.ts`, `scratch/hook-list-project.ts`), no turn, no
file written inside the repo.

- An empty workspace returns `{hooks: []}`.
- `hook/list` is **per-session**: its params are `{sessionId}` and it answers
  only after `session/start`. That moves the gate from startup to the point
  where a session exists, which is still before the first turn.
- A `.muse/hooks.json` in the workspace, with workspace trust granted, produces:

```
{enabled: true, event: "sessionStart", handlerKind: "project",
 key: "/tmp/muse-hookfile-qyCyV6/.muse/hooks.json:session_start:def-836c6377c82774a3"}
```

The key is the absolute path, the snake-cased event, and a digest — so a trust
record keyed on the file plus this key is enough to name what was accepted. The
recognized file shape is the Claude-Code one,
`{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"..."}]}]}}`;
two flatter guesses (`{"SessionStart":[...]}` and a list of `{event, command}`)
were accepted by the host and produced no rows, which is the failure mode the
gate must not confuse with "no hooks".

So D6's premise holds and no file-presence fallback is needed: the gate can read
`handlerKind` for real, after `session/start` and before `turn/start`.

### E-D9 — a watchdog kill is followed by a resume, not a reseed

Run 2026-11-22 offline, through the registry against real child processes
(`test/watchdog-resume.test.ts`, fixture modes `freeze-after-start` and
`resume-answer`). One host admits a turn and then SIGSTOPs itself; the first-byte
budget expires; the ladder interrupts, closes, and reaps the pid; the mode file
is switched and the registry reopens the same opencode session.

Observed, all four assertions:

- the second host received `session/resume` (methods log: one `session/start`,
  one `session/resume`);
- the reopened session reports `resumeOutcome: "resumed"`, so the history
  decision is a delta and no reseed is emitted;
- the frozen pid is gone after the shutdown ladder;
- the old session produced exactly one `turn.terminal` and nothing after it.

The kill needed one production change to work: `MuseHost.close()` now resolves
`gone`, so the adapter drops a host it closed. Without that, the next open was
handed a dead host, and the resume path was unreachable after any kill.

### E-D12 — the doctor's output is stable and secret-free

Run 2026-11-22, `bun scripts/doctor.ts --json` twice on this tree, plus
`--offline` in a temp workspace (`test/doctor.test.ts`).

- The two runs are byte-identical once `asOf` is normalised.
- No home path, no `Bearer` value, no key-shaped string appears in the output;
  `museHome`, the ledger path, and the workspace print with the home prefix
  folded to `~`, and the host's `userAgent` (which can carry a CA path) is never
  read.
- The online run reports `muse 1.4.25`, schema drift against the 1.4.24 pin, the
  granted `sessionMcp`, `durable` sessions, `linux/unix`, and no installed hooks
  — the same facts E-D5 recorded, with no identity field.
- `--trust-hooks` writes a record the session gate accepts, and `--forget-hooks`
  revokes it; both are covered by tests, and `--trust-hooks` on a workspace with
  no hooks file exits non-zero with the reason.

## Decisions taken

These were owner calls, not experiments. The owner approved every experiment and
every recommendation in this round, so each is now the sentence that shipped,
with where it lives.

1. **P3, the fence.** Approvals are opencode's; Muse runs with every call allowed
   because its only caller is this plugin, and every bridged call has already
   crossed opencode's permission engine. Shipped in `README.md`, "Limits of the
   seam" → Containment.
2. **P1, a denial.** A denial fails the turn with Muse's own message and stays a
   protocol error: it is not an auth error, and logging in again does not clear
   it. Shipped in `README.md`, the attestation paragraph. `toFailureClass` was
   not changed — relabelling it `auth` would send users to a login that cannot
   help.
3. **U12, the warning.** Warn once per allowance window at 90 %, from
   `usage/read`, no model call, `MUSE_ALLOWANCE_WARN_PERCENT=0` disables.
   Implemented in `src/allowance.ts`, called once per run from `src/plugin.ts`.
4. **U13, telemetry.** None; the ledger is the record and the doctor is the only
   inspector. Shipped in `README.md`, "Native history" → the on-disk paragraph.
5. **U14/U15, identity and terms.** Unofficial, not affiliated with or endorsed
   by Meta or opencode, no credentials held, one file of its own (the ledger),
   MIT under this repository's `LICENSE`. Shipped at the top of `README.md` and
   in the licence section.
6. **U5, the wedged host.** A host that stops answering is ended: 900 s to the
   first frame, 180 s of silence after frames start, a warning at 90 s, then
   interrupt (2 s budget), close, and a resume on the next turn. Implemented in
   `src/watchdog.ts` + `src/session.ts`, documented in `README.md`, "Limits of
   the seam" → Timeouts. The first-byte default is inherited from the literature
   (E-D11 was deliberately not measured); the idle budget is the one the field
   norms agree on.

## What this does not settle

Nothing above proves field behaviour: every fixture experiment proves what this
adapter does with a shape, not how often that shape occurs. Field frequency
needs U13, which is why it is a product call rather than an experiment.
