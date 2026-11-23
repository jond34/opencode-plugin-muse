# Round 11 — the clause that makes the hard stop honest

Executed 2026-11-23; S8 (the owner gate) is the only phase left. HEAD `1f5cfed`; suite 388 pass / 0 fail / 1002 expect / 37
files; working tree clean except `docs/integration-landscape.md`, which is the
owner's edit: read it, never touch it.

Coverage stands at `H 40 · D 34 · P 0 · X 5 · U 1 · N 3`. U16 is still the only
open row and still needs a push.

## 1. Where round 10 left the record

Round 10 closed the doctor's plugin-entry row and the `steps: 1` defect, and
recorded three items as inherited. The review that followed found one item worth
changing, and two still unclear:

> The `policies` recommendation is stated as a hard stop without saying the
> mechanism fails open. … Statements that fail validation are dropped with a
> warning in the server log and the rest of the list still applies. Copilot's
> managed settings do the opposite … So a typo in the recommended hard stop is a
> silent no-op, and the README's `policies` block is the one a careful user will
> copy. One clause fixes it.

> Unclear — The reload count. E-D55 named the trigger class but not the count …
> Whether a Console-delivered policy behaves like a local statement, and whether
> Muse's `policy` plane is arriving or abandoned.

That is the whole round: one documentation defect, one unresolved count, and two
recorded-not-measured items. Nothing structural.

## 2. What this round is for

**a. The hard-stop paragraph tells the truth about its failure mode.** README
lines 195–240 recommend `policies` as the mechanism that outranks `--auto` and
saved approvals, and print the block a careful user will copy. Nothing there says
that a statement failing validation is dropped, that the rest of the list still
applies, or that "if nothing matches, the action is allowed" — so a typo is
indistinguishable from no policy at all. The vendor says so in its own docs; the
round adds the sentence and the way to prove the deny took effect.

**b. The silent half is the managed half.** `anomalyco/opencode#60252`: "Local
config logs a warning; the remote config decoder filters unknown actions and
effects without a diagnostic." So the Console-delivered path — the one an
administrator deploys to machines they cannot inspect — drops a typo with
nothing to read. That belongs in the same paragraph, because it changes the
advice: check the log locally, prove the effect everywhere.

**c. The count is still unexplained, and the log already holds the answer.**
E-D55 counted ten `loading plugin` lines after one `config.updated`. The line is
emitted per plugin per generation (`module.ts`), so ten loads is either ten
plugins in one generation or ten generations — two very different stories. The
round-10 debug log can separate them without a paid turn.

**d. Two recorded items get one sentence each, not a probe.** Muse's plane is
alive (1.4.13 references managed policy) and still has no member the installed
validator accepts; the CLI version has not moved since round 8, so re-bisecting
is not justified. Console-delivered policy stays untestable here — but the
remote decoder's silence is now a fact worth recording, because it is the
opposite of the local path.

## 3. Evidence already in hand (do not re-derive)

`docs/round-11-research.md` holds the quotes with URLs. The three that decide
this round:

1. opencode.ai/docs/policies — "Statements that fail validation are dropped with
   a warning in the server log and the rest of the list still applies. Check the
   log after editing a `deny`." … "If nothing matches, the action is allowed."
2. anomalyco/opencode#60252 — the remote decoder drops unknown actions and
   effects **without a diagnostic**; strict validation is requested and open.
3. github/copilot-cli#4349 — fail-closed on a schema mismatch blocked every
   non-built-in MCP server, with the only diagnostic in a raw process log.

Measured 2026-11-23 on 2.3.2, temp `XDG_CONFIG_HOME`: `opencode --standalone
debug config` with three statements (one valid, one misspelled action, one
misspelled effect) printed **one** — the invalid statements are dropped before
that surface prints. `opencode debug` has no policy subcommand; there is no
validate mode.

## 4. Hypotheses, steelman and strawman

| # | Claim | Steelman | Strawman (the thing it is not) | Cheapest discriminator |
|---|---|---|---|---|
| H11 | The fail-open is a documentation problem, not a code problem | The plugin cannot observe the decision: a `plugin.use` deny means no code of ours runs, and a dropped statement means no decision was ever made — there is nothing to read | "Add validation to the plugin" — the plugin never sees the statement list, and the remote path cannot be validated from here at all | Read the two vendor sources; no probe needed |
| H12 | A drop can be detected by comparing what a source file declares with what `debug config` prints for that source | `debug config` prints validated `info.policies` per document; a file with 3 statements printing 1 is a drop, without knowing the action enum | "Parse the config and check action names against the enum" — drifts with every new action and false-warns on a newer client | E-D59: three fixtures, declared vs printed counts |
| H13 | The ten loads are ten plugins in one generation, not ten generations | The log line is per plugin per generation and this machine configures around ten plugins; one `config.updated` is one generation | "The watcher storms" — that needs ten `config.updated` events, which the log would show | E-D57: count `config.updated`, distinct ids, and `loading plugin` lines in the existing log |
| H14 | Muse's policy plane is alive and still unexpressible | 1.4.13's resume fix names managed policy; the validator on 1.4.25 accepts no member that binds; the version has not moved | "It is abandoned" — a current changelog entry references it | `muse --version` (done: 1.4.25, unchanged) plus the changelog quote |

