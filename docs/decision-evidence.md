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

## Round 4 — the clock measures the phase

The plan is `implementation-plan.md` § 9. Each experiment was run before its fix,
and the failure is recorded here as well as the pass.

### E-D13 — a bridged call is not silence, and the idle clock said it was

- Command: `bun test test/watchdog.test.ts -t "a call longer than the idle
  window"`, run against `9c1dc6d` before D16 and again after.
- Before: with `MUSE_IDLE_TIMEOUT_MS=60`, one `item/delta`, and a fake host that
  posts a real `tools/call` to the loopback bridge (the tool then parks), the
  turn produced one `turn.terminal` at 250 ms. Pinning the code in the same run
  gave `host_idle_timeout`: the plugin ended a host that was waiting on
  opencode's tool.
- After: the same test passes — 250 ms of silence with a call in flight, no
  terminal, `hostExited === false`, and releasing the tool lets the response
  travel.
- Also pinned: `MUSE_TOOL_CEILING_MS=40` fails the turn with "a bridged tool call
  was still running after 40 ms"; a host that dies during a call fails as
  `event_stream_failed`; and the unit pair shows the clock suspends and resumes
  and that the ceiling is off by default.
- Method: the fake host receives the real bridge URL in `session/start` and posts
  over loopback, so the MCP request and the bridge server are real; only the Muse
  process is simulated. No live host and no model turn, so no spend.
- Branch: not needed — the fixture fallback was unnecessary.

### E-D14 — a retry is the host backing off, not a wedge

- Command: `bun test test/watchdog.test.ts -t "a retry longer than the idle
  window"`.
- Before: `turn/started`, then `turn/modelRetryScheduled` with `retryDelayMs:
  200` under `MUSE_IDLE_TIMEOUT_MS=50`, then a delta at 150 ms. The turn was
  killed at 50 ms and the delta arrived after it had already failed.
- After: the turn survives, the delta is delivered, and `turn/completed` arrives
  with no failure; `hostExited === false`.
- Cap: with `MUSE_RETRY_CAP_MS=80` and a 200 ms retry, the turn still ends at
  about 80 ms with `host_idle_timeout`, so the extension cannot hide a wedge.
- Unit: `noteRetry(100)` under a 20 ms budget survives 60 ms of silence.
- Branch: not needed.

### E-D15 — the host accepts the declaration and serves it

- Command: `zsh -lc 'bun scratch/external-wait.ts'` — a real host, a session, no
  turn and no model call.
- Observed: `declare: {"declared":true,"reason":"bash: npm test"}`, then
  `read.externalWait: {"reason":"bash: npm test"}`, then
  `clear: {"declared":false}`, then `after.externalWait: null`.
- So the view half is proven, not just the command: a client can show what the
  session is waiting on while the call runs.
- Wired: 0→1 declares with the tool label (`bash: npm test`), 1→0 clears, and a
  rejected declare is swallowed — the turn is unaffected (test).
- Note: the declaration is live-only; the clock fix does not depend on it.

### E-D16 — a plugin hook is the user's install, not the repo's

- Evidence: the vendor's plugin-scope page says every install scope writes into
  the user's own store ("Nothing is written into the repository"), install scope
  is not review and never approves a capability, and a project-scoped plugin
  still requires workspace trust and approval. A `plugin` row in the hook
  catalog therefore describes code the person installed, not a file a checkout
  can plant.
- Result: `blockingHooks` returns only `project` rows; a plugin row passes with
  no hooks file present; a project row in the same workspace still refuses. The
  doctor prints `plugin/stop (installed plugin)` so the origin is visible.
- Branch not taken: identity trust (name + version + handler set). No workspace
  path installs a plugin without approval, so there is nothing to record.

### E-D17 — the package can ship the surface

- Built `src/tui.ts`: read the notice, `ui.toast.show`, delete it, poll every 5 s,
  return a cleanup.
- Tests: five in `test/tui-notice.test.ts` — round trip, malformed file is
  silent, one toast per notice, a throwing toast keeps the notice, and `setup`
  shows a pending notice and returns a cleanup.
- Finding that changed the plan's letter: importing `@opencode/plugin/tui` at
  runtime pulls in `solid-js`, a peer of the TUI and not a dependency here. The
  part is therefore a plain object typed by the vendor's `Plugin.Definition`;
  `Plugin.define` is the identity function, so behaviour is identical and no
  dependency was added.
- Not run: a live TUI load. The evidence is the vendor type, the export map, and
  the unit tests; the row says so.
- `exports` gained `./tui`, and `files` already ships `src`.

### E-D18 — what actually gates a bridged call

- `session-registry.ts`'s `callTool` emits a `toolCallId` into opencode and parks
  a promise; opencode executes the tool through its own permission engine. The
  plugin holds no executor, so there is no private pre-check to bypass.
- `test/bridge-denial.test.ts` pins the denied case: a denied permission yields a
  tool error and no execution.
- The vendor's own justification for exposing `allowAll` is the spawn boundary
  ("the client already holds the user's ambient authority"); its default-deny
  guidance is for a client that can author rules, which this one cannot.
- Conclusion: the gate is opencode's. README and the coverage row now say so.

## Round 5

### E-D19 — a live parked call, and `task/background` on it (two turns)

**Question.** On a live host, does a bridged call that outlives the idle window
survive, and does `task/background` accept a bridged call's `itemId`?

**Method.** `scratch/live-long-call.ts`, through the production path
(`MuseHarnessAdapter` → `MuseSession` → watchdog → tool bridge), not a
reimplementation. The turn asked the model to call a bridged `sleep_ms` tool
exactly once; the tool parks in-process. Run under `zsh -lc`:

```
MUSE_IDLE_TIMEOUT_MS=4000  PARK_MS=20000 PROBE_AT_MS=5000  BACKGROUND_AT_MS=6000  bun scratch/live-long-call.ts
MUSE_IDLE_TIMEOUT_MS=15000 PARK_MS=25000 PROBE_AT_MS=20000 BACKGROUND_AT_MS=21000 bun scratch/live-long-call.ts
```

**Run 1 (4 s window, 20 s park).** The call was **not** killed while parked: the
tool started at 3.9 s and returned at 23.9 s with no expiry in between. The turn
failed at 27.9 s — exactly 4 s after the tool returned — while the host was still
in its end-of-turn gate. The adapter surfaced no `tool.started` for the bridged
call (the raw `item/started` frame did carry `kind: "toolCall"`), so no `itemId`
was available and `task/background` was not attempted.

**Run 2 (15 s window, 25 s park).** At 20.9 s the probe read
`parkedFor=17642ms, terminal=false, failure=null` — **17.6 s inside a 15 s window
with the turn still running.** That is the live proof the suspension works, and
it is the measurement D22 wanted. Then:

- `task/background` with the running call's `itemId` was **refused**:
  `task/background command … rejected: invalid_target`. Branch (b) of § 10.3: a
  bridged call is not a backgroundable Muse task. D18 stands as written, and no
  backgrounding path is built (G4 is moot).
- The host's own session record for the run:
  `{"kind":"terminal","terminal":"completed","turn_duration_ms":36652,
  "eot_gate_ms":8138,"time_to_first_token_ms":28481}` — the turn **completed**
  at 36.7 s.
- The plugin still failed it at 43.3 s: `host_idle_timeout`, "Muse sent no frame
  for 15000 ms after starting". The clock had been armed at 28.3 s (the last
  item), the host's end-of-turn gate was silent for 8.1 s, and the completion
  frame at 36.7 s did not reset the clock. So the plugin reported a timeout for
  a turn the host had recorded as completed 6.6 s earlier.

