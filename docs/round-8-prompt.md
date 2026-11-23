# Round 8 — execution prompt

Paste this as the first message of a fresh session in
`~/repos/opencode-plugin-muse`. It is self-contained; nothing here depends on the
conversation that wrote it.

---

Execute round 8 of `~/repos/opencode-plugin-muse` per `docs/round-8-plan.md`,
phases R0→R7, in order, one phase at a time. Round 7 ended at `89e8e2b` with the
suite at 376 pass / 0 fail / 970 expect / 37 files; nothing is committed since.
Read the plan first — §3 holds the evidence already collected (the handshake's
capability list, Codex's identical gate and what its read-back actually is, the
four admin files with their precedence, the twelve refused policy shapes and the
1.4.2 changelog, opencode's `steps` cap and where it lives, and the field's cap
defaults) and must not be re-derived.

**Rules, unchanged from round 7.** `bun run check:offline` after every phase and
it stays green; never weaken or delete an assertion; a new test file goes in the
explicit `test:offline` list; Muse CLI work runs under `zsh -lc`, never `bash -lc`;
no `muse acp`, no push, no tag, no publish, no new dependencies; scratch probes go
in the gitignored `scratch/`. All experiments are pre-approved (owner,
2026-11-22), with paid turns bounded at two; one is planned (E-D41).

**The review under test** is the "Leaning against" note, quoted verbatim in the
plan §1. Its triage is in §2 and is not to be re-litigated: the posture read-back
is confirmed and sharper (the read is provenance, and Codex clears it when
managed requirements override), the enterprise claim is confirmed about this
plugin and corrected about Muse (the behaviour ships, the local vocabulary does
not), the doctor row is confirmed, the capability probe is confirmed and cheaper
because the doctor already owns a connection, and the turn-ceiling claim is half
wrong (opencode has `agent.steps`, enforced on v2, default none, in its own loop).
`docs/integration-landscape.md` is the owner's uncommitted edit — read it, never
edit it.

**What each phase produces.**

- **R0** — the corrections that need no experiment. Rewrite the turn-cap row's
  basis in `docs/decision-coverage.md` with §3.6: `agent.<name>.steps` exists and
  is enforced on v2 (`toolChoice: "none"` plus a refused call at the limit,
  retested on 2.0.27), defaults to none, and lives in opencode's own prompt loop.
  Rewrite the G/enterprise-planes basis with §3.4: the 1.4.2 changelog says a
  managed policy restricts permission profiles and `muse serve` refuses and lists
  the allowed ones, while twelve candidate document shapes are `unknown_member`
  on 1.4.25 and `config status` names only `system_file` sources. Leave the ACP
  row as round 7 wrote it.
- **R1** — E-D39 and E-D40, both free. E-D39: formalise §3.4 by re-running the
  twelve shapes through `muse config validate --plane policy`, pasting
  `unknown_member` lines, plus `muse config status --json` and the changelog
  quote. E-D40: send `session/start` with a profile id the catalog does not carry
  and record the error kind, the code the plugin produces, and the message a user
  would see. No model turn in either.
- **R2** — E-D36, E-D37, E-D38, all free. E-D36: what the doctor can read about
  opencode's posture without a network call. E-D37: one doctor-style host
  initialized with `capabilities.experimentalApi: true` — record
  `InitializeResult.experimentalApi`, any `experimentalFingerprint`,
  `permissionProfile/list`, `session/start` with `:read-only`, and
  `permissionState` from `session/read`; note every frame that differs from a
  stable run. E-D38: time the doctor's existing spawn plus the added requests.
  Then name the D37/D38 branch from the plan's tables.
- **R3** — implement D37/D38: add the capability option to `MuseHost.spawn`
  (`src/host.ts:264-267` hardcodes `requestedCapabilities: ["sessionMcp"]`) and
  the posture row to `scripts/doctor.ts` (the checks are
  `{ id, status, detail, remediation? }`; the doctor already spawns a host and
  starts a session at `:180-235`). The detail line labels what is **configured**
  and what is **read**, because saved approvals and any managed layer are
  invisible. If E-D37 refuses the read, fall back to D37 option B. If E-D40
  showed the policy refusal buried, implement D40 option B in `src/session.ts`
  and pin it with a test that injects the refusal. Tests go in
  `test/doctor.test.ts` and, if touched, the existing session tests.
- **R4** — E-D41: one paid turn with `agent.build.steps: 1` and a prompt that
  needs three tool calls. Record whether the turn is cut, what the user sees, and
  where it stopped. If a cut cannot be told from a model that stopped, say so and
  keep both sentences in the row.
- **R5** — coverage rows and counts (posture read-back, the doctor row, the
  turn-cap rewrite, the managed-refusal row, the enterprise basis), the README
  paragraph on what the plugin can and cannot see, and the plan's phase table
  ticked.
- **R6** — write `## Round 8 — the posture you cannot read` into
  `docs/decision-evidence.md` with the raw output, then re-run the suite.
- **R7** — stop and report: one line per decision (D37–D41) and per experiment
  (E-D36–E-D42), the suite result, the five product choices from the plan §7 with
  your recommendation on each, and ask before committing. Nothing is committed or
  pushed before that answer.

**Do not** request `experimentalApi` on the user's session, build a client-side
turn cap, pin a Muse profile, edit `docs/integration-landscape.md`, or claim a
policy channel this machine cannot observe. If an experiment cannot observe the
thing it was meant to observe, record the limitation and keep the branch
undecided rather than picking the tidier answer.
