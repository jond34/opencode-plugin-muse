# Round 15 research: the polarity, and the cell that was inverted

Round 14 shipped `--strict` as opt-in. The research behind that choice rested on one
claim about the field: every surveyed test view gates by default *except* `brew
doctor`, therefore "the field does not support 'a diagnostic must exit 0'". The brew
cell is wrong. With it the tally, and the sentence the next round would inherit.

The gate's row set is unaffected. What is affected is the polarity, and whether the
justification survives once the field is read correctly.

## 1. The cell

Round 14 §1 printed:

| Homebrew | `brew doctor` | `exit 1 if failed && fatal` — warnings alone do not fail it | `Library/Homebrew/diagnostic.rb` |

The cited source says the opposite. From `diagnostic.rb`:

```ruby
def self.checks(type, fatal: true)
  checks = Checks.new
  failed = T.let(false, T::Boolean)
  checks.public_send(type).each do |check|
    Array(checks.public_send(check)).each do |finding|
      if fatal
        failed = true
        ofail finding.to_s
      else
        opoo finding.to_s
      end
    end
  end
  exit 1 if failed && fatal
end
```

`fatal` defaults to `true`, so every finding sets `failed` and the run exits 1. The
manpage states the contract without hedging: "Will exit with a non-zero status if any
potential problems are found."

The `fatal: false` path is real but it is not a user-facing opt-out: it is the
internal caller for diagnostics that run after a failed build, where a finding is
printed with `opoo` and the run continues. Brew's relaxation lives at the call site,
not behind a flag. The default gates; the one caller who knows the finding is
advisory says so.

The manpage's next paragraph is the counter-lesson round 14 should have kept:

> these warnings are just used to help the Homebrew maintainers with debugging if you
> file an issue. If everything you use Homebrew for is working fine: please don't
> worry or file an issue; just ignore this.

That is what a gate earns when it fires on findings the user cannot act on. It is an
argument about width, not about polarity.

## 2. The survey, with the axis that predicts

> Round 16 §1 corrects the axis this section uses. "Who authors the severity" is a
> proxy: `rustc` is a counterexample, because its own default lints (`dead_code`,
> `unused_import`) exit 0. The rule that survives is that a finding gates when it
> means a declaration the user made is not in force; the tally below still fits, but
> the reason is that property, not authorship.

> Round 17 §1 adds the class this table omits: `codex doctor`, `brew doctor`,
> `expo-doctor` and `ripr doctor` gate their required checks, Vue Doctor and
> `claude doctor` require nothing, and the axis is which checks are required rather
> than whether the tool exits non-zero (D88, E-D97).

| Tool | Contract | Who authors the severity | Gates by default |
|---|---|---|---|
| `nginx -t` | non-zero on a config error | the tool | yes |
| `systemd-analyze verify` | non-zero on a bad unit; `--recursive-errors=MODE` decides whether warnings also return non-zero | the tool, with a caller switch | yes |
| `terraform validate` | exit status is what CI branches on | the tool | yes |
| `kubectl apply --validate=strict\|warn\|ignore` | the caller picks the mode | the caller | yes in `strict` |
| `git diff --check` | "Exits with non-zero status if problems are found" | the tool | yes |
| `shellcheck` | exit 1 for any problem, level not distinguished; `-S` filters | the tool | yes |
| `npm audit` | "will exit with a non-zero code if any vulnerability is found"; `--audit-level` moves the threshold | the tool | yes |
| `brew doctor` | `exit 1 if failed && fatal`, `fatal: true` | the tool | yes |
| `gh auth status` | exits 1 when any host has auth issues; `--json` always exits 0 unless fatal | the tool | yes, except `--json` |
| `flutter analyze` | fails on a message of any severity | the tool | yes |
| `yamllint` | default exits 1 only on errors; `-s`/`--strict` returns **2** for warnings-only | the user, per rule | no |
| `eslint` | "if ESLint runs and finds no errors (only warnings), it exits with a success exit status"; `--max-warnings` default `-1` | the user, per rule | no |
| `rustc` / `clippy` | `warn` "continues compilation"; `-D warnings` is the caller promoting it | the user, per lint | no |
| `pg_isready` | 0/1/2/3: accepting, rejecting, no response, no attempt | the tool, but it is a status query | n/a |

Two readings, and only the second one predicts anything.

**Reading one (the tally).** Every test view gates on findings by default. Unanimous
now that the brew cell is right. `--strict` is the only opt-in gate in the table.

**Reading two (the axis).** Where the severity is authored by the *user* — eslint
rule levels, rustc lints, yamllint's per-rule levels, flutter's `analysis_options` —
warnings are advisory and the gate is opt-in. Where the severity is authored by the
*tool* — shellcheck's levels, npm's audit levels, brew's findings, git's whitespace,
flutter's analyzer messages — the gate is on by default and the flag, when there is
one, relaxes it.

The doctor authors its own statuses. Its `warn` is not something the user configured,
and there is no per-row level to edit. On the axis that predicts, this doctor belongs
in the second group: gate by default, relax on request.

The multi-code exception in the table is yamllint's `2`, and it exists because
yamllint needs to distinguish "errors" from "warnings only". D71's reasoning is
unchanged: this gate answers *may I ship*, `fail` already uses 1, and a caller that
wants the reason reads the rows.

## 3. What the correction changes, and what it does not

