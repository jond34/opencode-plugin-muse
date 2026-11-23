# Round 17 prompt

Execute round 17 of `~/repos/opencode-plugin-muse`. This is a records round: no code
changes. The evidence is in `docs/round-17-research.md`, the decisions and exact
edits are in `docs/round-17-plan.md`, and this prompt is the whole brief.

## State

- `HEAD` is `55fc3ad` on `main`, 84 commits ahead of `origin/main`, unpushed. Round
  16 shipped the two-flag gate and its records.
- `docs/round-17-research.md` and `docs/round-17-plan.md` are new and untracked.
  `docs/integration-landscape.md` is the owner's uncommitted edit: never stage it.
- Read, in this order: `docs/round-17-plan.md`, `docs/round-17-research.md`, then
  `docs/round-16-research.md` §3 and §8, `docs/round-15-research.md` §2,
  `docs/compatibility.md` lines 38–48, `docs/decision-coverage.md` row 181 and the
  Round 16 audit, and `README.md` around "runs 419 tests".

## What is decided

**D88.** The doctor class gates its required checks, not every finding. The tally is
4 gate (`codex doctor`, `brew doctor`, `expo-doctor`, `ripr doctor`), 2 do not (Vue
Doctor, `claude doctor`), 1 uncounted (`flutter doctor`). `codex doctor` — the
charter `scripts/doctor.ts` cites — exits 1 on `Fail` only, never on `warn`. Record
the seven-row table in round-17 research §1 and a pointer in round-15 §2.

**D89.** `--strict` is split: warnings-fail (yamllint, `poetry check`, `composer
validate`) and analyzer-failed-or-skipped (Vue Doctor). Correct round 16's
"everywhere else" wording; keep the deletion, which rests on reachability.

**D90.** Add the ripr row to round-16 §3 so §8's promise is true.

**D91.** Name the `claude doctor` divergence in `compatibility.md`, with the
concession: it names malformed files and wrong types; it is byte-identical on a
misspelt key and exits 0. This doctor names the dropped statement and exits 1.

**D92.** Keep one flag (`--no-strict`). Record the report-only fork: two verbs
(ripr), off by default (Vue Doctor), absent (codex/brew/expo), on by default here.
Do not add `--fail-on`.

**D93.** Exit 2/3 in the field is the tool's own setup (alint's `.alint.yml`,
eslint's config, Vue's analyzer); this doctor has none, and its only config is the
user's, which is a finding. Record it in row 181.

## Steps

1. **S2.** `docs/round-16-research.md` §3: add the ripr row exactly as plan S2
   gives it, after Vue Doctor. **S2b.** round-16 §5: add the pointer blockquote on
   the name argument (plan S2b).
2. **S3.** `docs/round-15-research.md` §2: add the second pointer blockquote from
   plan S3. Nothing else in that file changes.
3. **S4.** `docs/compatibility.md`: insert the two-sentence divergence paragraph
   from plan S4 after "(D83, D84).".
4. **S5.** `docs/decision-coverage.md`: row 181 gets the class sentence and the
   whose-config sentence (plan S5); add a Round 17 audit after Round 16's, carrying
   the `--strict` correction. Counts stay `H 41 · D 34 · P 1 · X 5 · U 1 · N 3`.
5. **S6.** `README.md`: "runs 419 tests" → "runs 416 tests".
6. **S7.** Verify: `bun run check:offline` (416 pass, 0 fail); no "419 tests" in
   README; the only "everywhere else" is the Round 17 audit line, which names the
   correction; `--strict` mentions only in historical records and the two correct
   senses; counts line unchanged; `git
   status` shows no code change.
7. **S8.** Report one line per decision, the class table, the checks, then **ask
   before committing**. One records commit, `Record round 17: …`, Codebuff footer.

## Gates

- No code change; `scripts/` and `test/` are untouched; the suite stays 416.
- Every claim in the new text carries an E-id or a source; nothing is guessed.
- The class sentence says 4–2–1, never 3–1.
- The divergence clause names both what `claude doctor` catches and what it misses.
- If a check disagrees with the research, stop and report it rather than editing
  the expectation.

## Prohibitions

No push, tag or publish. No `muse acp`. No new dependency. Never write to the host's
log. `docs/integration-landscape.md` is the owner's edit: never stage. Scratch stays
in `scratch/`. Commit only after the owner says so.
