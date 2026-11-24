# Round 29 research: release, approval posture, Windows, and vendor work

**Written** 2026-11-25, on branch `round-29` off `round-28` (`e53d792`).
This file is the reasoning record behind `docs/round-29-plan.md`. It does not
authorize a publish, a tag, a push, or a vendor submission. The owner approved
every experiment; those are the local measurements in the plan. Publishing and
public writing remain separate actions.

## The question this round answers

Round 28 closed the measurement gaps that were open then. What remains is not
one experiment. It is four different kinds of work that were being described in
one list:

1. **Release work** — the tree carries patches 3–5, npm latest is 0.1.12, and
   the current `dist` is stale. A release candidate needs a version, a
   reproducible build, a new provenance hash, a package inspection, an install
   smoke test, and a human approval path.
2. **Product posture** — should the plugin keep `allowAll`, or offer Muse's
   `:ask-me` approval flow? This is not settled by “the saved rule works.” It is
   settled by whether the plugin can present Muse's prompt without creating a
   second, confusing prompt for the same tool call.
3. **Platform promise** — Windows has a measured runner, installer, resolver,
   handshake and close path, and no desktop. The existing docs already promise
   to retire the desktop row if the next round ends without a machine. That
   promise is now due.
4. **Vendor interop** — there are two real upstream gaps, but filing them is
   public writing. Drafts are cheap; submissions are not.

The round should end with one of three states for each: **ship**, **hold with a
named condition**, or **retire the question with a sentence**. It should not end
with another “pending” row that has no owner.

## Method and confidence

Sources were read on 2026-11-25. The strongest facts are the ones measured in
this repository or stated in current vendor documentation. Search results were
used to find the primary pages, not as authority by themselves.

- **High confidence:** the repository's own state (`package.json`, workflow,
  `dist`, npm metadata, tags), and the vendor pages for npm trusted/staged
  publishing, opencode permissions and plugin permissions, and Muse approvals.
- **Medium confidence:** the double-prompt risk in a Muse-approval surface. It
  follows from two documented gates, but it has not been measured in this
  plugin.
- **Low confidence / deliberately unmeasured:** a Windows desktop result, and
  whether Meta would accept either vendor issue. Neither can be settled by
  reading.

## 1. Release mechanics

### Current state

- The repository is public: `gh repo view` returns `jond34/opencode-plugin-muse`
  with `visibility: PUBLIC`.
- `package.json` is `@jonathand34/opencode-plugin-muse@0.1.12`.
- npm's `latest` is 0.1.12, last modified 2026-11-18. The only local tag is
  `v0.1.12`; there is no GitHub Release for it.
- `.github/workflows/publish.yml` is a manual `workflow_dispatch` job with
  `id-token: write`; it runs `npm ci`, `bash scripts/repro.sh`,
  `npm run check:offline`, then `npm publish`. The action pins are commit SHAs.
- `scripts/repro.sh` hardcodes the old 100-file hash
  `d2d50a429436ec085bc1fa107073e0489e2864bad088edd4fe06b2ed608b5867`.
  The current `dist` is 160 files and hash `0cd9abf…`. The script will fail
  until the release pass rebuilds and records a new hash. That is a release
  gap, not a test defect.
- `README.md` says the runner suite is “410 tests each,” while
  `docs/platform-support.md` records 419 declared, Windows 416 ran / 3 skipped,
  and a local checkout 452 / 41 files. The same platform page says macOS 406 in
  one row and 419 elsewhere. These are release-blocking claim drifts.
- `docs/watchlist.md` still says a real Providers/Tools policy “could not be
  created,” while E37 and E49 created one. It also calls Windows “406 tests”
  and says the Console builder has only a tag target. Those cells are stale.
- `README.md` says the package is built and published by `publish.yml` and every
  version carries a provenance attestation. The workflow supports that. The
  current release candidate must preserve it.

### npm trust and staged publishing

npm documents two relevant mechanisms:

- **Trusted publishing** uses GitHub OIDC, requires npm CLI 11.5.1+ and Node
  22.14+, and automatically generates provenance when publishing from a public
  repository with a public package. The current workflow has the required
  `id-token: write` and uses a GitHub-hosted runner.
