# Round 32 research: from a stopped release to a measured trust decision

**Written** 2026-11-23. Base `9cffa53` (`round-31`). Companion to
`docs/round-32-plan.md`.

Round 31 stopped at E62 B2. The question now is not “is there a bug in Muse?” —
there is. The questions are narrower and decide the release:

1. Is E62 the documented one-time legacy migration, or does it recur on every
   update?
2. Does the bypass reach this plugin’s private `muse serve` host, which does not
   copy the user’s Muse settings?
3. If it reaches the host, is the right fix a code gate, a documented
   workaround, a vendor wait, or a release hold?
4. What can be honestly claimed about Console policy, provenance, the second
   builder, and stage/reject?

The research below is the basis for the pre-committed branches. It is not a
substitute for the experiments; it narrows what each result means.

## Sources checked

Primary vendor and registry sources:

- Muse plugin trust, review statuses, and what an approval binds to:
  <https://meta-models.github.io/muse-code-sdk/1.4/guides/plugins/concepts/trust-review-and-scopes/>
- Muse hooks in plugins:
  <https://meta-models.github.io/muse-code-sdk/1.4/guides/plugins/concepts/hooks/>
- Muse plugins in SDK sessions (the host reads the same plugin store; approvals
  load at host start):
  <https://meta-models.github.io/muse-code-sdk/1.4/guides/plugins/concepts/plugins-in-sdk-sessions/>
- Muse changelog:
  <https://raw.githubusercontent.com/meta-models/muse-code-sdk/main/CHANGELOG.md>
- Muse Code changelog page (security sentence on update review):
  <https://dev.meta.ai/docs/muse-code/changelog>
- opencode permissions:
  <https://opencode.ai/docs/permissions>
- opencode policies, including Console timing, authority, and the workspace-named
  denial:
  <https://opencode.ai/docs/policies>
- npm trusted publishing, including stage-only, 2FA, provenance, and the 2-day
  configuration expiry:
  <https://docs.npmjs.com/trusted-publishers>
- npm staged publishing:
  <https://docs.npmjs.com/staged-publishing>
- `npm stage` CLI, including the 2FA table:
  <https://docs.npmjs.com/cli/v12/commands/npm-stage>
- npm provenance:
  <https://docs.npmjs.com/generating-provenance-statements>
- Node `fs` Windows permission caveat:
  <https://nodejs.org/api/fs.html>
- `@vercel/nft` trace limitations:
  <https://github.com/vercel/nft/issues/543>,
  <https://github.com/vercel/nft/issues/603>

Local and repo sources:

- E62: `docs/evidence/2026-11-26-r31-e62.json`
- E63: `docs/evidence/2026-11-26-r31-e63.json`
- Round 31 status: `docs/round-31-status.md`
- Private host config: `src/host-config.ts`
- Hook gate: `src/hooks.ts`, `test/hook-gate.test.ts`
- SDK hook catalog type: `node_modules/@muse-code/sdk/dist/src/msp.d.ts`
  (`HookCatalogEntry` has only `enabled`, `event`, `handlerKind`, `key`)
- Installed binary: `muse-bin-1.4.25-R9361.1` contains the settings key
  `legacy_hook_trust_amnesty_applied`
- Repository visibility: `gh repo view` reports `jond34/opencode-plugin-muse`
  is PUBLIC (checked 2026-11-23), so npm provenance is not blocked by a private
  repository.

## 1. What E62 actually established

E62 did this on Muse 1.4.25 with an isolated store:

1. Fresh project-scoped install: `review_needed`, no marker.
2. `muse plugins approve`: `trusted_enabled`, marker A on the next echo turn.
3. Change only the hook command; `muse plugins update`.
4. `muse plugins inspect`: `modified`, `modified_definition_hash`, new hash.
5. Next echo turn: marker B ran, and settings held the new hash with
   `legacy_hook_trust_amnesty_applied: true`.

The vendor documents the opposite for a normal update: any package change moves
an approved capability to `modified`, and “a modified hook does not run until you
approve it again.” The vendor also documents a one-time legacy migration:

- the changelog says “downgrade-save-upgrade cycles no longer re-run the one-time
  legacy hook trust amnesty”;
- a vendor changelog entry indexed on 2026-11-23 says installed plugin hooks ask
  for review again when an update changes the code they run, and hooks approved
  before that release ask once more.

That makes the most likely reading: E62 hit the migration path when the flag was
absent on a fresh install, not the normal update path. The E62 settings record
has **two** parts, which matters for the test:

```json
{
  "legacy_hook_trust_amnesty_applied": true,
  "runtime_capabilities": {
    "legacy_hook_trust_amnesty_applied": {
      "enabled": false,
      "trusted_definition_hash": "tbh:amnesty-applied:v1"
    }
  }
}
```

The top-level boolean and the sentinel runtime-capability row are both written
after the migration. A test that sets only the boolean may not suppress the
migration; E65 seeds the pair. It is a hypothesis, not a pass: a fresh install
should not be treated as a legacy grant, and the flag may not be a supported user
switch.

