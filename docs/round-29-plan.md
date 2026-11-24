# Round 29 plan: ship a candidate, settle the posture

**Written** 2026-11-25, on branch `round-29` off `round-28` (`e53d792`). The
owner approved every experiment. This file is the execution target and the
resume state. Update the status table after every item and write results in §9
before moving on.

The round has one rule: **a measurement may change a sentence or a release gate;
it may not silently change a product promise.** The only product choices that can
change behavior are O16, O17, O21, and O22. Everything else is documentation,
release mechanics, or a draft.

## Status

| Item | State | Commit / run | Note |
|---|---|---|---|
| A1. Claim drift | todo | | README test counts, watchlist rows, test workflow header |
| A2. Release page | todo | | `docs/release.md`; gates, staged flow, rollback |
| A3. Approval page | todo | | `docs/approval.md`; one gate vs two |
| A4. Vendor drafts | todo | | `docs/vendor-issues.md`; no submission |
| A5. Changelog | todo | | `CHANGELOG.md` and GitHub release-body draft |
| R2. Published-artifact audit | todo | | read-only 0.1.12 provenance/tarball |
| E51. Release candidate | todo | | 0.1.13 build, hash, pack |
| E52. Isolated load smoke | todo | | installed tarball, no owner config |
| E53. Windows desktop | blocked | | owner-assisted; no JSON yet |
| E54. Approval two-gate spike | conditional | | only if O16 B is chosen |
| F. Final checks and commit | todo | | |
| C. Results and choices | todo | | §9 |

---

## 0. State at handoff

- Branch `round-29`, HEAD `e53d792`. `main` is untouched. `v0.1.12` is the only
  tag; there is no GitHub Release.
- `docs/integration-landscape.md` is the owner's uncommitted file: never stage
  or edit it. `git status` is expected to show it.
- Baseline: `npm run check:offline` is 452 pass / 0 fail / 41 files;
  `bun scripts/check-claims.ts` is 17/17.
- npm latest is 0.1.12, last modified 2026-11-18. The repo is public.
- `.github/workflows/publish.yml` uses OIDC trusted publishing and currently
  calls `npm publish`. `.github/workflows/test.yml` is manual and records the
  runner matrix.
- `scripts/repro.sh` hardcodes the old 100-file hash. The current `dist` is
  160 files. The release candidate must rebuild and record the new hash.
- Constraints: never commit to `main`; never tag, publish, stage-publish, or
  push in this round; run `gh`, `muse`, and `opencode` under `zsh -lc`; no new
  dependency; scratch in `scratch/`; evidence in `docs/evidence/`.
- Do not add `timeout-minutes`. Do not raise a test timeout without naming the
  consuming segment in the same commit.
- A publish, a tag, a staged upload, or a vendor submission is **not** approved
  by “all experiments approved.” Those are separate owner actions.

---

## 1. Workstream A — documentation before the build

One commit, before any code or version change. The point is to make the release
candidate describe the tree it is actually in.

### A1. Correct the claim drift

Fix each of these in the same commit:

1. `README.md` Platforms: replace “410 tests each, 2026-11-24” with the measured
   published frame: 419 declared, Ubuntu 419/0, macOS 419/0, Windows 416 ran /
   0 failed / 3 skipped of 419; local checkout 452 / 41 files. Keep the sentence
   that the matrix proves the suite, not the seam.
2. `docs/platform-support.md`: the macOS row that says 406 becomes 419; the
   header already says 419, so the row is the drift.
3. `docs/watchlist.md`:
   - the policy row: E37/E49 created a Providers policy; it compiled into the
     unpathed `document` source and the denial was generic. Remove “could not be
     created.”
   - the Console lifecycle row: E37 used the hand-picked-member route; the
     builder is not tag-only.
   - the platforms row: macOS 406 becomes 419.
   - the snapshot line: 2026-11-23 becomes 2026-11-25; update `Last checked`
     only for the rows actually rechecked in this pass.
4. `.github/workflows/test.yml` header: remove “nobody has run it yet”; the
   matrix has run (45281586619, 45302817218, and later). Keep the manual-only
   and branch-trigger comments.
