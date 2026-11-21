# Seam review: twelve client-side questions

Internal, not published. This is the answer to a review list about the plugin as
an MSP client: turn identity, event ordering, queueing, cancellation, streaming
reconciliation, tool dispatch, server requests, approvals, capability grants, and
the model catalog. Each item records what the code does now, the wire or spec
fact behind it, and the decision — and, for the seven gaps, the change that
closed it and the test that holds it.

Sources read for this pass: `src/session.ts`, `src/bridge.ts`, `src/host.ts`,
`src/session-registry.ts`, `src/capabilities.ts`, `src/language-model.ts`,
`src/contract/*`; the pinned SDK at `node_modules/@muse-code/sdk` (version
1.4.24, `dist/src/msp.d.ts`, `dist/src/connection/*`, `dist/src/facade/*`); and
the MCP 2026-07-28 specification (tools, error handling, client capabilities).

Legend:

- **covered** — implemented, and the reason is in this file or in
  `compatibility.md`.
- **documented** — a deliberate choice, no code change proposed.
- **gap** — behaviour differed from the wire contract or from the capability
  the plugin advertises. All seven gaps are closed in the second pass; each
  item names the change and its test.

| # | Item | Verdict | One line |
|---|---|---|---|
| 1 | turnId only from the ack | covered | The ack is authoritative by spec; the command id is a recorded fallback. |
| 2 | notifications buffered before the ack | covered | `turn/started` binds by command id before the ack; the ack corrects the mapping. |
| 3 | `ifBusy` / unqueued turns | covered | A second turn is refused while one runs; `supportsQueuedMessages` is false. |
| 4 | cancel reaches the host | covered | Step abort → `turn/interrupt`; bridge cancel → abort signal; pending tool calls released. |
| 5 | deltas reconciled vs final text | documented | The completed frame wins; deltas are never stored. |
| 6 | unknown tool names rejected | covered | An unknown bridge tool is `-32602` before dispatch. |
| 7 | unhandled server requests declined, not `{}` | covered | The two presentation requests are routed; everything else is `-32601`. |
| 8 | effective `approvalMode` enforced | covered | Closed union; a bridge session refuses any mode but `allowAll`. |
| 9 | `approval/requested` answered | documented | Nothing in opencode can answer; `allowAll` is the only safe posture (see 8). |
| 10 | deny carries read-only feedback | covered | Options carry `decision`/`acceptsFeedback`; feedback is gated on the chosen option. |
| 11 | granted capabilities validated | covered | The bridge starts only when `sessionMcp` was granted. |
| 12 | live model catalog | documented | `model/list` at startup; v1 has no catalog subscription, so no refresh exists to use. |

## 1. turnId taken only from the ack

Code: `startTurn` reads `result.turnId` when it is a string; otherwise it uses
the minted `commandId` and records the assumption (`src/session.ts:590-600`).
`resolveTurnId` adopts that assumption when exactly one is unconfirmed
(`:548-580`).

Wire: `TurnStartResult.turnId` — "The turn that will carry (or absorbed) this
input. Authoritative: always take it from the ack rather than deriving it"
(`msp.d.ts:3883-3884`). `TurnStartedParams.commandId` — "`turnId == commandId`
for fresh turns" (`msp.d.ts:3889-3890`).

Decision: taking it from the ack only is correct, and is what the code does. The
`commandId` fallback is not a guess about the id; for a fresh turn the two are
the same by contract, so the fallback can only be wrong if the host names a
*different* turn, which is exactly the case the adoption rule reconciles. The
fallback exists because a turn that cannot be addressed by `turn/steer` or
`turn/interrupt` is worse than one that is addressed under its command id.

`compatibility.md` item 1 currently says the wire is silent on this. It is not;
the correction is made in that file.

## 2. notifications buffered before the ack

Code: no buffering. `handleNotification` dispatches immediately; `startTurn`
installs the host-id mapping only after `turn/start` resolves
(`src/session.ts:584-610`). If `turn/started` arrives first, `resolveTurnId`
finds no mapping and creates a turn under the native id; the ack then creates a
second turn under the host id and leaves the first one pending forever.

