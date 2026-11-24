# Approval posture: one gate, and why it stays that way

This plugin starts Muse sessions with `approvalMode: "allowAll"` and lets
opencode's permission engine decide every bridged tool call. That is a measured
posture, not an assumption that approvals do not exist.

## What Muse provides

Muse has four approval modes: `allowAll`, `promptUnmatched`, `onRequest`, and
`denyUnmatched`. A client selects a server-minted choice with a scope of `once`,
`session`, or `locally-persistent`. Approvals are durable in v1 and do not
expire. MCP tools are not sandboxed: an approval governs whether a call may run,
not what the tool can reach.

## What opencode provides

opencode has its own ordered permission engine. Rules are `allow`, `ask`, or
`deny`; the last match wins, and no match means `ask`. MCP tools are named
`<server>_<tool>` for rules. A saved approval is a durable, project-scoped allow
rule and never overrides a configured `deny`. The bridge emits ordinary
`tool-call` events into opencode, which executes them under those rules.

## What E48 measured

E48 used the bridge's registered name, `mcp__opencode__bash`, in a Muse session
asking for `:ask-me`. The approval menu offered:

| Choice | Label | Decision | Scope |
|---|---|---|---|
| `allow_once` | Allow once | `approved` | `once` |
| `allow_session` | Allow for this session | `approvedForSession` | `session` |
| `allow_local_mcp_tool` | Always allow this MCP tool | `approvedPolicyAmendment` | `localPersistent` |
| `abort` | Reject | `abort` | `once` |

Choosing `allow_local_mcp_tool` wrote a `schema_version: 2` store with a
`tool_action` rule for `mcp__opencode__bash`. A second `denyUnmatched` session
then ran the same tool with no approval request. The saved-rule half is settled;
the evidence is [`evidence/2026-11-25-e48.json`](evidence/2026-11-25-e48.json).

## Why the plugin still uses `allowAll`

The saved rule removes a Muse refusal. It does not create a surface that shows a
Muse approval to the opencode user. The plugin has no tool executor of its own;
it emits a call into opencode's loop, where opencode already gates and runs it.
Without a way to present Muse's prompt as the only gate, starting in `allowAll`
avoids inventing a second, invisible policy layer.

## The double gate

Presenting `approval/requested` through `ctx.permission.assert` would put a
Muse gate in front of the opencode gate for the same call. A `once` choice at
the first gate leaves no durable grant for the second, so the user can be asked
twice. Choosing “always” may save an opencode rule and suppress the second
prompt, but that maps a Muse scope onto opencode's saved approvals and silently
persists a rule broader than the user may have understood.

The current API makes a one-prompt path harder than the old design assumed:

- `permission.assert` is a prompting operation. It evaluates the rules and
  prompts when the result is `ask`; it is not a non-prompting check.
- There is no `permission.allows` yet (`anomalyco/opencode#64787`, open).
- There is no race-safe, single-use admission exposed to plugins
  (`anomalyco/opencode#61645`, open), so an approval cannot be bound to the exact
  invocation the bridge is about to emit.
- Nested built-in and MCP tools still enforce their own permissions; a plugin
  tool enforces the permissions it asserts. That is the structural reason the
  same bridged call can meet two gates.

## What would change the posture

O16 B becomes implementable only after a measured one-prompt flow:

1. Muse's approval is presented once, and the subsequent opencode execution for
   that call does not ask again.
2. The mapping from `once` / `session` / `locally-persistent` to opencode's
   `once` / `always` / `reject` is explicit and does not persist more than the
   user saw.
3. Denial and refusal are tested, including a host with no reviewer or no
   `:ask-me`.
4. A test pins “no second prompt” rather than leaving it to prose.

Until then, O16 A is the honest posture: one gate, opencode's, with Muse in
`allowAll`.
