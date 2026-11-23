# Round 10 — the row that would have answered it, and the unit of a step

Plan, unexecuted. HEAD `8afd19c`; suite 380 pass / 0 fail / 987 expect / 37
files; working tree clean except `docs/integration-landscape.md`, which is the
owner's edit: read it, never touch it.

Coverage stands at `H 40 · D 34 · P 0 · X 5 · U 1 · N 3`. U16 is still the only
open row and still needs a push.

## 1. Where round 9 left the record

Round 9 closed the silent turn and the policy plane. Three things were recorded
as **inherited, not chosen** — headless silence, global-config shadowing, and a
policy denial that reads as a model typo — because in each case the failure
happens where no code of this plugin runs. The owner accepted that framing and
named the one item still open to a choice:

> The doctor doesn't look at plugin entries. … `bun run doctor` is a separate
> process that can read `~/.config/opencode`. One row — list every entry for this
> package, name which one wins, and say that headless will use that one — would
> have converted E-D44's debugging session into one command.

Round 9 also left two sentences in the README that are weaker than they look:

- the ceiling section gives `steps: 12` and says `steps: 1` means zero model
  calls, but never says **what a step is**;
- `steps: 1` producing zero bytes was measured once, and the vendor's own source
  says the cap still issues a request.

## 2. What this round is for

Three pieces of work, in order of how much they change:

**a. The doctor can answer the shadowing question, and the vendor already ships
the resolver.** `opencode plugin list --builtin` exists on 2.3.2 and, run in this
checkout on 2026-11-23, printed:

```
ID              VERSION  SOURCE
-               local    /home/jonat/.config/opencode/herdr-opencode
herdr.opencode  local    /home/jonat/.config/opencode/plugins/herdr-agent-state.js
opencode-muse   0.1.12   @jonathand34/opencode-plugin-muse
opencode.agent  -        builtin
…
```

The package entry is there. **This checkout is not.** That single line is the
answer E-D44 took a whole round to reach, and it is available to a process that
is allowed to read state. Without `--builtin`, the same command hides the
package and shows only configured local directories — which is why the flag
matters and why the row cannot be built on the bare command.

**b. `steps` has no unit, and the `steps: 1` sentence may be wrong.** The
installed build's source (`packages/core/src/session/runner/llm.ts`, commit
`698800f`, read 2026-11-23 — the default branch, not necessarily 2.3.2) counts
steps from 1 and tests `step >= agent.steps`. When the limit is reached it does
not skip the call: it appends `MAX_STEPS_PROMPT` to the messages and sets
`toolChoice: "none"`, so the model is asked for a text-only summary. Round 9
measured zero tokens and zero bytes at `steps: 1`. Both cannot be true of the
same build, and the difference decides whether this is a harness behaviour to
document or a plugin defect to fix.

**c. Two policy questions only research can settle.** Muse's managed policy
ships (1.4.2 changelog: an interactive session whose saved profile is not allowed
starts under the policy's default with an "overridden" notice; `muse exec` and
`muse serve` still refuse) while the local vocabulary still has no member that
binds. And a Console workspace's policy is delivered by
`opencode.provider.opencode`, a built-in plugin that ignores removals — so the
channel exists, cannot be removed by a repository, and cannot be exercised from
this machine.

## 3. Evidence already in hand (do not re-derive)

### 3.1 Vendor source, read not measured

`packages/core/src/session/runner/llm.ts`:

- `let step = input.continuation?.step ?? 1` — the count starts at **1**.
- `const stepLimitReached = loaded.agent.info.steps !== undefined && step >= loaded.agent.info.steps`
- the request is built either way; on the limit it carries
  `messages: [...transcript.messages, Message.assistant(MAX_STEPS_PROMPT)]` and
  `toolChoice: "none"`.
- the loop calls `runStep` and then `step++`; another step runs when the step's
  outcome says `needsContinuation`.

`packages/core/src/session/runner/max-steps.ts` — the whole prompt:

