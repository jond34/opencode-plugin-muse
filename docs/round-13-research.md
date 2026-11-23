# Round 13 research: which config files can this run have read?

Round 12 made the doctor read the host's `configuration normalization diagnostic`
instead of parsing the file, and added a `config` row for a whole-file rejection.
It left one hole, and the hole is a list: `configCandidates()` decides which
diagnostics belong to this run by matching `source=` against the files the host
printed plus three hand-written roots. The host's precedence is wider than that
list, so a rejected file outside it is invisible — and `policies` can return `ok`
over a discarded config, which is the exact failure round 12 closed, one
directory up.

This round asks a different question than round 12 did. Round 12 asked "what
does the host say?"; this one asks "how do we know it is talking about us?".

## 1. What mature config-driven runtimes do

The pattern is two views: one that shows the effective configuration, one that
tests it.

| Tool | Show | Test |
|---|---|---|
| nginx | `-T` dumps every config file | `-t` "checks the configuration for correct syntax, and then tries to open files referred in the configuration" |
| systemd | `systemctl cat` / `show` | `systemd-analyze verify`, which reports "unknown sections and directives" |
| Terraform | `plan`, `state` | `validate`, with `valid`, `error_count`, `warning_count` |
| Cedar | policy store | a separate validation API; its canonical example is a misspelled action |
| Kubernetes | `get` | `apply --validate=strict`, `--dry-run=server` |
| GitHub Actions | the workflow | nothing — `actionlint` filled the gap |

The split exists because a dump can only show what survived. A file that failed
to parse is not in the dump, so a tool that reads only the dump cannot report it.

opencode is in the `actionlint` camp. Measured on 2.3.2:

- `opencode debug config` describes itself as "List configuration sources", and
  prints only the documents that loaded.
- `opencode debug config --help` has no validation flag, no file-list flag. The
  subcommands are `agents`, `config`, `heap-dump`, `paths`.
- The diagnostic goes to the server log and nowhere else, unless you pass
  `--print-logs`.

So the doctor is the `-t` view for this host, and it has to be built out of the
host's own output. Round 12 chose the log file. This round measured whether the
log file is the right source.

## 2. How wide the host's precedence actually is

The v2 docs: "OpenCode searches from the current directory to the filesystem
root. It first merges direct `opencode.json(c)` files from the farthest directory
to the closest, then merges files inside `.opencode` directories in the same
order." Plus the global config dir, `$OPENCODE_CONFIG`, `$OPENCODE_CONFIG_CONTENT`,
the system directory (`/etc/opencode` on Linux, `/Library/Application Support/opencode`
on macOS, `%ProgramData%\opencode` on Windows), and MDM-managed preferences on macOS.

The v1 docs say something else: "traverses up to the nearest Git directory". Two
published versions of the same rule, and they disagree about where the walk stops.
That is the argument against hardcoding the rule, and E-D66 tested which one 2.3.2
implements.

## 3. E-D66 — ancestor configs are read, and the filter drops them

Six trees, temp `XDG_CONFIG_HOME`, `--standalone`, cwd placed at a known depth.
"A" is the merge-order control; B–F each put the malformed file somewhere other
than the cwd.

| Case | Where the malformed file is | Host read it | Shipped candidates | Shipped diagnostics |
|---|---|---|---|---|
| A | — (both valid) | merges `a/` then `a/b/cwd/` | 2 | 0 |
| B | two levels up | yes | 1 | **0** |
| C | cwd | yes | 2 | 1 |
| D | four levels up | yes | 1 | **0** |
| E | above a `.git` directory | yes | 1 | **0** |
| F | parent, nothing in cwd | yes | 0 (not live) | **0** |

Three things fall out.

1. The walk does not stop at a Git root in 2.3.2. Case E put `.git` at `repo/` and
   the malformed file above it; the host read the file. The v1 sentence is stale.
