# Compatibility

This file tracks the wire and version contract. The dependency pins below are
the compile pins; the live X9a pair is recorded separately. The architecture and
subscription-boundary record stays in the local archive rather than the public
tree.

## Public API at 1.0

The promise is deliberately narrow: the package name, the `.` default export,
the `./tui` export, provider id `muse`, the documented `MUSE_*` environment
variables, and the install command. Model ids follow Muse's catalog and are data,
not API. Vendor SDK behavior, Windows desktop parity, remote Console policy, and
the native-history default are not promised.

## Tested versions

| Surface | Version | Role |
| --- | --- | --- |
| opencode host | 2.4.1 | live X9a/X9b, 2026-11-24 |
| Muse Code CLI | 1.4.25 | live X9a/X9b, 2026-11-24 |
| `@opencode/plugin` | 2.3.2 | compile pin |
| `@muse-code/sdk` | 1.4.25 | compile pin |
| `/connect` integration entry | 1.1.0 | measured on host 2.4.1, 2026-11-25 |

The plugin compiles against the 2.3.2 plugin package and the 1.4.25 SDK. X9a ran
it inside the 2.4.1 host on 2026-11-24: one simple turn, one bridged `shell`
call, and one resumed turn all returned the expected nonce. A standalone 2.4.2
TUI loaded this checkout on 2026-11-27 and completed a Muse turn, with the
variant picker and the derived title working; that is a smoke run, not a repeat
of X9a, so the tested-pair badge still says 2.4.1. The 2.3.2/1.4.25 pair is a
compile pin, not a live-tested pair in that run. On 2.4.1, `opencode models` did not list
the plugin-injected `muse/*` provider, but `opencode run -m muse/muse-ember-1.0`
resolved it and completed the turns; the models command is a display gap there,
not the provider proof. X9b then ran `opencode plugin add
@jonathand34/opencode-plugin-muse@1.0.0` in a redirected config directory and
returned an exact nonce from a run that loaded only that package. The record is
[`evidence/2026-11-24-r36-x9.json`](evidence/2026-11-24-r36-x9.json).

The `/connect` entry was measured separately on 2.4.1 on 2026-11-25: the
`muse-agent` row reaches `GET /api/integration` after plugin activation, and
connecting it stores a credential with `method: "external"` and no secret. The
provider names the same integration with `integrationID`; the provider stays
available because it registers as `activation: "enabled"`.

The login status was measured on the same host: with a connection and no CLI
login, the connection carried `status: {status: "needs_auth", message: "Muse is
not signed in..."}`; after a restart the boot probe restored it without a click;
and with the probe answering success (`muse usage --json` exit 0) the status was
absent. `muse usage --json` costs about 0.02 s when signed out and about 1.2 s
when signed in; a dead proxy produced a distinct "usage refresh failed
(transient)" message, which the probe treats as unknown. A finished turn updates
the same status without a probe: a turn failure classified as auth sets it, and
a completed turn clears it. An interrupted turn changes nothing.

The `SessionRequest.messages` metadata field added in 2.3.2 is additive and
unused. The policy vocabulary the 2.3.2 compile pin reads is `policies` (2.2.3
and newer).
`plugin.use`, `provider.use` and `tool.use` all take effect on 2.3.2 and were
measured on 2026-11-23 (E-D47–E-D49): a denied `tool.use` check fails with
`Blocked by configuration policy`, a denied plugin is not loaded, and a denied
provider is hidden. Clients older than 2.2.3 ignore `plugin.use`, `mcp.use`,
`skill.use` and the current meaning of `integration.use`, so anything relying on
them needs 2.3.2 or newer here. Record the actual host version in every live run; do not generalize
from a version that was not run.