5. Check `docs/claims.md`/`docs/claims.json` for the same counts. If a claim row
   changes, run `bun scripts/check-claims.ts`.

**Acceptance:**

```bash
rg -n '410 tests|406 tests|could not be created|nobody has run it yet' \
  README.md docs/platform-support.md docs/watchlist.md .github/workflows/test.yml
# no stale hit; historical round files may still contain the old text
git diff --check
```

Commit: `docs: align the release claims with the measured frame`.

### A2. Add `docs/release.md`

A short, operational page, not another essay:

- **Current state:** npm 0.1.12; tag `v0.1.12`; no GitHub Release; tree carries
  patches 3–5; `dist` stale.
- **Version policy:** `0.y.z` is initial development; patch for fixes, minor for
  substantial compatible work, major only when the public API is declared
  stable. Do not reuse a published version.
- **Candidate gates:** claims check; `npm run check:offline`; `scripts/repro.sh`
  with the new hash; `npm pack` inspection; isolated install; no secrets or
  scratch; Windows sentence unchanged unless E53 passes.
- **Publish flow:** GitHub OIDC trusted publishing; staged publish
  (`npm stage publish`) then owner 2FA approval is the recommended path
  (O22). The workflow change is one line plus a pinned npm CLI upgrade: staged
  publishing requires npm 11.15+, while the workflow currently takes whatever
  npm ships with Node 24. It does not publish anything by itself.
- **Rollback:** never overwrite a published version; deprecate it and publish a
  patch. A failed stage can be rejected without a registry change.
- **What not to promise:** no desktop parity, no containment behind the bridge,
  no per-turn cost, no offline path.
- **Evidence:** link `docs/provenance.md`, `docs/platform-support.md`,
  `docs/evidence-audit.md`.

Link it from README's “Verify the build” / “Verify the published package”
section. Do not duplicate the whole README.

### A3. Add `docs/approval.md`

One page with the measured posture:

- Muse has four modes and three scopes; approvals are durable and do not expire;
  MCP tools are not sandboxed.
- opencode has its own ordered permission engine; the bridge emits tool calls
  into it; `mcp__opencode__bash` is registered as `opencode_bash` for rules.
- E48 measured the saved `localPersistent` rule for `mcp__opencode__bash` and a
  second `denyUnmatched` session. Include the exact approval menu and store
  shape, or link the evidence.
- The plugin still starts `allowAll` because it has no path that presents Muse's
  approval to the opencode user. A saved rule removes a refusal; it does not add
  a surface.
- The double-gate risk: `ctx.permission.assert` would present a second gate
  before the tool call opencode already gates. B needs a measured one-prompt
  path, not just D194.
- What would change the posture: a native pre-approved-call path, or a measured
  one-prompt flow with choice mapping and refusal handling.

Link from README's approval paragraph and `SECURITY.md` scope if useful.

### A4. Add `docs/vendor-issues.md`

Two drafts, clearly marked **not submitted**:

1. **Muse approval-policy schema.** Ask for a versioned schema, migration rules,
   and an error on unknown shape. Include the E48 schema_version 2 preview and
   the `tool_action` rule; no tokens, no workspace id.
2. **SDK transport `closed` after EOF on Windows.** Include E42: `closed` still
   pending after 10 s while `close()` settled in 7 ms and killed the pid. Ask
   for the promise to settle or for the documented contract to say it does not.

Add a “do not file yet” banner and the exact evidence paths. Do not open an
issue, comment, discussion, or security advisory.

### A5. Add `CHANGELOG.md`

A short 0.1.13 entry with three sections: containment/private host config,
opencode-owned context and native history, effort/prompt/history boundaries.
Name the user-visible changes and the limits that did not change. Add a
GitHub-release-body draft under `docs/release-notes/0.1.13.md` or in the
changelog itself; do not create a GitHub Release.

Add `CHANGELOG.md` to `package.json` `files` if it should ship in the tarball;
if not, say so in `docs/release.md`. Default: include it.

