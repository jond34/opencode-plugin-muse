# Round 27 executor prompt

You are executing round 27 in `~/repos/opencode-plugin-muse`. You have no memory
of the session that wrote this. Read, in order, before touching anything:

1. `docs/round-27-plan.md` — the state table, experiments, decision table, and
   the `O#`/`P#` choices.
2. `docs/round-27-research.md` — why the premises moved; the URLs and quotes.
3. `docs/round-26-plan.md` §6b — the results this round continues.
4. `docs/platform-support.md`, `docs/decision-coverage.md`,
   `docs/policy-remote.md` — the sentences you may edit.

The owner approved every experiment in the plan on 2026-11-24. Do not ask for
permission to run one. Ask only when a result reaches O9 or O11 in §4 and the
default would change what users are promised; batch any such question into one
message with your recommendation. Every other choice has a default in the plan:
apply it and record it.

## Ground rules

- Branch `round-27`, created from `round-26` (`46004ce`). Never commit to `main`.
  Never tag, publish, or submit anything.
- `docs/integration-landscape.md` is the owner's uncommitted file: never stage
  or edit it. `git status` is expected to show it.
- Harness CLIs and keys load from `~/.zshenv`: run `gh`, `muse`, `opencode`
  under `zsh -lc`, never `bash -lc`.
- No new dependency. Scratch output in `scratch/`. Evidence that must outlive
  the artifacts in `docs/evidence/`.
- Do not add `timeout-minutes` to hide a queue. Do not raise a test timeout
  without naming the consuming segment in the same commit. E42's 10 s race is a
  diagnostic, not a new budget.
- If a measurement contradicts the plan, follow the measurement and record the
  deviation in the status table and the final report.
- If a step is blocked, record the blocker, do the independent steps, and
  report it; do not silently skip.

## State

After every item, edit the status table at the top of `docs/round-27-plan.md`:
`todo` → `doing` → `done`/`blocked`, with the commit or run id. Logs go to
`scratch/r27-<id>.log`; JSON artifacts to
`docs/evidence/2026-11-24-<id>.json`. The next session trusts this file; leave
enough detail to resume from it.

## Step 0 — branch and baseline

```bash
cd ~/repos/opencode-plugin-muse
git status --short
git switch -c round-27 round-26   # skip if already on round-27
npm run check:offline             # expect 452 pass / 0 fail / 41 files
```

If the baseline is not green, stop and report before changing anything. Do not
stage `docs/integration-landscape.md`.

## Step 1 — Workstream A (documentation, one commit)

Apply §1 of the plan exactly:

- A1: replace the E35 "instrument gap" sentence with the first-prompt timing,
  leaving firing unmeasured until E41.
- A2: narrow the authority-order sentence: shell rules are argv-prefix scoped;
  MCP tool approvals can be saved since 1.4.0; the store is unpublished; an
  unseeded `denyUnmatched` still refuses. Do the same in `src/session.ts` and
  `README.md` if the absolute appears there.
- A3: add the Console `document`-source paragraph to `docs/policy-remote.md`.
- A4: close the tag-API question as "untested, not on the measured route".
- A5: add the older claim rows/markers to `docs/claims.md`/`.json`.

Acceptance:

```bash
rg "MSP `session/start` path did not dispatch|cannot name an MCP tool" docs src README.md
git diff --check
```

Only quoted history in the review/audit records may match. Commit:
`docs: correct the SessionStart and policy-plane premises`.

## Step 2 — E41 (free)

Follow §2 E41. Create the temp plugin and repo under `scratch/r27/e41/`; install
with `--scope project`; approve; run:

```bash
zsh -lc 'cd ~/repos/opencode-plugin-muse/scratch/r27/e41/repo && muse exec --provider echo --trust-workspace "ok"'
```

The marker is an absolute path (`/tmp/r27-e41-marker`); the hook environment is
cleared, so do not rely on `E41_MARKER`. Record whether it was written before or
after the prompt, and run the unapproved control once. Apply D177/D178; update
A1 only. Artifact: `docs/evidence/2026-11-24-e41.json`.

## Step 3 — E42 (1 dispatch)

