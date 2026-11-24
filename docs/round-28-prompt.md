# Round 28 executor prompt

You are executing round 28 in `~/repos/opencode-plugin-muse`. You have no memory
of the session that wrote this. Read, in order, before touching anything:

1. `docs/round-28-plan.md` — the state table, experiments, decision table, and
   the `O#` choices. This is the execution target.
2. `docs/round-28-research.md` — the sources and the premise correction.
3. `docs/round-27-plan.md` §9 — the results this round continues.
4. `docs/decision-coverage.md` row C, `docs/platform-support.md`,
   `docs/policy-remote.md`, `docs/provenance.md` — the sentences you may edit.

The owner approved every experiment on 2026-11-24. Do not ask for permission to
run one. Ask only if O15 or O17 is live and the default would change what users
are promised; batch that into one message with your recommendation. Every other
choice has a default: apply it and record it.

## Ground rules

- Branch `round-28`, created from `round-27` (`332a400`). Never commit to `main`.
  Never tag, publish or submit anything.
- `docs/integration-landscape.md` is the owner's uncommitted file: never stage
  or edit it. `git status` is expected to show it.
- Run `gh`, `muse` and `opencode` under `zsh -lc`, never `bash -lc`.
- No new dependency. Scratch output in `scratch/`; durable evidence in
  `docs/evidence/`.
- Do not add `timeout-minutes` to hide a queue. Do not raise a test timeout
  without naming the consuming segment.
- If a measurement contradicts the plan, follow the measurement and record the
  deviation in the status table and the final report.
- If a step is blocked, record the blocker, do the independent steps, and report
  it; do not silently skip.

## State

After every item, edit the status table at the top of `docs/round-28-plan.md`:
`todo` → `doing` → `done`/`blocked`, with the commit or run id. Logs go to
`scratch/r28-<id>.log`; JSON artifacts to
`docs/evidence/2026-11-25-<id>.json`. The next session trusts this file; leave
enough detail to resume from it.

## Step 0 — branch and baseline

```bash
cd ~/repos/opencode-plugin-muse
git status --short
git switch round-28             # skip if already on round-28
git log --oneline -1
npm run check:offline           # expect 452 pass / 0 fail / 41 files
bun scripts/check-claims.ts     # expect 17/17
```

If the baseline is not green, stop and report before changing anything. Do not
stage `docs/integration-landscape.md`.

## Step 1 — Workstream A (documentation, one commit)

Apply §1 of the plan:

- **A1.** In `docs/decision-coverage.md` row C, add the Auto-review correction:
  round 27 selected `onRequest` but not the `:ask-me` permission profile, and
  Auto-review can clear an eligible MCP call. Say E48 selects `:ask-me` with
  `requirePermissionProfile` and repeats the question. Keep "saved-rule half
  unmeasured", not "answered". Do not edit `docs/evidence/2026-11-24-e44.json`.
  Apply the same correction in `src/session.ts` only if the absolute appears
  there and is now false.
- **A2.** In `docs/provenance.md`, add the one-sentence release status: the
  current tree is unreleased, npm latest is 0.1.12, patches 3–5 exist only here,
  and 0.1.13 is O15, not an implication of a green suite. Do not bump
  `package.json`, rebuild `dist/`, or run `npm publish`.

Acceptance:

```bash
rg "E44 found no approval offered|Auto-review|E48" docs/decision-coverage.md src/session.ts README.md
git diff --check
```

Only quoted history in the round-27 plan/research or the evidence file may match
the old sentence. Commit:

```bash
git add docs/decision-coverage.md docs/provenance.md src/session.ts
git commit -m "docs: correct the E44 approval premise and state the release status"
```

Do not stage the owner's integration file.

## Step 2 — E48 (2–3 turns, cap $0.50)

Follow §2 E48. This is the only experiment that can change code, and it changes
nothing until O16 says so.

1. Change the fixture for this probe:
   - server id `opencode`, tool `bash`, so the registered name is
     `mcp__opencode__bash`;
   - no `readOnlyHint`; add
     `annotations: { readOnlyHint: false, destructiveHint: true }`;
   - the tool stays harmless: it echoes its argument, never executes a shell.
2. Update `test/seam/muse-approval-rule.mjs`:
   - `startSession` gets `permissionProfile: ":ask-me"` and
     `requirePermissionProfile: true`;
   - record each session's `permissionState.profileId` (or the start result's
     equivalent);
   - record `availableChoices` before choosing;
   - choose the `localPersistent` allow choice if present, else the best allow,
     else the reject; record `rulePreview` and `amendment`.
