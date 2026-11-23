# Round 6 — the approval layer, re-derived

Status: planned 2026-11-22, not started. Round 5 ended at `1ca55e7` with the
suite at 375 pass.

The prompt for this round is the review now sitting in
`docs/integration-landscape.md` §7–§8 (the owner's uncommitted edit; it is read
here, not modified). Its four claims are about the *approval* layer: that D21's
stated reason does not hold, that `allowAll` is pinned with no runtime switch,
that nothing survives a bypass, and that four knobs are missing rather than
declined. This round tests each against primary sources, then decides.

The previous rounds asked "what does the vendor's typings say". This one has to
ask "what does the vendor's *documentation* say", because three of the four
claims turn on behaviour the typings do not describe — profiles, the approval
judge, the sandbox, and the enterprise planes. That turned out to matter: the
vendor documents more than the typings imply, and two of the review's claims are
already false before any experiment.

## 1. What the sources actually say

All quotes below are from the vendor's own docs or the installed 1.4.25 CLI, not
from the typings alone. The docs are at `dev.meta.ai/docs/muse-code/{permissions,
configuration,agents,extending,workflows}`.

| Surface | What exists | Source |
|---|---|---|
| Permission profiles | Ask me / Auto-review / Unrestricted / Read-only; `permissions.default_profile` in `settings.json` | permissions, configuration |
| Approval mode | `on-request` (default), `untrusted`, `never` at launch; **on `serve` there is no flag** — "it is selected on the wire" | `muse serve --help` |
| Approval judge | A built-in reviewer that clears eligible requests; `--approval-judge on|off` | permissions |
| Sandbox | OS-level, independent of approval: "Each layer works on its own. If you disable one layer, the other stays in place." Refuses to run if it cannot enforce | permissions |
| Posture ceiling | "posture up to managed policy (the session-posture allowance)"; `--allow-session-posture`, `--allow-workspace-trust` | `muse serve --help` |
| Enterprise planes | `muse config validate --plane <defaults|policy>` and `muse config status --json`; active sources are `system_file`, both `absent` here | CLI |
| Agent definitions | `--agents <JSON>`: `description`, `prompt`, `model`, `effort`, **`tools`** (omit = every tool the lead has); no `maxTurns` field | agents |
| Child inheritance | "Workflow child agents inherit the lead session's effective tools and permission boundary. A child can narrow that toolset… but it cannot expand it." | permissions, extending |
| Run caps | `muse exec --max-model-steps <n>`; not on `serve` | configuration |
| Runtime switch | `session/setApprovalMode`, four closed values, returns `effectiveMode` with `completed`/`noop` | typings `msp.d.ts:187,2832` |

What the plugin does today, for contrast:

- `serveArgs` passes `--preset` (optional), `--contributor-mode`, `--trust-workspace`,
  `--disable-write`, `--disable-request-user-input` — and no sandbox or approval
  flag (`src/host.ts:73-82`).
- The private `settings.json` pins `run.toolset` to `mcp__opencode__*`,
  `workflow_trigger_mode: "off"`, the six observer reminders off, and both
  compaction thresholds to the window's edge (`src/host-config.ts:218-245`).
  It does **not** set `permissions.default_profile`.
- A bridge session refuses any `approvalMode` but `allowAll`
  (`src/session.ts:427-437`) and sets `allowAll` unconditionally (`:490`).

## 2. Triage of the review's four claims

Verdicts are for the claim as written. "Confirmed" means the review is right and
something must change.

| # | Claim | Verdict | Why | Consequence |
|---|---|---|---|---|
| 1 | D21's reason ("each would add a path that does not cross opencode's permission engine") does not hold | **Confirmed** | A child inherits the lead's *permission boundary* and cannot expand it (permissions, extending). A child's tool calls would be bridged calls, so they would cross opencode exactly like the parent's. The outcome (off) is still defensible; the reason is wrong | Rewrite the row and README sentence: subagents are off because their spawner tools are outside the toolset allowlist and each child is a billed call opencode cannot see in its history — not because they'd escape the gate |
| 2 | `allowAll` is pinned with no runtime switch, while all five vendors switch mid-session | **Half confirmed** | Muse exposes the switch (`session/setApprovalMode`, plus profiles and the judge). The plugin pins one value and never calls it. So it is our D, not an X limitation — and the review's framing ("the lever was never pulled") is right | D27: decide whether to switch, and on what signal. D30 reclassifies the row from "X lacks it" to "we declined it" |
| 3 | No layer survives a bypass; the plugin substitutes tool removal | **Half refuted** | The sandbox is an independent layer that survives approval bypass, and the plugin never disables it. It is *inert* here only because the toolset has no shell tool. The enterprise `policy` plane and the serve posture ceiling also exist | D29: state the real layering (allowlist → inert sandbox → managed policy), and add a doctor row for `muse config status` so an enterprise plane cannot change the assumptions silently |
| 4 | Structured output, turn/spend caps, in-process hooks and an admin lock are absent on X, not declined | **Confirmed for two, wrong for two** | Structured output: absent from typings (X). In-process hooks: file hooks + `managed_hooks_path` only (X). Turn cap: `--max-model-steps` exists on `exec`, absent on `serve` (X for our surface, offered elsewhere). Admin lock: the `defaults`/`policy` planes exist and cap posture (not absent) | D30 reclassifies four coverage rows; the admin-lock row becomes "exists, unused, member set undocumented" pending E-D28 |

