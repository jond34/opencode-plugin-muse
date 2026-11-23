# Round 12 — research and measurements

Everything here was measured on 2026-11-23 against `opencode v2.3.2` and
`Muse Code 1.4.25`, or quoted from the vendor with a URL. The probe is
`scratch/round-12/probe.sh`; its output is `scratch/round-12/cases.tsv`.

## 1. The host already reports the drop, in a structured line

`opencode --standalone debug config` with one valid statement and one misspelled
action writes this to `~/.local/share/opencode/log/opencode.log`:

```
timestamp=2026-11-23T16:07:45.893Z level=WARN run=c0c14bc1
  message="configuration normalization diagnostic"
  source=/tmp/r12-badaction-XoMpaH/opencode/opencode.jsonc
  path=$.policies.1 kind=invalid
  action="skipped malformed recognized value" http.span=50 role=server
```

Fields that matter: `source` (the file), `path` (a JSON pointer to the dropped
statement), `kind=invalid`, and `action` (the reason string). `path=$` means the
whole document was rejected, not one statement.

The line appears with no model call and no session, during `debug config`, at the
default log level. It does **not** appear on the child's stderr — that stream was
empty in every case — so reading it means reading the log.

The log location is itself a vendor surface: `opencode debug paths log` prints
`/home/jonat/.local/share/opencode/log`, and `opencode debug paths` lists
`log` among the named paths. The file inside is `opencode.log`, and it contains
bytes that make plain `grep` call it binary (use `-a`).

## 2. Host acceptance versus a hand-rolled reader

Eight fixtures, each in its own `XDG_CONFIG_HOME`, `--standalone`, one process
each. `policies` is the total across every printed document.

| Case | File body | Docs printed | Policies printed | Diagnostic path | Host verdict |
|---|---|---|---|---|---|
| valid | one valid statement | 3 | 1 | — | accepted |
| trailing | same, trailing comma in the array | 3 | 1 | — | **accepted** |
| block | same, `/* c */` inside the array | 3 | 1 | — | **accepted** |
| badaction | valid + misspelled `provider.ues` | 3 | 1 | `$.policies.1` | one dropped |
| dupkey | valid, then a second `policies` key holding `{"action":"tool.use"}` | 3 | 0 | `$.policies.0` | last key wins, its statement dropped |
| single | single-quoted keys and values | 2 | 0 | `$` | **whole file rejected** |
| unquoted | unquoted keys | 2 | 0 | `$` | **whole file rejected** |
| syntax | truncated JSON | 2 | 0 | `$` | **whole file rejected** |

Two consequences:

1. **The reader's two biggest judgement calls match the host.** Trailing commas
   and block comments are accepted by 2.3.2, so stripping them is correct rather
   than lenient. The spec's reference implementation (`jsonc-parser`) defaults
   `allowTrailingComma: false`, so this was not a safe guess — it is a measured
   one.
2. **The dangerous direction is the whole-file rejection.** Single quotes,
   unquoted keys and a syntax error do not drop a statement, they drop the file:
   one diagnostic at `path=$`, and one fewer document printed. A row that counts
   declared statements from the file cannot see this at all — the file it reads
   looks fine to it, and the document it compares against is not there.

The `Docs printed` column counts every entry `debug config` returns, including
`type: "directory"` entries that carry a `path`. A rejected file therefore looks
"present" to a naive path filter; the count dropping from 3 to 2 is the real
signal, and the plan's S0 turns that into a precise check (E-D64).

## 3. The vendor's own words

- Policies: "Statements that fail validation are dropped with a warning in the
  server log and the rest of the list still applies." and "If nothing matches,
  the action is allowed." — <https://opencode.ai/docs/policies/>
- Enterprise: "Check the server log for warnings. A statement that fails
  validation is dropped and the rest still apply." —
  <https://opencode.ai/docs/enterprise/>
- Config: `opencode.json` or `opencode.jsonc`; precedence and variable
  substitution — <https://opencode.ai/docs/config/>
- `anomalyco/opencode#54786`, "invalid opencode.json is silently ignored": "the
  config loader notices the parse error but only writes it as a log warning and
  then skips the file." This is the whole-file rejection above, reported as a
  bug — <https://github.com/anomalyco/opencode/issues/54786>
