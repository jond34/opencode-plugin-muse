# Round 32 status

**Run date** 2026-11-23. Code base `9cffa53` (`round-31`); plan commit on
`round-32`. This is
the live table; the plan and research files are not rewritten when a result
differs.

| ID | Work | Status | Evidence / output |
|---|---|---|---|
| A0 | Research, plan, prompt, status | done | `docs/round-32-research.md`, `docs/round-32-plan.md`, `docs/round-32-prompt.md` |
| A1 | Release-fact corrections | pending | `docs/release.md`, `docs/claims.md` |
| A2 | P5/approval addendum | pending | `docs/approval.md`, `docs/decision-coverage.md`, `docs/evidence-audit.md` |
| A3 | Hook-gate decision note | pending | `src/hooks.ts`, `docs/decision-coverage.md` |
| A4 | Gate negative tests | pending | `docs/evidence/2026-11-26-r32-gate.json` |
| A5 | Provenance/stage preflight | pending | `docs/evidence/2026-11-26-r32-e60.json` |
| E65 | Reachability + amnesty flag | pending | `docs/evidence/2026-11-26-r32-e65.json` |
| E61 | Approval scope matrix | pending | `docs/evidence/2026-11-26-r32-e61.json` |
| E55a | Console effect/timing | pending | `docs/evidence/2026-11-26-r32-e55a.json` |
| E55b | Console attribution | pending | `docs/evidence/2026-11-26-r32-e55b.json` |
| E64 | Second clean builder | pending | `docs/evidence/2026-11-26-r32-e64.json` |
| E60 | Stage and reject | pending | `docs/evidence/2026-11-26-r32-e60.json` |
| F | Checks, commit, report | pending | commit on `round-32` |

## Starting state

- Release stopped at E62 B2: a changed Muse plugin hook ran after
  `muse plugins update` without re-approval on Muse 1.4.25.
- E61 was not run after that stop.
- E55a/E55b were blocked on an owner-authenticated Console browser.
- E64/E60 were not run because the release stopped.
- E63 found no traced runtime path to the vulnerable dependency subtree;
  O25 A remains supported.
- `docs/integration-landscape.md` is an owner file and stays unstaged.

## Result

Not run.