One claim the review makes that this round should *not* adopt: that the missing
approval bridge is "the one mechanism every vendor ships and no one here built".
ACP and Claude both ship it, but both ship it for the case where the *guest owns
the tools* — the opposite of this plugin's shape (`integration-landscape.md` §7's
invariant). Whether the bridge is worth building here is D27's option D, and it
is a product question, not a gap.

## 3. Decisions

Each decision names the branch that the evidence picks, so no judgement is
deferred past the experiment.

### D27 — What approval mode does a bridge session use?

| Option | Steelman | Strawman | Cost |
|---|---|---|---|
| A. Keep `allowAll` | The toolset is `mcp__opencode__*` only, so no unmatched tool exists to allow; a mode that asks would park a turn nobody can answer | It is a blanket "yes" that survives any future widening of the toolset, and it is the value the field treats as a last resort | none |
| B. `denyUnmatched` | The field's `dontAsk`: deny what would prompt, no human needed. Denies a widened toolset instead of running it | If the bridge namespace has no matching rule, every bridged call is denied and the plugin is dead; a client may not supply rules (`msp.d.ts:2832`) | 1 turn (E-D24) |
| C. `onRequest` + judge | Muse's own reviewer clears safe calls; nothing parks | Double-gating: opencode decides, then a billed judge decides again, and the second gate knows less | 1 turn (E-D25) |
| D. `promptUnmatched` + bridge | The only mode that could surface a Muse-side approval to a human | Needs a surface that can answer it, and under the allowlist there is nothing to ask about | 1 turn (E-D26) |

Option D is additionally gated by product answer 2 (2026-11-22): an approval is
acceptable only if it is answered inside opencode's UI. A Muse CLI prompt or a
second window is a no. E-D26 therefore asks the sharper question — does the
request reach the bridge at all, and could a bridged answer settle it — and a
"no" to either closes D for good.

**Branch.** If E-D24 shows bridged calls still run under `denyUnmatched`, choose
**B** (deny by default, bridge namespace still works) and keep D as a documented
non-goal. If E-D24 denies the bridged call, run E-D28: if the policy plane can
grant the namespace, choose **B** with that requirement documented; if it cannot,
stay on **A** and write the evidence into the row. C and D are only chosen if the
owner answers yes to product question 2.

### D28 — Subagents

| Option | Steelman | Strawman |
|---|---|---|
| A. Keep off, fix the reason | No spawner tool exists under the allowlist; each child is an extra billed call whose own context opencode never sees; the invariant stays "one loop" | Gives up parallel work the vendor supports well, and the review is right that "off" was justified with a false premise |
| B. Enable with `tools: ["mcp__opencode__*"]` | Children can only reach the bridge, so every side effect still lands in opencode's history; `--agents` makes the tool list explicit | opencode would receive concurrent tool calls from a session it never spawned: ordering, approvals, and the one-writer rule all get murkier, and `subagentOrigin` only appears on approvals, which `allowAll` never raises |
| C. Enable with tools inherited | Simplest flag | Equivalent to B minus the guarantee: the child inherits the allowlist, so it can reach nothing else anyway |

**Branch (settled by product answer 3, 2026-11-22): A.** The owner's rule is that
opencode controls which subagents are spawned, not Muse. A static `--agents`
overlay is the opposite — the plugin decides the roster at spawn time and the
model picks from it. So the spawner tools stay outside the allowlist, the
corrected reason ships, and E-D27 is dropped: the product answer decides it, and
two paid turns would only measure a path we have decided not to offer. If Muse
ever gains a spawner, the shape that fits the rule is a bridged `spawn` tool
whose `agent` argument opencode chooses — recorded in D28's row as the condition,
not built.

