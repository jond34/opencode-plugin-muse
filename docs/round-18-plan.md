# Round 18 plan: the fourth status

Round 18 is a records round with one factual correction at its centre. No code
changes. Two commits: the correction to round 17's load-bearing row, then this
round's records. The correction is not cosmetic — it changes what the round is
about, from the flags to the status model.

Evidence: `docs/round-18-research.md` (E-D100–E-D106). This plan names the
decisions, the exact edits, the product questions, and the conditions that would
change the answers.

## Decisions

**D94 — the codex row is corrected to three statuses and no skip state.**
`CheckStatus` is `Ok | Warning | Fail`; exit 1 iff `overall_status == Fail`;
`warn` never gates; every check runs, so there is no skip state. The table's gate
cell loses `idle`, the skip cell becomes "none: every check runs", and E-D92 says
the enum, the exit mapping, the no-skip reason and the `--json` fields. D88 stands:
the class still gates its required checks, the tally is 4–2–1, and codex is the
narrow gate. This is a correction of fact, not a reversal.

**D95 — the charter is adopted, not copied.** Codex's rule is one sentence:
"PATH entries are untrusted data: checks may inspect them, but must not execute the
programs they select." `scripts/doctor.ts` restates it and names two exceptions,
`muse` for the host probe and `opencode` for the plugin entries, "which no other
surface answers", because the literal rule would forbid the host probe this tool
exists to run. The record says "adopts the rule and names two exceptions"; the
one-sentence doctrine split is the rule, then the two places it does not hold. The
amendment is the evidence the charter is operative.

**D96 — codex is the analogue for which findings gate, not for did-not-look.** Its
three-value model has no `!asked` branch, no `--offline`-means-fail question and no
ladder because it has one fewer value, not because it chose better flags. This
doctor's `skipped` is its own; the flag work is downstream of the report
vocabulary. Record the limit of the analogy in §3 and the audit; do not weaken
D88's required-set reading.

**D97 — `skipped` stays a row status this round; the fork is raised, not taken.**
`exitCode` never reads `skipped`; the gate's did-not-look logic is `asked` and
`answered`. `skipped` carries two senses — did not look, and nothing to look at —
and the shipped answer (an entirely skipped run under the gate is a failed gate;
`policies: skipped` because no statements is not a failure) is coherent and smaller
than a type refactor. The cost of the fork is one type, the six rows that write it,
the tests, the `--json` shape, and 31 test mentions; there is no consumer (E-D78).
Q1 puts the choice to the owner.

**D98 — expo leads the width evidence; brew is second.** #37879 is a user asking
why the error appears when the build succeeds, and the log's own advice offers
`listUnknownPackages: false`; the maintainer calls the exit intentional. The
StackOverflow follow-up is the cost: the user took the exclude advice, the doctor
went clean, and the dev build failed to resolve the excluded package. Disabled
checks leave the denominator (13/15). This argues the narrow required set better
than brew, because the off switch is in the tool's own advice and the suppression
has a measured cost. Caveat: it argues width, not polarity.

**D99 — `overall_status` is an absent cell, recorded, not built.** Codex's
`--json` carries `schema_version`, `generated_at`, `overall_status`,
`codex_version`, and `checks` keyed by id; this report carries `asOf`, `checks`,
`hooks`. `overall_status` is the maximum row severity, not D80's `gate` field, and
the gate also reads `asked`, `answered`, a `config` row and `policies: warn`, so a
roll-up would not equal the exit code. Absence means a caller re-derives. The flip
condition is a consumer that reads the report for the roll-up, or `scripts/`
becoming a published surface. Q2 puts the timing to the owner.

**D100 — D85's cost is doctrinal, not diagnostic.** One code answers "did this
certify?" and refuses "why not"; the rows and `--json` answer why. Correct row
183's wording and carry the correction in the audit. The flip condition is
unchanged.

**D101 — the records edits and the two commits.** Round 17 research: the table
row, the §1 charter sentence, E-D92, and a short blockquote. Coverage: row 183's
refs, the D85 sentence, the status-model and roll-up sentences, and a Round 18
audit after Round 17's. New: `docs/round-18-research.md`,
`docs/round-18-plan.md`, `docs/round-18-prompt.md`. README stays at 416;
`compatibility.md` does not change; counts stay `H 41 · D 34 · P 1 · X 5 · U 1 ·
N 3`. Commit 1 is the correction; commit 2 is this round's records.

## Product questions

Raised for the owner; the plan defaults to A in each.