**Commit A:** all five files in one commit after acceptance. Do not stage the
owner's integration file.

---

## 2. Experiments

### R2 — published-artifact audit (read-only, free)

**Question.** Is the published 0.1.12 artifact coherent with its provenance and
workflow, so the next candidate can reuse the same path?

**Method.** In `scratch/r29-r2/`:

```bash
git show v0.1.12:package.json
zsh -lc 'npm view @jonathand34/opencode-plugin-muse@0.1.12 version dist.integrity dist.tarball gitHead --json'
zsh -lc 'npm pack @jonathand34/opencode-plugin-muse@0.1.12 --pack-destination scratch/r29-r2'
curl -sS -A npm/11.19.1 \
  "https://registry.npmjs.org/-/npm/v1/attestations/@jonathand34%2fopencode-plugin-muse@0.1.12" \
  | jq -r '.attestations[] | select(.predicateType=="https://slsa.dev/provenance/v1")
      | .bundle.dsseEnvelope.payload' \
  | base64 -d | jq -r '.subject[0].digest.sha512'
```

Then inspect the tarball with `tar -tzf`, compare its `package/package.json` to
the tag, and run `npm audit signatures` in a temporary prefix after installing
the published package. Do not install into the repo; do not edit the global npm
config; do not log in.

**Branches:**

| Result | Action |
|---|---|
| Integrity/attestation match, tarball matches tag, signature audit passes | D211: release path viable; O15 A |
| Attestation missing or digest mismatch | D212: block release; record exact mismatch; no candidate |
| npm version moved or 0.1.12 no longer latest | D213: stop; record new state; do not reuse a version |

**Cost:** free. **Artifact:** `docs/evidence/2026-11-25-r2.json`.

### E51 — release candidate 0.1.13 (local, no publish)

**Question.** Does the current tree produce a coherent, installable 0.1.13
candidate with a reproducible `dist` and a clean package?

**Preconditions:** A1–A5 committed; R2 is D211; baseline green; the owner's
integration file is unstaged.

**Method:**

1. Bump without a tag. The owner's integration file keeps the tree dirty, so
   `npm version` needs `--force` for the version-only update:
   `npm version 0.1.13 --no-git-tag-version --force`. Do not use `--force` for
   anything else, and do not stage the integration file.
2. `npm ci`; `npm run build`; compute:
   `find dist -type f | sort | xargs sha256sum | sha256sum` and the file count.
3. Update `scripts/repro.sh` `EXPECTED` and `docs/provenance.md` with the new
   hash, file count, version, and “not published.” Run `bash scripts/repro.sh`;
   it must print `PASS`.
4. If O22 A is chosen, change `.github/workflows/publish.yml` from
   `npm publish` to `npm stage publish`. Check `npm --version`; staged
   publishing requires 11.15+. Pin the job to a known CLI with
   `npm install -g npm@11.19.1` before `npm ci` if the bundled version is older
   (the job currently does not pin npm). Update `SECURITY.md`, `README.md`, and
   `docs/release.md` to say staged, not direct. Do not dispatch the workflow.
5. `npm pack --pack-destination scratch/r29-e51`; record size, unpacked size,
   shasum, integrity, file count. Inspect `tar -tzf` for:
   - no `scratch/`, no `test/`, no `evidence/*.tgz`, no `.env*`, no `.git`;
   - `dist/`, `src/`, `README.md`, `LICENSE`, `CREDITS.md`, `CHANGELOG.md`,
     `docs/compatibility.md`, `docs/native-history-evidence.md`,
     `docs/provenance.md`.
6. `npm run check:offline`; `bun scripts/check-claims.ts`; `git diff --check`.
7. Commit the version, hash, workflow change (if O22 A), and docs:
   `release: prepare 0.1.13 candidate`.
8. Do **not** run `npm publish`, `npm stage publish`, `npm stage approve`,
   `git tag`, or `git push`.

**Branches:**