2. A rejected ancestor is invisible to the shipped filter in B, D and E: the
   diagnostic is in the delta, with the right `source=`, and the candidate set
   does not contain that path, so `config` has no row and `policies` says `ok`.
   B is the round-12 bug with the file one directory up.
3. Case F is worse in a different way: with no local config file at all, the
   candidate set is empty, so liveness fails and `policies` reports `skipped`
   with "the host log named no config source" — a true sentence about the log and
   a misleading one about the config. The finding is lost either way.

## 4. E-D67 — the other roots, measured

| Root | Read by 2.3.2 | Attributed when malformed |
|---|---|---|
| `<dir>/opencode.json(c)` for every ancestor | yes | yes, `source=<file> path=$` |
| `<dir>/.opencode/opencode.json(c)` for every ancestor | yes | yes |
| `$OPENCODE_CONFIG` | yes | yes, `source=<that path>` |
| `~/.opencode/opencode.json` (v1-style global) | **no** | n/a |
| `/etc/opencode` | not testable here (no root) | documented only |
| macOS managed paths | not testable here | documented only |

Two corrections to the plan that was handed to this round:

- The proposal was to treat the host's `directory` documents as scan roots. That
  does not work: the host prints a `directory` document for the global config dir
  and for each `.opencode` directory that exists, but **not** for a plain ancestor
  directory that holds no config. In cases B, D and E the proposed candidate set
  was identical to the shipped one, so it fixed nothing.
- `~/.opencode/opencode.json` is never read by 2.3.2. The hand-list carries it
  anyway. It costs two `stat` calls and contributes no diagnostic ever.

## 5. E-D68 — `run=` is not one id per process

Two concurrent spawns, one in a tree with a malformed ancestor, one clean. The
delta held four `run=` values: two single-line groups with `message="cli starting"`,
and two groups of ~25 lines carrying the watcher lines and the diagnostic. So a
spawn produces at least two run ids (CLI and server), and the id in the diagnostic
is not the id the CLI announces. `run=` separates concurrent processes from each
other, which is useful, but it cannot prove that a diagnostic belongs to *our*
spawn. Rejected as an attribution key.

## 6. E-D69 — a debug-level run does not list accepted sources

`--log-level debug --print-logs` names only the files that failed, not the files
that loaded. So raising the level does not produce a source list to filter
against.

## 7. E-D70 — `--print-logs` makes the log ours

The doctor spawns the host, so it controls the flags. `--print-logs` sends this
process's log to stderr; `--standalone` is already in the spawn, which the help
text requires for server logs.

| Run | Level | stderr lines | Diagnostic on stderr |
|---|---|---|---|
| clean | default | 25 | none |
| malformed ancestor | default | 34 | yes, `source=<file> path=$` |
| malformed ancestor | `warn` / `info` / `debug` | 34–36 | yes |
| clean | `debug` | 35 | none |
| no `--print-logs` (control) | default | 0 | no |

Concurrency: two spawns at once, one bad and one clean, each stderr carried only
its own diagnostic. No cross-contamination, because stderr is per-process by
construction.

This deletes the question instead of answering it. The diagnostic arrives on a
stream that belongs to our spawn, so "is this ours?" is true by construction and
no candidate list is needed — not the ancestors, not `.opencode`, not `/etc`, not
`$OPENCODE_CONFIG`, not the macOS paths. It also deletes the log path lookup, the
byte offset, the truncation guard and the 4 MiB read, and removes one subprocess
(`opencode debug paths log`).

## 8. E-D71 — the statement half survives

`policyRow` depends on statement-level drops, so the same stream was tested with
a malformed second policy and with `experimental.policies`:

| Config | Diagnostic |
|---|---|
| second policy has `"effect": "maybe"` | `path=$.policies.1 kind=invalid action="skipped malformed recognized value"` |
| `experimental.policies[0]` missing `resource` | `path=$.experimental.policies.0 kind=invalid action="skipped malformed recognized value"` |
| clean | none |

`message="cli starting"` is the first structured line on every run, clean or not,
which gives the liveness check a stable marker.

