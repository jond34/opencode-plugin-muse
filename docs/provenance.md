# Provenance record

## What was verified

The published npm tarball for `@rasyid_rafi/opencode-muse@0.1.9` is a byte-for-byte
build of upstream commit `edb5d52f9fa6e9571cc5741bb5f3c996e63996a7` plus the two
patches committed here.

1. `src/` in this repository (upstream import plus the patch commit) is identical to
   the `src/` shipped in the published tarball: 21 files, zero differences.
2. Building `src/` with the toolchain below produces a `dist/` identical to the
   published `dist/`: 84 files, zero differences.
3. The two patch files in `evidence/` regenerate the patched files from upstream's.

## Canonical build hash

```bash
cd <package> && find dist -type f | sort | xargs sha256sum | sha256sum
```

Result for both the rebuild and the published tree:

```text
b90a36974cfeaf2957bec91a687546ba850adf5a0dc94d6eb95b60ebb0f040c3
```

84 files. Reproduce with `bash scripts/repro.sh`.

## Inputs

| Input | Value |
| --- | --- |
| Base commit | `edb5d52f9fa6e9571cc5741bb5f3c996e63996a7` |
| Source tarball (codeload, base commit) | sha256 `8bdc3f6a3d5c6351abd97db1073dc482da34955d4f7c2e2196aec6b77838cbba` |
| Patch 1 (`events.ts`) | sha256 `90a0fa6f72e06dcc1dc52ca940380b7b0825d2b2cf2c7eaca4ce8fed4fadf954` |
| Patch 2 (`session-registry.ts`) | sha256 `d756be32fe1c33dfcd07dd3d6b9298cb1832c791d4b0ddc1386e55732d05c907` |
| Toolchain | node v24.22.1, tsc 5.9.3, npm 11.19.1 |
| Dependency graph | `package-lock.json`, 275 packages |

The upstream tarball is not committed; fetch it by commit:

```bash
curl -sL https://codeload.github.com/rasyidrafi/opencode-muse/tar.gz/edb5d52f9fa6e9571cc5741bb5f3c996e63996a7 \
  | sha256sum   # expect 8bdc3f6a…
```

## The two patches

Upstream's `master` is 2 files / 23 changed lines ahead of the published 0.1.9 source,
and the published source is not committed upstream. Both files are now identical to
the published tarball, so the fork's `src/` matches what users actually run.

- `src/events.ts`: a fallback message for a session that ends without a reason.
- `src/session-registry.ts`: track a terminal error, emit an `error` part, and set
  `finishReason: {unified: "error"}` rather than returning a silent empty turn.

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
