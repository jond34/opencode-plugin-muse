# Round 17 research: the class the witnesses came from

Round 16 deleted `--strict` and restated the gate as a property. It left one
objection standing: the polarity argument leaned on config loaders and compilers,
while the doctor class — the class this tool is actually in — was represented by a
single cell, `brew doctor`. Measured properly, the class does not split 3–1 against
gating. It splits 4–2 for, and the axis inside it is not "does the doctor gate" but
**which checks are required**.

Seven findings, each with its experiment:

1. **The class, measured.** `codex doctor`, `brew doctor`, `expo-doctor` and
   `ripr doctor` gate; Vue Doctor and `claude doctor` do not; `flutter doctor`
   returns a warning status on issues, uncounted here because its numeric mapping
   was not pinned (E-D90–E-D97).
2. **The axis is the required set.** `codex doctor` exits 1 only when a check is
   `Fail`, never on `warn`; `ripr doctor` fails only its required checks and calls
   optional probes advisory; brew and expo gate every finding; Vue and claude
   require nothing (E-D92, E-D94).
3. **`codex doctor` is the charter this script already cites**, and it gates. The
   "dominant harness" is split 1–1, not unanimously permissive (E-D92).
4. **Vue Doctor's `--strict` means what the deleted flag meant** — exit 3 when an
   analyzer fails or is skipped. D89's "everywhere else" is too strong; the
   deletion stands on reachability, not on the name (E-D90, E-D98).
5. **The exit-2 class is the tool's own setup**, never the user's project config:
   alint's 2 is alint's `.alint.yml`, eslint's 2 is eslint's config, Vue Doctor's 3
   is its analyzer. This doctor has no setup of its own, so the class has no
   referent here (E-D95).
6. **`claude doctor` is the divergence, and it is checkable.** It exits 0 on a
   broken settings file and is byte-identical on a misspelt key; this doctor names
   the dropped statement by pointer and exits 1 (E-D91).
7. **Report-only is a live fork, not a settled answer**: two verbs (ripr), one flag
   off by default (Vue), no flag (codex/brew/expo), one flag on by default (this
   repo) (E-D94, E-D90, E-D92).

## 1. The class, with the witnesses the argument needs

| Doctor | Gates findings by default | Which checks are required | Skip / could-not-evaluate | Source |
|---|---|---|---|---|
| `codex doctor` | yes, exit 1 | rows with status `Fail`; `warn` does not gate | none: every check runs, so there is no skip state | source (E-D92) |
| `brew doctor` | yes, exit 1 | every finding (`fatal: true`); the relaxation is an internal caller | — | E-D81 |
| `expo-doctor` | yes, exit 1 | every failed check | `Log.exit` on failure | source (E-D93) |
| `ripr doctor` | yes, exit 2 | required checks; optional probes stay advisory | 2; `check` is advisory by contract | docs (E-D94) |
| `flutter doctor` | warning status on issues | `diagnose()` returning false | — | source (E-D96) |
| Vue Doctor | no | none by default; `--fail-on` / `--min-score` opt in | `--strict` → exit 3 | docs (E-D90) |
| `claude doctor` | no, always 0 | none | always 0 | measured (E-D91) |

> Round 18 §1 re-read the source: `CheckStatus` has three values and no skip
> state, and the header adopts the PATH rule with two named exceptions. The codex
> row above is the corrected one (E-D100, E-D101).

Four gate, two do not, one uncounted. The round-15 objection — "the doctor class
splits against gating" — came from a set that omitted `codex doctor`, `expo-doctor`
and `ripr doctor` and counted only brew against Vue and claude.

**The reading that predicts.** The class does not disagree about polarity; it
disagrees about *what is required*. `codex doctor` is the sharpest case: it has the
same rows this doctor has (installation, config, auth, runtime, state), it prints
`warn` for anomalies, and it exits 1 only on `Fail` — the narrow gate, in the tool
whose charter `scripts/doctor.ts` adopts. The rule is one sentence: "PATH entries
are untrusted data: checks may inspect them, but must not execute the programs they
select." The header then names the two exceptions — `muse` for the host probe and
`opencode` for the plugin entries, "which no other surface answers" — because the
literal rule would forbid the host probe this tool exists to run. The amendment is
the evidence the charter is operative, not a copy (E-D101). `ripr doctor` draws the same line between required checks and
advisory probes. Brew is the counter-lesson about *width*: it gates every finding
and then tells you to ignore them, which is why the narrow set matters.

This doctor's required set is the config-integrity rows — a refused file, a dropped
statement, a run that did not look — and its advisory set is the machine and the
install. That is `codex doctor`'s shape, not brew's.

## 2. Vue Doctor inverts the default, and why it is not a counterexample

The CLI reference, fetched 2026-11-23 (E-D90):

```
--fail-on <severity>   Gate threshold (none, error, warning). Default: none.
--gate <scope>         Gate scope (all or new). Default: all.
--min-score <score>    Fail gate if score is below this threshold (0–100).
--strict               Exit with code 3 if any analyzer fails or is skipped.
```

