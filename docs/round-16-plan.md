# Round 16 plan: the property, the two flags, the code that stays

Round 15's flip stands. Its justification does not: "tool authors the severity ⇒
gate" is falsified by `rustc`, and the flag that closed the `--offline` hole is
reachable only in combination with `--offline`. This round restates the rule as a
property, deletes `--strict`, and records why the exit code stays a single 1.

Research: `docs/round-16-research.md`. E-D82–E-D89 are done; §1–§5 there are the
evidence for everything below.

## 1. What the review moves

- **The axis.** Round 15 §2 says the gate follows who authors the severity. Read as
  "who invents the finding", `rustc` breaks it: `dead_code` and `unused_import` are
  rustc's own, on by default, and the build exits 0. Read as "who sets the level",
  the axis holds but stops predicting anything a reader can apply. The rule that
  survives: gate when the finding means a declaration the user made is not in force.
  The doctor's `config` and `policies` rows are that shape; a compiler warning is
  not. The conclusion is unchanged and now has a reason rustc cannot falsify.
- **The flag.** `strict` appears once, in the `!asked` branch. With `asked` true it
  is a no-op, so the ladder's top rung is only `--strict --offline`. E-D82: across
  5 trees × 4 modes, the two-flag scheme differs in exactly one cell, `--offline`
  alone (0 → 1) — which is what `--strict --offline` already returned. The flag
  deletes more than it adds. Its name is also wrong: elsewhere `--strict` means
  "warnings fail" (E-D89), not "a deliberate skip fails".
- **The code.** The field splits "could not evaluate" from "found problems", but not
  on a number: 2 is "could not evaluate" in eslint/grep and "found problems" in
  `git diff --check` (E-D84). CI collapses both (E-D84). No caller exists (E-D78).
  D71 stays; the cost is recorded in the coverage row and the flip condition named.

## 2. Decisions

**D82 — the gate's rule is the property, and it lands where the next round reads
it.** The coverage row for the doctor's exit code says: gate when the finding means
a declaration the user made is not in force (`config`, `policies: warn`, an
unanswered run), not when the artifact is merely improvable. `rustc` is named as the
counterexample the old sentence invited. `docs/round-15-research.md` §2 gets a
four-line pointer blockquote, because that section is what a reader who stops early
inherits; the section itself is not rewritten, on the same rule as round 14's §1.

