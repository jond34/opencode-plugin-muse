Execute round 10 of `~/repos/opencode-plugin-muse`.

Read `docs/round-10-plan.md` first. It is the state: phases S0–S9 in §10, the
decisions in §5, the experiments in §6, the prohibitions in §11. Work the phases
in order and tick each one in that table as it closes.

HEAD is `8afd19c`, suite green at 380 pass / 0 fail / 987 expect / 37 files.
`docs/integration-landscape.md` is the owner's uncommitted edit — read it, never
modify or stage it.

What this round is:

1. **The doctor's plugin row.** `opencode plugin list --builtin` resolves plugin
   entries and, run in this checkout, shows `opencode-muse 0.1.12` from the npm
   package and **not** the checkout — the shadowing that cost round 9 a whole
   round. Add one row to `bun run doctor` that reports the resolved set and
   whether this checkout is in it, `warn` when it is not, with the two fixes as
   remediation. E-D53/E-D54 settle whether the command follows the cwd, what it
   costs, and whether it starts anything; E-D56 is the row read back in three
   states.

2. **The unit of a step.** The README gives `steps: 12` and never says what a
   step is, and its `steps: 1` sentence ("zero model calls") may be wrong: the
   runner in `packages/core/src/session/runner/llm.ts` counts from 1, tests
   `step >= agent.steps`, and at the limit still builds a request — it appends
   `MAX_STEPS_PROMPT` and sets `toolChoice: "none"`. E-D51 runs `steps: 1` with
   `--log-level debug --format json`; E-D52 runs `steps: 2` and `3` with a prompt
   that needs two tool calls. If the plugin answers the cap request with nothing,
   that is a defect here and gets fixed, not documented.

3. **Two recorded-not-measured items.** Muse's managed policy plane (ships per
   the 1.4.2 changelog, no local vocabulary can name it) and Console-delivered
   policy (delivered by the built-in `opencode.provider.opencode`, which ignores
   removals; no workspace here). Both are documentation, D52/D53.

Budget and rules:

- Paid turns are capped at **three** (E-D51, E-D52's two runs). Nothing else may
  spend one, and no run is repeated to confirm a result already in a log.
- Every experiment writes raw output to `scratch/round-10/<ref>.{out,err,log}`
  and a paragraph to `docs/decision-evidence.md`. State lives in files, not in
  the conversation.
- Never touch the real `~/.config/opencode`: every run uses a temp
  `XDG_CONFIG_HOME` with `auth.json` copied in.
- Muse CLI work under `zsh -lc`, never `bash -lc`. No `muse acp`, no push, no
  tag, no publish, no new dependency.
- Temporary instrumentation in `src/` is reverted before anything is committed,
  and `git diff src/` is checked.
- The source read is evidence about shape, not behaviour on 2.3.2. Where they
  disagree, the installed build wins and the disagreement is recorded.

`bun run check:offline` must be green after every phase that touches code or
tests, and no assertion may be weakened or deleted. New test files go in the
explicit `test:offline` list.

Stop after S8 and report: one line per decision (D48–D53) and per experiment
(E-D51–E-D56), the suite result, the six product choices from §8 with your
recommendation on each, and anything you could not measure. Then **ask before
committing**. Nothing is committed or pushed before that answer.