- **Staged publishing** runs `npm stage publish`, then a maintainer reviews and
  approves with 2FA via `npm stage approve` or npmjs.com. It requires npm CLI
  11.15.0+ and 2FA on the account. It is designed for exactly the “CI can
  publish while I am asleep” risk.

The current workflow calls `npm publish` directly. That is a valid OIDC publish,
but it has no human gate after CI builds the tarball. A staged workflow changes
one line to `npm stage publish` and leaves the approval to the owner. The
tradeoff is operational: the owner must approve each version, and a staged
package is not public until then. The workflow does not pin npm, so the staged
path also needs a CLI check: staged publishing requires npm 11.15+, and the
bundled Node 24 npm may be older. A pinned `npm install -g npm@11.19.1` before
`npm ci` makes that deterministic.

The local `npm profile get` failed with `E401` because the local token is stale.
That is **not** evidence that the owner's npm account lacks 2FA or publish
access; CI uses OIDC, not the local token. The plan treats local auth as
unmeasured and does not ask the executor to log in.

### What a release candidate must prove

A green suite is necessary but not sufficient. The candidate must prove:

1. The source and docs agree on the version, test frame, platform claim, and
   release status.
2. `dist` is rebuilt from the committed lockfile and the new hash is recorded.
3. The tarball contains only the intended files, no scratch, tests, evidence
   tarballs, or secrets.
4. The tarball installs into an isolated prefix and the plugin loads there.
5. The existing provenance path still names this repository and workflow.
6. Nothing is published, staged, tagged, or pushed by the execution session.

## 2. Approval posture

### What Muse documents

Muse's approval model is a durable record flow:

- Four modes: `allowAll`, `promptUnmatched`, `onRequest`, `denyUnmatched`.
- Every choice has a scope: `once`, `session`, or `locally-persistent`
  (the workspace policy store).
- A client selects choices from a server-minted menu; it never constructs a
  policy.
- MCP tools are not sandboxed. Approval still applies; containment does not.
- Approvals do not expire in v1. A pending approval parks the turn and blocks
  idle unload. Headless clients that must not park should declare a
  default-deny mode instead.

E48 already measured the bridge's actual registered name:
`:ask-me` offered “Always allow this MCP tool” for `mcp__opencode__bash`, wrote a
`localPersistent` rule, and a second `denyUnmatched` session ran the tool with
no approval. So the saved-rule half is no longer open.

### What opencode documents

opencode has a separate permission engine:

- Rules are ordered `allow` / `ask` / `deny`; the last match wins; no match
  means `ask`.
- MCP tools use `<server>_<tool>` as the action; unsupported characters become
  `_`.
- A fresh agent starts from a base policy that allows everything except `.env`
  reads. `shell` runs with the host user's full authority. There is no
  OS sandbox.
- Saved approvals are durable, project-scoped allow rules. They never override
  a configured `deny`.
- The V2 plugin API exposes `ctx.permission.assert(...)`, which evaluates the
  session's rules and prompts the user when the result is `ask`. It also exposes
  `permission.list`, `permission.get`, and `permission.reply`.
- Plugin-defined tools can currently bypass configured permissions
  (`anomalyco/opencode#50652`, open). This plugin does not register a custom
  tool; it emits tool calls into opencode's own loop. The distinction matters
  for how broadly that issue applies, but it is a reason not to build a new
  custom tool casually.

### The double-gate problem

The plugin's bridge works by emitting an opencode `tool-call`; opencode then
executes the tool under its own permission rules. That is the one gate the
plugin actually relies on. If the plugin also presents Muse's
`approval/requested` through `ctx.permission.assert`, the same tool call can
meet two gates:

1. Muse's approval, presented by the plugin through opencode's permission UI.
2. opencode's own permission check when the tool actually runs.