**Corrected in round 7 (E-D32).** That last bullet is an instrument error. The
probe registered `connection.onNotification`, which is a *setter* — assigning it
replaced the host's own router (`src/host.ts:348`) — so the adapter heard no
frames after the bridge settled and its idle clock expired on frames the host
had sent. With additive listeners the same shape of turn settles `completed`
17.4 s in. The suspension measurement above stands; "the plugin failed a
completed turn" does not.

**What this settles.** D16's suspension is real on a live host, not only against
a fixture. `task/background` is closed for bridged calls. And the end-of-turn
gate is a phase the clock does not know about — see U26.

**What it does not settle.** Why the completion frame did not stop the clock:
the probe logged frame *counts*, not frame *times*, so it cannot separate "the
frame arrived late" from "the handler dropped it". At the 180 s default an 8.1 s
gate is harmless, which is why this has not bitten a user. The next probe only
needs timestamps on `turn/completed`, and it can ride on any future paid turn.

**Cost.** Two turns, one more than § 10.3 planned: the 4 s window was too tight
to observe a completed turn at all, so the second run repeated the measurement
at 15 s. Both runs are recorded; neither was retried to make a result look
cleaner.

### E-D21 — does a declaration survive a resume? (free)

**Question.** The docs say a `declareExternalWait` is live-only: "a serve restart,
unload, or resume loses the declaration". Which of those is true?

**Method.** `scratch/external-wait-resume.ts`: start a session, declare, read;
`session/resume` with `excludeItems: true`, read again; then close the host,
spawn a second one, resume the same session id, and read once more.

**Result.** Two different answers, and the docs are right about the one that
matters:

| Step | `session/read` → `externalWait` |
|---|---|
| after declare | `{"reason":"bash: bun test"}` |
| after **warm** resume (same host) | `{"reason":"bash: bun test"}` |
| after **cold** resume (new host) | `null` |

So the declaration is not lost by a resume as such; it is lost when the process
that holds it goes away. D18's wording stands ("a status signal, not durability"),
and the README sentence has to say *which* resume — see W6's edit. A warm resume
that re-attaches to a live host keeps the declaration, which is the opposite of
what the sentence said.

### E-D22 — is `hook/list`'s `key` stable across an edit above it? (free)

**Question.** If the doctor or a trust record keys on `key`, does inserting a
handler above the others renumber the ones below?

**Method.** `scratch/hook-key-stability.ts`: a temp workspace with two handlers
under `PreToolUse`, `hook/list`; insert a third *above* them; read again in the
same session and in a second one.

**Result.** The keys did not shift. Before: `def-e7ba7226d34e8bb3` and
`def-bd8c47548bdeacb6`. After: the same two, plus `def-64c7f408ba372952` for the
inserted handler, identically in a fresh session.

**What it means.** The vendor's key is `path:event:def-<hash>`, and the `def-`
part is derived from the handler rather than its position — so it agrees with
D23's content-hashing choice, and the branch "if keys shift, label by content
hash" does not trigger. It does **not** make the key usable as a trust key on its
own: the catalog never carries the command, so a `def-` hash cannot be checked
against what will run, and its derivation is undocumented. The record keeps its
own hash of the parsed handler; the vendor key stays a display label.

**Incidental.** The file's event keys are the vendor's spellings: `PreToolUse`
loads and is reported as `preToolUse`, while a lowercase `preToolUse` key is
silently ignored — empty catalog, nothing on stderr. Worth knowing when a
workspace's hooks "do nothing".

## Round 6 — the approval layer, measured

The round-5 review claimed the plugin's containment story rested on an unstated
choice: that `allowAll` was pinned with no runtime switch, that no layer survived
a bypass, and that four knobs were absent rather than declined. Three free probes
and three paid turns settle it. Probes are in `scratch/approval-modes.ts` and
`scratch/approval-mode-turn.ts`.

### E-D23 — is the runtime switch real? (free)

One live session, started as the plugin starts it, then all four closed modes
selected on the wire and read back:

```
started: {"lastCommandId":null,"mode":"allowAll","source":"startup"}
denyUnmatched   → {"status":"accepted","applyOutcome":"completed","effectiveMode":{"mode":"denyUnmatched","source":"approvalReconfigure"}}
onRequest       → {"status":"accepted","applyOutcome":"completed","effectiveMode":{"mode":"onRequest","source":"approvalReconfigure"}}
promptUnmatched → {"status":"accepted","applyOutcome":"completed","effectiveMode":{"mode":"promptUnmatched","source":"approvalReconfigure"}}
allowAll        → {"status":"accepted","applyOutcome":"completed","effectiveMode":{"mode":"allowAll","source":"approvalReconfigure"}}
after: {"mode":"allowAll","source":"approvalReconfigure"}
```

No `select, never create` refusal: the host's configuration already defines all
four, so a client may select any of them mid-session. The pin was ours, not a
limit (D31).

### E-D24 — what does `denyUnmatched` do to a bridged call? (three turns)

> **Superseded by E48 (2026-11-25) for the saved-rule half.** The unseeded
> refusal below stands. The last two sentences do not: Muse's `:ask-me` menu
> offered "Always allow this MCP tool" for `mcp__opencode__bash`, wrote a
> `localPersistent` `tool_action` rule, and a second `denyUnmatched` session ran
> the tool with no approval. E48 is fixture-scope, one host and one workspace;
> see `docs/evidence/2026-11-26-r30-e44-addendum.json`.

Same session shape as the plugin uses, mode switched on the wire, one prompt:
*use the `lookup` tool with q=hello, then reply with the result.* The bridge
records whether `callTool` was reached.

```
control (allowAll)   1. bridge tool calls: 1 lookup
                     2. approval requests: 0
                     4. terminal: completed
                     6. assistant text: Looking up “hello” for you. | ok
                     7. event types: …,tool.started,tool.completed,…

denyUnmatched (1st)  1. bridge tool calls: 0 (none)
                     2. approval requests: 0   3. errors: 0   4. terminal: completed

denyUnmatched (2nd)  1. bridge tool calls: 0 (none)
                     6. assistant text: Looking up “hello” for you. | Lookup denied |
                        : `deny_unmatched: no policy rule allows this action`
                     7. event types: …,tool.started,tool.completed,…
```

The first run is kept on purpose. On its own it reads as "the model never tried",
which is why it is not evidence; the control is what makes the second run
interpretable. With the mode denying, the call still reaches `tool.started` and
`tool.completed`, the bridge's `callTool` is never invoked, and the model is told
`deny_unmatched: no policy rule allows this action`. Muse's saved rules are
command-prefix scoped ("save a rule for this command's prefix"), not tool-name
globs, so nothing a user or this plugin can write would match a bridged MCP tool.
`denyUnmatched` and the bridge cannot coexist.

### E-D25, E-D26 — not run

`onRequest` and `promptUnmatched` were the remaining modes. After E-D24 and
E-D28 neither has a path to a working bridge: they would raise an approval for
every bridged call, which is the second gate opencode has already replaced. The
product answer closed the last door as well — an approval is acceptable only
inside opencode's UI, and a Muse approval is a Muse surface. One paid turn of the
four was left unspent rather than spent to confirm a mode we would not ship.

### E-D28 — what does the policy plane accept? (free)

`muse config validate --plane policy --file` over 45 candidate members:

