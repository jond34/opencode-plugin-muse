# Round 14 plan: the exit code a test view owes

Round 13 made a refused config visible in the report and left the exit code alone.
This round adds the gate: an opt-in `--strict` that fails on a config the host
discarded, on a policy statement the host dropped, and on a run where the doctor
never got to look. The default contract does not change.

Research: `docs/round-14-research.md`. Experiments E-D72–E-D76 are done; the tables
there are the evidence for every decision below. Probes: `scratch/round-14/s0.ts`,
`s1.ts`, `s2.ts` (gitignored).

## 1. The finding that changes the shape

The smallest shape proposed for this round — `fail` ∪ (`warn` on `config`) — does
not cover the case rounds 11–13 were about. E-D75: a config that parses but has one statement
dropped produces no `config` row at all (the file was read; one statement was not),
so `--strict` with that shape returns 0 while a `deny` the user wrote is not in
force. The same table shows the other end: with `opencode` absent, both rows are
`skipped` and every shape but the did-not-look one returns 0, which is a gate that
never looked.

Two facts bound the design. E-D72: the host exits 0 on every tree, including a
fully malformed config, so there is no host contract to defer to — this repo is
writing one. E-D73: on this machine a run with no config rejection still warns
`host`, and this checkout's own run warns `plugins` too, so "any warning fails"
would fail a working checkout and is out on measurement, not taste.

## 2. Decisions

**D68 — `--strict` is opt-in and the default does not change.** `fail` still
returns 1, and a `warn` still returns 0 without the flag. Adding the gate under a
flag is the non-breaking shape (research §1, CLI-rules source); changing a status
would rewrite every existing caller's contract at once.

**D69 — strict gates the config-integrity rows and the did-not-look state.**
Exit 1 under `--strict` when any check is `fail`, when a `config` row exists, when
`policies` is `warn`, or when the config was never read. It does not gate `plugins`,
`host`, `posture`, `hooks`, `allowance` or `platform`: those warn about the machine
or the install, not about a declaration the host discarded, and a clean run here
already warns `host`, with this checkout's own run warning `plugins` too (E-D73).
A `policies` row that is `skipped` because the config declares no statements is not
a failure; only `warn` is.

**D70 — `--offline --strict` exits 1.** Offline says do not look; strict says fail
if you cannot look. The report already prints both rows as
`--offline: opencode's config was not read`, so the non-zero code is explained in
the same output. No new exit code, no usage error.

**D71 — one non-zero code: 1.** yamllint returns 2 for warnings-only under
`--strict`, and `sysexits.h` has `EX_CONFIG` 78; both are recorded and rejected. A
consumer of this doctor asks whether it may ship, and 1 is already what `fail`
returns, so a second code doubles the documented contract for no caller this repo
can see (research §8).

**D72 — the remediation clause is unconditional.** `config`'s remediation gains
"if you cannot edit this file, ask whoever administers it". E-D74 measured
`fs.accessSync(..., W_OK)` working on POSIX and Node documents its Windows ACL gap,
while a path heuristic is wrong in both directions (a writable `/tmp` file called
machine-managed; a read-only file in `$HOME` not). The clause is true for every
reader and costs no detection.

**D73 — the records name the gate's rows and the row's dependency.** README,
`docs/compatibility.md` and `docs/decision-coverage.md` say which rows `--strict`
gates, and compatibility says plainly that the `config`/`policies` rows rest on a
flag documented as a debugging aid and on message text, with no structured
diagnostics surface upstream (#60252, not filed).

## 3. Shape

```ts
export interface Gate {
  /** `--strict`: a discarded config, or a config never read, fails the run. */
  readonly strict: boolean;
  /** Whether `opencode debug config` answered, so the rows describe a real run. */
  readonly read: boolean;
}

export function exitCode(checks: readonly Check[], gate: Gate): number;
```

`main()` keeps one spawn, records `read = !options.offline && Array.isArray(run.documents)`,
and returns `exitCode(report.checks, { strict: options.strict, read })`. The function
is exported so the contract is a table test rather than a spawned process; the two
existing `--offline` tests keep asserting 0 because they do not pass `--strict`.

## 4. Phases

| Phase | Work | Gate | Status |
|---|---|---|---|
| S0 | E-D72–E-D76: host exit, doctor exit, writability, four shapes, cannot-look | each question answered by a table | done — research §3–§7 |
| S1 | `exitCode` + `Gate`, `--strict` in `parseArgs`, one call site in `main` | `bun run check:offline` green; `tsc` clean | todo |
| S2 | Table test for `exitCode` (nine rows), spawned `--offline --strict` test | every row of the table asserted, including the default 0 | todo |
| S3 | D72's clause in `configRow`, and the test that pins it | the clause is in the remediation, not the detail | todo |
| S4 | Live: four trees × default/`--strict`, plus host absent | the table matches research §6 | todo |
| S5 | README, compatibility, coverage audit, counts | diff reads as prose | todo |
| S6 | Report, one line per decision, then ask before committing | owner gate | todo |

## 5. What must not regress

- Without `--strict`, every tree that returns 0 today still returns 0 — including
  a malformed config (E-D73) and both `--offline` tests.
- `--json` keeps its shape; no field is added for the gate.
- A `policies` row that is `skipped` for declaring no statements does not fail
  strict; only `warn` does.
- The `config` row's detail is unchanged; only its remediation grows.
- No new dependency, no `muse acp`, no push, tag or publish.
- The temp `XDG_CONFIG_HOME` rule stands: copy `auth.json`, never touch
  `~/.config/opencode`.

## 6. Product questions for the owner

Two remain. Both are choices about what the gate means, not about mechanism.

**Q1 — how wide is `--strict`?** Research §6 gives the table.
*Recommendation: the config-integrity set plus did-not-look* (D69). The narrow
`config`-only shape proposed for this round returns 0 on the dropped-statement tree,
which is the same silent rejection round 11 spent a round making visible, and it
returns 0 when `opencode` is not installed. *Cost of the wider choice:* a CI job on
a machine without the CLI now fails, which is the point but will surprise someone.
*Cost of the narrow choice:* `--strict` certifies a config it did not fully check.

**Q2 — how does the row word a file the user cannot edit?** Round 13 recommended a
path rule (outside `$HOME` and the cwd tree → "machine-managed").
*Recommendation: reverse that, and use the unconditional clause* (D72). E-D74 shows
the path rule is wrong in both directions and the writability probe is unreliable
on Windows, while "if you cannot edit this file, ask whoever administers it" is
true for every reader and needs no detection. *Cost:* the row does not tell an
admin-managed file apart from a merely read-only one — which is also what keeps it
from being wrong.

Decided without asking, because the evidence settles them: the exit code is 1
(D71), the flag is `--strict` (D68, and `MUSE_STRICT_HOST` already uses the word),
and `--offline --strict` fails rather than erroring (D70).

If Q1 comes back narrow, delete the `policies` clause and the `read` clause from
`exitCode` and drop those two rows from the S2 table; nothing else moves. If Q2
comes back as a path rule, `configRow` needs the rejected path and the home/cwd
comparison, and the unconditional clause is removed.

## 7. Prohibitions (inherited)

No push, tag or publish. No `muse acp`. No new dependency. Never write to the
host's log. Never weaken or delete an assertion to make the suite pass.
`docs/integration-landscape.md` is the owner's edit: read only, never stage.
Scratch output stays in the gitignored `scratch/`. Commit in increments and ask
before committing.
