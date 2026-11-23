# Implementation plan — subscription-first hardening

**Written** 2026-11-22, at `dcb85da` (39 commits ahead of `origin/main`).
**Purpose** durable external state. A fresh session with no memory should be able
to read this file and continue without re-deriving anything.

Update the *Status* column as work lands. Do not delete sections; strike them and
say why.

---

## 0. Scope decisions

| # | Decision | Rationale |
|---|---|---|
| S1 | **Optimise for subscription users first.** | The plan is flat-rate, so cost accounting is not the user's problem; quota and reliability are. |
| S2 | **Pay-as-you-go users are told to use their API key in the harness of their choice.** | A per-token API user gains nothing from an adaptor that adds a hop. The README should say this plainly instead of implying this plugin is the general path. |
| S3 | **No ACP shim, ever.** | `muse acp` is a shipped vendor subcommand (see F3). Building MSP→ACP would reimplement the vendor's own front door against a surface it refuses to promise. |
| S4 | **Point readers at `muse acp`** for editor-native Muse, and add an explicit *when to use MSP* / *when to use ACP* guide. | Only the vendor entry point is cited; do not rank or name third-party ACP adapters without measuring them. |
| S5 | **No CI gate for vendor conformance replay.** | Owner's call. Run it once as an audit (P4) and record the result; do not wire it into `check:offline`. |
| S6 | **Subscription sessions report cost as 0**, so USD must not be the primary budget unit. | See F5. |

---

## 1. Verified findings

Each is a fact with a file:line or URL, not an inference. Re-verify if the
dependency moves.

### F1 — The SDK has a transport-EOF arm; this plugin cannot reach it

`@muse-code/sdk` 1.4.24 exports `TransportEof`, `HostDeathNotification`,
`HostDeathDischarge`, `MuseHostDiedError`, `readSessionDurability`
(`dist/src/index.d.ts:57,60`). The construction site is
`dist/src/facade/client.js:915`:

```ts
#transportClosed() {
  if (this.#closing) return;
  this.#hostDied = true;
  for (const session of this.#sessions)
    session.hostExited({ kind: "transportEof" });
}
```

Its own comment states the exact failure this repo documents:

> A host that closes stdout while still hung emits no exit on the timescale
> that matters, so without this arm its session never discharged: every pending
> command sat in the set as the durable-looking echo SS4.13 forbids, and every
> turn wait hung.

That arm is on the `MuseClient` facade. This plugin uses the lower-level
`spawnMspConnection` (`src/host.ts:202`) and only consumes
`spawned.exited` (`src/host.ts:232,321`). **So `docs/product-gaps.md:270`
("the SDK's public connection surface has no transport EOF") is stale as
written** — the transport does surface it; the chosen API does not.

`test/host-death.test.ts` had 7 tests at `299830c` and **none** exercised stdout EOF or a
hung host.

**Correction, same day, from E1:** `Connection` — the object this adapter
already holds — exposes `closed`, resolved by its own `#finish` on EOF
(`connection.d.ts:150`, `connection.js:673-679`). So the transport surface does
report the EOF; the adapter simply never subscribed to it. P1 subscribes rather
than watching stdout, and `spawned.exited` stays the authoritative arm for how
the process ended.

### F2 — Approvals are already command-plane; the conflicts are not handled

`src/session.ts:967` sends `approval/decide` with `sessionId`, `approvalId`,
`choiceId`, and `requirementId` (from `currentRequirementId` stored at
`:1639-1641`). It never answers the `approval/request` frame with a decision,
which matches the doctrine ("a response is a presentation receipt only").

`approval/requested`, `approval/updated`, and `approval/resolved` are all
dispatched (`:1127-1132`), and `view/page` replay re-enters `dispatch`
(`:1213`), so gap-fill re-presents approvals.

**Missing:** the three typed failures the protocol defines —
`approvalAlreadyResolved`, `approvalRequirementStale`, `approvalChoiceInvalid`.
Also missing: pruning a pending request whose `approvalId` the host retired on
restart (recovery closes the old identity and opens a fresh one with the same
action payload).

### F3 — `muse acp` is shipped and ungated

Muse Code **1.4.25**. Measured by piping one `initialize` line into `muse acp`
with `MUSE_EXPERIMENTAL_ACP` unset:

```json
{"jsonrpc":"2.0","id":1,"result":{"agentCapabilities":{"loadSession":true,
"mcpCapabilities":{"http":true,"sse":false},
"promptCapabilities":{"audio":false,"embeddedContext":true,"image":true},
"sessionCapabilities":{"additionalDirectories":{},"list":{},"resume":{}}},
"agentInfo":{"name":"muse","version":"1.4.25"},
"authMethods":[{"description":"Sign in with a device code shown in your browser.",
"id":"muse-login","name":"Log in to Muse"}],"protocolVersion":1}}
```

