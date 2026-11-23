# Round 17 plan: the class, the divergence, the fork

Round 17 is a records round. No code changes: the gate shipped in round 16 stays as
it is. The round fixes the witness set behind the polarity, names the divergence
from `claude doctor`, writes down whose config exit 2 actually is, and records the
report-only fork as a fork rather than a settled question.

Evidence: `docs/round-17-research.md` (E-D90–E-D99). This plan names the decisions,
the exact edits, and the conditions that would change them.

## Decisions

**D88 — the doctor class gates its required checks, not every finding.** The class
is 4–2 for gating, not 3–1 against: `codex doctor`, `brew doctor`, `expo-doctor` and
`ripr doctor` gate; Vue Doctor and `claude doctor` require nothing. The axis inside
the class is which checks are required — `codex doctor` exits 1 on `Fail` only and
never on `warn`, `ripr doctor` fails required checks and calls optional probes
advisory. This doctor's required set is the config-integrity rows and did-not-look,
which is `codex doctor`'s shape. Record the seven-row table and the reading in
round-17 research §1; add a pointer in round-15 §2.

**D89 — `--strict` is split, not foreign.** It means warnings-fail in yamllint,
`poetry check` and `composer validate`, and analyzer-failed-or-skipped in Vue
Doctor. Round 16's "means something else everywhere else" is corrected in the
Round 17 audit, with a pointer in round-16 §5; the deletion stands on reachability
(D82, D83), not on the name.

**D90 — the ripr row lands in round-16 §3.** §8 promised it and the table lacks it.
One row: clean 0; found problems `0` for `check` and `2` for `gate evaluate` blocked;
could not evaluate 2. It also shows the digits are not portable even inside one
project family (the swarm variant adds 3).

**D91 — the `claude doctor` divergence is named in `compatibility.md`, with the
concession.** Two sentences: it reads the same files, names a malformed file, and
exits 0; on a misspelt key it is byte-identical to a clean run, while this doctor
names the dropped statement by `$.experimental.policies.N` and exits 1. Add that
`codex doctor`, the charter, gates on `Fail` only.

**D92 — one flag stays; the fork is recorded.** Report-only is a flag here
(`--no-strict`), a separate verb in ripr, off by default in Vue Doctor, and absent
in codex/brew/expo. Keep the flag: it is the only shape with one command, and the
required set is the narrow one. Flip condition: a consumer that needs a report-only
run by default, or a second command surface. Do not add `--fail-on`.

**D93 — exit 2 is the tool's own setup, and there is none here.** alint's 2 is its
`.alint.yml`, eslint's 2 is eslint's config, Vue Doctor's 3 is its analyzer, ripr's 2
is its input/config/policy. This doctor has no config file, no analyzer, no score;
its only config is the user's, and a refused file there is a finding, which belongs
in the gate. The single code is therefore not a compromise but the absence of a
referent. Record in the coverage row.

## Product questions

Raised for the owner; the plan defaults to A in each.

**Q1. Default polarity.** (A) keep gate-on, `--no-strict` to report only —
recommended; (B) flip to report-only and opt into the gate; (C) replace the boolean
with a `--fail-on`-style threshold. Evidence for A: E-D97 (4–2 class), E-D92 (the
charter gates `Fail` only), E-D77 (the required set does not fire on a working
checkout). Flip A→B if the required set starts firing on trees that work; A→C if the
owner wants per-row control.

**Q2. Report-only shape.** (A) keep the flag — recommended; (B) two verbs
(`doctor` / `doctor gate`); (C) off-by-default with a threshold. B buys a
report-only contract at the cost of a second entry point; C matches Vue Doctor but
not the required set.

**Q3. Exit-code granularity.** (A) one code — recommended; (B) a distinct code for
"did not look", Vue Doctor's 3. Evidence for A: E-D95 (the field's 2/3 is the tool's
own setup; no referent here). Flip if a caller branches on the difference, or
`scripts/` becomes a published surface.

**Q4. Where the divergence lives.** (A) `compatibility.md` only — recommended;
(B) also one README sentence. A keeps the README instructional; B tells a user why
exit 1 is not "the doctor is broken".

## Steps

**S1 (done).** `docs/round-17-research.md` written: the seven-row class table, the
required-checks reading, Vue Doctor's defaults, the claude measurement, the
exit-code ownership table, the `--strict` split, the four report-only shapes, the
steelman/strawman, E-D90–E-D99, sources.