3. Session 1: `approvalMode: "onRequest"`, one turn with
   "Call the bash tool once with the text hi. Do not answer in text."
   One retry is allowed if no tool call arrives; stop at two turns.
4. Find the store only under `~/.config/muse`, `~/.local/share/muse`, `~/.muse`:
   `find <root> -name 'approval-policy.json'`. Record the path, size, and lines
   mentioning `mcp__opencode__bash`. Do not copy auth files.
5. Session 2: same workspace, `approvalMode: "denyUnmatched"`, `:ask-me`; same
   prompt, one turn. Record whether the tool runs or is refused with
   `deny_unmatched`.
6. Cleanup only the rule this probe created. If the store contains other rules,
   leave it and disclose the path/rule. Never delete the whole store.

Run the probe under `zsh -lc` so credentials load. Stop at 3 attempts or $0.50.
Apply D194–D199. Artifact: `docs/evidence/2026-11-25-e48.json`.

If `:ask-me` or `requirePermissionProfile` is refused, record the error and mark
E48 blocked. Do not silently fall back to Auto-review.

## Step 3 — E49 (browser only, no model turn)

Follow §2 E49. Use an existing authenticated browser session for
`https://opencode.ai/console`; do not sign in if none exists.

1. Record `opencode debug config` before: source types and `info.policies`.
2. Create a Providers deny for `deepseek` in Controls → Policies for the sole
   member (or the hand-picked member route E37 used). Wait 90 s.
3. Record `opencode debug config` after and `opencode models --standalone`.
4. Run `opencode run --standalone --model deepseek/deepseek-flash "say ok"`;
   record the exact stderr and exit code. If it starts a model turn, stop before
   the first token if possible and record any cost.
5. Delete the policy; verify Controls and `debug config` are as found. If
   deletion fails, say so.

If no authenticated session exists, mark E49 blocked and do not touch the
account. Apply D200–D203. Artifact: `docs/evidence/2026-11-25-e49.json`.

## Step 4 — R1 (read-only, no release)

Follow §2 R1:

```bash
git status --short
git log --oneline -8
node -p "require('./package.json').version"
zsh -lc 'npm view @jonathand34/opencode-plugin-muse version dist-tags --json'
rg -n '0\.1\.12|0\.1\.13|unpublished|patches 3' README.md docs/provenance.md
bash scripts/repro.sh; echo "repro exit=$?"
```

Do **not** run `npx tsc`, `npm pack`, `npm publish --dry-run`, or edit `dist/`.
The expected `repro.sh` failure is a release gap, not a defect. Apply D208–D210.
Artifact: `docs/evidence/2026-11-25-r1.json`.

## Step 5 — E50 (owner-assisted; do not invent a result)

If `scratch/windows-desktop-*.json` exists from the owner, read it and apply
D204–D207. Otherwise mark E50 `blocked: owner-assisted`, apply O17 A, and leave
the platform sentence alone. Do not run a hosted runner as a desktop.

## Step 6 — final documentation and checks

Apply only the result rows that fired:

- `docs/round-28-plan.md` §Status and §9, with command/run id, result, branch
  applied, cost.
- `docs/evidence-audit.md` — a round-28 table.
- `docs/platform-support.md` only if E50 changed a sentence.
- `docs/decision-coverage.md` only the E48 row.
- `docs/policy-remote.md` only the E49 sentence.
- `docs/provenance.md` only the R1 release status, if it moved.
- `docs/claims.md`/`.json` only if a claim actually changed; run
  `bun scripts/check-claims.ts` after any edit.

Final checks:

```bash
npm run check:offline
bun scripts/check-claims.ts
git diff --check
git status --short
```

Commit the results on `round-28`. Do not merge to `main`, do not push, tag or
publish.

## Final report

Report, in this order:

1. Baseline and final `check:offline` counts (tests, files, failures).
2. Per item: command/run id, result, branch applied, cost, artifact path.
3. Documentation changed, with the sentences that moved.
4. Checks run, and any check that failed or could not run.
5. Unmeasured items, each with the reason and the claim it leaves standing.
6. Owner choices O15–O20 with the default applied and the result that would flip
   each; O15/O17 only if they still need a reply.
7. Where the next session should resume if this one stops early.

If E48 is blocked, say so explicitly and keep the saved-rule question
unmeasured; do not call it answered.
