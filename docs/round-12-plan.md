# Round 12 — the reader that can be deleted

Planned 2026-11-23. HEAD `4ea16da`, suite green at 397 pass / 0 fail /
1023 expect / 37 files. `docs/integration-landscape.md` is the owner's
uncommitted edit: read only, never modify or stage.

Owner's standing instructions for this round: "i approve all experiments"; keep
state in external files; research with search MCPs and give pros/cons, steelman
and strawman; raise product choices after the measurements; hand back a prompt
that executes on the plan.

## 1. Where round 11 left the record

Round 11 closed the documentation defect and added the `policies` row. Its own
review left one residual, stated as: the row "does reimplement something — a
small JSONC reader", and it "is the one place in this tree where declared state
is parsed by hand rather than read from the vendor". The proposed hedge was to
degrade to `skipped` when the host printed policies but the file parse found
none, or when the counts disagreed only by constructs the reader does not model.

The rest of that review stands: nothing against beyond the inherited trio
(headless silence, global-config shadowing, `plugin.use` denial reading as a
model typo); nothing missing that the reviewer could justify; two unclear items
(Console policy behaviour, a binding Muse policy member) with reversing
conditions in the ledger.

## 2. What this round is for

Two measurements taken while planning (research doc §1–§2) move the residual
from "hedge it" to "maybe delete it":

1. The host writes a **structured diagnostic for every drop**, during
   `debug config`, with no model call: `message="configuration normalization
   diagnostic"`, `source=<file>`, `path=$.policies.1`, `kind=invalid`,
   `action="skipped malformed recognized value"`.
2. The log's location is a vendor surface: `opencode debug paths log`.

If that diagnostic can be read reliably, the row does not need to parse JSONC at
all: it can report what the host says it dropped, by file and by index, and it
gains the case the count cannot see — a **whole-file rejection** (`path=$`), which
happens on single quotes, unquoted keys and syntax errors (research §2), and is
reported upstream as `anomalyco/opencode#54786`.

So the round has one job: decide whether the row's truth comes from the file, the
host's diagnostics, or both — and then make the tree match that answer, including
deleting code if that is the answer.

## 3. Evidence already in hand (do not re-derive)

- The diagnostic line, its fields, and that it is **not** on stderr (research §1).
- `debug paths log` prints the log directory; the file is `opencode.log`; `grep`
  needs `-a` (research §1).
- Host acceptance: trailing commas and block comments **accepted**; single
  quotes, unquoted keys and truncated JSON **reject the whole file**; a
  misspelled action drops one statement at `$.policies.N` (research §2).
- Duplicate `policies` keys: last wins, and the surviving array's statements are
  validated normally (research §2, `dupkey`).
- Round 11's counts: 3 declared → 1 printed; `experimental.policies` merges;
  duplicates preserved; per-document, no inheritance (E-D58/E-D59).
- The row as shipped: `policyRow(documents, read)` in `scripts/doctor.ts`,
  warn/ok/skipped, nine tests in `test/doctor.test.ts`.
- `opencode debug config` is spawned as
  `spawnSync("opencode", ["--standalone", "debug", "config"])`.
- Ecosystem compensation patterns and URLs (research §4).

## 4. Hypotheses, steelman and strawman

**H1 — the diagnostics are a stable enough interface.** The log format is not
documented; it is an implementation log with `run=<id>` correlation. Steelman:
it is the vendor's own report, it names the file and the JSON pointer, and the
alternative is re-implementing the vendor's parser. Strawman: a log line is not
an API; a format change or a level change silently turns the row into "nothing
dropped", which is worse than the false warning the hedge was protecting against.

**H2 — the file count is the safer truth.** Steelman: it is deterministic, needs
no log path, no rotation handling, no correlation, and it is already tested.
Strawman: it cannot see the whole-file rejection, and when the host's parser and
ours disagree it has no way to know which one is right.

**H3 — both, with the host authoritative.** Steelman: the diagnostic decides
*whether* something was dropped; the file supplies *how many* were declared, and
a disagreement between them is itself a finding worth skipping on. Strawman: two
sources of truth for one number, and the file half keeps the 41-line parser and
its maintenance.

## 5. Decisions and their branches

### D59 — Where the row learns that a statement was dropped

- **A — keep the parse, add the hedge.** Degrade to `skipped` with the reason
  when the host printed policies but the file parse finds none, or when the
  counts disagree in a direction the reader cannot explain. Smallest change; the
  parser stays; the whole-file rejection stays invisible.