**What this does not establish:** that the bypass recurs after the flag is set;
that it reaches `muse serve` with the plugin’s private config; or that a user can
safely edit the flag.

## 2. Does E62 reach this plugin’s host?

This plugin does not install a Muse plugin. It starts `muse serve` with a private
`XDG_CONFIG_HOME` written by `writeMuseHostConfig()`:

- the private `settings.json` pins `run.toolset`, replaces the system prompt,
  disables the six built-in reminders, and turns skills off;
- the user’s real `auth.json` is symlinked in;
- the user’s real `settings.json` is not copied or read.

Muse’s plugin approvals live in `settings.json` under `runtime_capabilities`.
The installed plugin package and its record live in the user data directory. In
the plugin’s private config, the package store may still be visible while the
approval entries are not. If so, a user-approved plugin hook should be
`review_needed` in the private host and should not run; E62 would be a Muse-wide
bug outside this plugin’s actual host.

But this is not safe to assume:

- `muse serve` reads “the same plugin store” as `muse plugins`; the docs separate
  package records from approval decisions in prose, but the host may read more
  than the private settings file shows;
- `hook/list` has no trust status: `HookCatalogEntry` carries `enabled`, `event`,
  `handlerKind`, and `key`, not `trusted_enabled` or `modified`. The plugin
  cannot tell a stale `modified` hook from an approved one through the wire;
- the current code blocks `project` origins only (`BLOCKING_KINDS = new
  Set(["project"])`); a `plugin` row is allowed by design.

So there are three live hypotheses:

| Hypothesis | What it means | Release consequence |
|---|---|---|
| H1. E62 is the one-time migration and the private host does not carry approvals | Muse-wide bug, not reachable here | Correct P5 wording; release can resume after E64/E60 |
| H2. E62 is a recurring update bypass, but the private host does not carry approvals | Muse-wide bug, not reachable here; no code gate needed yet | Correct P5 and watch the vendor; release can resume |
| H3. E62 reaches the private host | A changed hook can run inside an opencode session | Stop; add a gate or hold |

E65 is designed to separate H1/H2/H3.

## 3. Plugin-origin hook options

### A. Keep the current allow, correct the claim

`plugin` remains allowed; `project` stays blocked. Document that Muse’s own
plugin approval is fresh-install evidence and that an update may be amnestied on
1.4.25. No code change.

**Steelman:** the plugin’s host does not copy user approvals, so the gate would
block a path that is already inert; adding a second trust record for a Muse
plugin is complexity without a measured reachable risk.

**Strawman:** “E62 is only a Muse bug, so it cannot matter here.” That assumes
the host boundary the experiment has not measured.

### B. Block `plugin` origins too

Change `BLOCKING_KINDS` to include `plugin`; require the doctor’s record or
`MUSE_ALLOW_PLUGIN_HOOKS=1` for one run. This is defense in depth, and it makes
the plugin’s statement true regardless of Muse’s migration.

**Steelman:** a hook is a command outside opencode’s permission engine. The
plugin already refuses the workspace’s own hook file; refusing a user-installed
plugin’s hook until the person records it is consistent and cheap.

**Strawman:** “The user installed it, so it is trusted.” E62 is exactly the case
where the user’s decision no longer matches the definition that runs.

**Cost:** a user with a legitimate Muse plugin hook sees a refusal until they
record it. The existing `hook/list` rows do not expose a hash, so a per-plugin
record would need a name/key record or a CLI preflight, not the current
`--trust-hooks` file record.

### C. Warn, do not block

Keep the allow, add a doctor/startup warning that Muse plugin hooks are outside
the plugin’s record and that an update may have been amnestied. Lowest behavior
change; weakest guarantee.

**Steelman:** the plugin cannot see the trust status, so a warning is the only
honest signal it can produce without a new Muse API.

**Strawman:** a warning in a log line is not a gate.

**Confidence condition for B:** E65 H3, or a second measurement showing the
private host loads an updated plugin hook. Without that, B is a product choice,
not an evidence-forced change.

## 4. Release and registry facts

### Stage and reject both need 2FA

The npm CLI table says `npm stage publish` does not require 2FA; `npm stage
approve` and `npm stage reject` do. Round 31’s E60 text (“stage publish and
reject did not require approval”) is wrong. E60 cannot be run unattended: the
owner must be present for the reject prompt, even though the stage itself is
created without one.

### Stage-only is a trusted-publisher setting, not a repo check

A trusted publisher can be configured to allow `npm stage publish` and not
`npm publish`. The repository cannot prove that setting from CI; it can record
the owner-side state and the fact that the workflow only calls `npm stage
publish`. Do not test the setting by attempting a direct publish.

### Provenance is automatic, but only after a public publish

