# Round 32 execution prompt

Execute `docs/round-32-plan.md` in `~/repos/opencode-plugin-muse`. Do not start
from scratch and do not rewrite the plan or research to fit a result.

## Read first

Read, in this order:

1. `README.md` and the repo `AGENTS.md`.
2. `docs/round-32-plan.md`, `docs/round-32-research.md`,
   `docs/round-32-status.md`.
3. `docs/round-31-status.md`, `docs/approval.md`, `docs/release.md`,
   `docs/evidence/2026-11-26-r31-e62.json`,
   `docs/evidence/2026-11-26-r31-e63.json`.
4. The P5/approval rows in `docs/decision-coverage.md`.

Then verify:

```bash
git status --short
git log -3 --oneline
```

Expect branch `round-32` with the plan commit on code base `9cffa53`, and only
`docs/integration-landscape.md` modified and unstaged. Do not stage or edit that
file.

## Guardrails

- Scratch: `scratch/r32-*`. Evidence: `docs/evidence/2026-11-26-r32-*`.
- Use `zsh -lc` for `muse` and anything needing `~/.zshenv`; use `bash` for repo
  scripts that already use bash.
- Isolate every Muse experiment with `XDG_CONFIG_HOME`, `XDG_DATA_HOME`,
  `XDG_STATE_HOME`, and `XDG_CACHE_HOME` under `scratch/r32-*`. Never touch the
  real Muse config, approval store, or trust store. Symlink `auth.json`
  read-only if a paid turn is needed; never copy a secret.
- Do not approve a stage, publish, tag, create a release, or push a tag. E60 may
  push only `round-32` if the workflow needs it, and may reject a stage.
- `npm stage reject` requires 2FA. Do not call it unattended; if the owner is not
  present, mark E60 blocked.
- Do not claim provenance for a staged package. Provenance is generated at
  public publish; a stage/reject run cannot verify it before approval.
- Do not rewrite old evidence. Add new JSON with `addendumTo` / `supersedes`.
- Preserve exit status. Do not pipe a check in a way that hides its code.
- Every experiment records versions, commands, start/end time, turns, cost,
  raw output paths, observations, and limits.

## Defaults already chosen

Do not re-ask these unless the named result changes the branch. Record the
result and the changed branch in `docs/round-32-status.md`.

| Choice | Default |
|---|---|
| P1. `plugin`-origin hook posture | A (keep allow, correct the claim, warn) unless E65 H3; H3 stops the run and makes B the recommended next choice, not a pre-approved code change. |
| P2. Release under E62 | Resume only if E65 H1/H2/H4 and E64/E60 pass. H2 needs the documented caveat and a watch item; H3 holds unless P1 B is chosen. |
| P3. Provenance proof | A (accept “not verifiable before approval”); B is a separate release decision. |
| P4. Console claim | A if E55a/E55b pass; otherwise D (vendor-doc note), then C (no claim). |
| O31. Approval posture | A pending E61 B1; B only with E61 B2 plus a one-prompt spike. |
| O32. Console wording | D/C until E55a/E55b; A/B only with those results. |
| O33. Release-gate strictness | A, including the A5 negative tests. |
| O34. Reproducibility claim | B if E64 B1; A otherwise. |
| O35. Dependency risk | A. |
| O36. Windows desktop | A, retire the desktop claim. |
| O37. Stage proof | A, stage/reject with owner 2FA at reject; B is a separate release decision. |

If a result changes a default, do not silently pick a new product posture. Record
the measured branch, mark the affected choice open, and report the minimum
decision. The only automatic stop is a stop condition below.

## Work order

### 1. A1–A5 documentation and gate corrections

Follow plan §1 exactly. The important corrections are:

- `npm stage publish` has no 2FA; `approve` and `reject` both do.
- The repo is PUBLIC, so trusted publishing should generate provenance, but only
  at public publish.
- Stage-only is an owner-side trusted-publisher setting; the workflow only calls
  `npm stage publish`.
- A5 negative tests run in a throwaway `git archive` copy, never the candidate.

### 2. E65 — the decisive experiment

Run plan §2 E65. In short:

- **Arm A:** write the **pair** E62 records after migration into an isolated
  `settings.json` before a fresh project-scope install:
  `legacy_hook_trust_amnesty_applied: true` at top level **and** a
  `runtime_capabilities.legacy_hook_trust_amnesty_applied` row with
  `enabled: false` and `trusted_definition_hash: "tbh:amnesty-applied:v1"`.
  Install, inspect (`review_needed`), approve, run one echo turn (marker A),
  change only the hook command, update, inspect, run one echo turn. Record
  whether marker B ran and whether either flag part changed.