The drop is local-visible and remote-silent. A statement that fails validation is
removed before `opencode debug config` prints the document, so the warning exists
only in the host's log output (E-D58, E-D59: three declared printed one; a
duplicate statement and `experimental.policies` both survive the print). The
doctor reads that output rather than the file (E-D62–E-D65): it spawns
`opencode --print-logs debug config`, so the diagnostics arrive on its own
stderr, and its `policies` row reports each one by pointer and action, saying
`ok` only when the stream carried a structured log line and reported no drop
(E-D70; empty output is `skipped`, never `ok`). A file the host refuses is absent
from `debug config` entirely, so a separate `config` row reports it once
(E-D64). Because attribution is the stream and not a list of paths, a rejected
file in any ancestor directory the host walked is reported as well (E-D66).
Those two rows are a gate by default: a `config` row, a `policies` warn, or a run
that could not read the config exits 1, while the rows about the machine stay
advisory (D69, D75, D82). `--no-strict` reports only; `--offline` does not look, so
it exits 1 unless `--no-strict` is also given (D83, D84).
That is a deliberate divergence from `claude doctor`, which reads the same
settings files, names a malformed file, and exits 0 even when the file was
discarded; on a misspelt key it is byte-identical to a clean run, while this
doctor names the dropped statement by `$.experimental.policies.N` and exits 1
(E-D91). `codex doctor`, the charter the row set follows, gates the same way, on
`Fail` only (E-D92). Both rows rest on `--print-logs`, which the vendor documents as a
debugging aid, and on message text — there is no structured diagnostics surface
upstream, which is what `anomalyco/opencode#60252` asks for (D73).
A Console-delivered policy
is decoded remotely, where unknown actions and effects are filtered without a
diagnostic (`anomalyco/opencode#60252`, open) — nothing here can observe that
path.

W2 evidence for this pair: `npm run check:offline` green (197 tests at W2; the
suite is 240 today, tsc clean),
the four live suites green (`model-live`, `restart-live`, `fork-live`,
`containment-live`), and a live handshake with no schema drift
(`sha256:b7fb9137267aa35c92424df37a5ac56287006a0e546b197bf0930d593fecbdb1`,
`sessionMcp` granted).

One manual gate pair on this pair (index 8) passed on a single source hash:
old kept the control and missed the out-of-window vault with one `rewrite`
reseed, new recalled both with one native row, one native window message, a
stable native id, and no reseed. That matches the baseline shape. The analyzer
reports `INCOMPLETE` (needs five per arm), which is its sample size, not a
contradiction; the confirmatory 34-session new-arm record remains the frozen
`bcfabcb` run: host opencode 2.3.2, `@opencode/plugin` 2.2.7 as the types pin,
`@muse-code/sdk` 1.4.15.

Earlier attempts are excluded: old index 6 echoed the reference filler
(`control_miss`), and old index 7 failed compaction on a `tool-result` part with
no `output` - a plugin defect, since fixed in `src/transcript.ts` with
regression tests.

SDK 1.4.24 types `model/list` rows as a closed `ModelCatalogEntry` instead of a
loose record. The rows were already camelCase on the wire, so the plugin needed
one type-only cast in `src/host.ts` (`listModels`) and no runtime change.

## Tested compaction configurations

The pin above is tested with these opencode compaction settings. Anything not
listed here is untested, not supported.

| Configuration | How it was run | Result |
| --- | --- | --- |
| `auto: true`, background at host default, `keep.tokens: 0`, `buffer: 50%`, 32k window | clamp plugin + 3 x 16k chars of padding; 3 new, 3 old | trigger `auto`, 1 compaction item, 1 native row, delta seed, no reseed, vault recalled (new) and missed (old) |
| `auto: true`, `background: false`, same window and keep | same, 3 new, 3 old | identical shape; the background precompute produced no duplicate item |
| `auto: false` (manual), `keep.tokens: 15000`, 72k chars of padding | 1 new, 1 old | new recalled the vault with 1 native row and no reseed; old missed it and reseeded |

Constraints found while testing, which belong to the contract rather than the
pins:

- A bare `.ts`/`.js` file in `plugins` is not evaluated; a local plugin must be
a package directory with `index.ts`.
- `compaction.background` is the 2.3.x key; `experimental.background_compaction`
is the 2.1.4 name and is ignored.
- A compaction that fires mid-turn (last prompt message is a tool result) gets
the summary only, no native window, and the next turn reseeds. In a tool-heavy
session this is the common case; the open items are recorded in
[`native-history-evidence.md`](native-history-evidence.md).
- With `keep.tokens` far below the retained view, the retained view can sit on
the threshold and compact repeatedly. The W1 runs used `keep.tokens: 0` in the
clamped window to avoid that artifact; 400 looped 26 times on the old arm.

Muse SDK versions move in lockstep with the CLI. Treat the pair as one
compatibility unit and upgrade them together.

## opencode contract

The native-history path relies on these behaviors:

1. A `compaction` hook may set `event.result` with `{ summary, native }`.
2. Core checks the hook result before making a compaction model call.
3. `native.messages` is a replacement window and is replayed instead of
   `summary`.
4. Replay is gated by the compaction item's provider id and model id matching
   the next request.
5. A malformed window is skipped at history read time, not rejected at hook
   installation time.

