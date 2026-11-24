# Changelog

## 0.1.13 — local candidate, not published

This entry describes the candidate built from the current tree. It is not a
published release.

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

See [`docs/release-notes/0.1.13.md`](docs/release-notes/0.1.13.md) for the
GitHub release-body draft.
