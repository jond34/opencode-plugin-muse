# Round 8 — the posture you cannot read

Status: planned 2026-11-22, not executed. Round 7 ended at `89e8e2b` with the
suite at 376 pass / 0 fail / 970 expect / 37 files and nothing pushed. This plan
answers the reply to round 7's report — the "Leaning against" note — and is the
input to `docs/round-8-prompt.md`. All experiments are pre-approved (owner,
2026-11-22); paid turns are bounded at two, and one is planned.

Round 7 answered a note about what was left and found two false clauses in the
README. This note is about what the plugin cannot *see*: the posture it runs
under, the admin layer that could outrank it, and any ceiling on a runaway turn.
It makes two structural claims, lists three missing pieces, rules one thing out,
and leaves three questions open.

The shape of the answer, stated up front so no phase re-litigates it: **two
structural claims are right and one is sharper than written; one of the three
"missing" items is a build, one is free because the doctor already owns a
connection, and one is wrong about opencode; the ruled-out item stays ruled out;
and the policy-plane question is no longer "empty or abandoned" but "the
behaviour ships and the document vocabulary does not".** The round's headline is
that contradiction, because it is the one fact the note says would flip the
admin-lock verdict, and the local evidence for it is now specific.

## 1. The note, verbatim

> **Leaning against — two real ones**
>
> 1. You can't read back the posture you're in. E-D31 is the most interesting
>    probe of the round: `permissionProfile/list` returns four profiles with
>    `reviewerAuthority`, `pin :read-only` persists across a `session/read`, and
>    it's all invisible to the plugin because it's behind
>    `capabilities.experimentalApi` and the plugin asks for `sessionMcp` only.
>    Codex gates the same surface behind the same capability name — "beta clients
>    that opt into `capabilities.experimentalApi` can pass a named
>    permission-profile id in `permissions` instead of the legacy sandbox field",
>    experimental clients "can read ... `activePermissionProfile`" — with the
>    same colon-prefixed ids (`:read-only`, `:workspace`). Two agent servers,
>    same door, same lock, and you're standing outside it. That's the one place
>    the design is structurally unlike the field rather than deliberately so.
> 2. An enterprise cannot bind you. 4/4 vendors ship an admin file that beats the
>    session; Muse's binding-capable plane is overridable and its policy plane is
>    empty. This is now the sharpest "at odds with consensus" item, and it's not
>    fixable in the plugin — only in a Muse release.
>
> **Missing**
>
> - A posture row in the doctor, with the honest caveat that it reports
>   configured rules, not effective ones (saved approvals are invisible). Round
>   6's decline was right about the approximation, not about the value.
> - Posture verification — a capability flag plus a read, one probe, no decision
>   changes.
> - A turn or spend ceiling anywhere in the stack. Muse's `serve` has no member;
>   opencode doesn't cap; so an unattended run has none. That's an X for the
>   plugin and an N-with-nobody for the host, which the field would call an
>   application concern.
>
> **Not missing, after this round:** isolation for a bridged call. It's absent on
> both sides and everywhere else, so it's a limit shared with the whole field,
> not a hole in your design.
>
> **Unclear**
>
> Whether Muse's `policy` plane is a schema-in-progress or abandoned — only the
> vendor can say, and it's the single fact that flips the admin-lock verdict.
> Whether opencode ever ships an ACP client inside its engine (six closed
> requests, one unshipped PR, one TUI shim that bypasses the engine). Whether
> `experimentalApi` buys a cheap read-back.
>
> **Doc state:** `docs/integration-landscape.md` is modified, uncommitted: ledger
> now at 17 knobs (added posture read-out and isolation-for-guest-tools,
> corrected bypass, managed plane, turn cap), two new sections on
> capability-gated posture and doctor-style posture reports, the three
> corrections above, and §9's ACP bullet re-premised. `bun run check:offline`
> green at `89e8e2b`; Markdown table columns verified uniform (18 rows × 7). The
> Claude/Codex/Copilot/Gemini claims are documentation-sourced — those CLIs
> aren't installed here. U16 remains blocked on the `workflow_dispatch` branch,
> which needs your push.

## 2. Triage

Verdicts are for each statement as written. "Confirmed" means the note is right
and something in the repo has to change.