Exit codes 0 OK, 1 gate breached, 2 usage/bad config, 3 analyzer failure under
`--strict`. `--gate` is the *scope* of the gate (all findings or only new ones), not
its polarity; reading it as a second polarity flag is a misread.

Vue Doctor's findings are a 100-point quality score over a codebase — every check is
advisory by nature, so requiring none by default is coherent. Its `--strict` is the
"did not look" case, opt-in, with a distinct code. The structure agrees with round
16's deletion: a skipped analyzer is a separate outcome, not a modifier inside
another flag's branch. What it does not witness is a config-integrity gate, because
it has no analogue of "the user's declaration is not in force".

## 3. `claude doctor`: the divergence, named

Measured on 2.1.237 and 2.1.299 (E-D91), in a throwaway home with no session:

- exit 0 in every case, including a trailing-comma `settings.json` and a wrong-type
  value;
- a misspelt key (`permisions`, `outputStile`, `permissionmode`) produces output
  byte-identical to the correct file — the report never mentions it;
- a malformed file is named under `Invalid settings` with its path, and a wrong type
  is named with the key; neither changes the exit code;
- the help text says it "reads settings files in the current directory without a
  trust prompt", and the CLI reference calls it "read-only installation and settings
  diagnostics".

So the divergence is real and specific: **on the failure rounds 11–14 kept finding —
a declaration silently not in force — `claude doctor` is silent and exits 0; this
doctor names the statement by `$.experimental.policies.N` and exits 1.** That is a
checkable superiority claim, and it is the one to put in `compatibility.md`. The
concession goes with it: `claude doctor` names a malformed file's path and a
wrong-type key, which this doctor's `config` row does only at file granularity,
with the host's message text.

The "dominant harness" framing does not survive either: the two coding-agent
doctors split. `codex doctor` gates; `claude doctor` does not. The divergence is
from one sibling, and the other sibling is the charter.

## 4. The exit code: whose config

The field's "could not evaluate" code is always the **tool's own** setup, not the
user's project:

| Tool | code | what is misconfigured |
|---|---|---|
| eslint | 2 | eslint's config, or an internal error |
| alint | 2 | alint's `.alint.yml`, an unknown field, an invalid flag |
| alint | 3 | alint's internal error, split from 2 so CI can tell them apart |
| Vue Doctor | 2 / 3 | usage or bad config / analyzer failure |
| ripr | 2 | its input, config, analysis, output, or a policy rejection |
| grep | 2 | an I/O error, not a match |
| `git diff --check` | 2 | findings — the outlier that proves the number is not a kind |

This doctor has no config file, no analyzer, no score. Its only config is the user's
`opencode` config, and a refused file there is a *finding about the user's
declaration*, which belongs in the gate — not in a "the tool is broken" code. The
exit-2 class has no referent here. That is the missing statement behind D71/D85, and
it is stronger than "CI collapses both".

`ripr` sharpens the point: the same project publishes 0/2 in one variant and 0/2/3 in
another, where 3 means "the command ran and reached a blocking decision". Even
within one family the digits are not a contract (E-D94).

## 5. `--strict` is split, not wrong

| Tool | `--strict` means |
|---|---|
| yamllint | warnings-only returns 2 |
| `poetry check`, `composer validate` | warnings fail |
| Vue Doctor | exit 3 if an analyzer fails or is skipped |

D89 said the name "means something else everywhere else". It means two things, and
one of them is exactly the deleted flag's semantics. The deletion still stands, on
the ground that survives: the flag changed `exitCode` only inside the `!asked`
branch, so it was reachable only as `--strict --offline`, and the two-flag scheme
covers every cell (D82, D83). What changes is the wording: the name is ambiguous,
not uniformly foreign, and the records should say so rather than overclaim.

## 6. The report-only fork

| Shape | Tool | Where the gate lives |
|---|---|---|
| two verbs | ripr (`check` advisory, `gate evaluate` blocks) | a separate command |
| one flag, off by default | Vue Doctor (`--fail-on none`) | a threshold flag |
| no report-only mode | `codex doctor`, brew, expo-doctor | the default is the gate |
| one flag, on by default | this doctor (`--no-strict`) | the default is the gate, opt out |

All four are shipping. The fork is not settled by the field, so the choice is a
product one: the flag is the smallest change and the only shape that keeps one
command; the two-verb shape buys a report-only contract at the cost of a second
entry point; the off-by-default shape matches Vue Doctor but not the required set
this doctor actually has.

## 7. Steelman and strawman

**For flipping to report-only.** The two non-gating doctors are the ones whose
findings are quality signals, and a config-integrity row can be argued to be one
too — a plugin entry naming the published build is not a broken run. If the
required set is contested, `--fail-on`-style thresholds express it better than a
boolean, because the user picks which rows count.

