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
harness is `scratch/fork-tokens.ts`; it is not committed. Only the turn after the cut
is compared. `freshInput` is `inputTokens - cachedInputTokens - cacheWriteTokens`.

### Production shape: a rewritten turn

Four reps each ran five source turns (~17k characters of visible transcript before
the rewrite). The fifth turn was then rewritten away, the fork cut at turn four, and
the replacement question answered twice:

- **fork:** the child held turns one through four and received only the replacement
  question.
- **reseed:** a fresh native session received `fullConversationText()` of the system
  prompt, turns one through four, and the replacement question, which is what
  production does after a rewritten history.

| Rep | Fork input (total / fresh / cached) | Reseed input (total / fresh / cached) |
| --- | --- | --- |
| 1 | 7,300 / 7,300 / 0 | 4,926 / 3,405 / 1,521 |
| 2 | 5,831 / 5,831 / 0 | 4,978 / 3,457 / 1,521 |
| 3 | 9,490 / 8,737 / 753 | 4,906 / 3,385 / 1,521 |
| 4 | 6,762 / 6,762 / 0 | 4,966 / 4,966 / 0 |

Medians: fork `freshInput` 7,031 and total input 7,031; reseed `freshInput` 3,431 and
total input 4,946. Fork used 2.0x the fresh input and 1.4x the total input, won 0 of 4
reps, and wrote no cache entries. The pre-registered rule required at least 4 valid
reps, a 20% lower median `freshInput`, total input within 2%, no higher cache writes,
and at least 3 of 4 reps lower. Every validity check passed (all turns completed, the
canary code word survived in both arms, no tool calls), and the win rule failed.

The children's input tracked the source's context at the cut (7,541, 6,107, 8,925, and
6,999 tokens), while the reseed's fresh input was 3,405-4,966 tokens. The native
context carries items that `fullConversationText()` does not.

### What this does and does not cover

`SessionForkParams` carries only `commandId`, `cutPoint`, `excludeItems`, and
`sessionId`; `excludeItems` only skips inline history in the result. There is no
cache-preservation option to enable. A cache-scope preflight sent the same 1,200-word
text to two fresh sessions in a row; the second reported `cachedInputTokens: 0`, so the
provider cache did not carry across session ids here.

A first run measured a continuation instead: the source turns were kept whole, the fork
cut at the last turn, and a new question was added. Production classifies an appended
prompt as `same` and never forks there, so that shape is not the trigger. It is kept in
`scratch/fork-tokens-append.json`; it showed 2.4x the fresh input and 1.7x the total
input, the same direction with a larger margin. The rewrite shape above is the one that
matches the production branch.

A three-turn dry run that cut at turn two (a smaller retained prefix) also lost 2.0x.
The newest possible cut is the best case for reuse; the earlier cut did not reverse it.

Consequence: the production fork path and its tests were reverted. A rewritten history
reseeds from `fullConversationText()`; there is no native-fork branch.