| # | Statement | Verdict | Why | Consequence |
|---|---|---|---|---|
| 1 | The plugin cannot read back the posture it runs under; Codex gates the same surface behind the same capability name | **Confirmed, and sharper** | `host.ts:265` sends `requestedCapabilities: ["sessionMcp"]` and no `capabilities.experimentalApi`, so `permissionProfile/list` refuses and `permissionState` is null (§3.1). Codex's page says the gate verbatim, and PR #20095 shows what the read actually is: `activePermissionProfile` is *provenance* metadata, **cleared when managed requirements force a fallback** (§3.2) | The read is worth having for the reason the note doesn't give: it is how an override becomes visible. One decision changes (D38), and it changes to "the doctor's connection, not the user's" |
| 2 | An enterprise cannot bind this plugin; 4/4 vendors ship an admin file that beats the session; only a Muse release can fix it | **Confirmed about the plugin, corrected about Muse** | The four admin files are real and their precedence is stated in their own docs (§3.3). But Muse's *behaviour* ships: the 1.4.2 changelog describes a managed policy that restricts permission profiles, with `muse serve` refusing and listing the allowed profiles. What is empty is the **local document vocabulary**: twelve candidate shapes, top-level and nested, all `unknown_member` on 1.4.25 (§3.4) | The G row keeps **X** for "an admin can bind this plugin", with a basis that separates delivery from vocabulary. A new row for the refusal path, because that is the only way this plugin can meet the policy |
| 3 | A posture row in the doctor, reporting configured rules with the caveat that effective rules include invisible saved approvals | **Confirmed** | Round 6 declined on the approximation, and the approximation is still real: saved approvals are opencode's, not readable here. But the doctor already spawns a host and runs `session/start` (`scripts/doctor.ts:180-235`), so the row costs no new machinery (§3.5) | Build it (D37). Wording carries the caveat; the value is that a user learns the posture before a turn |
| 4 | Posture verification — a capability flag plus a read, one probe, no decision changes | **Confirmed, and cheaper than stated** | The capability is per-connection, and the doctor *is* a connection. `MuseHost.spawn` hardcodes the capability list (`host.ts:264-267`), so the change is one option and one branch, and the user's session keeps `sessionMcp` only | Folded into D37/D38. Not a separate surface: the doctor's own handshake carries the flag |
| 5 | No turn or spend ceiling anywhere in the stack; Muse's `serve` has no member and opencode doesn't cap | **Half confirmed** | Muse's `serve` has no step member (E-D29, unchanged). But opencode **does** have one: `agent.<name>.steps`, enforced on v2 by sending the last request with `toolChoice: "none"` and refusing a tool call at the limit (confirmed on 2.0.27, §3.6). Default is none. It lives in opencode's own prompt loop, which a bridged turn may never enter | The row moves from "X for the plugin, N-with-nobody for the host" to "N with a knob, off by default, and unmeasured for this path". E-D41 decides which sentence the row gets |
| 6 | Isolation for a bridged call is not missing — it is absent everywhere | **Agreed** | Round 7's N row already says this, and the owner's §8 sweep found the same answer in four vendors' own words | No change. The row stays N |

The one thing in the note this round should not adopt: that the stack has no
ceiling *anywhere*. It has one, it is opencode's, and the question is whether it
can see a turn this plugin drives.

The three unclear items, re-stated with what this round can and cannot settle:

- **The policy plane.** Narrowed, not resolved. The local document accepts no
  member on 1.4.25, and the product's changelog says a managed policy restricts
  profiles. Both are true at once, so the plane is not "abandoned": its
  *delivery* exists and its *local document vocabulary* does not. Which channel
  carries the shipped behaviour — cloud, MDM, a rollout gate — is the vendor's
  to say (§3.4).
- **The ACP client.** Unchanged. Round 7's verdict stands on the shim's
  architecture; nothing new was found.
- **What `experimentalApi` buys.** Answered statically and to be confirmed live:
  `permissionProfile/list`, `permissionState`, `modelIdRefusal`, and the
  `experimentalRequired` error kind that names the surface it refused (§3.1).

## 3. Evidence this round adds, already collected

Raw probes, run 2026-11-22 against Muse Code 1.4.25, the pinned SDK typings, and
the published docs. Phases must not re-derive these.

### 3.1 The handshake, and what the flag unlocks