The repo is public, the package is public, and the workflow is GitHub-hosted
with `id-token: write`, so trusted publishing should generate provenance
automatically. But provenance is generated when the package is published, not
when it is staged for review. A stage/reject rehearsal can inspect the staged
tarball, but it cannot honestly claim “provenance verified” before approval. If
provenance must be a gate, the owner has to approve a disposable version, which
is a separate release decision and a public artifact.

`npm audit signatures` verifies installed packages with attestations; it is not
a pre-approval check for a staged tarball.

### Stage expiry

A new trusted-publisher configuration expires if its first successful publish is
not completed within 2 days. Create or refresh it only when the release is ready
to stage; do not configure it weeks ahead.

## 5. Console policy: vendor text versus local evidence

opencode’s policy page is explicit:

- Console policy changes apply on the next fetch, about once a minute;
- Console statements compile into regular policy statements;
- denials from those statements say `Blocked by <workspace>'s policy`;
- Console policy ranks below managed preferences and the system file but above
  user and project files.

Local E36/E37 saw a Console provider policy compile into the untyped `document`
source, not a Console-typed source, and E49 saw a generic `Model unavailable`
rather than a workspace-named denial. That is not a contradiction: a provider
restriction removes the model before an action is attempted; the named sentence
is for a denied action. E55a tests effect/timing; E55b tests the named denial on
a tool action.

A further authority caveat: a Console `allow` can outrank a local `deny`. Issue
#59080 was closed not-planned after the maintainer showed the local provider deny
worked without a Console `allow`; Console policy priority can make the local
deny look ineffective. Any Console experiment must record the connected
workspace and policy authority, not only the local file.

### Options

- **A. No new Console claim.** Keep “compiled but not attributable” and let the
  vendor docs stand as vendor docs.
- **B. Effect/timing only.** Requires E55a B1.
- **C. Attribution for the tool-deny shape.** Requires E55b B1 and the exact
  sentence.

**Steelman A:** the plugin cannot see the source type; a console policy can
change under the user. **Steelman B/C:** users care whether the policy works and
who blocked them; the vendor documents both. **Strawman:** “E49 proves Console
policies never name the workspace.” It proves a provider-selection error is
generic.

## 6. Dependency risk: trace is evidence, not proof

E63 traced 371 unique files from `dist/index.js` and found no `@opencode/util`,
glob, minimatch, gaxios, gcp-metadata, or rimraf. The installed tree still audits
at 25 moderate, 0 high, 0 critical. That supports O35 A with a review date.

`@vercel/nft` is static analysis with known dynamic-resolution gaps (for
example, `createRequire` and conditional exports issues #543 and #603). A trace
that finds no path is stronger than `npm audit` severity alone, but it is not a
runtime proof. If the owner wants a stronger claim, the next step is a loader or
instrumented import that records resolved modules in the packed entry, not a
second static trace with the same blind spots.

**Confidence condition for “no path found”:** keep the exact entry, tool
version, and file list; say “no path found in this trace,” not “unreachable.”
Do not block on moderate solely because severity exists; do block on high or
critical, or on a traced vulnerable module.

## 7. Reproducibility: second clean builder

`repro.sh` compares `dist/` only. E64 uses a fresh `git archive`, `HOME`, npm
cache, and `TMPDIR`, then compares `dist/` and the tarball. That catches cache
and working-tree contamination; it is still one OS and one toolchain. It does
not support “independently reproduced.”

**Confidence condition:** B1 (dist and tarball match) supports “second clean
workspace/cache; separate-OS rebuild pending.” A mismatch is a stop, not a
wording problem.

## 8. Windows desktop

E59 is blocked and round 29 retired the desktop claim. A hosted runner cannot
answer UAC or SmartScreen, complete the interactive sign-in, or spend a
subscription turn. No Round 32 experiment changes that.

**Confidence condition to reopen:** a named Windows 11 build, standard user,
interactive sign-in, one turn, close, and process samples. Otherwise O36 A
stands.

## 9. Minimum decision layer

After E65/E61/E55/E64/E60, most branches decide themselves. The owner is left
with four choices that are not settled by a measurement:

1. **P1. Plugin-origin hook posture** — keep allow and correct the claim, block
   plugin origins, or warn only. Recommend block only if E65 H3; otherwise
   correct the claim and add a warning.
2. **P2. Release under E62** — hold for a vendor fix, resume with a documented
   caveat, or resume only with a code gate. Recommend resume with a caveat only
   if E65 says the private host is inert and the flag behavior is understood;
   otherwise hold.
3. **P3. Provenance proof** — accept that stage/reject cannot verify provenance
   before approval, or approve a disposable prerelease to observe it. Recommend
   the former; the latter is a public release action.
4. **P4. Console claim** — no claim, vendor-doc note, or measured effect/
   attribution. Recommend measured if the owner browser run passes; otherwise a
   clearly labeled vendor-doc note.

O31–O37 remain the product/release choices they were; Round 32 only moves their
recommendations with results.
