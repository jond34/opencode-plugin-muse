# Release gates

This page is the operational release record: what is published, what the local
candidate must prove, and how a version reaches npm. It does not itself
authorize a publish, a staged upload, a tag, or a push.

## Current public state

- npm `latest` is `0.1.12`, published 2026-11-18. The only tag is `v0.1.12`;
  there is no GitHub Release.
- X9a passed on 2026-11-24 with opencode 2.4.1 and Muse CLI 1.4.25: the candidate
  completed a simple turn, a bridged tool call, and a resumed turn. See
  [`evidence/2026-11-24-r36-x9.json`](evidence/2026-11-24-r36-x9.json). No stage,
  tag, or GitHub Release exists.
- The tree is the `1.0.0` candidate. Its build identity and candidate hashes are
  recorded in [`provenance.md`](provenance.md).
- `docs/integration-landscape.md` is an owner-modified file and is deliberately
  not part of a release commit.
- The version is `1.0.0`; see the public API below. A candidate is not a release
  until npm and the GitHub tag both verify. X9b, the published install command,
  is not proven until a public version exists.

## Watch item

Re-run E65/E65b when a Muse release changes plugin approval loading for `muse
serve`, or when `hook/list` exposes a per-plugin trust status or hash — on the
next Muse minor after 1.4.25, or by 2027-02-28, whichever is sooner. If the
private host starts reading the user's approvals, re-open P1 and implement the
`plugin` gate. Until then P1 A stands: the allow stays, and the doctor and this
page carry the caveat.

## Version policy

`1.0.0` declares the narrow API in [`compatibility.md`](compatibility.md): the
package name, `.` and `./tui` exports, provider id `muse`, documented `MUSE_*`
variables, and the install command. Model ids and vendor behavior remain data. Use
a patch for fixes and narrow compatible changes, and a minor for substantial
compatible work. Never reuse a published version; npm does not allow overwriting
one.

The candidate version must agree in `package.json`, `package-lock.json`, the
tag name if one is later created, and the release notes.

## Candidate gates

All of these run before the candidate is called ready. `bash
scripts/check-release.sh` is the executable contract; `publish.yml` runs it
before `npm stage publish`.

| Gate | Enforced by | Evidence | Owner-only? |
|---|---|---|---|
| Strict external claims | `check-release.sh` → `check-claims.ts --strict` | `docs/claims.json` | No |
| Typecheck and offline suite | `publish.yml` → `npm run check:offline` | `test/` | No |
| Reproducible `dist/` | `publish.yml` → `scripts/repro.sh` | `docs/provenance.md` | No |
| Pack inspection | `check-release.sh` | `scratch/r31-pack.json` | No |
| Isolated install and import | `check-release.sh` | temp app under `$TMPDIR` | No |
| Clean packed-install audit | `check-release.sh` | `scratch/r31-audit.json` | No |
| Windows sentence | Owner review of `docs/platform-support.md` | named desktop result or absence | Yes |
| Diff check | `check-release.sh` → `git diff --check` | working tree | No |
| Stage approval | `npm stage approve <stage-id>` with 2FA | npm stage | Yes |
| Stage rejection | `npm stage reject <stage-id>` with 2FA | npm stage | Yes |

A green suite is necessary, not sufficient. It does not exercise the publish
workflow, the registry, or a model turn.

## What is verified when

| Object | How it is verified | When |
|---|---|---|
| Candidate tarball | `npm pack` plus SHA-256 of the `.tgz` | Before any stage |
| Staged tarball | `npm stage download <stage-id>` plus SHA-256; compare with the candidate | While the stage is pending |
| Provenance | Generated at public publish by trusted publishing; not verifiable from a staged package | After approval only |
| Public version | `npm view <pkg> versions --json` and `dist-tags --json` | After approval only |

`npm audit signatures` verifies an installed package that already carries an
attestation. It is not a pre-approval check for a staged tarball.

## Dependency gate

Run `npm audit --omit=dev` in a clean install of the packed tarball, not only in
this checkout. The release rule is:

- **high or critical:** block the release;
- **moderate:** record the count, the dependency path, and whether the vulnerable
  code is reachable from the plugin's loaded entry; accept only with a written
  review date;
- **low or none:** record the result and proceed.

Do not run `npm audit fix --force` as part of a release. The current candidate
result is in `docs/evidence/2026-11-26-r30-dep.json`.

## Publish flow

The workflow uses GitHub OIDC trusted publishing, so no long-lived npm token is
stored. Under O22 A the flow is:

1. CI checks out the candidate, runs the gates, then runs `npm stage publish`.
2. The owner reads the stage ID from `npm stage list --json`.
3. The owner inspects it, downloads it, and compares its digest with the
   candidate:

   ```bash
   npm stage list --json
   npm stage view <stage-id>
   npm stage download <stage-id>
   # inspect the tarball and compare its sha256 with the candidate
   ```

4. The owner approves that exact ID with `npm stage approve <stage-id>` and 2FA.
   On npmjs.com the same review and approval are available in the UI.
5. If the stage is wrong, reject it with `npm stage reject <stage-id>` **and
   2FA**. Only an approved stage becomes public.

`npm stage approve` takes a **stage ID**, never a package spec. `npm stage
publish` does not require 2FA; `approve` and `reject` both do. Reject is not an
unattended operation: it prompts for a one-time password, so the owner must be
present. The trusted publisher should be configured as **stage-only**; that
setting is owner-side, not repo-side, and rejects a direct `npm publish` from the
workflow. The workflow does not publish anything until the owner dispatches it.

A newly created trusted-publisher configuration expires if its first successful
publish is not completed within **2 days**. Create the configuration when a
release is ready to stage, not weeks in advance. These are npm-side facts, not
repo-side checks.

The repository is **PUBLIC** (`jond34/opencode-plugin-muse`), so repository
visibility does not block provenance. Trusted publishing with `id-token: write`
generates it automatically at public publish; do not add `--provenance` to the
workflow. Stage-only is an owner-side setting: the repository can record it and
record that the workflow only calls `npm stage publish`, but CI cannot prove it,
and it is not tested with a direct publish.

Staged publishing requires npm CLI 11.15.0+. The workflow pins `npm@11.19.1`
before `npm ci` so the runner does not depend on the bundled CLI.

A staged package is not a registry version. If it cannot be approved, reject it;
it does not need a rollback.

## Rollback

Never overwrite or unpublish a version users may have installed. Deprecate the
bad version with a message that names the replacement, then publish a patch.
A failed stage can be rejected before approval. A tag or GitHub Release must
name the same commit as the published artifact.

## What not to promise

- No Windows desktop parity. The runner matrix and installer checks are not a
  signed-in desktop.
- No containment behind the bridge. opencode's permission rules are the gate;
  Muse approvals are not a sandbox for bridged calls.
- No per-turn cost ceiling. The provider allowance is the durable limit.
- No offline or air-gapped path.
- No automatic approval surface. `allowAll` plus opencode's rules remains the
  current posture; see [`approval.md`](approval.md).
- No execution of a Muse plugin hook that is approved only in the user's Muse
  config. The private host config carries no such approval; `bun run doctor`
  reports the installed handler and the limitation. A private config that holds
  its own approval is amnestied by `muse plugins update` on 1.4.25, and this
  plugin never creates or updates one.

## Evidence

- [`provenance.md`](provenance.md) — build hash, toolchain, and what the record
  does not prove.
- [`platform-support.md`](platform-support.md) — per-surface platform claims and
  their runs.
- [`claims.md`](claims.md) — the external statements this record depends on.
- [`../CHANGELOG.md`](../CHANGELOG.md) — user-visible changes.