- `MuseHost.spawn` sends `capabilities: { requestedCapabilities: ["sessionMcp"] }`
  and nothing else (`src/host.ts:264-267`). `grep experimentalApi src/` returns
  nothing.
- The pinned typings define the flag as a client capability, default off:
  "Opt into experimental methods, fields, and variants (default `false`)"
  (`msp.d.ts:497-499`), and the initialize result echoes the negotiated value —
  "Echo of the effective negotiated experimental setting" (`:1126-1127`), so a
  host that ignores the request is visible.
- The error taxonomy has a dedicated kind, `experimentalRequired`, whose payload
  names the refused surface, with `turn/start.providerRequestOptions` as the
  documented example (`:849`, `:902`). That method is separately ruled off the
  published schema (`:3853`), so the example is the one experimental field the
  vendor has refused outright.
- Experimental reads that are *not* the profile catalog: `modelIdRefusal` is
  served only to a connection that opted in (`:2804`), and the server publishes
  an `experimentalFingerprint` of its experimental-surface bundle (`:2300-2301`).
  So the flag is a real beta channel with a versioned surface, not a hint.
- E-D31 measured the refusal on this host: `permissionProfile/list` →
  "requires experimentalApi capability"; with the flag, four profiles are served
  and `:read-only` reports `filesystem: sandboxed, network: restricted,
  reviewer: human`.

### 3.2 Codex's same door, and what the read actually is

`developers.openai.com/codex/app-server`, read 2026-11-22:

- "Some app-server methods and fields are intentionally gated behind
  `experimentalApi` capability… If a client sends an experimental method or
  field without opting in, app-server rejects it with: `<descriptor> requires
  experimentalApi capability`." — the same sentence shape E-D31 recorded from
  Muse.
- `permissionProfile/list` is listed among the experimental methods: "list beta
  permission profiles and whether effective requirements allow them".
- "Beta clients that opt into `capabilities.experimentalApi` can pass a named
  permission-profile id in `permissions` instead of the legacy `sandbox` field.
  Don't send `permissions` and `sandbox` together."
