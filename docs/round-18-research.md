# Round 18 research: the fourth status

Round 17's load-bearing row named a status value `codex doctor` does not have,
implied a skip state it does not have, and said its charter was copied line for
line when the header amends it. Correcting the row does not weaken the argument;
it moves the subject. The class still gates its required checks, and `codex
doctor` still gates on `Fail` only. What changes is *why* the flag work exists:
the fourth status is this doctor's own, and the flags are downstream of it.

Six findings, each with its experiment:

1. **The codex row, re-read.** `CheckStatus` is `Ok | Warning | Fail`; there is no
   `idle` and no skip state, because every check runs. Exit 1 iff
   `overall_status == Fail`; `warn` never gates. `--json` carries `schema_version`,
   `generated_at`, `overall_status`, `codex_version` (E-D100).
2. **The charter is adopted, not copied.** Codex's rule is one sentence; this
   header restates it and names two exceptions, `muse` and `opencode`, because the
   literal rule would forbid the host probe this tool exists to run. The amendment
   is the evidence the charter is operative (E-D101).
3. **Codex is the analogue for which findings gate, not for did-not-look.** Its
   three-value model has no `!asked` branch, no `--offline`-means-fail question and
   no ladder, because it has one fewer value — not because it chose better flags.
   This doctor's `skipped` is its own; `exitCode` never reads it (E-D102).