- **B — read the host's diagnostics, delete `parseJsonc`.** Locate the log with
  `debug paths log`, take a byte offset before spawning `debug config`, read the
  delta after, keep only `configuration normalization diagnostic` lines whose
  `source` is one of the config paths we already know, and report file + JSON
  pointer + reason. Unreadable log, unknown path, or zero deltas when the CLI
  answered → `skipped` with the reason, never `ok`.
- **C — both.** Diagnostics decide the finding; the file count is a cross-check
  that turns an unexplained disagreement into `skipped`.**Branch:** E-D62 clean → **B** (recommended: it deletes the residual instead of hedging it, and it sees `path=$`). E-D62 shows fragility that a documented fallback can absorb → **C**. Both fail → **A**, and the evidence says the vendor surface was measured and declined.

**Decided 2026-11-23: B**, on the measurements in research §6–§9. The log is
reliable in the ways the condition asked (5/5, parallel-safe, relocation-safe)
and its two failure modes are detectable rather than silent (stale offset,
no liveness line → `skipped`). The file count, by contrast, returns `ok` on a
config set where one file was rejected outright (research §6), so it is not a
fallback worth keeping — it is the weaker method with a blind spot that the
round exists to close.

### D60 — A rejected file is one finding, not two

When a file is rejected outright (`path=$`), its `plugins` entry and its
`policies` are gone together. Two rows warning separately would read as two
problems. Recommended: emit the rejection once, attached to the file, and have
both rows say "this file was rejected, so its entries are not in effect" rather
than each inventing its own cause.

**Branch on E-D64:** if a rejected file is still printed as a document with a
`path` and empty `info`, the rows can detect it locally; if it vanishes from the
list, only the diagnostic can name it, which couples D60 to D59's answer.

**Decided 2026-11-23: one file-level finding.** E-D64 took the second branch — a
rejected file is absent from the document list entirely (research §6) — so the
finding cannot live in either row. It is emitted once as its own check, naming
the file and the diagnostic, and both rows defer to it: `plugins` stops claiming
"no plugins entry" when the entry exists in a file that was rejected, and
`policies` stops saying "nothing to drop" about the case where everything was.

### D61 — What the README tells the user to grep

Round 11 said "check the server log". The measured string is
`configuration normalization diagnostic`. Recommended: name it, with
`opencode debug paths log` for the directory — a command the user can run beats
a sentence they cannot. Keep the Console caveat unchanged (`#60252`).

### D62 — Where the field comparison lives

Recommended: one clause in the README — **a deny you cannot see enforced is not a
deny** — because that is the product sentence; the actionlint / terraform /
Cedar / Argo comparison stays in `decision-evidence.md`, where this tree keeps
its reasoning and does not turn the README into a survey.

## 6. Experiments

All free. No paid turn is planned for this round.

| ID | What | Pass condition |
|---|---|---|
| E-D62 | Log delta reliability: 5 consecutive `debug config` runs; two in parallel; a truncated log between runs; `XDG_DATA_HOME` relocated; `debug paths log` failing | 5/5 deltas contain exactly our run's diagnostics, parallel runs do not bleed, a truncated log yields `skipped` rather than `ok` |
| E-D63 | Differential corpus, ~10 fixtures: valid, trailing comma, block comment, line comment, `//` inside a string, BOM, duplicate key, misspelled action, misspelled effect, single quotes, unquoted keys, truncated JSON | no **silent** disagreement: every case where the host rejects and we would accept is either caught by the diagnostic or reported as skipped |
| E-D64 | Whole-file rejection shape: does the rejected file still appear in `debug config`? What do the `plugins` and `policies` rows say about it today? | the shape is named, and both rows can say the same thing about it |
| E-D65 | Diagnostic granularity: two bad statements in one file → two lines? a bad statement under `experimental.policies` → which `path`? | each drop is individually addressable, or the limitation is recorded |

## 7. Documentation work

- `docs/compatibility.md`: replace round 11's "declared-versus-printed" sentence
  with whatever D59 lands on, including the diagnostic string and its limits.
- `README.md`: D61's grep line; D62's clause.
- `docs/decision-coverage.md`: the P row for dropped statements is rewritten to
  the new method; counts restated; round-12 audit paragraph.
- `docs/decision-evidence.md`: round-12 section with the probe table, the branch
  actually taken, and what could not be measured.