- PR openai/codex#20095 adds `ActivePermissionProfile { id, extends,
  modifications }` and states the part that matters here: "Active profile
  metadata is cleared if managed requirements force the selected profile to fall
  back, so clients do not show a profile name for permissions that are no longer
  the selected profile's effective permissions." The built-in ids are
  `:workspace`, `:read-only`, `:danger-no-sandbox`.

So the read-back is **provenance, not authority**, and it is designed to go null
exactly when an admin layer overrides the pick. That inverts the reason to want
it: not "confirm the pin" but "notice when the pin stopped being true".

### 3.3 The four admin files, with their own words

| Vendor | File | Precedence | Key that forbids bypass |
|---|---|---|---|
| Claude Code | `managed-settings.json` (system path per OS), MDM, or server-managed | "Claude Code applies them above every other level, so no user, project, local, or `--settings` value overrides them" | `permissions.disableBypassPermissionsMode: "disable"`, plus `allowManagedPermissionRulesOnly` |
| Codex | `requirements.toml` (system path, MDM base64, cloud) | Layers merge per field, earlier wins: cloud → MDM → system | `allowed_approval_policies`, `allowed_sandbox_modes`, `[rules] prefix_rules` |
| Copilot CLI | `managed-settings.json`, `policy.d/*.json`, MDM | "For `permissions.disableBypassPermissionsMode`, an MDM value of `"disable"` always wins" | same key; managed `sandbox` values are a floor |
| Gemini CLI | system `settings.json` + admin TOML policies beside it | system path, overridable by `GEMINI_CLI_SYSTEM_SETTINGS_PATH` | `security.disableYoloMode` |

A third-party table (Failproof, verified 2026-10-21) lists the same four plus
Cursor and agrees on the shape: "a system path or MDM key, plus agent-specific
precedence". The note's 4/4 is safe; if anything it is 5/5.

Two details worth carrying into the row, because they are the ones a plugin can
meet: Copilot treats an unknown managed value as `"disable"` (fail closed), and
Codex's managed layer can *downgrade* a requested profile rather than refuse it
("a profile-shaped request can be downgraded or rejected by constraints",
#18279) — which is precisely the case that clears the read-back metadata.

### 3.4 The policy plane: behaviour ships, vocabulary does not

`muse config validate --help` on 1.4.25 states the document shape in its own
words: "validate checks an enterprise plane document
(`{"schema_version":1,"settings":{...}}` for defaults), not the user's flat
`settings.json`". Twelve candidate policy shapes were then refused, six at the
top level and six under `settings`:

```
{"schema_version":1,"allowed_permission_profiles":[...]}                     -> unknown_member
{"schema_version":1,"allowed_permission_profiles":{"default":...}}           -> unknown_member
{"schema_version":1,"permission_profiles":{"allowed":[...]}}                 -> unknown_member
{"schema_version":1,"allowed_models":[...]}                                  -> unknown_member
{"schema_version":1,"allowed_approval_policies":[...]}                       -> unknown_member
{"schema_version":1,"permissions":{"default_profile":...}}                   -> unknown_member
settings.permissions.allowed_profiles                                       -> unknown_member location=settings
settings.permissions.allowed                                                -> unknown_member location=settings
settings.permission_profiles                                                -> unknown_member location=settings
settings.run.allowed_permission_profiles                                    -> unknown_member location=settings
settings.models.allowed                                                     -> unknown_member location=settings
settings.policy.allowed_permission_profiles                                 -> unknown_member location=settings
```

`muse config status --json` reports both planes as `source_class: system_file`,
`state: absent`, with a `pinned_at: runtime_open` generation — so the only local
delivery channel the CLI will name is a system file, and it is not there.

Against that, the vendor's changelog for **1.4.2** says the behaviour exists:

- "When a managed policy restricts permission profiles, an interactive session
  whose saved default profile is not allowed now starts under the policy's
  default with a visible \"overridden\" notice instead of refusing to start; your
  saved setting is left unchanged, and `muse exec` and `muse serve` still refuse
  and list the allowed profiles."
- "`muse serve` sessions whose saved permissions fall outside the enterprise
  policy now resume at the configured fallback instead of refusing to resume."
- "A workflow child turn refused by the enterprise-managed model allowlist …
  now reports `model_selection_denied`."

Two readings fit, and this machine cannot separate them: the policy document is
delivered by a channel `config status` does not list (cloud/MDM), or the local
document vocabulary is a schema in progress whose members are not the ones
guessed. Both make "abandoned" wrong and "a lag" right. Neither makes the plugin
able to bind today.

The consequence the note misses: if a managed policy restricts profiles, the
plugin's `session/start` is one of the things that **refuses**. That is the only
way an enterprise policy can reach this plugin today, and `src/session.ts` has no
handling for `permission_profile_unknown` or `commandRejected` (§3.5).

### 3.5 Where the doctor and the start path stand

- `scripts/doctor.ts:180-235`: the doctor spawns its own host with
  `trustWorkspace: true`, reads `hostFactsFrom(host.initializeResult, …)`, calls
  `usage/read`, then `session/start`, `hook/list`, `session/leave`, and closes.
  It already owns a connection and already starts a session — so a posture read
  needs no new process and no flag on the user's connection.
- The checks are `{ id, status, detail, remediation? }` records; `containment(env)`
  and the hook rows show the house style. A posture row is additive.
- `src/session.ts:506-532` issues `session/start` / `session/resume`. A rejection
  is the host's `MspError` (`host.ts:144`) travelling out of `open()`; the only
  `open_failed` in the tree is the `sessionMcp` pre-check (`:451`), so nothing
  maps `permission_profile_*` or `commandRejected` to a named cause. E-D40 records
  the error class, code and message a user actually sees.

### 3.6 opencode's step cap, and the loop it lives in

- `opencode.ai/docs/agents`: "`steps` sets a positive maximum number of model
  steps… On the final step, OpenCode removes tools and asks the model to
  summarize in text. New user input resets the allowance." The legacy `maxSteps`
  is deprecated.
- Enforced on v2: anomalyco/opencode#54806 was retested on `@opencode/cli`
  2.0.27 — "the call the model makes at the limit is refused with `Tools are
  disabled after the maximum agent steps`", and the run exits by itself. On v1
  the same cap did not stop the loop (841 requests in 40 s), which is why the
  version matters.
- Default: "If this is not set, the agent will continue to iterate until the
  model chooses to stop or the user interrupts the session."
- It is implemented in `session/prompt.ts` — opencode's own model loop. A turn
  this plugin drives runs Muse's loop and calls back into opencode's tool
  registry, so whether the counter advances is unmeasured. That is E-D41.

### 3.7 What the field does about caps

- Claude Agent SDK: `maxTurns` and `maxBudgetUsd`, both "No limit" by default;
  the budget is a client-side estimate that "can therefore pass the cap by up to
  the cost of that one response". The CLI flags are print-mode only.
- Harness Lab (2026-11-06) read 14 harnesses: "None of the 14 harnesses we
  code-checked on this topic enforces a cost ceiling by default", and "there is
  no general agent loop turn limit. Defaults run from none to 10 turns."
- The durable bound is outside the process: "a spend cap enforced outside the
  process is the one that still holds when the agent code is wrong" (Mandare),
  and the provider limit is the only one that sees spend through the key.

So the field's norm is: a step cap as an opt-in SDK/framework knob, a spend cap
as an estimate, and the real ceiling at the provider or gateway. The note's
"application concern" is the field's own reading.

## 4. Decisions

Each decision names the branch the evidence picks.

### D37 — the doctor's posture row

| Option | Steelman | Strawman | Cost |
|---|---|---|---|
| A. No row (round 6) | The doctor reports local health; a posture it cannot fully see is a claim | The field treats a posture report as table stakes for anything claiming a gate, and the plugin has a doctor with a `containment` row already | none |
| B. A row reporting the configured rules it can see, with the caveat | True, local, and cheap: rule count, the agent mode, whether the allowlist is present | Configured is not effective: saved approvals and any managed layer are invisible | code + test |
| C. B, plus a read on the doctor's own connection | The doctor already spawns a host, so the read costs one option and one branch; it reports the profile the host actually serves and whether the catalog agrees | A beta capability in the doctor's handshake; the read is provenance and can be null | code + test |

**Branch: C, if E-D37 confirms the catalog and state are served on a
doctor-style connection; otherwise B.** The row's detail line says which part is
configured and which is read, because that is the difference the note is about.

### D38 — where `experimentalApi` is declared

| Option | Steelman | Strawman | Cost |
|---|---|---|---|
| A. Never | The stable surface is the contract, and the plugin needs nothing from beta | It leaves the one structural difference from the field in place for no gain | none |
| B. On the user's connection, always | The runtime could report the profile in the ledger and the doctor in one place | It declares every session a beta client to print a line, and the flag is per-connection for its lifetime | code |
| C. Only on the doctor's connection | The doctor owns its own host, so the flag is scoped to a diagnostic run and the user's session keeps `sessionMcp` only | The runtime still cannot see an override mid-session | code + test |

**Branch: C.** The doctor's connection is the smallest place the flag can live
and the only place a read is needed today. Reversing condition: a runtime
behaviour that depends on the posture — a ledger field, an override warning — not
a diagnostic.

### D39 — the turn ceiling

| Option | Steelman | Strawman | Cost |
|---|---|---|---|
| A. Decline; the harness's ceiling is the ceiling | Muse's `serve` has no member, and a client-side cap fires after the spend it exists to prevent | An unattended run has no ceiling unless a user set one | none |
| B. Client-side step or spend cap | Bounds the spend in the one place that sees every turn | Invented policy, an estimate, and the turn it ends is the one the user waited for | code + test |
| C. Document opencode's `steps` as the ceiling, and measure whether it binds | The knob exists, is enforced on v2, and belongs to the layer that owns the loop | If it does not see a bridged turn, the documentation would be a promise the stack does not keep | docs + one turn |

**Branch: C, with E-D41 deciding the sentence.** If `steps` cuts a bridged turn,
the row says "the harness caps it, off by default, set `agent.<name>.steps`". If
it does not, the row says "the knob exists and does not see this path", and the
answer to an unattended run is opencode's provider limit plus the allowance
warning the plugin already ships. No code either way. Reversing condition
unchanged: `serve` gaining `--max-model-steps`.

### D40 — meeting a managed policy

| Option | Steelman | Strawman | Cost |
|---|---|---|---|
| A. Leave the generic start failure | The host's message already lists the allowed profiles; the plugin is not the policy engine | A user sees `open_failed` and reads it as a broken install | none |
| B. Name it: map the refusal to its own code and keep the host's message | The only encounter this plugin can have with an enterprise policy is a refusal, and naming it is one branch | A code for a case no machine here can reproduce | code + test |
| C. Pre-check the profile at open and warn before starting | Fails earlier and can suggest the fix | Duplicates the host's check with a stale catalog, and the host refuses anyway | code + test |

**Branch: B if E-D40 shows the reason is lost or buried; otherwise A.** The test
injects the refusal rather than reproducing a policy.

### D41 — pinning a profile, revisited

D33 said no, because a pin protects nothing and adds a refusal path. The new fact
does not change the answer and does change the reason: a pin is **unverifiable
without the read** and **overridable by a managed policy** — Codex clears its own
active-profile metadata in exactly that case. So a pin without a read is a claim
the plugin cannot check, and a pin with a read still protects no bridged call.

**Branch: still no pin.** The README sentence stays qualified.

## 5. Experiments

All approved. One paid turn; the rest are free or static.

| Ref | Question | Method | Cost | Decides |
|---|---|---|---|---|
| E-D36 | What can the doctor see locally about opencode's posture? | Read the config discovery in `src/` and the doctor; count what is reachable (rules, agent mode, allowlist) without a network call | free | D37's B half |
| E-D37 | What does `experimentalApi` actually serve, and at what cost? | One doctor-style host: initialize with the flag, `permissionProfile/list`, `session/start` with `:read-only`, `session/read` for `permissionState`; record `InitializeResult.experimentalApi`, any `experimentalFingerprint`, and every frame that differs from a stable run | free, no turn | D37's C half, D38 |
| E-D38 | Is a second connection affordable in the doctor? | Time the doctor's existing spawn and the added requests; the doctor already spawns, so this is a measurement of the delta | free | D37's cost claim |
| E-D39 | Is the policy plane's vocabulary empty, or just unnamed? | Formalise §3.4: twelve shapes through `muse config validate --plane policy`, `muse config status --json`, and the 1.4.2 changelog quoted | free | D40's basis; the G row |
| E-D40 | What does a refused start look like to the plugin? | Send `session/start` with an id the catalog does not carry (the host's documented `permission_profile_unknown`), record the error kind, code and message the plugin produces | free, no turn | D40's branch |
| E-D41 | Does opencode's `steps` bind a bridged turn? | One live turn with `agent.build.steps: 1` and a prompt that needs three tool calls; record whether the turn is cut, what the user sees, and where it stopped | **1 turn** | D39's sentence |
| E-D42 | Has opencode shipped an ACP client inside its engine? | Re-read the six requests and the shim's release page; no install | free | the unclear item, kept honest |

Method rules carried from rounds 6 and 7: one probe per question, raw output
pasted into `docs/decision-evidence.md`, no retry to make a result look cleaner.
A probe that cannot observe the thing is recorded as a limitation. If E-D41
cannot tell a cut from a model that stopped, the row keeps both sentences and
says so.

## 6. Documentation work

- **`README.md`**
  - A short paragraph under the containment section: what the plugin can see
    (configured rules, not effective ones; no posture read on the user's
    connection; no turn cap of its own) and where the ceiling actually lives
    (opencode's `agent.steps`, off by default, or the provider).
  - If D40 picks B, name the policy-refusal code beside the start-failure text.
- **`docs/decision-coverage.md`**
  - New C row: "Posture read-back" — **D** or **H** per D37/D38, with the
    capability gate and what the read is (provenance).
  - New F row: "Posture report in the doctor" — **H** if built.
  - Rewrite the B/turn-cap row with §3.6 and E-D41's answer.
  - Rewrite the G/enterprise-planes basis: behaviour ships, local vocabulary
    empty, and the refusal is the encounter path.
  - New C row: "Managed-policy refusal at start" — per D40.
  - Counts restated from the rows.
- **`docs/decision-evidence.md`**: `## Round 8 — the posture you cannot read`,
  one subsection per experiment with raw output, then the decision lines.
- **`docs/integration-landscape.md`**: the owner's file; read only. Where the
  round changes a verdict in it, note the correction in the coverage record.
- **`src/`**: `host.ts` (one option), `scripts/doctor.ts` (the row), and
  `src/session.ts` only if D40 picks B. No other code.

## 7. Product choices — for the owner, after the evidence

Each is stated with a recommendation so the answer can be "agreed".

1. **Does the doctor declare a beta capability?** — **Recommend:** yes, on the
   doctor's own connection only. It is the one place a posture read is worth a
   beta flag, and the user's session stays on the stable surface. If you would
   rather the plugin never sends `experimentalApi`, the row falls back to
   configured rules and the caveat.
2. **What does the doctor row promise?** — **Recommend:** two labelled halves,
   "configured" and "read", so a reader can tell which is which. The field's
   posture reports are effective-only; this one cannot be, and saying so is the
   honest version.
3. **Is opencode's `steps` the answer to an unattended run?** — **Recommend:**
   document it if E-D41 shows it binds, and do not build a client-side cap
   either way. The stack's durable ceiling is the provider limit, which the
   plugin already sees indirectly through the allowance warning.
4. **Should a policy refusal get its own error code?** — **Recommend:** yes if
   E-D40 shows the reason is buried; it is the only way this plugin will ever
   meet an enterprise policy.
5. **Ask the vendor about the policy plane?** — **Recommend:** yes, one issue.
   `meta-models/muse-code-sdk#39` already asks for a config read and a host
   status query; the specific question this round cannot answer is whether the
   `policy` plane's document vocabulary is shipping, and which channel carries
   the 1.4.2 behaviour. That is the fact that flips the admin-lock   verdict, and it is not observable from here.

**Owner answers, 2026-11-23.** 1 — status quo (doctor's connection only). 2 — E:
add the containment-scope clause, since the axes fence Muse's own shell and a
reader will otherwise hear "sandboxed" as containment for their tools. 3 — C:
document with a copy-paste fragment, and assume no leverage over upstream
providers, so no upstream ask. 4 — status quo. 5 — deferred: the vendor question
is not asked this round.


## 8. Conditions for a confident recommendation

- **D37 and D38 are confident once E-D37 runs.** Both are free, and the doctor's
  existing spawn makes the placement argument structural rather than aesthetic.
- **D39 is confident as a decline**; E-D41 decides only the sentence in the row.
  If the probe cannot tell a cut from a stop, the row keeps both and says so.
- **D40 is confident about the local facts** (twelve refusals, the validator's
  own document shape, the changelog's behaviour) and **not confident about the
  channel**. That is the round's honest limit and belongs in the row.
- **D41 is confident** and does not depend on any probe.

What would change my mind: a policy member that binds (then an admin could
*require* a posture and the plugin could obey it), `serve` gaining
`--max-model-steps`, or a read-back that is stable-surface rather than beta.

## 9. Phases

| Phase | Work | Gate | Status |
|---|---|---|---|
| R0 | The corrections that need no experiment: the turn-cap row's basis (§3.6), the enterprise-planes basis (§3.4), the ACP row left alone | `bun run check:offline` green | done, 376 pass |
| R1 | E-D39 and E-D40 — the free probes that decide the policy story and the refusal path | Raw output recorded | done: 12/12 `unknown_member`, both planes `absent`; refusal is `commandRejected -32030` and the plugin cannot send a profile |
| R2 | E-D36, E-D37, E-D38 — the doctor feasibility and the capability read | Output recorded; D37/D38 branch named | done: nothing local to read; flag serves catalog and `permissionState`; two requests at ~1 ms |
| R3 | D37/D38 implementation: the `spawn` option, the doctor row, the wording; D40's code if E-D40 names one | Suite green, new tests in `test/doctor.test.ts` | done: `posture` row live, 380 pass; D40 → A, no code |
| R4 | E-D41: one paid turn with `steps: 1`; name D39's sentence | Branch named | attempted, not observable: five scripted runs, zero tokens, no tool call; limitation recorded |
| R5 | Coverage rows, counts, README paragraph, the plan ticked | Suite green | done |
| R6 | Evidence section in `decision-evidence.md` | `bun run check:offline` green | done, 380 pass |
| R7 | Stop and report: one line per decision and experiment, the suite result, the five product choices, ask before committing | Owner gate | reported, nothing committed |

Verification is the repo's own: `bun run check:offline` after every phase. No new
dependencies; no push; no tag; no `muse acp`. Scratch probes stay in the
gitignored `scratch/`.