Follow §2 E42. Add `test/seam/windows-close.mjs` with the JSON line and a
`continue-on-error: true` step in the `seam-windows` job. Do not touch the
existing 15 s test budget or the skip. Push and dispatch:

```bash
git push -f origin round-27:ci/seam
sleep 20
zsh -lc 'cd ~/repos/opencode-plugin-muse && gh run list --limit 1 --json databaseId,status,headSha'
```

Wait for the run, read the E42 step with
`zsh -lc 'gh run view --job <id> --log'`, and record the JSON. Apply
D179–D181. Artifact: `docs/evidence/2026-11-24-e42.json`.

## Step 4 — E43 (one local run; Console optional)

Follow §2 E43. The local control is a temp project under `scratch/r27/e43/` with
a `policies` deny for `mistral`; run:

```bash
zsh -lc 'cd <temp> && opencode run --model mistral "say ok"'
```

Record the exact stderr. Only if the E37 browser session is still available,
repeat through Controls for one member, wait 90 s, confirm the statement in
`opencode debug config`, run the same command, record the sentence, delete the
policy, and verify Controls is as found. Do not spend a model turn for this
sentence; if the command would start one, stop. Apply D182–D184. Artifact:
`docs/evidence/2026-11-24-e43.json`.

## Step 5 — E44 (2–3 turns, cap $0.50)

Follow §2 E44. E39 is retired; do not run its `tool.use` wildcard. Add the
fixture and the probe script, run the first session with `approvalMode:
"onRequest"`, choose the `localPersistent` choice for the `tool` subject, record
`rulePreview`/`amendment`, find `approval-policy.json`, then run the second
session with `approvalMode:"denyUnmatched"`. Record whether the tool runs or is
refused. Stop after 3 attempts or $0.50. Clean up only the rule created; if the
store cannot be edited safely, leave it and disclose the path. Apply
D185–D187. If the rule works and O9 is live, ask once with the A/B/C options and
your recommendation; otherwise apply A and continue. Artifact:
`docs/evidence/2026-11-24-e44.json`.

## Step 6 — E45 (1 dispatch)

Follow §2 E45. Add the `IsProcessInJob` check to
`test/seam/windows-grandchild.mjs`, push `round-27:ci/seam`, and read the E38
step. Apply D188/D189. Artifact: `docs/evidence/2026-11-24-e45.json`.

## Step 7 — E46 (owner kit)

Add `docs/windows-desktop-check.md` and `scripts/windows/desktop-probe.ps1` as
§2 E46 describes. Do not run a desktop claim yourself. If the owner has already
run it and the JSON exists, apply D190/D191; otherwise mark E46 `blocked:
owner-assisted` and apply O11 A. Artifact only if the owner's JSON exists.

## Step 8 — E47 and final documentation

Add the four older claim rows or markers; run:

```bash
zsh -lc 'cd ~/repos/opencode-plugin-muse && bun scripts/check-claims.ts'
```

Then update:

- `docs/round-27-plan.md` §Status and a results section with per-item command,
  run id, result, branch applied, cost.
- `docs/evidence-audit.md` round-27 table.
- `docs/platform-support.md` only if E42/E45/E46 changed a sentence.
- `docs/decision-coverage.md` only the rows E41/E44 touched.
- `docs/policy-remote.md` only the E43 sentence.

Final checks:

```bash
npm run check:offline
bun scripts/check-claims.ts
node --check test/seam/windows-close.mjs
node --check test/fixtures/fake-mcp-tool.mjs
node --check test/seam/muse-approval-rule.mjs
git diff --check
git status --short
```

Commit the results on `round-27`. Do not merge to `main`.

## Final report

Report, in this order:

1. Baseline and final `check:offline` counts (tests, files, failures).
2. Per item: command/run id, result, branch applied, cost, artifact path.
3. Documentation changed, with the sentences that moved.
4. Checks run, and any check that failed or could not run.
5. Unmeasured items, each with the reason and the claim it leaves standing.
6. Owner choices: O9–O14 with the default applied and the result that would
   flip it; O9/O11 only if they still need a reply. P1–P3 with the default.
7. Where the next session should resume if this one stops early.

If E44 is skipped or blocked, say so explicitly and keep A2's "opaque store"
sentence; do not call the question answered.
