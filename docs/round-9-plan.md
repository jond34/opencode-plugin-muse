# Round 9 — the silent turn and the policy that is not yours

Plan, unexecuted. HEAD `89e8e2b`; suite 380 pass / 0 fail / 985 expect / 37
files; round 8's work is uncommitted (`README.md`, `docs/decision-coverage.md`,
`docs/decision-evidence.md`, `scripts/doctor.ts`, `src/host.ts`,
`test/doctor.test.ts`, plus the untracked round-8 plan and prompt).
`docs/integration-landscape.md` is the owner's edit: read it, never touch it.

## 1. Where round 8 left the record

- **E-D41 was never observed.** Five scripted `opencode run` turns each produced
  one `step_start`/`step_finish` with `reason:"stop"`, zero tokens, no tool call,
  no text, exit 0. D39 therefore keeps both sentences: `agent.steps` exists and
  is enforced in opencode's own loop; whether it counts a bridged turn is
  unmeasured.
- **The owner answered the five product choices** (2026-11-23): doctor-only beta
  capability, the containment-scope clause (built), a copy-paste `steps`
  fragment (built), no policy error code, and the vendor question **deferred**.
- **U16** still needs a push to dispatch the matrix; it is the only open row.
- The admin-lock verdict rests on Muse's policy plane, which this machine cannot
  observe: twelve candidate documents are `unknown_member`, both planes
  `absent`, and the 1.4.2 changelog describes behaviour the local vocabulary
  cannot express.

## 2. What this round is for

Two things changed outside the repo since round 8. Both are about a user who
cannot see what happened, and both are cheap to measure.

**a. The headless path is failing silently.** The failed E-D41 runs left a 61 KB
stderr log that was never read. It shows the plugin *loading* — three
`msg="loading plugin"` lines, including the local path — and then nothing: no
error, no refusal, no model call, and the process gone eight seconds later. A
turn that costs nothing and says nothing is the worst failure shape this plugin
can have, and it is currently undocumented.

**b. opencode has its own policy plane, and it can deny this plugin.**
`opencode.ai/docs/policies` (read 2026-11-23) documents `policies`: binary
allow/deny statements, "managed and organization policy outranking user and
project configuration", delivered from `opencode.jsonc` or a connected Console
workspace. The actions include `plugin.use`, `provider.use` and `tool.use`:

> A denied check fails with `Blocked by configuration policy` instead of
> prompting. It applies after agent rules and saved approvals, so it overrides
> an ask and an "Allow always" approval alike.

> `plugin.use` … a denied plugin is not loaded, however it was configured.

That last sentence is a fact this plugin cannot observe about itself, and the
first one makes the README's "a configured `deny` is the only hard stop that
survives `--auto`" out of date: there is now a stronger one, and it is
testable locally.

The round is therefore two halves with one shape — **the plugin cannot see the
thing that decided the turn** — and each half ends in either a code change, a
documented limitation, or a measured absence.

## 3. Evidence already in hand (do not re-derive)

### 3.1 The failed headless runs, re-read

From `scratch/e-d41/run-2.err`:

- `cli starting version=2.3.2 args=["serve","--stdio","--port","0"]`
- `msg="loading plugin"` for `herdr-agent-state.js`,
  `@jonathand34/opencode-plugin-muse` (from `~/.cache/opencode/npm/…`) and
  `/home/jonat/repos/opencode-plugin-muse/src/index.ts` — **corrected in S0:**
  three ids, **sixteen instantiations each** (48 lines in run 2), one block per
  config event, so `setup()` runs sixteen times per process
- zero `ERROR` or `WARN` lines, no stack, no refusal, no host spawn line
- **corrected in S0:** the process was not gone — it was killed.
  `shutdown started signal=SIGTERM` 6.0 s after start; the watcher stops are
  teardown. The three stderr logs describe a killed startup, not a finished
  turn. The finished turns are runs 1 and 4: 0.95 s, zero tokens, exit 0
- `~/.local/state/opencode-muse/` holds `usage-2026-11-20/21/22.jsonl` and **no
  2026-11-23 file**; `allowance-notice.json` was last written 06:36 by a doctor
  run, not by these

Two readings, not yet distinguishable:

- **H1 — `setup()` threw.** `src/plugin.ts:163-165` defines
  `Plugin.define({ id, async setup(ctx) })`, with catch arms at 186, 269, 288 and
  321. A local plugin whose load throws is swallowed
  (`anomalyco/opencode#21638`, `plugin/shared.ts:139` `.catch(() => undefined)`).