Wire: the event carries the correlator. `TurnStartedParams.commandId` is "The
submitting command" (`msp.d.ts:3889-3890`). The SDK keeps its own pre-ack entry
for the same window, with the comment that "an entry created only on the ack is
invisible for exactly the window it exists to cover"
(`connection.js:276-284`). That is evidence the window is real, not proof that
Muse reorders the two frames — no recorded transcript shows an inversion.

Decision (implemented): `startTurn` registers `commandId → hostTurnId` before
awaiting the command, and `resolveTurnId` binds on `notification.params.commandId`,
so an early frame lands on the host turn instead of minting a second one. The ack
then re-keys the mapping if it names a different id, and a refused start removes
the provisional entry. This removes the need to choose between concurrent
assumptions, so the `assumedTurnIds.size === 1` rule is now defence only. Test:
`test/lifecycle.test.ts` "a turn/started before the ack binds by command id".
`compatibility.md` item 1 names the pre-ack mapping.

## 3. ifBusy / unqueued turns

Code: `startTurn` sends no `ifBusy` and reads no disposition
(`src/session.ts:584-610`). `MUSE_CAPABILITIES.turns.supportsQueuedMessages` is
`true` (`src/capabilities.ts:34`).

Wire: "Disposition when a turn is already running; default `queue`"
(`msp.d.ts:1113`). The ack says what happened: `TurnStartResult.disposition` is
`started | queued | steered`, and `turnId` is "the turn that will carry (or
absorbed) this input" (`msp.d.ts:3874-3885`). `turn/unqueue` exists to reclaim a
queued turn by its ack id (`msp.d.ts:3929-3936`).

Decision (implemented): `startTurn` refuses while any turn is non-terminal
(`unsupported`, "still running; steer or interrupt it first"), and
`supportsQueuedMessages` is `false`. opencode steers rather than submitting
while a turn runs, so a host follows the refuse-and-steer path; the alternative
would let Muse absorb the submit into the running turn while the plugin minted a
second host turn, stranding one. The guard also makes two unconfirmed acks
impossible, which retired the ambiguity test. Test: `test/lifecycle.test.ts`
"a second turn is refused while one is running".

## 4. cancel reaches the host

Code: step abort calls `live.interrupt()`, which clears buffered parts, rejects
a parked bridge call, and sends `turn/interrupt` with the explicit native id
(`src/language-model.ts:413-421`, `src/session-registry.ts:508-532`). A bridge
`tools/call` cancelled by MCP aborts the call signal and destroys the HTTP
response (`src/bridge.ts:83-99`, `:259-274`).

Wire: `TurnInterruptParams.turnId` — "prefer passing the explicit id when you
have one" (`msp.d.ts:3735-3743`). `retract` is a UI restore for a client that
owns the prompt text; opencode does, so the plugin does not ask Muse to retract
it. The bridge rules are recorded in `compatibility.md` item 4.

Decision: covered. The one missing case is a *queued* turn (item 3): it would
need `turn/unqueue`, not `turn/interrupt`, because interrupting the session's
foreground turn would stop the wrong work. That case cannot arise while item 3
is unfixed and opencode serializes prompts.

## 5. deltas reconciled vs final text

Code: deltas are emitted as events only; stored content comes from
`item/completed` or a terminal `item/updated`
(`src/session.ts:1055-1115`). `test/fixtures/tool.jsonl:12-13` shows an
in-progress `visibleOutput` that differs from the completed envelope.

Decision: documented in `compatibility.md` item 5. Deltas are not accumulated
because opencode already receives and stores them; a second copy would have to
choose between a replayed stream and the host's record. Residual risk: a
completion with empty text after deltas would store an empty message. Falling
back to accumulated deltas would require buffering every delta for every item,
which is the cost this design avoids. No change.

## 6. unknown tool names rejected

Code: `tools/call` normalizes the `mcp__opencode__` prefix and forwards the name
to `bridge.callTool`; a rejection becomes a `result` with `isError: true`
(`src/bridge.ts:118-149`).

MCP: unknown tools are protocol errors — `-32602`, `"Unknown tool: <name>"` —
not tool execution errors; execution errors are for values the model can correct
(modelcontextprotocol.io 2026-07-28, server/tools §Error Handling).

