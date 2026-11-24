# Round 33 status

**Run date** 2026-11-23. Base `bc00fb6` (`round-32`); branch `round-33`.
This is the live table. The plan and research are not rewritten when a result
differs; update this file and add evidence.

| ID | Work | Status | Evidence / output |
|---|---|---|---|
| A1 | Doctor warning for installed-plugin hooks | done | `scripts/doctor.ts`, `test/doctor.test.ts`; 4 new tests |
| A2 | Known-limitation wording | done | `CHANGELOG.md`, `README.md`, `docs/approval.md`, `docs/release.md` |
| A3 | Watch item | done | `docs/release.md`, `docs/approval.md` |
| A4 | Claims ledger | done | 23/23 current; no new row needed |
| A5 | E60 preflight | done | `docs/evidence/2026-11-26-r33-e60.json` |
| E61 | Approval scope matrix | done (B1) | `docs/evidence/2026-11-26-r33-e61.json` |
| F1 | Candidate checks and commit | done | commit on `round-33`; 430 pass, repro PASS, release gate PASS |
| E64 | Second clean builder | done (B1) | `docs/evidence/2026-11-26-r33-e64.json`; identical dist and tarball |
| E60 | Stage and reject | blocked (B4) | no stage; reject 2FA is owner-only |
| E55a | Console effect/timing | blocked | no owner-authenticated browser; O42 B |
| E55b | Console attribution | blocked | no owner-authenticated browser; O42 B |
| R | Reconcile, checks, report | done | status + decision docs; this commit |

## Starting state

- P1 A / P2 A are decided: keep the `plugin`-origin allow, document the
  limitation, resume the release after the gates.
- The doctor already prints a `hooks` row with each handler's origin and
  `(installed plugin)`; A1 adds a `warn` status and one sentence.
- `hook/list` reports a dormant unapproved plugin hook as `enabled: true` with
  no trust status; that is why a `plugin` block is not the default.
- `npm stage list` was `E401` on 2026-11-23; E60 needs the owner's `npm login`
  and reject 2FA. On 2026-11-23 the preflight authenticated as `jonathand34`, the
  stage list was empty, and no 0.1.13 was public.
- E55a/E55b remain blocked on an owner-authenticated Console browser.
- `docs/integration-landscape.md` is an owner file and stays unstaged.

## Result

P1 A is implemented and E61/E64 pass. E60 is blocked at the owner's reject 2FA,
so no stage was created and the release holds operationally. E55a/E55b stay
blocked on the owner browser and use the labelled vendor-doc note (O42 B).

- E61: **B1**, cross-workspace; rule is `tool_action` on `tool_name`, no
  `workspace_root`; 2 turns. The opencode-deny arm was not measurable here.
- E64: **B1**, identical `dist/` (`3470ecc9…`) and tarball (`67c66300…`), 160 /
  165 files.
- E60: **B4**, preflight authenticated, no 0.1.13 public, empty stage list; no
  stage created because a pending stage needs the owner's 2FA to reject.
- Checks: 430 pass / 0 fail across 44 tracked files; repro PASS; release gate
  PASS (25 moderate / 0 high / 0 critical); claims 23/23; diff check clean.