**S2.** `docs/round-16-research.md` §3: add the ripr row after Vue Doctor:

`| ripr (cited) | 0 | 0 for \`check\`; 2 for \`gate evaluate\` blocked | 2 (input, config, analysis, output) |`

§8 then matches the table; leave §8 alone.

**S2b.** `docs/round-16-research.md` §5, under "For deleting `--strict`": add a
pointer blockquote:

> Round 17 §5 corrects the name argument: `--strict` is split, not foreign.
> yamllint, `poetry check` and `composer validate` use it for warnings-fail; Vue
> Doctor uses it for "exit 3 if any analyzer fails or is skipped". The deletion
> stands on reachability (D82, D83); the name is ambiguous (D89, E-D98).

**S3.** `docs/round-15-research.md` §2: add a second pointer blockquote under the
round-16 one:

> Round 17 §1 adds the class this table omits: `codex doctor`, `brew doctor`,
> `expo-doctor` and `ripr doctor` gate their required checks, Vue Doctor and
> `claude doctor` require nothing, and the axis is which checks are required rather
> than whether the tool exits non-zero (D88, E-D97).

Nothing else in that file changes.

**S4.** `docs/compatibility.md`: after the sentence ending "(D83, D84)." insert:

> That is a deliberate divergence from `claude doctor`, which reads the same
> settings files, names a malformed file, and exits 0 even when the file was
> discarded; on a misspelt key it is byte-identical to a clean run, while this
> doctor names the dropped statement by `$.experimental.policies.N` and exits 1
> (E-D91). `codex doctor`, the charter the row set follows, gates the same way, on
> `Fail` only (E-D92).

**S5.** `docs/decision-coverage.md`:

- Row 181: after the `rustc`/`nginx` sentences add the class sentence: "The class
  does not split against the gate: `codex doctor`, `brew doctor`, `expo-doctor` and
  `ripr doctor` gate their required checks, `codex doctor` on `Fail` only, which is
  this row's narrow set; Vue Doctor and `claude doctor` require nothing, and Vue's
  findings are a quality score (D88; E-D97)."
- Row 181: after "One code, not a ladder… (D85)." add: "The field's 2/3 is the
  tool's own setup — alint's `.alint.yml`, eslint's config, Vue Doctor's analyzer —
  and this doctor has no setup of its own; its only config is the user's, and a
  refused file there is a finding, so the class has no referent here (D93, E-D95)."
- Add a **Round 17 audit** paragraph after Round 16's, covering D88–D93, the
  report-only fork and the README count fix. It carries the `--strict` correction:
  round 16's "everywhere else" was too strong, because Vue Doctor uses `--strict`
  for exactly the analyzer-failure sense (D89, E-D98). The round-16 audit paragraph
  stays as the historical claim; the pointer lives in round-16 §5.
- Counts line unchanged: no row is added or reclassified.

**S6.** `README.md`: "runs 419 tests" → "runs 416 tests" (stale from round 16).

**S7.** Verify: `bun run check:offline` (416 pass, 0 fail); `grep -n "419 tests"
README.md` empty; `grep -n "everywhere else" docs/decision-coverage.md` shows only
the Round 17 audit line, which names the correction;
`grep -rn -- "--strict" README.md docs/*.md scripts test` shows only historical
records and the two correct senses; counts line still `H 41 · D 34 · P 1 · X 5 · U 1
· N 3`; `git status` shows no code change.

**S8.** Report one line per decision, the class table, the checks, then **ask before
committing**. One records commit, `Record round 17: …`, Codebuff footer, only after
the owner says so.

## Gates

- No code change; the suite stays 416 and the live table from round 16 is untouched.
- Every new claim carries an E-id or a source line; no cell is guessed (flutter is
  excluded from the tally for exactly this reason).
- The `claude doctor` clause names both sides: what it catches that this doctor
  catches only at file granularity, and what this doctor catches that it misses.
- The class table is seven rows; the tally sentence says 4–2–1, not 3–1.
- `docs/integration-landscape.md` is not read for content and never staged.

## Prohibitions

No push, tag or publish. No `muse acp`. No new dependency. Never write to the host's
log. `docs/integration-landscape.md` is the owner's edit: never stage. Scratch stays
in `scratch/`. Commits only after the owner says so.