```
{"schema_version":1}                        valid: plane=policy schema_version=1
{"schema_version":1,"settings":{}}          valid: plane=policy schema_version=1
{"schema_version":1,"settings":{"permissions":{}}}  enterprise_document_invalid: plane=policy reason=unknown_member location=settings
… approval_mode, run, tools, security, mcp, sandbox, allowed_approval_policies,
  hooks, managed_hooks_path, agents, telemetry, network, limits … same refusal
{"schema_version":2,"settings":{}}          enterprise_schema_unsupported: reason=unsupported_schema_version
--plane defaults {"settings":{"run":{}}}     valid: plane=defaults schema_version=1
--plane defaults {"settings":{"approval_mode":"never"}}  unknown_member
```

The validator works and the two planes have different vocabularies: `defaults`
accepts `run`, `policy` accepted none of the 45 names tried. `muse config status
--json` reports both planes `absent` on this machine. So an enterprise lock is a
mechanism with no usable member on 1.4.25 — which also means `serve`'s posture
ceiling ("posture up to managed policy") has nothing to read.

### E-D29 — is there a per-turn cap on `serve`? (free)

```
$ muse serve --max-model-steps 5
muse serve: unexpected argument '--max-model-steps' found
  tip: a similar argument exists: '--model'
```

The cap exists on `muse exec` and not on the surface this plugin drives, and the
typings have no step or spend member on `turn/start`. Absent, not declined.

### Decisions taken (round 6)

- **D27** `allowAll` stays, now measured: it is the only mode in which a bridged
  call reaches `callTool`. A denying mode refuses it before the bridge sees it.

  > **Superseded by E48 (2026-11-25) for the saved-rule half.** A saved
  > `tool_action` rule naming the MCP tool lets a later `denyUnmatched` session
  > reach the bridge. The plugin still starts `allowAll`, because it has no
  > surface that presents Muse's approval to the opencode user; the rule removes
  > a Muse refusal, not the missing surface.

- **D28** subagents and workflows stay off, and the reason is corrected: their
  spawner tools are outside the pinned toolset, a child is a billed call whose
  context opencode never sees, and spawning belongs to opencode. A Muse child
  inherits the lead's tools and permission boundary and cannot widen them, so the
  old "path that does not cross opencode" was wrong.
- **D29** the sandbox stays on and is never disabled; it is the layer independent
  of approval, inert here only because the toolset has no shell tool. No doctor
  row for the config planes: local health is the doctor's subject.
- **D30** six rows opened and closed (turn cap, in-process hooks and the planes as
  absent; the judge, the runtime lever and the sandbox as decisions).
- **D31** one mode, no mid-session switching, because there is one tool source.
  Reversing condition recorded: a second tool source.

## Round 7 — the residual ledger

Answers the "Against consensus" note quoted in `round-7-plan.md` §1. Free probes
against Muse 1.4.25 and opencode 2.3.2, one paid turn run twice (once with a
broken instrument, once corrected). Raw logs are in `scratch/cfg/`.

### E-D30 — what a managed plane can actually set (free)

`muse config validate --plane <defaults|policy> --file` over 15 documents, both
planes (`scratch/cfg/e-d30.sh`, output `e-d30.log`). Trimmed to the verdicts:

```
defaults {"model":"x"}                        -> valid: member=settings.model state=active binds=defaults user_overridable=true
defaults {"run":{"toolset":[]}}               -> valid: member=settings.run.toolset state=active binds=defaults user_overridable=true
defaults {"run":{"workflow_trigger_mode":"off"}} -> valid: member=settings.run.workflow_trigger_mode state=active binds=defaults user_overridable=true
defaults {"permissions":{"default_profile":"read-only"}} -> enterprise_document_invalid: plane=defaults reason=unknown_member location=settings
defaults {"run":{"approval_mode":"untrusted"}} -> enterprise_document_invalid: plane=defaults reason=unknown_member location=settings.run
defaults {"hooks":{}}                          -> enterprise_document_invalid: plane=defaults reason=unknown_member location=settings
defaults {"mcp":{}}                            -> enterprise_document_invalid: plane=defaults reason=unknown_member location=settings
defaults {"runtime_capabilities":{}}           -> enterprise_document_invalid: plane=defaults reason=unknown_member location=settings
defaults {"session_retention_days":30}         -> enterprise_document_invalid: plane=defaults reason=unknown_member location=settings
defaults {"allowed_approval_policies":["untrusted"]} -> enterprise_document_invalid: plane=defaults reason=unknown_member location=settings
policy   {"schema_version":1}                 -> valid: plane=policy schema_version=1
policy   {"run":{}}                           -> enterprise_document_invalid: plane=policy reason=unknown_member location=settings
policy   {"model":"x"}                        -> enterprise_document_invalid: plane=policy reason=unknown_member location=settings
policy   {"permissions":{"default_profile":"read-only"}} -> enterprise_document_invalid: plane=policy reason=unknown_member location=settings
```

The plane whose name implies a lock accepts nothing. The plane that binds has
four members and every one is `user_overridable=true`. The plugin's private
`settings.json` is a user settings file (`src/host-config.ts:218-245`), so an
admin's `run.toolset` default loses to the plugin's `mcp__opencode__*` pin: on
1.4.25 an enterprise cannot even narrow the toolset against this plugin.

### E-D31 — the permission-profile catalog (free)

Run 1, on the handshake the plugin actually sends (`scratch/permission-profile.ts`):

```
permissionProfile/list -> error: permissionProfile/list requires experimentalApi capability
start with unknown id  -> command … rejected: no profile definitely-not-a-profile in the host catalog
pin :read-only         -> permissionState: null
pin :unrestricted      -> permissionState: null
no pin                 -> permissionState: null
```

Run 2, with `capabilities.experimentalApi: true`
(`scratch/permission-profile-experimental.ts`):

```
initialize -> granted=["sessionMcp"]
permissionProfile/list -> {"profiles":[
  {"available":true,"profileId":":read-only","label":"Read only","reviewerAuthority":"human"},
  {"available":true,"profileId":":ask-me","label":"Ask me","reviewerAuthority":"human"},
  {"available":true,"profileId":":auto-review","label":"Auto-review","reviewerAuthority":"autoReview"},
  {"available":true,"profileId":":unrestricted","label":"Unrestricted","reviewerAuthority":"none"}]}
pin :read-only     -> {"approval":"onRequest","filesystem":"sandboxed","network":"restricted","reviewer":"human"}
pin :unrestricted  -> {"approval":"allowAll","filesystem":"unrestricted","network":"enabled","reviewer":"none"}
pin :ask-me        -> {"approval":"onRequest","filesystem":"sandboxed","network":"off","reviewer":"human"}
no pin             -> {"approval":"onRequest","filesystem":"sandboxed","network":"off","reviewer":"autoReview"}  (profileId :auto-review)
```

`:read-only` survived a `session/read` after the start, so the pin is recorded,
not just acknowledged. What the plugin cannot do is *see* it: the catalog and
`permissionState` are experimental, and the plugin requests only `sessionMcp`.

### E-D32 — the end-of-turn gate, timestamped (1 paid turn, run twice)

**Run 1** (60 s window, `scratch/eot-gate.ts` as first written): every frame was
seen by the probe, `turn/completed terminal="completed"` arrived at 17.9 s, and
the adapter still failed the turn at 70.9 s with `host_idle_timeout`. The gap was
exactly 60 s after the bridged call settled — the adapter had heard nothing else.

Cause: `Connection.onNotification(handler)` is a setter
(`node_modules/@muse-code/sdk/dist/src/connection/connection.js:299-301`), and the
probe assigned it after `openSession`, replacing the host's router. Round 5's
E-D19 probe did the same thing.

**Run 2** (same turn shape, `addNotificationListener` instead):

