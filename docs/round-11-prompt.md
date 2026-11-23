Execute round 11 of `~/repos/opencode-plugin-muse`.

Read `docs/round-11-plan.md` first — phases S0–S8 in §10, decisions D54–D58 in
§5, experiments in §6, prohibitions in §11. `docs/round-11-research.md` holds the
vendor quotes with URLs; use it instead of re-fetching, and add to it only if an
experiment corrects something. Work the phases in order and tick each one in the
plan's table as it closes.

HEAD is `1f5cfed`, suite green at 388 pass / 0 fail / 1002 expect / 37 files.
`docs/integration-landscape.md` is the owner's uncommitted edit — read it, never
modify or stage it.

What this round is:

1. **One documentation defect, and it is the whole round.** The README's "A hard
   stop, if you want one" recommends `policies` as the mechanism that outranks
   `--auto` and saved approvals, and prints the block a careful user copies —
   without saying the mechanism fails open. The vendor's own sentence:
   "Statements that fail validation are dropped with a warning in the server log
   and the rest of the list still applies", and "If nothing matches, the action
   is allowed." A typo is therefore indistinguishable from no policy. Add the
   clause (D54, option C): the drop, the log to check, prove the deny by its
   effect, and the managed case — `anomalyco/opencode#60252` says the remote
   decoder drops unknown actions and effects **without a diagnostic**, so on a
   Console-delivered policy there is no log line to check. Do not recommend
   strictness as the fix: `github/copilot-cli#4349` shows fail-closed blocking
   every non-built-in MCP server over one unrecognised enum value.

2. **The doctor row, if the measurement supports it (D55).** `opencode debug
   config` drops invalid statements before printing (measured 2026-11-23: three
   declared, one printed), so the row cannot read validation results. Option B
   compares what each source file declares with what `debug config` prints for
   that source; E-D59's three fixtures decide whether that count is faithful. If
   it is not, take option A and say in the evidence that the check was measured
   and declined. No new dependency: a small JSONC reader is acceptable, and it
   needs tests for comments, strings containing `//`, and `experimental.policies`.

3. **The count that round 10 left unexplained.** E-D55 counted ten `loading
   plugin` lines after one `config.updated`. The line is per plugin per
   generation, so ten loads is either ten plugins in one generation or ten
   generations — two different stories. E-D57 re-reads round 10's debug log for
   `config.updated`, `watcher started` and the distinct ids per burst, and D56
   branches on it. Fix only if E-D60 shows `setup()` is not idempotent; the fix
   would be idempotency, not the watcher. The one conditional paid turn (E-D61)
   is only for the case where the log cannot separate the readings.

4. **Two recorded planes, one sentence each.** Muse's managed policy is alive
   (1.4.13 references it) and still has no member the installed validator
   accepts; `muse --version` is 1.4.25, unchanged since round 8, so do not
   re-bisect. Console-delivered policy stays untestable here — record the remote
   decoder's silence as the fact that makes it worse than the local path, and do
   not build a doctor row that calls the connection a policy.

Budget and rules:

- Paid turns: **zero planned, one conditional** (E-D61, only if E-D57 cannot
  separate one generation from ten). Nothing else may spend one.
- Every experiment writes raw output to `scratch/round-11/<ref>.{out,err,log}`
  and a paragraph to `docs/decision-evidence.md`. State lives in files, not in
  the conversation.
- Never touch the real `~/.config/opencode`: every probe uses a temp
  `XDG_CONFIG_HOME` with `auth.json` copied in.
- Muse CLI work under `zsh -lc`, never `bash -lc`. No `muse acp`, no push, no
  tag, no publish, no new dependency.
- Temporary instrumentation in `src/` is reverted before anything is committed,
  and `git diff src/` is checked.
- The vendor docs are evidence about shape; where they disagree with the
  installed build, the build wins and the disagreement is recorded.

`bun run check:offline` must be green after every phase that touches code or
tests, and no assertion may be weakened or deleted. New test files go in the
explicit `test:offline` list.

The four product choices in §8 may still be unanswered when you start. If they
are, proceed on the recommendation stated there, and say in the final report
which ones you assumed. Do not proceed on an assumption for anything outside
that list.

Stop after S7 and report: one line per decision (D54–D58) and per experiment
(E-D57–E-D61), the suite result, which §8 choices were assumed or answered, and
anything you could not measure. Then **ask before committing**. Nothing is
committed or pushed before that answer; if the answer is yes, commit in logical
increments with the Codebuff footer, never staging `docs/integration-landscape.md`.
