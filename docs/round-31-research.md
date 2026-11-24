# Round 31 research: evidence integrity, approval scope, and release gates

**Written** 2026-11-23. Companion to `docs/round-31-plan.md`. This file records
the external checks, the options, the steelman/strawman cases, and the
conditions under which a recommendation is strong enough to pre-commit.

The round is not a feature round. It repairs the evidence record, resolves the
one security-relevant scope ambiguity, and makes the release gate executable.
No product decision is assumed to reverse.

## What was checked

Primary sources:

- Muse permissions and safety: <https://dev.meta.ai/docs/muse-code/permissions>
- Muse approval-policy types (installed SDK):
  `node_modules/@muse-code/sdk/dist/src/msp.d.ts`
- opencode permissions and saved approvals:
  <https://opencode.ai/docs/permissions>
- opencode plugin permission API:
  <https://opencode.ai/docs/build/plugins/server>
- opencode non-prompting permission request:
  <https://github.com/anomalyco/opencode/issues/64787> (open, checked 2026-11-23)
- opencode race-safe single-use admission:
  <https://github.com/anomalyco/opencode/issues/61645> (open, checked 2026-11-23)
- opencode Console policy strictness:
  <https://github.com/anomalyco/opencode/issues/60252> (open, checked 2026-11-23)
- opencode policies and Console precedence: <https://opencode.ai/docs/policies>
- npm staged publishing: <https://docs.npmjs.com/staged-publishing>
- npm trusted publishers, stage-only, provenance, 2-day configuration expiry:
  <https://docs.npmjs.com/trusted-publishers>
- `npm stage` CLI: <https://docs.npmjs.com/cli/v12/commands/npm-stage>
- Node `fs` Windows permission caveat: <https://nodejs.org/api/fs.html>
- MCP Tasks extension: <https://modelcontextprotocol.io/seps/2663-tasks-extension>
- Node dependency tracing: <https://github.com/vercel/nft>
- Reproducible-build practice (independent builder, immutable environment):
  <https://fossa.com/blog/three-pillars-reproducible-builds/>
  and <https://nesbitt.io/2026/02/24/reproducible-builds-in-language-package-managers.html>

Local facts rechecked:

- `scratch/r30-e55/before-config.json` is a **3-element array**
  (`document`, `directory`, `directory`) and its document source carries six
  `provider.use` statements. It is byte-identical to the current
  `opencode debug config --standalone` output (`cmp` exit 0). The E55 artifact's
  `sourceCount: 0` / `sources: []` is wrong.
- `msp.d.ts` says a shell command-prefix always-allow applies **only within the
  workspace root**. The `tool` approval subject has a `toolName` but no
  `workspaceRoot`; `localPersistent` means “saved in the local policy store.”
  E57 observed that store applying in a second workspace. The vendor docs and
  E57 are therefore compatible only if MCP tool grants are global while shell
  prefix grants are workspace-scoped.
- opencode’s docs say a saved approval is a durable **project-scoped** `allow`
  rule and never overrides a configured `deny`. Muse’s `localPersistent` rule
  and opencode’s saved approval are different objects with different scopes.
- `docs/release.md` lists eight candidate gates; `publish.yml` runs only
  `npm ci`, `repro.sh`, `check:offline`, and `npm stage publish`.
- `scripts/check-claims.ts` is warn-only without `--strict`; the release
  command does not pass `--strict`, and the checker verifies URL/issue state,
  not the quoted sentence or version.
- `scripts/repro.sh` compares `dist/` only, not the packed tarball. The
  provenance file already says there is one reproducer.
- The candidate has 25 moderate, 0 high, 0 critical advisories; all paths are
  transitive through `@opencode/plugin`, and the plugin entry imports only
  schema/identity exports.
- npm’s trusted-publisher docs add a 2-day expiry: a newly created
  configuration must complete its first successful publish within two days or
  it expires. The repo does not record this.

## 1. Muse approval scope: the central ambiguity

### What is actually typed

`ApprovalSubject` for a shell has `workspaceRoot`, and the SDK says saved
command-prefix rules apply only within that root. The Muse permissions page
uses the label **“Always allow in this workspace”** for that choice.

The `tool` subject has `toolName` but no `workspaceRoot`. The choice scope
`localPersistent` is described as “saved in the local policy store.” E57 seeded
that store and ran a second workspace with no approval. So the likely model is:

| Grant | Scope |
|---|---|
| Shell command prefix | Workspace root, per vendor docs |
| MCP tool name | User-local policy store, cross-workspace per E57 |
| opencode saved approval | Project-scoped, per opencode docs |
| opencode `deny` | Always wins, per opencode docs |

The approval UI labels hide this difference: “Always allow this MCP tool” does
not say “for this workspace.”

### Options

- **A. Document only; keep `allowAll`.** No new code. State that Muse’s MCP
  “Always allow” is a user-store grant and that the plugin does not map it.
  Lowest risk, preserves the one-gate posture.
- **B. Build O16 B with `once`/`session` only.** Present Muse approval once,
  never map `localPersistent` to an opencode saved approval. Requires the
  one-prompt flow E58 did not run, plus a denial test.
