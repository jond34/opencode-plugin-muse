# Release and candidate gates

This page is the operational release record: what is published, what a local
candidate must prove, and how a version reaches npm. It does not authorize a
publish, a staged upload, a tag, or a push.

## Current state

- npm `latest` is `0.1.12`, published 2026-11-18. The only tag is `v0.1.12`;
  there is no GitHub Release.
- The tree carries patches 3 through 5, which no published tarball contains.
  Its `dist/` is rebuilt for the candidate and recorded in
  [`provenance.md`](provenance.md).
- `docs/integration-landscape.md` is an owner-modified file and is deliberately
  not part of a release commit.
- The next version is `0.1.13` (O21 A). It is prepared locally and is not
  published by the preparation round.

## Version policy

`0.y.z` is initial development under SemVer: the public API is not declared
stable. Use a patch for fixes and narrow compatible changes, a minor for
substantial compatible work, and `1.0.0` only when stability is a real promise.
Never reuse a published version; npm does not allow overwriting one.

The candidate version must agree in `package.json`, `package-lock.json`, the
tag name if one is later created, and the release notes.

## Candidate gates

All of these run before the candidate is called ready:

1. `bun scripts/check-claims.ts` — the outside claims are current.
2. `npm run check:offline` — typecheck plus the offline suite.
3. `bash scripts/repro.sh` — rebuild from the committed lockfile and print
   `PASS` against the hash in `provenance.md`.
4. `npm pack` inspection — required files present; no scratch, tests, evidence
   tarballs, `.env*`, `.git`, or owner-modified files.
5. Isolated install and import from the packed tarball, outside this checkout.
6. The Windows sentence stays best-effort unless a named desktop result exists.
7. `git diff --check`; the only unstaged file is the owner's integration file.

A green suite is necessary, not sufficient. It does not exercise the publish
workflow, the registry, or a model turn.

## Publish flow

The workflow uses GitHub OIDC trusted publishing, so no long-lived npm token is
stored. Under O22 A the flow is:

1. CI checks out the candidate, runs the gates, then runs `npm stage publish`.
2. The owner reviews the staged tarball and approves with 2FA, either with
   `npm stage approve` or on npmjs.com.
3. Only then does the version become public.

Staged publishing requires npm CLI 11.15.0+. The workflow pins `npm@11.19.1`
before `npm ci` so the runner does not depend on the bundled CLI. The trusted
publisher should be configured as **stage-only**; that setting is owner-side,
not repo-side, and rejects a direct `npm publish` from the workflow. The
workflow change does not publish anything until the owner dispatches it.

If the stage cannot be approved, reject it. A staged package is not a registry
version and does not need a rollback.

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

## Evidence

- [`provenance.md`](provenance.md) — build hash, toolchain, and what the record
  does not prove.
- [`platform-support.md`](platform-support.md) — per-surface platform claims and
  their runs.
- [`evidence-audit.md`](evidence-audit.md) — where the record is thinner than a
  decision.
- [`../CHANGELOG.md`](../CHANGELOG.md) — user-visible changes.
