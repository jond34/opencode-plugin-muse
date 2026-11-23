# Round 15 plan: the polarity, and the record that carried it

Round 14 shipped `--strict` as opt-in on a survey whose brew cell was inverted. The
row set is right (E-D77: it does not fire on a working checkout). The polarity was
justified by a claim that is false, and the two reasons that remain — exit-code
stability, advisory rows — justify the narrow set rather than the flag.

This round corrects the record and, if Q1 comes back the other way, flips the
default to gate and adds a three-state ladder. Either answer costs one round; only
one of them costs code.

Research: `docs/round-15-research.md`. E-D77–E-D80 are done; §2–§6 there are the
evidence for everything below.

## 1. What the correction actually moves

- The brew cell and the tally (§1–§2): brew gates by default, and the tools that do
  not are the ones whose severity the *user* authored. This doctor authors its own,
  so the axis points at gating.
- D68's reasons: E-D77 removes "the advisory rows" as a reason for the polarity, and
  E-D78 removes "existing callers" as a constraint — `scripts/` is not in the
  tarball, no workflow or script reads the exit code, and the `--strict` commit has
  never been pushed.
- Round 14's framing of the consumer: it wrote "a CI job that runs the doctor" in
  the research and README. The config rows need the host, and a CI runner has no
  signed-in `muse`, so the consumer is a pre-push hook or a release run on a machine
  that has one. The records should say that instead.

## 2. Decisions

**D74 — the correction lands where the next round reads it, and the wrong cell gets a
pointer.** Round 15's research §1–§3 and the coverage audit carry the correction.
`docs/round-14-research.md` is a record of what was believed then and is not
rewritten, with one exception: a one-line pointer at the top of its §1, because that
cell is load-bearing for a decision and a reader who stops there inherits it.

**D75 — the default gates the config-integrity set; `--no-strict` reports only;
`--strict` also fails a run that did not look.** Contingent on Q1. The three states
are the ladder in research §6: `--no-strict` < default < `--strict`. `--strict` keeps
a job it already had (closing the `--offline` hole), so D70 stands unchanged and both
round-14 `--offline` tests keep their expectations.

**D76 — an explicit `--offline` is not a did-not-look failure at the default.** The
user said do not look; the report says so in the row detail. `--strict` still fails
it, because there the user asked to gate and asked not to look.

**D77 — `--json` shares the contract.** One promise: the format flag changes the
format, not the exit code. `gh auth status --json` diverges (always 0), and the
reason it can is that its JSON is a data mode for other programs; this report's
`--json` is documented as "the same report for a bug report". A caller collecting a
bug report passes `--no-strict`.

**D78 — the records stop calling this a CI gate.** The gate's consumer is a pre-push
hook, a release script, or a person. README says that in one sentence, and the
coverage row stops implying a CI runner can use it.

**D79 — `plugins` naming the published build stays advisory.** Contingent on Q3. The
row cannot tell a deliberate global install from a shadowed checkout, and gating it
would fail this repo's own run (E-D77).

**D80 — no `gate` field in `--json`.** The exit code is the contract; a second
representation invites two sources of truth and a support question about which one
wins.

## 3. Shape

```ts
export interface Gate {
  /** `--no-strict`: report only, never gate. */
  readonly gated: boolean;
  /** `--strict`: also fail a run that did not look. */
  readonly strict: boolean;
  /** False under `--offline`: the user asked for a run that does not look. */
  readonly asked: boolean;
  /** Whether `opencode debug config` answered. */
  readonly answered: boolean;
}

export function exitCode(checks: readonly Check[], gate: Gate): number;
```

Order: any `fail` → 1; not `gated` → 0; not `asked` → `strict ? 1 : 0`; not
`answered` → 1; a `config` row or `policies: warn` → 1; else 0.

`main()` keeps one spawn. `asked = !options.offline`, `answered = Array.isArray(run
.documents)`, `gated = !options.noStrict`, `strict = options.strict`. `parseArgs`
gains `noStrict: argv.includes("--no-strict")`. Nothing else moves.