Decision (implemented): `tools/call` checks `bridge.listTools()` before dispatch
and answers an unknown name with JSON-RPC `-32602` ("Unknown tool: …"); `isError`
is left for a tool that ran and failed. Tests: `test/bridge.test.ts` "an unknown
tool is a protocol error, not a tool result" and "a known tool still
dispatches". This reverses the earlier preference for model recovery: a typo now
produces the protocol error the model can correct by re-listing, while a real
tool failure keeps its own channel. A fixture that called an unlisted tool was
updated to list it — under the new rule that call was itself the bug.

## 7. unhandled server requests declined, not `{}`

Code: `startRouting` registers `onServerRequest(async () => ({}))`
(`src/host.ts:264-267`). Every MSP server request — including a re-issued
`approval/request` or `userInput/request` after resume, and any method a newer
host adds — is acknowledged as presented and then dropped.

Wire: the `{}` is the MSP presentation receipt, "the client's response to a
server-initiated request (`approval/request`, `userInput/request`)"
(`msp.d.ts:2249`). An error response or a dropped connection means the request
could not be presented; it stays pending and is re-issued on the next subscribe.
Returning `{}` while doing nothing claims the opposite.

The SDK façade is the reference behavior: it routes `userInput/request` and
`approval/request` into the session, returns `{}` for those two, and throws
`MspError(-32601, methodNotFound)` for "every other server-request method"
(`facade/client.js:255-274`). The bare `Connection` already answers `-32601`
when no handler is installed (`connection.js:622-631`).

Decision (implemented): `answerServerRequest` in `src/host.ts` routes
`approval/request` to `approval/requested` and `userInput/request` to
`userInput/requested` on the session sink and returns `{}`; any other method, or
one naming an unregistered session, throws `MspError(-32601)`, which the
connection serializes as the error reply. MSP then re-issues the request on the
next subscribe instead of suppressing it. Tests: `test/host-requests.test.ts`.

## 8. effective approvalMode enforced

Code: `approvalMode?: string` on the session input; the value sent is
`input.approvalMode ?? (toolBridge ? "allowAll" : undefined)`
(`src/session.ts:235`, `:366`). An explicit value always wins, including on a
bridge session, and nothing validates it.

Wire: the mode is a closed four-value set —
`allowAll | promptUnmatched | onRequest | denyUnmatched` (`msp.d.ts:187`). Muse
also has `session/setApprovalMode` and reports the effective mode on the session
object (`msp.d.ts:809-816`).

Decision (implemented): `approvalMode` is the closed `AdapterApprovalMode`
union, and `create` refuses a bridge session with any mode but `allowAll`
(`invalid_input`, before any command); a bridge session's mode is forced to
`allowAll` regardless of the default. A non-bridge session keeps the host
default when the field is omitted. Tests: `test/lifecycle.test.ts` "a bridge
session refuses an approval mode it cannot answer" and the existing default test.

## 9. approval/requested answered

Code: `onApprovalRequested` stores the request and emits `request.updated`
(`src/session.ts:1124-1151`); `respondToRequest` can send `approval/decide`
(`:669-695`). Nothing calls it: the opencode plugin context has no permission
callback (`@opencode/plugin@2.3.2` exposes `storage`, `provider`, `aisdk`,
`session`, `agent`), and the conformance driver supplies no approval scenario
(`test/conformance.test.ts` implements `startToolTurn` only).

Decision: documented in `compatibility.md` item 3. Bridge sessions send
`allowAll`, so Muse is not expected to ask; the practical answer is opencode's
own permission dialog, which happens on the bridge's tool call, not on an MSP
approval. Residual, and the reason item 8 matters: if a host asks anyway, the
turn parks with no path to an answer except interrupt. `approval/listPending`
exists as a pull dual (`msp.d.ts:172-179`) but surfacing pending approvals would
only help a host that can answer them. No code change until item 8 lands.

## 10. deny carries read-only feedback

Code: approval options are copied as `{ id, label }` only
(`src/session.ts:1131-1136`); the contract's `HarnessApprovalOption` has
`id`, `label`, `warning` (`src/contract/entities.ts:82-86`).
`respondToRequest` attaches `feedback` whenever the caller supplies it
(`src/session.ts:669-698`).

