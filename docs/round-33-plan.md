# Round 33 plan: implement the caveated release and prove the remaining gates

**Base** `bc00fb6` on `round-32` (P1 A / P2 A recorded).
**Run date** 2026-11-23. **Branch** `round-33`.
**Artifact prefix** `2026-11-26-r33-` for sort consistency; each artifact records
the real date.

Round 32 ended with a decision, not a release: P1 A keeps the `plugin`-origin
allow and documents the limitation; P2 A resumes the release after E61/F1/E64/
E60. Round 33 implements the documentation/doctor half of P1 A and runs those
gates. It adds no new trust feature. The only source change is an advisory
doctor detail; the gate behaviour stays exactly as round 32 measured it.

## Status ledger

| ID | Work | Cost | Status | Output |
|---|---|---|---|---|
| A1 | Doctor warning for installed-plugin hooks | free | pending | `scripts/doctor.ts`, `test/doctor.test.ts` |
| A2 | Known-limitation wording | free | pending | `CHANGELOG.md`, `README.md`, `docs/approval.md`, `docs/release.md` |
| A3 | Watch item and recheck trigger | free | pending | `docs/release.md`, `docs/approval.md` |
| A4 | Claims ledger check | free | pending | `docs/claims.md`, `docs/claims.json` |
| A5 | E60 preflight | free | pending | `docs/evidence/2026-11-26-r33-e60.json` |
| E61 | Approval scope matrix | ≤3 turns / ≤$1.50 | pending | `docs/evidence/2026-11-26-r33-e61.json` |
| F1 | Candidate checks and commit | free | pending | commit on `round-33` |
| E64 | Second clean builder | free | pending | `docs/evidence/2026-11-26-r33-e64.json` |
| E60 | Stage and reject | owner 2FA at reject | pending | `docs/evidence/2026-11-26-r33-e60.json` |
| E55a/b | Console, if the owner browser exists | owner browser | pending | `docs/evidence/2026-11-26-r33-e55a.json`, `-e55b.json` |
| R | Reconcile docs, checks, report | free | pending | status + decision docs |

E59/Windows desktop stays retired (O36 A). Do not substitute a runner for a
desktop.

## 0. State and guardrails

- Work in this repo on `round-33`. Scratch: `scratch/r33-*` (ignored).
- Keep live state in `docs/round-33-status.md`; do not rewrite the plan or the
  research to fit a result.
- `zsh -lc` for `muse` and anything needing `~/.zshenv`; `bash` for repo scripts.
- Do not edit or stage `docs/integration-landscape.md`.
- Do not rewrite old evidence. New evidence files carry `supersedes` /
  `addendumTo` when they correct one.
- Do not copy auth tokens or secret values into evidence. Redact; record paths
  and hashes.
- Every Muse experiment uses isolated `XDG_CONFIG_HOME`, `XDG_DATA_HOME`,
  `XDG_STATE_HOME`, and `XDG_CACHE_HOME` under `scratch/r33-*`. Never touch the
  real Muse config, approval store, or trust store. Symlink `auth.json`
  read-only for a paid turn; never copy it.
- Do not approve a stage, publish, tag, create a release, or push a tag. E60 may
  push only `round-33` to dispatch the workflow, and may reject a stage.
- If any command would make `0.1.13` public, stop.
- Preserve exit status; do not pipe a check in a way that hides it.

## 1. Foreground: the remaining work

Round 33's foreground is the release path, not a new research round. The score
is: **does 0.1.13 ship with an honest caveat, and are E61/E64/E60 measured?**

- If E61 says a Muse MCP grant crosses workspaces, O31 A stands and the release
  continues.
- If E61 says the grant is workspace-local, O31 A still stands for this release;
  O31 B becomes a follow-up spike, not a blocker (O44 A).
- If E61 shows an opencode `deny` is ignored, stop the release: that is a
  security finding worse than the caveat.
- If E64 shows content drift, stop; no release claim.
- If E60's staged digest differs, reject and stop.
- If the owner is absent or npm is unauthenticated, E60 is blocked, not failed;
  leave the release staged-free and report.

## 2. Documentation and implementation (A1–A5)

### A1. Advisory doctor detail for installed-plugin hooks (free)

P1 A says keep the allow and warn. The doctor already prints a `hooks` row with
each handler's origin and annotates `plugin` rows as `(installed plugin)`.

Change only the detail/status of that row:

