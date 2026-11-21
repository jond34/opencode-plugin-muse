# Compatibility

The architecture and subscription-boundary record is an internal document, not
published. This file tracks the wire and version contract only. The pins below are
the last tested pair (the internal W2 record, not published).

## Tested versions

| Surface | Version |
| --- | --- |
| opencode host | 2.3.2 |
| `@opencode/plugin` | 2.3.2 |
| `@muse-code/sdk` | 1.4.24 |
| Muse Code CLI | 1.4.24 |

The plugin compiles against the 2.3.2 plugin package and runs inside the 2.3.2
host. The `SessionRequest.messages` metadata field added in 2.3.2 is additive
and unused. Record the actual host version in every live run; do not generalize
from a version that was not run.

W2 evidence for this pair: `npm run check:offline` green (197 tests at W2; the
suite is 234 today, tsc clean),
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
session this is the common case; see `docs/native-history.md` open items.
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
