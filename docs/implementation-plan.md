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

---

## 9. Round 4 — phase-aware deadlines, and the two records that don't reach

### 9.0 State at handoff

- `main` at `9c1dc6d`, 49 ahead of `origin/main`, no push, no tag. Suite
  **348 pass / 0 fail / 890 expect / 35 files**, `tsc --noEmit` clean.
- `docs/decision-coverage.md` is **modified and uncommitted**: the round-4 audit
  checked the four round-3 commits against `src/` and primary sources, closed 19
  of 20 rows, and opened five refs (U17, U18, U19, P5, P6) plus one D row (MCP
  Tasks), with one row reclassified D→X. Inventory is now **69 rows: H 33 ·
  D 28 · P 2 · X 2 · U 4**. That edit is this round's starting state, not a
  stray diff; V0 commits it with the corrections it needs.
- Everything U17/U18/P5/P6 asserts came from typings, vendor pages, and peer
  docs. **No live host was used.** Round 4 exists to convert those claims into
  measurements, and to fix the two that fail a turn a user was entitled to.

### 9.1 The one deviation this round retires

The spec says a sender should put a deadline on every request and that progress
resets it; Claude Code computes a per-request timer as the greatest of 60 s, the
server's own tool timeout, and `MCP_TIMEOUT`, with a separate idle window that
progress notifications reset; openclaw resets a model-idle window on keepalives.
This plugin runs **one 180-second silence budget across both the model phase and
the tool phase**, and the host offers no keepalive or progress frame at all. U17,
U18 and U19 are the three faces of that single sentence:

| Face | What the clock sees | What is actually true |
|---|---|---|
| U17 | 180 s of no frames | A bridged `tools/call` is executing in opencode; the host is waiting on **us** |
| U18 | 180 s of no frames | The provider is backing off; the host already told us so via `turn/modelRetryScheduled` |
| U19 | nothing | The wire has `session/declareExternalWait` and `task/background`; neither is used |

The fix is not a bigger number. It is: **the clock measures the phase it is in.**

### 9.2 Decisions this round implements

**D16 — split the budget by phase.** While a bridged call is in flight, the host
idle clock is suspended, because the host is not the suspect: we owe it a
response. The first-byte clock still bounds a host that never answers, and a
host that dies mid-tool is caught by the existing write-failure/host-death path.
No plugin-side tool deadline by default; `MUSE_TOOL_CEILING_MS` (default `0`,
off) adds an optional wall clock for users who want one. The host idle clock
resumes when the last bridged call settles.

**D17 — a retry is progress.** `turn/modelRetryScheduled` counts as substantive
and extends the idle deadline by `retryDelayMs` plus a 5 s grace, capped by
`MUSE_RETRY_CAP_MS` (default 600 000). The event carries
`attempt`/`nextAttempt`/`maxAttempts`/`retryDelayMs`/`errorKind`/`httpStatus`, so
the extension is derived from the host's own durable fact, not guessed. A chain
that never produces a frame still ends at the cap.

**D18 — declare the wait, do not background the call.** On the 0→1 transition of
bridged calls, send `session/declareExternalWait` with a reason built from the
tool names (`bash: npm test`); on 1→0, `session/clearExternalWait`. It is
live-only (a resume, restart, unload, or the next user input ends it), so it is a
status signal for the host's session view and the end-of-turn reminder, never a
durability claim. `task/background` is **not** used: it durably backgrounds a
running *Muse* tool task, and under the `empty` preset Muse has none; a bridged
call is an MCP request whose result this plugin must return, not a task the host
can move to the background.

**D19 — the hook gate covers `project` origin only.** `plugin` origin means a
handler contributed by an installed Muse plugin. Install scope is not review and
never approves a capability, but every scope installs into the user's own store —
"Nothing is written into the repository" — and a project-scoped plugin still
requires the user to trust the workspace and approve it. That is user-installed
code, not a file a repo plants, which is the thing the gate exists to stop.
`--trust-hooks` and `MUSE_ALLOW_PROJECT_HOOKS=1` keep their meaning for
`project`. The doctor lists every origin, so an installed plugin's handlers are
visible rather than silent.

