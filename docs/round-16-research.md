# Round 16 research: the rule under the rule, and a flag that cannot be reached

Round 15 flipped the doctor's gate on and added `--strict` to close the `--offline`
hole. The flip is right. Two things around it are not: the sentence that justified
it over-generalises, and the flag that closed the hole does nothing on its own.

This round is mostly deletion and one paragraph. It measures three claims before
deciding any of them:

1. **The axis.** "Tool authors the severity ⇒ gate" is falsified by `rustc`, which
   authors `dead_code` and `unused_import` and exits 0. The rule that survives is
   narrower: gate when the finding means **a declaration the user made is not in
   force**, not when the artifact produced under it is merely improvable.
2. **The flag.** `--strict` changes `exitCode` only when `asked` is false, so it is
   reachable only as `--strict --offline`. A two-flag scheme (gate on, `--no-strict`
   off) covers every cell the ladder covers, and one cell changes.
3. **The code.** The field does split "could not evaluate" from "found problems",
   but not on a number: `2` means "could not evaluate" in eslint/grep and "found
   problems" in `git diff --check`. D71's single code is diagnostics-poor and
   policy-correct; this round records the cost rather than paying it.

Experiments E-D82–E-D89 are done. Probes: `scratch/round-16/s1.ts` (gitignored).

## 1. The axis is right for the wrong reason

Round 15 §2 states the rule as: where the severity is authored by the *user*
(eslint rule levels, rustc lints, yamllint per-rule levels), warnings are advisory
and the gate is opt-in; where it is the *tool's* (shellcheck, `npm audit`, brew,
`git diff --check`, `flutter analyze`), the gate is on. The tally follows.

The sentence has two readings, and the survey's prose uses the second:

- **Who sets the level.** The user can set `unused_variables = "deny"`; rustc's
  default is `warn`. Under this reading rustc is a user-severity tool and the axis
  holds.
- **Who invents the finding.** `unused_variables`, `dead_code`, `unused_import` are
  rustc's own lints, on by default, and the build exits 0 with them. Under this
  reading — the one "tool authors the severity" names — rustc is a tool-authored
  finding with the gate off, and the axis is false.

The most-used compiler in the survey's own world is the counterexample, so the axis
is a proxy that happens to fit the listed cells rather than the rule.

**What survives.** The gate is on when the finding says a declaration the user made
is not in force:

- brew: "potential problems" in the thing brew is for;
- shellcheck: the findings are the product;
- `flutter analyze`: a build's blockers;
- `npm audit`: known-vulnerable dependencies;
- `nginx -t` / `sshd -t` / `visudo -c`: the config cannot load, so nothing in it is
  in force (E-D86).

A compiler warning means the code compiles and runs — merely improvable — so the
artifact is fine and the gate stays off (E-D85). This doctor's `config` and
`policies` rows are the first kind: the deny you wrote is silently not enforced,
which is exactly the artifact being wrong. The conclusion is unchanged and now rests
on the property rather than on the count.

**The boundary.** `nginx -t` exits 0 on `[warn] conflicting server name … ignored`
(E-D86): a declaration *is* not in force and nginx still passes. So the property is
a better predictor than authorship, not a law. The qualifier that saves it: the
finding must defeat the purpose of the config plane the tool is testing. A
conflicting `server_name` degrades one virtual host; a dropped `deny` leaves the
action allowed. The doctor's rows are the second shape.

**Why this is not pedantry.** The coverage row is what round 17 inherits. If it says
"authorship ⇒ gate", the next reader finds rustc and either reverses the gate or
invents a distinction after the fact. If it says "a declaration not in force", rustc
is not a counterexample and the row set has a reason.

## 2. `--strict` has no cell of its own

`exitCode` in `scripts/doctor.ts`:

```
fail → 1
!gated → 0
!asked → strict ? 1 : 0
!answered → 1
config row or policies: warn → 1
else 0
```

`strict` appears once, in the `!asked` branch. `asked` is false only under
`--offline`. With `asked = true` and `answered = true`, `--strict` and the default
are the same function. So the ladder's top rung is reachable only as
`--strict --offline`, and that outcome is already expressible as "`--offline`
without `--no-strict`" once the gate is a function of `--no-strict` alone.

E-D82 ran five trees × four modes (default, `--no-strict`, `--offline`,
`--offline --no-strict`) against the shipped code and against the two-flag rule.
Across all 20 rows exactly one cell differs: `--offline` alone, 0 → 1. Every other
cell is identical, including `--offline --no-strict` at 0 and the host-absent tree
at 1. That is the whole behavioural cost of deleting the flag.

E-D83: nothing calls it. `--strict` appears only in this round's scratch probes, the
round-14/15 records, the test table, the README and `docs/compatibility.md`.
`package.json` has one `doctor` script with no arguments; no workflow, `repro.sh`, or
hook passes it. `docs/integration-landscape.md:368` is `--strict-mcp-config`, a
different tool.