Order: H11 first (it is the round's only defect), H13 second (free, and it
settles a claim already in the record), H12 third (only if the doctor row is
chosen), H14 last (documents only).

## 5. Decisions and their branches

### D54 — The hard-stop paragraph

Options: (A) status quo; (B) one clause after the two-statement block: statements
that fail validation are dropped with a warning in the server log, the rest still
applies, nothing matching means allowed, so check the log and prove the deny by
its effect; (C) B plus the Console sentence (remote drops are silent); (D) B plus
a strictness recommendation ("ask the vendor for strict validation").

**Recommend C.** B is the fix the review asked for; the Console sentence is one
more sentence and it is the case where the user cannot check the log at all.
D is not ours to recommend: fail-closed has a measured cost (Copilot #4349), and
the vendor issue already asks for the option.

Where it lands: README "A hard stop, if you want one", after the two-statement
block and before the `tool.use` example; `docs/compatibility.md` gets one line
(the local path warns, the remote path does not); the coverage table gains the
row in D55's branch.

### D55 — Does the doctor check for dropped statements?

| Option | Shape | Cost | Risk |
|---|---|---|---|
| A | No row; the clause is the whole fix | 0 | The check stays manual, in a log the user may not know exists |
| B | For each `debug config` document, read the file at `path`, count declared statements, compare with `info.policies`; warn when fewer will be enforced | reads files the doctor already lists; a JSONC reader of our own (~30 lines, no dependency) | a source we cannot parse is skipped silently; `experimental.policies` merges and must be counted too |
| C | Validate `action`/`effect` against the published enum | same reader | drifts with the vendor's enum; a newer client's valid action reads as a typo |
| D | Print the effective statements, no comparison | same reader, less value | says what is enforced but not what was lost |

**Recommend B, conditional on E-D59.** It detects exactly the silent drop without
owning the schema, and the doctor already spawns the command that prints the
validated arrays. If E-D59 shows the comparison is not faithful (merges,
dedupes, or counts that disagree for a clean file), take A and say in the
evidence that the check was measured and declined.

### D56 — The reload count

Branch on E-D57:

- **one generation, ten plugins** → correct E-D55's wording in the evidence and
  the coverage audit; no code change; the "storm" was a log shape.
- **ten generations** → name the trigger from the log (watcher line, path) and
  record it; fix only if E-D60 shows `setup()` is not idempotent, in which case
  the fix is idempotency, not the watcher.
- **neither separable from the log** → record the count as unexplained a second
  time, with the two candidate mechanisms named, and spend the one conditional
  paid turn (E-D61).

### D57 — Muse's policy plane

Options: (A) leave the X row as written; (B) add the 1.4.13 citation showing the
plane is current, and the version check showing no re-probe was justified.

**Recommend B.** One sentence, and it answers "arriving or abandoned" with
evidence instead of an impression.

### D58 — Console-delivered policy

Options: (A) leave as untestable; (B) untestable, plus the remote decoder's
silence as a recorded fact; (C) a doctor row that reports whether the Console
connection is present and calls it policy.

**Recommend B.** C is the same false positive round 10 declined: the built-in is
the connection, not a statement.

## 6. Experiments

Paid turns: **zero planned, one conditional** (E-D61, only if E-D57 cannot
separate the two readings). Everything else is free and uses the existing log or
temp configs.

| Ref | Question | Method | Cost | Decides |
|---|---|---|---|---|
| E-D57 | Are the ten loads one generation or ten? | Re-read round 10's `scratch/round-10/E-D51*.log`: count `config.updated`, `watcher started`, `loading plugin` and the distinct ids per burst; correlate with timestamps | free | H13, D56 |
| E-D58 | Does `debug config` keep a statement that fails validation? | Temp `XDG_CONFIG_HOME` with one valid and two invalid statements; compare the file with the printed `info.policies` | free — **done 2026-11-23**: 3 declared, 1 printed | H12's premise, D55 |
| E-D59 | Is declared-vs-printed a faithful drop count? | Three fixtures: (a) one valid + one invalid; (b) valid `policies` plus `experimental.policies`; (c) a project file and a global file each with policies. Record declared, printed, and which source each came from | free | H12, D55 |
| E-D60 | Is `setup()` idempotent across a reload? | Offline: load the module twice against one fixture, count bridges, timers and ledger rows; reuse any existing test that already covers a second load | free | D56's fix branch |
| E-D61 | **Conditional.** Does a write under a watched directory produce a generation? | One paid turn with `--log-level debug`, touching a file in the temp config dir mid-turn; count `config.updated` per touch | 1 turn | D56, only if E-D57 fails |

Every experiment writes raw output to `scratch/round-11/<ref>.{out,err,log}` and a
paragraph to `docs/decision-evidence.md`. E-D58's output is already in this
plan's §3; it still gets the raw files and the paragraph.

**Limitations to record, not paper over:** a Console workspace cannot be
exercised here, so D54's Console sentence rests on the vendor issue and not on a
measurement; the doctor row (if chosen) can only see files it can read, and says
nothing about the remote path; and `watcher.ignore`'s behaviour (#55934) is the
vendor's report, not our measurement, unless E-D61 runs.

## 7. Documentation work

- `README.md`: the clause (D54); one sentence in the headless/limits area only if
  the Console case is not already covered there (it is not — the posture bullet
  says a policy deny is invisible, which is the neighbouring fact).
- `docs/compatibility.md`: the local-warns / remote-silent split, as a
  version-dependent fact.
- `docs/decision-coverage.md`: the new row (P if D55 is B, D if A), the round-11
  audit paragraph, counts restated.
- `docs/decision-evidence.md`: `## Round 11 — the clause, the count, and two
  recorded planes`, including E-D57's correction or confirmation of E-D55.
- `docs/round-11-research.md`: already written; add nothing except a line if a
  claim is corrected by an experiment.
- This plan's phase table, ticked as each phase closes.

## 8. Product choices for the owner

These do not fall out of the measurements. Recommendations are stated so the
answer can be one word each.

**Answered 2026-11-23: all four as recommended** — B (E-D59 came back clean), P
for the coverage row, one conditional paid turn allowed but not spent, upstream
still punted.

1. **Doctor row for dropped statements (D55).** **Recommend:** B if E-D59 is
   clean, A otherwise. B turns "check the server log" into one line from the
   doctor; A keeps the doctor's surface as it is and leaves the check to the
   reader. The clause ships either way.
2. **Coverage status for the policy-drop row.** **Recommend:** P, not D — the
   local path is covered by documentation and (if B) a doctor row, the remote
   path is not observable here, so "partial" is the honest label and it is the
   first P in the table.
3. **The conditional paid turn (E-D61).** **Recommend:** allow one, spent only if
   E-D57 cannot separate one generation from ten. If you would rather spend
   nothing, the round records the count as unexplained and stops there.
4. **Upstream filing.** Still **punted**, and now moot for this item: #60252
   already asks the vendor for strict validation. Nothing is filed.

## 9. Conditions for a confident recommendation

- **D54 is confident now.** The vendor says it, the managed path is worse per
  the vendor's own issue, and the fail-closed alternative has a measured cost.
- **D55 is confident** only if E-D59 shows declared equals printed for a clean
  file and declared exceeds printed for a file with a dropped statement, in all
  three fixtures. Any disagreement takes option A.
- **D56 is confident** if E-D57 partitions the log cleanly. If it does not, the
  count stays unexplained and that is the recorded outcome, not a guess.
- **D57/D58 are never confident from this machine.** They are sentences, not
  measurements.

What would change my mind: a `debug config` that keeps invalid statements (then
the doctor could compare directly and D55 becomes trivial); a log where the ten
loads are ten generations *and* `setup()` is not idempotent (then the round's
headline is a defect, not a clause); a Console workspace appearing on this
machine (then D58 becomes measurable and the plan stops).

## 10. Phases

| Phase | Work | Gate | Status |
|---|---|---|---|
| S0 | Confirm §3 against the installed build: the `debug config` drop, the missing validate mode, the version | Raw output in `scratch/round-11/` | done |
| S1 | E-D57 — the ten loads from round 10's log | Generation count named | done — one generation, one `setup()`, ten loader entries |
| S2 | E-D59 — the count comparison, three fixtures | Declared vs printed table | done — faithful in all three plus duplicates |
| S3 | D54 — README clause and the compatibility line | Diff reads as one paragraph, not a warning label | done |
| S4 | D55 if chosen — the doctor row and its tests | `bun run check:offline` green | done — `policies` row, 9 tests, live run prints `2 declared, 1 enforced` |
| S5 | E-D60 — idempotency across a reload | Named, or covered by an existing test | done — one setup, one cleanup; no test invented |
| S6 | D57/D58 — one sentence each, with the citations | Suite green | done |
| S7 | Evidence section, coverage row and counts, audit paragraph | `bun run check:offline` green | done |
| S8 | Stop and report: one line per decision and experiment, the suite result, the product choices, ask before committing | Owner gate | waiting |

## 11. Prohibitions (inherited)

- Never edit the real `~/.config/opencode`. Every probe uses a temp
  `XDG_CONFIG_HOME`, and `auth.json` is copied into it or Muse login is lost.
- Muse CLI work runs under `zsh -lc`, never `bash -lc`. No `muse acp`.
- No push, tag, publish, or new dependency. Scratch output stays in the
  gitignored `scratch/`.
- `docs/integration-landscape.md` is read-only, never staged.
- Temporary instrumentation in `src/` is reverted before any commit and
  `git diff src/` is checked.
- No claim about Console-delivered policy beyond the quoted vendor issue, and
  none about Muse's managed channel beyond the changelog.
- The source read and the vendor docs are evidence about *shape*; where they
  disagree with the installed build, the build wins and the disagreement is
  recorded.
