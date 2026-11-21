# Native history: what was measured

`MUSE_NATIVE_HISTORY=1` installs a native compaction window instead of reseeding
the whole transcript. The default is off. This page states what the measurements
show, how they were taken, and what they do not settle. It is the published
summary; the preregistration, the gate scripts and every per-session result are
kept with the project rather than shipped in the package, and are named at the
end.

## What is claimed

- **The mechanism works.** Ten sessions with the flag on: 5/5 old-arm sessions
  reseeded after compaction and 0/5 new-arm sessions did. The old arm started a new
  native session per session; the new arm kept one throughout. That is a mechanism
  result, not a recall result: in that smoke test the canary sat inside the digest
  and the old summary, and the final question asked for facts the digest already
  held, so an arm could pass without the window carrying anything.
- **Gate A, out of window.** The vault code was placed past the digest's per-entry
  clip and outside the retained window, with a control word inside the digest. Pilot:
  one old-arm control session recalled the control (1/1) and not the vault (0/1), and
  reseeded; the new arm recalled both 5/5, with one native row each and no reseed.
  Frozen confirmatory run from `bcfabcb`: old arm (5 sessions) recalled the vault 0/5
  and the control 4/5 and reseeded 5/5; new arm (5) recalled both 5/5, with one
  native row and no reseed each. The old arm missing the vault while keeping the
  control is what shows the probe sat outside the digest.
- **Gate B, reliability.** 29 further new-arm sessions in the same frozen run:
  vault 29/29, control 29/29, 0 failures. The exact one-sided 95% upper bound on the
  miss rate at zero failures out of 29 is 9.81%. That is a bound on the rate, not a
  claim that the rate is zero, and the sample size was fixed before the run rather
  than computed after it.
- **The fallback is real.** A model switch, a dropped window, a refused resume or
  a mid-turn compaction still has the digest, which is the same text used as the
  summary. The native session is a cache; nothing treats the native id as the
  authority.

## How it was measured

Two arms, `old` and `new`, run against the same task with the same prompt shape:

- an **out-of-window vault code** that only a surviving native window can carry;
- a **control word** inside the digest, which both arms must retain;
- pre-specified validity checks, applied before a session counts: the turn
  completed, the session export was available, the native id did not change, the
  vault code was absent from the digest, and the control was present;
- intent-to-treat counting: an invalid session is a failure, not a retry;
- an analyzer that recomputes each verdict from the raw artifacts and prints the
  recorded `verdict` beside it; the recomputed value is the one that counts.

The frozen run used opencode 2.3.2, Muse CLI 1.4.24 and `@muse-code/sdk` 1.4.15.
The analyzer, gate and host launcher are pinned by sha256 in the preregistration,
and those pins refer to the run that produced them.

## What it does not show

- **No value in the billed unit.** `muse usage` is the only meter and it reports
  account-wide percentages that a single turn does not move. No number in the unit
  the subscription charges has been attributed to this flag, and it stays opt-in by
  policy rather than pending one.
- **No attribution from the later sweep.** A 44-turn sweep summed tokens while
  excluding the summarizer call, which is the cost the flag exists to avoid, so it
  cannot settle value in either direction. Treat it as open.
- **No recall claim from the smoke test.** The canary was inside the digest and the
  old summary, so those ten sessions say nothing about what the window carried. Gate
  A's vault code is the recall evidence, and it is five sessions per arm plus the 29
  reliability sessions, not thirty-nine independent ones.
- **One machine, one toolchain, one operator.** Gate A and Gate B ran on a single
  host with one CLI version. Reproducing them elsewhere is the check that has not
  been done.
- **Nothing about your account.** The measurements say what the plugin's session
  handling does. They say nothing about which credential the CLI spends, which is
  not visible from inside the process.

## Where the rest of it is

Kept with the project, not in this package:

- `bench/prereg/native-history.md` — the preregistration: arms, validity checks,
  decision rule, pinned versions, and the hashes.
- `scripts/native-history-gate.zsh` — the gate that drives a real opencode server.
- `scripts/native-history-analyze.zsh` — the analyzer that recomputes verdicts.
- `scripts/native-history-server.zsh` — the isolated host launcher.
- `bench/execution-log.md` — the append-only ledger, one row per step.
- `bench/decision-plan.md` — the W0-W5 gate record and the decisions taken.

The pinned hashes describe the run, not the current tree: the scripts changed
after the frozen run, and the bytes that produced the pinned hashes are not
recoverable. The results keep the hashes that produced them, which is why they do
not match `sha256sum` today. The scripts are version-controlled from this release
onwards so that future runs stay checkable.