4. **The field ships both shapes.** A per-row status in `vercel doctor` and
   `proqi doctor`; an outcome dimension in `a4 doctor`'s `unknown`, `recon
   doctor`'s `info`, Vue Doctor's exit 3 and ripr's advisory probes. The fork is
   open, not settled against `skipped` (E-D103).
5. **The width evidence is expo, not brew.** #37879 is a user asking why the error
   appears when the build succeeds; the log's own advice offers
   `listUnknownPackages: false`, and a follow-up user took the advice, went clean,
   and broke the dev build. The suppression is the cost of a wide gate (E-D104).
6. **The roll-up is absent, and D85's cost is doctrinal.** Codex's `overall_status`
   is the maximum row severity, not D80's `gate` field; this report has `asOf`,
   `checks`, `hooks` and no roll-up. One exit code states the verdict and refuses
   the cause — a doctrine, not a missing diagnostic (E-D105, E-D106).

## 1. The codex row, re-read

Read from `codex-rs/cli/src/doctor.rs` at `main` on 2026-11-23 (E-D100):

```rust
enum CheckStatus {
    Ok,
    Warning,
    Fail,
}
```

Three values, serialized snake_case. There is no `Skipped`, no `Idle`, and no
fourth value under another name. `run_doctor` renders the report and then:

```rust
if report.overall_status == CheckStatus::Fail {
    std::process::exit(1);
}
```

`overall_status` is the maximum row severity: any `Fail` makes it `Fail`, else any
`Warning` makes it `Warning`, else `Ok`. `build_report` runs a fixed set of checks;
on a config-load failure it runs a fallback subset. Every check in the set runs,
which is why there is no skip state — not because codex chose a stricter status
policy, but because it never has a row that did not look.

The JSON report is `schema_version`, `generated_at`, `overall_status`,
`codex_version`, and `checks` keyed by check id. `schema_version` is 1;
`generated_at` is "seconds since unix epoch", not ISO.

Round 17's table row said "`warn` and `idle` do not gate" and, in the skip column,
"reported as a row; no separate code". Both are wrong in the same direction: the
first invents a value, the second implies a skip status exists. The corrected row
says `warn` only, and the skip column says "none: every check runs". D88 stands —
the class gates its required checks, the tally is 4–2–1, and codex is the narrow
gate — but the row now describes the model it actually has.

The correction matters beyond the cell. Codex's three-value model is the reason it
has no `!asked` branch, no `--offline`-means-fail question, and no ladder. It did
not solve the did-not-look problem better; it does not have the problem. §3
develops that.

## 2. The charter, adopted

Codex's module doc has one sentence for the rule:

> PATH entries are untrusted data: checks may inspect them, but must not execute
> the programs they select.

`scripts/doctor.ts`'s header does not copy that line. It restates it and then names
where it does not hold:

> The rules are the ones `codex doctor` and `claude doctor` follow: read-mostly,
> one row per check with a remediation line, `--json` for a report, and nothing
> executed that was merely found on `PATH` — with two named exceptions, the host
> CLIs this plugin is built for: `muse` for the host probe and `opencode` for the
> plugin entries, which no other surface answers.

The literal rule would forbid this tool's entire job, because the host it
diagnoses is a binary on `PATH`. A project that copies the sentence verbatim and
then runs `muse` either breaks the rule silently or ships a header that is false.
This one restates the rule and names the two exceptions, so the charter is doing
work rather than decorating a comment. That is stronger evidence than a copy: the
amendment is the one-sentence doctrine split — the rule in one sentence, then the
two places it does not hold — and it is what a reader should be able to check.

The record should say "adopts the rule and names two exceptions", not "copies line
for line, including". The second invites a diff of the two files and loses.

## 3. The status model: three values vs four

Codex has three values because every check runs. This doctor has four:

```ts
type Status = "ok" | "warn" | "fail" | "skipped";
```

`skipped` is written by the `plugins` row when the host did not answer, by
`policies` when the host did not answer, when a file was rejected, when the log
was absent, or when no source declares statements, by both config rows under
`--offline`, and by `allowance` when there is no usage observation. The gate does
not read it:

```ts
export function exitCode(checks: readonly Check[], gate: Gate): number {
  if (checks.some((check) => check.status === "fail")) return 1;
  if (!gate.gated) return 0;
  if (!gate.asked) return 1;
  if (!gate.answered) return 1;
  const discarded = checks.some((check) => check.id === "config");
  const dropped = checks.some((check) => check.id === "policies" && check.status === "warn");
  return discarded || dropped ? 1 : 0;
}
```

The gate's did-not-look logic is the run-level `asked` and `answered` booleans,
not a row's `skipped`. That is the precise mechanism behind the critique's
reading: the fourth status is why the report needs a did-not-look vocabulary,
`--offline` is the control that produces it, `asked` is the gate's response, and
the deleted `--strict` existed to make `!asked` fail. The flags are downstream of
the status model, but the gate does not read the status. The flag question was a
status-model question wearing a flag's clothes, with one correction: the status is
the vocabulary, the booleans are the gate.

`skipped` carries two senses today:

- **did not look** — `--offline`, the host did not answer, the log was absent;
- **nothing to look at** — `policies` because no source declares statements,
  `allowance` because there is no usage observation.

The shipped answer is coherent and small: a run that is entirely skipped under the
gate is a failed gate (`asked && !answered`), while `policies: skipped` because no
statements were declared is not a failure, because nothing was dropped. The
question the critique raises is whether one status should carry both senses at
all, or whether "did not look" is a dimension beside the outcome. That is Q1, and
it is the only fork in this round that would be a code change.

The code cost of the fork is small but not zero: one type, the six rows that write
`skipped`, the `exitCode` tests, the `--json` shape, and the 31 test mentions of
the word. There is no consumer outside this tree (E-D78), so the fork is a design
choice, not a compatibility one.

## 4. The field ships both shapes

The critique's two examples — Vue Doctor's exit 3 and ripr's advisory probes — are
the outcome shape. The field also ships the per-row status shape, which is what
this doctor has:

| Tool | Did-not-look value | Shape | Gates on it | Roll-up |
|---|---|---|---|---|
| `vercel doctor` | `Skipped`; a check that needs a login is skipped and says why | per-row status | no; exits 0 even when checks fail | not stated |
| `proqi doctor` | `Skipped`; "optional capability or state was not applicable" | per-row status | not stated | `max`, with `Skipped` above `Ok` |
| `a4 doctor` | `unknown`; "could not be decided" | outcome value | no; exit 0 for `unknown` | `unknown` propagates when nothing warns or fails |
| `recon doctor` | `info`; informational | outcome value | no; `info` never raises the summary | worst status, `info` never raises |
| Vue Doctor | exit 3 under `--strict` | outcome (code) | yes, under `--strict` | n/a |
| `ripr doctor` | optional probes advisory | outcome (contract) | no | n/a |
| this doctor | `skipped` | per-row status | the run-level `asked`/`answered`, not the row | none |

Two shapes, both shipping. The fork is therefore open, not settled against
`skipped`; what the field agrees on is narrower: a did-not-look value exists, and
it is not a failure by itself. The four new rows are cited from documentation or
source and are not installed here; they are breadth for the status model, not new
members of §1's seven-doctor tally, which is about polarity.

The table also exposes the roll-up problem. `proqi` puts `Skipped` above `Ok` and
computes `overall_status` as the maximum; `a4` lets `unknown` propagate; `recon`
lets `info` never raise the summary. Any `overall_status` for this doctor has to
decide where `skipped` sits before the field means anything. That is why the
absent roll-up (§6) is not a free addition.

## 5. The width evidence: expo

`expo-doctor` #37879 is a user asking, in the issue title and body, why the error
appears when the build succeeds: "Although the package can be built successfully,
why does this error always appear in my GitHub Actions logs every time?" The log
names two failed checks and then, in its own advice for the directory check, offers
the off switch:

> Alternatively, set `expo.doctor.reactNativeDirectoryCheck.listUnknownPackages`
> in package.json to false to skip warnings about packages with no metadata, if the
> warning is not relevant.

A maintainer's reply is that the exit is intentional: "The checks are failing, and
the process exits with code 1 to notify you of that. Read the lines titled 'advice'
in the commands output and resolve the issues."

The suppression has a measured cost. A StackOverflow question the same week
(79689733) follows the adjacent advice — add the package to
`reactNativeDirectoryCheck.exclude` — and reports that the doctor went clean and
the dev build then failed to resolve the excluded package: "It would appear that
this does more than exclude it from doctor." Removing the exclusion made the dev
client build and run again.

That is the degradation the narrow required set avoids, observed in a shipping
project rather than argued: a gate wide enough to fire on a non-blocking finding
offers its own off switch, and the off switch hides a real break. Brew is the same
lesson at a distance — it gates every finding and then tells you to ignore them.
Expo is the better lead because the remedy is in the log, and the cost is a
follow-up report rather than an inference.

Two details sharpen it. Disabled checks leave the denominator — the log says
"13/15 checks passed", not "13 passed, 2 skipped" — and expo's off switches are
configuration (`reactNativeDirectoryCheck.enabled`, `install.exclude`,
`EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK`), not a row status. The tool's answer
to "this finding is not relevant" is to remove the check, which is exactly the
shape this doctor's narrow required set exists to avoid.

The caveat: the directory check is a warning about unknown package metadata, not a
declaration the user made that is not in force. It argues the *width* case, not the
polarity. D88's required set is still the config-integrity rows.

## 6. The absent roll-up, and D85's cost

`codex doctor --json` carries `schema_version`, `generated_at`, `overall_status`,
`codex_version`, and `checks` keyed by id. This doctor's report is:

```ts
interface Report {
  asOf: string;
  checks: Check[];
  hooks: HookReport | null;
}
```

No roll-up, no schema version, no tool version. `overall_status` is not the `gate`
field D80 refused: `gate` is the decision ("may I ship?"), while `overall_status`
is the maximum row severity. The gate also reads `asked`, `answered`, the presence
of a `config` row and `policies: warn`, so a roll-up would not equal the exit code
even if it existed. Its absence means a caller re-derives the maximum from the
rows.

That is a gap in the charter's shape, not a task. No consumer reads the report
(E-D78), so the flip condition has not fired. The condition is a consumer that
reads `--json` for the roll-up, or `scripts/` becoming a published surface. Record
it; do not build it.

D85's cost belongs beside it, and it is doctrinal rather than diagnostic. One exit
code answers "did this certify?" and refuses "why not". The rows and `--json`
answer the second. A shell caller cannot tell "fix your config" from "install
`opencode`" without the report — that is true, but it is not a missing diagnostic;
it is the doctrine that the code is a verdict and the report is the diagnosis. The
flip condition is unchanged: a caller that branches, or a published `scripts/`.

## 7. Steelman and strawman

**For splitting `skipped` into an outcome dimension.** The gate never reads it, so
the status is free to be redesigned. The report currently conflates "did not look"
with "nothing to look at", and a roll-up has to invent an ordering for a value
that is not a severity. The field ships the dimension shape (`a4`'s `unknown`,
`recon`'s `info`, Vue's exit 3, ripr's advisory probes), so a dimension is not
exotic. Steelman: if `--json` becomes a contract, a per-row `skipped` forces every
consumer to know that one of the four statuses is not a severity, and the first
consumer to compute a maximum will get it wrong.

**Against.** There is no consumer, the gate already separates did-not-look at run
level, a dimension changes the JSON schema and the tests, and the two senses can be
documented without a type change. The status is a report value; the gate is
`asked`/`answered`. The cheapest correct move is to say that, not to refactor the
type.

**Strawman one:** "codex has three values, so copy three." It cannot: codex has no
skip because every check runs, and the literal charter cannot be copied either.
**Strawman two:** "`overall_status` is the gate." It is the maximum row severity;
the gate also reads the run-level booleans. Adding the roll-up would not make the
exit code derivable from the report.

**For adding `overall_status` now.** The charter has it, a caller should not
re-derive, and the field is cheap. **Against.** No consumer, the four-value
ordering is a real decision (`proqi` puts `Skipped` above `Ok`; `a4` propagates
`unknown`; `recon` lets `info` never raise), and D80 refused the adjacent `gate`
field. The honest shape is a note with a flip condition.

## 8. Experiments

| Id | Question | Result |
|---|---|---|
| E-D100 | What is `codex doctor`'s status model, exit mapping and JSON shape? | `CheckStatus { Ok, Warning, Fail }`; exit 1 iff `overall_status == Fail`; `overall_status` is the max row severity; no skip state because every check runs; JSON has `schema_version`, `generated_at`, `overall_status`, `codex_version`, `checks` keyed by id. Source, read 2026-11-23. |
| E-D101 | Does `scripts/doctor.ts` copy codex's PATH rule? | No. The rule is one sentence; the header restates it and names two exceptions, `muse` for the host probe and `opencode` for the plugin entries, "which no other surface answers." The literal rule would forbid the host probe. |
| E-D102 | Where does this doctor's `skipped` enter the gate? | Nowhere. `exitCode` reads `fail`, `policies: warn`, `asked` and `answered`; `skipped` is written by the plugins, policies, offline, hooks and allowance rows. The two senses are did-not-look and nothing-to-look-at. |
| E-D103 | How does the field model a check that did not run? | Both shapes ship: per-row status (`vercel doctor`, `proqi doctor`) and outcome value (`a4 doctor`'s `unknown`, `recon doctor`'s `info`, Vue's exit 3, ripr's advisory probes). Roll-up conventions differ. Cited, not measured. |
| E-D104 | Is expo width evidence, and what does suppression cost? | #37879: the user asks why the error appears when the build succeeds; the log's advice offers `listUnknownPackages: false`; the maintainer calls the exit intentional. StackOverflow 79689733: a user took the exclude advice, the doctor went clean, the dev build failed to resolve the excluded package. Disabled checks leave the denominator (13/15). |
| E-D105 | What does this report's `--json` carry, and what does codex's carry? | This: `asOf`, `checks`, `hooks`. Codex: `schema_version`, `generated_at`, `overall_status`, `codex_version`, `checks` keyed by id. `overall_status` is the max row severity, not D80's `gate`. |
| E-D106 | Is D85's cost diagnostic or doctrinal? | Doctrinal: the code states the verdict ("did this certify?") and refuses the cause; the rows and `--json` state the cause. The flip condition is a caller that branches or a published `scripts/`. |

## 9. What stays unmeasurable

- A consumer of this doctor's `--json` or exit code: still none (E-D78).
- The four breadth doctors: cited from documentation or source, not installed.
- The status refactor's cost: an estimate from the type, rows and tests, not a
  measurement, because no code changes this round.
- Whether the owner wants the roll-up now: Q2, a product question.
- Whether `skipped` should be one value or a dimension: Q1, a product question.

## 10. Sources

- `codex doctor`, source read 2026-11-23:
  https://github.com/openai/codex/blob/main/codex-rs/cli/src/doctor.rs
- `scripts/doctor.ts` header, this tree, lines 1–14.
- `expo-doctor` #37879: https://github.com/expo/expo/issues/37879 ; suppression
  cost: https://stackoverflow.com/questions/79689733 ; config:
  https://docs.expo.dev/versions/latest/config/package-json/ ; environment
  variables: https://www.npmjs.com/package/expo-doctor
- `vercel doctor`: https://vercel.com/docs/cli/doctor
- `proqi doctor`: https://docs.rs/proqi/latest/src/proqi/adapters/doctor.rs.html
- `a4 doctor`: https://docs.arete.run/cli/commands
- `recon doctor` schema: https://github.com/blisspixel/recon/blob/main/docs/schema.md
- Vue Doctor and ripr: round 17 §1, E-D90 and E-D94.
- D80 (`gate` field), D85 (one code), E-D78 (no consumer): round 16.
