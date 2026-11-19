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
| `p5.diff` sha256 | `8283f7f5f9b168230d9085f3cc7834971c7e1d3237ac97f40fc9c545bba74fdd` |
| src files compared | 21, zero differences |
| dist files compared | 84, zero differences |
| dist hash (rebuild and published) | `b90a36974cfeaf2957bec91a687546ba850adf5a0dc94d6eb95b60ebb0f040c3` |
| current dist hash (patches 1-5) | `d2d50a429436ec085bc1fa107073e0489e2864bad088edd4fe06b2ed608b5867` |
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

## Fork versus reseed token measurement

Run on 2026-11-18 against Muse CLI 1.4.23 with `muse-spark-1.3`, the provider's
default effort, and the same developer prompt and one bridge tool in both arms. The
harness is `scratch/fork-tokens.ts`; it is not committed. Each of four reps ran five
completed source turns (~20-21k characters of visible transcript), forked at the last
completed turn, and answered one divergent question twice:

- **fork:** the forked child received only the new question.
- **reseed:** a fresh native session received `fullConversationText()` of the same
  system prompt, source turns, and question, which is what production does after a
  rewritten history.

The measured turn is the divergent answer only. `freshInput` is
`inputTokens - cachedInputTokens - cacheWriteTokens`.

| Rep | Source final input | Fork input (total / fresh / cached) | Reseed input (total / fresh / cached) |
| --- | --- | --- | --- |
| 1 | 9,960 (8,433 cached) | 10,378 / 10,378 / 0 | 5,472 / 3,951 / 1,521 |
| 2 | 11,349 (9,457 cached) | 12,034 / 12,034 / 0 | 5,836 / 5,836 / 0 |
| 3 | 9,243 (7,665 cached) | 9,605 / 9,605 / 0 | 5,677 / 4,156 / 1,521 |
| 4 | 9,230 (7,537 cached) | 9,603 / 9,603 / 0 | 5,808 / 4,287 / 1,521 |

Medians: fork `freshInput` 9,991.5 and total input 9,991.5; reseed `freshInput`
4,221.5 and total input 5,742.5. Fork used 2.4x the fresh input and 1.7x the total
input, won 0 of 4 reps, and wrote no cache entries. The pre-registered rule required at
least 4 valid reps, a 20% lower median `freshInput`, total input within 2%, no higher
cache writes, and at least 3 of 4 reps lower. Every validity check passed (all turns
completed, the canary code word survived in both arms, no tool calls), and the win rule
failed.

A cache-scope preflight sent the same 1,200-word text to two fresh sessions in a row;
the second reported `cachedInputTokens: 0`, so the provider cache did not carry across
session ids here. The fork child also reported 0 cached input in all four reps: the
leave/resume fork starts cold. It carries the source's full native context, which
measured 9,230-11,349 input tokens on the final source turn, while the reseeded text
measured 5,472-5,836. The fork is larger, not a cached version of the reseed.

Consequence: the production fork path and its tests were reverted. A rewritten history
reseeds from `fullConversationText()`; there is no native-fork branch.