```
  2949ms tools/call sleep_ms ms=6000
  8949ms tools/call returning
 11123ms FRAME turn/foregroundCompleted
 17406ms item/completed (last substantive frame)
 17423ms FRAME turn/completed terminal="completed"
 17423ms adapter turn.terminal status=completed failure=null
```

So the frame arrives, the adapter settles the turn, and `onTurnCompleted` stops
the clock as written. The gate is 6.3 s of silence between
`turn/foregroundCompleted` and completion, but an item completes at its edge, so
the idle clock never sees it in this shape. The residual is narrow and real: a
gate longer than the idle window, with no item frame inside it, would still trip
the clock — and `turn/foregroundCompleted` is the host's own non-terminal "still
working" signal, which the plugin did not count.

### E-D33 — which sandbox flags `serve` takes (free)

`muse serve --help` (1.4.25), verbatim:

```
Sandbox posture (fixed for the host's lifetime; only the default where each session may choose its own):
      --disable-sandbox
          Disable shell filesystem/network sandboxing for this host
      --sandbox-network <MODE>
          Sandbox network mode (default: proxy-only)
      --disable-write
          Disable non-shell workspace filesystem writes
      --disable-shell
          Disable workspace shell execution
```

and, from the same help: "Approval mode is the other way round — it is selected
on the wire, so there is no approval flag here." `serveArgs`
(`src/host.ts:72-83`) passes `--preset`, `--contributor-mode`, `--trust-workspace`,
`--disable-write`, `--disable-request-user-input` and nothing else: no
`--disable-sandbox`, no `--sandbox-network`, no `--disable-shell`.

### E-D34 — the matrix, blocked (free)

```
$ gh workflow run test.yml
HTTP 404: workflow test.yml not found on the default branch
  (https://api.github.com/repos/jond34/opencode-plugin-muse/actions/workflows/test.yml)
```

`git ls-tree origin/main -- .github/workflows/` lists `publish.yml` only;
`test.yml` exists on local `HEAD` (`7ce5721`), which is 60 commits ahead of
`origin/main` (`56d4ca0`). A dispatch runs a ref that exists remotely, so the
workflow cannot be exercised without a push, which this round does not do. U16's
*mechanism* question is therefore unanswered rather than answered negatively —
the record must not say "the workflow does not work".

### E-D35 — what the ACP shim actually is (free)

`pi-is314/opencode-acp-client` README, quoted:

```
opencode v2 TUI ──HTTP + SSE──▶ opencode-acp-client ──ACP stdio──▶ any ACP agent
```

Its `docs/ACP-MATRIX.md` says `session/request_permission` is implemented and
powers "the permission dialog: `permission.asked` →
`/api/session/:id/permission/:rid/reply` → `permission.replied`"; `fs/read_text_file`
and `fs/write_text_file` are refused with `-32601` ("use the agent's own tools");
and under capability degradation: "MCP support (`mcpCapabilities.*`) — Everything
else — Nothing to configure: the client is not an MCP host and serves no MCP
server list, so the sidebar's MCP section stays empty." Known gaps: "pty, MCP
auth, provider OAuth, worktree changes, revert/share, most of `/tui/*`".

So the TUI *can* answer the agent's own permission requests — the one place the
note is right that the shim carries something — while opencode's engine, its
rules and its tools are absent. It is not an MCP host, so opencode's tools cannot
be handed to the agent at all. That is "none of the control surface", not "less".

### Decision lines

- **D32** the containment paragraph says one gate (opencode's rules), one
  allowlist (`mcp__opencode__*`), no isolation, and a `deny` rule as the only
  hard stop; a copyable block ships under "A hard stop, if you want one".
- **D33** no profile is pinned; the sentence is qualified, and the README says a
  user's `:unrestricted` default removes Muse's sandbox.
- **D34** `turn/foregroundCompleted` counts as progress — the gate's opening
  re-arms the idle clock instead of being read as a wedge — with a test that
  fails without the line.
- **D35** the ACP route stays closed, re-premised on the shim's architecture and
  its absence as an MCP host; reopening condition is an ACP client inside
  opencode's engine that registers opencode's tools as an MCP server.
- **D36** no client-side turn cap; the wire has no step or spend member and an
  interrupt would fire after the spend it exists to prevent.

### What this round does not settle

- The `opencode_bash` action name in the README's deny block comes from
  opencode's V2 action table (`<server>_<tool>`); it was not exercised against a
  bridged call.
- Windows and macOS remain unmeasured (E-D34 blocked).
- Whether a host ever omits `turn/foregroundCompleted` is unknown; if it does,
  the clock behaves as it did before D34.

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

Round 4's sentences (D16–D21) are in `implementation-plan.md` § 9.2 and in
`README.md`; the short form:

- **D16** the idle clock is suspended while a bridged call is in flight, and the
  tool ceiling is opt-in (`MUSE_TOOL_CEILING_MS`).
- **D17** a retry extends the idle clock by the host's `retryDelayMs` plus 5 s,
  capped at `MUSE_RETRY_CAP_MS` (600 s).
- **D18** the wait is declared and cleared as status; `task/background` is not
  used, because there is no Muse-native task to move.
- **D19** the hook gate covers `project` only; a `plugin` handler is the user's
  install and the doctor prints every origin.
- **D20** the allowance warning ships a `./tui` part that shows the notice and
  removes it; the log line stays.
- **D21** `allowAll` stays, stated as structural (no executor here) rather than
  as a shortcut, with the MCP-on/built-ins-off asymmetry and subagents/workflows
  off said out loud.

## What this does not settle

Nothing above proves field behaviour: every fixture experiment proves what this
adapter does with a shape, not how often that shape occurs. Field frequency
needs U13, which is why it is a product call rather than an experiment.

## Round 8 — the posture you cannot read

Round 8 answers the "Leaning against" note (quoted in `round-8-plan.md` §1).
Everything below was run 2026-11-23 against Muse Code 1.4.25, `@muse-code/sdk`
1.4.24, and opencode 2.3.2. The suite ended at 380 pass / 0 fail / 984 expect /
37 files.

### E-D36 — what the doctor can see locally about opencode's posture

**Question.** Is any part of opencode's posture reachable without a host?

**Method.** `grep -rn "opencode.json\|loadConfig\|configPath\|discoverConfig"
src/*.ts`, plus a read of `scripts/doctor.ts`.

**Result.** Nothing. `src/` contains no read of opencode's config — no
`opencode.json`, no config-path resolution, no rule parser. The doctor's local
rows are versions, platform, containment (four environment variables), the trust
record and the ledger. There is no "configured rules" half to report; the only
posture facts available are the host's own (E-D37).

**Consequence.** D37's option B has no subject matter. C is the row.

### E-D37 — what `experimentalApi` serves, on a doctor-style connection

**Question.** Does the flag buy the catalog and `permissionState`, and what
differs from a stable run?

**Method.** `scratch/e-d37.ts` — two runs of the doctor's own sequence (the
plugin's `serve` args via `serveArgs`, `usage/read`, `session/start`,
`session/read`, `hook/list`, `session/leave`), one with
`capabilities.experimentalApi: true` and one without.

**Result, stable:**

```
initialize.experimentalApi: false
initialize.grantedCapabilities: ["sessionMcp"]
permissionProfile/list → experimentalRequired -32601 "permissionProfile/list requires experimentalApi capability"
start.session: {"permissionState":null,"approvalMode":{"mode":"onRequest","source":"startup"}}
```

**Result, experimental:**