If the user chooses “once” at the first gate, the second gate has no durable
grant and may ask again. If the plugin asserts the same action and resource,
“always” may save an opencode rule and suppress the second prompt, but that
couples the plugin to opencode's saved-approval semantics and still leaves the
question of what happens on a deny or a scope mismatch. A correct design needs
either a native “pre-approved for this call” path or a way to make the first
gate the only gate. Neither is in this plugin today.

This is why D194 does **not** imply O16 B. The saved rule works; the missing
piece is a user-visible surface that does not double-ask and does not turn a
Muse policy into an opencode policy by accident.

### What would make B safe

- A measured one-prompt path: Muse's approval is presented once, and the
  subsequent opencode execution does not ask again for the same call.
- A clear mapping from Muse choices (`once`, `session`, `locally-persistent`) to
  opencode choices (`once`, `always`, `reject`) that does not silently persist a
  broader rule than the user saw.
- A refusal path when the host has no reviewer, no `:ask-me`, or no permission
  API.
- A test that pins the denial/approval shape and the “no second prompt” claim.

Without those, B is a new mechanism added to answer a product preference. The
default should remain A.

## 3. Windows promise

The repository already has a strong runner story: installer layout, resolver,
`--version`, `config validate`, a real `muse serve` handshake, close with no
observed survivor, and a 416/419 runner suite. It has no signed-in Windows 11
desktop. The vendor's Windows surface is also visibly unsettled:

- `meta-models/muse-code-sdk#149`: `muse serve` fails shell commands with
  “windows elevated sandbox setup has not run” while the check says ready.
- `#107`: serve reports `setup_required` despite a ready sandbox.
- `#96`: a sandbox ACL publication lock leaves every shell call timing out.
- `#138`: elevated setup creates local users, a group, profiles and a
  ProgramData root without disclosing them before UAC.
- `#139`: no supported uninstall/teardown.
- `#62`: sandbox admission rejected on standard consumer ACLs.

These are vendor issues, not this plugin's bugs. But they are exactly why “the
runner passed” cannot become “Windows is supported.” The current README is
already careful: best-effort, three named caveats, no parity claim. The question
is whether to keep a “desktop pending” row alive forever.

Microsoft's SmartScreen documentation adds a separate nuance: unsigned files
start at zero reputation and can show “Windows protected your PC”; signed files
can still warn until reputation accumulates. That applies to the vendor's
installer/binary, not to this plugin's JavaScript package, so it is not a reason
to sign this npm package. It is a reason not to promise a clean Windows install
experience the vendor does not control.

The prior platform page says: “Round 25's Q6 answer keeps this pending for one
round and retires the desktop row to runner-verified-only if the next round ends
without a machine.” Round 28 ended without a machine. Keeping the row “pending”
would break that commitment. The honest options are:

- **A. Best-effort, retire the desktop row now.** Keep the measured runner rows;
  say desktop is unmeasured and not planned. No support claim.
- **B. Supported for a named build.** Only with E50's JSON.
- **C. Experimental / de-emphasised.** If E50 fails at install or login.

Recommendation: A now. B is available later if a machine appears; it does not
need a permanently open row.

## 4. Documentation drift is a release blocker

The following are not stylistic nits; they change what a reader believes:

| Location | Current claim | Measured state |
|---|---|---|
| `README.md` Platforms | “410 tests each, 2026-11-24” | 419 declared; Windows 416 ran / 3 skipped; local 452 / 41 files |
| `docs/platform-support.md` macOS row | “406 tests” in one place | 419 / 0 on `macos-15` |
| `docs/watchlist.md` policy row | real Providers/Tools policy “could not be created” | E37 and E49 created one |
| `docs/watchlist.md` Console row | builder has only a tag target | E37 used the hand-picked-member route |
| `docs/watchlist.md` platforms row | macOS 406 | 419 |
| `.github/workflows/test.yml` header | “nobody has run it yet” | multiple runs recorded |

A release candidate that ships these contradictions would make the provenance
record less trustworthy, not more. Fix them before the build.

## 5. Vendor work

Two drafts are worth having ready, and neither needs a submission:

