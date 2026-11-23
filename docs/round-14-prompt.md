# Round 14 prompt

Execute round 14 of `~/repos/opencode-plugin-muse`. The decisions are settled and
the experiments are done; this prompt is the whole brief.

## State

- Round 13 ends at `c75f6a1`; round 14 exists only as these three docs, and `main`
  is not pushed. Nothing of round 14 is implemented.
- Read, in this order: `docs/round-14-plan.md`, `docs/round-14-research.md`, then
  `scripts/doctor.ts` (`Check`, `Status`, `parseArgs`, `Options`, `configRow`,
  `main`), then `test/doctor.test.ts` (the `run()` helper and the two `--offline`
  tests at the end of the `plugins` and `policies` suites).
- `scratch/round-14/s0.ts`, `s1.ts`, `s2.ts` are the probes behind E-D72–E-D76.
  They are gitignored; rerun one if you need to re-derive a number.

## What is decided

**D68.** `--strict` is opt-in. Without it the exit contract is exactly as today:
`fail` → 1, everything else → 0.

**D69.** Under `--strict`, exit 1 when any check is `fail`, when a `config` row
exists, when `policies` is `warn`, or when the config was never read. Do not gate
`plugins`, `host`, `posture`, `hooks`, `allowance` or `platform` — on this machine a
clean tree already warns on `plugins` and `host` (E-D75), so gating them fails a
working checkout. A `policies` row that is `skipped` for declaring no statements is
not a failure.

**D70.** `--offline --strict` exits 1. Do not add a usage error and do not add a
second exit code; the two `--offline` rows already say the config was not read.

**D71.** One non-zero code: 1. Do not use 2 or 78.

**D72.** `configRow`'s remediation gains one clause: "if you cannot edit this file,
ask whoever administers it". Do not add a path heuristic or a writability probe.
Leave the detail string alone.

**D73.** README, `docs/compatibility.md` and `docs/decision-coverage.md` name which
rows `--strict` gates, and compatibility says the two config rows rest on a flag
documented as a debugging aid plus message text, with no structured diagnostics
surface upstream (#60252, not filed).

## Steps

1. **S1.** Add `Gate` and `export function exitCode(checks, gate): number` to
   `scripts/doctor.ts`, in that order: `fail` → 1; not strict → 0; not `read` → 1;
   a `config` row or `policies: warn` → 1; else 0. Add `strict` to `Options` and
   `parseArgs` (`argv.includes("--strict")`). In `main`, set
   `let read = false` before the offline branch, `read = Array.isArray(run.documents)`
   in the else branch, and return `exitCode(report.checks, { strict, read })`.
   Delete the old `failed` local.
2. **S2.** Add a `describe("the strict gate")` table test over synthetic `Check[]`:
   fail→1; clean+strict→0; `config` warn default→0; `config` warn+strict→1;
   `policies` warn+strict→1; `policies` skipped (declares none)+strict→0;
   `plugins` warn+strict→0; `read: false` default→0; `read: false`+strict→1. Then
   one spawned test: `run(["--json", "--offline", "--strict"])` exits 1 and still
   reports both rows `skipped`.
3. **S3.** Append the D72 clause to `configRow`'s remediation, and extend the
   existing `config` row test to assert it (do not add a new fixture).
4. **S4.** Live, temp `XDG_CONFIG_HOME` with a copied `auth.json`, never the real
   one. Four trees, each run twice (default and `--strict`): clean; valid
   `opencode.json` beside a malformed `opencode.jsonc`; malformed config two levels
   above a valid one; one malformed `policies` statement. Expect default `0 0 0 0`
   and strict `0 1 1 1`. Then with `PATH` stripped of `opencode`: default 0, strict 1.
5. **S5.** Update the three records: README's doctor section (the flag, the rows it
   gates, the `--offline` interaction), `docs/compatibility.md` (D73's dependency
   sentence), `docs/decision-coverage.md` (round-14 audit paragraph, the
   `policies` statement row, counts if any moved).
6. **S6.** Report: one line per decision, the live table, the suite numbers, and
   plan §6's two questions with your recommendation. **Ask before committing.**

## Gates

- `bun run check:offline` green; `npx tsc -p tsconfig.json` clean.
- The nine table rows all asserted; no assertion weakened or deleted to pass.
- Without `--strict`, every tree that returns 0 today still returns 0.
- If a live case disagrees with research §6, stop and report it rather than
  adjusting the expectation.

## Prohibitions

No push, tag or publish. No `muse acp`. No new dependency. Never write to the
host's log. `docs/integration-landscape.md` is the owner's edit: read only, never
stage. Scratch stays in `scratch/`. Commits in increments, Codebuff footer, only
after the owner says so.