**Q1. The fourth status: keep, split, or collapse?**
(A) Keep `skipped` as a row status; document its two senses; keep the gate reading
`asked`/`answered`, never the status — recommended. No code change; the field
ships this shape (`vercel doctor`, `proqi doctor`), and the gate already separates
did-not-look at run level.
(B) Split the row into an outcome (`ok | warn | fail`) plus a did-not-look
dimension. The gate does not change; the `--json` shape and the tests do. Buys a
well-defined roll-up and separates the two senses. Flip A→B if a consumer computes
a roll-up, or `--json` becomes a contract.
(C) Collapse `skipped` into `warn`. Smallest code change, but a clean config with
no policies would warn, and a roll-up would treat "not looked" as "attention
needed". Not recommended.
Conditions for confidence in A: `exitCode` does not read `skipped` (E-D102), no
external consumer (E-D78), the field ships both shapes (E-D103), and the two
senses can be documented without a type change. If any fails, B.

**Q2. The roll-up in `--json`: now or later?**
(A) Later: record the gap and the distinction from D80's `gate`; no code change —
recommended. The flip condition is a consumer that reads the report for the
verdict, or `scripts/` published.
(B) Add `overall_status` now. This is not free: the roll-up over four values needs
an explicit ordering for `skipped` (`proqi` puts it above `ok`; `a4` propagates
`unknown`; `recon` lets `info` never raise). The ordering is the actual decision.
(C) Add both `overall_status` and `gate` — reopens D80; not recommended.
Conditions for confidence in A: no consumer (E-D78), the gate already returns the
verdict, and the roll-up would not equal the exit code because the gate reads
`asked`/`answered` too. If a consumer appears, B with the ordering named.

## Steps

**S1 (done).** `docs/round-18-research.md` written: the corrected codex model, the
charter amendment, the status-model reading, the four-shape breadth table, the
expo width evidence, the absent roll-up, the doctrinal cost, E-D100–E-D106,
sources.

**S2.** `docs/round-17-research.md`, three corrections and one note.

(a) The table row. Replace:

```text
| `codex doctor` | yes, exit 1 | rows with status `Fail`; `warn` and `idle` do not gate | reported as a row; no separate code | source (E-D92) |
```

with:

```text
| `codex doctor` | yes, exit 1 | rows with status `Fail`; `warn` does not gate | none: every check runs, so there is no skip state | source (E-D92) |
```

(b) After the table, before "Four gate, two do not", insert:

> Round 18 §1 re-read the source: `CheckStatus` has three values and no skip
> state, and the header adopts the PATH rule with two named exceptions. The codex
> row above is the corrected one (E-D100, E-D101).

(c) The §1 charter sentence. Replace the sentence beginning "whose charter
`scripts/doctor.ts` copies line for line" through "select\" (E-D92)" with:

whose charter `scripts/doctor.ts` adopts. The rule is one sentence: "PATH entries
are untrusted data: checks may inspect them, but must not execute the programs they
select." The header then names the two exceptions — `muse` for the host probe and
`opencode` for the plugin entries, "which no other surface answers" — because the
literal rule would forbid the host probe this tool exists to run. The amendment is
the evidence the charter is operative, not a copy (E-D101).

(d) E-D92. Replace the row with:

```text
| E-D92 | Does `codex doctor` gate, and what is its status model? | Yes, exit 1 iff `overall_status == CheckStatus::Fail`; `CheckStatus` has three values — `Ok`, `Warning`, `Fail` — and no skip state, because every check runs; `warn` never gates. `--json` carries `schema_version`, `generated_at`, `overall_status`, `codex_version`. Read-mostly charter; PATH entries inspected, never executed. Source. |
```

**S3.** Ask the owner once. If approved, commit S2 alone as the correction, with
the message `Correct the codex row: three statuses, no skip state`, then record the
short SHA for the audit. Do not include the round-18 files in this commit.

**S4.** `docs/decision-coverage.md`.

(a) Row 183 refs. Replace `D68–D71, D75–D80, D82–D86, D88–D93, E-D72–E-D99:` with
`D68–D71, D75–D80, D82–D86, D88–D93, D94–D101, E-D72–E-D106:`.

(b) The D85 sentence. Replace:

> One code, not a ladder: the field splits "could not evaluate" from "found
> problems" but not on a number (E-D84), and a shell caller cannot tell the two
> without `--json` — the cost is recorded, and the flip condition is a caller that
> branches or a published `scripts/` (D85).

with:

> One code, not a ladder: the field splits "could not evaluate" from "found
> problems" but not on a number (E-D84), and the code states the verdict — did this
> certify? — while refusing the cause; the rows and `--json` state the cause. That
> is a doctrinal cost, not a missing diagnostic, and the flip condition is a caller
> that branches or a published `scripts/` (D85, D100; E-D106).

(c) After "so the class has no referent here (D93, E-D95).", insert:

> `skipped` is a report value, not a gate input: `exitCode` reads `fail`,
> `policies: warn`, `asked` and `answered`, never a row's `skipped`, so the fourth
> status is the vocabulary the report uses for "did not look" and "nothing to look
> at", and the flag work is downstream of it (D96, D97; E-D102). `--json` carries
> `asOf`, `checks` and `hooks`, with no roll-up; `codex doctor` carries
> `overall_status`, which is the maximum row severity rather than the `gate` field
> D80 refused, and a caller here must re-derive it. The flip condition is a consumer
> that reads the report for the roll-up (D99; E-D105).

