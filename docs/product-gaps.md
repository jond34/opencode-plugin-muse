# Product gaps: seven decisions, second pass

Internal, not published. Companion to `seam-review.md`, which answered twelve
client-side questions over two passes. The executable work order for the six
closures below, with decisions and acceptance tests, is
`bench/product-gaps-plan.md`; this file stays the rationale. A second reviewer graded items 1, 2, 6
and 7 "half considered" and left 3, 4 and 5 ungraded. This file re-checks all
seven against the code, the pinned SDK (1.4.24) and the 2026-07-28 spec, and
says what is settled, what is not, and what closing each gap costs.

Method: read the code paths; re-derived the wire facts from
`node_modules/@muse-code/sdk/dist/src/msp.d.ts`; checked the two protocol claims
against the published spec; and reproduced the two concurrency hypotheses as
scratch tests rather than arguing them. Both reproductions passed as written at
review time:

```
bun test scratch/gap-race.test.ts
  turn/start commands sent: 2 (guard claims the second is refused)
  terminals: ["t2"]
  openSession calls for one opencode id: 2; distinct sessions: true
```

`scratch/` is gitignored, so the experiment is a local record, like the rest of
the bench material. `bun test` still scans `scratch/`, so that file runs in the
default suite; `check:offline` names its files explicitly and is unaffected.
Nothing in `src/` was changed for the review pass itself.

Five of the six closures have since landed, one commit each: `d72ce21` (G2),
`7cb562c` (G3), `a5f6c9d` (G4), `fa6f915` (G5), `3d0bc30` (G1). Both
reproductions above are now red by design, which is why the scratch file is kept
and annotated rather than deleted: the live assertions moved to
`test/lifecycle.test.ts` and `test/view-gap.test.ts`. `check:offline` is 290
pass, 0 fail across 28 files. G6 (this record) was the last of the G register.

| # | Decision | Where it is recorded | Verdict | Closure |
|---|---|---|---|---|
| 1 | turnId from the ack | `seam-review.md` §1, `compatibility.md` §1 | half: ack is authoritative and used, `disposition` is never read | code (G4) |
| 2 | `ifBusy` / concurrent turn | `seam-review.md` §3 | half: the guard is check-before-await and does not hold | code (G3) + decision |
| 3 | delta reconciliation | `seam-review.md` §5, `compatibility.md` §5 | documented, but a missed start silently drops the completed item | code (G2) + doc |
| 4 | unknown tool names rejected | `seam-review.md` §6 | settled; stronger than the review assumed | doc line |
| 5 | missed notification replay | nowhere | gap: `view/gap` is dropped by the `default` branch | code (G1) + fixture + decision |
| 6 | per-key serialization | nowhere | gap: both keyed get-or-create paths race | code (G5) |
| 7 | live model catalog | `seam-review.md` §12 | settled for v1, but the restart contract is unstated | doc + decision |

## 1. turnId taken only from the ack — half

Settled: `startTurn` takes `result.turnId` when it is a string and falls back to
the minted `commandId`, which the spec says is the same value for a fresh turn
(`msp.d.ts:3883-3890`). The pre-ack mapping (`pendingStarts`, registered at
`src/session.ts:643-660`) is correct and is the part the first pass got right.

Not settled: `TurnStartResult.disposition` (`started | queued | steered`,
`msp.d.ts:3874-3885`) and `startedNewTurn` are never read. When Muse answers
`queued` or `steered`, `turnId` is **the turn that absorbs the input**, not a new
turn — the SDK's own doc says so. The plugin then maps a second host turn onto
the first native turn and overwrites `nativeToHost` (`src/session.ts:673-681`),
so the absorbing turn's `turn/completed` settles the wrong host turn and the
first one never gets a terminal. `startTurn` does not consult `status` either,
so a rejected admission that still carries a `turnId` would be treated as a
started turn.

This is the mechanism behind item 2. The ack read is not wrong; the ack is
under-read.

## 2. `ifBusy` / concurrent turn — half

Settled: Muse's `ifBusy` is `queue | steer | replace` (`msp.d.ts:1114`) — there
is no `reject` — and the plugin deliberately models one native turn per host
turn, so a local refusal is the honest semantics.

Not settled: the refusal is a check-before-await. `startTurn` scans `this.turns`
at `src/session.ts:633` and only writes the new turn at `:683`-`:697`, after
`await connection.command("turn/start", …)`. Two concurrent calls therefore both
see an empty turn table and both send `turn/start`. The reproduction shows two
commands and, with the `queued` ack from item 1, one stranded host turn:

```
turn/start commands sent: 2 (guard claims the second is refused)
terminals: ["t2"]        # t1 never reaches a terminal
```

