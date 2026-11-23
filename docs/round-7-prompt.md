# Round 7 — execution prompt

Paste this as the first message of a fresh session in
`~/repos/opencode-plugin-muse`. It is self-contained; nothing here depends on the
conversation that wrote it.

---

Execute round 7 of `~/repos/opencode-plugin-muse` per `docs/round-7-plan.md`,
phases R0→R7, in order, one phase at a time. Round 6 ended at `7ce5721` with the
suite at 375 pass / 0 fail / 965 expect / 37 files; nothing is committed since.
Read the plan first — §3 holds the evidence already collected (the managed-plane
validator output, opencode's permission docs, the ACP shim's architecture, the
`turn/start` member list) and must not be re-derived.

**Rules, unchanged from round 6.** `bun run check:offline` after every phase and
it stays green; never weaken or delete an assertion; a new test file goes in the
explicit `test:offline` list; Muse CLI work runs under `zsh -lc`, never `bash -lc`;
no `muse acp`, no push, no tag, no publish, no new dependencies; scratch probes go
in the gitignored `scratch/`. All experiments are pre-approved (owner,
2026-11-22), with paid turns bounded at two; one is planned (E-D32).

**The review under test** is the "Against consensus" note, quoted verbatim in the
plan §1. Its triage is in §2 and is not to be re-litigated: statement 1 confirmed
and sharper, statement 2 confirmed for us and corrected for opencode, statement 3
confirmed with one wrong detail, statement 4 confirmed and already decided,
statement 5 half confirmed (the shim carries *none* of opencode's control
surface, not less). `docs/integration-landscape.md` is the owner's uncommitted
edit — read it, never edit it.

**What each phase produces.**

- **R0** — the corrections that need no experiment. Fix the `turn/start` member
  list in `docs/decision-coverage.md` (the structured-output row) and
  `docs/implementation-plan.md:839`: eight members, and `tokenBudget` is an
  `Item` field on `workflow` runs (`msp.d.ts:1347`, `:4398`), not a turn
  parameter. Rewrite the ACP row in `docs/decision-coverage.md` and the README
  paragraph at `:242-259`: opencode ships the agent side only; six requests,
  #28994's PR unshipped; `pi-is314/opencode-acp-client` (npm
  `opencode-acp-client`, created 2026-11-21) drives the v2 TUI against any ACP
  agent, but its architecture is TUI ↔ HTTP+SSE ↔ bridge ↔ ACP stdio, so
  opencode's engine — tools, permission rules, transcript — is not in the loop.
  Reopening condition: an ACP client inside opencode's engine that registers
  opencode's own tools as an MCP server to the agent.
- **R1** — four free probes. E-D30: formalise §3.1 by running the full candidate
  list through `muse config validate` on both planes and pasting the validator's
  `member` / `binds` / `user_overridable` lines. E-D31: `permissionProfile/list`
  on a live session, then `session/start` with one id — record the ids, their
  availability, and the start's answer. E-D33: `muse serve --help` for
  `--disable-sandbox`, `--sandbox-network`, `--disable-approval`, and confirm
  `serveArgs` in `src/host.ts` passes none of the disabling ones. E-D35: read
  `pi-is314/opencode-acp-client`'s README (no install) and record its
  unimplemented-route list.
- **R2** — E-D34: `gh workflow run test.yml` (gh is authenticated with `workflow`
  scope), record the run id, the commit it tested, and the three job results;
  `gh run view --log-failed` if anything fails. The caveat is mandatory in the
  record: `origin/main` is `56d4ca0`, sixty commits behind local `HEAD`, so a
  green run answers "does `npm ci` + `check:offline` work on macOS and Windows"
  for that tree, not for the current one.
- **R3** — E-D32: one paid turn through the production path, timestamping
  `turn/completed`, the last substantive frame, the gate's start, and the
  plugin's kill. Then name D34's branch from the plan's table — late, dropped, or
  undecided. An undecided probe is a result: record it and leave U26 open.
- **R4** — implement D32: rewrite the containment paragraph at `README.md:101-105`
  as one gate (opencode's permission rules), one allowlist
  (`mcp__opencode__*`), no isolation, with the two facts that make it honest —
  Muse's sandbox cannot cover a bridged call because opencode executes it, and
  opencode's shipped base policy is `{"action":"*","resource":"*","effect":"allow"}`
  with no OS sandbox, so a configured `deny` rule is the only hard stop that
  survives `--auto`. Add the copyable deny block. Add D33's caveat: the plugin
  never passes `--disable-sandbox`, but a user's `Unrestricted` profile removes
  both layers. If E-D32 named a branch, implement it here with a test that
  injects the frames rather than hitting a live host.
- **R5** — D35 and D36 rows; the two new coverage rows (OS isolation for a
  bridged call as **N** — opencode owns it and does not provide it; Muse
  permission profile as **D**); restate the counts from the rows.
- **R6** — write `## Round 7 — the residual ledger` into
  `docs/decision-evidence.md` with the raw output, keep README true, tick the
  phase table in the plan.
- **R7** — stop and report: one line per decision (D32–D36) and per experiment
  (E-D30–E-D35), the suite result, the five product choices from the plan §7 with
  your recommendation on each, and ask before committing. Nothing is committed or
  pushed before that answer.

**Do not** re-litigate the plan's verdicts, install the ACP shim, build a turn
cap, pin a Muse profile, or claim a Windows or macOS behaviour this machine
cannot observe. If an experiment cannot observe the thing it was meant to
observe, record the limitation and keep the branch undecided rather than picking
the tidier answer.
