# Provenance record

## What was verified

The published npm tarball for `@rasyid_rafi/opencode-muse@0.1.9` is reproduced
byte for byte by the base tree recorded below plus patches 1 and 2.

1. `src/` from the base tree plus patches 1 and 2 is identical to the `src/`
   shipped in the published tarball: 21 files, zero differences.
2. Building that tree with the toolchain below produces a `dist/` identical to
   the published `dist/`: 84 files, zero differences.
3. The two patch files in `evidence/` regenerate the patched files from upstream's.

This repository's current tree adds patch 3 (containment), which no published
tarball carries. Its build is recorded separately below; the 0.1.9 identity
check above applies to the tree before patch 3.

## Canonical build hash

```bash
cd <package> && find dist -type f | sort | xargs sha256sum | sha256sum
```

Published 0.1.9 (base + patches 1-2):

```text
b90a36974cfeaf2957bec91a687546ba850adf5a0dc94d6eb95b60ebb0f040c3
```

84 files, reproduced by `bash scripts/repro.sh` on the tree before patch 3.

Current tree (base + patches 1-3), not published:

```text
1dbc91861d767840cfa61bb031a7bc6b3dfaff24bd696dd70889db7d46ee8eae
```

88 files. `bash scripts/repro.sh` checks the current tree against this hash.

## Inputs

| Input | Value |
| --- | --- |
| Base commit | `edb5d52f9fa6e9571cc5741bb5f3c996e63996a7` |
| Base source tarball | sha256 `8bdc3f6a3d5c6351abd97db1073dc482da34955d4f7c2e2196aec6b77838cbba` |
| Patch 1 (`events.ts`) | sha256 `2c62813874155637c8bc684ee130f1b9fb238fb8de083ff52f7dc02d9ef443c9` |
| Patch 2 (`session-registry.ts`) | sha256 `f8099ba5be47c5b0e1f7f10d35bfb24a0731f8e9a985202dc7847ef6ceca8616` |
| Patch 3 (containment) | sha256 `8a875580a279a8b963fc1962b9645e7840e0582b7058ac2f228ef33a900a5956` |
| Toolchain | node v24.22.1, tsc 5.9.3, npm 11.19.1 |
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

The containment behavior was measured on Muse CLI 1.4.23 before it was written:
`run.toolset` is honoured only from `settings.json`, `-c run.toolset=…` and `[]` are
ignored, and `preset: "empty"` leaves the user's own Muse MCP servers live. The
experiment rows are in `scratch/toolset-results.md`, which is not committed.

## What this does not prove

- **One reproducer.** A reproducible build is a property of verification, and
  independent verification requires two or more separate builders. This record is from
  a single machine and toolchain. Anyone can re-run `scripts/repro.sh`; until someone
  does, treat this as reproducible-in-principle.
- **Nothing about source authorship.** The build hash shows the artifact corresponds
  to this source. It says nothing about whether the source is safe, and nothing about
  who wrote upstream's code. Upstream has no verified npm-to-GitHub identity link.
- **Nothing about dependencies.** Reproducibility does not address dependency,
  distribution, or install-time threats. `postinstall` scripts in the dependency tree
  run regardless of whether the build is reproducible.
- **Not a security audit.** A review of 0.1.9 found no exfiltration, no filesystem
  writes, no dynamic evaluation, and only loopback network use, but that is a reading
  of the code at one moment, not a guarantee.