```
initialize.experimentalApi: true
permissionProfile/list → 4 rows, keys available,description,label,profileId,reviewerAuthority
start.session: {"permissionState":{"axes":{"approval":"onRequest","filesystem":"sandboxed","network":"off","reviewer":"autoReview"},"profileId":":auto-review","reviewerAttached":true,"reviewerAuthority":"autoReview"}}
pinned.session: {"permissionState":{"axes":{"approval":"onRequest","filesystem":"sandboxed","network":"restricted","reviewer":"human"},"profileId":":read-only","reviewerAttached":true,"reviewerAuthority":"human"}}
```

`schema.experimentalFingerprint` is identical in both runs
(`sha256:47a1c9ff…`) and `schema.compatibilityEpoch` is `0`, so the flag changes
what the connection may call, not the binary's surface. `permissionProfile` is
`null` on the session view even when pinned: the read-back is
`permissionState.profileId`.

**Decisions.** D37 → C, D38 → C.

### E-D38 — the cost of the read

**Method.** Timings printed by the same probe.

**Result.** spawn + initialize 456 ms stable / 467 ms experimental — one process
either way; `permissionProfile/list` 1 ms; `session/read` 44–53 ms. The whole
sequence differs by two requests at roughly 1 ms each, with no second host.

### E-D39 — the policy plane, formalised

**Method.** `scratch/cfg/p1-p6.json` and `q1-q6.json` through
`muse config validate --plane policy --file`, then `muse config status --json`.

**Result.** Twelve of twelve refused:

```
enterprise_document_invalid: plane=policy reason=unknown_member                     (p1–p6, top level)
enterprise_document_invalid: plane=policy reason=unknown_member location=settings   (q1–q6, nested)
```

Status:

```json
{"generation":"sha256:01658952…","pinned_at":"runtime_open","schema_version":1,
 "sources":[{"plane":"defaults","source_class":"system_file","state":"absent"},
            {"plane":"policy","source_class":"system_file","state":"absent"}]}
```

Against that, the 1.4.2 changelog (quoted in `round-8-plan.md` §3.4) describes
the behaviour. The behaviour ships; the local document vocabulary does not.

### E-D40 — a refused start

**Method.** `scratch/e-d40.ts`: `session/start` with
`permissionProfile: ":not-a-profile"` and `"not-a-profile"` on a live host, then
a plain start.

**Result.**

```
:not-a-profile → MspError {"code":-32030,"kind":"commandRejected",
  "message":"command 01a20763-… rejected: no profile :not-a-profile in the host catalog"}
plain start → {"permissionState":null,"approvalMode":{"mode":"onRequest","source":"startup"}}
```

Two facts decide D40: the host names the cause, and `startParams()` in
`src/session.ts` has no `permissionProfile` member, so the plugin cannot send
one. The refusal the plugin could meet — a saved default outside a managed
policy — needs a policy this machine does not have.

**Decision.** D40 → A.

### E-D41 — does `steps` bind a bridged turn

**Question.** Does `agent.build.steps: 1` cut a turn this plugin drives?

**Method.** `scratch/e-d41/`: an `opencode.json` with the local plugin and
`agent.build.steps: 1`, three files, and a prompt asking for three reads, run as
`opencode --standalone run --agent build --model muse/muse-spark-1.3`.

**Result.** Not observed. Five runs (JSON and text output, bash and `zsh -lc`,
with and without `OPENCODE_CONFIG`) each produced one `step_start` /
`step_finish` pair with `reason:"stop"` and `tokens:{input:0,output:0}`, no tool
call and no assistant text; the server shut down about two seconds later. The
provider is registered — the muse models list — so the request path fails before
a Muse turn exists. Nothing here says anything about the cap.

**Decision.** D39 keeps both sentences: the knob exists, is enforced on v2 in
opencode's own loop, and is unmeasured for this path. The row says so rather than
claiming a ceiling.

### E-D42 — an ACP client inside opencode's engine

One search, 2026-11-23: `anomalyco/opencode#51646` (ACP client mode) is still
closed as not planned, and no client mode appears in the docs. Round 7's verdict
stands; no install, no change.

### Decisions

- **D37** — the doctor reports posture, read on its own connection; warns when
  the profile is `:unrestricted`; the detail says saved approvals and a managed
  policy are invisible. Built, tested, and run live.
- **D38** — `experimentalApi` on the doctor's connection only. `MuseHost.spawn`
  takes it as an option; the user's session keeps `sessionMcp`.
- **D39** — no client-side cap. Document opencode's `agent.steps` as the knob
  that exists, off by default, unmeasured for this path; the durable ceiling is
  the provider's.
- **D40** — no new error code. The host names the cause, and the plugin cannot
  send the profile that would trigger it.
- **D41** — still no pin. New reason: a pin is unverifiable without the read and
  overridable by a managed policy.

`decision-coverage.md` carries the rows and the restated counts; `README.md`
carries the posture-and-ceilings paragraph and the corrected managed-plane
sentence.

## Round 9 — what the user cannot see

### E-D41, re-read — what the five runs actually recorded (S0)

**Method.** Re-read the five runs left in `scratch/e-d41/` on 2026-11-22. No new
run; this is the existing evidence, read properly for the first time.

| Run | stdout | stderr | End | Duration |
|---|---|---|---|---|
| 1 | `step_start`/`step_finish`, `reason:"stop"`, 0 tokens | none captured | exit 0 | 0.95 s |
| 2 | empty | 61,248 B, 309 lines, all `INFO` | `shutdown started signal=SIGTERM` | 7.56 s |
| 3 | empty | 60,724 B, all `INFO` | `shutdown started signal=SIGTERM` | 7.60 s |
| 4 | same pair as run 1 | empty | exit 0 | 0.93 s |
| 5 | empty | 64,537 B, all `INFO` | `shutdown started signal=SIGTERM` | 7.53 s |

**Correction to the plan, and to round 8.** The plan's §3.1 says the log shows
"the plugin loading — three `msg=\"loading plugin\"` lines" and "the process gone
eight seconds later". Both are wrong in a way that matters.

- There are **three plugin ids and sixteen instantiations of each**: 48
  `loading plugin` lines per run (45 in run 3, 63 in run 5). The plugin is
  re-created on every config event. In run 2 the first block is at 25.041 s and
  the last at 30.9 s; between blocks the log carries `config.updated`,
  `provider.updated`, `model.updated`, `agent.updated`, `command.updated` and
  `mcp connected` lines. `setup()` therefore runs sixteen times in one process.
- The process was **killed, not exited**: `shutdown started signal=SIGTERM` at
  30.487 s, 6.0 s after `cli starting`. Runs 3 and 5 the same, at 7.6 s and
  7.5 s. The watcher-stop lines that follow are teardown.
- Zero `ERROR` or `WARN` lines in any of the three logs. The startup path is
  silent, not complaining.

So the stderr logs describe **startup**, and a killed one. The completed turns
are runs 1 and 4: `step_start` and `step_finish` 0.95 s apart, `reason:"stop"`,
zero tokens, no parts, exit 0. That is the phenomenon worth explaining, and the
startup churn is a separate observation.

**New hypothesis, recorded not decided — H6.** `setup()` runs once per config
event, sixteen times per process. Each run re-creates the adapter, calls
`setGlobalRegistry`, spawns the host handshake and re-registers
`provider.transform` and the AI SDK hook under the same provider id. Last-wins
registration, or an earlier instance's cleanup closing the host a later one just
started, would leave a registered provider whose model cannot answer — which is
exactly a `step_finish` with no parts. This is not in the plan's H1–H5 table and
is now the cheapest explanation for a turn that ends in under a second.