> CRITICAL - MAXIMUM STEPS REACHED … Tools are disabled until next user input.
> Respond with text only. … MUST provide a text response summarizing work done
> so far …

`packages/core/src/session/runner/step.ts` — one step is one provider request;
tool calls run **inside** the step; `Completed{needsContinuation}` decides
whether the loop goes round again.

`packages/core/src/plugin/module.ts`:

- `plugin.use` is checked per load:
  `ManagedPolicy.decision(statements, "plugin.use", target)`, where `target` is
  the absolute path for a local plugin and the package name with the version
  suffix stripped. A deny returns `{ blocked: true }` before any import.
- `Effect.log({ msg: "loading plugin", id: operation.target, entrypoint: found })`
  — the log line round 9 read, and it names the entrypoint.
- reloads arrive through a `PubSub` fed by a filesystem watcher; each publish is
  a new generation, which is the shape of round 9's sixteen instantiations.

### 3.2 Vendor docs, quoted

`opencode.ai/docs/plugins` (2026-11-23):

- "Plugin arrays from applicable config files are applied from lowest to highest
  precedence instead of replacing one another."
- "Plugin entries are processed in order. Prefix an ID or wildcard with `-` to
  disable it, use `*` for every plugin… A later ID re-enables a plugin."
- "Two built-in plugins ignore removals so that a repository cannot switch off
  policy enforcement: `opencode.config.policy` and `opencode.provider.opencode`,
  the Console connection that delivers organization policy."
- "Relative paths resolve from the config file containing the entry." A local
  entry must be a directory; a file path is skipped.

`opencode.ai/docs/config` — precedence, lowest to highest:
`~/.config/opencode/opencode.json` → project `opencode.json(c)` from the farthest
directory to the closest → `.opencode/opencode.json(c)` in the same order →
`/etc/opencode/opencode.json` → macOS MDM `ai.opencode.managed`. "Policies from
global and project files evaluate in the reverse order, and system policies
outrank all of them."

`opencode.ai/docs/enterprise` — policies live in the system file; a Console
workspace can offer models and MCP servers that a policy then allows; the
version floors are `2.2.3` for `plugin.use`/`mcp.use`/`skill.use` and `2.2.6` for
`websearch.use`; "Older clients ignore these statements."

### 3.3 Measured on this machine, 2026-11-23

- `opencode --version` → `v2.3.2`.
- `opencode plugin list` → one row, the local `herdr-opencode` directory.
- `opencode plugin list --builtin` → the same row plus `herdr.opencode` (a
  `.js` file), `opencode-muse 0.1.12` from `@jonathand34/opencode-plugin-muse`,
  and the built-ins including `opencode.config.agent`, `opencode.config.policy`.
- `opencode --log-level debug plugin list` works. **This corrects round 9's
  note**: the flag is real and global; what 2.3.2 rejects is `--log-level` in
  some other position. The evidence section says "rejected at every position"
  and that is wrong.

### 3.4 Precedent, for the shape of the row

Claude Code's `claude plugin list` groups entries **by how each one loads** —
installed, session-only, skills-directory, synced — carries a version, scope and
status per entry, and has `--json`. Its loading reference states the collision
rule in one sentence: when a session-only plugin shares a name with an installed
one, "Claude Code loads the session-only copy for that session and skips the
installed one." That is the sentence opencode does not publish and this row
would supply for one package.

## 4. Hypotheses, steelman and strawman