`muse acp --help` documents `--no-session-log`, `--preset`, `--provider`,
`--model`, and states approval mode is chosen per session by the editor. The
docs still say "no compatibility promise", which is consistent with it being
shipped but unpromised.

### F4 — Subscription policy names MSP as the sanctioned path

- Muse Code subscriptions: flat monthly rate; "It works only through the Muse
  Code CLI while signed in with your Meta Model API account"; the connected
  credential "is for use with Muse Code only"
  (`dev.meta.ai/docs/muse-code/subscriptions`).
- Terms §3.2: that credential "may not be used to access the Services outside
  the coding harness or to circumvent your subscription's usage limits or
  billing."
- Enforcement is live: requests whose tool declarations do not match the
  builtin `muse` schemas get `403 client_attestation_denied`.
- Sanctioned programmatic surfaces: `muse exec`, `muse serve` (MSP),
  `@muse-code/sdk` — the SDK README describes itself as "for building clients
  that drive Muse Code agent sessions".

Residual risk to carry consciously: "the coding harness" is not defined to
include third-party harnesses, while the SDK explicitly invites clients. Meta
has already tightened this once, without notice.

### F5 — Flat-rate sessions do not produce a meaningful cost

A subscription turn is not billed per token; cost reads as 0 and the only
truth is `muse usage` (a 5-hour allowance **and** a weekly allowance, both
enforced). `src/usage-ledger.ts` aggregates `costUsd`, `pricedTurns`,
`partialCost`, `reseedRate` — none of which mean anything to this audience.

---

## 2. Approved experiments

The owner approved all of these. E1/E2/E5 are offline. E3/E4 need a signed-in
`muse` and spend a little quota.

| # | Question | Method | Pass means |
|---|---|---|---|
| E1 | Does a hung host that closes stdout become detectable on *our* surface? | Fake child: write one valid frame, then `stdout.end()` and keep the process alive. Assert `spawned.exited` stays pending and `child.stdout` emits `end`/`close`. | `stdout` close fires while `exited` is pending → build P1. |
| E2 | Do we settle correctly on the three typed approval failures? | Unit-level: inject each error into `respondToRequest` / the command path. | Each maps to a defined local outcome, no stuck `pending`. |
| E3 | What does a host crash do to a pending approval's identity? | Park an approval, `kill -9` the host, reopen, observe the fold. | We learn whether the old id resolves and a new one appears. |
| E4 | Does `view/page` alone re-present pending approvals with a usable requirement id? | Same session as E3, but catch up via `view/page` only. | Page carries `availableChoices` + `currentRequirementId` → no `session/resume` needed for approvals. |
| E5 | What does `muse acp` actually cover? **(Spent, no deliverable — see §7 R2.)** | Drive it with a scripted ACP client: prompt, permission request, cancel, resume, list. | No longer a pass condition. The coverage table it was meant to produce is not wanted: ACP is a routing paragraph, not a feature of this plugin. |

Record each result in §5 below, with the date and the exact observation.

---

## 3. Implementation phases

Ordered. Each phase is independently shippable and leaves the suite green.

### P0 — Tell the truth in the docs *(no code)*

1. Fix `docs/product-gaps.md:270`. Replace "no transport EOF" with the accurate
   statement: the SDK facade has it; the raw connection path this adapter uses
   does not; therefore the adapter watches stdout itself (P1) or documents the
   limit.
2. Add a short "Why there is no ACP adaptor" note to `docs/seam-review.md`:
   vendor ships `muse acp`; we do not compete with the vendor's front door.
3. Add "When to use Muse inside opencode vs `muse acp`" to `README.md`:
   - use **`muse acp`** when the editor owns the agent loop and you want Muse's
     own tools and prompt;
   - use **this plugin** when you want Muse's models inside opencode's tools,
     transcript, permissions, and history.
4. Add the pay-as-you-go sentence from S2 to the README install section.

Acceptance: no claim in the repo contradicts F1–F5. `bun run check:offline`
still green (docs-only change, but run it).

### P1 — Transport EOF → host death *(E1 first)*

Test first, in `test/host-death.test.ts`:

- a fake host that emits a frame, then closes stdout while staying alive;
- assert the in-flight turn/pending command fails with a retryable error rather
  than hanging, and that the failure is reported once (mirroring the existing
  "clean close is not a crash" test at `299830c`);
- assert `hostExited` latches so a later real exit does not double-report.

Then in `src/host.ts`, watch the child's `stdout` for `end`/`close` and route to
the existing `handleHostExit()` path (`src/session.ts:1029`) with a distinct
reason so the message does not claim "exited" when the process is alive. Keep
`spawned.exited` as the authoritative arm.