- **H2 — setup succeeded and the write was lost.** `void
  appendLedgerRow({type:"host",…})` at `src/plugin.ts:391` is a floating
  promise, and one-shot `run` exits before backgrounded work completes
  (`anomalyco/opencode#48683`). A missing ledger row is therefore not proof of
  failure.

Harness-side evidence that bears on both:

- `#41422` — plugin `tool.execute.before/after` hooks never fired across 254
  tool calls under `opencode run`, while the same setup worked in a UI session;
  closed as not planned.
- `#33455` — plugins appear not to load in 1.17.x; closed by the reporter as
  lazy initialization on first `Plugin.trigger()`, not absence.
- `#42677` — `opencode run` can save an empty assistant stop message with zero
  parts and exit 0.

### 3.2 opencode's policy plane (quoted, 2026-11-23)

- "Policies are binary, never prompt, and only ever tighten what permissions and
  providers would otherwise allow."
- "managed and organization policy outranking user and project configuration"
- "Statements that fail validation are dropped with a warning in the server log
  and the rest of the list still applies."
- "When several statements match, the last one wins."
- `provider.use`: "A denied provider disappears from the catalog and model
  selection even when it has valid credentials."
- `plugin.use`: "A plugin by unversioned package name or absolute path … a denied
  plugin is not loaded, however it was configured."
- Before 2.2.3 these were `integration.use` with `mcp:`/`skill:`/`plugin:`
  prefixes; this machine runs 2.3.2.

### 3.3 Turn ceilings, for the D39 sentence (research, not measurement)

- Claude Code: no default limit; `--max-turns` and `--max-budget-usd`, print mode
  only.
- Codex: no turn cap in the run loop; `goals.max_goal_token_budget` for goals.
- opencode: `agent.<name>.steps`, no default, in its own loop (already D39).
- Hermes: 500 iterations by default at that pin; `agent.max_turns`.
- Of fourteen harnesses surveyed, none enforces a cost ceiling by default; a
  turn cap catches length, not spend. (harnesslab.co, read 2026-11-23; code and
  docs reading, not measurement.)

## 4. Hypotheses, steelman and strawman

| # | Claim | Steelman | Strawman (the thing it is not) | Cheapest discriminator |
|---|---|---|---|---|
| H1 | `setup()` throws under `opencode run` | Local plugin errors are swallowed by design (`#21638`); setup has four catch arms; no ledger row for the day | "The plugin is broken" — it works in the TUI, and the log shows it loading | E-D43: synchronous `console.error` at each setup milestone |
| H2 | setup completes; runtime hooks never fire headless | `#41422` measured exactly this for tool hooks; `#33455` shows lazy init | "Hooks never work headless" — lazy is not absent, and the reporter's own test passed once a tool ran | E-D45: a scratch plugin with a canned model, no network |
| H3 | setup completes; the Muse host fails and the stream ends empty | Zero tokens, zero parts, no error, 8 s lifetime | "Muse is down" — the same host works in the TUI | E-D43 host-spawn line plus E-D46 stderr capture |
| H4 | Two plugin copies (npm cache + local path) break registration | Two `provider.transform` calls for one id; last wins or throws | "Two copies always conflict" — opencode loads both without complaint | E-D44: temp `XDG_CONFIG_HOME` with only the local path |
| H5 | Nothing failed; the write was lost and opencode saved an empty stop | `#48683` (exit before background work) and `#42677` (empty stop, exit 0) both describe it | "It printed nothing, so nothing ran" | E-D46: session record, ledger, and a synchronous marker |
| H6 | Sixteen `setup()` runs race in one process, and the winner's provider points at a dead host | S0 counted 16 instantiations per run, one per config event; each re-registers `provider.transform` and the AI SDK hook under one provider id | "The plugin is loaded twice" — there are three ids, but the churn is per event, not per install | E-D43: count marker blocks in a completed run |

Order matters: H1 and H2 are decided before any paid turn, H4 before H3 (a
duplicate registration can look exactly like a host failure), and H6 before H3
because sixteen racing setups produce the same zero-token shape as one host
failure.

## 5. Decisions and their branches

### D42 — What the plugin claims about `opencode run`