**Ledger gap.** `~/.local/state/opencode-muse/` holds `usage-2026-11-20.jsonl`,
`-21` and `-22`, and no file for 2026-11-23. `allowance-notice.json` was written
at 06:36, before these runs. This is **not** evidence that setup failed: the
ledger row is `void appendLedgerRow(...)` (`src/plugin.ts:391`), a floating
promise, and a one-shot `run` exits before background work (`#48683`).

**What S0 does not settle.** Whether any setup threw (H1), whether the runtime
hooks fired (H2), whether the host answered (H3), or whether the duplicate
install matters (H4). It also does not show that the sixteen instantiations
happen in a run that completes: the only logs that show them are the killed
ones. S1 has to measure a completed run, with a timeout longer than startup.

### E-D43 — does `setup()` complete under `opencode run`

**Method.** Twelve synchronous `process.stderr.write` markers at the setup
milestones in `src/plugin.ts` (entry, config, adapter, registry, host facts,
models, containment, ledger, provider transform, AI SDK hook, session hooks,
cleanup) and one module-level marker in `src/index.ts`. One scripted turn per
configuration, `--standalone --print-logs`, `timeout 180`. Both files reverted
with `git checkout` afterwards; `git diff src/` is empty.

**Instrument errors, recorded because they cost two runs.** `--log-level` is
rejected by 2.3.2 at every position (usage text, exit 1), and `--print-logs` is
only accepted before `run`. A run without `--print-logs` captures none of the
server's output, so markers look absent when they are not.

*Corrected in round 10:* the `--log-level` half is wrong. It is a global flag,
`opencode --log-level debug plugin list` works, and `--print-logs` is global too.
What 2.3.2 rejects is the flag placed after the subcommand. The round-9 runs
lost the flag because of its position, not because it does not exist.

**Result, user's merged configuration** (global `@jonathand34/opencode-plugin-muse`
plus the project's local path): `[MUSE-TOP]` **once**, `[MUSE-MARK]` **zero**
times, `loading plugin` **117** times (39 rounds × 3 ids), and the turn itself
succeeded — three `read` calls, text "done", exit 0.

**Result, local plugin only** (temp `XDG_CONFIG_HOME`): `[MUSE-TOP]` once, all
twelve markers once, turn answered "ready", 40 `loading plugin` lines for one
id.

**What this decides.** H1 is refuted: `setup()` completes all twelve milestones
and does not throw. The 39–117 reload rounds do not re-run `setup()` — the
module is imported once and the ESM cache makes the later "loads" logging only.
The interesting half is the zero: in the merged configuration the checkout's
`setup()` never runs at all, while the turn works. That is E-D44.

### E-D44 — is the duplicate install the cause

**Method.** Three configurations, each in a throwaway `XDG_CONFIG_HOME` with a
copy of `~/.config/muse/auth.json` so the Muse login survives, and never
editing the real config: (a) the local path alone; (b) local path first, npm
package second; (c) the user's merged config, where the global file supplies
the npm entry and the project supplies the local one.

| Configuration | Local `setup()` | Turn |
|---|---|---|
| local path only | runs, 12 markers | answers |
| local path, then npm package | runs, 12 markers | answers |
| merged: global npm + project local | **never runs** | answers, served by npm |

**What this decides.** H4 is confirmed, with a mechanism: **one instance per
package name, first entry wins**. A clean file with the checkout first shadows
the npm copy; the merged configuration puts the global file's entry ahead of
the project's, so the published build wins and the checkout is loaded but never
started. Every E-D41 run therefore measured the published build, not the tree.

The failure is silent in the only place a developer looks: the log prints
`loading plugin` for the local path, so the checkout appears to be in use.

### E-D45 — do V2 provider hooks wire headless

**Not run; superseded.** The question was whether `ctx.aisdk.hook` reaches a
headless turn at all. E-D44 answered it: with the checkout as the only plugin,
a scripted `opencode run` produced text and three bridged tool calls. The hook
wires. A canned-model plugin would have proved less than that did.

### E-D46 — what a user sees on a silent turn

**Method.** `agent.build.steps: 1` with the checkout, default output format,
then the same run with `--format json`.

**Result.** Default: **zero bytes on stdout**, one banner line on stderr
(`> build · muse-spark-1.3`), exit 0. JSON: one `step_start`, one
`step_finish` with `reason:"stop"`, `tokens:{input:0,output:0}`, 1.1 s.

**What this decides.** H5 in shape: nothing failed, opencode saved an empty
stop, and the exit code says success. It also closes D43's options: the request
never reaches the provider, so no session hook fires and the plugin has no turn
to attach a warning part to. There is nothing for this code to make louder.

### E-D47 — a `plugin.use` denial on the checkout

**Method.** Temp `XDG_CONFIG_HOME`, plugin list holding only the local path,
`policies: [{action:"plugin.use", resource:"<absolute path>", effect:"deny"}]`.

**Result.** Zero `loading plugin` lines — the plugin is not loaded. `opencode
models` exits 0 and **still lists `meta/muse-*`**, which is the catalog, not the
policy. A run exits 1 with empty stdout and
`ModelUnavailableError: Model unavailable: muse/muse-spark-1.3`.

### E-D48 — a `provider.use` denial on `muse`

**Method.** Same temp config, `{action:"provider.use", resource:"muse", effect:"deny"}`.

**Result.** The plugin loads (6 rounds) and the provider is hidden; the run
fails identically: exit 1, empty stdout, `ModelUnavailableError`.

**What E-D47 and E-D48 decide.** The two strongest denials produce one
indistinguishable user-visible failure, and it names no policy. A user who
denies the plugin sees the same sentence as a user with a typo in the model id.
The docs' `Blocked by configuration policy` text is for `tool.use` only.

### E-D49 — a `tool.use` denial on a bridged call

**Method.** Checkout only, `policies: [{action:"tool.use", resource:"read:*",
effect:"deny"}]`, one turn asking for a file read, `--format json`.

**Result.** The bridged `read` returns `state.status:"error"`,
`error:"Blocked by configuration policy"`. The turn survives: the model retried
with a relative path (blocked again), then used `glob` and `grep` to read the
file, and answered "done". Exit 0, final step 197 input / 302 output tokens.

**What this decides.** This is the only denial that names itself, and it lands
as a tool error rather than a turn failure — which is the shape D43 asked for
and could not have. It also shows what a `tool.use` deny is not: a content
boundary. `grep` read the same file the `read` tool was refused.

### E-D50 — does `steps` bind a bridged turn

**Method.** Checkout only, `agent.build.steps: 1`, JSON format; control was the
same configuration without the key.

**Result.** With `steps: 1`: one `step_start`/`step_finish` pair,
`reason:"stop"`, zero tokens, 0.95–1.1 s, exit 0. Control: text plus three tool
calls, real token counts.

**What this decides.** Yes. The cap applies before the first model call, so
`steps: 1` does not mean "one model call" — it means none. D39's second
sentence is settled for this path, and E-D41's silent turns are explained: the
`steps: 1` in that probe's own `opencode.json` produced them, not the plugin.

**Limitations, recorded rather than papered over.** A Console-delivered policy
was not tested (no workspace here). Whether `steps: 2` yields exactly one model
call is unmeasured. The trigger for the 39 reload rounds is not identified —
whatever it is, it does not re-run `setup()`. And the experiment budget was
seven model-touching turns against a planned two: every discriminator needed a
fresh process, and the first two attempts were the instrument errors above.

### Decisions

- **D42 — `opencode run` is supported, with two named requirements.** Not
  documented as unsupported (it works), not claimed to work unconditionally
  (it does not). The README's new `### Headless runs` names both silent breaks:
  `steps: 1` ends the turn before the first model call, and a second entry for
  the same package shadows the checkout. Option D — detect headless at setup and
  print a line — is not implementable for either break: in the `steps: 1` case
  no request reaches the plugin, and in the shadowed case `setup()` never runs.