| Result | Action |
|---|---|
| Build, repro, pack contents, checks all pass | D214: candidate ready; O15 A satisfied locally |
| Pack includes scratch/tests/secrets or misses required files | D215: block; fix `files`/ignore; rerun only the pack |
| Repro hash cannot be reproduced from the lockfile | D216: block; record the hash/count; do not record a moving target |
| Claims still drift | D217: fix docs first; no release commit |

**Cost:** free, local. **Artifact:** `scratch/r29-e51/` plus
`docs/evidence/2026-11-25-e51.json`.

### E52 — isolated load smoke (local, no owner config)

**Question.** Does the packed tarball install and load as a plugin outside this
checkout?

**Method:** In `scratch/r29-e52/`:

1. `npm init -y`; `npm install --no-save <the E51 tarball>`.
2. `bun -e 'import("@jonathand34/opencode-plugin-muse").then(m => console.log(typeof m.default))'`
   from that prefix, with `NODE_PATH` set to its `node_modules` if needed.
3. Optional, only if it can be done without touching the owner's real config:
   create a throwaway `XDG_CONFIG_HOME` with a `plugins/muse.js` that re-exports
   the installed package, then run `opencode models --standalone` under
   `zsh -lc`. If the isolated config cannot authenticate or the command would
   touch the real config, stop and record `inconclusive`; do not edit
   `~/.config/opencode`.
4. Remove nothing from the owner's config; leave the scratch prefix for the
   evidence.

**Branches:**

| Result | Action |
|---|---|
| Import resolves and default export is a plugin; optional opencode load lists `muse/*` | D218: candidate installable |
| Import or install fails | D219: block; capture the error; no release |
| Isolated opencode load cannot run without touching owner config | D220: record inconclusive; the Bun import still counts, but do not claim an opencode load |

**Cost:** free, local; network for npm install of the tarball's deps. **Artifact:**
`docs/evidence/2026-11-25-e52.json`.

### E53 — Windows desktop (owner-assisted, carried)

If `scratch/windows-desktop-*.json` exists, read it, check
`observations.uac`, `observations.smartScreen`, `observations.signIn`, and the
probe's `serve` rows, then apply D221–D224. If no JSON exists, do not run a
hosted runner as a desktop and do not infer.

**Branches:**

| Result | Action |
|---|---|
| No JSON | D221: O17 A; retire the desktop row, keep the runner rows |
| All steps pass on a named build | D222: O17 B for that build only; one sentence |
| Install/login passes, close leaves a survivor | D223: O17 A; document + doctor warning; no `taskkill` |
| UAC/SmartScreen blocks a headless step | D224: O17 A; mark that step interactive-only |

**Cost:** owner time only. **Artifact:** `docs/evidence/2026-11-25-e53.md` if run.

### E54 — approval two-gate spike (conditional on O16 B)

Do **not** run under O16 A. If O16 B is chosen, the spike must answer one
question: **does presenting Muse's approval through opencode's permission API
produce one prompt or two for the same bridged call?**

Use a temporary branch/worktree or a scratch plugin, not the release branch. Call
`ctx.permission.assert` with the session's action and resource, then let the
normal bridge emit the tool call. Count prompts and saved approvals. If a
one-prompt path is not demonstrated, B is not ready; keep A.

**Branches:**

| Result | Action |
|---|---|
| One prompt, choice mapping is explicit, denial/refusal tested | D225: O16 B is implementable; design it, do not ship it in this round |
| Two prompts, or a saved rule broader than the user saw | D226: O16 A; record the double gate |

**Cost:** one or two model turns if a live turn is needed; cap 2 turns. **Artifact:**
`docs/evidence/2026-11-25-e54.json` only if run.

---

## 3. Decision table (pre-committed)

