# Round 32 status

**Run date** 2026-11-23. Code base `9cffa53` (`round-31`); plan commits on
`round-32`. This is the live table; the plan and research files are not rewritten
when a result differs.

| ID | Work | Status | Evidence / output |
|---|---|---|---|
| A0 | Research, plan, prompt, status | done | `docs/round-32-research.md`, `docs/round-32-plan.md`, `docs/round-32-prompt.md` |
| A1 | Release-fact corrections | done | `docs/release.md`, `docs/claims.md`, `docs/claims.json` |
| A2 | P5/approval addendum | done | `docs/approval.md`, `docs/decision-coverage.md`, `docs/evidence-audit.md` |
| A3 | Hook-gate decision note | done | `src/hooks.ts` comment only; no behavior change |
| A4 | Gate negative tests | done | `docs/evidence/2026-11-26-r32-gate.json` |
| A5 | Provenance/stage preflight | done (preflight) | `docs/evidence/2026-11-26-r32-e60.json` |
| E65 | Reachability + amnesty flag | **H3 — stop** | `docs/evidence/2026-11-26-r32-e65.json` |
| E61 | Approval scope matrix | not run | stopped at E65 H3 |
| E55a | Console effect/timing | not run | no owner browser; stopped at E65 H3 |
| E55b | Console attribution | not run | no owner browser; stopped at E65 H3 |
| E64 | Second clean builder | not run | stopped at E65 H3 |
| E60 | Stage and reject | not run | stopped at E65 H3; local npm token also E401 |
| F | Checks, report | docs only | no candidate commit; release path not entered |

## Starting state

- Release stopped at E62 B2: a changed Muse plugin hook ran after
  `muse plugins update` without re-approval on Muse 1.4.25.
- E61 was not run after that stop.
- E55a/E55b were blocked on an owner-authenticated Console browser.
- E64/E60 were not run because the release stopped.
- E63 found no traced runtime path to the vulnerable dependency subtree;
  O25 A remains supported.
- `docs/integration-landscape.md` is an owner file and stays unstaged.

## E65 result: H3, and its scope

Two facts, measured separately:

1. **The amnesty is one-time and flag-guarded.** With both E62 records seeded
   before a fresh project-scope install, `muse plugins update` reported
   `modified`, the changed hook did not run, and the stored hash and flags did
   not change. E62 was the legacy migration, not a recurring bypass.
2. **The private host does not inherit the user's approval.** In a private
   `XDG_CONFIG_HOME` in the `writeMuseHostConfig()` shape, the plugin record was
   visible and `project-trusted`, but the hook was `review_needed`, effective
   capabilities were empty, and no marker fired.

Then the part that triggers H3: after an explicit `muse plugins approve`
**inside that private config**, one turn fired marker B; changing the hook and
running `muse plugins update` reported `modified`; the next turn fired marker C
with no new approval and wrote the amnesty pair into the private config.

Scope: the plugin never runs `plugins approve` or `plugins update` inside its
private config, and that config is recreated per host process. A normal session
therefore has no live bypass path; the reachable effect is that the user's
approval is inert. The mechanism still reaches the host's config shape, so the
pre-committed H3 stop fired: P1/P2 are now an owner decision, not defaults.

## A1–A5 results

- `npm stage reject` requires 2FA (npm CLI table); the round-31 sentence was
  wrong. `npm stage publish` does not.
- 0.1.12 carries a SLSA provenance attestation; provenance is generated at
  public publish and cannot be verified from a stage.
- The repository is PUBLIC; stage-only is an owner-side trusted-publisher
  setting the workflow cannot prove.
- Both gate negative cases fail closed: `forbidden file (src/): src/adapter.ts`
  and `audit: 1 high, 0 critical; release blocked`, each exit 1.
- `npm stage list --json` failed with `E401` (invalid local npm token). E60 is
  blocked before the reject 2FA prompt; the owner must run `npm login`.

## Result

The release remains stopped. No stage, approval, publish, tag, or push was
performed. P1 and P2 are open:

- **P1:** keep the `plugin`-origin allow and correct the claim (A), or block
  `plugin` origins as defense in depth (B).
- **P2:** resume with the documented caveat that the user's plugin approval is
  inert in this host, or hold pending a code gate/vendor fix.

E61, E55a/E55b, E64, and E60 remain unrun; they are gated behind the P1/P2
choice.

## Verification

| Check | Result |
|---|---|
| `npx tsc -p tsconfig.json` | exit 0 |
| `bun test test/hook-gate.test.ts` | 60 pass / 0 fail / 171 expect; 3 files |
| `bun scripts/check-claims.ts --strict` | 21/21 current as of 2026-11-24 |
| `git diff --check` | pass |
| A4 pack negative | exit 1: `forbidden file (src/): src/adapter.ts` |
| A4 audit negative | exit 1: `audit: 1 high, 0 critical; release blocked` |

No full `npm test`, `check-release.sh`, or `repro.sh` run was made: no release
candidate was produced after the E65 stop, and the only source change is a
comment in `src/hooks.ts`.
