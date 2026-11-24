# Provenance record

## What was verified

The published npm tarball for `@rasyid_rafi/opencode-muse@0.1.9` is reproduced
byte for byte by the base tree recorded below plus patches 1 and 2.

1. `src/` from the base tree plus patches 1 and 2 is identical to the `src/`
   shipped in the published tarball: 21 files, zero differences.
2. Building that tree with the toolchain below produces a `dist/` identical to
   the published `dist/`: 84 files, zero differences.
3. The two patch files in `evidence/` regenerate the patched files from upstream's.

This repository's current tree adds patch 3 (containment), patch 4
(harness-owned context), and patch 5 (effort, prompt, and rewritten-history
boundaries), which no published tarball carries. Its build is recorded separately
below; the 0.1.9 identity check above applies to the tree before those patches.

## Canonical build hash

```bash
cd <package> && find dist -type f | sort | xargs sha256sum | sha256sum
```

Published 0.1.9 (base + patches 1-2):

```text
b90a36974cfeaf2957bec91a687546ba850adf5a0dc94d6eb95b60ebb0f040c3
```

84 files, reproduced by `bash scripts/repro.sh` on the tree before patch 3.

0.1.13 local candidate (base + patches 1-5), not published:

```text
3470ecc97c98ef8358aaf77dbea767cebd1824542762ae0fef50713f46d3a120
```

160 files, built from the committed lockfile with node v24.22.1, npm 11.19.1, and
tsc 5.9.3. `bash scripts/repro.sh` compares the rebuilt `dist/` against this
hash. The candidate is local only: the latest npm tarball is 0.1.12, patches 3–5
exist only in this checkout, and publishing is a separate owner action (O15).

Round 30 repacked the tarball after moving four unshipped README doc links to
absolute GitHub URLs. The `dist/` hash above is unchanged. Round 31 then changed
the package to ship the built `dist/` entry only; the candidate is 165 files
with tarball SHA-256
`67c66300921138281f06ba3626ca2658f1325fde5ddc4aa3559a579e96aafd60`. The old
208-file digest remains in [`evidence/2026-11-26-r30-e51.json`](evidence/2026-11-26-r30-e51.json).
Round 33 added the advisory doctor detail, which changed `dist/` to 160 files /
`3470ecc9…`. Two independent clean builders (E64, branch B1) produced the same
`dist/` and byte-identical 165-file tarballs; the record is
[`evidence/2026-11-26-r33-e64.json`](evidence/2026-11-26-r33-e64.json).

Historical tree (base + patches 1-5) at `bcfabcb`, not published:

```text
d2d50a429436ec085bc1fa107073e0489e2864bad088edd4fe06b2ed608b5867
```

100 files. That hash is kept for the older record; it is not the candidate and
`repro.sh` does not compare against it.

## Inputs

| Input | Value |
| --- | --- |
| Base commit | `edb5d52f9fa6e9571cc5741bb5f3c996e63996a7` |
| Base source tarball | sha256 `8bdc3f6a3d5c6351abd97db1073dc482da34955d4f7c2e2196aec6b77838cbba` |
| Patch 1 (`events.ts`) | sha256 `2c62813874155637c8bc684ee130f1b9fb238fb8de083ff52f7dc02d9ef443c9` |
| Patch 2 (`session-registry.ts`) | sha256 `f8099ba5be47c5b0e1f7f10d35bfb24a0731f8e9a985202dc7847ef6ceca8616` |
| Patch 3 (containment) | sha256 `8a875580a279a8b963fc1962b9645e7840e0582b7058ac2f228ef33a900a5956` |
| Patch 4 (harness-owned context) | sha256 `d87bb126d265c243620297d4abb03112eecda422d228e1e9040e4caaaffc54d4` |
| Patch 5 (effort, prompt, and rewritten-history boundaries) | sha256 `8283f7f5f9b168230d9085f3cc7834971c7e1d3237ac97f40fc9c545bba74fdd` |
| Toolchain | node v24.22.1, tsc 5.9.3, npm 11.19.1 |
| Candidate | `0.1.13`, 160 files, hash `3470ecc97c98ef8358aaf77dbea767cebd1824542762ae0fef50713f46d3a120`; not published |
| Dependency graph | `package-lock.json`, 275 packages |