| Option | Shape | What the user gets |
|---|---|---|
| A | Say nothing (status quo) | A silent empty turn, exit 0, no explanation |
| B | Document `opencode run` as unsupported, with the reason | The user stops using it, or uses the TUI |
| C | Document it as supported with a named requirement | Works if the requirement holds, fails loudly if not |
| D | Detect headless at setup and print one line to stderr | A visible trace in CI logs even when the turn is empty |
| E | Doctor row (`headless`) that states what this build does | One place to look before wiring CI |

Branch on results:

- **H1** → fix or guard the throwing step, then C plus D.
- **H2** → B plus D; file the upstream issue with the canned-model repro (E-D45).
- **H3** → C plus D; the host failure must be surfaced rather than end a stream.
- **H4** → D plus a duplicate-install warning (D44), then re-run E-D41.
- **H5** → B or C, whichever the session record supports; nothing to fix in code.

### D43 — Empty turns are failures, not successes

Options: (A) leave as-is; (B) the plugin emits a warning part when a turn
settles with zero parts; (C) the plugin throws so opencode shows an error;
(D) the ledger records an `empty_turn` row and the doctor counts it.

The product question is whether a plugin may convert a harness behaviour into an
error. B is the only option that keeps the turn's own shape while making the
failure visible.

### D44 — Duplicate install

Options: (A) ignore; (B) warn once at setup when the same package is loaded twice
(needs a stable identity, not a path); (C) refuse to register the second copy;
(D) doctor row only.

### D45 — The policy plane in the documentation

The README sentence "a configured `deny` is the only hard stop that survives
`--auto`" is wrong as of 2.2.3. Options: (A) correct it to name `policies` as the
stronger stop; (B) correct it and recommend `policies` over `permissions`;
(C) correct it and add a coverage row for `plugin.use` / `provider.use` /
`tool.use`; (D) all of the above plus a doctor row that says the plugin cannot
see a policy that denies it.

### D46 — Can the doctor report a policy block?

Only by effect: a denied provider is absent from the catalog, a denied tool fails
with `Blocked by configuration policy`. Options: (A) no row; (B) a `policy` row
that reports the effects it can see; (C) a row that says plainly "this plugin
cannot detect `plugin.use` against itself".

### D47 — The `steps` sentence, again

Conditional on D42: if a headless turn produces tokens, re-run E-D41 and settle
D39's second sentence. If not, the sentence stays and says why.

## 6. Experiments (all pre-approved by the owner, 2026-11-23)