The plugin does **not** rely on `settings.compaction = native`. opencode 2.3.2
throws `UnsupportedCompactionError` for this AI SDK provider when that setting
is present, before the hook can answer.

Known upstream gaps that affect this design: provider-native compaction is not
the hook-window path; a bad window is validated late; there is no model-neutral
window; plugins do not control when compaction runs; and a shrink path can
restore text a compaction hook removed.

The session `title` hook is the local-title path. opencode calls it only while
its hidden `title` agent exists, so `agents.title.disabled: true` leaves every
session untitled; that switch is opencode-side, and the plugin does not override
it. When the hook runs the plugin always sets `event.result`, so
`agents.title.model` is never used for a Muse session and no Muse turn is spent.
The hook receives opencode's framed title request, not the raw first message:
the plugin unwraps the two framings it ships (first message, and the regenerated
conversation form) before deriving a title. If a future opencode changes that
wording, the title degrades to today's framing text rather than failing.

The doctor reads two CLI surfaces, both measured on 2.3.2. The `debug config`
shape was re-run on 2.4.2 on 2026-11-27 and still holds, and `--standalone`
before the subcommand worked in that TUI run; `opencode plugin list` and the
after-subcommand rejection were not re-checked and keep their 2.3.2 notes:

- `opencode debug config` prints one document per config source, each with its
  own `plugins` array and, for files, a `path`. It follows the cwd and respects
  `XDG_CONFIG_HOME`. A future release that changes this shape leaves the
  doctor's `plugins` row `skipped`, never wrong.
- `opencode plugin list` is not a resolver: even with `--builtin` it printed only
  configured local directories here, while the package loaded from
  `~/.cache/opencode/npm/…`. Do not build on it.

Global flags (`--log-level`, `--print-logs`, `--standalone`) must precede the
subcommand; after it, 2.3.2 rejects them.

## Muse contract

The plugin uses the narrow session/turn surface:

- `muse serve` as a stdio MSP host;
- one client and a writer lease per session;
- durable, event-sourced session logs by default;
- `session/resume` and `session/start`;
- turns, steering, interruption, token usage, and cancellation.

The plugin deliberately does not use Muse's goals, workflows, subagents, session
messaging, observers, or built-in tools. Those are disabled through the private
host config.

The native session is a cache. If it is pruned, locked, or unavailable, the
plugin falls back to opencode's transcript and digest rather than treating the
native id as authority.

## Adapter decisions at the seam

Five seam decisions: what the plugin does where the wire leaves a choice, or
where the adapter is deliberately more defensive than the wire. Each names the
failure it avoids and the evidence behind it. The wider client-side review —
turn ordering, queueing, tool errors, server requests, approvals, grants, and
the model catalog — stays in the local archive; this section keeps only the
choices that change observable behaviour at the seam.