- **D43 — no warning part (A), and the reason is structural.** A turn that
  settles with zero parts never reached the provider, so no session hook fires
  and there is no part to attach. B, C and D all assume a request the plugin
  never sees. The README says what the user sees instead: zero bytes, exit 0.
- **D44 — no duplicate-install warning (A).** The copy that loses is not
  running, so it cannot warn; the copy that wins cannot see the entry it beat,
  because the plugin has no config read (E-D36). Documented as a harness rule
  instead, with the workaround that actually works: drop the package entry, or
  point `XDG_CONFIG_HOME` at a config that lists only the checkout.
- **D45 — the README's hard stop is corrected and `policies` is named (C).**
  The `permissions` example stays, because it is the per-agent form and still
  works; a `policies` block follows it as the stronger one, with all three
  denials and their measured user-visible shapes. `docs/compatibility.md` gains
  the vocabulary line and the 2.2.3 floor.
- **D46 — the doctor says it cannot see a policy against itself (C), with no
  new probe.** The posture row's detail now ends with the shape of the failure:
  the plugin is not loaded and the turn fails as `Model unavailable`. There is
  nothing to probe: a `plugin.use` deny means no code of ours runs, and a
  `provider.use` deny is applied outside the transform that registers the
  provider.
- **D47 — `steps` binds this path, settled.** `steps: 1` produces zero model
  calls, not one. The README's ceiling section now says so and its example uses
  `12`; D39's second sentence is measured rather than open.

## Round 10 — which copy runs, and what a step is

**Why this round.** Round 9 left one choice open (the doctor cannot see plugin
entries) and two sentences weaker than they looked (`steps` has no unit, and
`steps: 1` was said to make zero model calls). Both turned out to be wrong in
ways only a run could show.

### S0 — the CLI is not the resolver the plan assumed

`opencode plugin list` on 2.3.2 prints the configured local directory and
nothing else. `--builtin` — "Include built-in server plugins" — adds **no**
builtins and no package rows on this machine, so the plan's premise ("the vendor
already ships the resolver") was false. The package does load; the debug log
names it:

```
msg="loading plugin" id=@jonathand34/opencode-plugin-muse
  entrypoint=file:///home/jonat/.cache/opencode/npm/@jonathand34/opencode-plugin-muse@latest/1795036133471/node_modules/@jonathand34/opencode-plugin-muse/src/index.ts
```

The surface that does answer is `opencode debug config`: one document per source,
each with its own `plugins` array and, for files, a `path`.

### E-D53 — what `opencode debug config` sees

Four states, all free:

| State | cwd | `XDG_CONFIG_HOME` | Documents carrying `plugins` |
|---|---|---|---|
| A | temp project with a local entry | real | global package, project checkout |
| A2 | same, `--standalone` | real | identical to A |
| B | same | temp (package) | temp package, project checkout |
| C | temp root, no project config | temp (package) | temp package only |

It follows the cwd, respects `XDG_CONFIG_HOME`, and lists each file's own array —
so a relative entry can be resolved from the file that carries it, which is the
rule the vendor documents. It does not say which id wins; for this question it
does not need to, because every entry loads.

### E-D54 — what it costs

0.16 s, three times, against the running service (`opencode service status` →
`http://127.0.0.1:49374`); 0.79 s with `--standalone`, which spawns a private
server and touches the user's service not at all. No processes were left behind.

### E-D51 — `steps: 1` was our defect

The first run (checkout only, `steps: 1`, `--format json`): one
`step_start`/`step_finish`, `reason: "stop"`, every token zero, **no text part**,
and the ledger gained host rows but no turn row — the plugin never ran a turn.
That is not the cap "preventing the call"; the request was made.

Instrumenting `doStream` for one run showed what arrived:

```
[muse-debug] tools=13 toolChoice=[object Object] prompt=3 roles=system,user,assistant
```

Tools are kept at the cap (the runner's comment says so), and the prompt ends
with the cap's assistant message. The cause is the fresh-session seed:
`live.promptLength = length - (lastIsUser ? 1 : 0)`. With an assistant last, the
slice keeps the whole prompt, `fresh` is empty, `latestUserTurn(fresh)` is
undefined, no `turn/start` is sent, and the returned stream closes empty.

The fix is `trailingInstruction()` in `src/prompt.ts` plus its use in
`src/language-model.ts`: a trailing assistant message is delivered as the turn
body, and the seed stops before it. Pinned by `test/lifecycle.test.ts` → `the
step cap > a trailing assistant instruction starts a turn instead of returning
nothing`.

Re-run, same shape: one step, text `"Maximum steps for this agent have been
reached. …"`, tokens input 5728, output 118, reasoning 393. The cap now
summarises instead of eating the turn.

### E-D52 — the unit of a step

- `steps: 2`, "Reply with the single word ready.": **one** step, `"ready"`,
  7484/10/48 tokens.
- `steps: 3`, "read line 1 of package.json and line 1 of README.md": **three**
  steps — text + one tool call, one tool call, text (639/225/285). The third step
  was itself the capped one (`3 >= 3`) and answered with text, which is the fix
  working with tools in play.

So one step is one model request, and a turn that uses N tool calls needs N+1
steps. Tool-call steps reported zero tokens, so per-step token totals are not
usable as evidence; the step counts are.

### E-D55 — the reload rounds

E-D51's log has ten `loading plugin` lines for one id in about 2.6 s, after a
single `config.updated` event whose location is the repo directory. The same
short command (`plugin list`) with its logs written into the repo produced one
load and no `config.updated`; writing them outside the repo also produced one.
The watcher tracks the cwd (`.git/HEAD` appears among the watched paths), so the
class of trigger is opencode's own cwd activity during a turn. **The count is
still unexplained**, and this plugin's writes (a private temp `XDG_CONFIG_HOME`
and the state dir) are outside the watched trees.

### E-D56 — the row, in three states

`bun run doctor --json`, online, real paths folded to `~`:

- package only (the real machine): `warn` — "@jonathand34/opencode-plugin-muse
  from ~/.config/opencode/opencode.jsonc; this checkout is not listed, so a run
  from here loads the published build".
- checkout only (temp XDG): `ok` — "this checkout, from /tmp/…/opencode.json".
- both in one file: `warn` — "two copies load from /tmp/…/opencode.json:
  @jonathand34/opencode-plugin-muse and this checkout".

**Limitations.** Five paid turns against three planned: E-D51 ran twice (the
first result was unexplained and instrumentation was the only way to name the
cause), E-D52 ran twice, and one run re-checked the fix. A Console workspace is
still untestable here, Muse's policy plane is unchanged, the reload count is
unexplained, and the plan's `plugin list --builtin` premise came from a summary
rather than a measurement — the CLI is the authority and it contradicted the
summary.

**Decisions.**

- **D48 — the row reads `opencode debug config` (B), not the config files.** One
  process, no plugin import, no re-derived precedence. `--offline` skips it, and
  a CLI that does not answer leaves the row `skipped` rather than guessing.
- **D49 — a shadowed checkout is `warn`.** The install works; it is the copy
  that is wrong.
- **D50 — one step is one request**, stated with the N+1 arithmetic.
- **D51 — fixed, not documented.** `steps: 1` was a defect in this plugin's
  handling of a trailing assistant message; this tree answers the cap. The
  published 0.1.12 still returns nothing, so the README says which one is which.
