# Round 26 executor prompt

You are executing round 26 in `~/repos/opencode-plugin-muse`. You have no memory
of the session that wrote this. Read, in order, before touching anything:

1. `docs/round-26-plan.md` — the plan, the decision table, and the state table
   you must update.
2. `docs/evidence-review-2026-11-24.md` — why each item exists.
3. `docs/round-25-plan.md` §12 — the previous round's results and deviations.
4. `docs/platform-support.md` and `docs/decision-coverage.md` — the claims you
   will correct.

The owner approved every experiment in the plan on 2026-11-24. Do not ask for
approval to run one. Ask only when a result reaches an `O#` choice in §6 of the
plan (O1–O8, including the two that are not experiment-derived), and batch all
such questions into one message with your recommendation.

## Ground rules

- Branch `round-26`, created from `round-25` (`98917f6`). Never commit to `main`.
  Never tag, publish, or submit anything.
- `docs/integration-landscape.md` is the owner's uncommitted file: never stage
  or edit it. `git status` is expected to show it.
- Harness CLIs and API keys load from `~/.zshenv`: run `gh`, `opencode`, `muse`
  under `zsh -lc`, never `bash -lc`.
- No new dependency. Scratch output in `scratch/`. Evidence that must outlive
  the artifacts in `docs/evidence/`.
- No `timeout-minutes` to hide a queue. Do not raise a test timeout without
  naming the consuming segment in the same commit. The Windows resume budget is
  4 s; leave it.
- If a measurement contradicts the plan, follow the measurement and record the
  deviation in the plan's status table and in the final report.
- If a step is blocked, record the blocker, do the independent steps, and report
  it; do not silently skip.

## State

After every item, edit the status table at the top of `docs/round-26-plan.md`:
`todo` → `doing` → `done`/`blocked`, with the commit or run id. Write experiment
logs to `scratch/round26-<id>.log` and JSON artifacts to
`docs/evidence/2026-11-24-<id>.json`. The next session will trust this file, so
leave enough detail to resume from it.

## Step 0 — branch and baseline

```bash
cd ~/repos/opencode-plugin-muse
git status --short
git switch -c round-26 round-25
npm run check:offline   # must be 443/0; record the exact count
```

If the baseline is not green, stop and report before changing anything.

## Step 1 — Workstream A (documentation, one commit)

Apply §1 of the plan exactly. Use the wording given for the Console sentences;
reclassify enterprise planes X → P; fix U16, U22, SEP-2663, OS isolation, and add
"(measured on 2.3.2)" to the rows that need it. Correct the round-25 results with
the 5-skip fact.

Acceptance:

```bash
rg "cannot be probed|cannot be created on this account|every install scope|Windows red on fixtures" docs/ || true
git diff --check
```

The only hits allowed are quoted history inside the review and audit records.
Commit: `docs: narrow the claims the evidence does not carry`.

## Step 2 — Workstream B (instruments)

Do B1 (JUnit summary), B2 (skip ledger guard), B3 (already in A), B4
(`runner.arch`), B5 (claims table + warn-only checker). B1's test uses inline
fixtures; B2 must fail when a new `.skip` appears without a reason. Add the
package scripts but keep network work out of `check:offline`.

Regenerate `docs/evidence/2026-11-24-791840c.json` in the v2 shape from
`scratch/junit-final/` if it still exists; if it does not, re-download the
artifacts for run 45296080862.

```bash
npm run check:offline
npx tsc --noEmit -p tsconfig.json
```

Commit: `test: count what ran, not only what was declared`.

## Step 3 — E36 (Console target inventory, free)

Follow §3 E36. Read-only. Use `scratch/e31-console-network.json` for asset URLs,
fetch the chunks, search the strings, then dump the builder's target control.
Record the asset hash and whether it changed. No PII in the artifact.

Apply D171 from the plan. If the hand-picked target exists and the owner can be
selected without inviting anyone, continue to E37; otherwise record and move on.

## Step 4 — E34 (Windows coverage, 1–2 dispatches)

Port the frozen-host test and the EOF test as described; port the login-link
test with the `EPERM` fallback assertion. Add the skip ledger entries. Push and
dispatch:

```bash
git push -f origin round-26:ci/seam
sleep 20
zsh -lc 'gh run list --limit 1 --json databaseId,status,headSha'
```

Wait for the run (poll `gh run view <id>`), download the three JUnit artifacts,
and regenerate the snapshot. Apply D163/D164/D165. If the login link fails with
`EPERM`, do not switch to copying `auth.json`; record the fallback and raise O3
only if the plan's condition applies.

## Step 5 — E35 (project-scoped plugin hook, real host)

Follow §3 E35. Install a local plugin with `--scope project` in a temp repo,
record what it writes, run `bun run doctor --json` in the repo and in a fresh
clone, and record the handler origin and whether the marker fires. Try without
`MUSE_EXPERIMENTAL_PLUGINS` first; note the flag if it is required.

Apply D160–D162. If branch 3 fires (silent fire from a clone), stop the code work
and ask O1 with your recommendation; do not invent a gate shape before the
answer.

## Step 6 — E38 (grandchild survivor, 1 dispatch)

Add the `spawn-detached` fixture mode and run the Windows seam. Record the direct
pid liveness and the sampler's lists side by side. Test `taskkill /T /F` only on
the fixture's own recorded pid, immediately after close; stop if the pid cannot
be matched.

Apply D166/D167. If the sleeper survives, ask O2 with the recommendation from the
plan (document + doctor warning, upstream job-object ask, no `/T` reaper).

## Step 7 — E37 (tag/policy write, account session)

Only if E36 found an endpoint. Create one tag, one Providers deny for `mistral`,
wait 90 s, read `opencode debug config` and `opencode models`, then delete both
and verify Controls and Members are as found. Record status codes and the
pre/post diff; no cookies, no tokens.

Apply D168–D170. If a Console source appears and O4 is live, ask before spending
the one turn.

## Step 8 — E39 (`denyUnmatched` wildcard, 1 H run)

Test the wildcard and the tool-shaped resource; record the refusal shape. Apply
D172/D173.

## Step 9 — E40 and final documentation

Build `docs/claims.md` / `docs/claims.json`; verify the states; run the
warn-only checker. Correct any stale row in the same commit.

Then update:

- `docs/round-26-plan.md` §Status and a results section with per-item command,
  result, branch applied, cost.
- `docs/evidence-audit.md` round-26 table.
- `docs/platform-support.md` counts and orphan row once E34/E38 land.
- `docs/decision-coverage.md` rows touched by E35/E37/E38/E39.

Final checks:

```bash
npm run check:offline
node --check test/seam/windows-real.mjs
node --check test/fixtures/fake-msp-host.mjs
git diff --check
git status --short
```

Commit the results on `round-26`. Do not merge to `main`.

## Final report

Report, in this order:

1. Baseline and final `check:offline` counts (tests, files, failures).
2. Per item: command/run id, result, branch applied, cost, artifact path.
3. Documentation changed, with the sentences that moved.
4. Checks run, and any check that failed or could not run.
5. Unmeasured items, each with the reason and the claim it leaves standing.
6. Owner choices still open (O1–O8), each with your recommendation and the
   result that would flip it. O7 and O8 do not depend on a result; state them as
   choices with the default you applied.

If the session must stop early, update the plan status table first and say
exactly where the next session should resume.