**As built (E1):** no stdout watching. `MuseHost` already holds the SDK
`Connection`, whose `closed` resolves on EOF however long the process lives, so P1
subscribes to that and latches the announcement. Watching `child.stdout` would
have been a second, weaker detector of the same event.

Do **not** invent a terminal state on a timer. The protocol's rule is that a
command's fate is observed (durable replay or resume snapshot), and a transport
failure is an observation, not a guess.

Acceptance: the new tests fail before the change and pass after; no existing
test changes its expectation.

### P2 — Approval conformance *(E2, E3, E4)*

1. Map the three typed failures in the `approval/decide` path:
   - `approvalAlreadyResolved` → apply the carried winning resolution to the
     local request and emit `request.updated`; never leave it `pending`.
   - `approvalRequirementStale` → replace the stored requirement with the
     carried current one, refresh the choices, and re-present. Do not retry the
     stale decision.
   - `approvalChoiceInvalid` → drop the cached choices and re-present the
     server's menu verbatim.
2. On resume/reopen, drop local requests whose `approvalId` is absent from the
   fold, and re-present fresh ones (E3/E4 decide whether this needs
   `session/resume` or whether `view/page` suffices).

   **As built (E3):** item 2 is unreachable and was dropped. A bridge session
   forces `approvalMode: "allowAll"` (`src/session.ts:464`), so the host answers
   its own approvals; a live run saw one bridge tool call and **zero** approval
   requests. No local approval can be pending across a restart.

   **As built:** `approvalChoiceInvalid` cannot re-present a menu — the error
   carries only `choiceId`, with no options. It keeps the delivered options and
   throws `invalid_input`, leaving the request open.
3. Never construct a `choiceId` locally; always select from the delivered menu.

Acceptance: new tests for each typed failure, plus one restart test. The
existing approval flow keeps passing.

### P3 — Accounting that fits a flat plan

1. Make **tokens and turns** the primary numbers in the ledger and any
   user-facing summary. Keep `costUsd` available but label it postpaid-only, and
   suppress it (or mark "not billed per token") when the session is
   subscription-backed and the number is zero.
2. Do not add a USD hard cap. No enforcement the client cannot verify.
3. Optional, only if it stays cheap: mention `muse usage` in the README limits
   section as the only authoritative allowance read.

Acceptance: ledger tests updated to assert token-primary behaviour; no test
asserts a USD figure for a flat-rate session.

### P4 — One-time conformance audit *(not CI)*

Replay the vendor transcript corpus under `schema/msp/` against the adapter once.
Record: scenarios run, passed, failed, skipped, and the exact failures. Put the
result in `docs/provenance.md`. Do not wire it into `check:offline` (S5).

**Input settled 2026-11-22 (R3):** the corpus exists, but in neither installed
artifact. `@muse-code/sdk@1.4.24` publishes only `dist/src`, and `muse schema`
exports the wire schema with no transcripts. The transcripts live in the vendor
source repository `meta-models/muse-code-sdk` at
`schema/msp/transcripts/<scenario>/transcript.ndjson`, verified reachable (HTTP
200) at commit `fbce769ccb75ab971d00e01a00fe076de4c773fc`, next to
`schema/msp/msp.d.ts`. So P4 is unrun, blocked on an input this repo does not
vendor rather than on a corpus that does not exist. What would unblock it: a
pinned checkout of `schema/msp/` (or those files vendored under `evidence/`) and a
driver that maps MSP frame transcripts onto the adapter — a replay driver this tree
does not have. Until then the run recorded below is scaffolding, not parity.

---

## 3a. Phase status

| Phase | Status | Evidence |
|---|---|---|
| P0 | Done 2026-11-22 | `seam-review.md` §13/§14, README *This plugin, or `muse acp`?* + postpaid sentence. The cited `product-gaps.md:270` no longer exists (that file is 248 lines); no claim in the repo contradicts F1 now, and the accurate statement lives in §13. Suite unchanged: 290/720/28. |
| P1 | Done 2026-11-22, uncommitted | `MuseHost` subscribes to `connection.closed` → `announceExit("transportEof")`; the announcement latches once; `gone` settles for both arms; the adapter forgets a host on `gone`; the session's EOF failure is retryable and says "closed its output". 4 tests added (294/729/28), all red before the change. |
| P2 | Done 2026-11-22, scope reduced, uncommitted | Typed approval failures mapped and tested (4 tests, `test/approval-failures.test.ts`). The restart-pruning half was dropped on E3's evidence, not skipped. E2 showed all three failures previously left the request `pending` forever. |
| P3 | Done 2026-11-22, uncommitted | `UsageSummary.costBasis` (`postpaid` | `unpriced`) plus doc comments; tokens and turns were already the primary numbers. One test added for the flat-rate shape. No USD cap, no enforcement. |
| P4 | Input located, replay unrun, audit run 2026-11-22 | The corpus is in neither this tree nor the published package (SDK 1.4.24 ships `dist/src` only); it is in the vendor source repo at `schema/msp/transcripts/<scenario>/transcript.ndjson`, commit `fbce769…` (R3). Replay needs that checkout plus a driver this tree lacks. The audit that did run: `test/conformance.test.ts` once against a real host, 1 pass / 0 fail / 3 expects / 11.5 s, four scenarios recorded, three skipped for missing drivers. In `docs/provenance.md`; not in CI. |