## 9. Options, steelmanned and strawmanned

**Option 1 — patch the list (ancestor walk).** Walk the cwd to `/`, add
`.opencode` at each level, add `/etc/opencode`, `$OPENCODE_CONFIG` and the macOS
paths.

- Steelman: keeps round 12's dependency surface unchanged; works when
  `--print-logs` is missing; the rule is documented and now measured.
- Strawman: it is a re-implementation of a rule that already changed between v1
  and v2, in a tool whose whole argument is that it does not re-derive host
  behaviour. Every future root is a new silent hole of exactly the kind this
  round exists to close. It needs a `stat` per level per name, and a test per root
  that CI cannot verify against a host.

**Option 2 — read our own stderr.** Add `--print-logs` to the spawn and parse
stderr.

- Steelman: attribution is exact, so there is nothing to enumerate and nothing to
  drift. Deletes ~80 lines and one subprocess. Case F (no local file) works
  without special handling.
- Strawman: it depends on a flag documented as a debugging aid, and on the
  message text staying put. If either changes, the row degrades — but it degrades
  to `skipped`, never to a false `ok`, because `ok` requires a liveness line on
  the same stream. That is the failure direction the round can tolerate.

**Option 3 — keep the log file and add the walk.** Belt and braces.

- Steelman: two independent sources; either one can fail alone.
- Strawman: two sources means two truths, and the log file is the one that can
  carry another process's lines. The round's own contract — "diagnostics for a
  config file this run read" — is only provable with the stderr.

## 10. Conditions for the recommendation

Option 2 is recommended because all six conditions held on the installed host:

1. the flag exists and is accepted (`--help`, measured);
2. the default level carries the diagnostic, so no level flag is needed;
3. a clean run still prints a structured line, so `ok` is distinguishable from
   silence;
4. statement-level and `experimental.policies` drops arrive on the same stream;
5. two concurrent spawns do not see each other's diagnostics;
6. the JSON on stdout is unaffected.

If condition 1 or 3 fails on a future host, the row says `skipped` and names the
reason; it never claims `ok`.

## 11. Deviations

- The first E-D66 probe built its candidate list from `process.cwd()` instead of
  the cwd it passed to the spawn, which under-counted the shipped set in case C.
  Fixed and rerun; the table above is the rerun.
- The first E-D70 probe put the malformed file in a *descendant* of the cwd, so
  the host never read it and the flag looked broken. Fixed and rerun; the table
  above is the rerun.
- `/etc/opencode` and the macOS managed paths could not be exercised: no root on
  this machine, no macOS. They are documented, not measured, and Option 2 makes
  them irrelevant.

## 12. Implementation, measured

S4 ran the four trees through the doctor's own `opencodeConfig()` and rows, with a
temp `XDG_CONFIG_HOME` and a copied `auth.json`:

| Tree | `live` | diagnostics | `config` row | `policies` row |
|---|---|---|---|---|
| clean | true | 0 | none | `ok`, 1 statement from 1 source |
| valid `opencode.json` beside malformed `opencode.jsonc` | true | 1 | `warn`, names the `.jsonc` and the host's action | `skipped`, defers to `config` |
| valid in the cwd, malformed two levels up | true | 1 | `warn`, names the ancestor | `skipped`, defers to `config` |
| one malformed statement | true | 1 | none | `warn`, names `$.policies.1` |

The third row is the hole this round exists to close: the same tree was silent
under round 12. `bun run check:offline` after the change: 405 pass, 0 fail, 1053
expect, 37 files. The count is two lower than round 12 because the tests of the
deleted log reader went with it; the behavioural cases were kept and the ancestor
case was added.

## 13. What this does not answer

The Console-delivered policy plane stays `P`: silent locally and remotely, cited
at #60252. `#54786` records that a whole-file rejection is logged and skipped,
which confirms E-D64 from the vendor's side but does not change the doctor's
reach. Whether Muse ever ships a binding policy member is unchanged.
