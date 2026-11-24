# Round 31 execution prompt

Copy the block below into a fresh session. It is self-contained; the durable
state is in the two files it names.

```text
Execute Round 31 for the repo at ~/repos/opencode-plugin-muse. Read
docs/round-31-plan.md and docs/round-31-research.md first; they are the plan and
the evidence companion. Do not re-plan the round from scratch.

Base commit: c4053e2 on branch round-30. Create branch round-31. If the worktree
is not at that base, stop and report the difference before changing anything.

The owner has approved all experiments in the plan: A1-A6, E61, E62, E55a,
E55b, E63, E64, and E60. E60 is approved only for stage-and-reject. Do NOT run
npm stage approve, do not publish, do not tag, and do not create a release. E60
may push only the round-31 branch if that is required to dispatch publish.yml.
If any command would make 0.1.13 public, stop.

Hard constraints:
- Keep scratch in scratch/r31-*. Keep durable evidence in docs/evidence/ with
  the 2026-11-26-r31 prefix. Do not rewrite past evidence; add addenda with
  addendumTo/supersedes fields.
- Do not edit or stage docs/integration-landscape.md.
- Do not touch the real Muse config or real approval store. Isolate XDG dirs and
  symlink auth files read-only; never copy tokens into evidence.
- Do not add a runtime dependency. @vercel/nft is scratch-only via npx.
- Run harness CLIs with zsh -lc. Run repo scripts with bash. Use uv for Python
  if any Python is needed (it should not be).
- Preserve exit status when piping; report failures, do not hide them.
- Keep docs/round-31-status.md current as you finish each item. Do not rewrite
  the plan or research file to hide a result.

Order:
1. A1: correct the E55 baseline with an addendum. Confirm the retained
   before-config.json has 3 sources and 6 provider policies; record hashes.
2. A2: split Muse localPersistent scope from opencode project-scoped saved
   approvals in docs/approval.md, decision-coverage, and the audit. State that
   E57 showed the MCP tool rule crossing workspaces and that tool subjects have
   no workspaceRoot.
3. A3: mark the old Console tag-only/per-model paragraphs historical and keep
   the current E36/E37 finding.
4. A4: qualify the ledger mode-0600 and Windows reaping claims.
5. A5: add scripts/check-release.sh and wire it into publish.yml before
   npm stage publish. It must run strict claims, high/critical audit gate, pack
   inspection, isolated tarball install/import, and git diff --check. Update
   docs/release.md with the stage-only and 2-day-expiry facts. Add missing
   claims rows to claims.json only when a primary quote and existing checker
   kind exist; otherwise put a manual row with a recheck date in claims.md
   only, not in claims.json.
6. A6: replace the claim-bearing "reproducible" wording with "locally
   reproducible; independent rebuild pending" until E64; do not rewrite the
   generic definition sentence in provenance.
7. E62: fresh project-scoped hook install, approval, marker, changed hook,
   review_needed, no marker, re-approval, marker; second workspace without
   approval. Cap 2 turns / $1.00.
8. E63: trace dist/index.js with npx --yes @vercel/nft; check whether
   @opencode/util/glob/minimatch and the fixable advisories are reachable.
9. E61: isolated workspace A and B; local MCP server named opencode exposing a
   harmless bash tool; approve "Always allow this MCP tool" in A; run in B; then
   test an opencode deny in B. Cap 3 turns / $1.50. If opencode deny is ignored,
   stop the release and report a security finding.
10. E55a and E55b in the owner browser: record the full config hash, source
    count/types, effect/timing at 0/30/60/90/120s, and the exact tool-deny
    sentence if any. Delete the policy and restore the baseline hash. If the
    owner is unavailable, mark blocked; do not substitute.
11. Resolve D241-D251 from the results. Update docs/evidence-audit.md,
    docs/decision-coverage.md, docs/decision-evidence.md, and
    docs/round-31-status.md with dated rows and the branch taken.
12. Run npm test and bash scripts/check-release.sh; fix failures. Then commit
    the candidate locally on round-31. Then run E64: git archive HEAD to
    scratch, fresh HOME/npm cache/TMPDIR, npm ci, build, pack, compare dist and
    tarball hashes. Same OS/toolchain only; do not claim independent rebuild.
13. E60: confirm 0.1.13 is not public; run check-release.sh; push only
    round-31; dispatch publish.yml; record stage ID; download and compare the
    tarball hash; reject the stage; verify no public version. Do not approve.
    If 2FA/owner is unavailable, record blocked.
14. Run the verification commands: npm test; bun scripts/check-claims.ts
    --strict; bash scripts/check-release.sh; bash scripts/repro.sh;
    npm pack --dry-run; git diff --check. Record exact counts, repro hash, and
    tarball hash.

If an experiment is blocked, record it as blocked and keep the existing claim
unmeasured. Do not downgrade to a weaker test and call it a pass. E59/Windows
desktop remains blocked; do not add a desktop claim.

Finish with:
- a status table for A1-A6, E61, E62, E55a, E55b, E63, E64, E60, F;
- the D241-D251 branches taken and why;
- exact check results and any failures;
- candidate commit, repro hash, tarball hash;
- owner choices O31-O37 with the pre-committed defaults and any changed
  recommendation;
- blocked items and what would unblock them;
- files changed and files intentionally left unstaged.

Do not end with a plan for later. Execute the plan, document the results
externally, and report what actually happened.
```