- **Arm B:** use E62 as the flag-absent control. Do not repeat it unless the
  setup differs enough to invalidate comparison.
- **Arm C:** run `muse exec --provider echo --trust-workspace` with a private
  `XDG_CONFIG_HOME` like `writeMuseHostConfig()` and the plugin data directory
  from Arm A. Determine whether the user-approved plugin hook loads. If it does
  not, approve once under the private config, update the hook, and run again.
- If possible, call `hook/list` from a small `muse serve` client and record the
  `plugin` row. Do not expect a trust status; `HookCatalogEntry` has none.

Record the hypothesis:

- **H1:** flag prevents amnesty and private host is inert.
- **H2:** recurring bypass but private host is inert.
- **H3:** private host runs the updated hook without re-approval.
- **H4:** private host is inert even for an approved plugin hook.
- **H5:** probe cannot run.

If **H3**, stop and report. Do not implement a code gate without the owner
choosing P1 B. If **H1/H2/H4**, continue.

### 3. E61 — approval scope matrix

Run plan §2 E61. Create the tiny stdio MCP server locally; register it with
`muse mcp add opencode -- <node> <server.mjs>` at user scope. Test the
`localPersistent` grant across workspaces, then the opencode `deny` for
`mcp__opencode__bash`.

- If the opencode deny is ignored, **stop the release**.
- If the grant is workspace-local, update A2 and make O31 B conditional on a
  one-prompt spike.
- If the grant crosses workspaces, O31 A stays.

### 4. E55a/E55b — Console, only if the owner browser exists

Use plan §2. Record the connected workspace and the Console authority. A provider
deny can be overridden by a Console `allow`; do not confuse that with effect.

- E55a B1: model disappears by 60–120s → O32 A (effect/timing only).
- E55a B2: model stays selectable but calls fail → selection caveat.
- E55a B3/B4: no change or blocked → no claim.
- E55b B1: exact `Blocked by <workspace>'s policy` → O32 B (attribution for this
  shape). Generic denial or route-around → no attribution.

If no owner-authenticated browser is available, mark both blocked and use O32 D
(vendor-doc note) or O32 C (no claim). Do not substitute a local config test.

### 5. Candidate checks and commit F1

Run, preserving status:

```bash
npm test
bun scripts/check-claims.ts --strict
bash scripts/check-release.sh
bash scripts/repro.sh
npm pack --dry-run
git diff --check
```

Fix failures caused by this round. Do not weaken tests. Record exact counts and
hashes. Commit the candidate on `round-32`, leaving the owner file unstaged.

### 6. E64 — second clean builder

Follow plan §2 E64 after the commit. Use a fresh `git archive`, `HOME`, npm cache,
and `TMPDIR`. Compare `dist/index.js`, the sorted `dist/` digest, the tarball
SHA-256, and file counts.

- B1 match → use “second clean workspace/cache; separate-OS rebuild pending.”
- B2 mismatch → stop; no release claim.
- B3 `npm ci` failure → record, use `--ignore-scripts` only if the build does not
  need lifecycle scripts, and say so.

### 7. E60 — stage and reject

Only if E65 is H1/H2/H4, E61 is not B3, E64 is B1, and the owner is present for
reject 2FA.

Follow plan §2 E60. Stage through the workflow, download the stage, compare
SHA-256, inspect `npm stage view`, then **reject**. Never approve. If the digest
differs, reject and stop. If 2FA or permissions block the reject, record blocked
and leave the stage pending.

### 8. Reconcile and report

Update `docs/round-32-status.md`, `docs/evidence-audit.md`,
`docs/decision-evidence.md`, `docs/approval.md`, `docs/decision-coverage.md`,
`docs/release.md`, and `docs/claims.md` with the actual branches. Do not rewrite
the plan or research.

Final report must include:

1. Status table (A/E/F).
2. E65 hypothesis and result.
3. D252–D261 branches taken.
4. Exact checks, counts, repro hash, tarball hash, stage/reject result.
5. O31–O37 and P1–P4, with defaults and changed recommendations.
6. Blocked items and what would unblock them.
7. Commit hash, files changed, and files intentionally left unstaged.

## Stop conditions

Stop and report, do not improvise, if:

- E65 H3 and the owner has not chosen P1 B.
- E61 B3: a saved Muse rule overrides an opencode `deny`.
- E64 B2: an unexplained dist/tarball mismatch.
- E60 digest mismatch, an approval/publish/tag step, or no owner 2FA for reject.
- An experiment exceeds its cap.
- A command would touch the real Muse config or approval store.
- A secret would be written to an artifact.
- Any command would make `0.1.13` public.