(d) Insert the Round 18 audit after the Round 17 audit's last sentence ("The
README's test count was stale at 419; it is 416."), with commit 1's short SHA:

> **Round 18 audit (HEAD `<commit 1>`).** Round 17's load-bearing row named a
> status value `codex doctor` does not have and overstated its charter, and
> correcting both moved the subject from the flags to the status model.
> `CheckStatus` is `Ok | Warning | Fail`, with no `idle` and no skip state, because
> every check runs; the gate is exit 1 iff `overall_status == Fail`, and `warn`
> never gates (E-D100). The header does not copy codex's PATH rule line for line:
> it adopts the one-sentence rule and names two exceptions, `muse` for the host
> probe and `opencode` for the plugin entries, because the literal rule would
> forbid the host probe this tool exists to run — the amendment is the evidence the
> charter is operative (E-D101). Codex is therefore the analogue for which findings
> gate, not for what to do when a check cannot run: its three-value model has no
> did-not-look state, no `!asked` branch, no `--offline`-means-fail question and no
> ladder, not because it chose better flags but because it has one fewer value.
> This doctor's fourth value is its own; `exitCode` never reads `skipped` (the
> gate's did-not-look logic is `asked` and `answered`), and the flag work is
> downstream of the report vocabulary (D96, D97; E-D102). The field ships both
> shapes — a per-row status in `vercel doctor` and `proqi doctor`, an outcome
> dimension in `a4 doctor`'s `unknown`, `recon doctor`'s `info`, Vue Doctor's exit 3
> and ripr's advisory probes — so the fork is open and stays with the owner (Q1;
> E-D103). The width evidence is `expo-doctor` #37879: the user asks why the error
> appears when the build succeeds, the log's own advice offers
> `listUnknownPackages: false`, and the maintainer calls the exit intentional; a
> follow-up user took the exclude advice, the doctor went clean, and the dev build
> then failed to resolve the excluded package (E-D104). That is the degradation the
> narrow required set avoids, and it argues the width case better than brew.
> `--json` has no roll-up; codex's `overall_status` is the maximum row severity, not
> D80's `gate` field, and the absence is recorded with its flip condition (D99;
> E-D105). D85's cost is doctrinal: the code states the verdict and refuses the
> cause (D100; E-D106). The corrections ship as their own commit before this
> round's records.

Counts line unchanged.

**S5.** No change to `README.md` (416 stays), `docs/compatibility.md`, `scripts/`,
or `test/`. If Q2 is answered B, stop and write a separate code plan; this round's
records do not assume it.

**S6.** Verify:

- `bun run check:offline` → 416 pass, 0 fail, 1068 expects, 37 files, exit 0.
- `grep -n "\`idle\`" docs/round-17-research.md` is empty.
- `grep -n "copies line for line" docs/round-17-research.md` is empty; `grep -rn "line for line" docs/` shows only round 18's negations and the audit's "does not copy ... line for line".
- `grep -n "D94–D101" docs/decision-coverage.md` shows row 183; `grep -n "Round 18 audit" docs/decision-coverage.md` shows one line; the counts line is still `H 41 · D 34 · P 1 · X 5 · U 1 · N 3`.
- `grep -rn "overall_status" docs/decision-coverage.md docs/round-18-research.md` shows only the max-severity reading, never "equals the exit code".
- `git status` shows no change under `scripts/` or `test/`; `docs/integration-landscape.md` remains the owner's dirty file and is not staged.

**S7.** Report one line per decision, the corrected codex row, the status-model
reading, the two questions, and the checks. Then commit this round's records with
`Record round 18: the fourth status, the expo width, the absent roll-up` and the
Codebuff footer. If the owner answered Q1/Q2, record the answer in the audit;
otherwise record A as the default and say it is the default.

## Gates

- No code change; `scripts/` and `test/` are untouched; the suite stays 416.
- Every new claim carries an E-id or a source; no status value is named that the
  source does not have.
- The codex row says three statuses and no skip state; the tally stays 4–2–1.
- The charter sentence says "adopts ... and names two exceptions", never "copies
  line for line".
- `overall_status` is the maximum row severity, never the gate and never the exit
  code.
- The four breadth doctors are cited, not added to §1's tally.
- The audit names the three corrections: the invented status value, the skip
  implication, and the copy overstatement.
- If a check disagrees with the research, stop and report it rather than editing
  the expectation.

## Prohibitions

No push, tag or publish. No `muse acp`. No new dependency. Never write to the
host's log. `docs/integration-landscape.md` is the owner's edit: never stage.
Scratch stays in `scratch/`. Commits only after the owner says so.