1. When `probe.hooks` contains at least one `handlerKind === "plugin"` row, set
   the row status to `warn` (it is still not a gate; `fail` remains the only
   failing status) and append a sentence:
   `installed plugin hooks are outside this record; this host runs them only from an approval in its private config, which the plugin never creates`.
2. Do not change `hookGateRefusal`, `BLOCKING_KINDS`, or any env var. Plugin
   rows stay allowed.
3. Add a test in `test/doctor.test.ts` that a plugin row produces `warn` with
   that sentence, and that a project refusal still produces the existing
   remediation. Add a hook-gate assertion that `plugin` rows remain non-blocking
   (the existing test already covers this; do not weaken it).
4. `bun test test/doctor.test.ts test/hook-gate.test.ts` must pass.

**Acceptance:** the doctor warns when a plugin hook is installed; no session is
refused by the new wording; `exitCode` behaviour is unchanged for `warn`.

### A2. Known-limitation wording (free)

Add one short, specific paragraph, not a hedge:

- `CHANGELOG.md` under 0.1.13: a "Known limitation" bullet — "Muse plugin hooks
  approved in your Muse config do not run in opencode sessions: the host uses a
  private config, so it sees no approval. A private config that holds its own
  approval is amnestied by `muse plugins update` on 1.4.25; this plugin never
  creates or updates one."
- `README.md` near the hook gate: the same fact in two sentences, with the
  doctor command that shows it.
- `docs/approval.md`: already updated in round 32; add the doctor surface
  sentence.
- `docs/release.md`: point the "What not to promise" list at the limitation.

Do not claim the update re-asks. Do not claim Muse is fixed.

### A3. Watch item (free)

Add to `docs/release.md` and `docs/approval.md`:

- Trigger: a Muse release that changes plugin approval loading for `muse serve`,
  or exposes a per-plugin trust status/hash on `hook/list`.
- Action: re-run E65 and E65b; if the private host starts reading the user's
  approvals, re-open P1 and implement B (the gate).
- Recheck date: the next Muse minor after 1.4.25, or 2027-02-28 (the dependency
  review date), whichever is sooner.

### A4. Claims ledger (free)

Run `bun scripts/check-claims.ts --strict`. Add a row only if a decision starts
depending on a new outside sentence. The round-32 rows (`muse-hook-definition-hash`,
`codex-hook-trust`, `npm-stage-reject-2fa`) stay. Do not add a `manual` kind.

### A5. E60 preflight (free)

Record in `docs/evidence/2026-11-26-r33-e60.json` before any stage:

```bash
npm view @jonathand34/opencode-plugin-muse versions --json
npm view @jonathand34/opencode-plugin-muse dist-tags --json
npm view @jonathand34/opencode-plugin-muse@0.1.12 dist.attestations --json
npm whoami
npm stage list --json
gh repo view jond34/opencode-plugin-muse --json visibility,isPrivate
```

Round 32 found `E401` on `npm stage list`. If it recurs, record `blocked` and
ask the owner to `npm login`; do not retry with another credential source and do
not stage.

## 3. Experiments

Every experiment records: exact commands, versions (`node`, `npm`, `bun`,
`muse`, `opencode`), start/end time, provider/model, turns, cost, raw output
paths, observations, and limits. Redact secrets.

### E61. Approval scope matrix (≤3 turns / ≤$1.50)

**Question:** Does a Muse `localPersistent` MCP tool grant cross workspaces, and
does an opencode `deny` still win?

**Setup:**

- `scratch/r33-e61/{config,data,state,cache,ws-a,ws-b}`; symlink the real
  `auth.json` read-only; never copy it.
- Write a dependency-free Node stdio MCP server exposing one tool `bash` that
  runs only `echo r33-e61` and returns stdout. Implement `initialize`,
  `tools/list`, `tools/call` over JSON-RPC; no SDK.
- Register it at user scope:
  `muse mcp add opencode -- <node> <server.mjs>`; record `muse mcp list --json`.
- Trust both workspaces; start with `:ask-me` (or the E48 profile shape) so the
  approval menu appears. Record the profile and the exact menu labels.

**Arms:**

1. **A:** in ws-a, ask for the tool, choose “Always allow this MCP tool”; record
   the exact choice and the store rule. Confirm the rule has `toolName` and no
   `workspaceRoot`.
2. **B:** in ws-b, same prompt. If it runs with no Muse prompt, the grant crosses
   workspaces (B1). If it prompts, deny once; do not create a second grant (B2).
3. **C:** only if A wrote a saved rule: in ws-b, add an opencode `deny` for
   `mcp__opencode__bash`; run the same prompt. A configured deny must win.

