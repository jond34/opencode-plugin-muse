# Round 18 prompt

Execute round 18 of `~/repos/opencode-plugin-muse`. This is a records round with
one factual correction at its centre: no code changes. The evidence is in
`docs/round-18-research.md`, the decisions and exact edits are in
`docs/round-18-plan.md`, and this prompt is the whole brief.

## State

- `HEAD` is `153ce41` on `main`, 85 commits ahead of `origin/main`, unpushed.
- `docs/round-18-research.md`, `docs/round-18-plan.md` and this prompt are new and
  untracked. `docs/integration-landscape.md` is the owner's uncommitted edit:
  never stage it.
- Read, in this order: `docs/round-18-plan.md`, `docs/round-18-research.md`, then
  `docs/round-17-research.md` §1 and E-D92, `docs/decision-coverage.md` row 183 and
  the Round 17 audit, and  `scripts/doctor.ts` lines 1–18 and 660–672.

## What is decided

**D94.** Round 17's codex row is wrong in two cells: `idle` is not a status, and
there is no skip state. `CheckStatus` is `Ok | Warning | Fail`; exit 1 iff
`overall_status == Fail`; every check runs, so there is no `skipped`. D88 stands:
the class gates its required checks, 4–2–1, codex on `Fail` only.

**D95.** The charter is adopted, not copied. Codex's rule is one sentence; the
header restates it and names two exceptions, `muse` for the host probe and
`opencode` for the plugin entries, "which no other surface answers." The amendment
is the evidence the charter is operative.

**D96.** Codex is the analogue for which findings gate, not for did-not-look. Its
three-value model has no `!asked`, no `--offline`-means-fail question and no
ladder because every check runs. This doctor's fourth status is its own; the flags
are downstream of the report vocabulary.

**D97.** Keep `skipped` as a row status; raise the fork. `exitCode` reads `fail`,
`policies: warn`, `asked` and `answered`, never a row's `skipped`. The two senses
are did-not-look and nothing-to-look-at. Q1 is the owner's.

**D98.** Expo leads the width evidence; brew is second. #37879's log offers
`listUnknownPackages: false`, the maintainer calls the exit intentional, and a
follow-up user took the exclude advice, went clean, and broke the dev build.

**D99.** `overall_status` is an absent cell, recorded, not built. It is the maximum
row severity, not D80's `gate` field, and it would not equal the exit code. Q2 is
the owner's.

**D100.** D85's cost is doctrinal: the code states the verdict and refuses the
cause; the rows and `--json` state the cause.

**D101.** Two commits: the correction, then this round's records.

## Steps

1. **S2.** Correct `docs/round-17-research.md` exactly as plan S2 gives it: the
   table row (drop `idle`, skip cell "none: every check runs"), the short
   blockquote after the table, the §1 charter sentence ("adopts ... and names two
   exceptions"), and E-D92 (three statuses, no skip, the `--json` fields).
2. **S3.** Ask the owner once. If approved, commit S2 alone as
   `Correct the codex row: three statuses, no skip state`, with the Codebuff
   footer. Do not include the round-18 files. Record the short SHA.
3. **S4.** `docs/decision-coverage.md`: extend row 183's refs to `D94–D101,
   E-D72–E-D106`; replace the D85 sentence with the doctrinal wording; insert the
   `skipped`-is-a-report-value and absent-roll-up sentences after the whose-config
   sentence; insert the Round 18 audit after the Round 17 audit's last sentence,
   with commit 1's short SHA. Counts stay `H 41 · D 34 · P 1 · X 5 · U 1 · N 3`.
4. **S5.** Do not change `README.md` (416 stays), `docs/compatibility.md`,
   `scripts/` or `test/`. If the owner answers Q2 as B, stop and write a separate
   code plan; this round's records do not assume it.
5. **S6.** Verify: `bun run check:offline` → 416 pass, 0 fail, 1068 expects, 37
   files, exit 0; `grep -n "\`idle\`" docs/round-17-research.md` empty;
   `grep -n "copies line for line" docs/round-17-research.md` empty (the phrase
   survives only in round 18's negations and the audit); one Round 18 audit; the counts line
   unchanged; no `overall_status` claim that it equals the exit code; `git status`
   shows no change under `scripts/` or `test/` and still shows only
   `docs/integration-landscape.md` as the owner's dirty file.
6. **S7.** Report one line per decision, the corrected codex row, the status-model
   reading, Q1/Q2, and the checks. Then commit the round's records as
   `Record round 18: the fourth status, the expo width, the absent roll-up`, with
   the Codebuff footer. If the owner answered Q1/Q2, record the answer in the
   audit; otherwise record A as the default and say it is the default.

## Gates

- No code change; `scripts/` and `test/` are untouched; the suite stays 416.
- Every new claim carries an E-id or a source; no status value is named that the
  source does not have.
- The codex row says three statuses and no skip state; the tally stays 4–2–1.
- The charter sentence says "adopts ... and names two exceptions", never "copies
  line for line".
- `overall_status` is the maximum row severity, never the gate and never the exit
  code.
- The four breadth doctors (`vercel`, `proqi`, `a4`, `recon`) are cited, not added
  to §1's seven-doctor tally.
- The audit names the three corrections: the invented status value, the skip
  implication, and the copy overstatement.
- If a check disagrees with the research, stop and report it rather than editing
  the expectation.

## Prohibitions

No push, tag or publish. No `muse acp`. No new dependency. Never write to the
host's log. `docs/integration-landscape.md` is the owner's edit: never stage.
Scratch stays in `scratch/`. Commits only after the owner says so.