**D20 — the allowance warning gets the surface the package already has.** The
server half cannot publish a toast (`Context.event` is subscribe-only; issue
#50984 records that v1's `client.tui.publish` has no v2 equivalent), but a
package's `./tui` part is loaded automatically with its server part — "One entry
loads every part. The TUI loads the TUI parts of the plugins its server loads." —
and it has `ui.toast.show`. So: the server half writes a small notice file beside
the ledger, the TUI part reads it at setup, toasts once per window, and clears
it. `console.warn` stays for headless runs.

**D21 — `allowAll` stays, and the record says why.** The vendor's guidance for
automation is `denyUnmatched`, and its justification for exposing `allowAll` is
the spawn boundary: "the client already holds the user's ambient authority."
This plugin is the only client, its native tools are off, and every bridged call
is executed by opencode through opencode's permission engine — the plugin holds
no tool executor of its own, so there is no private pre-check to bypass; the
gate is the host's. `test/bridge-denial.test.ts` already pins the denied case.
The asymmetry gets stated: MCP tools stay on through Muse while Muse's built-in
tools are pinned off, and subagents/workflows are off by containment.

### 9.3 Experiments (approved)

Each records its result in `docs/decision-evidence.md` under the same id, with
the command, the observed output, and the branch taken.

| Ref | Question | Method | Pass looks like | Branch if it fails |
|---|---|---|---|---|
| E-D13 | Does the idle clock kill a healthy turn during a bridged tool call? | Fixture mode `call-tool`: after `turn/started`, POST `tools/call` to the session's MCP URL, then stay silent; the test holds the tool promise past the idle window | Against `9c1dc6d`: turn fails `host_idle_timeout` while the tool is pending (the false kill). After D16: turn completes when the tool resolves | If the fixture cannot reach the bridge, fall back to a unit test on `watchdog.setBridgePending` and record the integration gap |
| E-D14 | Does a provider retry longer than the idle window look like a wedge? | Fixture emits `turn/modelRetryScheduled` (retryDelayMs 200) then a delta at 150 ms, idle 50 ms | Before D17: killed at 50 ms. After: survives, extension logged, delta delivered; a chain with no follow-through still ends at `MUSE_RETRY_CAP_MS` | If the host never emits the frame in practice, keep the handler but document it as unobserved |
| E-D15 | Does the host accept a declaration, and does it show? | Scratch script against the real host: `session/start`, `declareExternalWait`, `session/read`, `clearExternalWait`, `session/leave`. No turn, no model call | `declared: true`; `session/read` shows `externalWait` with the reason; cleared after | If `externalWait` is not on the read, keep the declaration (it still parks the reminder) and say the view half is unproven |
| E-D16 | Is a `plugin`-origin hook reachable by a repo without user action? | Vendor plugin-scope docs + fixture `hook/list` row with `handlerKind: "plugin"` | Docs say every scope installs into the user store and requires approval; gate allows the row | If a workspace path can install without approval, keep refusing and add identity trust (name + version + handler set) instead |
| E-D17 | Can this package ship a TUI part that toasts the warning? | Build `src/tui.ts` with `Plugin.define`; unit test `setup` with a fake `{ui:{toast:{show}}, client}`; check `exports` and the parts rule | `setup` calls `ui.toast.show` once for a fresh notice and not twice; `bun run check:offline` compiles it | If the TUI part does not auto-load from a package entry, keep log-only and say so in P6 |
| E-D18 | What actually gates a bridged call? | Read `test/bridge-denial.test.ts` and the `callTool` path in `session-registry.ts` | No executor in this plugin; a denied permission yields a tool error and no execution; the gate is opencode's | If the plugin executes anything itself, add a fail-closed check before the emit |

### 9.4 Phases

Work in order. `bun run check:offline` after each; baseline is 348 tests. New
test files go into `test:offline`. No new dependencies, no spend, no push.

**V0 — commit the audit and correct what is already false** *(docs only)*
- Commit the uncommitted `decision-coverage.md` audit as its own commit.
- Fix the two sentences it makes wrong: README's Containment bullet says
  `project` **and** `plugin` handlers are refused until hashed, which cannot be
  true for `plugin` (no file); and `src/hooks.ts`'s "2.3.2 has no dialog surface"
  comment is true of the server Context and false of the package (P6).
- Add the P5/P6 rows' "cheapest closure" once D19/D20 are decided.
- Gate: `check:offline` unchanged at 348.

**V1 — phase-aware clock** *(D16; E-D13 first)*
- `src/bridge.ts`: expose `pending(): number` (size of the existing `inFlight`
  map) on `ToolBridgeServer`; no new state.
- `src/watchdog.ts`: `setBridgePending(pending: boolean)` — while true, the idle
  clock does not fire; the first-byte clock still does; optional
  `MUSE_TOOL_CEILING_MS` arms a separate wall clock.
- `src/session.ts`: call it from the bridge request lifecycle (0→1, 1→0), and
  stop the ceiling on terminal.
- `test/fixtures/fake-msp-host.mjs`: `call-tool` mode.
- `test/watchdog.test.ts` + `test/watchdog-resume.test.ts`: false-kill repro,
  survival, host-death-during-tool, ceiling.
- README: the Timeouts bullet gains the phase sentence.
- Gate: suite grows by ~6; E-D13 recorded.

**V2 — retry-aware extension** *(D17; E-D14)*
- `src/watchdog.ts`: `extend(ms)` and the cap; `isSubstantiveProgress` includes
  `turn/modelRetryScheduled`; `src/session.ts` reads `retryDelayMs` and logs the
  attempt.
- Tests: survival across a retry, cap still ends a chain.
- Gate: +4; E-D14 recorded.

**V3 — declare the wait** *(D18; E-D15)*
- `src/session.ts`: `declareExternalWait`/`clearExternalWait` on the transition,
  reason from tool names, failures swallowed (a status signal must never fail a
  turn); skip when the host did not grant the method.
- Tests: the two commands are sent once per transition, and a rejected declare
  does not affect the turn.
- `scratch/external-wait.ts`: the live probe (gitignored).
- Gate: +3; E-D15 recorded.

**V4 — plugin origin** *(D19; E-D16)*
- `src/hooks.ts`: refuse `project` only; `plugin` passes; the refusal message and
  `doctor --trust-hooks` wording say "project".
- `scripts/doctor.ts`: print plugin-origin rows as `allowed (installed plugin)`.
- Tests: a plugin row passes, a project row still refuses, trust still works.
- Gate: +2; E-D16 recorded.

**V5 — the TUI surface** *(D20; E-D17)*
- `src/allowance.ts`: write `notices.json` (window `resetsAtMs`, percent, `at`)
  next to the ledger when it warns; clear on a new window.
- `src/tui.ts`: `Plugin.define({ id, setup })` — read the notice, toast once,
  clear; no-op when there is nothing or the file is unreadable.
- `package.json`: `"./tui"` export, `src` already in `files`.
- Tests: writer, reader, one-toast-per-window, malformed file is silent.
- README: one sentence in the allowance paragraph.
- Gate: +4; E-D17 recorded, with the live TUI check listed as not run.

**V6 — the positions, stated** *(D21)*
- README: MCP-on/built-ins-off asymmetry, subagents/workflows off and why,
  `allowAll`'s structural argument in one sentence.
- Coverage: the three B rows get D status and a basis pointing at the test and
  the vendor's spawn-boundary sentence.
- Gate: docs only.

**V7 — close out, verify, report**
- Coverage: U17→H, U18→H, U19→H (or D if E-D15 fails its view half), P5→D,
  P6→H; restate counts; keep U16 open.
- `decision-evidence.md`: E-D13–E-D18 results; add the adopted sentences to
  "Decisions taken".
- `decision-plan.md`: tick the new S10.
- README: test count.
- `bun run check:offline`; report one line per decision and experiment; stop
  before committing (the owner gate is U16's dispatch, which needs a push).

### 9.5 Phase status

| Phase | Status | Evidence |
|---|---|---|
| V0 | done, commit held | `src/hooks.ts` comment corrected; the coverage audit and every phase's docs are uncommitted pending the owner's approval (the prompt's "ask before committing" wins over § 9.4's V0 bullet) |
| V1 | done | E-D13; `ToolBridgeServer.pending` + `onPendingChange`, `watchdog.setBridgePending`, `MUSE_TOOL_CEILING_MS`; 5 tests. The repro used a fake host posting to the real loopback bridge rather than a fixture mode: same request, less process plumbing |
| V2 | done | E-D14; `turn/modelRetryScheduled` substantive, `noteRetry`, `MUSE_RETRY_CAP_MS`; 4 tests |
| V3 | done | E-D15 on a live host (declared/read/cleared) plus 2 tests; `task/background` not used, as decided |
| V4 | done | E-D16; `BLOCKING_KINDS` = `project`; doctor prints `(installed plugin)`; 2 tests (one replaced the old refusal test) |
| V5 | done | E-D17; `src/tui.ts`, notice in `src/allowance.ts`, `./tui` export; 5 tests. The part is a plain object typed by `Plugin.Definition` because importing the TUI runtime pulls `solid-js` |
| V6 | done | README containment bullet states the asymmetry and the structural `allowAll` argument; coverage rows cite the test and the vendor sentence |
| V7 | done | coverage `H 37 · D 29 · P 0 · X 2 · U 1`; evidence E-D13–E-D18; suite **363 pass / 0 fail / 928 expect / 36 files** |

### 9.6 Owner calls — product choices, not experiment outcomes

Each is a sentence the owner can accept or reject; the recommendation is what
the phases above assume.

| # | Choice | Recommendation | What changes if you say no |
|---|---|---|---|
| C1 | Tool-phase deadline: none, or a wall clock? | **None by default**, `MUSE_TOOL_CEILING_MS` for those who want one. opencode owns the tool's abort; a second deadline would fail work the user can still cancel in the UI | A default ceiling (30 min?) turns a hung opencode tool into a host kill; cheaper to reason about, worse to hit |
| C2 | Model-phase idle: keep 180 s? | **Keep.** With the tool phase split out, 180 s now covers only the model, where openclaw's cloud number is 120 s and self-hosted 300 s | 300 s is defensible if your own turns routinely think longer |
| C3 | `plugin`-origin hooks | **Allow** (D19): user-installed, approved, never written into the repo | Keep refusing: safer against a malicious marketplace plugin, but blocks the documented path and leaves P5 open |
| C4 | TUI toast | **Ship the `./tui` part** (D20): it auto-loads, so no new user step | Log-only: P6 stays open, and the warning reaches nobody in a TUI |
| C5 | Retry extension cap | **600 s**, env-tunable | Unbounded: a retry storm holds the turn forever; 120 s: kills legitimate backoff |
| C6 | Subagents and workflows | **Stay off** (containment), stated in README | Enabling them is a capability decision with its own containment review, not a patch |
| C7 | `declareExternalWait` default | **On**, best-effort | Off via env if a host build rejects it; the clock fix does not depend on it |

### 9.7 Out of scope (do not reopen)

MCP Tasks as a bridge mechanism, sampling controls, one host per spawning party,
a USD cap, the ACP shim, `task/background` for bridged calls, and any new
dependency. §4 still applies.

### 9.8 Risks carried consciously

| Risk | Mitigation |
|---|---|
| Suspending the idle clock hides a host that wedges mid-tool | The first-byte clock and the optional ceiling still bound it; a dead host is caught on the result write |
| The retry extension becomes a wedge-hider | Cap plus `maxAttempts` from the host's own frame; the cap is env-tunable |
| Allowing `plugin` origin is read as loosening the gate | Doctor prints every origin; the README says the gate covers repo-supplied files |
| A TUI part breaks users on an older opencode | It is a separate export; a load failure must not take the server half down |
| `declareExternalWait` fails on a host build | Swallowed; the clock fix does not depend on it |
| E-D13's fixture cannot speak MCP | Fallback unit test, and the gap is recorded rather than papered over |

### 9.9 Execution prompt (paste into a fresh session)

```text
Execute Round 4 in ~/repos/opencode-plugin-muse/docs/implementation-plan.md § 9.
Read § 9.0–9.8 first; that file is the state, not your memory. Work V0→V7 in
order, one phase at a time.

- Run `bun run check:offline` after every phase and keep it green. Baseline is
  348 pass / 0 fail / 890 expect / 35 files. Never weaken or delete an assertion.
  New test files must be added to the explicit `test:offline` list in package.json.
- Run the experiment a phase names BEFORE writing its fix, record the result in
  docs/decision-evidence.md under the same E-D id (command, observed output,
  branch taken), then implement. If an experiment fails, take the branch column
  in § 9.3 and record that instead of forcing the fix.
- Muse CLI work runs under `zsh -lc`, never `bash -lc`. No `muse acp`, no
  allowance spend, no new dependencies, no push, no tag, no publish.
- Tick § 9.5 as phases land, update docs/decision-coverage.md statuses and
  counts as rows close, and keep README true (it is the user-facing record).
- Stop at V7: report one line per decision (D16–D21) and per experiment
  (E-D13–E-D18), state the suite result, and ask before committing. The only
  owner gate is U16's CI dispatch, which needs a push.