**The name is also wrong.** In the field, `--strict` means "warnings count as
failures": yamllint returns 2 for warnings-only under `-s`; `poetry check --strict`
and `composer validate --strict` fail on warnings (E-D89). This doctor's `--strict`
does not touch warnings; it makes a deliberate skip fail. A reader who knows the
convention will read the flag wrong. Deleting it removes a name that means something
else everywhere else.

**What the two-flag scheme looks like.** Gate is `!noStrict`. `--offline` only
stops the spawn. `exitCode(checks, { gated, asked, answered })`:

```
fail → 1
!gated → 0
!asked → 1
!answered → 1
config row or policies: warn → 1
else 0
```

Every cell:

| invocation | gated | asked | answered | exit |
|---|---|---|---|---|
| default, clean | yes | yes | yes | 0 |
| default, config dropped | yes | yes | yes | 1 |
| default, host absent | yes | yes | no | 1 |
| `--no-strict`, any of the above | no | — | — | 0, unless `fail` |
| `--offline` | yes | no | no | 1 |
| `--offline --no-strict` | no | no | no | 0 |

The one user-visible change: `--offline` alone moves 0 → 1. The README's CI sentence
must change with it: the report-only escape becomes `--no-strict`, and `--offline`
is only "do not spawn the host".

## 3. The exit code: the field splits, but not on a number

E-D84 measured what is installed here; E-D85/E-D86/E-D89 cite what is not.

| Tool | clean | found problems | could not evaluate |
|---|---|---|---|
| eslint (6.4.0, measured) | 0 | 1 | 2 (config/internal) |
| grep (3.12, measured) | 0 | 1 (no match) | 2 (error) |
| `git diff --check` (2.53, measured) | 0 | 2 | — |
| yamllint (cited) | 0 | 1 errors; 2 warnings under `--strict` | — |
| alint (cited) | 0 | 1 findings **or** incomplete analysis | 2 bad config; 3 internal |
| vize doctor (cited) | 0 | 1 blocking error | 2 analysis failed |
| Vue Doctor (cited) | 0 | 1 gate breached | 2 usage; 3 analyzer under `--strict` |
| ripr (cited) | 0 | 0 for `check`; 2 for `gate evaluate` blocked | 2 (input, config, analysis, output) |
| `terraform validate` (cited) | 0 | 1 | — |
| GitHub Actions (cited) | success | failure | failure (any non-zero) |

Three readings:

