# Measurements

Raw inputs and numbers behind `../docs/provenance.md`.

## Published artifact under test

`@rasyid_rafi/opencode-muse@0.1.9`, published 2026-11-16T04:42:21Z.

## Recorded values

| Item | Value |
| --- | --- |
| Base commit | `edb5d52f9fa6e9571cc5741bb5f3c996e63996a7` |
| Base tarball sha256 | `8bdc3f6a3d5c6351abd97db1073dc482da34955d4f7c2e2196aec6b77838cbba` |
| `p1.diff` sha256 | `90a0fa6f72e06dcc1dc52ca940380b7b0825d2b2cf2c7eaca4ce8fed4fadf954` |
| `p2.diff` sha256 | `d756be32fe1c33dfcd07dd3d6b9298cb1832c791d4b0ddc1386e55732d05c907` |
| src files compared | 21, zero differences |
| dist files compared | 84, zero differences |
| dist hash (rebuild and published) | `b90a36974cfeaf2957bec91a687546ba850adf5a0dc94d6eb95b60ebb0f040c3` |
| Rebuild toolchain | node v24.22.1, tsc 5.9.3, npm 11.19.1 |
| Installed packages | 275 |

## npm metadata observations

- `dist.signatures: true`, `dist.attestations: false`; the attestations endpoint
  returns 404 for version 0.1.9.
- Publisher: `rasyid_rafi <muhammand.rafi25@gmail.com>`.
- No `repository` field in the published `package.json`; no verified npm-to-GitHub
  identity link. GitHub commits show `author.login: null` with an unlinked author
  address.
- No install or postinstall scripts in the package itself.

## Method

```bash
# published tree
cd node_modules/@rasyid_rafi/opencode-muse
find dist -type f | sort | xargs sha256sum | sha256sum

# rebuild
npm install && npx tsc -p tsconfig.json
find dist -type f | sort | xargs sha256sum | sha256sum
```

Both invocations produce the same hash. The hash covers file contents and relative
paths, so it is stable across machines but sensitive to added or removed files.