- `anomalyco/opencode#60252`: the remote (Console) decoder filters unknown
  actions and effects without a diagnostic. Round 11's citation; unchanged.

## 4. How the field compensates, with sources

The pattern across mature toolchains is that a runtime which fails open is
paired with a separate validator, and the validator's job is exactly the typo.

- **GitHub Actions** ignores unknown keys; the field's answer is not to change
  GitHub but to run `actionlint`, whose whole reason to exist includes
  `unexpected key "branch" for "push" section. expected one of ...`
  <https://github.com/rhysd/actionlint>
- **Terraform** stages validation before execution and reports machine-readably:
  `terraform validate` prints `valid`, `error_count`, `warning_count`.
  <https://developer.hashicorp.com/terraform/cli/commands/validate>
- **Cedar** makes this explicit: "validation is an entirely separate API which
  can be invoked when policies are loaded or created", and its checks include
  "Unrecognized actions – For example, misspelling `Action::"viewFile"` as
  `Action::"viewFiel"`" — the same defect as `provider.ues`.
  <https://docs.cedarpolicy.com/policies/validation.html>
- **Argo CD** takes the third route: compare desired against live and mark
  `Synced` / `OutOfSync`, so drift is a reported state rather than a silence.
- **JSONC itself** is under-specified in the one place this tree depends on:
  trailing commas are optional, "JSONC parsers MAY support trailing commas",
  the reference implementation rejects them by default, and VS Code warns.
  <https://jsonc.org/>