| ID | Trigger | Action | Owner? |
|---|---|---|---|
| D211 | R2 artifact coherent | Release path viable; O15 A | O15 |
| D212 | R2 attestation/digest mismatch | Block release; record mismatch | no |
| D213 | R2 version moved | Stop; new baseline | O15 |
| D214 | E51 passes | Candidate ready; O15 A locally satisfied | O15 |
| D215 | Pack contents wrong | Block; fix files/ignore | no |
| D216 | Repro hash not reproducible | Block; record | no |
| D217 | Claims drift | Fix before release | no |
| D218 | E52 load passes | Candidate installable | no |
| D219 | E52 load fails | Block release | no |
| D220 | E52 inconclusive | Record; no opencode-load claim | no |
| D221 | E53 no JSON | O17 A; retire desktop row | O17 |
| D222 | E53 pass | O17 B for named build | O17 |
| D223 | E53 survivor | O17 A + warning | O17 |
| D224 | E53 UAC block | O17 A; interactive-only | O17 |
| D225 | E54 one prompt | O16 B implementable, not shipped | O16 |
| D226 | E54 two prompts | O16 A | O16 |
| D227 | O21 0.1.13 | Apply 0.1.13 | O21 |
| D228 | O21 0.2.0 | Apply 0.2.0; update docs/hash | O21 |
| D229 | O22 staged | Workflow to `npm stage publish`; docs | O22 |
| D230 | O22 direct | Keep `npm publish`; docs say direct | O22 |

---

## 4. Release implementation detail

Only run this after A and R2. The candidate is a commit, not a publish.

1. **Version.** `npm version 0.1.13 --no-git-tag-version --force` (O21 A) or
   0.2.0 (O21 B). This updates `package.json` and `package-lock.json`; `--force`
   is only for the intentionally dirty integration file, not for other edits.
2. **Build.** `npm ci` then `npm run build`. `dist` is gitignored but included by
   `files`; it must exist in the tarball.
3. **Hash.** Compute the canonical hash, update `scripts/repro.sh` and
   `docs/provenance.md`, run `bash scripts/repro.sh` to `PASS`.
4. **Pack.** `npm pack --pack-destination scratch/r29-e51`. Inspect, do not
   publish.
5. **Staged flow.** If O22 A, change `publish.yml` to `npm stage publish`, pin
   npm 11.19.1 if the job's bundled CLI is below 11.15, and update
   `SECURITY.md`, README, and `docs/release.md`. The trusted publisher must
   allow staged publishing; npm always allows `npm stage publish` for a trusted
   publisher, but the owner still needs 2FA to approve.
6. **Release notes.** `CHANGELOG.md` and the GitHub body draft. No GitHub
   Release in this round.
7. **Stop.** Report the candidate commit and the exact next owner action:
   push the branch, dispatch `publish.yml`, review the staged tarball, approve
   with 2FA. None of that happens here.

### What would make the candidate fail

- A pack that contains `scratch/`, `test/`, `evidence/*.tgz`, `.env`, or the
  owner's integration file.
- A `dist` hash that depends on an uncommitted environment or a different
  TypeScript version.
- A README/platform/watchlist contradiction that survives A1.
- Any attempt to publish, stage, tag, or push.

---

## 5. Conditional O16 B design (do not build under A)

If E54 shows one prompt, the design is:

- A setting selecting `onRequest` + `:ask-me`, with a startup refusal when the
  profile is unavailable.
- A bridge path that presents `approval/requested` through
  `ctx.permission.assert`, maps the user's choice to a Muse choice, and refuses
  when there is no UI.
- A test pinning the one-prompt path, the denial shape, and the “no second
  prompt” claim.
- No pre-seeded `approval-policy.json`; no auto-created local-persistent rule.

If E54 shows two prompts, do not build it. The existing `allowAll` + opencode
gate is the coherent posture.

---

## 6. Product choices

These are raised after the measurements, not disguised as measurements. Apply
the default unless the owner has replied.

### O15. What ships next

- **A. Prepare 0.1.13, do not publish.** Default.
- **B. Hold until a Windows desktop result exists.**
- **C. Publish now with Windows best-effort.** Not authorized here.

Recommendation: A, after A1 and R2, with the Windows sentence unchanged.
Condition to flip: E53 passes, or the owner wants B before any candidate.

### O16. Approval posture

- **A. Keep `allowAll`.** Default.
- **B. Offer `:ask-me` plus a documented one-time “Always allow”.** Only after
  E54's one-prompt result.