| # | Claim | Steelman | Strawman (the thing it is not) | Cheapest discriminator |
|---|---|---|---|---|
| H7 | `steps: 1` still issues one request, and this plugin answers it with nothing | The source builds the request unconditionally and only adds a prompt plus `toolChoice: "none"`; a plugin that composes its own transcript may not expect a trailing synthetic assistant message | "The cap prevents the call" — there is no such branch in the runner | E-D51: `--format json` plus `--log-level debug`, count `step_start`, provider lines and bridge turns |
| H8 | A step is one provider request, so a Muse turn with N tool calls costs N+1 steps | Tools run inside the step and the loop asks for continuation; the bridge surfaces Muse's tool calls as opencode tool calls, which is exactly N continuations | "`steps` counts Muse turns" — then `steps: 1` would have been enough for E-D50's turn, and it was not | E-D52: the same prompt at `steps: 2` and `3`, counting `step_start` |
| H9 | The row can be built on `opencode plugin list --builtin` alone | The vendor resolves it, so there is no drift and no precedence to reimplement; the resolved set names the winner by construction | "The CLI lists what the config says" — measured: without `--builtin` it hides the package entirely, so it lists a *subset* | E-D53: three temp states, and whether the list follows the cwd |
| H10 | The reload storm is watcher-driven and not caused by this plugin | `module.ts` republishes watcher events as new generations; the plugin writes only to a private temp `XDG_CONFIG_HOME` that it removes | "The plugin's own config write triggers the watcher" — its host config is a temp dir outside the watched trees | E-D55: `--log-level debug`, count reload lines and name the ids |

Order: H7 before H8 (the unit is only meaningful once the cap's first request is
understood), H9 before any row is written, H10 last because nothing else depends
on it.

## 5. Decisions and their branches

### D48 — How the doctor answers "which copy will run?"

| Option | Shape | Cost | Risk |
|---|---|---|---|
| A | No row (status quo) | 0 | The one measured failure round 9 had stays undiagnosable |
| B | Spawn `opencode plugin list --builtin`, parse the table, report the resolved set and whether this checkout is in it | one process, no model call | table format is not a contract; `opencode` may be absent; the doctor's header says it runs nothing found on `PATH` |
| C | Parse the config files in-process and apply precedence | 0 processes | reimplements global/project/`.opencode`/`/etc`/MDM order plus the array merge and re-enable rules; still cannot say which id won |
| D | B plus C, so the row can name the shadowed entry too | B's cost plus C's risk | two implementations of the same question, drifting apart |
| E | Print config entries with no resolution | ~C's risk, no answer | honest but useless: it cannot say which one wins |

**Amended at S0 — the premise was wrong.** `opencode plugin list` is not a
resolver: on 2.3.2, with or without `--builtin`, it printed only configured local
directories while the package loaded from the npm cache. The option chosen is B
on a different surface: `opencode debug config`, which prints one document per
source with its own `plugins` array (E-D53). Everything below about B holds —
one process, no plugin import, `skipped` when it does not answer — and the
caveat about the cwd is answered: it follows the cwd.

**Recommend B.** The vendor answers the question, the sources name the winner by
construction, and the shadowed entry does not need naming: "this checkout is not
in any source" is the whole diagnosis. C is a fallback for when `opencode` is
missing, and then the row says `skipped`, not a guess. D is rejected as two
answers to one question.

Branch on E-D53: if the list does not follow the cwd's project config, B is
insufficient and the row must say "global entries only" rather than lie.

### D49 — What status a shadowed checkout gets

Options: (A) `ok` with a note; (B) `warn` with the fix; (C) `fail`.

**Recommend B.** The install works — it is the *published* build — so `fail`
would be wrong; `ok` would hide the thing that cost a round.

### D50 — The unit of a step in the README

Options: (A) no unit (status quo); (B) requests: one step is one model request,
so a turn with N tool calls costs N+1; (C) user turns; (D) both, with the
arithmetic spelled out once.

**Recommend B with the arithmetic** (D only if E-D52 shows a turn where the two
readings disagree). C is false under H8 and would make the ceiling meaningless.

### D51 — The `steps: 1` sentence

Branch on E-D51:

- **request issued, plugin returns nothing** → this is a defect in this plugin's
  handling of `toolChoice: "none"` or the appended assistant message. Fix it, and
  the README's ceiling section gains the true sentence: at the cap the model is
  asked for a summary, and the turn still ends with text.
- **no request issued** → the README sentence stays, and gains the log evidence
  that says why (round 9 had none: it inferred the shape from the output).
