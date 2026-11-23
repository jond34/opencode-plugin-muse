# Round 21 execution prompt

You are executing round 21 in `~/repos/opencode-plugin-muse`. This prompt is
self-contained; the external state is in:

- `docs/round-21-research.md` — evidence E-R21-01–E-R21-17 and the corrections
  to the round-20 records.
- `docs/round-21-plan.md` — decisions D124–D132, experiments E1–E9, product
  choices Q15–Q20, confidence conditions, and gates.

Read both before touching anything. Do not rely on chat memory. If this prompt
and the plan disagree, the plan wins; if the plan and a primary source disagree,
stop and report.

## Carry-forward from round 20

Round 20 reported: the platform matrix was not dispatched; macOS and Windows
were unmeasured; the Console-delivered `policies` half was unobservable; a
direct `opencode.im` check found no listing (`/plugin/opencode-plugin-muse` is
404 and site search has no hit). Round 21 does not repeat those as conclusions.
It tests the assumptions behind them:

- Windows is likely a spawn defect (`muse.cmd` + Node `spawn` without a shell),
  not merely an unmeasured platform.
- `awesome-opencode` is hard-blocked by a 25-star and 30-day rule; the repo has
  one star and is five days old.
- opencode 2.4.1 shipped after the 2.3.2 snapshot; a re-baseline is needed.
- Console policy precedence is documented, but no source attribution exists yet.

## Hard rules

- No push, tag or publish. No `muse acp`. No new project dependency. Never write
  the host's log. Scratch stays in `scratch/`.
- `docs/integration-landscape.md` is the owner's edit: never stage it.
- Commits only after the owner says go. This prompt ends at a report and a
  proposed commit sequence.
- Public actions — the `opencode.im` submission, the `awesome-opencode` PR, a
  branch push, a tag, a publish — are owner-gated even though the owner approved
  experiments. Prepare them; do not submit or push.
- Use `zsh -lc` for harness CLIs and keys, never `bash -lc`.
- Every new claim carries an E-id or a source. Do not say "Windows supported",
  "parity", or "the matrix proves the seam".
- If a check disagrees with the research, stop and report; do not edit the
  expectation.

## Phase 0 — baseline

```bash
cd ~/repos/opencode-plugin-muse
git status -sb
git log --oneline -3
opencode --version
muse --version
bun --version
```

Confirm HEAD is `631e9a2` or later. If `docs/integration-landscape.md` is
modified, leave it alone. If `src/` is dirty, stop and report; this round starts
from a clean tracked tree except for that owner edit.

## Phase 1 — correct the proven records (no host needed)

Do S1–S6 in `docs/round-21-plan.md`:

1. `docs/ecosystem.md`: replace the README `<details>` block with the YAML
   shape; add the 25-star/30-day rule; state no `opencode.im` listing found;
   submit via the form; `awesome-opencode` deferred; `opendock` verify-only;
   bare domain does not resolve, `www` does; ACP Registry still agents-only.
