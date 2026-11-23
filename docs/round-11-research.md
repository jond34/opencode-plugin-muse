# Round 11 research — the fail-open clause, and what the neighbours do

External memory for round 11. Fetched 2026-11-23 with the search MCPs; every
quote below is verbatim from the page named. Nothing here is a claim about the
installed build unless it says so.

## 1. The vendor's own sentence (opencode.ai/docs/policies)

> Statements that fail validation are dropped with a warning in the server log
> and the rest of the list still applies. Check the log after editing a `deny`.

> When several statements match, the last one wins. There is no specificity
> rule, so put broad statements first and exceptions after them. **If nothing
> matches, the action is allowed.**

> Policies are binary, never prompt, and only ever tighten what permissions and
> providers would otherwise allow.

The action enum as published: `provider.use`, `tool.use`, `integration.connect`,
`integration.use`, `mcp.use`, `skill.use`, `plugin.use`, `websearch.use`.
Effects: `allow`, `deny`.

The enterprise page repeats the check: "Check the server log for warnings. A
statement that fails validation…" — so the vendor's own remediation for a typo
is *read the log*.

## 2. The managed case is worse than the local one (anomalyco/opencode#60252)

> When a policy action or effect is misspelled or is newer than the running
> version, OpenCode drops that statement and continues with the rest of the
> config. For example, `provider.ues` does not deny a provider. **Local config
> logs a warning; the remote config decoder filters unknown actions and effects
> without a diagnostic.**

That is a Console-delivered statement: dropped, and nothing is logged. The
issue asks for strict validation; it is open, created 2026-10-29, and not
shipped. This is the one place where the round's documentation cannot say
"check the log", because there is no log line to check.

## 3. The opposite choice, and its cost (github/copilot-cli#4349)

> Because the fetch fails, the CLI "fails closed": it then blocks **every**
> non-built-in MCP server configured in `~/.copilot/mcp-config.json`, including
> our two local project MCP servers and even the official `github-mcp-server`.

The trigger was a schema mismatch on one enum value (`"enable"` where the client
accepted only `"disable"`), and the only diagnostic was in a raw process log.

So fail-closed is not the safe default it sounds like: one unrecognised value
takes the whole tool surface away. opencode's fail-open costs a silent no-op;
Copilot's fail-closed costs a working configuration. Neither vendor surfaces the
failure where the user is looking. That is the honest comparison for the README,
and it is why the clause says "prove the deny by its effect" rather than "make
opencode stricter".

## 4. Convention in policy engines (OPA/Gatekeeper)

> Currently Gatekeeper is defaulting to using `failurePolicy: Ignore` for
> admission request webhook errors. The impact of this is that when the webhook
> is down, or otherwise unreachable, constraints will not be enforced.

The best-known policy engine ships fail-open by default and documents the switch
to `Fail` as a choice with consequences. Our position — fail-open is the norm,
the documentation must say so — matches the field rather than arguing with it.

## 5. Reload is watcher-driven, and the ignore list does not apply

opencode v2 plugin docs:

> Changes under watched config directories reload automatically. Server startup
> loads cached package plugins immediately, installs missing packages in the
> background, and checks unpinned npm and Git plugins for updates. Exact npm
> versions and full Git commit hashes stay pinned. Changes to unwatched local
> dependencies may still require restarting OpenCode.

anomalyco/opencode#55934:

> The `watcher.ignore` config key is declared in the opencode config schema but
> is never consulted for plugin hot-reload. Its only consumer applies `ignore`
> to config documents only, while the config-directory watcher and each plugin
> entrypoint watcher start unconditionally with fixed ignores, so
> `watcher.ignore` cannot suppress watching of a plugin directory or plugin
> files.

The same issue quotes the log shape: `watcher started path=.../.opencode
type=directory backend=inotify ignores=3` followed immediately by plugin
loading. Two candidate mechanisms for round 10's ten loads: one generation that
logs every plugin (the line is per plugin, not per generation), or several
generations from watcher events. The log can separate them without a new run.

The opposite design exists: Claude Code has an explicit `/reload-plugins`
("The new version loads in your next session, or after you run
`/reload-plugins` in a running one"), so a plugin author there can reason about
a load boundary. opencode's implicit reload is single-actor territory: the
plugin cannot tell a reload from a start.

## 6. Muse's managed plane is alive (musemuse.dev/docs/muse-code/changelog)

1.4.13 (the newest entry) mentions managed policy in its resume fix:

> When no safe reset exists, or managed policy forbids it, the chat refuses and
> asks you to start a new chat

and the same release ships "fails closed" security fixes elsewhere. So the plane
is neither abandoned nor new: it is referenced by current behaviour, while
`muse config validate --plane policy` on the installed 1.4.25 still accepts no
member that binds. Version check: round 8 measured 1.4.25, `muse --version`
today is `Muse Code 1.4.25 (1.4.25-R9361.1)` — no version change, so re-bisecting
the policy plane is not justified.

## 7. Measured on this machine, 2026-11-23

`opencode --standalone debug config` with a temp `XDG_CONFIG_HOME` holding three
statements — one valid, one with a misspelled action (`provider.ues`), one with
a misspelled effect (`denied`) — printed **one**:

```json
"policies": [{ "action": "provider.use", "resource": "muse", "effect": "deny" }]
```

So the invalid statements are dropped *before* `debug config` prints, and that
surface cannot be used to detect a typo. It can be used to see what will
actually be enforced, and to compare against what a file declares.

`opencode debug` has no policy subcommand (subcommands: `agents`, `config`,
`heap-dump`, `paths`, and the rest), and the CLI has no validate mode.

## 8. What this settles, and what it does not

Settles: the fail-open sentence is the vendor's own, the remote path is silent,
fail-closed has a real cost, reload is implicit and watcher-driven, and Muse's
plane is alive but still not expressible locally.

Does not settle: whether a count comparison between a file and `debug config`'s
per-source `info.policies` is faithful (E-D59); whether the ten loads are one
generation or ten (E-D57); anything about a Console workspace, which this
machine does not have.