Paid turns are bounded at **two** (E-D44's success path and E-D50).

| Ref | Question | Method | Cost | Decides |
|---|---|---|---|---|
| E-D43 | Does `setup()` complete under `opencode run`? | Add temporary synchronous `console.error` markers at setup entry and after each registration block in `src/plugin.ts`; run one scripted turn; revert. Record the last marker reached | free | H1 vs H2 |
| E-D44 | Is the duplicate load the cause? | Copy `~/.config/opencode` to a temp dir, keep only the local plugin entry, run with `XDG_CONFIG_HOME` pointed there; never edit the real config | 1 turn if it works | H4 |
| E-D45 | Do V2 provider hooks wire headless at all? | A scratch plugin exporting a provider whose `aisdk` hook returns a canned language model (no network); one scripted run; does the canned text appear? | free | H2 |
| E-D46 | What does a user see on a silent turn? | Run the failing case with `--print-logs --log-level DEBUG`; capture exit code, stdout, stderr, the session record, and whether a ledger row lands with a synchronous marker | free | H5, and D43's shape |
| E-D47 | What does `plugin.use` denial look like? | Temp config denying `plugin.use` for the local path; run the TUI/doctor and a scripted turn; record what is printed, and whether the muse provider is absent | free | D45, D46 |
| E-D48 | What does `provider.use` denial look like? | Temp config denying `provider.use` on `muse`; record the catalog, the model picker, and the error a request produces | free | D45, D46 |
| E-D49 | What does `tool.use` denial look like on a bridged call? | Temp config denying `tool.use` on `opencode_bash`; one turn that needs a shell call; record `Blocked by configuration policy`, whether the turn survives, and what the bridge sees | 1 turn | D45, D43 |
| E-D50 | Does `steps` bind a bridged turn? | Only if a headless turn works: retry E-D41's shape with `agent.build.steps: 1` | 1 turn | D39's second sentence |

Every experiment writes its raw output to `scratch/round-9/<ref>.log` and a
summary paragraph to `docs/decision-evidence.md`.

**Limitations to record rather than paper over:** a Console-workspace policy
cannot be tested without a workspace; `plugin.use` denial is invisible to the
plugin by definition; and if E-D45 shows the harness never wires the hook, then
no code change here can make headless work.

## 7. Documentation work

- `README.md`: the headless paragraph (whatever D42 picks), the corrected hard
  stop sentence (D45), and — if E-D50 runs — the `steps` sentence upgraded from
  "unmeasured" to measured.
- `docs/decision-coverage.md`: new rows for headless `opencode run`, the policy
  plane's three denials, and duplicate install; counts restated.
- `docs/decision-evidence.md`: `## Round 9 — what the user cannot see`, with raw
  output for E-D43–E-D50.
- `docs/compatibility.md`: the tested pair gains a line for the policy vocabulary
  if E-D47–E-D49 confirm it on 2.3.2.
- This plan's phase table, ticked as each phase closes.

## 8. Product choices for the owner (after the experiments)

These are judgement calls, not measurements. Each is stated with a
recommendation so the answer can be "agreed".

1. **Is `opencode run` in scope?** — **Recommend:** in scope only if a turn
   produces tokens. Otherwise say "interactive only" in the README and stop
   pretending CI works. Cost of the other choice: a promise the plugin cannot
   keep.
2. **Should an empty turn be loud?** — **Recommend:** yes, one warning part, no
   thrown error (D43 B). A plugin that converts harness behaviour into an error
   takes blame it cannot fix; a warning is honest and visible in logs.
3. **`policies` or `permissions` as the recommended hard stop?** —
   **Recommend:** `policies`, because it outranks saved approvals and survives
   `--auto` by the vendor's own description. This is a correctness fix to the
   README, not a preference.
4. **Should the doctor say the plugin cannot see a policy against itself?** —
   **Recommend:** yes, one clause, next to the posture row's existing caveat.
   It is the same shape of honesty the posture row already carries.
5. **File upstream?** — **Recommend:** one issue, only if E-D45 shows the hook
   wiring is broken with a canned model. That is a repro the maintainers cannot
   call a Muse problem.
6. **Duplicate install: warn or ignore?** — **Recommend:** warn once, if E-D44
   shows it changes behaviour; otherwise leave it alone.

## 9. Conditions for a confident recommendation

- **D42 is confident** once E-D43–E-D45 run: together they separate "our setup
  throws" from "the harness never wires the hook" from "the host fails quietly".
- **D45 is confident** once E-D47–E-D49 run, because all three denials are local
  and binary.
- **D43 and D44 are design choices**, not measurements; they need E-D46 and
  E-D44 for their shape, not their direction.
- **Not confident, and not fixable here:** any claim about a Console-delivered
  policy (no workspace), Muse's managed policy channel (no vocabulary), and
  whether `steps` binds a bridged turn until a headless turn produces tokens.

What would change my mind: a headless run that works with no code change (then
D42 is a documentation-only round), or `plugin.use` denial being visible to the
plugin in some way the docs do not mention (then D46 gets a real row).

## 10. Phases

| Phase | Work | Gate | Status |
|---|---|---|---|
| S0 | Re-read `scratch/e-d41/run-2.err` and confirm §3.1's lines; record the ledger gap | Log excerpt in evidence | done — corrected §3.1, added H6 |
| S1 | E-D43 and E-D45 — is setup completing, do hooks wire | Markers and canned model recorded | done — setup completes all 12 milestones; E-D45 superseded by E-D44 |
| S2 | E-D44 — duplicate load isolated | Branch named; no user config edited | done — one instance per package, first entry wins; the checkout was shadowed |
| S3 | E-D46 — what a user sees; D43's shape named | Exit code, stdout, stderr, ledger | done — zero bytes, exit 0 |
| S4 | D42 implementation (whichever branch) and D43/D44 if chosen | Suite green | done — README only; D43/D44 are structurally impossible |
| S5 | E-D47, E-D48, E-D49 — the three policy denials | Raw output recorded | done — `tool.use` names itself, the other two do not |
| S6 | D45/D46 documentation: README correction, coverage rows, counts | Suite green | done — 380 pass / 0 fail / 987 expect |
| S7 | E-D50 only if S1–S3 produced a working turn; D39's sentence settled | Branch named | done — `steps` binds; 1 means zero model calls |
| S8 | Evidence section in `docs/decision-evidence.md` | `bun run check:offline` green | done |
| S9 | Stop and report: one line per decision and experiment, the suite result, the product choices, ask before committing | Owner gate | reported |
