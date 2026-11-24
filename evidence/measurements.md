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
harness is `scratch/fork-tokens.ts`; it is not committed. The audit runs used a
detached worktree at `1adaaac`, the last commit with `MuseHarnessSession.forkAt`; the
current tree has no fork path. Only the turn after the cut is compared. `freshInput` is `inputTokens - cachedInputTokens - cacheWriteTokens`.

### Production shape: a rewritten turn (first run, four reps)

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
reps, and reported no cache-write tokens in either arm. The pre-registered rule required
at least 4 valid reps, a 20% lower median `freshInput`, total input within 2%, no higher
cache writes, and at least 3 of 4 reps lower. Every validity check passed (all turns completed, the
canary code word survived in both arms, no tool calls), and the win rule failed.

The children's input tracked the source's context at the cut (7,541, 6,107, 8,925, and
6,999 tokens), while the reseed's fresh input was 3,405-4,966 tokens. The native
context carries items that `fullConversationText()` does not.

### Five-rep confirmation and audit

A fresh five-rep run of the same production shape (cut four of five, 500-word turns,
`muse-spark-1.3`, default effort) is now the primary result. All five reps were valid.

| Rep | Fork input (total / fresh / cached) | Reseed input (total / fresh / cached) |
| --- | --- | --- |
| 1 | 7,758 / 7,758 / 0 | 4,919 / 3,398 / 1,521 |
| 2 | 6,259 / 5,506 / 753 | 4,909 / 3,388 / 1,521 |
| 3 | 9,278 / 9,278 / 0 | 4,972 / 4,347 / 625 |
| 4 | 9,193 / 8,312 / 881 | 4,988 / 3,467 / 1,521 |
| 5 | 17,782 / 17,029 / 753 | 4,898 / 3,377 / 1,521 |

Rep 5 is an outlier because its source answers were much longer (source turn four
input 15,531), not because the arm failed. The fork child's input tracked the source's
context at the cut, while the reseed's flattened transcript stayed near 4,900 input
tokens; the native context carries reasoning and other items that
`fullConversationText()` omits.

Medians: fork `freshInput` 8,312 and total input 9,193; reseed `freshInput` 3,398 and
total input 4,919. Fork used 2.4x the fresh input and 1.9x the total input and won 0 of
5 reps. Per-rep fresh ratios were 1.63, 2.13, 2.28, 2.40, and 5.04; the median was
2.28 (paired bootstrap 95% CI 1.63-5.04). Per-rep total ratios were 1.28-3.63; the
median was 1.84 (95% CI 1.28-3.63). The exact one-sided sign test gives p=0.031 for
"fork uses more" and p=1.0 for "fork uses less." The median cache hit rate was 0.04 for
fork and 0.31 for reseed. Fork's median TTFT was 5,240 ms versus 7,397 ms, and its
median latency 5,332 ms versus 7,490 ms; that is a latency observation from five reps,
not a reason to accept the token cost.

Cut matrix (two reps each, 500-word turns): cut one 4.0x fresh / 1.7x total; cut two
2.6x / 1.4x; cut three 2.6x / 1.9x; cut four 2.4x / 1.9x (five-rep). No cut won;
earlier cuts lost more, not less.

Size matrix at cut four (two reps each): 150-word turns 5.1x fresh / 2.8x total;
500-word turns 2.4x / 1.9x; 1,500-word turns 1.5x / 1.4x. The margin shrinks as the
context grows but does not reach parity at 1,500 words; larger contexts were not run.

A reproduced three-turn run cut at turn two lost 2.8x fresh and 1.8x total (two valid
reps), consistent with the earlier unpreserved 2.0x dry run.

Tool-loop run (four reps, cut four, one `lookup` call required on every source turn):
all four valid, 0 wins, 2.7x fresh / 1.9x total. The divergent arms made no tool calls.
`fullConversationText()` drops tool results, so the reseed arm is not a perfect replay
of the source; the fork retains them. This is the closest available
production-representative workload, and the loss holds.

`muse-ember-1.0` (three reps): 0 wins, 1.6x fresh / 1.6x total, with no cache reads in
either arm. `muse-spark-1.3` at `high` effort (three reps): 0 wins, 1.3x / 1.3x, with no
reseed cache reads. The margin narrows but does not reverse.

Cost bound: for each rep with a reseed cache read, `(forkFresh - reseedFresh) /
reseedCached` is the cache-read price multiplier at which the arms tie. The median was
3.19 in the five-rep run and 3.77 in the tool-loop run; individual values ranged from
1.39 to 8.98. Cache reads are cheaper than fresh input, so the reseed wins on cost
unless a cache read costs more than about 3x a fresh token, which is implausible. No
dollar prices were available; if Muse bills by subscription quota, the token counts are
the quota cost.

Cache scope and TTL: an immediate second fresh session reading the same 1,200-word
prefix read 3,057 of 3,067 input tokens from cache. A fresh session six minutes after
the second read 0, so the TTL is under six minutes; the 12-minute probe was omitted as
redundant. Cross-session reuse is not reliable: the five-rep preflight's second request
read 0, the tool-loop preflight read 625, and the ember and high-effort preflights read
0. The earlier 2,929 read was real but not reproducible on demand. The fork child's
occasional 753-881 cached tokens and the reseed's usual 1,521 are consistent with
short-lived prefix reuse; the exact spans are not proven.

Reliability and end-to-end behavior were not measured in this audit. The removed
production fork branch had unit coverage before the revert; the native fork command was
not driven through `MuseLanguageModel.doStream` or OpenCode here. No broad answer-quality
evaluation was run; the canary code word survived in every valid rep.

The pre-registered win rule fails in every condition measured. The production fork
stays off; rewritten histories continue to reseed.

### What this does and does not cover

`SessionForkParams` carries only `commandId`, `cutPoint`, `excludeItems`, and
`sessionId`; `excludeItems` only skips inline history in the result. There is no
cache-preservation option to enable. A cache-scope preflight sent the same 1,200-word
text to two fresh sessions in a row; the second reported 2,929 cached input tokens of
3,055, so the provider cache can carry across session ids for an identical prefix; a
later preflight read 0, so the reuse is not reliable. The fork child read no cached
input in most reps and only 753-881 tokens in the rest: its native context rarely
matches a prefix an earlier request had submitted in that form. The reseed usually read
1,521 cached tokens, consistent with a reused prefix, but the exact cached span is not
proven. `cacheWriteTokens` was 0 in both arms, so the "no higher cache writes" check
does not distinguish them; cached-read share and `freshInput` are the meaningful
counters.

A first run measured a continuation instead: the source turns were kept whole, the fork
cut at the last turn, and a new question was added. Production classifies an appended
prompt as `same` and never forks there, so that shape is not the trigger. It is kept in
`scratch/fork-tokens-append.json`; it showed 2.4x the fresh input and 1.7x the total
input, the same direction with a larger margin. The rewrite shape above is the one that
matches the production branch.

A reproduced three-turn run that cut at turn two (a smaller retained prefix) lost 2.8x
fresh and 1.8x total in two valid reps, consistent with an earlier unpreserved 2.0x dry
run. The newest possible cut is the best case for reuse; the earlier cut did not reverse
it.

Consequence: the production fork path and its tests were reverted. A rewritten history
reseeds from `fullConversationText()`; there is no native-fork branch.