1. **Muse approval-store schema.** E48 saw schema_version 2 with a `tool_action`
   rule, a `localPersistent` choice, and a preview. The store is still an
   unpublished implementation detail. Ask for a versioned schema, migration
   rules, and an error when a client writes an unknown shape. The plugin does
   not need to write it; the ask is for stability and documentation.
2. **SDK transport `closed` after EOF on Windows.** E42 measured `closed` still
   pending after 10 s while `close()` settled in 7 ms and killed the pid. Ask
   for the promise to settle, or for the documented contract to say it does not.
   This is narrow and reproducible.

A third possible ask — opencode's plugin-tool permission bypass (#50652) — is
real but not this plugin's code path today. Draft it only if the plugin starts
registering its own tool. Do not bundle it into the release.

## 6. Choices that do not fall out of an experiment

These are product/operational choices. They should be raised after the measured
results, not disguised as measurements. Each has a recommended default and a
condition that would flip it.

### O15. What ships next

- **A. Prepare 0.1.13, do not publish.** Bump, build, record hash, pack, install
  smoke, stop. Default.
- **B. Hold the release until a Windows desktop result exists.** No candidate.
- **C. Publish now with Windows best-effort.** Not authorized here; publish is a
  separate owner action.

Steelman A: three unpublished patches are already in the tree, the suite is
green on three systems, and a candidate is how they become usable without
pretending the desktop is measured. Strawman A: a green suite is not an install;
the hash is stale and the docs contradict each other. Steelman B: shipping
without a desktop invites a support claim the evidence does not carry. Strawman
B: the README already says best-effort, so waiting adds no information.
**Recommendation: A**, after the docs and hash are fixed and with the Windows
sentence unchanged. Publishing remains a separate action.

### O16. Approval posture

- **A. Keep `allowAll`.** One gate: opencode's permission engine. Default.
- **B. Offer `:ask-me` plus a one-time “Always allow”.** Only with a measured
  one-prompt surface.
- **C. Auto-seed the store.** Reject; it writes the user's safety settings from
  an unpublished schema.

Steelman B: it is the only mode that fails closed if the toolset widens, and the
saved rule is measured. Strawman B: MCP tools are not sandboxed, the approval is
not containment, and a second machine silently refuses until the rule is
re-created. **Recommendation: A.** D194 makes B technically available, not
product-ready.

### O17. Windows promise

- **A. Best-effort; retire the desktop row now.** Default.
- **B. Supported for the named build.** Only after E50 passes.
- **C. Experimental / de-emphasised.** Only if E50 fails before the first turn.

**Recommendation: A.** The runner evidence stands; the desktop is not planned
until a machine exists.

### O18. Vendor engagement

- **A. Drafts only, no contact.** Default.
- **B. File both issues.** Public writing; owner approval required.
- **C. File the close-promise issue only.** Narrower.

**Recommendation: A.** The drafts make B a paste, not a research task.

### O19. Native history default

- **A. Keep opt-in.** No measured saving in the billed unit. Default.
- **B. Default on for long sessions.** Needs a value measurement this repo does
  not have.
- **C. Remove.** Reject while it is the only native-continuity path.

**Recommendation: A.**

### O20. Evidence visibility

- **A. Keep the apparatus in `docs/`, README short.** Default.
- **B. Add a user-facing status/limits page.**
- **C. Publish the full review.**

**Recommendation: A** for this round; B becomes worthwhile when 0.1.13 ships.

### O21. Version number

- **A. 0.1.13.** Matches the prior default and the next patch in the 0.1 line.
- **B. 0.2.0.** Signals the containment/history/approval work as a feature
  release.
- **C. 1.0.0.** Only if the public API is declared stable; not supported by the
  current evidence.

SemVer is explicit that `0.y.z` is initial development and anything may change;
it also recommends incrementing the minor for substantial new functionality.
The tree adds features, but the plugin's public surface is still the provider
and its caveats, not a stable API. **Recommendation: A** to keep the release
small and the prior promise intact. B is defensible if the owner wants the
feature set to read as more than a patch.

### O22. Publish gate

- **A. Staged publish with 2FA.** Change the workflow to `npm stage publish`,
  review the staged tarball, approve with 2FA. Default.