The same window exists one layer up: `doStream` checks `live.hasActiveTurn`,
awaits `startTurn`, and only then calls `setActiveTurn(true)` 
(`src/language-model.ts:305-395`), so two overlapping steps on one opencode
session both choose "new turn" rather than "steer".

Reachability: opencode's current session loop runs one assistant step at a time,
and `runOnce` uses its own one-off session, so this is latent rather than
observed. It is still a contract-level defect: the adapter is exported, the
conformance harness drives it directly, and the docs state the guard as a fact.

Transient failure since closed. The reservation also exposed the *lost ack*:
`startTurn` deleted the reservation and every mapping on any throw, so a
transport that died after the host admitted the turn told opencode the step
failed while the host ran it. Its late `turn/started` and items then materialised
a phantom turn whose non-terminal reservation refused every later submit. A
non-`MspError` failure is now replayed once under the same `commandId` — the
wire's idempotency handle, with `Connection.command` refusing an ack that would
differ — and if that also fails the turn is retired as a tombstone rather than
deleted: late events resolve to the settled turn and are dropped, and the next
submit is accepted (`test/lifecycle.test.ts` §turn start admission).

## 3. Delta reconciliation — settled

Settled twice over. The completed frame wins, and deltas are never accumulated:

- A completion whose `item/started` was missed is not dropped: `onItemCompleted`
  synthesizes the started shape first (`src/session.ts:1406-1420` for messages,
  `:1440-1447` for tools), so `message.started` still precedes its completion.
- A completion whose deltas were missed is not empty: the converter counts the
  characters it streamed per message and appends the rest of `item.text` at
  completion (`src/convert.ts`, `test/convert.test.ts`). Nothing is buffered;
  one integer per message is the whole state.

The wire states the invariant the offset relies on: a field's deltas,
concatenated in cursor order, equal that field on `item/completed` "unless the
surface saturated" (`ItemDeltaParams.delta`, spec 14653 INV-005). Saturation cuts
the completed field, not the stream (`Item.truncated`), so the append is empty
exactly when the preview is already longer than the record.

## 4. Unknown tool names rejected — settled

Settled and correct: `tools/call` checks `bridge.listTools()` before dispatch
and answers an unknown name with JSON-RPC `-32602` (`src/bridge.ts:118-132`).
The 2026-07-28 tools schema puts unknown tool names under `InvalidParamsError`
and adds the distinction the review missed: **invalid tool arguments are
explicitly reported as tool execution errors with `isError: true`**, not as
`-32602`. So the bridge's split — unknown name is a protocol error, a throwing
tool is `isError` — is exactly the spec's two-mechanism rule. No code change.

The only gap is documentation: `seam-review.md` §6 justifies the choice by model
recovery, which reads like a preference. It is a requirement.

## 5. Missed notification replay — gap

The wire has a notification for this and the plugin drops it. `view/gap`
(`msp.d.ts:4221`) says push delivery dropped events, naming the undelivered
range as `after` (exclusive lower bound) and `next` (exclusive upper bound).
It carries `sessionId`, so `host.startRouting` routes it to the session sink,
where `handleNotification`'s default branch discarded it. `viewCursor` appeared
nowhere in `src/`. Closed by `3d0bc30`: `onViewGap` pages the range back and
buffers live frames behind the fill.

What can be lost is anything state-bearing: `turn/completed` (a step that never
finishes — live sessions have no timeout, unlike `runOnce`), `item/started`
(which item 3 then makes unrecoverable), `approval/requested`, `session/closed`.

The spec sanctions two recoveries: splice-fill (`view/page` forward from `after`
to `next`, buffering live events, discarding overlap) or re-anchoring through
`session/resume {cursor}`. Splice-fill is the smaller change here: the gap
carries its own lower bound, so no previously stored cursor is needed, and the
paged `UnframedViewNotification`s can be fed back through the existing handler in
order. Handlers key by item/turn/approval id, so a replayed overlap is
idempotent.

Not a gap on the other side: the tool bridge answers `GET` with `405`
(`src/bridge.ts:222-228`) and implements no replay. That is correct for
2026-07-28, which removed the standalone GET stream and `Last-Event-ID`
resumability; a bridge with no server-initiated messages has nothing to replay.

## 6. Per-key serialization — gap

Both keyed get-or-create paths were check-before-await at review time, and both
were reproduced:

- `SessionRegistry.get(openCodeSessionId, …)` reads `this.sessions` at
  `src/session-registry.ts:845`, then awaits the store and `openSession` before
  `this.sessions.set` at `:927`. Two concurrent `get` calls for one opencode id
  open two native sessions, and the second `set` overwrites the first — whose
  bridge and subscription pump stay alive, holding a second writer lease on the
  same Muse session.