### D29 — The layer that survives a bypass

The honest stack, once the sources are read: the **toolset allowlist** is the
fence that matters; the **sandbox** is independent and stays on but is inert
without a shell tool; the **enterprise planes** and the serve **posture ceiling**
can narrow everything above them and are invisible to the plugin today.

**Decision.** Keep the sandbox on (do not pass `--disable-sandbox`; it costs
nothing and becomes load-bearing the day a shell tool returns). **No doctor row**
(product answer 4, 2026-11-22: reading policy is not a doctor's job — the doctor
reports local health, and an enterprise plane is not local state). The planes are
documented as a stated limit instead: both are `absent` on this machine, and a
present one can narrow the posture without the plugin seeing it. Do not set
`permissions.default_profile`: a profile that gates tool calls would gate the
bridge, which is D27's question in another costume.

### D30 — Coverage reclassification

| Row | From | To | Evidence |
|---|---|---|---|
| Structured output | D, "no current path uses it" | **X** | No schema parameter on any turn or tool frame in `msp.d.ts` |
| Turn or spend cap | X | **X for `serve`, offered on `exec`** | `--max-model-steps` is documented headless-only |
| In-process host hooks | (absent) | **X** | File `hooks` block + `managed_hooks_path`; no callback registration |
| Admin lock | X | **D or H** after E-D28 | `defaults`/`policy` planes exist; member set undocumented |
| Approval judge | (absent) | **D** — we never turn it on | `--approval-judge on|off`; a billed reviewer between opencode and the model |
| Runtime mode switch | "no, pinned" | **D** — available, unused | `session/setApprovalMode` |

### D31 — Do we ever switch modes mid-session?

**Recommendation: no, and say why.** With one tool source there is nothing to
switch *to*: the mode governs tools Muse itself would run, and it runs none. The
condition that would reverse this is recorded instead: a second tool source
(a user MCP server surviving the fallback path, or subagents enabled under D28)
makes the mode meaningful, and at that point mirroring opencode's `plan`/read-only
state into `denyUnmatched` is the right mapping.

## 4. Experiments

All approved. Paid turns are bounded at four; free probes are unlimited.

| Ref | Question | Method | Cost | Decides |
|---|---|---|---|---|
| E-D23 | Does the runtime switch work at all? | `session/setApprovalMode` through all four values on a live session; record `effectiveMode.mode`, `outcome`, `source`; then restore | free | D31's premise; whether D27's options are reachable |
| E-D24 | Does `denyUnmatched` deny a bridged call? | Session with `approvalMode: denyUnmatched`, one prompt that calls a bridged tool; record whether the call runs, parks, or is refused, and what the host says | 1 turn | **D27's branch** |
| E-D25 | Does `onRequest` prompt on a bridged call? | Same, with `onRequest` and the judge off; capture any `approval/requested` | 1 turn | C's cost; whether double-gating is real |
| E-D26 | What would the bridge carry? | Same, with `promptUnmatched`; capture the request shape (`subject.kind`, `toolName`, `subagentOrigin`), and whether `approval/decide` can answer it | 1 turn | D's feasibility |
| E-D27 | Can a child reach the bridge? | `--agents` overlay whose agent has `tools: ["mcp__opencode__*"]`, prompt it to spawn one child; watch bridge traffic, the session record, and `hook`/item ordering | 2 turns | **D28's branch** |
| E-D28 | What does the policy plane accept? | Bisect `muse config validate --plane policy` over candidate members (empty settings validates; `approval_mode`, `run`, `tools`, `security`, `allowed_approval_policies` all reject). Stop when a member is found or the candidate set is exhausted | free | D30's admin-lock row; D27 option B's viability |
| E-D29 | Is `--max-model-steps` accepted by `serve`? | Pass it and read the error | free | D30's turn-cap row |

Method rules carried from round 5: one probe per question, the raw output pasted
into `docs/decision-evidence.md`, and no retry to make a result look cleaner. A
probe that cannot observe the thing (the round-5 window problem) is recorded as a
probe limitation, not as evidence.

## 5. Documentation work

- **`docs/decision-coverage.md`**: rewrite D21's reason; reclassify the six rows
  in D30; add rows for the approval judge and the runtime switch; restate counts.