- **D52/D53 — recorded, not measured.** Muse's plane ships without a local
  vocabulary, and Console policy arrives through a builtin that ignores
  removals; neither can be exercised here.

## Round 11 — the clause, the count, and two recorded planes

**Why this round.** Round 10's review found one defect worth changing and two
items still unclear. The defect is documentation: the README recommends
`policies` as the hard stop that outranks `--auto` and saved approvals, and
prints the block a careful user copies, without saying the mechanism fails open.
The two unclear items are a reload count nobody explained and two policy planes
nobody had separated. Nothing structural was in scope, and no paid turn was
planned.

### S0 — the drop, confirmed on the installed build

`opencode v2.3.2`; `opencode debug --help` lists four subcommands (`agents`,
`config`, `heap-dump`, `paths`) and there is no policy or validate mode. So
there is no surface that reports a validation result — the only way to see a
drop is to compare the file with the document `debug config` prints.

### E-D58 / E-D59 — declared versus printed is a faithful count

Five fixtures, each in a throwaway `XDG_CONFIG_HOME` with `auth.json` copied in:

| Fixture | Declared | Printed | What it shows |
|---|---|---|---|
| three statements, one valid, two misspelled | 3 | 1 | the drop is real and complete |
| one valid + one misspelled action | 2 | 1 | the misspelled action is gone |
| `policies` + `experimental.policies` | 2 | 2 | `experimental.policies` merges into `info.policies`, so it must be counted |
| global file + project file, one each | 2 | 2 | per-document, no inheritance between sources |
| the same statement twice | 2 | 2 | no dedupe, so counting is faithful |

That is the whole basis of D55's option B: declared counts come from the file,
enforced counts from the document, and the difference is exactly what the host
dropped. The enum is never consulted, so a new action name cannot make the row
wrong. Raw output: `scratch/round-11/{E-D58,E-D59a,E-D59b,E-D59c,dup}.out`.

### E-D57 — the ten loads were one setup

Round 10 counted ten `loading plugin` lines after one `config.updated` and left
it unexplained. Re-reading the same three logs:

| Log | `config.updated` | `loading plugin` | distinct ids | `[opencode-muse]` (setup output) |
|---|---|---|---|---|
| E-D51.err | 1 | 10 | 1 | 2 |
| E-D51b.err | 1 | 9 | 1 | 2 |
| E-D52a.err | 1 | 20 | 1 | 2 |

One id every time, one generation every time, and the plugin's own setup output
exactly once every time. The burst in E-D51.err is eight loads at 159–162 ms
intervals with nothing between them — no `config.updated`, no watcher line, no
event — plus one more after `shutdown started`. So the count measures loader
entries, not plugin initialisation: neither "ten plugins" nor "ten generations"
was ever the right reading, and there was no storm. What re-enters the loader is
still unnamed; it cannot be a reload, because a reload would show a generation
and a second setup. Raw output: `scratch/round-11/E-D57.out`.

### D55 — the row, and what it cannot see

Option B, because E-D59 came back clean. `scripts/doctor.ts` gains a `policies`
row beside `plugins`, over the same documents: for each source with a `path`, it
reads the file (a small JSONC reader — comments, `//` inside a string, trailing
commas), counts `policies` plus `experimental.policies`, and compares with that
document's `info.policies`. Fewer enforced than declared is a `warn` that names
the file and both numbers; an unreadable source is skipped, never guessed; a
config with no policies is `skipped`, not `ok`, so the row never implies
protection nobody wrote. Against the real CLI with one valid and one misspelled
statement it printed `2 declared, 1 enforced`.

The remote half is not covered and the row does not pretend otherwise: a
Console-delivered policy is decoded on the vendor's side, where unknown actions
and effects are filtered without a diagnostic (`anomalyco/opencode#60252`), so
there is no file here to read.

### E-D60 — idempotency is not the contract

`setup()` returns a cleanup closure (`src/plugin.ts:547`), and every observed log
shows exactly one `setup()` per process. The contract opencode offers is one
setup and one cleanup, not a re-entrant setup; a second call would register a
second adapter and a second host, which is why the loader caches. Since no log
re-ran it, there is nothing to fix and no test was invented for a path the host
does not take.

### D57 / D58 — two planes, one sentence each

Muse's managed policy is current, not abandoned: 1.4.13's changelog names it
again, and `muse --version` is still 1.4.25, unchanged since round 8, so
re-bisecting the validator would have been a repeat. Console-delivered policy
stays unmeasurable here; what changed is that its silence is now recorded as a
fact rather than an absence.

### What this round did not measure

No Console workspace exists here, so the remote sentence rests on the vendor's
issue and not on a probe. Whether a source-file change re-enters the loader
(E-D61) was not spent: the count is already explained as loader entries, and a
paid turn would not have made the row or the clause different. The JSONC reader
is only exercised against the fixtures in `test/doctor.test.ts`, not against
every config file in the wild.

## Round 31 — evidence integrity, then a stopped release

**Why this round.** The record had a wrong E55 baseline summary, two approval
scopes described as one, a Console page with superseded present-tense claims, an
unqualified Windows mode claim, a release page that listed more gates than the
workflow ran, and provenance wording that called one builder reproducible. The
round repaired those first, then tested the approval and dependency claims.

**D241 — E55 baseline corrected, no Console claim.** The retained
`scratch/r30-e55/before-config.json` is a three-element array (`document`,
`directory`, `directory`) with six `provider.use` statements, and it is
byte-identical to a fresh `opencode debug config --standalone` on 2.4.1. The
original artifact's `sourceCount: 0` / `sources: []` was wrong. The addendum
corrects the baseline only; Console attribution and effect timing remain
unmeasured.

**D242 — approval scopes separated.** A Muse shell command-prefix grant is
workspace-root scoped; a Muse `tool` grant has `toolName` and no `workspaceRoot`
and was observed across workspaces in E57. An opencode saved approval is a
different, project-scoped object and never overrides a configured `deny`. The
approval page and ledger now say that, and no sentence maps one to the other.

**D246 — E62 B2: release stopped.** A fresh project-scoped hook install required
approval and its first echo turn fired the marker. Changing only the hook command
and running `muse plugins update` produced inspect status `modified` with
`modified_definition_hash`; the next `muse exec` still wrote the new marker and
rewrote the trust record to the new hash, with
`legacy_hook_trust_amnesty_applied: true`. That is a changed hook running
without re-approval on Muse 1.4.25. The release stops; E61, E64, and E60 were not
run. P5 moves from H to P.

**D249 — E63 B1: no runtime path found.** `@vercel/nft` 1.11.12 traced 371
unique files from `dist/index.js`. The list contains `@opencode/plugin`'s
promise/schema entry and `@opencode/schema`, but no `@opencode/util`, glob,
minimatch, gaxios, gcp-metadata, or rimraf. The installed tree still audits at 25
moderate / 0 high / 0 critical, with gaxios, gcp-metadata, and rimraf fixable.
This supports O25 A with a review date; it is not a claim that the modules are
unreachable on every path.

**D247/D248/D250/D251 — not reached.** E55a/E55b are blocked on an
owner-authenticated Console browser, so no effect, timing, or attribution claim
was added. E64 and E60 were not run after the E62 stop. No stage was created,
nothing was approved or published, and no tag or push occurred.

**Verification.** `bash scripts/check-release.sh` passed with strict claims
20/20, a 165-file pack, a 25 moderate / 0 high / 0 critical audit, and an
installed-package import. The first `npm test` run after removing two ignored
scratch test trees was 458 pass / 1 fail; the single conformance test passed on
rerun. The final full run is recorded in `docs/round-31-status.md`.
