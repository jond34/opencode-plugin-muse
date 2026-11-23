# Round 13 plan: attribution without a candidate list

Round 12 read the host's diagnostic from the server log and matched it to this
run by path. The match is a hand-written list of config locations, and the host's
precedence is wider, so a rejected file outside the list is dropped: `config` has
no row and `policies` can say `ok`. This round removes the list rather than
extending it.

Research: `docs/round-13-research.md`. Experiments E-D66–E-D71 are done; the
tables there are the evidence for every decision below.

## 1. The finding that changes the shape

The proposal this round started from — treat the host's `directory` documents as
scan roots — does not work. E-D66 B/D/E measured it: the host prints a
`directory` document for the global config dir and for `.opencode` dirs that
exist, but not for a plain ancestor, so the proposed set equals the shipped set
in exactly the cases that fail.

E-D70 found the better move. The doctor spawns the host, so it can pass
`--print-logs`, which sends that process's log to stderr. The diagnostic arrives
on a stream that belongs to our spawn, so attribution is exact and the candidate
list is not needed at all. The same stream carries statement-level drops
(E-D71), and two concurrent spawns never see each other's lines.

## 2. Decisions

**D63 — attribute by stream, not by path.** The spawn becomes
`opencode --standalone --print-logs debug config`; diagnostics are parsed from
its stderr. `logFile()`, `readLogDelta()`, `configCandidates()` and the
`source`-set filter in `configDiagnostics()` are deleted, along with the
`opencode debug paths log` subprocess. Nothing replaces the list: with stderr
there is nothing to enumerate.

**D64 — liveness is a structured line on the same stream.** `message="cli
starting"` is the first structured line on every run, clean or not (E-D70,
E-D71). `ok` requires at least one line carrying both `timestamp=` and `level=`.
Empty stderr with a zero exit is `skipped` — "the host printed no log for this
run" — because that is what a host without `--print-logs` looks like, and a
silent stream must never read as a clean config.

**D65 — one spawn, two outputs.** `opencodeConfig()` returns `{ documents,
stderr, status }` instead of the parsed JSON alone. A non-zero status or a JSON
parse failure still yields `undefined` documents, and the rows stay `skipped` as
they are today.

**D66 — the `config` row and the deferrals do not change.** The row still owns
`path=$`, still names the file and the action, and `plugins`/`policies` still
defer to it. Only the source of the diagnostics moves.

**D67 — the records say "this run's own log output", not "the server log".**
README, `docs/compatibility.md` and the coverage audit are updated in the same
round, because the previous wording described the mechanism that is being
deleted.

## 3. Phases

| Phase | Work | Gate | Status |
|---|---|---|---|
| S0 | E-D66–E-D71: ancestors, `.opencode`, `$OPENCODE_CONFIG`, `run=`, debug level, stderr, statement drops | each question answered by a table, not an opinion | done — research §3–§8 |
| S1 | Spawn with `--print-logs`, parse stderr, keep the diagnostic fields | `bun run check:offline` green; the three live cases unchanged | todo |
| S2 | Delete `logFile`, `readLogDelta`, `configCandidates`, the source filter, and their tests | no dead exports; `tsc` clean | todo |
| S3 | Re-point the `config`, `plugins` and `policies` fixtures at stderr; add the ancestor case and the silent-stream case | suite green, and the ancestor fixture fails if the list ever comes back | todo |
| S4 | Live: clean, mixed valid+malformed, malformed ancestor, statement drop | each row says what §5 of the research predicts | todo |
| S5 | README, compatibility, coverage audit, counts | diff reads as prose | todo |
| S6 | Report, one line per decision, then ask before committing | owner gate | todo |

## 4. What must not regress

- A rejected file beside a valid one still produces a `config` row, and
  `policies` still defers to it instead of reporting a count.
- A statement-level drop still names the pointer and the action.
- A stream with no diagnostics and no liveness line is `skipped`, never `ok`.
- `--offline` still skips both rows without spawning.
- No new dependency, no `muse acp`, no push, tag or publish.
- The temp `XDG_CONFIG_HOME` rule stands: copy `auth.json`, never touch
  `~/.config/opencode`.

## 5. Product questions for the owner

These do not fall out of the experiments; each is a choice about what the doctor
is for. Recommendation first, cost of the other choice second.

**Q1 — should a rejected config make the doctor exit non-zero?** Today `config`
is `warn`, and only `fail` sets exit 1, so a config the host refused to read
still exits 0. `nginx -t` exits non-zero; that is the whole point of a test view.
*Recommendation: not in this round.* Changing the exit contract affects every
consumer of the doctor at once, and the round is already a deletion; it belongs
in its own round with its own decision, most likely as an opt-in `--strict`.
*If yes now:* one line in `main()`, plus a README clause and a test, and the
round grows by a product decision rather than a mechanism.

**Q2 — should the remediation differ for a file the user cannot edit?** The
`config` row currently says "fix its JSON or JSONC". For
`/etc/opencode/opencode.json` or an MDM-managed file that is unactionable.
*Recommendation: yes, one clause.* When the rejected path is outside the home
directory and the cwd tree, say "this file is machine-managed; ask whoever
administers it". It is a wording change with no new mechanism, and it is the
only place the round can help the user who cannot fix the file.

**Q3 — should the row say the scope (global, project, managed)?** The full path
already says it, and a scope word would be derived from the same path.
*Recommendation: no.* It is a second spelling of information the row already
prints.

**Q4 — should the doctor report `$OPENCODE_CONFIG` being set even when the file
is fine?** It changes which config the run uses, which is exactly the kind of
thing a diagnostic report should surface. *Recommendation: no, not in this
round.* It is a new row, not a fix, and the round's value is that it deletes more
than it adds.

## 6. Prohibitions (inherited)

No push, tag or publish. No `muse acp`. No new dependency. Never write to the
host's log — after this round it is not read either. Never weaken or delete an
assertion to make the suite pass. `docs/integration-landscape.md` is the owner's
edit: read only, never stage. Scratch output stays in the gitignored `scratch/`.
Commit in increments and ask before committing.
