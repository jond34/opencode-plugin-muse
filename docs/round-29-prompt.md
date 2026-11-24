# Round 29 executor prompt

You are executing round 29 in `~/repos/opencode-plugin-muse`. You have no memory
of the session that wrote this. Read, in order, before touching anything:

1. `docs/round-29-plan.md` — the state table, workstreams, experiments, decision
   table, and O15–O24. This is the execution target.
2. `docs/round-29-research.md` — the sources and the reasoning behind the
   release, approval, Windows, and vendor choices.
3. `docs/round-28-plan.md` §9 — the results this round continues.
4. `README.md`, `docs/provenance.md`, `docs/platform-support.md`,
   `docs/watchlist.md`, `.github/workflows/publish.yml`,
   `.github/workflows/test.yml`, `scripts/repro.sh` — the files A1/A2 and E51
   touch.
5. `SECURITY.md`, `docs/evidence/2026-11-25-e48.json`,
   `docs/evidence/2026-11-25-e49.json`, `docs/evidence/2026-11-25-r1.json` —
   the release and approval evidence.

The owner approved every experiment. Do not ask permission to run one. The
defaults below are already chosen; apply them unless the owner has replied with
a different O-choice. A publish, a staged upload, a tag, a push, or a vendor
submission is **not** an experiment and is **not** authorized here.

## Ground rules

- Branch `round-29`, created from `round-28` (`e53d792`). Never commit to `main`.
- Never run `git push`, `git tag`, `npm publish`, `npm stage publish`, or
  `npm stage approve`. Do not open a GitHub Release, issue, discussion, or
  advisory.
- `docs/integration-landscape.md` is the owner's uncommitted file: never stage
  or edit it. `git status` is expected to show it.
- Run `gh`, `muse`, and `opencode` under `zsh -lc`, never `bash -lc`.
- No new dependency in the repo. Scratch output in `scratch/`; durable evidence
  in `docs/evidence/`.
- Do not add `timeout-minutes`. Do not raise a test timeout without naming the
  consuming segment in the same commit.
- If a measurement contradicts the plan, follow the measurement and record the
  deviation in the status table and §9.
- If a step is blocked, record the blocker, do the independent steps, and report
  it; do not silently skip.

## Defaults already selected

Apply these unless the owner has replied otherwise:

- **O15 A:** prepare 0.1.13; do not publish.
- **O16 A:** keep `allowAll`; do not build the approval surface.
- **O17 A:** Windows best-effort; retire the desktop row if E53 has no JSON.
- **O18 A:** vendor drafts only; no contact.
- **O19 A:** native history stays opt-in.
- **O20 A:** evidence stays repo-side.
- **O21 A:** version 0.1.13.
- **O22 A:** change the workflow to staged publish, pinning npm 11.19.1 if the
  job's bundled CLI is below 11.15, and document stage-only trusted publishing;
  do not dispatch it.
- **O23 A:** add `CHANGELOG.md` and a GitHub body draft.
- **O24 A:** README + `SECURITY.md`; no `SUPPORT.md`, no issue templates.

If the owner has explicitly chosen O21 B (0.2.0), use 0.2.0 everywhere instead
of 0.1.13. If O22 B is chosen, keep `npm publish`; if O16 B is chosen, run E54
only, do not build the product surface this round. If O17 B is chosen, it still
requires E53's JSON.

## State

After every item, edit the status table at the top of `docs/round-29-plan.md`:
`todo` → `doing` → `done`/`blocked`, with the commit or run id. Logs go to
`scratch/r29-<id>.log`; JSON artifacts to
`docs/evidence/2026-11-25-<id>.json`. The next session trusts this file; leave
enough detail to resume from it.

## Step 0 — baseline

```bash
cd ~/repos/opencode-plugin-muse
git status --short
git branch --show-current           # expect round-29
git log --oneline -1                # expect e53d792
npm run check:offline               # expect 452 pass / 0 fail / 41 files
bun scripts/check-claims.ts         # expect 17/17
```

If the baseline is not green, stop and report before changing anything. Do not
stage `docs/integration-landscape.md`.

## Step 1 — A1–A5 (documentation, one commit)

Apply §1 of the plan.

### A1

Fix the stale claims in:

- `README.md` Platforms: “410 tests each” becomes the measured frame — 419
  declared; Ubuntu 419/0; macOS 419/0; Windows 416 ran / 0 failed / 3 skipped
  of 419; local 452 / 41 files.