- **C. Build O16 B and map `localPersistent` with a global warning.** Product
  surface must say “this grants the tool in every workspace” and must still
  respect opencode `deny`. Highest complexity; easy to over-persist.
- **D. Ask the vendor for workspace-scoped MCP rules.** Correct long-term, but
  outside this round and not a release dependency.

**Steelman A:** opencode already gates every call; Muse’s rule is redundant.
Adding a second gate with a broader scope than the user expects is worse than
not adding it.

**Steelman B:** a one-prompt flow is the desired UX; `once` and `session` can be
mapped without persisting a cross-workspace rule. The blocker is the missing
non-prompting/single-use API, not the idea.

**Strawman:** “E57 proves the saved rule is safe because it works.” Durability
is not scope. A rule that crosses workspaces is precisely the reason to slow
down.

**Confidence condition.** Recommend B only after: one Muse prompt, a denial
tested, no localPersistent mapping, no second prompt, and a two-workspace test.
Otherwise A. C is not recommended without a visible global-scope warning and a
vendor-supported workspace field.

## 2. Console policy: effect, timing, attribution

opencode’s docs say Console statements compile into regular policies, apply on
the next fetch (about a minute), and denials from those statements name the
workspace. E37 and E49 show two different observations: a provider deny can be
visible in `debug config` while `opencode models` still lists the model, and an
allowlist can remove the model at selection but produces generic
`Model unavailable`.

The E55 plan expected a provider deny to name the workspace. That expectation is
probably wrong: a provider restriction removes the model before an action is
attempted, while the workspace-named sentence is for a denied action. E55 as
written can produce a false “attribution failed” result.

### Options

- **A. No new Console claim.** Keep “compiled but unattributable.” Safest until
  E55b.
- **B. Claim effect and timing only.** If a provider allowlist removes the
  model by 60–120 seconds, document that shape and timing, not attribution.
- **C. Claim attribution for tool denies.** Only if E55b produces
  `Blocked by <workspace>'s policy` on an attempted tool call.
- **D. Add a doctor warning.** Say a Console policy may apply and is not
  attributable. This is a product surface, not evidence.

**Steelman A:** the source type is `document`, the same as a local file. A
plugin cannot honestly say where a statement came from.

**Steelman B:** users care whether the policy works, not whether the source is
typed. A timing table is useful even without attribution.

**Strawman:** “E49 proves Console policies do not name the workspace.” It proves
a provider-selection error is generic; it does not test a denied tool action.

**Confidence condition.** Effect claims require a full `debug config` source
snapshot and a model-list check at 0/30/60/90/120 seconds. Attribution claims
require an attempted action and the exact sentence. If the source remains
`document`, do not claim provenance.

## 3. Release gates: prose versus executable checks

The release page is more complete than the workflow. A release can pass the
workflow while skipping claims, pack inspection, isolated install, audit, and
diff check.

### Options

- **A. Put all gates in `publish.yml`.** Highest confidence; more CI time; the
  workflow becomes the single release contract.
- **B. Keep owner-run gates and record their outputs.** Cheaper; relies on a
  human checklist and cannot be audited from the workflow.
- **C. Separate `release-check.yml` from `publish.yml`.** Clear separation;
  publish depends on the check workflow or a required artifact.
- **D. Add a local `scripts/check-release.sh` only.** Useful for the owner, but
  not enforced on the publish path.

**Steelman A:** the release path should be the checked path. If a claim goes
stale or a tarball contains a forbidden file, CI should stop.

**Steelman C:** a release check can run on PRs and tags without holding the
OIDC publish token; publish can require the check artifact.

**Strawman:** “The owner will remember.” That is the failure mode the current
round found.

**Confidence condition.** A gate is real only when a failing condition produces
a non-zero exit on the publish path, or when the release explicitly records it
as an owner-only gate with an artifact.

## 4. Claims: URL alive is not claim current

`check-claims` is a liveness/state check. It does not verify that the quoted
sentence still exists, that the version still matches, or that the claim still
supports the decision. The table’s `Quote` column is checked by a human.

### Options

- **A. Keep warn-only URL checks.** Cheap; catches dead links only.
- **B. Add `--strict` to release.** Catches dead links and changed issue state;
  still not quote/version.
- **C. Add quote/version/source-hash fields and assert the quote.** Stronger;
  more maintenance; some pages are dynamic.
- **D. Drop claims that cannot be checked mechanically.** Reduces the record;
  may remove useful context.

**Steelman B:** a dead link or a closed issue is a real stale signal; strict
mode is a one-line change.

**Steelman C:** the record’s worst failures were paraphrase and version drift,
not dead URLs. A quote is the only check that catches “the page still exists but
says something else.”

**Strawman:** “The quote is in the table, so it is checked.” The script never
reads it.

**Confidence condition.** Recommend B now and C for the small set of
decision-bearing claims (Muse scope, opencode saved approval, Console
attribution, npm stage-only, Node ACL). A claim that cannot carry a quote gets a
`manual` check and a recheck date, not a false mechanical pass.