## 4. Phases

| Phase | Work | Gate | Status |
|---|---|---|---|
| S0 | E-D77–E-D80 recorded; the survey re-read against primary sources | every row of research §2 has a source, not a memory | done — research §2–§4 |
| S1 | `Gate` with four facts; `--no-strict` in `parseArgs`; one call site | `bun run check:offline` green; `tsc` clean | done |
| S2 | Table test: the ladder's cases; the two spawned tests keep their expectations | every case asserted, including `--no-strict` and `--offline` under both modes | done — thirteen rows, 419 pass |
| S3 | Live: four trees × {default, `--no-strict`, `--strict`}, host absent, `--offline`, `--offline --strict` | the table matches research §6 | done — matches on every row (`scratch/round-15/s3.ts`) |
| S4 | README (the ladder, the local-gate sentence), compatibility (one clause), coverage (audit, row, counts), round-14 pointer | diff reads as prose | done |
| S5 | Report, one line per decision, then ask before committing | owner gate | reporting |

If Q1 comes back A, delete S1–S3 and the `--no-strict` row of S4: the round becomes
the correction and nothing else, which is four paragraphs and one pointer.

## 5. What must not regress

- `--offline` alone still exits 0; `--offline --strict` still exits 1 (D70).
- A `policies` row that is `skipped` for declaring no statements never fails.
- `--json` keeps its shape; no field is added.
- The only default-behaviour changes are the two table rows named in E-D80 and the
  two live trees that carry a refused config or a dropped statement. Every other
  tree that returns 0 today still returns 0.
- No new dependency, no `muse acp`, no push, tag or publish.
- Temp `XDG_CONFIG_HOME` with a copied `auth.json`; never touch `~/.config/opencode`.

## 6. Product questions

One root question, three follow-ups, one that is mine to decide. The follow-ups only
exist if Q1 goes to B, which is what keeps the decision layer small.

**Q1 — does the default gate?** *Recommendation: yes* (D75). The conditions research
§5 names are both met: the narrow set does not fire on a working checkout (E-D77) and
nothing outside this tree reads the exit code (E-D78). *Cost:* a person running the
doctor on a machine with a malformed global config now gets exit 1 as well as the
report, and `--no-strict` is one more flag. *Flip condition:* if you want the gate to
be a published promise later, take A now and flip at 0.2.0 with a note; if `scripts/`
ever ships in the tarball, flipping becomes a breaking change and A becomes the
right answer permanently.

**Q2 — what is the opt-out called?** *Recommendation: `--no-strict`*, because it
negates the flag that exists, adds no vocabulary, and reads correctly in the ladder.
*Alternative:* `--advisory`, which names the intent and matches the README's word for
the ungated rows, at the cost of two names for one axis.

**Q3 — does `plugins` join the gate when it names the published build?**
*Recommendation: no* (D79). The row cannot tell a deliberate install from a shadowed
checkout, and this repo's own run warns it (E-D77), so gating it would fail the tree
the gate is meant to protect. *Reversing condition:* a way to declare the expected
entry, e.g. a `MUSE_EXPECT_ENTRY` or a `--checkout` assertion.

**Q4 — is a `gate` field worth adding to `--json`?** *Recommendation: no* (D80).
Decided rather than asked, but it is a product shape question, so it is written down
here rather than buried.

**Q5 — should anything call the gate?** *Recommendation: nothing automatic this
round.* A pre-push hook that fails on a config the host discarded is the useful
consumer, and it is the owner's hook, not this repo's to install. README shows the
one-line use; wiring it into `repro.sh` would make `repro.sh` depend on a signed-in
CLI, which it does not today.

## 7. Prohibitions (inherited)

No push, tag or publish. No `muse acp`. No new dependency. Never write to the host's
log. Never weaken or delete an assertion to make the suite pass.
`docs/integration-landscape.md` is the owner's edit: read only, never stage. Scratch
stays in `scratch/`. Commit in increments, Codebuff footer, only after the owner says
so.