- `docs/platform-support.md`: the macOS row that says 406 becomes 419.
- `docs/watchlist.md`: the policy row (E37/E49 created a policy; remove “could
  not be created”), the Console lifecycle row (hand-picked members are
  available), and the platforms row (macOS 419, not 406). Move the snapshot
  line to 2026-11-25; only update `Last checked` for rows actually rechecked.
- `.github/workflows/test.yml`: remove “nobody has run it yet”; the matrix has
  run. Keep the manual/branch comments.
- `docs/claims.md`/`docs/claims.json` only if a claim row actually changed; run
  `bun scripts/check-claims.ts` after any edit.

Acceptance:

```bash
rg -n '410 tests|406 tests|could not be created|nobody has run it yet' \
  README.md docs/platform-support.md docs/watchlist.md .github/workflows/test.yml
git diff --check
```

Historical round files may still contain the old text; do not rewrite them.

### A2

Add `docs/release.md` with the sections in plan §1 A2: current state, version
policy, candidate gates, staged publish flow, rollback, what not to promise,
and links to provenance/platform/evidence. Link it from README's verify
sections. Do not duplicate the README.

### A3

Add `docs/approval.md` with the measured posture in plan §1 A3: Muse modes and
scopes, opencode's gate, E48's saved rule, why the plugin still uses `allowAll`,
the double-gate risk, and what would change it. Link it from README's approval
paragraph and `SECURITY.md` scope if useful.

### A4

Add `docs/vendor-issues.md` with the two drafts in plan §1 A4, clearly marked
**not submitted**. Include only the E48 store preview and the E42 close facts;
no tokens, workspace id, or auth paths. Do not open anything.

### A5

Add `CHANGELOG.md` with a short 0.1.13 entry and a GitHub release-body draft.
Include the user-visible changes and the limits that did not change. Add
`CHANGELOG.md` to `package.json` `files` (default) or record why not.

Acceptance:

```bash
git diff --check
rg -n 'docs/release.md|docs/approval.md|docs/vendor-issues.md|CHANGELOG' README.md docs/release.md
```

Commit only A1–A5:

```bash
git add README.md docs/platform-support.md docs/watchlist.md \
  .github/workflows/test.yml docs/release.md docs/approval.md \
  docs/vendor-issues.md CHANGELOG.md package.json
git commit -m "docs: align the release claims and record the posture"
```

Do not stage the owner's integration file.

## Step 2 — R2 (read-only published-artifact audit)

Follow plan §2 R2. Use `scratch/r29-r2/`. Verify:

- `v0.1.12` tag's `package.json` version/name.
- npm `dist.integrity`, `dist.tarball`, `gitHead`.
- the published tarball's `package/package.json` and file list.
- the SLSA provenance `subject[0].digest.sha512` matches the registry tarball.
- `npm audit signatures` in a temporary prefix.

Do not edit global npm config, do not log in, do not install into the repo.
Apply D211–D213. Artifact: `docs/evidence/2026-11-25-r2.json`.

If R2 is D212/D213, stop the release path; still finish A and report. Do not
build a candidate on a broken baseline.

## Step 3 — E51 (release candidate, local only)

Preconditions: A1–A5 committed; R2 is D211; baseline green; integration file
still unstaged.

Follow plan §2 E51:

1. `npm version 0.1.13 --no-git-tag-version --force` (or O21 B). `--force` is
   only for the intentionally dirty integration file; do not use it elsewhere.
2. `npm ci`; `npm run build`; compute the canonical `dist` hash and file count.
3. Update `scripts/repro.sh` `EXPECTED` and `docs/provenance.md` with the new
   hash, count, version, and “not published.” Run `bash scripts/repro.sh`; it
   must print `PASS`.
4. If O22 A, change `.github/workflows/publish.yml` from `npm publish` to
   `npm stage publish`. Check `npm --version`; staged publishing requires
   11.15+. The job currently inherits npm from Node 24, so if the bundled CLI is
   older, add `npm install -g npm@11.19.1` before `npm ci`. Update
   `SECURITY.md`, README, and `docs/release.md` to say staged, not direct, and
   record the owner's stage-only trusted-publisher setting as an external
   action. Do not dispatch it.
5. `npm pack --pack-destination scratch/r29-e51`; inspect the tarball for the
   required files and the forbidden ones (scratch, tests, evidence tarballs,
   `.env*`, `.git`). Record size, shasum, integrity, count.