1. **The kind is real.** eslint, grep, vize and Vue Doctor all reserve a code for
   "the tool could not do its job". eslint's split was a deliberate breaking change
   (issue #9384), motivated by exactly this: "on an automated script, we can't see
   the difference".
2. **The number is not a contract.** `2` is "could not evaluate" in eslint/grep and
   "found problems" in `git diff --check`; alint collapses analysis failure into 1;
   `terraform validate` returns 1 for both. A caller that ports its reading from one
   tool to another is wrong.
3. **CI does not consume it.** GitHub Actions maps any non-zero to failure; to branch
   on 1 vs 2 a step needs `continue-on-error: true` and an explicit check. The
   pattern exists (Ping CLI's opt-in `--detailed-exitcode`), but it is opt-in
   everywhere it exists.

D71 chose one code because "a caller that gates asks whether it may ship". That is
still true, and E-D78 says no caller exists. The cost is real and now recorded: a
script cannot tell "your config is broken" from "`opencode` is missing" without
reading the JSON, and the `--offline` case makes it worse — "not asked" is a
deliberate skip, not an error, so a second code would either call a skip an error or
need a third code.

**Recommendation:** keep one code. Record the cost in the coverage row and name the
flip condition: a caller that branches on it, or `scripts/` becoming a published
surface. Do not add `--detailed-exitcode`: it is the same shape as `--strict`, a
flag that exists to be combined.

## 4. `plugins` under the corrected rule

D79 kept `plugins` advisory. The property rule reopens it, because the row has three
sub-cases and only one is a declaration-not-in-force:

| case | what the user declared | in force? | current status |
|---|---|---|---|
| no entry names the package | "load this plugin" | no — it will not load | `warn` |
| published build listed, checkout not | "run this code" | no — another copy runs | `warn` |
| two entries load | "load one copy" | partly — both load | `warn` |

Under the property, the first is the strongest candidate for the gate: the plugin
does not load at all. The second is the "testing one thing, running another" hazard,
but the artifact works (E-D73: this checkout's own run warns it and the tree is
fine). The third is a shadow, not a failure.

Splitting the row needs a fact the row does not carry: the gate would have to
distinguish "not listed" from "listed, but the other copy" without matching the
detail string. D80 forbade a `gate` field in `--json`, and a string match is the
kind of thing round 13 deleted. So the options are: keep advisory (D79), make "not
listed" a `fail` (which gates even under `--no-strict`, a bigger change), or add a
structured reason. The first is the smallest, and the row already prints a
remediation that names the exact entry to add.

## 5. Steelman and strawman

**For deleting `--strict`.** A flag whose only effect is inside another flag's
branch is a trap: it reads as a policy and behaves as a modifier. The two-flag
scheme is smaller, orthogonal, and every cell is reachable. The name also means
"warnings fail" in three other tools.

> Round 17 §5 corrects the name argument: `--strict` is split, not foreign.
> yamllint, `poetry check` and `composer validate` use it for warnings-fail; Vue
> Doctor uses it for "exit 3 if any analyzer fails or is skipped". The deletion
> stands on reachability (D82, D83); the name is ambiguous (D89, E-D98).

**Against deleting it.** Three rungs are self-documenting, and `--strict` is a
familiar word; a caller who wants "offline but gated" loses a one-flag spelling.
*Response:* under the two-flag scheme that caller writes `--offline` alone, which is
one flag, and the outcome is identical. What they lose is the *name*, not the cell.

**For a second code.** A human or script can tell "fix the config" from "install the
host", which is the diagnostics-poor cost D78 names, and eslint/grep/vize all do it.

**Against a second code.** No caller exists (E-D78); CI collapses it; the number is
not portable across tools; and the doctor's "could not evaluate" has three
sub-cases, one of which (not asked) is not an error at all.

**For keeping the gate on.** The rows are declaration-not-in-force, and the field's
config testers gate (E-D86). The brew counter-lesson is about width, not polarity:
brew gates *and* tells you to ignore it, which is an argument for a narrow row set.

**Against the gate.** Sentinel's doctor blog states the opposite rule and the reason:
"if a warning exits non-zero, then on any platform with a routine warning the
command always fails, people wrap it in `|| true`, and the check silently stops
running." That is E-D73's measurement in prose. The answer is the narrow set, which
E-D77 showed does not fire on a working checkout.

## 6. Local measurements

| Id | Question | Result |
|---|---|---|
| E-D82 | Which cells differ between the shipped ladder and the two-flag rule? | One, across 5 trees × 4 modes: `--offline` alone, 0 → 1. `--offline --no-strict` 0, host absent 1, config trees 1, `--no-strict` 0. |
| E-D83 | Does anything call `--strict`? | No. Only records, tests, scratch, README and compatibility. `package.json`'s `doctor` script takes no arguments; no workflow or `repro.sh` reference. |
| E-D84 | What do installed tools return? | eslint 0/1/0/2 (clean/warn/error/config); grep 0/1/2; `git diff --check` 0/2. |
| E-D85 | Does rustc gate its own lints? | No, by design: `build.warnings` defaults to `warn`; `-D warnings` is the caller's promotion; a clippy maintainer's answer in the project's discussion says a non-zero exit on a successful compilation "would not make sense". Not installed here, so cited. |
| E-D86 | Do config testers gate? | `nginx -t` 0/1, `sshd -t` 0/non-zero, `visudo -c` 0/non-zero; `nginx -t` passes a conflicting `server_name` with 0. Cited. |
| E-D87 | What does deleting the flag cost the test table? | 13 → 10 rows: two duplicate `strict` rows and the `--offline --strict` row go; the `--offline` row changes 0 → 1; the spawned `--offline --strict` test becomes `--offline` expecting 1. No assertion is deleted without a replacement. |
| E-D88 | Does the README instruct `--offline` alone as the CI escape? | Yes, lines 526–528. No workflow does. The sentence must change to `--no-strict`. |
| E-D89 | What does `--strict` mean elsewhere? | yamllint: warnings → 2; `poetry check --strict` and `composer validate --strict`: warnings fail. This doctor's flag does neither. Cited. |

## 7. What stays unmeasurable

- rustc/cargo are not installed here; the counterexample rests on the Cargo config
  reference and clippy's own discussion, not a local run.
- A real CI consumer of the exit code: there is none in this tree (E-D78), so the
  cost of a second code is argued, not observed.
- Whether a person running `bun run doctor` on a broken machine prefers 1 or 2. That
  is the product question, not an experiment.

## 8. Sources

- ESLint, exit codes and `--exit-on-fatal-error`:
  https://eslint.org/docs/latest/use/command-line-interface ; the split's history:
  https://github.com/eslint/eslint/issues/9384
- yamllint, `--strict` returning 2 for warnings:
  https://yamllint.readthedocs.io/en/latest/configuration.html
- Cargo `build.warnings` (default `warn`, MSRV 1.97):
  https://doc.rust-lang.org/stable/cargo/reference/config.html
- clippy, warnings exit 0 by design:
  https://github.com/rust-lang/rust-clippy/discussions/11942
- brew doctor, non-zero on any finding: https://docs.brew.sh/Manpage
- nginx `-t` (0/1, warnings pass): https://nginx.org/en/docs/switches.html and
  https://errcodex.com/commands/nginx/nginx-t-test-configuration
- `sshd -t`: https://man.openbsd.org/sshd.8 ; `visudo -c`:
  https://www.tecmint.com/check-configuration-files-linux/
- GitHub Actions, any non-zero is failure:
  https://docs.github.com/en/actions/how-tos/create-and-publish-actions/set-exit-codes
- alint, vize doctor, Vue Doctor, ripr exit-code pages: cited in §3 from their
  published docs.