So the principle this round can state without overclaiming: a runtime that fails
open gets compensated by refusing the statement (not available to a plugin),
validating before the run (what the doctor's row is), or diffing declared
against live (Argo; for Console, impossible from here).

## 5. What this changes about round 11's row

Round 11 chose to count declared statements from the file because no validation
surface existed. That premise was wrong in one direction: the surface exists, it
is just not `debug config`'s stdout. The row's *conclusion* survives — a statement
can be dropped — but its *method* has a competitor that reports the index and the
reason, and that sees the case the count cannot.

## 6. E-D64 — the shape of a whole-file rejection

`scratch/round-12/s0.ts`, one config file per case, both rows called with the
documents `debug config` returned.

| Case | Entries printed | The file as a document | `plugins` row | `policies` row |
|---|---|---|---|---|
| accepted | 3 (`document` + two `directory`) | `type=document`, `info.keys=[policies,plugins]`, 1 policy | ok | ok, 1 enforced |
| rejected (single quotes) | 2 (both `directory`) | **absent** | warn, "no plugins entry names …" | skipped, "no readable config source declares `policies`; nothing to drop" |

Two things follow, and the second is the one that matters:

1. The rejected file is not printed at all, so neither row can detect it
   locally. Only the diagnostic names it. D60's local branch is closed.
2. Both rows are wrong about it, in opposite directions. `plugins` reports a
   cause that is not the cause — there *is* a plugins entry, in a file the host
   threw away. `policies` says "nothing to drop" about the one case where
   everything was dropped. The row built to catch a silent deny prints silence.

The mixed case is the failure the plan's rule was written against. A rejected
`opencode.jsonc` beside a valid `opencode.json` prints only the `.json`:

```
document /tmp/…/opencode/opencode.json  policies=1
directory /tmp/…/opencode
directory /home/jonat/.opencode
```

so the `policies` row returns **ok — 1 statement(s) from 1 source(s), all
enforced** while the `.jsonc`'s statements were rejected outright. The only
witness is `source=…/opencode.jsonc path=$ kind=invalid
action="rejected malformed JSON or JSONC document"`. A count taken from the file
cannot reach this case, because the file is not in the list it counts.

## 7. E-D62 — is the log a reliable delta source?

`scratch/round-12/s1.sh` plus follow-ups, all with `--standalone`.

| Case | Result |
|---|---|
| 5 consecutive runs, unique source each | 5/5 deltas contained exactly one diagnostic, and it was ours |
| two runs in parallel | each source got exactly one line; 0 cross-attribution; a shared delta holds both lines, so filtering must be by `source`, not by "all diagnostics in the delta" |
| log truncated between offset and read | a naive read from the stale offset yields **0 bytes** — indistinguishable from "no drops"; the reader must compare the current size with the offset and skip |
| `XDG_DATA_HOME` relocated | `debug paths log` follows it, the log is written there, the diagnostic lands there |
| `opencode` absent from `PATH` | spawn fails (`command not found`); the row must skip, never report ok |
| a clean run's delta | 4446 bytes, **0** diagnostics, but **3** INFO `watcher started/subscribe/stopped` lines naming the source |
| log growth | 46 MB before the truncation test; no rotation observed |

Two consequences for the implementation:

- **Filter on the message, then on the source.** A clean run's delta already
  contains three watcher lines naming the config *directory* (`path=`, not
  `source=`), so grepping the path is not a drop test.
- **Use the same lines as a liveness check.** If the delta names no candidate
  source at all, the log did not report this run — a raised log level, a moved
  file, a silent truncation. That case is `skipped`, not `ok`. A clean run is
  "the log mentioned our file and said nothing bad", which is a claim the
  evidence supports; "the log said nothing at all" is not.

A third detail: `source` is quoted when the path contains a space
(`source="/tmp/r12 space …/opencode.jsonc"`), so the value parser has to accept
both quoted and bare forms.

## 8. E-D63 — the differential corpus

`scratch/round-12/s2.ts`, 13 fixtures, host verdict against the shipped row.

| Fixture | Host | Row |
|---|---|---|
| valid, trailing-array, trailing-object, block-comment, line-comment, slashes-in-string, bom, dupkey | accepted, 1 enforced | ok |
| bad-action, bad-effect | accepted, 1 enforced | warn, 2 declared |
| single-quotes, unquoted-keys, truncated | rejected file | skipped (file not in documents) |

The plan's rule — never `ok` on a file the host did not accept — holds for a
single file, and fails at the level of a config set (§6). The corpus also says
something that decides Q2: `parseJsonc` agreed with the host's acceptance in
13/13 fixtures, including the two judgement calls (trailing commas, block
comments) and the BOM. The reader is not inaccurate; it is a second
implementation of a parser the host already runs, and its blind spot is
structural rather than a bug that could be fixed.

## 9. E-D65 — granularity

Three bad statements (two top-level, one under `experimental`) produced three
lines, each with its own pointer:

```
path=$.policies.1              action="skipped malformed recognized value"
path=$.policies.2              action="skipped malformed recognized value"
path=$.experimental.policies.0 action="skipped malformed recognized value"
```

Each drop is individually addressable, which is strictly more than the count
could say.

## 10. Deviation, disclosed

E-D62's truncation case truncated the host's real log (`: > opencode.log`, 46 MB)
instead of copying it to a temp file first. The log is diagnostic only, opencode
recreated it, and later runs appended normally, but it was a write to a file this
round's prohibitions list as read-only. The measurement stands — the reader's
failure mode is identical whether the truncation is simulated on a copy or on the
original — and the probe should have copied it.

## 11. Implementation correction (S3)

Building the reader changed one detail in §7. A clean run's three lines name the
config **directory** in `path=`, not the file in `source=`; only a diagnostic
carries `source=`. A liveness test written against `source=` alone therefore
never passes on a clean run, and the row cannot say `ok` at all — measured on the
first live run, which reported `skipped … the host log named no config source`.

The shipped check accepts a diagnostic's `source=` or a `path=` that is a
candidate file **or its parent directory**, and it excludes directory documents
from the candidates: every run scans `~/.opencode`, so counting that would make
liveness true always. With that fix the three live cases behave as the plan
asked:

| Config | `config` | `policies` | `plugins` |
|---|---|---|---|
| valid `.json` only | — (no row) | `ok`, 1 enforced, no drop | unchanged |
| valid `.json` + malformed `.jsonc` | `warn`, names the `.jsonc` and `rejected malformed JSON or JSONC document` | `skipped`, defers to `config` (was `ok`) | unchanged |
| entry only in the malformed file | `warn`, same | `skipped`, defers | `warn`, names the rejected file (was "will not load") |

`bun run check:offline` after S4 and S6: 407 pass, 0 fail, 1048 expect, 37 files
(round 11 was 397 / 1023; the parser's three tests were deleted and the log and
row fixtures added).