6. `npm run check:offline`; `bun scripts/check-claims.ts`; `git diff --check`.
7. Commit the candidate with explicit paths (do not stage the integration
   file):

   ```bash
   git add package.json package-lock.json scripts/repro.sh docs/provenance.md \
     .github/workflows/publish.yml SECURITY.md README.md docs/release.md CHANGELOG.md
   git commit -m "release: prepare 0.1.13 candidate"
   ```

Do not run `npm publish`, `npm stage publish`, `npm stage approve`, `git tag`,
or `git push`. If pack or repro fails, do not commit a broken candidate; record
the failure and leave the tree for the report.

Apply D214–D217. Artifact: `docs/evidence/2026-11-25-e51.json`.

## Step 4 — E52 (isolated load smoke)

Follow plan §2 E52 in `scratch/r29-e52/`:

1. `npm init -y`; install the E51 tarball with `--no-save`.
2. `bun -e 'import("@jonathand34/opencode-plugin-muse").then(m => console.log(typeof m.default))'`
   from that prefix.
3. If and only if it can be done without touching `~/.config/opencode`, create a
   throwaway `XDG_CONFIG_HOME` with `plugins/muse.js` re-exporting the installed
   package and run `opencode models --standalone` under `zsh -lc`.
4. If the isolated opencode load would touch the real config or cannot
   authenticate, record `inconclusive`; do not edit owner config.

Apply D218–D220. Artifact: `docs/evidence/2026-11-25-e52.json`.

## Step 5 — E53 (Windows desktop)

If `scratch/windows-desktop-*.json` exists, read it and apply D221–D224. If not,
mark E53 `blocked: owner-assisted`, apply O17 A, and **retire the desktop row**
in `docs/platform-support.md` (the prior round's own condition). Do not run a
hosted runner as a desktop. Do not invent a result. Artifact only if run:
`docs/evidence/2026-11-25-e53.md`.

## Step 6 — E54 only if O16 B

Under O16 A (default), mark E54 `not run: O16 A`. Do not modify approval code.

If the owner selected O16 B, follow plan §2 E54 on a scratch/temporary worktree:
first check whether the installed opencode API has a non-prompting
`permission.allows` or single-use admission binding. If not, record D226 with no
turn. Otherwise run one spike, at most two turns, count prompts and saved
approvals. Apply D225/D226. Do not ship the surface in this round.

## Step 7 — final documentation and checks

Apply only the result rows that fired:

- `docs/round-29-plan.md` §Status and §9, with command/run id, result, branch
  applied, cost.
- `docs/evidence-audit.md` — a round-29 table.
- `docs/provenance.md` only for the candidate hash/version.
- `docs/platform-support.md` only for E53/retirement.
- `docs/release.md`/`SECURITY.md`/README only for the O22 staged flow.
- `docs/claims.md`/`.json` only if a claim actually changed; rerun
  `bun scripts/check-claims.ts`.

Final checks:

```bash
npm run check:offline
bun scripts/check-claims.ts
git diff --check
git status --short
```

Commit the results on `round-29`:

```bash
git add docs/round-29-plan.md docs/evidence-audit.md docs/provenance.md \
  docs/platform-support.md docs/release.md SECURITY.md README.md \
  docs/evidence/2026-11-25-r2.json docs/evidence/2026-11-25-e51.json \
  docs/evidence/2026-11-25-e52.json
git commit -m "docs: close round 29 on the release candidate and posture"
```

If E53 or E54 produced an artifact, add that path too. Do not use a glob that
can silently stage an old or unexpected evidence file.

Do not stage `docs/integration-landscape.md`. Do not merge to `main`, push, tag,
publish, or submit anything.

## Final report

Report, in this order:

1. Baseline and final `check:offline` counts (tests, files, failures).
2. Per item: command/run id, result, branch applied, cost, artifact path.
3. Documentation changed, with the sentences that moved.
4. Checks run, and any check that failed or could not run.
5. Unmeasured items, each with the reason and the claim it leaves standing.
6. Owner choices O15–O24 with the default applied and the result that would flip
   each. Only O17/O21/O22 may still need a reply.
7. The exact next owner action for the candidate: push the branch, dispatch
   `publish.yml`, review the staged tarball, approve with 2FA. Do not do it.

If E51 is blocked, say so explicitly and do not call the release candidate
ready. If E53 is blocked, do not upgrade the Windows claim. If E54 is not run,
say the approval posture remains A and why.