**Branches:**

- **B1:** cross-workspace → O31 A.
- **B2:** workspace-local → O31 A for this release; O44 A (follow-up spike, no
  hold).
- **B3:** opencode `deny` ignored → **stop the release**; high severity.
- **B4:** menu/tool absent → blocked; no claim; O31 A with the existing caveat.

**Artifact:** `docs/evidence/2026-11-26-r33-e61.json`.

**Cost guard:** if a fourth turn is needed, stop and record the cap overrun; do
not spend past $1.50.

### F1. Candidate checks and commit

Run, preserving status:

```bash
npm test
bun scripts/check-claims.ts --strict
bash scripts/check-release.sh
bash scripts/repro.sh
npm pack --dry-run
git diff --check
```

Fix failures caused by this round; never weaken a test. Record exact counts,
`dist/` hash, and tarball SHA-256. Commit the candidate on `round-33`, leaving
the owner file unstaged.

### E64. Second clean builder (free)

Precondition: F1 committed. Use two independent copies, not one:

1. `git archive HEAD` into `scratch/r33-e64/a` and `.../b`.
2. Each gets a fresh `HOME`, `npm_config_cache`, and `TMPDIR` under its own
   directory.
3. In each: `npm ci`, `npm run build`, `npm pack --pack-destination`.
4. Compare:
   - `dist/index.js` SHA-256;
   - sorted `dist/` digest (path + file hash);
   - tarball SHA-256 and file count;
   - `node -v`, `npm -v`, `uname -a`.
5. If the tarballs differ, compare `tar -tvzf` listings. Separate:
   - **content drift** (a file hash differs) → stop;
   - **header drift** (only mtimes/order differ) → unpack both, normalize mtimes
     to the commit time, and compare the sorted content digest. Record that
     `npm pack` headers are not byte-stable; do not call it a content mismatch.

**Branches:**

- **B1:** dist and tarball both match → O34 B, strongest wording.
- **B2:** dist matches; tarball content matches after mtime normalization →
  O34 B with “content-identical; `npm pack` headers vary”.
- **B3:** dist content differs → stop; no release claim.
- **B4:** `npm ci`/build fails in the clean copy → record; use
  `--ignore-scripts` only if the build does not need lifecycle scripts, and say
  so.

**Artifact:** `docs/evidence/2026-11-26-r33-e64.json`.

### E60. Stage and reject (owner 2FA at reject)

Preconditions: E61 is not B3; E64 is B1/B2; the candidate is committed; `npm
whoami` works; the owner is present for the reject prompt.

1. Re-run the A5 version/tag/stage checks; stop if `0.1.13` is public or a stage
   exists.
2. `npm pack --dry-run`; `bash scripts/check-release.sh`.
3. Push only `round-33`; dispatch `publish.yml`; record the run URL and
   `npm stage list --json`.
4. `npm stage download <stage-id> <dir>`; compare SHA-256 with the candidate.
5. `npm stage view <stage-id> --json`; record whether provenance/attestation
   metadata is present. Do not claim it if absent.
6. `npm stage reject <stage-id>` with the owner's 2FA. **Do not approve.**
7. Verify `npm view` versions/dist-tags show no `0.1.13`, and the stage list no
   longer holds the stage.

**Branches:**

- **B1:** stage created, digest matches, reject succeeds, no public version →
  O37 A partial.
- **B2:** digest mismatch → reject, investigate, stop.
- **B3:** stage-only config rejects a direct publish → record; do not test a
  direct publish.
- **B4:** 2FA/permissions/auth block → blocked; leave no public version.

**Artifact:** `docs/evidence/2026-11-26-r33-e60.json` with `stageId`,
`tarballHash`, `candidateHash`, `stageView`, `reject`, `publicVersions`, `2fa`,
`limits`.

### E55a/E55b. Console (only with an owner browser)

Reuse the round-32 protocols. If no owner-authenticated browser is available,
mark both blocked and use O42 B (vendor-doc note). Do not substitute a local
config test.

## 4. Pre-committed decisions

| ID | Trigger | Decision |
|---|---|---|
| D263 | E61 B1/B2/B3/B4 | B1 → O31 A; B2 → O31 A this release, O31 B spike later; B3 → stop release; B4 → blocked, O31 A |
| D264 | E64 B1/B2/B3/B4 | B1 → O34 B; B2 → O34 B content-identical wording; B3 → no release; B4 → record |
| D265 | E60 B1/B2/B3/B4 | B1 → O37 A partial; B2 → reject and stop; B3/B4 → blocked |
| D266 | E61+E64+E60 | Release resumes only if E61 is not B3, E64 is B1/B2, E60 is B1; otherwise hold |
| D267 | A1–A3 | P1 A implemented as an advisory doctor detail plus docs; no gate |