`evidence/` holds the raw inputs behind this record. It lives in the repository and is
not published in the npm tarball, which carries this file and the source it describes;
the hashes above are enough to check that tarball on their own.

The base tarball is not committed; fetch it by commit:

```bash
curl -sL https://codeload.github.com/rasyidrafi/opencode-muse/tar.gz/edb5d52f9fa6e9571cc5741bb5f3c996e63996a7 \
  | sha256sum   # expect 8bdc3f6a…
```

That URL records where the bytes came from. It is not a claim that the account behind it
owns the npm package, and nothing here links to that account as an author; no public
record connects the two. The check that needs no such claim is the first one above,
which compares the base plus patches 1-2 with the `src/` inside the published 0.1.9
tarball from npm.

## The patches

The base tree is 2 files / 23 changed lines ahead of the published 0.1.9 source, and no
public commit carries the published source as-is.

- `src/events.ts`: a fallback message for a session that ends without a reason.
- `src/session-registry.ts`: track a terminal error, emit an `error` part, and set
  `finishReason: {unified: "error"}` rather than returning a silent empty turn.

With those two applied, `src/` matches what users run from 0.1.9.

Patch 3 is this repository's own change and is not in any published tarball:

- `src/host-config.ts` (new): writes a private `settings.json` and links `auth.json`
  into it, so `muse serve` starts with `run.toolset` pinned to the bridge, a short
  control prompt in place of Muse's base prompt, and Muse's own compaction deferred.
- `src/plugin.ts`: starts the host with that private `XDG_CONFIG_HOME`; keeps
  `MUSE_PRESET` as an override and `empty` as the fallback when the file cannot be
  written.
- `src/session-registry.ts`: the bridge serves each session's own tool list instead of
  one registry-wide list, and cancelling a step parked on a tool call rejects the call
  and interrupts the native turn.
- `src/language-model.ts`, `src/index.ts`: pass the step's tools through and export the
  new module.

Patch 4 makes opencode own the context around the model, and is also unpublished:

- `src/host-config.ts`: turns Muse's skills, observer reminders, workflow triggers,
  context-usage message, context slimming, and foreign personal skills off, using the
  same settings keys as pi-muse-subscription. Skill enumeration runs
  `muse skills list --json`; any failure omits the map and leaves the control prompt as
  the fallback.
- `src/effort.ts`, `src/language-model.ts`, `src/plugin.ts`, `src/contract/adapter.ts`,
  `src/session.ts`: carries `request.model.variant` in a request header, resolves it to
  Muse's closed effort vocabulary, and sends it as `turn/start.reasoningEffort` (and
  `turn/steer`).
- `src/meta.ts`, `src/plugin.ts`: answers opencode's `title` and `compaction` hooks
  locally. Titles are 72-codepoint derivations of the first user message; compaction is
  a deterministic transcript digest, so neither spends a Muse turn.
- `src/fingerprint.ts`, `src/session-registry.ts`, `src/language-model.ts`: fingerprints
  the visible user/assistant transcript, persists it per opencode session, and
  classifies a prompt as `same`, `compacted`, or `diverged`. A rewrite recycles the
  native session and reseeds; fork-at-boundary was still deferred in this patch.
- `src/session.ts`: bridge sessions default to `approvalMode: "allowAll"`, because
  opencode's permission evaluation is the only fence and a second Muse prompt would
  double-ask.

Patch 5 finishes the boundaries left open by patch 4:

- `src/effort.ts`: `"default"` omits `reasoningEffort` instead of guessing the
  catalog default; a known tier the model does not offer now fails closed instead of
  falling to its lowest tier; the unused catalog default field is gone.
