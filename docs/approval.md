# Approval posture: one gate, and why it stays that way

This plugin starts Muse sessions with `approvalMode: "allowAll"` and lets
opencode's permission engine decide every bridged tool call. That is a measured
posture, not an assumption that approvals do not exist.

## What Muse provides

Muse has four approval modes: `allowAll`, `promptUnmatched`, `onRequest`, and
`denyUnmatched`. A client selects a server-minted choice with a scope of `once`,
`session`, or `localPersistent`. Approvals are durable in v1 and do not expire.
MCP tools are not sandboxed: an approval governs whether a call may run, not what
the tool can reach.

The scope depends on the approval subject. A shell command-prefix grant carries
`workspaceRoot` and applies only inside that root; the Muse UI labels it “Always
allow in this workspace.” A `tool` grant carries `toolName` but no
`workspaceRoot`, and `localPersistent` means “saved in the local policy store.”
E57 observed that store applying an MCP tool rule in a second workspace. The
vendor text and E57 agree only because the two subjects have different scopes.

## What “Always allow” means

| Grant | Scope | Evidence |
|---|---|---|
| Muse shell command prefix | Workspace root, per the installed SDK | `ApprovalSubject` carries `workspaceRoot`; vendor label is “Always allow in this workspace” |
| Muse MCP tool name | User-local policy store; observed across workspaces | `tool` subject has `toolName` and no `workspaceRoot`; E57 |
| opencode saved approval | Durable project-scoped `allow` rule | opencode permissions docs |
| opencode `deny` | Always wins over a saved approval | opencode permissions docs |

The approval labels hide the first two scopes: “Always allow this MCP tool” does
not say “in every workspace.” Do not describe a Muse `localPersistent` grant as
an opencode saved approval.

## What opencode provides

opencode has its own ordered permission engine. Rules are `allow`, `ask`, or
`deny`; the last match wins, and no match means `ask`. MCP tools are named
`<server>_<tool>` for rules. An opencode saved approval is a durable,
project-scoped `allow` rule and never overrides a configured `deny`. It is a
different object from a Muse `localPersistent` grant. The bridge emits ordinary
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
then ran the same tool with no approval request. E57 repeated that Muse
`localPersistent` rule after closing the host and in a second workspace; both
sessions ran the tool with no approval. The rule was seeded from E48's recorded
store, so this is durability at name level, not a new approval-menu run. It is
not evidence that shell command-prefix grants cross workspaces. The evidence is
[`evidence/2026-11-25-e48.json`](evidence/2026-11-25-e48.json) and
[`evidence/2026-11-26-r30-e57.json`](evidence/2026-11-26-r30-e57.json).

## Update caveat (round 31)

E62 found that a plugin hook approval is not reliably re-checked across an
update on Muse 1.4.25. After approving `e62-probe`, changing only its hook
command, and running `muse plugins update`, `muse plugins inspect` reported the
capability as `modified` with `modified_definition_hash`. The next `muse exec`
still wrote the new marker and rewrote the trust record to the new hash with
`legacy_hook_trust_amnesty_applied: true`.

Treat a plugin hook approval as fresh-install evidence, not as durable across an
update. Round 32 separated the migration from the host:

| Situation | Result | Evidence |
|---|---|---|
| Fresh install | Hook is `review_needed` and does not run until `muse plugins approve` | E62, E65 Arm A |
| Update, amnesty flag absent | Changed hook ran without a new approval; the run wrote the amnesty pair | E62 |
| Update, amnesty pair seeded before install | Inspect says `modified`; the changed hook does not run; the stored hash and flags do not change | E65 Arm A |
| Private host, no approval in its config | A hook approved in the user's config does not run; inspect says `review_needed` | E65 Arm C |
| Private host with its own approval | `muse plugins update` re-runs a changed hook without a new approval | E65 Arm C |

So E62 was the one-time legacy migration, not a recurring update bypass: seeding
both amnesty records suppresses it. The bypass still reaches any Muse config
store, including a private host config, but only after an approval exists in
that store. The plugin writes a fresh private config per host process and never
approves or updates inside it, so a normal session has no live path; the
reachable consequence there is that the user's approval is inert.

The release is stopped pending P1/P2: block `plugin` origins, or accept the inert
production path with the caveat. Records:
[`evidence/2026-11-26-r31-e62.json`](evidence/2026-11-26-r31-e62.json) and
[`evidence/2026-11-26-r32-e65.json`](evidence/2026-11-26-r32-e65.json). This is a
Muse-side finding, not a claim that the plugin maps a Muse approval.

## Why the plugin still uses `allowAll`

The Muse local persistent rule removes a Muse refusal. It does not create a
surface that shows a Muse approval to the opencode user. The plugin has no tool
executor of its own; it emits a call into opencode's loop, where opencode
already gates and runs it. Without a way to present Muse's prompt as the only
gate, starting in `allowAll` avoids inventing a second, invisible policy layer.

## The double gate

Presenting `approval/requested` through `ctx.permission.assert` would put a
Muse gate in front of the opencode gate for the same call. A `once` choice at
the first gate leaves no durable grant for the second, so the user can be asked
twice. Choosing “always” may save an opencode rule and suppress the second
prompt, but that maps a Muse scope onto an opencode saved approval and silently
persists a rule broader than the user may have understood. A Muse
`localPersistent` MCP grant is broader still: it lives in the user's local policy
store and was observed across workspaces, so mapping it would need a visible
global-scope warning.

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
2. The mapping from `once` / `session` / `localPersistent` to opencode's
   `once` / `always` / `reject` is explicit and does not persist more than the
   user saw. A `localPersistent` MCP grant must not be mapped without a visible
   global-scope warning.
3. Denial and refusal are tested, including a host with no reviewer or no
   `:ask-me`.
4. A test pins “no second prompt” rather than leaving it to prose.

Until then, O16 A is the honest posture: one gate, opencode's, with Muse in
`allowAll`.