Wire: each choice carries `decision` ("so a client can act on approve or reject
without knowing choice ids") and `acceptsFeedback` ("`true` when this choice
takes optional `feedback` text ... which reaches the model as guidance")
(`msp.d.ts:45-51`). Sending feedback on a choice that does not accept it is an
error (`msp.d.ts:142-152`).

Decision (implemented): `HarnessApprovalOption` carries optional `decision` and
`acceptsFeedback`; both are copied from the wire choice, and `respondToRequest`
refuses feedback unless the chosen option accepts it (`invalid_input`). Tests:
`test/lifecycle.test.ts` "approval options carry the decision and feedback
capability" and "feedback is refused on a choice that does not accept it".
`compatibility.md` item 3 records the addition. The opencode denial path was
already correct in the other direction: `execution-denied` reaches the model as
an error carrying the reason (`src/language-model.ts:75-79`,
`test/bridge-denial.test.ts:85`).

## 11. granted capabilities validated

Code: the handshake requests `sessionMcp` (`src/host.ts:173-176`); the grant is
read into `HostFacts` and used for a startup warning and for `MUSE_STRICT_HOST`
(`src/host-facts.ts:52-56`, `:97`). `MuseHarnessSession.create` starts the
bridge and puts `mcpServers` into `session/start` whenever a tool bridge is
present, with no check of the grant (`src/session.ts:335-365`).

Wire: `mcpServers` needs the grant. The SDK façade refuses locally before
sending: "a config naming no server needs no grant, as on the host
(ADR 32760 D3)", otherwise `MuseCapabilityNotGrantedError`
(`facade/session.js:98-107`). The plugin uses the bare connection, so it has no
such guard and lets the host reject the whole `session/start`.

Decision (implemented): `SessionHost` gained optional `grantedCapabilities()`
(`MuseHost` returns the handshake's grant), and `create` refuses a bridge session
without `sessionMcp` before starting the server or sending `mcpServers`. A host
double with no accessor skips the check, which is why the older bridge tests
still pass; the accessor is optional precisely because a replay host does not
model a handshake. Tests: `test/lifecycle.test.ts` "without the sessionMcp grant
fails before session/start" and "with the sessionMcp grant starts".

## 12. live model catalog

Code: `MuseHarnessProvider` calls `registry.listModels()` once during plugin
setup and builds the provider's model list from it
(`src/plugin.ts:270-280`); the adapter's `listModels` sends `model/list`
(`src/host.ts:198-205`). Contributor rows are read from the on-disk catalog and
merged (`:214-262`). `MODEL_NAMES` supplies presentation labels for four known
ids and falls back to the id (`src/plugin.ts:73-79`).

Wire: `ModelListResult` is "A snapshot at call time: v1 has no catalog
subscription" (`msp.d.ts:1663`). So there is no change event to subscribe to.

Decision: documented. The catalog is live at startup, not hardcoded; the four
labels are display-only. A model added to Muse while opencode is running appears
after a restart, which is also when opencode rebuilds its provider registry.
No refresh loop is possible in v1 and none is attempted.

## What changed

The first pass fixed three seams: ack reconciliation (1), real bridge
cancellation (4), and the dead `decision` field on the request contract. The
second pass closed the seven gaps above, in `src/host.ts`, `src/session.ts`,
`src/bridge.ts`, `src/capabilities.ts`, and `src/contract/entities.ts`:

1. Server-request routing (7): two methods routed, `-32601` for the rest
   (`answerServerRequest`, `test/host-requests.test.ts`).
2. Command-id correlation before the ack (2), with the old adoption rule left as
   a fallback (`test/lifecycle.test.ts`).
3. Refuse-while-running and `supportsQueuedMessages: false` (3), which makes the
   ambiguity rule unreachable (same file).
4. Closed `approvalMode` union and `allowAll` enforcement on bridge sessions (8).
5. `sessionMcp` gate before the bridge starts or `mcpServers` is sent (11).
6. `decision` and `acceptsFeedback` on approval options, with feedback gated on
   the chosen option (10).
7. Unknown bridge tools answered with `-32602` before dispatch (6).

Items 1, 4, 5, 9, and 12 needed no code change; their reasons are above and in
`compatibility.md`. The full suite is 252 tests, 0 failing, tsc clean, after
this pass. Residuals worth remembering: item 6 changes what a model sees on a
tool-name typo, so a live tool-loop check is still worthwhile; item 9's parked
approval remains impossible only while bridge sessions force `allowAll`; and
item 3's queued-turn case cannot arise while the guard holds, but a host that
submits from another surface would now be refused rather than queued.