- **request issued and answered** → round 9's measurement was an artifact of the
  shadowed build and E-D50 was wrong; correct the evidence, not the code.

### D52 — Muse's policy plane

Options: (A) keep the X row as written; (B) X with the 1.4.2 changelog quoted as
the reason the behaviour ships and the vocabulary does not; (C) attempt a
document that names a policy and re-open the verdict.

**Recommend B.** C was tried twelve ways in round 8 and refused every time; a
thirteenth shape is not worth a round.

### D53 — Console-delivered policy

Options: (A) say nothing; (B) record it as untestable here and name the delivery
path (`opencode.provider.opencode`, a built-in that ignores removals); (C) a
doctor row that reports whether that built-in is present and calls it policy.

**Recommend B.** C would be a false positive: the built-in is the *connection*,
not a statement.

## 6. Experiments (all pre-approved by the owner, 2026-11-23)

Paid turns are bounded at **three** (E-D51, E-D52's two runs). Every other
experiment is free, and no run may be repeated to "confirm" a result already in
the log.

| Ref | Question | Method | Cost | Decides |
|---|---|---|---|---|
| E-D51 | Does `steps: 1` issue a request, and what does this plugin do with it? | Temp `XDG_CONFIG_HOME` with the checkout only; `opencode --standalone --print-logs --log-level debug run --format json --agent build --model muse/muse-spark-1.3 "Reply with the single word ready."` plus `agent.build.steps: 1`; capture stdout and stderr | 1 turn | H7, D51 |
| E-D52 | What is a step, and what does `2` buy? | Same shape, `steps: 2` then `steps: 3`, with a prompt that needs two bridged reads; count `step_start`, tool calls and tokens | 2 turns | H8, D50 |
| E-D53 | Does `opencode plugin list --builtin` follow the cwd and reflect project config? | Three temp states: checkout only; package only; both, package in global and checkout in a project config in a temp cwd. Record the table each time | free | H9, D48 |
| E-D54 | What does that command cost, and does it start anything? | Time it, and compare `opencode` processes and service state before and after | free | D48's cost |
| E-D55 | Where do the reload rounds come from? | Re-read E-D51's `--log-level debug` log; count plugin generation lines and the ids they name | free | H10 |
| E-D56 | Does the row read correctly in all three states? | Implement the row behind E-D53's fixtures; run `bun run doctor` in each; record the exact lines | free | D48, D49 |

Every experiment writes raw output to `scratch/round-10/<ref>.{out,err,log}` and a
summary paragraph to `docs/decision-evidence.md`.

**Limitations to record, not paper over:** a Console workspace cannot be
exercised here; the source read is the default branch, not the installed build,
so behaviour claims rest on E-D51/E-D52 and never on the source alone; and if
`opencode plugin list` starts a service, the doctor's "read-mostly" promise needs
the same amendment the row forces on its header.

## 7. Documentation work

- `README.md`: the ceiling section gains the unit (D50) and the true `steps: 1`
  sentence (D51); the doctor section gains the plugin row; the headless section
  cross-references it as the one command that answers "which copy runs".
- `scripts/doctor.ts`: the row (D48), the header rule amended if the row spawns
  `opencode` (product choice 1), and a `--json` field only if the report shape
  already has one.
- `test/doctor.test.ts`: assertions on the row's three states, from fixtures, no
  network and no real `opencode` binary.
- `docs/decision-coverage.md`: rows for the plugin-entry question and the step
  unit; counts restated.
- `docs/decision-evidence.md`: `## Round 10 — which copy runs, and what a step
  is`, including the correction to round 9's `--log-level` note.
- `docs/compatibility.md`: the `plugin list --builtin` observation, as a
  version-dependent fact.
- This plan's phase table, ticked as each phase closes.

## 8. Product choices for the owner (answered 2026-11-23)

These do not fall out of the measurements. The owner agreed every
recommendation below and **punted on filing upstream**: if a fix is not
possible here, record the limitation and stop — no issue is filed.

1. **May the doctor spawn `opencode`?** — **Recommend:** yes, and amend its
   header rule from "nothing executed that was merely found on `PATH`" to "the
   two host CLIs it is built for" (`muse`, already, and now `opencode`). The
   alternative is reimplementing config precedence, which drifts.
2. **What status is a shadowed checkout?** — **Recommend:** `warn`, with the
   two fixes (drop the package entry, or point `XDG_CONFIG_HOME` at a config
   that lists only the checkout).
3. **`steps` unit** — **Recommend:** requests, with the N+1 arithmetic stated
   once. If E-D52 shows a disagreement between the two readings, say both.
4. **If `steps: 1` is a plugin defect, fix it or document it?** — **Recommend:**
   fix. A cap that eats the turn is the failure shape round 9 spent a round
   removing.
5. **File upstream?** — **Punted.** Nothing is filed. If a defect turns out to
   be the vendor's, the evidence section says so and the record stops there.
6. **One row or two?** — **Recommend:** one `plugins` row. A second row for
   policy visibility already exists in the posture detail.

## 9. Conditions for a confident recommendation

- **D48/D49 are confident** once E-D53, E-D54 and E-D56 agree: the command
  follows the cwd, costs a fraction of a second, starts nothing, and the row
  reads correctly in all three states.
- **D50/D51 are confident** once E-D51 and E-D52 run, because the runner's own
  event stream says how many requests were made and what came back.
- **D52/D53 are never confident from this machine.** They are recorded, not
  measured, and the plan says so in the row itself.

What would change my mind: `plugin list` ignoring the project config (then B is
insufficient and the row must say so); `steps: 1` answered normally by this
plugin (then round 9's claim was an artifact and the README's sentence is the
thing to fix); `opencode plugin list` starting a service (then the doctor's cost
is a spawn plus a server, and the row is not worth it).

## 10. Phases

| Phase | Work | Gate | Status |
|---|---|---|---|
| S0 | Re-read §3 against the installed build; confirm `plugin list --builtin`'s output and the `--log-level` correction | Output recorded | done — `plugin list` is not a resolver; `debug config` is; `--log-level` is global |
| S1 | E-D53 and E-D54 — the resolver's semantics and cost | Table from three states; timing | done — follows cwd and XDG; 0.16 s warm, 0.79 s standalone |
| S2 | E-D51 — `steps: 1` under `--log-level debug` and `--format json` | Raw log; H7 named | done — one request, empty stream; cause found and fixed |
| S3 | E-D52 — `steps: 2` and `3`; the unit | Step counts; H8 named | done — N tool calls = N+1 steps |
| S4 | E-D55 — the reload storm, from S2's log | Named ids or "still unidentified" | done — cwd-watcher class identified, count unexplained |
| S5 | D48/D49 implementation: the row, the header rule, the tests | `bun run check:offline` green | done |
| S6 | E-D56 — the row in three states | Exact lines recorded | done |
| S7 | D50/D51 documentation, and D52/D53 as recorded research | Suite green | done |
| S8 | Evidence section, coverage rows, counts, compatibility line | `bun run check:offline` green | done |
| S9 | Stop and report: one line per decision and experiment, the suite result, the product choices, ask before committing | Owner gate | pending owner |

## 11. Prohibitions (inherited from round 9, plus two)

- Never edit the real `~/.config/opencode`. Every experiment uses a temp
  `XDG_CONFIG_HOME`, and `auth.json` is copied into it or Muse login is lost.
- Muse CLI work runs under `zsh -lc`, never `bash -lc`. No `muse acp`.
- No push, tag, publish, or new dependency. Scratch output stays in the
  gitignored `scratch/`.
- `docs/integration-landscape.md` is read-only, never staged.
- Temporary instrumentation in `src/` is reverted before any commit and
  `git diff src/` is checked.
- **New:** no claim about Console-delivered policy, and none about Muse's managed
  channel beyond quoting the changelog.
- **New:** the source read is evidence about *shape*, never about behaviour on
  2.3.2. Where they disagree, the installed build wins and the disagreement is
  recorded.
