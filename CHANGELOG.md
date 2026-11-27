# Changelog

## 1.3.0

### Fixed

- A turn that reached its agent's step limit now ends with a summary instead of
  a refused tool call. opencode marks the last allowed step with
  `toolChoice: "none"` and appends a text-only instruction; Muse obeys that only
  when no turn is in flight, so after any tool result it kept calling tools and
  opencode refused each one, leaving an error card and no answer. The plugin now
  closes the running turn at that signal and delivers the instruction as a turn
  of its own (measured 12/12 on 2026-11-27; the previous behaviour was a refused
  tool call in 28/28 capped turns).
- A Muse turn can write again. The plugin no longer passes `--disable-write` or
  `--disable-shell` to `muse serve`. Both flags reach further than Muse's own
  tools: Muse reports the posture to the model, which then declined the same
  operation through the bridged tool opencode actually runs (on 1.4.25 Ember
  answered "filesystem writes are disabled in this session" and skipped
  opencode's `write`). The `run.toolset` allowlist is the fence, and the write
  itself is opencode's tool under opencode's permissions.

### Added

- `plugins[].options.sessionLog` (default on), with `MUSE_HOST_SESSION_LOG` as
  the non-erasable override. `false` passes `--no-session-log`, which removes
  Muse's native transcript and with it warm resume: every turn reseeds from the
  full prompt. Measured on a two-turn recall: 1,456 input tokens with the log,
  10,770 without (roughly 7x on a short conversation, growing with history). The
  resolved value is logged at startup, and an unparseable value is ignored
  rather than coerced.

### Changed

- Every Muse model declares a zero per-token price. opencode read the provider's
  `cost: null` as unknown and rendered a blank price; one all-zero tier renders
  "Free" for any provider, which is true of the price and false of the bill.
  Muse bills the subscription, not the token. The tier also stops core from
  computing a spend budget from a price that does not exist. Source-derived
  label, not an observed render: there is no TTY in the offline suite.

## 1.1.0

- `/connect` gains a `Muse Agent` row, shaped like opencode's own `claude-agent`
  integration: one external method, "Muse CLI login (`muse login`)". Connecting
  records the choice only. The credential stays with `muse login`, and the stored
  connection is `{"type": "external", "methodID": "muse-login"}` with no secret.
- The provider names that row with `integrationID: "muse-agent"`, so the picker
  and `/connect` share one identity. The provider id remains `muse`, and it stays
  `activation: "enabled"`, so the link cannot hide the models when no connection
  exists.
- Measured on opencode 2.4.1 on 2026-11-25: the row reaches `GET /api/integration`
  after plugin activation; `opencode auth login muse-agent --method muse-login`
  connects; one `muse/muse-ember-1.0` turn still completes. The user's
  `~/.config/muse/auth.json` and `settings.json` hashes were unchanged.
- The row now reports a login that has not happened. A read-only probe
  (`muse usage --json`, no model turn) distinguishes "not logged in" from
  everything else; only that answer sets a `needs_auth` status, which `/connect`
  renders as "Sign in required →". Offline, a timeout, or a renamed subcommand
  leaves the row untouched, and a successful login clears the status. The probe
  runs when the plugin starts with a saved connection and after a credential
  change, never during a turn, and it reads no token of its own.
- A finished turn updates the same status without running the CLI: a turn that
  fails for auth sets it, and a clean finish clears it. That notices a login
  that expired mid-session, which a startup probe cannot. A turn verdict is
  always newer than a probe already in flight, and the probe is cancelled when
  the plugin stops, so neither can outlive its purpose.
- The allowance warning no longer repeats a window that has already reset.
  `usage/read` answers from the observation the host holds, so an idle host (or a
  notice left behind by a failed toast) could carry a 95% window whose reset was
  days in the past; the line then named a number and a reset time that were both
  history. `checkAllowance` skips an expired window without claiming its
  warn-once key, and the TUI half drops an expired notice instead of showing it.
- The line now names the observation's age, e.g. `(observed 3h 05m ago)`, so a
  stale reading reads as stale rather than as current.

## 1.0.1

Documentation-only patch. No source, `dist/`, dependency, or export changes; the
`.`, `./tui`, provider id, `MUSE_*` variables, and model behaviour are the same as
`1.0.0`.

- The npm page now shows the same README as GitHub: the demo GIF, the quickstart,
  and the `opencode.jsonc` pin. npm renders the README from the published
  tarball, so this needed a version.
- `package.json` gains `homepage`, so the npm sidebar links to this repository's
  README next to the existing `repository` link.
- The install and config pins name `1.0.1`.

## 1.0.0

First stable release of the cleaned public tree, published on 2026-11-24. The
package name, `.` and `./tui` exports, provider id `muse`, documented `MUSE_*`
variables, and the install command are the compatibility promise; model ids and
vendor behavior remain data.

X9a passed on 2026-11-24 with opencode 2.4.1 and Muse CLI 1.4.25: a simple turn,
a bridged `shell` call, and a resumed turn all returned the expected nonce. X9b
then installed the published `1.0.0` and returned an exact nonce from a run that
loaded only that package. The package compiles against `@opencode/plugin` 2.3.2
and `@muse-code/sdk` 1.4.24; that pair was not live-run in this pass. On 2.4.1,
`opencode models` does not list the plugin-injected `muse/*` provider, but a
direct `opencode run -m muse/...` resolves it.

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