- **`README.md`**: the Containment bullet (subagents reason), the approvals
  sentence (what the mode is and what it is not), a line that the sandbox is
  independent and inert here, and the Platforms section if E-D28 lands.
- **`docs/decision-evidence.md`**: a "## Round 6" section, one subsection per
  experiment, raw output included.
- **`docs/integration-landscape.md`**: the owner's edit; read only. If the round
  changes a verdict in it, note the correction in the coverage record instead of
  editing the file.
- **`scripts/doctor.ts`**: the `muse config status` row (D29) and any change D27
  forces.

## 6. Product choices — for the owner, after the evidence

These do not fall out of any experiment; they are taste, and each one changes
what the plugin *is*.

**Answered 2026-11-22.** The answers below are the owner's, recorded verbatim in
substance; they override the branches where they disagree with them.

1. **What is the promise?** — *"opencode is the gate"*. The point of the plugin
   is that people keep thinking in opencode's terms; anyone who wants Muse
   directly can use Muse. If a decision here is at odds with that, say so and
   defer.
   **Consequence:** the README's structural claim is the promise, and the security
   reading ("Muse cannot act outside opencode") is a consequence to state, not a
   promise to widen. Where D27's option B makes the *second* claim true cheaply,
   take it; where it would cost the first (a second gate the user must tend),
   decline. The at-odds check is written into D31's row: a mode switch only
   matters if there is a second tool source, which would itself be the promise
   breaking.
2. **May Muse ever ask a human?** — *yes, but only inside opencode's UI*; a Muse
   CLI popup or a trip to the Muse CLI is a no.
   **Consequence:** D27 option D survives only as a bridge that answers through
   opencode. That is now E-D26's exact question.
3. **Subagents as a feature?** — *opencode should control which subagents are
   spawned*.
   **Consequence:** D28 is A (off), and the condition for revisiting is a bridged
   spawn tool opencode calls by name, never a `--agents` roster the plugin picks.
4. **Should the doctor read enterprise policy?** — *no; "reading" is fuzzy for a
   doctor*.
   **Consequence:** D29 drops the doctor row and documents the planes as a stated
   limit instead.
5. **Is "no turn cap" acceptable?** — *the question was unclear; answered in the
   round-6 report.*
   **What it means:** a ceiling on how many model steps one turn may take before
   the host stops it — a spend and livelock guard. `muse exec` has one
   (`--max-model-steps`); `serve`, which is what this plugin drives, does not. So
   the only ceiling today is opencode's own turn and timeout budget. No action
   unless the owner asks for one.

## 7. Conditions for a confident recommendation

- **D27** is confident when E-D24 has run: if the bridged call survives
  `denyUnmatched`, B is a one-line change with a clear win. If it does not
  survive, confidence requires E-D28 to find a policy member that grants the
  namespace; without both, A stays and the row carries the measurement.
- **D28** is confident when E-D27 has run and the child's calls are visible in
  the bridge and the record. Without that, A ships with a corrected reason — a
  defensible outcome, not a placeholder.
- **D29 and D30** are confident now: they rest on the vendor's docs and the
  installed CLI, both quoted above.
- **D31** is confident now, and the reversing condition is written down.

What would change my mind: a policy-plane member that can pin the mode (then the
plugin could *require* `denyUnmatched` rather than choose it), or a `serve` flag
for `--max-model-steps` (then the turn cap row becomes a build item).

## 8. Phases

| Phase | Work | Gate | Status |
|---|---|---|---|
| R0 | Write this file's triage into the coverage record and README (D21 reason, sandbox line) | `bun run check:offline` green | done, 375 pass |
| R1 | E-D23, E-D29, E-D28 — the free probes | Raw output recorded | done |
| R2 | E-D24 with a control; E-D25/E-D26 skipped with the reason | Branch for D27 named | done, 3 paid turns |
| R3 | D27 implemented as the measured reason in `session.ts`, the refusal message, the test's assertion | Suite green | done |
| R4 | D28 recorded as A with the product rule (spawner tools stay out); no experiment | Row and README agree | done |
| R5 | D29 stated limit (no doctor row); D30 reclassifications, counts restated | Suite green | done |
| R6 | Evidence section written, README true, plan ticked | `bun run check:offline` green | done |
| R7 | Report: one line per decision and experiment, suite result, owner questions 1–5, ask before committing | Owner gate | this message |

Verification is the repo's own: `bun run check:offline` after every phase, and
`tsc --noEmit` is part of it. No new dependencies; no push; no `muse acp`.