2. `docs/platform-support.md`: spawn row "likely `spawn EINVAL` until the
   native `muse-bin-*.exe` is resolved"; SDK Windows child-only close and
   orphan risk; UAC/persistent accounts (#138); matrix proves fixtures, not the
   seam; no parity claim.
3. `docs/policy-remote.md`: replace `config status --json` with
   `opencode debug config`; note `document` + `directory` sources and no Console
   source on this machine; add the six-level precedence table and Console
   fetch/outage behavior; keep "local H, remote unobservable, no probe".
4. `README.md`: "tested on 2.3.2; 2.4.1 is installed, loads, and its limit read
   is pending" until E1 passes; add the Console "may apply, not visible" sentence.
5. `docs/decision-coverage.md`: update the platform and policy basis cells;
   keep both rows P; do not change the counts; preserve the owner's U16→P and
   85/85 edits.
6. `docs/watchlist.md`: create the table (surface, snapshot, last checked,
   trigger, action) with rows for opencode host/plugin API, `canonical`/PR
   #59880, `policies`/#60252, Muse SDK/MSP, `muse acp`, platform hosts,
   discovery listings.

Do not rewrite the round-20 audit or the owner's `integration-landscape.md`.

## Phase 2 — E1, re-baseline on the installed opencode 2.4.1 (local)

The owner updated the installed host to 2.4.1 during the round. Follow
`docs/round-21-plan.md` §E1: use the installed `opencode` binary with isolated
`XDG_*` directories and a temporary config that points at this checkout. Do not
install a second host and do not upgrade anything.

Record:

- `opencode --version` (expect v2.4.1);
- whether the plugin loads and `muse/*` appears in `opencode models --standalone`;
- whether `opencode api get /api/model --standalone` returns data (it returns
  `{"data":[]}` on 2.4.1); if empty, record "model read empty" and run
  `bun test test/contributor-models.test.ts` for the limit/canonical half;
- any new plugin-API warning; the package still pins `@opencode/plugin` 2.3.2
  (E-R21-19), so record compatibility but do not bump it here.

Pass: update the README sentence to "tested on 2.3.2; loads on 2.4.1; limit read
via the model record test" and record the probe in
`docs/round-21-research.md`. Fail: keep 2.3.2 as tested, record the regression,
and stop before code changes.

## Phase 3 — host probes (Windows first, then macOS)

If a Windows host is available, run E2, E3 and E4 exactly as written in the
plan. The key checks:

```powershell
Get-Command muse -All | Select-Object CommandType,Source
node -e "const{spawn}=require('child_process');const c=spawn('muse',['--version'],{stdio:'inherit'});c.on('error',e=>console.log('ERR',e.code,e.message));"
Get-ChildItem "$env:LOCALAPPDATA\Programs\muse" | Select-Object Name
```

Then the native exe, the `muse serve` handshake, close, and the process table
before/after. Record the exact tree and exit code. For E4, run `bun run doctor`,
`muse sandbox windows check`, and `icacls` on the ledger.

If a macOS host is available, run E5: `bun run check:offline`, `bun run doctor`,
spawn `muse serve`, inspect the ledger mode, close, check `ps`.

If a host is not available, record "blocked: no Windows host" or "blocked: no
macOS host" in the research doc. Do not invent a result and do not write a
support claim.

## Phase 4 — E6, Console policy visibility (owner-assisted)

If the owner can add one harmless policy to a Console workspace, run:

```bash
opencode auth list
opencode debug config --standalone |
  jq -c '.[] | {type, path, policies: (.info.policies // null)}'
```

Compare before and after. Print only `type`, `path` and `policies`; no
credentials or provider settings. If the policy appears with a source the
doctor can name, add the doctor clause and the docs sentence. If it does not,
record "no source attribution" and keep D127. Do not add a deny-by-effect probe.

If no Console workspace is available, record "blocked: no Console policy
change" and stop this phase.

## Phase 5 — discovery (owner-gated)

- **`opencode.im`:** prepare the submission text for
  `@jonathand34/opencode-plugin-muse`; point the owner at
  <https://opencode.im/submit>. Do not submit without the owner's explicit go.
  After approval, record the timestamp and recheck the direct slug and
  `?search=muse` at 24 hours and 7 days.
- **`awesome-opencode`:** do not submit. Check
  `gh repo view jond34/opencode-plugin-muse --json stargazerCount,createdAt`
  and record the gate. The earliest date is 2026-12-18; the star count must be
  at least 25. Keep the YAML draft in the plan ready.
- **`opendock.net`:** verify only. Check the direct slug and
  `https://www.opendock.net/plugins?search=muse`. No submission.

## Phase 6 — conditional code (only if E2/E3 show the defect)

If E2 confirms `EINVAL` for `muse` and the native exe works, implement the
resolver in `src/host.ts`:

- prefer `MUSE_BIN`;
- on `win32`, resolve `muse-bin-*.exe` next to `muse.cmd`/`muse`;
- fall back to `muse` on POSIX;
- do not add `shell: true`;
- unit-test the resolver with injected platform, env and directory listing;
- do not claim Windows support until a host passes E2/E3.

If E3 shows an orphan, add the smallest Windows tree-kill wrapper, with a unit
test for exit codes 0/128/255 and a host test that checks the process table.
If neither is confirmed, do not change runtime code.

## Phase 7 — verify

Run the checks that match the changes:

```bash
bun run check:offline          # if code or tests changed
git diff --check
grep -n "opencode.im\|awesome-opencode\|25 stars\|30 days" docs/ecosystem.md
grep -n "EINVAL\|muse-bin\|child-only\|#138\|UAC" docs/platform-support.md
grep -n "debug config\|precedence\|Console\|60252" docs/policy-remote.md
grep -n "2.4.1\|2.3.2\|Console" README.md
git status -s
```

Record the actual test count; do not hardcode 418. If only docs changed, say so
and do not claim the suite was rerun.

## Phase 8 — report and commit gate

Report:

- E1 result: 2.4.1 pass/fail, with the model limit and `canonical`;
- E2–E6: pass/fail/blocked, with the host and exact evidence;
- discovery: no listing / submitted / deferred, with dates;
- files changed and checks run;
- limitations: no host, no Console, no push, no public submission;
- the proposed commit sequence.

Do not commit until the owner says go. Suggested sequence:

1. `Correct the platform, policy, and discovery records`
2. `Re-baseline the plugin on opencode 2.4.1` (if E1 ran)
3. `Resolve the Windows Muse binary and reap the process tree` (only if code)
4. `Record the Console policy probe` (only if E6 ran)

Never stage `docs/integration-landscape.md`. No push, tag or publish.

## Decision mapping

| Result | Action |
|---|---|
| E1 pass | README says 2.3.2 + 2.4.1; record the probe. |
| E1 fail | Keep 2.3.2; file the regression; no code. |
| E2 `EINVAL` + exe works | Implement the resolver; unit tests; no support claim yet. |
| E2 `muse` works | No resolver; document the actual path. |
| E3 orphan | Tree-kill wrapper or upstream; host test. |
| E3 clean | No code; record Windows close as tested. |
| E4 ACL/UAC | Docs + doctor note; no block. |
| E5 pass/fail | Update the platform table with the host result. |
| E6 source found | Doctor clause + docs; no probe. |
| E6 no source | Keep "may apply, not visible". |
| E7 listing | Record the listing; update `docs/ecosystem.md`. |
| E7 no response | "No listing found"; not "rejected". |
| E8 gate unmet | Defer; no PR; no star gaming. |

## Stop conditions

Stop and report, without editing the expectation, if:

- the 2.4.1 plugin does not load or the limits change;
- Windows `muse` is spawnable and the resolver hypothesis is wrong;
- a Windows close leaves an orphan and the wrapper would need a broad shell;
- a Console policy appears but cannot be attributed to a source;
- a check contradicts `docs/round-21-research.md`;
- the owner has not approved a public action.
