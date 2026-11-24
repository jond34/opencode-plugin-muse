# Changelog

## 1.0.0

First stable release of the cleaned public tree. The package name, `.` and
`./tui` exports, provider id `muse`, documented `MUSE_*` variables, and the
install command are the compatibility promise; model ids and vendor behavior
remain data.

X9a passed on 2026-11-24 with opencode 2.4.1 and Muse CLI 1.4.25: a simple turn,
a bridged `shell` call, and a resumed turn all returned the expected nonce. The
package compiles against `@opencode/plugin` 2.3.2 and `@muse-code/sdk` 1.4.24;
that pair was not live-run in this pass. On 2.4.1, `opencode models` does not
list the plugin-injected `muse/*` provider, but a direct `opencode run -m
muse/...` resolves it.

### Containment and private host configuration

- The plugin starts `muse serve` with a private config directory, so Muse's own
  skills, observer reminders, workflow triggers, context slimming, and foreign
  personal skills are off and opencode owns the context around the model.
- The bridge's toolset is pinned to `mcp__opencode__*`. Muse's own spawner tools
  stay outside it; every bridged call is emitted into opencode and crosses
  opencode's permission engine.
- Project-supplied Muse hooks are refused unless their exact hash is trusted
  with `bun run doctor --trust-hooks` or `MUSE_ALLOW_PROJECT_HOOKS=1` is set for
  one run. Installed plugin handlers remain allowed and are reported by origin.

### Known limitation

- A Muse plugin hook approved in your Muse config does not run in opencode
  sessions: the plugin starts the host with a private config, so the host sees
  no approval. A private config that holds its own approval is amnestied by
  `muse plugins update` on 1.4.25; this plugin never creates or updates one.
  `bun run doctor` reports an installed plugin handler with this limitation.

### opencode-owned context and native history

- Titles and compaction are answered inside opencode. Titles are derived from
  the first user message; compaction is a deterministic transcript digest, so
  neither spends a Muse turn.
- The visible transcript is fingerprinted. A rewritten or compacted history
  retires the native session and reseeds from the full prompt instead of
  silently continuing a different conversation.
- Native history remains opt-in. The digest is the fallback when it is off.

### Effort, prompt, and history boundaries

- A request's `model.variant` is resolved to Muse's closed effort vocabulary and
  sent as `reasoningEffort`; `default` omits the field, and an unavailable tier
  fails closed instead of falling to the lowest tier.
- Agent and instruction text travel as `SessionConfig.developerPrompt` on start
  and resume, so the first user turn is not prefixed.
- A primary request with no bridge tools fails before `session/start` with an
  actionable error. A rewritten history reseeds; the measured fork path was
  removed because it cost more input than a reseed.
- Images remain the only attachment kind. There is no PDF or text-file surface.

### Limits that did not change

- No Windows desktop parity. The runner matrix and installer checks do not
  become a desktop claim.
- No containment behind the bridge. opencode's permission rules are the gate,
  and `allowAll` remains the Muse-side mode.
- No per-turn cost cap, no offline path, and no native-history default change.