**D83 — delete `--strict`; the gate is a function of `--no-strict` alone.** `Gate`
loses `strict` and keeps `gated`, `asked`, `answered`. `parseArgs` loses `--strict`.
`exitCode` becomes: any `fail` → 1; `!gated` → 0; `!asked` → 1; `!answered` → 1; a
`config` row or `policies: warn` → 1; else 0. Every cell is still reachable (research
§2's table). This is the round-12/13 shape: the answer that deletes a concept.

**D84 — `--offline` is a scope flag, not a policy flag.** It stops the host spawn and
nothing else; alone it exits 1, because the gate cannot certify a config it never
read. The report-only invocation is `--no-strict` (with `--offline` if the spawn
should be skipped too). README's CI sentence changes from "pass `--offline` when
there is nothing to check" to "pass `--no-strict` for the report alone"; the one
behavioural change this round has is `--offline` alone, 0 → 1.

**D85 — one exit code, and no `--detailed-exitcode`.** D71 is reaffirmed: 1 is
"the run did not certify", whether the cause is a dropped statement or a host that
did not answer; the report already carries the difference in its rows and detail.
The coverage row records the diagnostics cost — a shell caller cannot tell "fix your
config" from "install `opencode`" without `--json` — and names the flip condition: a
caller that branches on the difference, or `scripts/` becoming a published surface.
An opt-in detailed code is the `--strict` shape again: a flag that exists to be
combined.

**D86 — `plugins` stays advisory.** The property reopens it (research §4): "no entry
names the package" means the plugin will not load, which is a declaration not in
force. But the row has one status for three cases, and the other two must not gate:
a published copy that loads instead is a working artifact (E-D73), and two entries
are a shadow. Splitting needs a structured reason, which D80 forbade in `--json` and
a detail-string match would fake. Reversing condition: a `plugins` reason field, or
a `--checkout` assertion.

**D87 — the records change in four places, and the counts do not move.** Coverage:
the exit-code row is rewritten around the property and the two flags; row 177's
"under `--strict` a dropped statement exits 1" becomes "by default"; a Round 16
audit is added after Round 15's. README: the gate paragraph becomes two flags plus
the local-gate sentence. Compatibility: the `--strict` clause becomes the two-flag
sentence. Round-15 research: the pointer. No new row, so `H 41 · D 34 · P 1 · X 5 ·
U 1 · N 3` is unchanged.

## 3. Shape

```ts
export interface Gate {
  /** `--no-strict`: report only, never gate. */
  readonly gated: boolean;
  /** False under `--offline`: the user asked for a run that does not look. */
  readonly asked: boolean;
  /** Whether `opencode debug config` answered, so the config rows describe a run. */
  readonly answered: boolean;
}

export function exitCode(checks: readonly Check[], gate: Gate): number;
```

Order: any `fail` → 1; not `gated` → 0; not `asked` → 1; not `answered` → 1; a
`config` row or `policies: warn` → 1; else 0.

`main()` keeps one spawn and one call site: `{ gated: !options.noStrict, asked:
!options.offline, answered: read }`. `Options` and `parseArgs` lose `strict`. The
doc comment above `exitCode` loses the ladder paragraph and gains the property.

## 4. Phases

| Phase | Work | Gate | Status |
|---|---|---|---|
| S0 | E-D82–E-D89 recorded; research, plan, prompt written | every claim has a measurement or a cited source | done |
| S1 | `Gate` loses `strict`; `parseArgs` loses `--strict`; `!asked → 1`; call site | `bun run check:offline` green; `tsc` clean | pending |
| S2 | Table 13 → 10 rows; the spawned `--offline --strict` test becomes `--offline` expecting 1 | every remaining row asserted; the deleted rows have no unique cell | pending |
| S3 | Rerun `scratch/round-16/s1.ts`: the shipped column must equal the old proposed column on all 20 rows | one-cell difference only, and it is the documented one | pending |
| S4 | README, compatibility, coverage (audit, row 179, row 177), round-15 pointer | diff reads as prose; counts unchanged | pending |
| S5 | Report, one line per decision, then ask before committing | owner gate | pending |

S1–S3 are one increment; S4 is the record increment; S5 is the report. If Q1 comes
back "keep the ladder", S1–S3 are dropped and the round becomes D82 + D85 + D87,
which is four paragraphs and one pointer.

## 5. What must not regress

- A `fail` returns 1 under every mode, including `--no-strict`.
- `--no-strict` returns 0 for a config row, a dropped statement and an unanswered
  run; only `fail` survives it.
- The default still returns 1 with the host absent.
- `--offline --no-strict` returns 0; `--offline` alone returns 1 (the change).
- A `policies` row that is `skipped` for declaring no statements never fails.
- `--json` keeps its shape; no field is added; `--json` shares the contract.
- 419 tests stay green; no assertion is weakened to fit the new signature.
- No new dependency, no `muse acp`, no push, tag or publish; never write the host's
  log; `docs/integration-landscape.md` stays read-only and unstaged; scratch stays in
  `scratch/`.

## 6. Product questions

Two fall out of the measurements; two are product sense and are asked because the
answer is not in any experiment.

**Q1 — delete `--strict`?** *Recommendation: yes* (D83). It has no cell of its own
(E-D82), nothing calls it (E-D83), and its name means "warnings fail" elsewhere
(E-D89). *Cost:* a caller who reads "three rungs" as a promise loses the middle name;
the outcome is unchanged. *Flip condition:* a consumer that documents `--strict` by
name — none exists in this tree.

**Q2 — does `--offline` alone exit 1?** *Recommendation: yes* (D84), so the flags are
orthogonal: `--offline` = do not spawn, `--no-strict` = do not gate. *Alternative:*
`--offline` also implies no gate, which keeps the 0 but loses the gated-offline cell
and makes a scope flag silently change policy. *Cost of the recommendation:* the
quick "offline report" invocation becomes two flags; the README says so.

**Q3 — one exit code or two?** *Recommendation: one* (D85), because the distinction
is already in the report, CI collapses it, the field disagrees on the number, and no
caller exists. *Alternative:* 2 for "asked and could not evaluate", 1 for findings,
with "not asked" staying 1 under the gate. *Flip condition:* a caller that branches,
or a published `scripts/`.

**Q4 — does `plugins` join the gate for "no entry at all"?** *Recommendation: no*
(D86), because the row cannot separate that case without a new field, and the two
cases it would drag in must stay advisory. *Reversing condition:* a structured
`plugins` reason or a `--checkout` assertion.

**Q5 — should anything call the gate?** *Recommendation: nothing automatic this
round.* A pre-push hook is the useful consumer and it is the owner's hook, not this
repo's to install; `repro.sh` must not start depending on a signed-in CLI.

## 7. Prohibitions (inherited)

No push, tag or publish. No `muse acp`. No new dependency. Never write to the host's
log. Never weaken or delete an assertion to make the suite pass.
`docs/integration-landscape.md` is the owner's edit: read only, never stage. Scratch
stays in `scratch/`. Commit in increments, Codebuff footer, only after the owner says
so.