- `src/language-model.ts`: a primary request with no bridge tools fails with an
  actionable error before `session/start`, because Muse's `run.toolset` wildcard
  cannot resolve zero tools. A `diverged` or `compacted` transcript still retires the
  native session and reseeds from the full prompt.
- `src/session.ts`, `src/adapter.ts`, `src/session-registry.ts`: carries
  `museAgent` + `museInstructions` as `SessionConfig.developerPrompt` on start and
  resume, so the first user turn is not prefixed.
- `src/host-config.ts`, `src/plugin.ts`: reports whether skill enumeration was
  enumerated, empty, or failed, and warns when the control prompt is the only
  remaining skill fence.

The containment behavior was measured on Muse CLI 1.4.23 before it was written:
`run.toolset` is honoured only from `settings.json`, `-c run.toolset=…` and `[]` are
ignored, and `preset: "empty"` leaves the user's own Muse MCP servers live. The
experiment rows are in `scratch/toolset-results.md`, which is not committed.

Patch 5's live probes used the same CLI. `config.developerPrompt` was accepted on
`session/start` and `session/resume`, and the model followed it. A native
`session/fork` at a completed turn could be made to work by leaving the fresh child
(`stop: true`) and resuming it with the source's `config`, but the token measurement in
`evidence/measurements.md` showed 2.4x the fresh input and 1.9x the total input of a
reseed in all five production-shaped reps, and 2.7x / 1.9x in a tool-call workload.
The fork path was removed; rewritten histories reseed.

## Conformance audit, 2026-11-22

One run, not a gate: `check:offline` does not include it and no workflow runs it.

`bun test test/conformance.test.ts` against a real `muse serve` (Muse Code 1.4.25):
1 passed, 0 failed, 3 expect calls, 11.5 s. The shared driver provides only
`startSimpleTurn`, so the scenarios that were recorded:

| Scenario | Result |
|---|---|
| capabilities shape | passed |
| open session | passed |
| simple turn | passed |
| close | passed |
| interrupt turn | skipped — the driver has no `startLongTurn` |
| approval request | skipped — the driver has no `startApprovalTurn` |
| tool bridge | skipped — no bridge was passed to the runner |

The intended step was a replay of the vendor transcript corpus under
`schema/msp/`. That corpus is not in this tree, and the published
`@muse-code/sdk@1.4.24` ships only `dist/src` (`files` in its manifest; no
schemas, fixtures, or transcripts). It does exist in the SDK's source repository:
`schema/msp/transcripts/<scenario>/transcript.ndjson` under
`meta-models/muse-code-sdk` at commit `fbce769ccb75ab971d00e01a00fe076de4c773fc`
(HTTP 200 for `schema/msp/msp.d.ts` and for
`goal-set-round-trip/transcript.ndjson` on 2026-11-22). The CLI exports the wire
schema (`muse schema generate-json-schema`) and can export a user's own session
(`muse export`), but exposes no transcript corpus. So the replay
was not run: what ran is scaffolding for that input — the harness conformance suite
exercises the adapter's own contract against a real host, which a replay harness
would reuse, but it is not transcript parity and is not recorded as such.

## What this does not prove

- **One reproducer.** A reproducible build is a property of verification, and
  independent verification requires two or more separate builders. This record is from
  a single machine and toolchain. Anyone can re-run `scripts/repro.sh`; until someone
  does, treat this as locally reproducible; independent rebuild pending.
- **Nothing about source authorship.** The build hash shows the artifact corresponds
  to this source. It says nothing about whether the source is safe, and nothing about
  who wrote upstream's code. Upstream has no verified npm-to-GitHub identity link.
- **Nothing about dependencies.** Reproducibility does not address dependency,
  distribution, or install-time threats. `postinstall` scripts in the dependency tree
  run regardless of whether the build is reproducible.
- **Not a security audit.** A review of 0.1.9 found no exfiltration, no filesystem
  writes, no dynamic evaluation, and only loopback network use, but that is a reading
  of the code at one moment, not a guarantee.
