# Round 9 — execution prompt

Paste this as the first message of a fresh session in
`~/repos/opencode-plugin-muse`. It is self-contained; nothing here depends on the
conversation that wrote it.

---

Execute round 9 of `~/repos/opencode-plugin-muse` per `docs/round-9-plan.md`,
phases S0→S9, in order, one phase at a time. Round 8 ended at `89e8e2b` with the
suite at 380 pass / 0 fail / 985 expect / 37 files, and **round 8's work is
uncommitted**: `README.md`, `docs/decision-coverage.md`,
`docs/decision-evidence.md`, `scripts/doctor.ts`, `src/host.ts`,
`test/doctor.test.ts`, plus untracked `docs/round-8-plan.md` and
`docs/round-8-prompt.md`. Read the plan first — §3 holds the evidence already
collected and must not be re-derived.

**Rules, unchanged from round 8.** `bun run check:offline` after every phase and
it stays green; never weaken or delete an assertion; a new test file goes in the
explicit `test:offline` list; Muse CLI work runs under `zsh -lc`, never `bash -lc`;
no `muse acp`, no push, no tag, no publish, no new dependencies; scratch probes go
in the gitignored `scratch/`. All experiments are pre-approved (owner,
2026-11-23), with paid turns bounded at **two** (E-D44's success path, E-D50).
`docs/integration-landscape.md` is the owner's uncommitted edit — read it, never
edit it, never stage it.

**What this round is.** Two findings, one shape. First, the five failed E-D41
runs left `scratch/e-d41/run-2.err` (61 KB) unread: it shows
`msg="loading plugin"` for the local path *and* the npm copy, no error, no model
call, and a process gone eight seconds later — a silent empty turn at exit 0.
Second, opencode 2.3.2 ships `policies` (`opencode.ai/docs/policies`, read
2026-11-23): binary allow/deny, "managed and organization policy outranking user
and project configuration", with `plugin.use`, `provider.use` and `tool.use`. A
denied check fails with `Blocked by configuration policy` and overrides saved
approvals; a denied plugin "is not loaded, however it was configured". That
makes the README's "a configured `deny` is the only hard stop that survives
`--auto`" wrong, and it is testable locally.

**Hypotheses are ranked in plan §4** — H1 setup throws, H2 setup works but
runtime hooks never fire headless, H3 the Muse host fails silently, H4 the two
plugin copies conflict, H5 nothing failed and the write was lost. Do not pick one
before the discriminator runs. Note the trap: `void
appendLedgerRow({type:"host",…})` (`src/plugin.ts:391`) is a floating promise,
so a missing `usage-2026-11-23.jsonl` does **not** prove setup failed.

**What each phase produces.**

- **S0** — re-read `scratch/e-d41/run-2.err`: confirm the `cli starting` line,
  the three `loading plugin` lines, the absence of `ERROR`/`WARN`, and the
  watcher-stop timing; note the ledger gap and why it is not proof. Paste the
  excerpts into `docs/decision-evidence.md` under `## Round 9 — what the user
  cannot see`.
- **S1** — E-D43: temporary synchronous `console.error` markers in
  `src/plugin.ts` at setup entry and after each registration block (provider
  transform, aisdk hook, session hooks, ledger append); one scripted turn; record
  the last marker reached, then **revert the markers** and confirm
  `git diff src/plugin.ts` is empty. E-D45: a scratch plugin under `scratch/`
  exporting a provider whose `aisdk` hook returns a canned language model with no
  network; one scripted run; does the canned text reach stdout? These two decide
  H1/H2 versus H3.
- **S2** — E-D44: copy `~/.config/opencode` into a temp directory, keep only the
  local plugin entry, and run with `XDG_CONFIG_HOME` pointed there. **Never edit
  the real global config.** If the turn produces tokens, H4 is the cause.
- **S3** — E-D46: run the failing case with `--print-logs --log-level DEBUG`;
  capture exit code, stdout, stderr, the session record and whether a ledger row
  lands beside a synchronous marker. This names D43's shape.
- **S4** — implement D42's branch from plan §5 (and D43/D44 if the evidence
  names them). Tests go beside the existing ones; the suite stays green.
- **S5** — E-D47, E-D48, E-D49: three temp-config denials, one at a time —
  `plugin.use` on the local path, `provider.use` on `muse`, `tool.use` on
  `opencode_bash`. Record what is printed, what the catalog shows, what a request
  does, and whether the turn survives. E-D49 is the one paid turn here.
- **S6** — D45/D46 documentation: correct the README hard-stop sentence, add the
  coverage rows (headless, the three denials, duplicate install), restate the
  counts, add the policy line to `docs/compatibility.md` if the denials confirm
  on 2.3.2.
- **S7** — E-D50 **only if** S1–S3 produced a working headless turn: retry
  E-D41's shape with `agent.build.steps: 1` and settle D39's second sentence.
  Otherwise leave it unmeasured and say so.
- **S8** — finish the evidence section with raw output for every experiment, then
  re-run the suite.
- **S9** — stop and report: one line per decision (D42–D47) and per experiment
  (E-D43–E-D50), the suite result, the six product choices from plan §8 with your
  recommendation on each, and ask before committing. Nothing is committed or
  pushed before that answer.

**Do not** edit the user's global `~/.config/opencode`, leave temporary markers
in `src/`, claim anything about a Console-delivered policy (no workspace here),
claim Muse's managed-policy channel is observable (E-D39 settled that it is not),
or turn a harness bug into a plugin error without saying so. If an experiment
cannot observe the thing it was meant to observe, record the limitation and keep
the branch undecided rather than picking the tidier answer.

**Output discipline.** Every experiment writes raw output to
`scratch/round-9/<ref>.log` and a short summary to `docs/decision-evidence.md`.
The plan's §10 table is the state: tick a phase as it closes, in the same edit
that finishes it.
