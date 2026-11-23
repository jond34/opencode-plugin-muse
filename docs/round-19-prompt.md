# Round 19 execution prompt

You are executing round 19 of `opencode-plugin-muse`. Work in
`~/repos/opencode-plugin-muse`. The plan is fixed; if a check contradicts it,
stop and report rather than editing the expectation.

Read first, in this order:

1. `docs/round-19-plan.md` — decisions, exact edits, steps, product questions,
   gates.
2. `docs/round-19-research.md` — evidence E-D107–E-D120.
3. `docs/round-18-plan.md` — the format this round follows.

Standing rules, unchanged: no push, tag or publish; no `muse acp`; no new
dependency; never write the host's log; `docs/integration-landscape.md` is the
owner's edit and is never staged; scratch stays in `scratch/`; commits only after
the owner says so.

## Before S1

Run the counts audit:

```bash
awk -F'|' '/^\|/ && $2 !~ /Dimension|---/ {gsub(/^ +| +$/,"",$4); if ($4 ~ /^[HDPXUN]$/) c[$4]++} END {for (k in c) print k, c[k]}' docs/decision-coverage.md
```

It must print H 41, D 34, P 1, X 5, U 1, N 3. If it does not, stop and report.

Ask the owner once, with the defaults shown:

- **Q3 provider:** A keep `muse` and document the shipped `canonical: "meta"`
  (default), B remove `canonical` and keep the table explicit, C adopt `meta` +
  `AuthHook`.
- **Q4 report version:** A add `schemaVersion` + `pluginVersion` now (default),
  B record only, C never.
- **Q5 histogram:** A add `summary` now, B record the shape and add it when a
  consumer appears (default), C never.
- **Commits:** may I commit the counts correction, then the records, then any
  approved code?

Proceed with the defaults if the owner does not answer a part.

## Execute

**S1.** Correct the counts paragraph in `docs/decision-coverage.md` exactly as
the plan specifies: "Eighty-four of eighty-five", "forty-one verified", and
"the three N rows" with the third being two installs of the same package. Commit
this alone as `Correct the counts paragraph: 84 of 85, forty-one, three N rows`.
Do not include any round-19 file.

**S3.** In `docs/decision-coverage.md`:

- Row 185 refs: `D68–D71, D75–D80, D82–D86, D88–D93, D94–D112,
  E-D72–E-D120:`.
- Replace the D85 sentence with the plan's corrected sentence: the field does
  split on a number, but the split encodes tool setup or a blocking decision,
  never a user declaration that could not be read; `a4 doctor` reports `unknown`
  and exits 0.
- Add the provider/ACP/report paragraph after the roll-up sentence, as quoted
  in the plan.

**S4.** `README.md`: insert the `### The subscription credential` subsection
after the auth paragraph ending "logging in again does not clear it." and before
"Which credential that CLI spends". Use the plan's exact paragraph. It must say
the mechanism and the residual risk, and must not claim endorsement.

**S5.** `README.md`: insert `### Why \`muse\`, not \`meta\`` after the "What it
does" bullet list and before the auth paragraph. Use the plan's exact text; it
names both competitors, the credential invariant, and the shipped
`canonical: "meta"`.

**S5a.** The provider transform already sets `canonical: Provider.ID.make("meta")`
at `src/plugin.ts:414`; the probe is confirmation, not a gate. Run the E-D120
probe exactly as the plan specifies, in a throwaway `XDG_CONFIG_HOME`, with a
config-declared `muse-probe` provider whose `canonical` is `meta` and which has
no `models` block. If the probe provider appears with inherited models, the
inheritance is observable; if it appears with none, the README says "declares"
rather than "inherits"; if it does not load at all, record the inconclusive
result and keep "declares". Record the result in `docs/round-19-research.md`
under E-D120. Do not edit `src/` for the probe.

**S6.** `README.md`: in "This plugin, or `muse acp`?", after "It is also
one-directional, for now: opencode ships the ACP *agent* side only.", insert the
plan's inheritance sentence. It must say `opencode acp` carries these models
through opencode's registry and the plugin adds no protocol surface.

**S7 (Q4 A only).** Add `schemaVersion: 1` and `pluginVersion` to `Report` in
`scripts/doctor.ts`, initialise them in `main`, extend the `parse` type in
`test/doctor.test.ts`, and add the plan's one test. Update the README's `--json`
sentence and change "runs 416 tests" to the number the suite actually reports.

**S8 (Q5 A only).** Add `summary: Record<Status, number>` to `Report`, compute
it from `checks`, include it in the JSON, and add the plan's sum test. Update
the README's `--json` sentence.

**S9.** Insert the Round 19 audit in `docs/decision-coverage.md` after the Round
18 audit, with commit 1's short SHA, using the plan's text. It records the two
review imprecisions, the six items, and the Q answers.

## Verify

Run, in this order:

```bash
bun run check:offline
grep -n "Eighty-four of eighty-five\|three N rows" docs/decision-coverage.md
grep -n "not on a number" docs/decision-coverage.md
grep -n "a4 doctor" docs/round-19-research.md
grep -n "subscription credential" README.md
grep -n "canonical" README.md docs/decision-coverage.md
git status -s
```

Expected:

- `bun run check:offline`: 0 fail, exit 0, and the count the run reports (416
  plus any tests S7/S8 added). If it fails, fix the cause; do not weaken the
  assertion.
- The counts correction is present; `not on a number` is absent from
  `decision-coverage.md` (it survives only as the quoted old sentence in the
  research file).
- The research's a4 line says doctor 0/1 and the CLI 0/1/2/10.
- The README has the §3.2 subsection and the provider paragraph.
- `canonical` appears only with the E-D120 result and the Q3 answer, never as a
  field norm.
- `git status -s` shows only `docs/integration-landscape.md` plus this round's
  files; no `scripts/` or `test/` changes if Q3/Q4/Q5 left the code alone.

The counts line is still `H 41 · D 34 · P 1 · X 5 · U 1 · N 3`.

## Report and commit

Report one line per decision, the corrected D85 sentence, the two README
paragraphs, the E-D120 result, the Q answers, the checks, and any limitation.
Then commit, if the owner approved:

1. `Correct the counts paragraph: 84 of 85, forty-one, three N rows`
2. `Record round 19: the divergence, the catalog, and the §3.2 posture`
3. `Version the doctor report: schemaVersion, pluginVersion, summary` (only if
   Q4 A or Q5 A)

Commits 2–3 carry the Codebuff footer. Do not push.
