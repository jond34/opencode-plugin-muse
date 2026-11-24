# Round 30 research: options, risks, and the minimum decision layer

**Written** 2026-11-23. Companion to `docs/round-30-plan.md`. This file records
the external checks, the steelman/strawman options, and the conditions under
which a recommendation is confident enough to pre-commit.

## What was checked

Primary sources:

- npm staged publishing: <https://docs.npmjs.com/staged-publishing>
- npm trusted publishers and automatic provenance:
  <https://docs.npmjs.com/trusted-publishers>
- `npm stage` CLI: <https://docs.npmjs.com/cli/v12/commands/npm-stage>
- npm audit: <https://docs.npmjs.com/cli/v8/commands/npm-audit>
- opencode policies: <https://opencode.ai/docs/policies>
- opencode permission API gap:
  <https://github.com/anomalyco/opencode/issues/64787>
- opencode single-use admission gap:
  <https://github.com/anomalyco/opencode/issues/61645>
- Windows Sandbox: <https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/>
- Smart App Control testing:
  <https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/test-your-app-with-smart-app-control>
- A secondary field note on disposable Windows VM testing:
  <https://the-handover.org/docs/windows-vm-testing-for-desktop-apps>
- A dependency-audit triage guide:
  <https://freecodeaudit.com/tutorials/run-a-dependency-audit>
- OpenSSF evaluation guide summary:
  <https://safeguard.sh/resources/blog/openssf-guide-for-evaluating-open-source-software-seven-sections>

Local facts rechecked:

- `npm stage approve --help` says `<stage-id>`, not a package spec.
- `npm stage publish --dry-run` exits 0, packs 208 files, shasum
  `d936320d…`, integrity `sha512-TUFpZ2rH…`.
- `bash scripts/repro.sh` passes at 160 files / `15a64cdd…f6b274b`.
- `gh repo view` reports the repository PUBLIC, so npm’s automatic provenance
  condition is satisfied for the public package.
- The E52 install tree audits at 25 moderate, 0 high/critical; all paths are
  transitive through `@opencode/plugin@2.3.2`. A lock-only 2.4.1 tree still
  reports 24 moderate; npm reports no fix available.

## 1. Console policy: what the docs change

The opencode policy page says:

- a denied provider disappears from the catalog and model selection;
- Console policies compile into regular statements and apply on the next fetch,
  about once a minute;
- Console denials from those statements name the workspace (“Blocked by Acme’s
  policy”);
- broader configuration (managed, system, Console) outranks global/project.

E37 read `opencode models` immediately after creating a single-provider deny and
saw the model still listed. E49 waited 90 seconds, used an allowlist shape, saw
the model disappear, and got a generic `Model unavailable` without a workspace
name.

The likely explanations, in order:

1. **Fetch timing.** E37 did not wait a minute; E49 did. The immediate read can
   show the old catalog even though `debug config` already carries the statement.
2. **Source identity.** E49 saw an unpathed `document`, not a Console-typed
   source. If opencode does not recognize it as the Console workspace layer, the
   workspace-name denial may not be produced.
3. **Policy shape.** A single provider deny and a `deny *` + allowlist may take
   different paths in catalog filtering. This is less likely than timing/source
   but still needs a cell.
4. **Model cache.** The model list may be cached independently of policy fetch.

**Steelman for “matrix.”** One browser session with three shapes and five time
points can turn a contradictory record into a table. It is free, reversible, and
does not spend model turns if the provider is denied.

**Strawman to avoid.** “E49 already proved Console works” ignores that it did not
produce the workspace-named denial the docs promise. “E37 proves it does not
work” ignores the missing wait. Neither sentence is safe.

**Confidence condition.** If the effect appears by 60–120 seconds in at least
one shape and the source is identifiable, recommend documenting the measured
shape and timing, not “Console policies work” in general. If the source remains
unpathed, keep “unattributable” even when enforcement works.

## 2. Approval posture: keep A, or measure B?

E48 proves a saved `tool_action` rule for the fixture name
`mcp__opencode__bash` can carry a second `denyUnmatched` session. It does not
prove the production bridge, restart durability, or a one-prompt UX.

The opencode API still has:

- no non-prompting `permission.allows` (open issue #64787);
- no race-safe single-use admission (open issue #61645).

`permission.assert` prompts when the result is `ask`; it is not a check. A
Muse gate in front of opencode’s gate can ask twice, and a “always” choice can
persist a broader rule than the user saw.

**Steelman A (keep `allowAll`).** The plugin has no surface to present a Muse
approval, and the API cannot bind one approval to the exact execution. The safe
default is one gate, opencode’s. This is already the decision.

**Steelman B (spike).** A two-turn scratch test can count prompts and test a
denial. If it produces one prompt with explicit mapping, B becomes implementable
without guessing. This is worth doing only if the owner is considering B.

**Strawman.** “E48 means we can switch to `denyUnmatched`” — E48 had a fixture,
one host, one workspace, a forced experimental profile, and no product surface.

**Confidence condition.** Recommend B only after one prompt, denial tested, no
broader saved rule, and no second prompt. Otherwise keep A. This is a
two-turn cap, not a product bet.

## 3. Dependency risk: the counts, and what they mean

The E52 tree has 25 moderate advisories, 0 high/critical. All paths are
transitive through `@opencode/plugin@2.3.2` → `@opencode/util` → npm CLI
libraries. The vulnerable `glob` has an AbortSignal cancellation issue; npm says
no fix is available. A 2.4.1 lock-only tree still has 24 moderate.

`npm audit` is a dependency-tree report, not a reachability proof. The plugin
imports `@opencode/plugin` for `Model`, `Plugin`, and `Provider`; the root
promise entry imports schema modules, while the vulnerable `glob` sits in
`@opencode/util/glob`. The runtime reachability is therefore plausible but not
established.

Options:

- **A. Accept with a written note.** Default if no high/critical and the
  moderate paths are not reachable from the plugin’s loaded entry. Record the
  advisory, path, and review date. Risk: a future import pulls the subtree in.
- **B. Gate on moderate.** Safest, but currently unshippable because no fix is
  available; it would turn a transitive tooling advisory into a release freeze.
- **C. Refactor.** Make `@opencode/plugin` a peer or reduce the subtree. Best
  long-term, but changes packaging and compatibility; needs its own tests.
- **D. Upgrade.** 2.4.1 removes one advisory, not the class. Not sufficient
  alone.

**Steelman A.** The package already says reproducibility is not a dependency
audit; a written risk note is honest. **Steelman B.** A public plugin should not
normalize known moderate advisories. **Steelman C.** Removing the subtree is the
only move that removes the class.

**Confidence condition.** Recommend A only if the plugin’s loaded entry does not
reach the vulnerable code and no high/critical exists. Otherwise B or C. This is
the one place the owner’s risk appetite is genuinely required.

## 4. Windows: what counts as desktop evidence

Hosted `windows-latest` is useful for the suite and process-tree mechanics, but
it is not a desktop. E38/E45 correctly found the runner’s job object; a desktop
may have no such job. The support claim needs a named build, a standard-user
interactive session, install, sign-in, a turn, close, and process-table samples.

Options:

- **A. Owner’s physical Windows 11 machine.** Best context; needs owner time.
- **B. Hyper-V VM with a standard user.** Good isolation; setup cost; needs a
  Windows license/image.
- **C. Windows Sandbox.** Fast and disposable, but elevated/disposable and not a
  normal persistent desktop. Useful smoke, weak support evidence.
- **D. Retire the desktop claim.** Honest; no owner time; runner rows remain.

The Handover note’s useful warning: convenient test contexts are elevated,
SYSTEM, or otherwise unlike the user’s session, and they fail in the direction
of a false pass. `whoami /groups` / integrity level should be recorded; an
elevated run is inconclusive, not a pass.

**Confidence condition.** Recommend O17 B only for a named build in a
standard-user interactive session that passes install, login, one turn, close,
and no survivor. Runner-only or Sandbox-only stays O17 A.

## 5. Package docs: include or link?

`README.md` is the npm landing page. It currently links to docs not in the
tarball. Options:

- **A. Include docs in `files`.** Offline-readable; larger tarball; changes the
  hash; duplicates content already on GitHub.
- **B. Absolute GitHub URLs.** Smaller package; no duplicated docs; requires
  network; GitHub path is stable.

**Steelman A.** A user who installs from npm should be able to read the
approval/release limits without leaving the package. **Steelman B.** The package
is a plugin, not a docs bundle; the README already points at the repository, and
the tarball should stay small.

**Confidence condition.** Either is defensible; prefer B unless offline docs are
a product requirement. If A, rerun E51 and update the hash.

## 6. Release: dry-run, stage, or direct

npm documents `npm stage publish` as the CI step, `npm stage list/view/download`
for review, and `npm stage approve <stage-id>` with 2FA. `npm stage publish`
itself does not require 2FA. Trusted publishing can be restricted to stage-only,
which rejects direct `npm publish`.

Options:

- **A. Dry-run only.** Proves package packing; not workflow or registry.
- **B. Stage rehearsal.** Proves workflow, stage ID, tarball digest, and 2FA
  boundary; no public version until approval. Recommended.
- **C. Direct publish.** Rejected; it bypasses the proof-of-presence goal.
- **D. No rehearsal, publish on trust.** Strawman; the exact failure the stage
  flow exists to prevent.

**Confidence condition.** O22 A is verified only after a stage ID exists, the
downloaded tarball digest matches the candidate, and approval (or rejection) is
recorded. Until then it is “dry-run clean.”

## 7. Minimum decision layer

The experiments decide most branches. The owner is left with only:

1. **O25 dependency risk appetite** — accept documented moderate risk, block, or
   refactor.
2. **O26 docs delivery** — include docs or use absolute links.
3. **O27 Windows effort** — owner machine/VM, Sandbox smoke, or retire.
4. **O28 release timing** — release after docs/audit, or wait for all
   experiments.
5. **O29 approval posture** — keep A, or build B only if E58 passes.
6. **O30 Console wording** — narrow to measured, remove, or wait.

Defaults are pre-committed in the plan so the round can proceed without a reply.
The only choice that can block a release on its own is O25; the rest change
wording or timing.