1. **A turn ack without `turnId`.** The ack's `turnId` is authoritative
   (`msp.d.ts:3883-3884`); the command id is registered as the turn's native id
   *before* `turn/start` is sent, so a `turn/started` that arrives first binds to
   the same host turn through the event's `commandId` rather than minting a
   second one (`pendingStarts`, `startTurn`/`resolveTurnId`, `src/session.ts`).
   The ack then corrects the mapping if it names a different id. When the ack
   itself omits `turnId`, the command id stands in and is recorded as an
   assumption, adopted when the host later names the turn
   (`resolveTurnId`/`adoptTurnId`); the turn's `nativeRef` and every later event
   move with it, because the plugin needs an id for `turn/steer` and
   `turn/interrupt`. The two-unconfirmed-assumptions ambiguity cannot arise from a
   serialized caller: `startTurn` refuses while a turn is non-terminal (see item
   3). That refusal is check-before-await, so two concurrent starts both pass it
   and send two `turn/start` commands (product gap G3); the `size === 1`
   check is defence only. Covered by `test/lifecycle.test.ts` ("a
   turn/started before the ack binds by command id", "a turn ack without an id
   is reconciled when the host names the turn"). `turnId == commandId` for a
   fresh turn (`msp.d.ts:3889-3890`), so the fallback is an identity, not a
   guess; the adoption rule only matters if a host names a different turn than
   the one it acknowledged.

2. **Unknown notifications are ignored.** The dispatch `default` is `break`
   (`src/session.ts:839`). MCP requires the receiver not to respond to a
   notification (JSON-RPC 2.0: the server MUST NOT reply), and MSP adds kinds;
   throwing on one would take the chat down on a host upgrade. The switch
   covers the 15 kinds the adapter knows. The cost is silent loss of a new
   state-bearing kind, which is still better than a failed session.

3. **Approvals require a choice id.** `respondToRequest` sends
   `approval/decide` with the selected `choiceId` and the current
   `requirementId`; a missing option id is `invalid_input`, not a default answer
   (`src/session.ts:669`). Multi-stage approvals reject a decision that does
   not name a current choice, which is why `approval/updated` stores
   `currentRequirementId`. The harness contract's request response carries no
   decision kind, and this plugin never routes a Muse approval through
   `ctx.permission.assert`: doing so would put a second gate in front of
   opencode's for the same call (`docs/approval.md`). The compile pin does
   expose `permission` (`@opencode/plugin@2.3.2` has `storage`, `provider`,
   `aisdk`, `session`, `agent`, and `permission`), so the absence is a choice
   here, not a missing API. The wire choices do carry `decision` and
   `acceptsFeedback` (`msp.d.ts:45-51`). Both are copied onto
   `HarnessApprovalOption`, and `respondToRequest` refuses `feedback` unless the
   chosen option accepts it, because sending it otherwise is a protocol error
   (`msp.d.ts:142-152`). No caller in `src/` answers a runtime request: bridge
   sessions force `approvalMode: "allowAll"` (`create`; an explicit conflicting
   mode is refused), so Muse is not expected to ask. Answering one means calling
   `respondToRequest`, which is the host's job, not the plugin's.

4. **Cancellation stops the call and sends nothing.** The bridge keeps a map of
   in-flight request id to controller (`src/bridge.ts:83-99`). A
   `notifications/cancelled` aborts that controller and destroys the response,
   and a POST whose connection drops is treated the same way, so a tool that
   ignores the signal cannot leave the caller waiting. Both protocol eras are
   covered: up to 2025-11-25 the client cancels with the notification (the
   receiver SHOULD stop and SHOULD NOT answer the cancelled request); from
   2026-07-28 the notification is stdio-only and a Streamable HTTP client cancels
   by closing the POST, which the server MUST treat as cancellation.
   `HarnessToolCall.signal` (`src/contract/tool-bridge.ts:25`) carries the abort
   to the host, and the registry releases the parked call so it cannot leak
   (`src/session-registry.ts:861`). The opencode-side tool itself still runs —
   the plugin never holds its handle — so a cancelled mutating tool can finish
   after the user stopped it; only the wait and the response stop. The 202 is
   still returned for the notification itself (`src/bridge.ts:276`), which is a
   notification, not the cancelled request. Covered by `test/bridge.test.ts`:
   loopback bind, bearer rejection, initialize, and the cancel path. The
   turn-level path is separate and does stop Muse: `AbortSignal` aborts the step
   and calls `turn/interrupt` (`src/language-model.ts:413-421`).

5. **The completed frame wins, and the streamed deltas are its prefix.**
   Deltas are emitted to opencode and never
   accumulated; `item/completed`, or a terminal `item/updated`, is the only text
   stored, using `item.text` for messages and `item.visibleOutput` for tools
   (`src/session.ts:1429`). The characters the stream did not deliver are
   appended at completion: the converter keeps one integer per message, the
   count already streamed (`src/convert.ts`), so a reply whose deltas were missed
   still renders whole and one whose deltas all arrived renders once. Nothing is
   appended when the completed text is shorter than the stream, because the
   per-surface budget cuts `item.text` (`Item.truncated`) and the preview then
   already shows more than the record holds. `ItemDeltaParams.delta` (INV-005)
   is what makes the offset exact: a field's deltas, concatenated in cursor
   order, equal that field on the completed frame unless the surface saturated.   `test/fixtures/tool.jsonl:12-13` shows an
   in-progress `visibleOutput` that differs from the completed envelope, and
   `test/convert.test.ts` pins the message cases.

## Upgrade checklist

For an opencode upgrade:

1. Run `npm run check:offline`.
2. Run the live native-history gate against the new host.
3. Confirm the compaction hook still receives `event.messages`, can set
   `event.result`, and that the next request replays the window.
4. Confirm no `UnsupportedCompactionError` appears.
5. Record the host version and any schema drift.

For a Muse upgrade:

1. Upgrade the CLI and SDK together.
2. Run the live suites that exercise session start, resume, turn transport, and
   containment.
3. Confirm `session/resume` still preserves the native id and that a refused
   resume reports `resume_fallback`.
4. Re-check the host schema fingerprint and the containment report.

For either upgrade, do not turn on `MUSE_NATIVE_HISTORY` by default until the
out-of-window gate and the Gate B reliability count pass on the new pair.
