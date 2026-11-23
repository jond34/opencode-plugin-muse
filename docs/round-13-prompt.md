# Round 13 prompt

Execute round 13 of `~/repos/opencode-plugin-muse`. The decisions are settled and
the experiments are done; this prompt is the whole brief.

## State

- `main` at `f1025ae`, 74 ahead of `origin/main`, not pushed. Round 12 is
  committed; nothing of round 13 is.
- Read, in this order: `docs/round-13-plan.md`, `docs/round-13-research.md`, then
  `scripts/doctor.ts` (`configDiagnostics`, `readLogDelta`, `logFile`,
  `configCandidates`, `readConfig`, `configRow`, `policyRow`, `pluginRow`,
  `main`), then `test/doctor.test.ts` (`describe("the config log")`).
- `scratch/round-13/s0.ts`–`s5.ts` are the probes behind E-D66–E-D71. They are
  gitignored; rerun one if you need to re-derive a number.

## What is decided

**D63.** The spawn is `opencode --standalone --print-logs debug config`, and the
diagnostics come from its **stderr**. Delete `logFile()`, `readLogDelta()`,
`configCandidates()`, and the `source`-set filter inside `configDiagnostics()`.
Do not add an ancestor walk, `.opencode` roots, `/etc/opencode`,
`$OPENCODE_CONFIG` or macOS paths: E-D70 makes the list unnecessary, and E-D66
showed that extending it would have been a re-implementation of a rule that
already differs between opencode v1 and v2 docs.

**D64.** Liveness is at least one line on that stderr carrying both `timestamp=`
and `level=`. `message="cli starting"` is always the first one. Empty stderr with
exit 0 is `skipped` ("the host printed no log for this run"), never `ok`.

**D65.** `opencodeConfig()` returns `{ documents, stderr, status }`; one spawn
feeds both rows. A non-zero status or unparseable stdout still leaves the rows
`skipped`.

**D66.** `config`, `plugins` and `policies` keep their current contracts: `config`
owns `path=$` and names file plus action; `plugins` names a rejected file instead
of saying it will not load; `policies` defers to `config` and otherwise reports
statement-level drops by pointer.

**D67.** README, `docs/compatibility.md` and `docs/decision-coverage.md` say "the
host's own log output for this run", not "the server log", because the mechanism
they describe is being deleted.

## Steps

1. **S1.** Rewrite the spawn and the parse. Keep `DIAGNOSTIC_MESSAGE`, `field()`
   and the `ConfigDiagnostic` shape. Delete the log path lookup, the offset, the
   truncation guard and the 4 MiB cap. `readConfig` becomes one call.
2. **S2.** Delete the now-dead helpers and their tests. `grep` for each name
   before you finish; no export may survive without a caller.
3. **S3.** Re-point the fixtures: `log()` becomes `stderr()`. Keep the
   statement-level, whole-file, deferral and `ok` cases. Add (a) a diagnostic
   whose `source` is an ancestor config path — this must produce a `config` row,
   and it is the regression test for the hole this round closes; (b) an empty
   stderr with exit 0 — this must be `skipped`; (c) stderr with no diagnostic but
   a `cli starting` line — this must be `ok`.
4. **S4.** Verify live with a temp `XDG_CONFIG_HOME` and a copied `auth.json`,
   never the real one. Four trees: clean; valid `opencode.json` beside a malformed
   `opencode.jsonc`; malformed config in the cwd's parent with a valid file in the
   cwd; a single malformed statement. Expect: no `config` row / `config` warn +
   `policies` skipped / `config` warn naming the ancestor + `policies` skipped /
   `policies` warn naming `$.policies.N`.
5. **S5.** Update the three records and the test counts.
6. **S6.** Report: one line per decision, the four live results, the suite
   numbers, and the product questions from plan §5 with your recommendation.
   **Ask before committing.**

## Gates

- `bun run check:offline` green; `npx tsc -p tsconfig.json` clean.
- No assertion weakened or deleted to pass. The parser tests may go; the
  behavioural ones may not.
- If a live case disagrees with the predictions in research §3, §7 or §8, stop
  and report it rather than adjusting the expectation.

## Prohibitions

No push, tag or publish. No `muse acp`. No new dependency. Never write to the
host's log. `docs/integration-landscape.md` is the owner's edit: read only, never
stage. Scratch stays in `scratch/`. Commits in increments, Codebuff footer, only
after the owner says so.