- This plan's phase table, ticked as phases close.

## 8. Product choices for the owner

These are yours, not the measurements'. Each has a recommendation so the answer
can be one word.

**Q1 — D59's source of truth.** A (hedged parse) / B (host diagnostics, delete
the parser) / C (both). **Recommended: B if E-D62 is clean**, because it removes
the only hand-rolled parser in the tree and reports what the vendor reports,
including the whole-file case. Condition for confidence in §9.

**Q2 — Delete `parseJsonc` or keep it?** Under B, delete it and its three tests;
under C, keep it as a cross-check. **Recommended: delete under B.** A second
source of truth that can disagree with the vendor is the liability, not the
parser alone.

**Q3 — Whole-file rejection (D60): one shared finding or per-row?**
**Recommended: one finding, emitted once**, naming the file and the diagnostic,
with both rows deferring to it. Two warnings for one rejected file would read as
two defects.

**Q4 — The field comparison (D62).** **Recommended: the one-clause README
version**, full survey in the evidence. The alternative — a README section
comparing four toolchains — is honest but makes the READMElonger than the feature.

### Answers, 2026-11-23

- **Q1 — B.** Host diagnostics, and delete the parser. E-D62 met its condition;
  E-D63 showed the count reporting `ok` over a rejected file in a mixed config
  set, which is the failure this round is for.
- **Q2 — delete.** `parseJsonc` agreed with the host in 13/13 fixtures, so it is
  not wrong; it is redundant, and the only case it cannot see is the one that
  matters. It goes with `declaredStatements` and the three tests whose subject
  is the parser.
- **Q3 — one finding, emitted once, as its own check.** Forced by E-D64: the
  rejected file is not in the document list, so neither row can produce it.
- **Q4 — the one-clause README version.** The survey stays in
  `decision-evidence.md`; the product sentence is the clause.

## 9. Conditions for a confident recommendation

I will recommend D59-B without a hedge only if all three hold:

1. **E-D62** is clean in 5/5 runs, survives two parallel `debug config` calls
   without bleeding, and degrades to `skipped` on a truncated or missing log.
2. **E-D63** shows no silent disagreement: no fixture where the host rejects and
   the row would report `ok`.
3. **E-D64** names the whole-file shape, and the `plugins` and `policies` rows
   can agree on one sentence about it.

If any fails, the recommendation moves one rung down the ladder (B → C → A) and
the evidence says which condition failed. The rule I will not bend: the row is
never `ok` on a file the host did not accept.

**Met on 2026-11-23**, with one refinement: condition 2 holds per file and fails
per config set, which is why the answer is B rather than C. The row must report
`skipped`/`warn` whenever the log names a rejected file, and the mixed-config
case (research §6) is the regression test that proves it.

## 10. Phases

| Phase | Work | Gate | Status |
|---|---|---|---|
| S0 | E-D64 — the whole-file rejection shape, and what both rows say about it now | Named, with the document list before and after | done — research §6 |
| S1 | E-D62 — log delta reliability | 5/5 clean, parallel safe, truncation → skipped | done — research §7 |
| S2 | E-D63 — differential corpus | no silent disagreement | done — research §8 |
| S3 | D59 implementation per the branch | `bun run check:offline` green, tests updated | done — 407 pass, research §11 |
| S4 | D60 — one finding for a rejected file | both rows agree; suite green | done — `config` row, both rows defer |
| S5 | D61/D62 — README and compatibility wording | diff reads as prose, not a warning label | done |
| S6 | Evidence section, coverage row and counts, audit paragraph | suite green | done |
| S7 | Report: one line per decision and experiment, the branch taken, the choices answered, ask before committing | owner gate | reported; commit awaits the owner |

## 11. Prohibitions (inherited)

- No new dependency; if `parseJsonc` is deleted, nothing replaces it but the
  vendor's own output.
- Never write to the host's log; read only.
- Never touch the real `~/.config/opencode`; every probe uses a temp
  `XDG_CONFIG_HOME` with `auth.json` copied in, and `--standalone` so the
  managed service is not involved.
- No `muse acp`, no push, no tag, no publish.
- Never weaken or delete an assertion to make a phase pass; a deleted test is
  allowed only when its subject is deleted, and the evidence says so.
- Scratch stays in the gitignored `scratch/round-12/`.
- `docs/integration-landscape.md` is never staged.
