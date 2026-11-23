# Round 15 prompt

Execute round 15 of `~/repos/opencode-plugin-muse`. The experiments are done; the
decisions are in `docs/round-15-plan.md` and the evidence is in
`docs/round-15-research.md`. This prompt is the whole brief.

## State

- `HEAD` is `b40aa81` on `main`, 79 commits ahead of `origin/main`, unpushed.
  Round 14 shipped `--strict` as an opt-in gate; its docs are committed.
- Read, in this order: `docs/round-15-plan.md`, `docs/round-15-research.md`, then
  `scripts/doctor.ts` (`Check`, `Status`, `Options`, `parseArgs`, `Gate`,
  `exitCode`, `main`), then the `describe("the strict gate")` block and the two
  `--offline` tests in `test/doctor.test.ts`.
- Round 14's record is `docs/round-14-research.md` §1–§2. Its brew cell is wrong and
  round 15 §1 says why; do not rewrite that file except for the pointer D74 names.

## What is decided

**Q1 defaults to B** — the default gates the config-integrity set — unless the owner
has said A. If A: do only S4's correction and S5, and stop.

**D74.** The correction lives in round 15's research and the coverage audit. Add one
line at the top of `docs/round-14-research.md` §1: that its brew cell inverted the
default and round 15 §1 corrects it. Nothing else in that file changes.

**D75.** The ladder: `--no-strict` (report only) < default (gates a refused file, a
dropped statement, and a run that could not look) < `--strict` (also fails an
explicit `--offline`). `exitCode` order: any `fail` → 1; not `gated` → 0; not `asked`
→ `strict ? 1 : 0`; not `answered` → 1; a `config` row or `policies: warn` → 1;
else 0.

**D76.** `--offline` is `asked: false`. It exits 0 by default and 1 under `--strict`,
which is exactly D70, so both round-14 `--offline` tests keep their expectations.

**D77.** `--json` shares the contract. Do not special-case it.

**D78.** README and the coverage row call this a local gate (pre-push, release run,
a person), not a CI gate: the config rows need a signed-in host and a CI runner has
none.

**D79.** `plugins` stays advisory even when it names the published build.

**D80.** No `gate` field in `--json`.

## Steps

1. **S1.** In `scripts/doctor.ts`: replace `Gate` with the four facts in plan §3,
   rewrite `exitCode` in the order above, add `noStrict` to `Options` and
   `parseArgs`, and in `main` pass `{ gated: !options.noStrict, strict:
   options.strict, asked: !options.offline, answered: read }`. Keep one spawn and
   keep `read = Array.isArray(run.documents)`.
2. **S2.** In the `describe("the strict gate")` block: change the two rows E-D80
   names (`config` warn default 0→1; `read: false` default 0→1), and add rows for
   `--no-strict` over a refused config → 0, `--offline` (asked false) default → 0,
   `--offline` + `--strict` → 1, and a `fail` under `--no-strict` → 1. Keep the
   spawned `--offline --strict` test asserting 1 and both rows `skipped`; add one
   spawned `--no-strict` test only if it costs nothing extra.
3. **S3.** Live, temp `XDG_CONFIG_HOME` with a copied `auth.json`, never the real
   one. Four trees as in round 14 (clean; valid beside malformed; malformed two
   levels up; one dropped statement), each under default, `--no-strict` and
   `--strict`; plus `opencode` off `PATH` under default and `--strict`, plus
   `--offline` and `--offline --strict` in the clean tree. Expect default
   `0 1 1 1`, `--no-strict` `0 0 0 0`, `--strict` `0 1 1 1`, absent `1 1`,
   `--offline` `0`, `--offline --strict` `1`.
4. **S4.** Records: README's doctor section (the ladder, one example, the local-gate
   sentence), `docs/compatibility.md` (one clause: the default gates, the flag
   relaxes), `docs/decision-coverage.md` (round-15 audit, the exit-code row's text,
   counts if a row moves), and D74's pointer in `docs/round-14-research.md`.
5. **S5.** Report: one line per decision, the live table, the suite numbers, then
   **ask before committing**.

## Gates

- `bun run check:offline` green; `npx tsc -p tsconfig.json` clean.
- Every ladder case asserted; no assertion deleted or loosened. The two `--offline`
  tests are unchanged.
- The only default-behaviour changes are the four E-D80 cases; every other tree that
  returns 0 today still returns 0.
- If a live case disagrees with research §6, stop and report it rather than adjusting
  the expectation.

## Prohibitions

No push, tag or publish. No `muse acp`. No new dependency. Never write to the host's
log. `docs/integration-landscape.md` is the owner's edit: read only, never stage.
Scratch stays in `scratch/`. Commits in increments, Codebuff footer, only after the
owner says so.