**Against flipping.** The required set is exactly the failure rounds 11–14 kept
finding, E-D77 shows it does not fire on a working checkout, and the closest
sibling with the same rows (`codex doctor`) gates on `Fail`. A threshold flag would
be a third spelling of a decision the rows already encode.

**For a distinct "did not look" code.** Vue Doctor reserves 3 for it, and a script
could then tell "fix your config" from "install the host" — the cost D85 records.

**Against.** Vue Doctor needs 3 because its 0/1/2 ladder already means three things;
this doctor has one thing to say and one code. The field's 2/3 is the tool's own
setup, and there is none here (§4).

**Strawman one:** every doctor gates. False — `claude doctor` and Vue Doctor do not.
**Strawman two:** no doctor gates, because a doctor is diagnostic. False — codex,
brew, expo and ripr do. Both are refuted by §1, and both were live in the round-15
and round-16 records respectively.

## 8. Experiments

| Id | Question | Result |
|---|---|---|
| E-D90 | What are Vue Doctor's documented defaults and codes? | `--fail-on none`, `--gate all`, `--min-score` opt-in, `--strict` → 3; exit 0/1/2/3; `--offline` is network-only. Cited from the CLI reference. |
| E-D91 | Does `claude doctor` gate, and what does it say about a bad settings file? | Exit 0 in every case on 2.1.237 and 2.1.299; byte-identical output for a misspelt key; names malformed JSON and wrong types, never changes the code. Two independent measured write-ups. |
| E-D92 | Does `codex doctor` gate, and what is its status model? | Yes, exit 1 iff `overall_status == CheckStatus::Fail`; `CheckStatus` has three values — `Ok`, `Warning`, `Fail` — and no skip state, because every check runs; `warn` never gates. `--json` carries `schema_version`, `generated_at`, `overall_status`, `codex_version`. Read-mostly charter; PATH entries inspected, never executed. Source. |
| E-D93 | Does `expo-doctor` gate? | Yes; `Log.exit` when any check fails, and the maintainer calls the non-zero exit intentional. Source and issue. |
| E-D94 | What does `ripr` do? | `check` advisory (0 with findings); `gate evaluate` 2 on block; `doctor` 0/2; the swarm variant adds 3 for a blocking decision. Docs. |
| E-D95 | What does alint's 2 mean? | Its own config or usage; 3 is its internal error. Docs. |
| E-D96 | Does `flutter doctor` gate? | Returns `ExitStatus.warning` when `diagnose()` finds issues; the numeric mapping was not pinned, so it is uncounted. Source. |
| E-D97 | What is the doctor-class tally? | 4 gate (codex, brew, expo, ripr), 2 do not (Vue, claude), 1 uncounted (flutter). |
| E-D98 | Is `--strict` uniform in the field? | No: warnings-fail in yamllint/poetry/composer; analyzer-failure in Vue Doctor. D89's wording is corrected. |
| E-D99 | Does any of this change the code? | No. `bun run check:offline` stays 416 tests; README's "419 tests" is stale from round 16 and is corrected. |

## 9. What stays unmeasurable

- `flutter doctor`'s numeric exit code: the enum and the return line are read, the
  mapping is not; it is left out of the tally rather than guessed.
- None of the seven doctors is installed here; every cell is cited from source or
  documentation, except `claude doctor`, which two independent write-ups measured.
- A real consumer of this doctor's exit code: still none (E-D78).
- Whether a user prefers a boolean or a threshold for the required set: a product
  question, raised as Q1 in the plan.

## 10. Sources

- `codex doctor`, source and charter:
  https://github.com/openai/codex/blob/main/codex-rs/cli/src/doctor.rs ; CLI
  reference: https://developers.openai.com/codex/cli/reference
- Vue Doctor CLI reference: https://remylagerweij.github.io/vue-doctor/reference/cli ;
  exit codes: https://remylagerweij.github.io/vue-doctor/guide/cli-usage ; CI guide:
  https://remylagerweij.github.io/vue-doctor/guide/ci
- `claude doctor`, measured: https://www.dankdev.com/Blog/claude-code-doctor ;
  https://claudelab.net/en/articles/claude-code/claude-code-settings-typo-key-silently-ignored-doctor-gate
- `expo-doctor`, source:
  https://github.com/expo/expo/blob/main/packages/expo-doctor/src/doctor.ts ;
  maintainer confirmation: https://github.com/expo/expo/issues/37879
- `ripr` exit codes: https://github.com/EffortlessMetrics/ripr/blob/main/docs/EXIT_CODES.md ;
  the three-code variant:
  https://github.com/EffortlessMetrics/ripr-swarm/blob/main/docs/EXIT_CODES.md
- alint severity and exit codes:
  https://alint.org/docs/concepts/start-here/severity-and-exit-codes
- `flutter doctor`, source:
  https://github.com/flutter/flutter/blob/master/packages/flutter_tools/lib/src/commands/doctor.dart
- brew, eslint, grep, `git diff --check`, yamllint: round 16 §3 and E-D81.