## 5. Owner choices (after the experiments)

These are product/ops choices that do not fall out of a measurement. Defaults
are pre-chosen so the run does not stall; record the branch.

### O38. Doctor warning surface (product; default A)

- **A. Extend the existing `hooks` row with a `warn` status and one sentence.**
  Recommended: no new row, no startup noise, visible on `bun run doctor`.
- **B. A separate `plugin-hooks` row.** Clearer, but duplicates the hooks row.
- **C. A startup warning.** Noisy for every session with a plugin hook.
- **D. An opt-in strict gate (`MUSE_BLOCK_PLUGIN_HOOKS=1`).** Not a default;
  revisit only if `hook/list` gains a trust status.

### O39. Caveat placement (product; default A)

- **A. CHANGELOG “Known limitation” + README + `approval.md`.** Recommended.
- **B. CHANGELOG only.** Under-documented for a security-adjacent caveat.
- **C. No caveat.** Rejected; overclaims.

### O40. Watch cadence (ops; default A)

- **A. Re-run E65/E65b on the next Muse minor or host schema drift, and by
  2027-02-28.** Recommended.
- **B. Every Muse release.** Higher cost, catches patches.
- **C. Only on an observed incident.** Cheapest, weakest.

### O41. Provenance proof (release/trust; default A)

- **A. Accept “not verifiable before approval”** and keep stage/reject.
  Recommended; no public artifact.
- **B. Approve a disposable prerelease** to observe provenance and approval
  2FA. Separate public release decision.

### O42. Console claim (product; default B)

- **A. Measured effect/attribution** if E55a/E55b pass.
- **B. Vendor-doc note, clearly labelled** if blocked. Recommended.
- **C. No Console claim.** Safest fallback.

### O43. E64 wording if only headers drift (product/trust; default A)

- **A. “Content-identical; tarball headers vary.”** Recommended if B2.
- **B. “Dist-only reproducible.”** Honest but weaker than the evidence.
- **C. Block the release.** Over-strict for header-only drift.

### O44. E61 B2 response (product; default A)

- **A. Ship under O31 A; schedule the O16 B one-prompt spike separately.**
  Recommended; the workspace-local grant is narrower, not a release blocker.
- **B. Hold the release for the spike.** Over-couples two decisions.
- **C. Ship and do not schedule the spike.** Loses the finding.

## 6. Execution order

1. A1–A4 (free).
2. A5 preflight (free); if npm is E401, record blocked.
3. E61 (paid cap). If it returns B3, stop before any release commit.
4. F1 checks and commit.
5. E64 (free).
6. E55a/E55b if the browser exists.
7. E60 with owner 2FA at reject.
8. R: reconcile, final checks, commit, report.

## 7. Stop conditions

Stop and report, do not improvise, if:

- E61 B3: an opencode `deny` is ignored.
- E64 content drift (B3) is unexplained.
- E60 digest mismatch, a stage would be approved, or the owner 2FA is absent.
- An experiment exceeds its turn/cost cap.
- A command would touch the real Muse config or approval store.
- A secret would be written to an artifact.
- Any command would publish, tag, or make `0.1.13` public.

## 8. Verification

Run from the repo root, preserving exit status:

```bash
npm test
bun scripts/check-claims.ts --strict
bash scripts/check-release.sh
bash scripts/repro.sh
npm pack --dry-run
git diff --check
```

Also assert:

- `git status --short` does not stage `docs/integration-landscape.md`.
- No evidence file contains a token, key, or auth value.
- Every new evidence file has `experiment`, `date`, `commands`, `observations`,
  `limits`, and `artifacts`.
- Parent artifacts are unchanged (`git diff --exit-code` for them).
- The doctor warns on a plugin row and still refuses a project row.

## 9. Final report format

1. Status table (A/E/F/R, done/blocked/failed).
2. E61 branch and the exact grant/store shape.
3. E64 branch with dist hash, tarball hash, and the header caveat if B2.
4. E60 stage ID, candidate/stage hashes, reject result, public-version check.
5. Checks with exact counts and hashes.
6. O31–O44 and P1–P4 with defaults and changes.
7. Blocked items and what would unblock them.
8. Commit hash, files changed, files intentionally left unstaged.
