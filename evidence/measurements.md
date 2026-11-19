# Measurements

Raw inputs and numbers behind `../docs/provenance.md`.

## Published artifact under test

`@rasyid_rafi/opencode-muse@0.1.9`, published 2026-11-16T04:42:21Z.

## Recorded values

| Item | Value |
| --- | --- |
| Base commit | `edb5d52f9fa6e9571cc5741bb5f3c996e63996a7` |
| Base tarball sha256 | `8bdc3f6a3d5c6351abd97db1073dc482da34955d4f7c2e2196aec6b77838cbba` |
| `p1.diff` sha256 | `2c62813874155637c8bc684ee130f1b9fb238fb8de083ff52f7dc02d9ef443c9` |
| `p2.diff` sha256 | `f8099ba5be47c5b0e1f7f10d35bfb24a0731f8e9a985202dc7847ef6ceca8616` |
| `p5.diff` sha256 | `2985504b5c714ad6068fe573cdbb7ba355c7d07b3f1924038bb2dc4b2435ec10` |
| src files compared | 21, zero differences |
| dist files compared | 84, zero differences |
| dist hash (rebuild and published) | `b90a36974cfeaf2957bec91a687546ba850adf5a0dc94d6eb95b60ebb0f040c3` |
| current dist hash (patches 1-5) | `327a5a89235edf56dbe469a15d94f9f97d4733bdb0ff066e5a55eed7f78edb51` |
| current dist files | 100 |
| Rebuild toolchain | node v24.22.1, tsc 5.9.3, npm 11.19.1 |
| Installed packages | 275 |

## npm metadata observations

- `dist.signatures: true`, `dist.attestations: false`; the attestations endpoint
  returns 404 for version 0.1.9.
- Publisher: npm user `rasyid_rafi` (contact address withheld).
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

## Patch 5 live probes

Run on Muse CLI 1.4.23 with a private `settings.json`, a loopback bridge, and a
logged-in CLI.

- `config.developerPrompt` was accepted on `session/start` and `session/resume`.
  A turn asking for the developer instruction answered with the injected word
  `pineapple`, so the lane is active, not merely tolerated.
- `session/fork` with `cutPoint.lastTurnId` pointing at the first of two completed
  turns returned a child with `forkedFrom.cutCursor` through turn 1. The fresh child's
  first turn failed with `invalid run configuration: unknown tool
  \`mcp__opencode__*\`` because the child had no bridge. `session/leave` with
  `stop: true`, followed by `session/resume` with the source `config`, reattached the
  bridge; the child then completed a turn. The source completed a turn after the fork,
  and the production path also completed a child turn after retiring the source.
- A `session/resume` immediately after fork, before the leave completed, was rejected
  with `session MCP configuration conflicts with the loaded session runtime`; the
  implementation waits by retrying the resume.