## 4. Out of scope (do not reopen without a new decision)

- MSP→ACP shim, ACP server mode, ACP test suite.
- Conformance replay as a CI gate.
- A hard USD budget, or any spend enforcement.
- Idempotent `turn/interrupt` — it is deliberately carrier-less at v1; dedupe is
  host-lifetime-only.
- Hand-written tier tables where MSP's own conformance corpus can answer.

---

## 5. Experiment log

| # | Date | Observation | Decision taken |
|---|---|---|---|
| E1 | 2026-11-22 | Offline, `new Connection({ incoming: <async iterable>, close: <never settles> })`. Before the stream ends: `closed` **pending** (the control). After it ends, with `transport.close()` still pending: `closed` **resolved**, and a `model/list` request issued beforehand rejects `ProtocolError: connection reached EOF`; 1 frame written. Two wrong fixtures first: a generator *function* is not an `AsyncIterable` (the read loop threw at once and `closed` resolved before EOF), and an unrouted frame finished the connection on the protocol error instead of on the EOF. | Build P1 on `connection.closed`; do not hand-watch stdout. |
| E2 | 2026-11-22 | Offline, a fake host rejecting `approval/decide` with each typed kind. Before the change, all three behaved identically: the `MspError` escaped to the caller, the local request stayed `pending`, and no further `request.updated` was emitted — an approval that no longer exists stays open forever in opencode. | Build P2.1. `approvalAlreadyResolved` settles locally from `data.resolution.decision`; the other two keep the request open (the host still holds it), refresh the requirement where the wire carried `currentRequirementId`, and throw a typed `invalid_input` so the caller knows the decision did not apply. |
| E3 | 2026-11-22 | **Not reachable, measured.** With a tool bridge, `session.ts:464` starts the session with `approvalMode: "allowAll"`, so the host answers its own approvals. Live: one bridge tool call, **0** approval requests, turn completed (\`scratch/e3b-allowall.ts\`). A first run waited 120 s for a parked approval and saw none. | Drop P2.2 (restart pruning): no local approval can be pending across a restart in this configuration. Keep the typed-failure mapping as defence — a host can still reject a decide (race with a policy resolution, restart mid-decide, or a future non-allowAll mode). |
| E4 | 2026-11-22 | Not run: E4 needs the parked approval E3 proved cannot exist under `allowAll`. The `view/page` mechanism itself is already used for gap fill, and `ViewPageParams`/`ViewPageResult` carry no approval-specific fields. | Fold into E3's decision; revisit only if an approval mode other than `allowAll` becomes reachable. |
| E5 | 2026-11-22 | Scripted ACP client against `muse acp` (1.4.25), `scratch/e5-acp.ts`. `initialize` → capabilities as in F3. `session/new` → a session plus `configOptions` with a `mode` option (`allowAll`, and an ask-before-unknown mode; `currentValue: "onRequest"`). `session/list` → sessions with `cwd`, `sessionId`, `updatedAt`, `nextCursor`. `session/load` → same `configOptions`, so load/resume is real. `session/prompt` → **failed**: `modelError`, \`model muse-ember-1.0 does not exist or you lack access\`. Streaming was not reached; only `available_commands_update` and `session_info_update` notifications arrived. **Second run** (`scratch/e5b-acp.ts`, `--contributor-mode off --model muse-ember-1.0`, the flag the `modelError` pointed at): prompt A `end_turn`, 2 `agent_message_chunk`s / 32 chars; **0** permission requests; prompt B finished in 4.0 s, and the `session/cancel` sent at that moment found the turn already done (`stopReason: end_turn`), so cancel was not measured. | E5 spent 2026-11-22: no coverage table, and §7 withdraws it. The two runs stay recorded here because they happened and cost quota; nothing in the README or §14 rests on them. |

---

## 6. Verification for every phase

```
bun run check:offline     # tsc --noEmit + the 28-file offline suite
git diff --stat           # confirm the change is the size it should be
```

Baseline before this plan: 290 pass / 0 fail / 720 expect / 28 files at
`299830c`. Any phase that changes a count must say why in its commit message.

After P1–P3 (uncommitted, 2026-11-22): 299 pass / 0 fail / 748 expect / **29**
files. The file count rose because `test/approval-failures.test.ts` is new; the
test count rose by 9 (4 EOF/death, 4 approval failures, 1 flat-rate ledger).

---

## 7. Round 2 — close-out

**Planned** 2026-11-22 after the P0–P4 run. State: HEAD `dcb85da`, 12 uncommitted
paths (10 modified, 2 new), suite 299/748/29 green, P4's input unlocated.

Round 2 is deliberately small. It finishes the truth pass and settles P4's input.
It does **not** reopen anything in §0 or §4, and it builds no ACP work.

**Round 2 status**

| # | Status | What happened |
|---|---|---|
| R0 | Done 2026-11-22 | Four items applied; the README ACP section shrank to routing plus the non-ranking caveat; §15 added to `seam-review.md`; P4's scaffolding framing in `docs/provenance.md`. No code touched. Suite 299/748/29 green after the edit. |
| R1 | Done 2026-11-22 | Five commits, owner-approved, no push and no tag: `25659b0` docs truth, `1be30d4` transport EOF, `4bdd1b2` approvals, `b87a3fc` accounting, `09c4a54` audit doc. `src/session.ts` was split by hunk so the EOF and approval halves landed in their own commits. Each message separates measured from inferred. |
| R2 | Withdrawn 2026-11-22 | Struck before any further run: E5 is spent and the coverage table is not wanted. Two earlier runs stand recorded in §5; no ACP claim in the docs rests on them. |
| R3 | Done 2026-11-22 | Corpus located in the vendor source repo at a pinned commit; P4 keeps its real input path and stays unrun. Search recorded in §3 P4 and `docs/provenance.md`. |

| # | Work | Acceptance |
|---|---|---|
| R0 | Docs residue, no code. See the four items below. | No sentence in the repo claims more than was measured. `check:offline` green. |
| R1 | Commit the run in five logical commits. **Owner-gated: ask before committing; never push or tag.** | Each commit names what was measured vs. inferred; no mixed-concern blob. |
| R3 | Settle P4's input: does a vendor transcript corpus exist anywhere reachable? | P4 gets an input path, or is struck as permanently blocked with the search recorded. |

**R2 withdrawn, same day.** "Finish E5: measure `muse acp` prompt/streaming/
permission/cancel" was in this table for one revision and is now struck. Nothing
in this plugin depends on what the vendor's ACP entry point can do: MSP is the
surface the plugin drives, and ACP appears in the repo only as one routing
paragraph so a reader picks the right integration. A coverage table for ACP
would be account-specific, would go stale with the next CLI release, and would
spend quota on a question no user of this plugin is asking. Do not reinstate it.
The README paragraph is shortened to match: cite `muse acp`, say when to choose
it, and stop.

**R0 items**

1. `README.md`, ACP section: replace "the test account" with "the account used for
   this check". User-facing docs should not read as a lab note.
2. `docs/provenance.md` / `docs/seam-review.md`: state that the four
   `test/approval-failures.test.ts` tests run against a stub host and are
   defence-in-depth only — under `allowAll` (A20, `steady-state.md:128`) the host
   answers its own approvals, so they cannot fire live. Same reasoning that
   removed P2.2. This does not affect opencode's own permission prompts for
   opencode tools, which are untouched by `allowAll`.
3. `docs/seam-review.md` §14 and the README ACP section: name the unmeasured
   assumption. S4 cites only the vendor's `muse acp`; no third-party adapter was
   ranked or measured, and no popularity claim is made.
4. Note on P4: the conformance run is scaffolding for a missing corpus, not
   transcript parity. If R3 finds no corpus, strike P4 and say what would
   unblock it (a vendor-published or CLI-shipped transcript set).

**R0, README shape.** The ACP section shrinks to a routing note: the vendor
ships `muse acp` for editors that own the agent loop; this plugin puts Muse's
models inside opencode's loop, tools, and transcript; the two share no state.
Delete the measured-capabilities paragraph and the per-session config-option
detail — both are account- and release-specific, and neither helps a reader
decide. One short caveat that the vendor makes no compatibility promise is
enough.

---

## 8. Round 3 — the consolidated plan

**Written** 2026-11-22. Supersedes the open parts of `decision-plan.md` S8 and
the six unaccepted sentences in `decision-evidence.md` § Owner calls. Everything
in Rounds 1–2 stays done; nothing here reopens §0 or §4.

This is the single execution target. If a later session reads only one file, it
is this section. Read it top to bottom; each phase ends by writing its result to
`decision-evidence.md` and its status to the table in §8.9.

### 8.0 State at handoff

- HEAD `09c4a54`, nothing pushed, no remote touched, no tag.
- `bun run check:offline`: **304 pass / 0 fail / 759 expect / 30 files**, tsc clean.
- Uncommitted: `src/host.ts`, `test/host-death.test.ts`, `test/host-process.test.ts`,
  `test/fixtures/fake-msp-host.mjs`, `.github/workflows/test.yml`, `README.md`,
  `package.json`, and the five decision docs.
- Every experiment from `decision-plan.md` is answered except E-D8 (needs a
  dispatch). Do not re-derive E-D1…E-D7; they are in `decision-evidence.md`.
- Open rows: U5, U11, U12, U13, U14, U15, U16, P1, P2, P3. Round 3 closes all of
  them except U16, which needs one owner action.

### 8.1 Decisions this round implements

Each line is the decision, the evidence behind it, and what it costs. "Owner
call" means the sentence is adopted from `decision-evidence.md` § Owner calls;
this plan adopts the recommended wording unless the owner objects.

| # | Decision | Evidence | Cost |
|---|---|---|---|
| D1 | Subscription-only positioning; unofficial; API-key users pointed at Meta's documented opencode provider at `api.meta.ai/v1` | Q1 accepted; F4; attestation enforcement | positioning already at `README.md:50-59` and `:179`; only the "unofficial" sentence is missing (D14) |
| D2 | **Three-clock watchdog**, default on, `0` disables each: first byte 900 s, inter-chunk idle 180 s, no total deadline, warn at 90 s idle | Hermes external-process treatment; paperclip idle-180/wall-1800; stream-watcher warn 90 | one module + tests |
| D3 | Progress means **substantive** frames only (item/delta, item lifecycle, approval, tool call), never keepalives or view frames | Hermes counts substantive events only | part of D2 |
| D4 | Abort ladder: fail the turn as `timeout` → `turn/interrupt` with a 2 s budget → `host.close()` → next turn resumes the session, reseed only as fallback | E-D2 (interrupt hangs on a frozen host); E-D4 (close is the ladder); E-D9 decides the resume half | D2 + D5 |
| D5 | **Resume, do not reseed**, after a watchdog kill | E-D9 (this round); `history.ts:34`; E-D7 prices reseed at 2.4x | one wiring + test |
| D6 | **Refuse** repo-supplied Muse hooks (`handlerKind` `project` / `plugin`) at startup; allow `managed` / `user` | Codex #14718; Claude's `-p` hole; `hook/list` returns `handlerKind` | gate + trust record + tests |
| D7 | Hook trust is a per-repo record keyed to the **hash** of `.muse/hooks.json` under `project.canonical`, plus `MUSE_ALLOW_PROJECT_HOOKS=1` for one run | direnv hashes the file; Claude/Codex/Copilot/Gemini all persist per folder | one module + doctor command |
| D8 | **Doctor** now, shipped as a script, read-only, offline-capable, `--json` redacted, no repair, never executes PATH entries | `codex doctor` charter; `claude doctor` read-only | one script + tests |
| D9 | Allowance warning once per **5-hour window** at 90 %, from `usage/read`, no model call; `MUSE_ALLOWANCE_WARN_PERCENT`, `0` disables | E-D6 (`usedPercent` + resets over the held connection) | one command + test |
| D10 | Denial keeps Muse's message verbatim and stays class `protocol` | E-D1; a denial is a client-identity mismatch, and `auth` would send users to re-login, which does not fix it | one README sentence |
| D11 | Fence sentence: approvals are opencode's; Muse runs `allowAll` because its only caller is this plugin | A20; P3 | one README sentence |
| D12 | Cache share stays internal; the measured range goes in the coverage basis | E-D7 / correction 1 | one doc edit |
| D13 | No telemetry; the ledger is the record and the doctor is the only inspector | U13 | one doc edit |
| D14 | Identity/terms paragraph: unofficial, not affiliated, sees no credentials, writes one ledger file | U14/U15 | one README paragraph |
| D15 | Platform support is what the matrix shows, nothing more | E-D8 | owner dispatch |

### 8.2 Experiments (approved)

All three run offline or cost one handshake. None spends allowance, none runs
`muse acp`, none adds a dependency.

| # | Question | Method | Pass means | Branch if it fails |
|---|---|---|---|---|
| E-D9 | After a watchdog kill, does a new host serve the same session without a reseed? | Extend `test/fixtures/fake-msp-host.mjs` with `freeze-after-start` and `resume-answer`; drive through the registry, not the raw connection | Second host receives `session/resume`, the adapter emits no reseed, the frozen pid is gone, frames from the old host are dropped | D5 falls back to reseed; D4 keeps the kill but the README says a kill costs a reseed |
| E-D10 | Does `hook/list` report `handlerKind` on the installed host, and does an empty repo return an empty catalog? | One handshake, no turn, **no hooks file created** (`scratch/hook-list.ts`, `zsh -lc`) | Rows carry `handlerKind` and `key`; empty repo → empty list | D6 falls back to file presence via `workspaceTrustHazards` (`src/plugin.ts:45`) plus a post-handshake confirm |
| E-D12 | Is the doctor output stable and secret-free? | Run `--json` twice on the same tree, diff; grep for credential shapes | Byte-identical except `asOf` fields; no token, no identity, no absolute home path | Redact harder before shipping; never ship the raw row |

**E-D11 is deliberately not run.** The 900 s first-byte budget is a literature
value (Hermes' ceiling for external-process providers), not a measurement on this
machine. Measuring a real first-token tail would spend allowance and would still
be one account on one day. Record it as inherited, not measured.

### 8.3 Phase W0 — docs truth *(no code)*

1. README: the fence sentence (D11), the denial sentence (D10), the telemetry
   sentence (D13), the identity paragraph (D14), and the D2/D4 behaviour under
   `## Limits of the seam` ("a host that stops answering is ended after the
   idle budget and the turn fails as a timeout").
2. `decision-coverage.md`: U11 basis gets the measured cached-read range, U13 and
   U14/U15 close as **D**, P1 and P3 close as **D** with the sentences above.
3. No test changes; still run `check:offline` at the end of the phase.

### 8.4 Phase W1 — hook gate *(D6, D7; E-D10 first)*

1. `src/hooks.ts` (new): `readHookCatalog(host)` → `{enabled, event, handlerKind, key}[]`
   from `hook/list`; `blockingHooks(rows)` → the `project`/`plugin` rows;
   `hooksDigest(path)` → sha256 of `.muse/hooks.json`; `readTrust` / `writeTrust`
   over `$XDG_STATE_HOME/opencode-muse/trust.json` (mode 0600), entries
   `{canonicalPath, hooksSha256, acceptedAtMs}`.
2. `src/plugin.ts`, after the handshake and before the first session: replace the
   warning at `:219-230` with a gate. Blocking hooks + no matching trust record +
   no `MUSE_ALLOW_PROJECT_HOOKS=1` → throw with a message naming the file, the
   hook `key`s, `bun run doctor --trust-hooks`, and the env var. Skills stay a
   warning: they are instructions, not commands.

   **Corrected by E-D10:** `hook/list` is per-session (`{sessionId}`), so the
   gate cannot run at plugin startup. It runs in `MuseHarnessSession.create`
   after `session/start` and before the first turn, and a refusal leaves the
   native session (one `session/leave`) instead of holding it open. The plugin's
   startup line is now informational, not the fence.
3. Tests (`test/hook-gate.test.ts`, offline, fixture gains a `hooks` mode that
   answers `hook/list`): allow `managed`/`user`; refuse `project`; refuse
   `plugin`; allow `project` when the trust record matches; refuse again when the
   hooks file changes after trust; env override wins; no hooks file → no refusal.
4. Add the file to `test:offline` in `package.json`.

### 8.5 Phase W2 — three-clock watchdog *(D2, D3, D4)*

1. `src/watchdog.ts` (new): `createTurnWatchdog({firstByteMs, idleMs, warnMs, onWarn, onExpire})`,
   pure timers, `touch(substantive: boolean)`, `stop()`. Thresholds from env
   (`MUSE_FIRST_BYTE_TIMEOUT_MS`, `MUSE_IDLE_TIMEOUT_MS`, `MUSE_IDLE_WARN_MS`),
   `0` disables; defaults 900_000 / 180_000 / 90_000.
2. `src/session.ts`: start it on `turn/start`, feed it from the notification path
   in `host.ts:323` through a `classifyProgress(method)` helper (item/delta, item
   lifecycle, approval/requested, tool call → substantive; everything else → not),
   and on expire run the D4 ladder. Reuse `interruptTurn` (`:900`) with a 2 s race,
   then `host.close()`; emit one `timeout` failure with code `host_idle_timeout`.
3. Tests (`test/watchdog.test.ts`, offline, millisecond thresholds): warn fires
   once at the warn mark; idle expiry after a substantive frame; no expiry while
   frames keep arriving; first-byte expiry on a silent host; `0` disables; the
   ladder calls interrupt then close in that order; a late frame after expiry is
   dropped.
4. Add to `test:offline`. No change to `runOnce`'s existing 120 s.

### 8.6 Phase W3 — resume after kill *(D5; E-D9)*

1. `src/session-registry.ts`: on host death or watchdog kill, re-attach the
   existing session id through the resume path in `history.ts:34` before any
   reseed; reseed only when resume reports the session missing.
2. Test in `test/host-process.test.ts` or a new `test/watchdog-resume.test.ts`:
   the four assertions in E-D9's pass column.
3. If E-D9 shows resume is not reachable after a kill, strike D5, keep the kill,
   and write the reseed cost into the README timeout paragraph instead.

### 8.7 Phase W4 — allowance warning *(D9)*

1. `src/allowance.ts` (new): `readAllowance(host)` → `usage/read`;
   `shouldWarn(usage, percent)` on `window.usedPercent`; message includes the
   percentage and `resetsAtMs`; once per window episode, keyed by `resetsAtMs`.
2. Call it once per session start (not per turn) in `plugin.ts`; log only, no
   toast (no UI surface in `@opencode/plugin` 2.3.2).
3. Test (`test/allowance.test.ts`): warns above threshold, silent below, once per
   episode, `0` disables, a `usage/read` failure is silent (never blocks a turn).

### 8.8 Phase W5 — doctor *(D8; E-D12)*

1. `scripts/doctor.ts`, run as `bun run doctor` (script entry in `package.json`),
   flags `--json`, `--offline`, `--trust-hooks`, `--forget-hooks`, `--all`.
   Sections: versions (plugin, SDK pin, host, schema drift), auth present yes/no
   (never the identity), containment switches, hook rows, trust state, ledger path
   and last-row counts, cache share, last timeout attribution, platform.
2. Rules from `codex doctor`: read-mostly, one row per check with a remediation
   line, `--json` redacted, no repair except the two explicit trust flags, never
   execute anything found on PATH.
3. Test (`test/doctor.test.ts`, offline): `--json` shape, redaction (no token or
   home path), nonzero exit when a check fails, `--trust-hooks` writes a record
   that W1's gate accepts, `--forget-hooks` revokes it.
4. Add `scripts` to `files` in `package.json` only if the doctor is meant to ship;
   otherwise document it as a repo tool and leave `files` alone.

### 8.9 Phase W6 — close the rows, verify, report

| Phase | Status | Evidence |
|---|---|---|
| W0 | done 2026-11-22 | README: fence, denial, telemetry, identity, timeouts, five env rows. Suite 304 |
| W1 | done 2026-11-22 | `src/hooks.ts` + gate at `MuseHarnessSession.create`; `test/hook-gate.test.ts` (16 tests). E-D10 recorded |
| W2 | done 2026-11-22 | `src/watchdog.ts` + ladder in `src/session.ts`; `test/watchdog.test.ts` (12). Suite 332 |
| W3 | done 2026-11-22 | `MuseHost.close()` resolves `gone`; `test/watchdog-resume.test.ts`. E-D9 recorded |
| W4 | done 2026-11-22 | `src/allowance.ts`, `MuseHarnessAdapter.readUsage`, one call in `plugin.ts`; `test/allowance.test.ts` (9) |
| W5 | done 2026-11-22 | `scripts/doctor.ts`, `bun run doctor`; `test/doctor.test.ts` (6). E-D12 recorded |
| W6 | done 2026-11-22 | Coverage H 33 · D 28 · X 1 · U 1; evidence "Decisions taken"; suite 348 / 890 / 35 |
| W7 | in progress | report delivered; commit waits on the owner |

1. `decision-evidence.md`: E-D9, E-D10, E-D12 results; strike the six Owner-call
   sentences and replace them with the adopted wording under "Decisions taken".
2. `decision-coverage.md`: recount and restate the header counts; U5, U12, U13,
   U14, U15, P1, P2, P3 move to **D** or **H**; U16 stays **U** with the dispatch
   note.
3. `decision-plan.md`: tick S8 and add S9 pointing here.
4. `bun run check:offline`; record pass/fail/expect/files. Any count change names
   its reason.

### 8.10 Phase W7 — owner gate

Report one line per decision and per experiment. Ask before committing; never
push, never tag. Five logical commits at most: docs truth, hook gate, watchdog,
allowance + doctor, decision records. The owner's remaining action is U16:

```
gh workflow run test.yml -R jond34/opencode-plugin-muse
```

Then read the three job results and write one sentence per OS into U16's basis.
Until that happens, U16 says "matrix configured, never run".

### 8.11 Risks carried consciously

| Risk | Mitigation in this plan |
|---|---|
| A false-positive kill loses a slow turn | 900 s first byte, 180 s only after tokens flow, warn at 90 s; `0` disables |
| The first-byte default is inherited, not measured here | Recorded as such (E-D11 not run); env-tunable |
| The hook gate breaks the owner's own repos | Trust record + env override + doctor prints the exact file and keys |
| `hook/list` drifts | E-D10 measures it; fallback is the existing `workspaceTrustHazards` file check |
| Trust follows a symlink or a monorepo root | Key on `project.canonical`, hash the file, re-ask on change |
| Doctor leaks a secret or a home path | E-D12 redaction test; no identity fields ever read |
| Windows kill semantics | The existing SIGTERM→SIGKILL ladder is the SDK's; E-D8 is the only evidence that will exist |
| Scope creep into ACP, telemetry, or a USD cap | §4 still applies; nothing here touches those |