- **B. Direct OIDC `npm publish`.** Current workflow; fastest, no human gate.
- **C. Manual local publish.** Reject; loses the OIDC/provenance path.

Steelman A: CI can be compromised; a human approval after the build is the
cheapest control that preserves provenance. Strawman A: it adds a manual step
and a second place for the release to stall. Steelman B: the workflow is already
pinned and the owner reviews the commit. Strawman B: a compromised workflow can
publish while the owner sleeps. **Recommendation: A.** It is one workflow line
and one trusted-publisher setting, not a new system.

### O23. Release notes

- **A. Add `CHANGELOG.md` and draft a GitHub release body.** Default.
- **B. GitHub release only.**
- **C. No notes.**

**Recommendation: A.** The tree carries three patches; users need one page that
says what changed without reading the evidence.

### O24. Support surface

- **A. README + `SECURITY.md` only.** Default.
- **B. Add `SUPPORT.md`** with issue routing and no-SLA language.
- **C. Add issue templates.**

**Recommendation: A** for this round. The README already says best-effort and
`SECURITY.md` already routes vulnerabilities. A `SUPPORT.md` is reasonable when
the issue volume justifies it, not before.

## 7. What the measurements can and cannot decide

- R2 can prove the published 0.1.12 artifact and attestation are coherent. It
  cannot prove the next tarball will be accepted by npm.
- E51 can prove the local candidate builds, packs, hashes, and installs. It
  cannot prove the GitHub publish workflow succeeds until the branch is pushed
  and the workflow is dispatched.
- E52 can prove the tarball loads in an isolated opencode config. It cannot prove
  a model turn or a Windows desktop.
- E53 can prove a desktop result only if the owner's JSON exists. It cannot be
  simulated.
- E54 (if O16 B is chosen) can prove a one-prompt path; it cannot prove Muse's
  policy semantics on another machine.

## 8. Confidence and open conditions

- **Release candidate:** high confidence in the mechanics; medium confidence
  that the first `npm pack`/install smoke is clean, because the current `dist`
  is stale and the package exports `src`.
- **Staged publish:** high confidence in npm's documented behavior; medium
  confidence that the owner's trusted-publisher configuration allows it without
  a settings change.
- **Approval B:** low confidence until a one-prompt path is measured. The
  double-gate risk is structural, not speculative.
- **Windows B:** no confidence without E50. Windows A is the honest default.
- **Vendor issues:** medium confidence that both are actionable; the store schema
  ask may be declined as an implementation detail.

## Sources

Primary vendor pages read 2026-11-25:

- npm, “Trusted publishing for npm packages”:
  https://docs.npmjs.com/trusted-publishers/
- npm, “Staged publishing for npm packages”:
  https://docs.npmjs.com/staged-publishing
- npm, “Generating provenance statements”:
  https://docs.npmjs.com/generating-provenance-statements
- opencode, “Permissions”: https://opencode.ai/docs/permissions
- opencode, “Server” plugin API: https://opencode.ai/docs/build/plugins/server/
- Muse, “Approvals”:
  https://meta-models.github.io/muse-code-sdk/next/guides/msp-concepts/approvals/
- Muse, “MCP servers”:
  https://meta-models.github.io/muse-code-sdk/next/guides/extend/mcp-servers/
- Semantic Versioning 2.0.0: https://semver.org/
- Microsoft, “SmartScreen reputation for Windows app developers”:
  https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation

Repository facts:

- `package.json`, `.github/workflows/publish.yml`, `.github/workflows/test.yml`
- `scripts/repro.sh`, `docs/provenance.md`, `docs/platform-support.md`,
  `docs/watchlist.md`, `README.md`
- `docs/evidence/2026-11-25-e48.json`, `docs/evidence/2026-11-25-e49.json`,
  `docs/evidence/2026-11-25-r1.json`

Upstream issues referenced:

- `meta-models/muse-code-sdk#149`, `#107`, `#96`, `#138`, `#139`, `#62`
- `anomalyco/opencode#50652`, `#63555`, `#62602`
