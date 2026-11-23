# Round 16 prompt

Execute round 16 of `~/repos/opencode-plugin-muse`. The experiments are done; the
decisions are in `docs/round-16-plan.md` and the evidence is in
`docs/round-16-research.md`. This prompt is the whole brief.

## State

- `HEAD` is `22f337a` on `main`, 82 commits ahead of `origin/main`, unpushed. Round
  15 shipped the default gate and `--strict`; its docs are committed.
- Read, in this order: `docs/round-16-plan.md`, `docs/round-16-research.md`, then
  `scripts/doctor.ts` (`Options`, `parseArgs`, `Gate`, `exitCode`, `main`'s call
  site), then the `describe("the gate")` block in `test/doctor.test.ts`, then
  README's doctor section and `docs/compatibility.md` lines 40–46.
- `docs/round-15-research.md` §2 is the section with the wrong rule; do not rewrite
  it. Add the pointer D82 names.

## What is decided

**Q1 defaults to A** — delete `--strict` — unless the owner has said B. If B: do
only D82, D85 and D87's record edits, and stop.

**D82.** The rule is a property, not authorship: gate when the finding means a
declaration the user made is not in force. `rustc` is the counterexample the old
sentence invited (`dead_code` is rustc's own lint and the build exits 0). Put the
property in the coverage row and a four-line pointer blockquote at the top of
`docs/round-15-research.md` §2, saying the axis there is a proxy and round 16 §1
states the rule that survives. Nothing else in that file changes.

**D83.** Delete `--strict`. `Gate` keeps `gated`, `asked`, `answered`; `Options` and
`parseArgs` lose `strict`. `exitCode` order: any `fail` → 1; not `gated` → 0; not
`asked` → 1; not `answered` → 1; a `config` row or `policies: warn` → 1; else 0.
`main` passes `{ gated: !options.noStrict, asked: !options.offline, answered: read }`.

**D84.** `--offline` is a scope flag only. Alone it now exits 1 (was 0); the
report-only invocation is `--no-strict`. Update README's CI sentence and the
compatibility clause: `--no-strict` reports only; `--offline` skips the host and
still exits 1 because the config was not read.

**D85.** Keep one exit code. Record the diagnostics cost in the coverage row: a shell
caller cannot tell "fix your config" from "install `opencode`" without `--json`; the
flip condition is a caller that branches on the difference, or `scripts/` becoming a
published surface. Do not add `--detailed-exitcode`.

**D86.** `plugins` stays advisory. Do not split the row.

**D87.** Records: coverage's exit-code row rewritten around the property and the two
flags; row 177's "under `--strict` a dropped statement exits 1" becomes "by
default"; a Round 16 audit added after Round 15's; README's gate paragraph; the
compatibility clause. Counts stay `H 41 · D 34 · P 1 · X 5 · U 1 · N 3`.

## Steps

1. **S1.** `scripts/doctor.ts`: remove `strict` from `Options`, `parseArgs` and
   `Gate`; change `if (!gate.asked) return gate.strict ? 1 : 0;` to `return 1;`;
   update `main`'s call site and the doc comment above `exitCode` (drop the ladder,
   state the property). Keep one spawn and `read = Array.isArray(run.documents)`.
2. **S2.** `test/doctor.test.ts`: the table drops the two duplicate `strict` rows
   ("a config row returns 1 under strict"; "a run that was asked and got no answer
   returns 1 under strict") and the `--offline --strict` row; the `--offline` row
   changes 0 → 1 and its name says why. Keep `gate()` without `strict`. The spawned
   `--offline --strict` test becomes `--offline`, expecting 1 and both rows
   `skipped`. 13 rows become 10; no remaining case loses its only assertion.
3. **S3.** Rerun `bun scratch/round-16/s1.ts`. The shipped column must equal the
   `proposed` column on all 20 rows, and the only shipped-vs-old difference is
   `--offline` alone (0 → 1). If any other cell moves, stop and report it.
4. **S4.** Records: README (two flags, the local-gate sentence, the CI escape), 
   `docs/compatibility.md` (one clause), `docs/decision-coverage.md` (Round 16
   audit, row 179, row 177), `docs/round-15-research.md` (D82's pointer).
5. **S5.** Report: one line per decision, the live table, the suite numbers, then
   **ask before committing**. Commits in increments: code, then records.

## Gates

- `bun run check:offline` green; `bunx tsc --noEmit -p tsconfig.json` clean.
- Every cell of research §2's table is asserted; no assertion deleted or loosened.
- `--no-strict` returns 0 for a config row, a dropped statement and an unanswered
  run; a `fail` still returns 1 under `--no-strict`.
- `--json` keeps its shape; no field is added.
- If a live case disagrees with research §2, stop and report it rather than adjusting
  the expectation.

## Prohibitions

No push, tag or publish. No `muse acp`. No new dependency. Never write to the host's
log. `docs/integration-landscape.md` is the owner's edit: read only, never stage.
Scratch stays in `scratch/`. Commits in increments, Codebuff footer, only after the
owner says so.