- `startTurn` is the same shape (item 2).

Neither had a per-key chain, mutex or in-flight map. The `inFlight` map in
`src/bridge.ts` is keyed by JSON-RPC id for cancellation and does not serialize
anything. Both now exclude a second caller: `7cb562c` reserves the turn before
sending, `fa6f915` chains `get` per opencode id and lets `close` wait on it.

If the phrase meant per-request serialization on the bridge instead, that is
not a gap: each POST is independent and cancellation is keyed by request id
(`src/bridge.ts:263-275`), so concurrent tool calls are the transport's normal
case, not a hazard.

## 7. Live model catalog — settled for v1, undocumented

Settled: `model/list` is a query whose result is "a snapshot at call time: v1 has
no catalog subscription" (`msp.d.ts:1663`). `MuseHarnessProvider` lists once at
setup (`src/plugin.ts:268-280`), which is the only time opencode rebuilds its
provider registry. There is no event to subscribe to, so a refresh loop would be
polling with no contract behind it.

Not settled, and cheap: the user-visible consequence is unstated. A model added
or newly entitled in Muse appears only after an opencode restart. Two smaller
facts also go unrecorded: `listModels()` sends no `sessionId`, so no row is ever
flagged `isActive` (`msp.d.ts:1657-1661`) — harmless, since opencode tracks the
active model itself — and the four `MODEL_NAMES` labels are presentation only,
falling back to the catalog id.

## Closures, in risk order

| ID | Change | Size | Why first |
|---|---|---|---|
| G1 | Handle `view/gap`: splice-fill with `view/page` from `after` to `next`, dispatching each page event through the switch body; warn once per fill | ~40 lines + four tests | The only failure that silently leaves the plugin's view wrong, with no timeout to end a hung step |
| G2 | `onItemCompleted`: synthesise the item when the start was missed, emitting started-then-completed (messages, reasoning, tool calls) | ~20 lines + four tests | Turns a lost item into a delayed one; also makes G1's replay idempotent for items |
| G3 | Reserve the turn before sending, in the caller's tick, so the refuse-while-running guard admits exactly one start | ~10 lines + the scratch test promoted | Makes the documented guard true; the cheapest way to close item 2 |
| G4 | Read `disposition`: `started` means the ack names this submit's turn; `steered` folds the input into the running turn and `queued` admits it to one that launches later, so neither may be mapped onto this host turn | ~25 lines + two tests | Defence in depth for G3, and the correct reading of the ack for item 1 |
| G5 | Serialize `SessionRegistry.get` per opencode id; have `close` participate in the same chain | ~15 lines + the scratch test promoted | Prevents a duplicate native session and a leaked bridge |
| G6 | Documentation: this file; correct the two "cannot arise" claims; note the catalog restart contract and that argument errors are `isError` by spec | 3 files | Removes a false statement from the tracked record |

G3/G4/G5 are independent of G1/G2 and could land separately. None of them
changes a wire shape.

## Decisions for the owner

All four were resolved as defaults and are recorded in
`bench/product-gaps-plan.md`: splice-fill, refuse-and-steer, restart-only
catalog, no delta buffering. Each is reversible on its own.

1. **Item 5 recovery.** Splice-fill (recommended: no stored cursor needed, small,
   idempotent) versus `session/resume {cursor}` re-anchor (heavier, re-issues
   pending requests) versus accept silent divergence and only warn. Only the
   third is free, and it leaves the failure mode above.
2. **Item 2 semantics.** Keep refuse-and-steer (current, matches opencode) or
   implement real queueing (`ifBusy: "queue"`, read `disposition`, `turn/unqueue`
   on cancel). Real queueing is a feature, not a fix, and needs its own record.
3. **Item 7 refresh.** Accept restart-only catalog and document it, or add a
   `model/list` refresh when a session starts. The wire gives no subscription, so
   the second is polling; the first is what the spec supports.
4. **Item 3 empty completion.** Keep the documented risk, or buffer deltas per
   item as a fallback. Buffering costs memory on every item to cover a case not
   observed in a fixture.

## What this pass changed

- This file, plus a pointer from `seam-review.md`.
- `seam-review.md` §3: the claim that the guard "makes two unconfirmed acks
  impossible" is false under concurrent calls; it now points at G3 and the
  reproduction.
- `compatibility.md` item 1: the same "cannot arise" sentence, corrected.
- `scratch/gap-race.test.ts`: the reproduction above. Not part of the suite.

The review pass changed no source. The closures it proposed are separate commits
(`d72ce21` … `3d0bc30`), one per package, with the work order in
`bench/product-gaps-plan.md`; nothing was pushed.
