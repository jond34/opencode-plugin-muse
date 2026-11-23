# Round 7 — the residual ledger

Status: executed 2026-11-22. Round 6 ended at `7ce5721`; the round ran R0–R6 and
stopped at R7 for the owner's gate. Suite 376 pass / 0 fail / 970 expect / 37
files. Results are in `decision-evidence.md`, "Round 7 — the residual ledger";
E-D34 is blocked (the matrix workflow is not on the default branch), and E-D32's
first run was an instrument error that the corrected run and D34's fix supersede.

Round 6 answered a review's four approval claims. This round answers the reply
to `docs/integration-landscape.md` §8 — the "Against consensus" note — which is
what is left once the field comparison is done. It makes five statements, four
about what remains and one about a route that changed underneath the document.

The shape of the answer, stated up front so no phase re-litigates it: **three of
the five are right, one is right about this plugin and wrong about opencode, and
one is right about the world but wrong about what it means here.** Two sentences
in `README.md` do not survive contact with primary sources, and one detail in the
coverage record is simply wrong. No new product surface is proposed; the round
is corrections, one measurement, and one small fix that the measurement decides.

## 1. The note, verbatim

> **Against consensus.** The only real one left is the missing managed lock in
> Muse — and it's a lag, not a gap: the planes exist, the member vocabulary is
> empty at 1.4.25. Nothing here lets an admin forbid `allowAll`; the field lets
> one in four of four. That is a stated limit, not a fixable one.
>
> **Missing, and correctly so.** Sandboxing host-executed tools is the rung you
> don't have, and it belongs to opencode. Structured output and turn caps are X
> on `serve` (round 6 verified both against the CLI, which is stronger than my
> typings argument). In-process hooks are X. The approval bridge stays a product
> question, not a gap — the field's bridges exist for the guest-owns-tools shape,
> the opposite of yours. One route-level update worth your attention: opencode's
> ACP-client side has six upstream requests (one with PR #28994) and none
> shipped, but a third-party shim published 2026-11-21 drives opencode v2's TUI
> against any ACP agent including `opencode acp`. And
> `@agentclientprotocol/codex-acp` / `claude-agent-acp` are officially maintained
> wrappers around app-server and the Agent SDK. So "opencode can't be an ACP
> client" is now a statement about upstream priority, not about possibility —
> though opencode's own ACP README lists session-mode switching as unsupported,
> so the shim would carry less of opencode's control surface than your plugin
> does.

## 2. Triage

Verdicts are for each statement as written. "Confirmed" means the note is right
and something in the repo has to change.

| # | Statement | Verdict | Why | Consequence |
|---|---|---|---|---|
| 1 | The managed lock is a lag, not a gap; nothing lets an admin forbid `allowAll`; the field does it 4/4 | **Confirmed, and sharper** | `muse config validate` on 1.4.25: the `policy` plane accepts `{"schema_version":1}` and nothing else; the `defaults` plane accepts `model`, `telemetry`, `run.toolset`, `run.workflow_trigger_mode`, and every one of them reports `binds=defaults user_overridable=true`. So the plane that can bind has no members, and the plane with members cannot bind (§3.1) | The README's "a managed policy plane, when one is present, can narrow the posture above the plugin's sight" is false. Rewrite with the validator's own vocabulary. The G row keeps **X**, with a sharper basis |
| 2 | Sandboxing host-executed tools is the rung you don't have, and it belongs to opencode | **Confirmed for us, corrected for opencode** | opencode has no OS sandbox either: its permissions page says `shell` "runs with the host user's filesystem, process, and network authority" and recommends "a narrow shell allowlist"; a source audit of 2.0.29 finds no seatbelt, landlock, docker or devcontainer, and `Project.sandboxes` is directory bookkeeping. Its base policy for every agent starts `{"action":"*","resource":"*","effect":"allow"}` (§3.2) | The rung is absent on both sides, not deferred to a component that has it. The README's sandbox sentence is wrong twice: Muse's sandbox cannot cover a bridged call (opencode executes it), and opencode's containment is policy, not isolation. New **N** row |
| 3 | Structured output and turn caps are X on `serve`; in-process hooks are X | **Confirmed, one detail wrong** | The three X verdicts stand on round 6's CLI checks. But `turn/start` has **eight** members, not nine: `commandId`, `displayText`, `ifBusy`, `input`, `reasoningEffort`, `sessionId`, `userShell`, `workspaceRoots` (`msp.d.ts:3854-3871`). `tokenBudget` is an `Item` field on `workflow` runs (`:1347`, `:4398`), not a turn parameter (§3.4) | Fix the member list in `decision-coverage.md` and `implementation-plan.md:839`. The row's verdict does not change |
| 4 | The approval bridge is a product question, not a gap — the field's bridges exist for the guest-owns-tools shape | **Confirmed, and already decided** | D27 measured it: `denyUnmatched` refuses a bridged call because no policy rule can name an MCP tool. The note's reading of the field is the same one `integration-landscape.md` §7 reached. New supporting fact: opencode v2.0.29+ lets a plugin tool or a `tool.execute.before` hook call `ctx.permission.assert`, so opencode's native prompt *is* reachable — which removes "there is no surface" as an objection and changes nothing, because Muse has no tool of its own to ask about (§3.3) | No code. One sentence in the coverage row's basis so the next reader does not reopen it |
| 5 | "opencode can't be an ACP client" is now about upstream priority, not possibility; the shim carries less of opencode's control surface | **Half confirmed** | Confirmed: six requests, #28994's PR unshipped, and the shim is `pi-is314/opencode-acp-client` (npm `opencode-acp-client`, created 2026-11-21). **Wrong about the control surface:** the shim is TUI ↔ HTTP+SSE ↔ bridge ↔ ACP stdio, so opencode's *engine* is not in the loop at all — no tool registry, no permission rules, no transcript. It does not carry less of opencode's control; it carries none of it (§3.3) | Rewrite the ACP row and the README paragraph. Still **D**, with a sharper reason and a named reopening condition |

The one thing in the note this round should not adopt: that the shim "carries
less of opencode's control surface". It carries none, and that is the whole
argument against the route.

## 3. Evidence this round adds, already collected

These are recorded here so the phases do not re-derive them. They are raw
probes, run 2026-11-22 against Muse Code 1.4.25 and the published docs.

### 3.1 The managed planes, mapped

`muse config validate --plane <defaults|policy> --file <path>` on 1.4.25. Each
line is the validator's own output, trimmed to the verdict:

```
defaults {"schema_version":1,"settings":{}}                        -> valid
defaults {"schema_version":1,"settings":{"run":{}}}                -> valid
defaults {"schema_version":1,"settings":{"telemetry":{}}}          -> valid
defaults {"schema_version":1,"settings":{"model":"x"}}             -> valid: member=settings.model state=active binds=defaults user_overridable=true
defaults {"schema_version":1,"settings":{"run":{"toolset":[]}}}    -> valid: member=settings.run.toolset state=active binds=defaults user_overridable=true
defaults {"schema_version":1,"settings":{"run":{"workflow_trigger_mode":"off"}}}
                                                                   -> valid: member=settings.run.workflow_trigger_mode state=active binds=defaults user_overridable=true
defaults {"schema_version":1,"settings":{"permissions":{}}}        -> unknown_member location=settings
defaults {"schema_version":1,"settings":{"run":{"approval_mode":"untrusted"}}}
                                                                   -> unknown_member location=settings.run
defaults {"schema_version":1,"settings":{"run":{"contributor_mode":false}}}
                                                                   -> unknown_member location=settings.run
defaults {"schema_version":1,"settings":{"hooks":{}}}              -> unknown_member location=settings
defaults {"schema_version":1,"settings":{"mcp":{}}}                -> unknown_member location=settings
defaults {"schema_version":1,"settings":{"runtime_capabilities":{}}} -> unknown_member location=settings
defaults {"schema_version":1,"settings":{"session_retention_days":30}} -> unknown_member location=settings
policy   {"schema_version":1}                                      -> valid
policy   {"schema_version":1,"settings":{"run":{}}}                -> unknown_member location=settings
policy   {"schema_version":1,"settings":{"model":"x"}}             -> unknown_member location=settings
policy   {"schema_version":1,"settings":{"telemetry":{}}}          -> unknown_member location=settings
policy   {"schema_version":1,"settings":{"permissions":{"default_profile":"read-only"}}}
                                                                   -> unknown_member location=settings
policy   {"schema_version":1,"settings":{"allowed_approval_policies":["untrusted"]}}
                                                                   -> unknown_member location=settings
```

What that means, stated precisely:

- The `policy` plane — the one whose name implies a lock — has no member at all.
  A document that sets anything is refused before it can bind.
- The `defaults` plane has four usable members, and every one is
  `binds=defaults user_overridable=true`. A user settings file wins.
- The plugin's private `settings.json` **is** a user settings file
  (`src/host-config.ts:218-245`). So an admin's `run.toolset` default loses to
  the plugin's `mcp__opencode__*` pin: an enterprise cannot even narrow the
  toolset against this plugin on 1.4.25, let alone forbid `allowAll`.
- `permissions` is not a managed member on either plane, so the profile cannot be
  pinned by an admin either.

The note's "lag, not a gap" is the right reading. What is new is the direction of
the failure: not "the lock cannot forbid `allowAll`" but "the lock cannot bind
anything, and the plane that can bind is overridable by the very file this plugin
writes."

### 3.2 opencode has no bottom rung either

From `opencode.ai/docs/permissions` (read 2026-11-22, V2 vocabulary):

- "`shell` runs with the host user's filesystem, process, and network authority.
  Directory inference from command text is best effort, so prefer a narrow shell
  allowlist instead of patterns intended to recognize every dangerous command."
- "Every agent, including custom agents, starts with this ordered base policy:
  `[{"action":"*","resource":"*","effect":"allow"}, {"action":"read","resource":"*.env","effect":"ask"}, …]`"
- "Saved approvals are durable, project-scoped allow rules. They never override a
  configured deny." and "configured deny rules always remain enforced."

From a source-level audit of 2.0.29 (`cyber-stanny.github.io/agent-harness-lab`,
2026-09-07): the only "sandbox" concept in the tree is `Project.sandboxes`, a list
of directories opened outside the worktree, stored in SQLite; there is no
docker, devcontainer, Seatbelt or Landlock implementation, and the tool's
subprocess runs with the user's authority.

So the honest stack for a call Muse emits and opencode runs:

1. **opencode's permission rules** — the only gate. It is policy, not isolation,
   and its shipped base policy allows everything except `.env` reads.
2. **the `mcp__opencode__*` allowlist** — limits what Muse can ask for, not what
   the granted tools do.
3. **Muse's OS sandbox** — cannot apply: opencode executes the call, in
   opencode's process, and Muse's sandbox covers Muse's own shell, of which the
   pinned toolset has none.
4. **a managed plane** — cannot bind (§3.1).

What survives an opencode bypass (`--auto`, or a `*: allow` agent) is a
configured **deny** rule, and that is opencode's, not this plugin's. The note is
right that the rung belongs to opencode; the correction is that opencode does not
have it, so "belongs to opencode" is a statement about ownership, not about
coverage.

### 3.3 The ACP route, re-premised

- Upstream: `anomalyco/opencode` #28991 (ACP-backed agents in the native
  session/TUI), #5182 (TUI as ACP client), #24038, #18106, #35550, #51646 — six
  requests, all closed without shipping; #28994 is the PR attached to #28991 and
  did not land. `opencode acp` is the agent side only.