## 5. Reproducibility: one builder is not verification

The provenance file is honest: one reproducer is not independent verification.
`repro.sh` compares `dist/`, not the tarball. The npm registry does not link a
tarball to source; provenance attests the workflow, not that a second builder
got the same bytes.

### Options

- **A. Keep the single-builder hash and say so.** Honest, no new work.
- **B. Second clean workspace/cache on the same machine.** Catches cache and
  working-tree contamination; not an independent OS/toolchain.
- **C. Second builder in CI or a container.** Stronger; needs a remote branch
  or a container runtime, neither available here.
- **D. External rebuild service.** Strongest; out of scope.

**Steelman B:** a fresh `HOME`, npm cache, and checkout catches the most common
local nondeterminism without a new dependency.

**Steelman C:** only a separate builder can support “independently reproduced.”
A second directory on the same machine is still one builder in the relevant
sense.

**Strawman:** “`repro.sh` passed twice, so it is reproducible.” Two runs on one
machine are a consistency check, not independent verification.

**Confidence condition.** “Independently reproduced” only after a separate
builder/OS/toolchain produces the same `dist/` and tarball hashes. Until then:
“locally reproducible; independent rebuild pending.”

## 6. Dependency risk: audit is not reachability

`npm audit` reports the installed tree. The plugin entry imports
`@opencode/plugin` for schema and identity; the vulnerable `glob`/`minimatch`
subtree sits under `@opencode/util`, which the entry does not import. A static
import graph is good evidence, not a runtime proof.

### Options

- **A. Accept moderate with a runtime trace and review date.** Recommended if
  no high/critical and no traced path.
- **B. Block on moderate.** Safest; currently unshippable because no fix exists.
- **C. Refactor `@opencode/plugin` to a peer or remove the subtree.** Best
  long-term; packaging/compatibility work.
- **D. Upgrade/override the fixable subset.** Removes `gaxios`/`gcp-metadata`/
  `rimraf`; does not remove the glob/minimatch class.

**Steelman A:** a documented, review-dated moderate risk is proportionate for a
public plugin whose vulnerable code is in CLI tooling, not the loaded entry.

**Steelman C:** the only way to remove the class is to remove the subtree. A
peer dependency may be appropriate for a plugin that runs inside opencode.

**Strawman:** “No high/critical means safe.” Severity is not reachability.

**Confidence condition.** Recommend A only if a runtime trace of the packed
entry does not load the vulnerable modules, no high/critical exists, and the
review date is recorded. If the trace loads them, owner choice B/C.

## 7. Windows desktop: keep the retirement

E59 is blocked; O27 C retired the desktop claim. That remains the honest state.
A hosted runner is not a desktop; Windows Sandbox is elevated/disposable and
fails in the direction of a false pass.

**Confidence condition.** Reopen only for a named Windows 11 build, standard
user, interactive sign-in, one turn, close, and process samples. Otherwise no
desktop claim.

## 8. Stage rehearsal: test stage/reject, not approval

npm documents stage publish without 2FA, approval with 2FA, and stage-only
trusted publishing. Approving a stage makes the version public. That is a
release action, not an experiment.

### Options

- **A. Stage and reject.** Verifies workflow, stage ID, download, digest,
  stage-only, and rejection; does not verify approval 2FA.
- **B. Stage and approve a prerelease.** Verifies 2FA and publication, but
  publishes a version; needs a release decision and a disposable semver.
- **C. Dry-run only.** No registry/stage evidence.
- **D. No rehearsal.** Strawman.

**Steelman A:** it exercises every step up to the irreversible one and leaves
0.1.13 unpublished.

**Steelman B:** it is the only way to observe the 2FA approval path, but it
creates a public version and a rollback/deprecation obligation.

**Confidence condition.** O22 A remains partial after A: “stage/reject verified;
approval path documented, not measured.” B only with a separate release
decision and a disposable version.

## Minimum decision layer

Most branches are experiment-determined. The owner is left with:

1. **O31 approval posture** — keep `allowAll` and document global MCP grants, or
   build O16 B with `once`/`session` only. Recommend A unless E61 and a
   one-prompt spike pass.
2. **O32 Console wording** — effect/timing only, or attribution if E55b names
   the workspace. Recommend B only with the exact sentence.
3. **O33 release-gate strictness** — executable CI gates or owner checklist.
   Recommend executable; no product judgment.
4. **O34 reproducibility** — single-builder label or second builder. Recommend
   second builder if a clean one is available.
5. **O35 dependency risk** — accept with runtime trace, block, or refactor.
   Recommend A unless E63 finds a path.
6. **O36 Windows desktop** — retire, test, or best effort. Recommend retire.
7. **O37 stage proof** — stage/reject only, or approve a disposable prerelease
   to observe 2FA. Recommend stage/reject; B needs a release decision.

Defaults are pre-committed in the plan, so execution does not wait for a reply.
Only O31, O35, and O37 can change the release posture; the rest change wording,
evidence, or timing.