**It does not change the row set (D69).** E-D77 runs this checkout under `--strict`:
`versions ok, platform ok, containment ok, plugins warn, policies ok, host warn,
posture ok, hooks ok, allowance skipped, ledger ok`, **exit 0**. Two rows warn on a
working tree and the narrow gate still passes. So the advisory rows were never
evidence against default-gating; they are evidence for the narrow row set.

**It does change D68's justification.** D68 gave two reasons: exit-code stability
for existing callers, and E-D73's advisory rows. E-D77 removes the second as a reason
for the polarity. E-D78 removes the first as a constraint: `scripts/` is not in the
published tarball (`files` is `dist`, `src`, four docs, README, LICENSE, CREDITS;
`npm pack --dry-run` lists 147 files and no `scripts/doctor.ts`), no workflow, script
or npm script consumes the doctor's exit code, and the `--strict` commit has never
been pushed. There is no caller to keep stable and no shipped default to change.

**It retires a citation.** Round 14 leaned on a CLI-rules source that puts "changing
strict mode defaults" on the breaking side. That rule presumes a strict mode someone
runs. Ours exists in one unpushed commit in a file the package does not ship.

## 4. Local measurements

| Id | Question | Result |
|---|---|---|
| E-D77 | Does the narrow gate fire on this checkout? | No. `bun scripts/doctor.ts --json --strict` exits 0 with `plugins` and `host` warning. Default exits 0 too. |
| E-D78 | Is the exit code a published surface? | No. `scripts/` is absent from `files` and from the packed tarball; `package.json` has one `doctor` script and nothing calls it; no workflow or `repro.sh` reference. |
| E-D79 | Can the report tell "asked and got nothing" from "did not ask"? | Yes, without a new field. The `--offline` branch writes `--offline: opencode's config was not read` and `options.offline` is in scope; `read` currently collapses the two facts, and splitting them is a two-line change. |
| E-D81 | Does `brew doctor` gate by default? | Yes. `def self.checks(type, fatal: true)` with `exit 1 if failed && fatal`, and the manpage: "Will exit with a non-zero status if any potential problems are found." The `fatal: false` caller is internal, for diagnostics after a failed build. |
| E-D80 | What does a default gate cost the suite? | Two table rows change expectation (`config` warn default 0→1, `read: false` default 0→1); both spawned `--offline` tests keep their current expectations under the ladder in §6; no assertion is deleted. |

## 5. Steelman and strawman

**Keep it opt-in (A).**

- *Steelman.* A diagnostic informs; a gate is policy, and policy belongs to the
  caller. `warn` is this doctor's own judgment and the two rows that produce it are
  young — `policies` from round 11, `config` from round 13 — so their calibration is
  not yet evidence-backed enough to fail a build. A default gate also makes `bun run
  doctor` exit 1 for a user who only wanted the report, and brew's manpage shows what
  that earns: a paragraph telling people to ignore it.
- *Strawman, retired.* "The field does not gate." False; the cell that said so was
  inverted.
- *Cost.* The silent failure returns. A pre-push hook, a release script or a CI job
  must know to ask, and the default certifies a config the host discarded — the exact
  failure rounds 11–14 kept finding.

**Gate by default (B).**

- *Steelman.* The gated set contains no innocuous finding: a file the host refused
  (the user's denies are not in force), a statement the host dropped (same), a run
  that never looked (nothing was checked). E-D77 shows the set does not fire on a
  working checkout even with two other rows warning, so brew's width problem does not
  arise. The field's default for tool-authored severity is to gate, and every tool
  that relaxes it does so because the user, not the tool, set the level.
- *Strawman.* "Exit 1 from a diagnostic is rude." `gh auth status`, `git diff
  --check` and `flutter analyze` all do it, and all three are run interactively.
- *Cost.* One interface change with no external consumer (E-D78), plus a rule for
  `--offline` (§6).

The conditions for a confident recommendation are therefore met: B is safe only if
the narrow set does not fire on a working tree (E-D77: it does not) and only if
nothing outside this tree consumes the exit code (E-D78: nothing does). Had either
come back the other way, A would be forced.

## 6. The ladder

Three states, each with one meaning, and both round-14 tests keep their expectations:

| Invocation | Config refused / statement dropped | `--offline` | `opencode` missing | Exit |
|---|---|---|---|---|
| `--no-strict` | ignored | ignored | ignored | 0 unless a `fail` |
| default | **fails** | passes — the user said do not look | **fails** | 1 / 0 / 1 |
| `--strict` | fails | **fails** — asked to gate and did not look | fails | 1 |

`--strict` keeps a job it already had: it closes the one hole the default leaves,
which is a run that was told not to look. D70 therefore stands unchanged
(`--offline --strict` → 1), and the two `--offline` tests keep asserting 0 because
they do not pass it.

## 7. What this round does not close

- **The Console-delivered policy plane.** Decoded on the vendor's side, unknown
  actions and effects filtered without a diagnostic (`anomalyco/opencode#60252`, open).
  Unchanged since round 11; nothing here can observe it.
- **A managed `/etc` file's rejection.** The unconditional clause covers the action
  ("ask whoever administers it"), and the open question is only whether the *detail*
  should say machine-managed. No root on this machine and no macOS, so a rejected
  file under a directory the reader cannot write is not measurable here. Closing
  condition: one such file on a host that still names it in the diagnostic stream.
- **The structured diagnostics surface upstream.** Still the durable fix; recorded as
  a limitation in `docs/compatibility.md`, not filed, because #60252 already asks for
  strict validation and a second issue would split the signal.