- The shim: `pi-is314/opencode-acp-client`, npm `opencode-acp-client`, created
  2026-11-21, binaries `opencode-acp-client` / `oc-acp-client`. Its README states
  the architecture: `opencode v2 TUI ──HTTP + SSE──▶ opencode-acp-client ──ACP
  stdio──▶ any ACP agent`, and "this project neither bundles it nor speaks for
  it". Measured agents include `opencode acp`, `dsh --profile acp`, `qwen --acp`,
  `claude-acp`, `codex-acp`. It refuses opencode v1.
- Consequence: with `oc-acp-client -- muse acp`, the TUI is a front end and
  Muse's loop, tools and approvals are the whole system. opencode's engine is
  absent, so its tools, its permission rules and its transcript are absent. That
  is the "guest owns the tools" shape `integration-landscape.md` §7 names as the
  opposite of this plugin's.
- `muse acp` exists on 1.4.25 (`muse --help`: "Serve the Agent Client Protocol to
  an editor over stdio") and is still out of scope here: the repo's rule is no
  `muse acp` runs, and nothing in this round needs one.
- Reopening condition: an ACP **client inside opencode's engine** that registers
  opencode's own tools as an MCP server to the agent. Then ACP is a peer to MSP
  and the comparison is worth redoing. A TUI shim is not that.

Also relevant, and new since round 6: opencode v2.0.29+ exposes
`ctx.permission.assert` to plugin tools and to `tool.execute.before` hooks
(`anomalyco/opencode#37164`, closed 2026-10-14; plugin guide "Permissions"), which
evaluates the session's rules, saved approvals included, and prompts when the
result is `ask`. That is the surface the approval bridge was said to lack. It
does not reopen D27: the prompt is opencode asking about an opencode-owned tool,
which is what already happens, and Muse has no tool of its own to ask about.

### 3.4 `turn/start` has eight members

`TurnStartParams` (`node_modules/@muse-code/sdk/dist/src/msp.d.ts:3854-3871`):
`commandId`, `displayText`, `ifBusy`, `input`, `reasoningEffort`, `sessionId`,
`userShell`, `workspaceRoots`. There is no `tokenBudget`; the identifier exists
as `Item.tokenBudget?: WorkflowTokenBudget` (`:1347`, interface at `:4398`) and
means a workflow run's launch budget. `session/start.config` is "Reserved for
future per-session overrides; only its `mcpServers` member is admitted"
(`:2928`), so there is no budget there either. The X verdict stands; the member
list in two documents is wrong.

## 4. Decisions

Each decision names the branch the evidence picks, so nothing is deferred past
the experiment.

### D32 — what the containment paragraph says

The paragraph today (`README.md:101-105`) claims two layers that do not exist:
"Approval is not the only layer: Muse's OS sandbox is independent of it and is
never disabled here, though it is inert while the toolset has no shell tool. A
managed policy plane, when one is present, can narrow the posture above the
plugin's sight."

| Option | Steelman | Strawman | Cost |
|---|---|---|---|
| A. Rewrite it as one gate + one allowlist + no isolation | True, short, and it stops the README from claiming cover it does not have | Reads as an admission; a reader may hear "unsafe" where the accurate word is "ungated by default" | docs |
| B. A, plus a copyable deny block | The only hard stop that survives `--auto` is a deny rule, and the field's own docs say so; a user who wants containment has nowhere else to get it | A README block is not enforcement, and it will drift from opencode's config vocabulary | docs |
| C. B, plus a doctor row reporting the rule mix it can see | Local state, which is the doctor's subject; a user learns their posture before a turn, not after | "Effective" rules include saved approvals the doctor cannot read, so the row would be an approximation unless it says which part it counted | code + test |

**Branch: B.** The two false clauses are the round's real finding, and a deny
block is the only actionable thing a reader can do about it. C is a product
question (§7.2), because it adds a surface the owner has not asked for.

### D33 — Muse's permission profile

Muse's default profile is **Auto-review**; `Unrestricted` is "no approval and no
sandbox, with the workspace trusted for the run. This is the same posture as
`--yolo`" (permissions page). The plugin sets `approvalMode: "allowAll"` and no
profile, so the profile is whatever `permissions.default_profile` says — and a
user who set `Unrestricted` has removed a layer the README says is on.

| Option | Steelman | Strawman | Cost |
|---|---|---|---|
| A. Qualify the sentence | True under every user config; no new failure mode | A caveat where a guarantee used to be | docs |
| B. Pin a profile on `session/start` | The wire admits it (`permissionProfile`, `msp.d.ts:2932`) and a start can name one the catalog serves | A profile id the catalog stops serving refuses the start (`permission_profile_unknown`), and the layer it would protect is inert for bridged calls anyway | free probe + maybe code |

**Branch: A**, unless E-D31 shows a profile that is both guaranteed present and
meaningfully different. Pinning for a layer that covers nothing would add a
failure mode to buy a sentence.

### D34 — the end-of-turn gate (U26)

Round 5 measured `eot_gate_ms: 8138` of silence, the host recording
`terminal: "completed"` at 36.7 s, and the plugin failing the same turn at 43.3 s
— 6.6 s after the host had finished. At the 180 s default this is harmless; it
bites when a gate outlasts the window. Whether the frame arrived late or was
dropped is not separated.

| Branch | If E-D32 shows | Then |
|---|---|---|
| A | `turn/completed` arrives after the plugin's kill | The plugin stopped listening early or the frame is genuinely late; stop the idle clock on the host's own end-of-turn signal, and let the frame settle the turn |
| B | `turn/completed` never arrives in the window | The host dropped it; extend the idle clock when the gate opens rather than stopping it, because silence is still silence |
| C | The probe cannot separate the two | U26 stays open with the timestamps recorded. Do not pick the tidier answer |

### D35 — the ACP route, re-premised

| Option | Steelman | Strawman | Cost |
|---|---|---|---|
| A. Keep the split; correct the premise | The shim replaces the engine, so the route cannot carry the invariant; upstream has no client; nothing to build | "Cannot" becomes "has not", which is a weaker sentence to write down | docs |
| B. Build an ACP client as a plugin | A second integration surface with a real protocol behind it | Two loops for one turn, and opencode's tools would have to be re-registered as an MCP server to the agent — the same bridge, over a protocol with fewer guarantees than MSP | weeks |
| C. Point users at the shim as the ACP answer | It exists and it works | It is `muse acp` with opencode's TUI: Muse's gate, not opencode's — the opposite of the product answer | docs |

**Branch: A.** The README paragraph becomes: opencode ships the agent side only;
six requests, none shipped; a community shim can drive the v2 TUI against any ACP
agent, but it replaces opencode's engine, so the route gives Muse's loop with
opencode's look. Reopening condition named in §3.3.

### D36 — the turn cap

| Option | Steelman | Strawman | Cost |
|---|---|---|---|
| A. Decline; whatever ceiling opencode puts on a turn is the ceiling | The wire has no step member and no budget member (§3.4), so a cap here would be invented policy; an interrupt mid-turn yields a partial answer with no record of why | A runaway loop bills until the caller gives up | none |
| B. Client-side cap: count `session/tokenUsage`, interrupt at N | Bounds the spend, and `turn/interrupt` is implemented and tested | It fires after the spend it was meant to prevent, and the turn it ends is the one the user was waiting for | code + test |

**Branch: A**, with the reversing condition written into the row: if `serve`
gains `--max-model-steps`, or the wire gains a budget member, the cap becomes a
build item. This is also a product question (§7.4) because it is a taste about
spend, not a fact.

## 5. Experiments

All approved (owner, 2026-11-22). Paid turns bounded at two; one is planned.

| Ref | Question | Method | Cost | Decides |
|---|---|---|---|---|
| E-D30 | What can a managed plane actually set? | Formalise §3.1: run the full candidate list on both planes, paste the validator's `member`/`binds`/`user_overridable` lines | free | D32's third clause; the G row |
| E-D31 | What profiles does the host serve, and can a start pin one? | `permissionProfile/list` on a live session, then `session/start` with one id; record the ids, their availability, and the start's answer | free | D33 |
| E-D32 | Is the end-of-turn gate a late frame or a dropped one? | One live turn with timestamps on `turn/completed`, the last substantive frame, the gate's start, and the plugin's kill | **1 turn** | D34's branch |
| E-D33 | Which sandbox flags does `serve` take, and does the plugin pass any? | `muse serve --help` for `--disable-sandbox` / `--sandbox-network` / `--disable-approval`; `grep serveArgs` in `src/host.ts` | free | D32's wording |
| E-D34 | Does the offline suite pass off Linux? | `gh workflow run test.yml` (gh is authenticated, `workflow` scope), then `gh run watch` / `gh run view --log-failed`; record the run id and the commit it tested | free | U16, with the caveat below |
| E-D35 | Does the shim replace opencode's engine? | Read `pi-is314/opencode-acp-client`'s README and its unimplemented-route list; no install | free | D35's reason |

E-D34's caveat, which the record must carry: `workflow_dispatch` runs a ref, and
`origin/main` is at `56d4ca0`, sixty commits behind local `HEAD`. A green run
therefore answers "does `npm ci` + `check:offline` work on macOS and Windows" for
that tree, not for the current one. That is enough to close U16's *mechanism*
question and not enough to claim the current suite was measured off Linux. If the
run is red, the failure is the finding and U16 stays open.

Method rules carried from round 6: one probe per question, raw output pasted into
`docs/decision-evidence.md`, no retry to make a result look cleaner. A probe that
cannot observe the thing is recorded as a limitation.

## 6. Documentation work

- **`README.md`**
  - Containment paragraph (`:101-105`): replace the sandbox and managed-plane
    sentences with the stack from §3.2 — one gate, one allowlist, no isolation,
    a deny rule as the only hard stop, and the profile caveat from D33.
  - Add the copyable deny block (D32 option B).
  - ACP paragraph (`:242-259`): "opencode is an agent, not a client" becomes the
    upstream-priority statement plus the shim's architecture, and the reopening
    condition.
- **`docs/decision-coverage.md`**
  - G/ACP row: new basis (§3.3); verdict stays **D**.
  - G/enterprise planes row: rewrite with §3.1's member map and the
    `user_overridable=true` fact.
  - C/`turn/start` member list in the structured-output row: eight members, and
    `tokenBudget` named as an `Item` field.
  - New C row: "OS isolation for a bridged call" — **N**, opencode owns it and
    does not provide it; first use of the N code, so the counts line changes.
  - New C row: "Muse permission profile" — **D**, not pinned, with the
    `Unrestricted` caveat.
  - Counts restated from the rows, not from this plan.
- **`docs/decision-evidence.md`**: `## Round 7 — the residual ledger`, one
  subsection per experiment with raw output, then the decision lines.
- **`docs/implementation-plan.md:839`**: the member list correction.
- **`docs/integration-landscape.md`**: the owner's file; read only. Where the
  round changes a verdict in it, note the correction in the coverage record.
- **`src/`**: only D34's branch, if E-D32 picks one. No other code.

## 7. Product choices — for the owner, after the evidence

These do not fall out of an experiment. Each is stated with a recommendation so
the answer can be "agreed" rather than a design session.

1. **What does "opencode is the gate" promise?** — The gate is real and every
   call crosses it, but opencode's shipped base policy allows everything except
   `.env` reads, and it has no sandbox. So the promise is *visibility and
   vetoability*, not *containment*. **Recommend:** say it in those words in the
   containment paragraph; keep the structural claim ("no private pre-check, no
   second loop") exactly as it is. If you meant containment, that is an opencode
   feature, and this plugin cannot supply it.
2. **How loudly should the plugin say the default posture is open?** — Options:
   nothing, a README block, a doctor row, a startup log line.
   **Recommend:** README block plus a doctor row, no startup noise. A doctor row
   here is local state (opencode's config on this machine), which is the
   doctor's subject — different from the enterprise plane you declined in
   round 6.
3. **Should the plugin pin Muse's permission profile?** — **Recommend:** no;
   qualify the sentence instead. The layer it would protect covers no bridged
   call, and a pinned id is a new way for a session to refuse to start.
4. **Is a client-side turn cap wanted?** — **Recommend:** no. It would fire
   after the spend it exists to prevent, and the wire has nothing to hang it on.
   Revisit if `serve` gains `--max-model-steps`.
5. **Is the ACP shim worth a separate product?** — **Recommend:** no. It is
   Muse's loop with opencode's TUI, which is the shape the product answers ruled
   out. It is, however, the only route where an approval can be answered in
   opencode's UI — because the approval would be Muse's, and the gate would be
   Muse's too. That is the tension worth knowing about, not resolving.

## 8. Conditions for a confident recommendation

- **D32 and D33 are confident now.** They rest on quoted vendor documentation,
  the installed CLI's own validator, and this repo's `emitToolCall` — no
  experiment can move them, only a Muse release that fills the planes.
- **D35 is confident now.** The shim's architecture is stated in its own README
  and is the opposite of an engine.
- **D36 is confident** as a decline, and is a taste call, so it is offered rather
  than asserted.
- **D34 is the one branch that needs the experiment.** If E-D32 separates late
  from dropped, the fix follows the branch table and ships in the same round. If
  it does not, U26 stays open with the timestamps recorded — that is a result,
  not a failure.
- **U16 is confident only about the mechanism.** A green matrix run on
  `56d4ca0` closes "the workflow works off Linux" and leaves "the current tree
  passes off Linux" to a dispatch after a push the owner has not authorised.

What would change my mind: a `policy` plane member that binds (then the plugin
could *require* a mode rather than choose it), a `serve` flag for
`--max-model-steps`, or an ACP client inside opencode's engine.

## 9. Phases

| Phase | Work | Gate | Status |
|---|---|---|---|
| R0 | The corrections that need no experiment: `turn/start`'s member list (two files), the ACP row and README paragraph | `bun run check:offline` green | done |
| R1 | E-D30, E-D31, E-D33, E-D35 — the free probes, raw output captured | Output recorded | done |
| R2 | E-D34: dispatch the matrix, record run id and commit; write the caveat | Run finished, result recorded | **blocked** — 404, workflow is not on the default branch; needs a push |
| R3 | E-D32: one paid turn with timestamps; name D34's branch | Branch named | done, twice — first run's instrument replaced the host router; second run is the record |
| R4 | D32's README rewrite and deny block; D33's caveat; D34's fix if the branch names one | Suite green | done — `turn/foregroundCompleted` counted, test fails without the line |
| R5 | D35/D36 rows; the two new coverage rows; counts restated | Suite green | done — counts also corrected four stale rows |
| R6 | Evidence section, README true, plan ticked | `bun run check:offline` green | done |
| R7 | Report: one line per decision and experiment, suite result, the five product choices, ask before committing | Owner gate | awaiting the owner |

Verification is the repo's own: `bun run check:offline` after every phase, with
`tsc --noEmit` inside it. No new dependencies; no push; no tag; no `muse acp`.
Scratch probes stay in the gitignored `scratch/`.
