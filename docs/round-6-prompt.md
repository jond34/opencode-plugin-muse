# Round 6 — execution prompt

Paste this as the first message of a fresh session in
`~/repos/opencode-plugin-muse`. It is self-contained; nothing here depends on the
conversation that wrote it.

---

Execute round 6 of `~/repos/opencode-plugin-muse` per `docs/round-6-plan.md`,
phases R0→R7, in order, one phase at a time. Round 5 ended at `1ca55e7` with the
suite at 375 pass / 0 fail / 965 expect / 37 files; nothing is committed since.

**Rules, unchanged from round 5.** `bun run check:offline` after every phase and
it stays green; never weaken or delete an assertion; a new test file goes in the
explicit `test:offline` list; Muse CLI work runs under `zsh -lc`, never `bash -lc`;
no `muse acp`, no push, no tag, no publish, no new dependencies; scratch probes go
in the gitignored `scratch/`. All experiments are pre-approved (the owner approved
them on 2026-11-22), with paid turns bounded at four.

**The plan's own rules.** The review under test is `docs/integration-landscape.md`
§7–§8 — the owner's uncommitted edit. Read it; never edit it. Its four claims are
triaged in the plan §2 with verdicts: claim 1 (D21's reason) confirmed wrong,
claim 2 (no runtime switch) half confirmed, claim 3 (nothing survives bypass) half
refuted, claim 4 (four knobs absent) confirmed for two and wrong for two. Do not
re-derive those verdicts; they rest on quoted vendor docs and the installed CLI.

**What each phase produces.**

- **R0** — put the triage where it belongs: rewrite D21's reason in
  `docs/decision-coverage.md` (subagents are off because the spawner tools are
  outside the `mcp__opencode__*` allowlist and each child is a billed call
  opencode cannot see — *not* because a child would escape the permission engine,
  since children inherit the lead's boundary and cannot expand it), and add the
  sandbox sentence to `README.md` (independent of approval, never disabled here,
  inert without a shell tool). Keep the suite green.
- **R1** — three free probes: E-D23 (`session/setApprovalMode` through all four
  values, record `effectiveMode.mode`/`outcome`/`source`, restore), E-D29 (does
  `muse serve` accept `--max-model-steps`?), E-D28 (bisect
  `muse config validate --plane policy` for its accepted members — `{"schema_version":1,"settings":{}}`
  validates; `approval_mode`, `run`, `tools`, `security`, `permissions`, `mcp`,
  `allowed_approval_policies` all reject). Paste raw output.
- **R2** — three paid turns, one approval mode each: E-D24 `denyUnmatched`,
  E-D25 `onRequest` with the judge off, E-D26 `promptUnmatched`. For each: does a
  bridged tool call run, park, or get refused, and what does the host say. Then
  name D27's branch from the plan's table.
- **R3** — implement D27's branch: the mode constant where `allowAll` is set
  today (`src/session.ts:490`), the refusal message at `:427-437`, tests that
  inject the mode rather than hitting a live host, and the README/coverage rows.
- **R4** — E-D27: an `--agents` overlay whose agent has `tools: ["mcp__opencode__*"]`,
  a prompt that spawns one child, and a watch on bridge traffic, the session
  record, and item ordering. Then D28 either way — if the child's calls are
  visible, record B as an available opt-in; if not, A with the corrected reason.
- **R5** — D29's doctor row (`muse config status --json`, one line: which planes
  are active) and D30's six reclassifications.
- **R6** — restate counts honestly, write the "## Round 6" evidence section, keep
  README true, tick the phase table in the plan.
- **R7** — stop and report: one line per decision (D27–D31) and per experiment
  (E-D23–E-D29), the suite result, the five product questions from the plan §6
  with your recommendation on each, and ask before committing. Nothing is
  committed or pushed before that answer.

**Do not** re-litigate the plan's verdicts, add a bridge nobody asked for, or
claim a Windows or macOS behaviour this machine cannot observe. If an experiment
cannot observe the thing it was meant to observe, record the limitation and keep
the branch undecided rather than picking the tidier answer.