- **C. Auto-seed the store.** Reject.

Recommendation: A. D194 is not a surface.

### O17. Windows promise

- **A. Best-effort; retire the desktop row now.** Default.
- **B. Supported for the named build.** Only after E53 passes.
- **C. Experimental / de-emphasised.** Only if E53 fails before the first turn.

Recommendation: A. The prior round's own condition says retire it now.

### O18. Vendor engagement

- **A. Drafts only.** Default.
- **B. File both.** Public writing; owner approval required.
- **C. File the close-promise issue only.**

Recommendation: A.

### O19. Native history default

- **A. Keep opt-in.** Default.
- **B. Default on for long sessions.** Needs a billed-value measurement.
- **C. Remove.** Reject while it is the only native-continuity path.

Recommendation: A.

### O20. Evidence visibility

- **A. Repo-side only.** Default.
- **B. Add a user-facing status/limits page.**
- **C. Publish the full review.**

Recommendation: A; B after 0.1.13 ships.

### O21. Version number

- **A. 0.1.13.** Default.
- **B. 0.2.0.** Defensible for the feature set; changes the candidate number.
- **C. 1.0.0.** Not supported by the current API stability.

Recommendation: A.

### O22. Publish gate

- **A. Staged publish with 2FA.** Default.
- **B. Direct OIDC `npm publish`.**
- **C. Manual local publish.** Reject.

Recommendation: A. It is one workflow line and a human approval, not a new
system.

### O23. Release notes

- **A. `CHANGELOG.md` + GitHub body draft.** Default.
- **B. GitHub release only.**
- **C. No notes.**

Recommendation: A.

### O24. Support surface

- **A. README + `SECURITY.md` only.** Default.
- **B. Add `SUPPORT.md`.**
- **C. Add issue templates.**

Recommendation: A for this round.

---

## 7. Risks

- **The release candidate can tempt a publish.** The executor has no permission
  to publish, stage, tag, or push. Stop after the candidate commit.
- **The tarball can include ignored files.** `npm pack` uses `files` plus
  `.gitignore`; inspect, do not assume.
- **The hash can be environment-dependent.** Run the reproduction from the
  lockfile and record the toolchain.
- **The docs can drift again.** A1 is one commit; R2/E51 do not edit counts
  except where a result moves them.
- **O22 A changes the publish workflow.** It does not publish anything until the
  owner dispatches it. Record the trusted-publisher setting as unverified if the
  local token cannot read it.
- **E53 is owner-assisted.** No desktop claim from a runner or a checklist.
- **E54 can spend turns.** Cap 2; stop at two prompts or a blocked API.

## 8. Definition of done

- A1–A5 committed; the claim drift is gone.
- R2 records the 0.1.12 artifact, integrity, attestation, and tarball state.
- E51 produces a 0.1.13 (or chosen) candidate with a new hash, a pack
  inspection, and green checks; no publish/stage/tag/push.
- E52 records an install/load result or an explicit inconclusive.
- E53 is blocked or applied; the desktop row is retired when no JSON exists.
- E54 is not run under O16 A; if B is chosen, it records one prompt or two.
- O15–O24 have a default applied. Only O17, O21, O22 may still need a reply if
  the owner wants a different choice.
- `npm run check:offline` green; `bun scripts/check-claims.ts` current;
  `git diff --check`; `git status` clean except the owner's integration file.
- Final report: baseline/final counts; per item command/run/result/branch/cost;
  docs changed; checks; unmeasured; choices; next owner action.

## 9. Results

Fill after the run. One row per item; put the command or run id in the second
column, not only in prose.

| Item | Command / run | Result | Branch applied | Cost |
|---|---|---|---|---|
| A1 | | | | |
| A2 | | | | |
| A3 | | | | |
| A4 | | | | |
| A5 | | | | |
| R2 | | | | |
| E51 | | | | |
| E52 | | | | |
| E53 | | | | |
| E54 | | | | |
| F | | | | |

**Choices applied:**

**Deviations:**
