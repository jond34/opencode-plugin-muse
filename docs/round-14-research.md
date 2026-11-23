# Round 14 research: what a test view owes the shell

Round 13 made a refused config visible. It left the doctor's exit code alone:
`config` is `warn`, only `fail` returns 1, so a CI job that runs the doctor cannot
fail on a config the host refused to read. Round 13 deferred that as Q1, "its own
round, most likely an opt-in `--strict`". This is that round.

The question is not "should a warning be an error". It is narrower: this doctor is
named like the commands that advise (`brew doctor`) and shaped like the commands
that gate (`nginx -t`), and it has to pick one for the caller who pipes it into a
build. Five experiments below measure the two halves: what the host and the doctor
already do, and what each candidate gate would have returned.

Experiments E-D72–E-D76 are done; the tables are the evidence for every decision in
`docs/round-14-plan.md`. Probes are `scratch/round-14/s0.ts`–`s2.ts` (gitignored).

## 1. What the field does

> Corrected in round 15: the Homebrew cell below inverted brew's default. `brew
doctor` gates every finding (`fatal: true`), and round 15 §1 has the source and the
manpage (E-D81). The polarity built on this table was reopened in
`docs/round-15-research.md`.

| Tool | Command | Contract | Source |
|---|---|---|---|
| nginx | `nginx -t` | non-zero on a config error; `-T` is the dump, `-t` is the gate | nginx docs |
| systemd | `systemd-analyze verify` | non-zero on a bad unit; `--recursive-errors=MODE` decides whether warnings also return non-zero | `systemd-analyze(1)` |
| Terraform | `terraform validate` | `valid: false` in `-json`; the exit status is what CI branches on | `terraform validate` reference |
| Kubernetes | `kubectl apply --validate=strict\|warn\|ignore` | `strict` fails the request; before 1.25 it was a boolean | Kubernetes API concepts, kubectl reference |
| yamllint | `yamllint -s` | `0` clean, `1` errors, **`2` warnings only** | yamllint configuration docs |
| npm | `npm audit` | non-zero when a vulnerability is found; `--audit-level` moves the threshold | `npm-audit(1)` |
| Rust | `cargo clippy -- -D warnings` | severity promotion, done by the caller, not the tool | clippy usage |
| Homebrew | `brew doctor` | `exit 1 if failed && fatal` — warnings alone do not fail it | `Library/Homebrew/diagnostic.rb` |
| GitHub CLI | `gh auth status` | exits 1 when any host has authentication issues | `gh` manual |
| PostgreSQL | `pg_isready` | `0` accepting, `1` rejecting, `2` no response, `3` no attempt | `pg_isready` docs |
| BSD | `sysexits.h` | `EX_CONFIG` 78, "something was found in an unconfigured or misconfigured state" | `sysexits.h` |
| — | breaking-CLI rules | "changing strict mode defaults is breaking; adding new strict mode validations is not (strictness is opt-in initially)" | `gh-aw` CLI rules |

Three readings fall out. Every *test view* gates by default: nginx, systemd,
terraform, kubectl, npm. Two *status* commands also gate: `gh auth status` and
`pg_isready`. The one that does not is `brew doctor`, and it says so in its own
source: only a fatal finding returns 1. So the field does not support "a diagnostic
must exit 0"; it supports "a diagnostic that answers *can this run?* exits non-zero".

## 2. Two families, and why the name matters

The doctor's rows are not advice about the machine. `config` says the host did not
read a file, so no plugin entry or policy in it is enforced; `policies` says a
statement was dropped; `plugins` says the plugin will not load or that the published
build will. Each answers "will the thing this checkout exists for actually run".
That is `gh auth status`, not `brew doctor`.

But the *name* is doctor, and its warnings are not all about the config: on this
machine a run with no config rejection still warns `host` (CLI 1.4.25 against SDK
1.4.24) — E-D73's clean tree — and a run from this checkout warns `plugins` too
(the published build is listed, this checkout is not). That is why "any warning
fails" is unusable rather than merely aggressive.

So the shape is: the default stays advisory, and a caller who is gating says so.
That is also the only non-breaking way to add it — the CLI-rules source above puts
"changing strict mode defaults" on the breaking side and "new validations under
opt-in strict" on the safe side.

## 3. E-D72 — the host is not a gate

`opencode --standalone --print-logs debug config`, exit status per tree, temp
`XDG_CONFIG_HOME` with a copied `auth.json`:

| Tree | status | stdout | diagnostics |
|---|---|---|---|
| clean | 0 | 2 documents | 0 |
| no config at all | 0 | 1 document | 0 |
| malformed `opencode.json` | **0** | 1 document | 1 (`$`) |
| valid beside malformed `.jsonc` | **0** | 2 documents | 1 (`$`) |
| malformed two levels up | **0** | 2 documents | 1 (`$`) |
| one malformed statement | **0** | 2 documents | 1 (`$.policies.1`) |

The host never signals a refusal in its exit status. So the doctor is not mirroring
a contract the host publishes; it is the only place a config test can fail. That
removes the "defer to the host" option and leaves the gate as a thing this repo
adds, which is why it has to be documented as this repo's contract.

## 4. E-D73 — the doctor's own exit code today

`bun scripts/doctor.ts --json`, same temp tree, full report:

| Tree | exit | rows that are not `ok` |
|---|---|---|
| clean config | **0** | `policies=skipped` (declares none), `host=warn` |
| malformed config | **0** | `config=warn`, `plugins=warn`, `policies=skipped`, `host=warn` |

Both trees use a temp `XDG_CONFIG_HOME` whose config lists this checkout, which is
why the clean tree's `plugins` row is `ok`. Run from this repo against the real
config and `plugins` warns as well: the published build is listed and this checkout
is not.

The defect is exactly as reported: a run whose `config` row says the host did not
read the file returns 0. Nothing in the report distinguishes "the config is fine"
from "the config was thrown away" to a shell.

## 5. E-D74 — a writability probe, measured and bounded

For the Q2 wording ("this file is machine-managed"), `fs.accessSync(path, W_OK)`:

| Path | exists | result |
|---|---|---|
| `chmod 444` file in a temp dir | yes | not writable |
| `chmod 444` file in `$HOME` | yes | not writable |
| `/etc/hostname` (root-owned) | yes | not writable |
| `/etc/opencode/opencode.json` | **no** | not writable (absent, so the answer is meaningless) |

On POSIX the probe answers the question. It is not portable: Node's `fs.access`
docs say ACLs on Windows "may limit access to a file or directory" while the
function "does not check the ACL and therefore may report that a path is
accessible even if the ACL restricts the user from reading or writing to it". And
a path heuristic — outside `$HOME` and outside the cwd tree — is wrong in both
directions: a writable file under `/tmp` or `/opt` would be called machine-managed,
and a read-only file inside `$HOME` would not.

## 6. E-D75 — four shapes against five trees

Rows are the three config-integrity checks only (`config`, `plugins`, `policies`);
each cell is the exit code that shape would return.

| Tree | rows | config only | config+policies | any warn | + did-not-look |
|---|---|---|---|---|---|
| clean | `plugins:ok policies:ok` | 0 | 0 | 0 | 0 |
| malformed cwd config | `config:warn plugins:warn policies:skipped` | 1 | 1 | 1 | 1 |
| valid beside malformed | `config:warn plugins:ok policies:skipped` | 1 | 1 | 1 | 1 |
| malformed two levels up | `config:warn plugins:ok policies:skipped` | 1 | 1 | 1 | 1 |
| **one malformed statement** | `plugins:warn policies:warn` | **0** | **1** | 1 | 1 |
| **host absent** | `plugins:skipped policies:skipped` | **0** | **0** | **0** | **1** |

Two rows carry the argument. A dropped statement produces no `config` row — the
file parsed, one statement did not — so the narrow shape passes the case round 11
spent a round making visible. And a host that is not installed leaves both rows
`skipped`, so three of the four shapes pass a gate that never looked.

`any warn` is not a candidate in practice: on this machine a run with no config
rejection already warns `host`, and this checkout's own run warns `plugins` too
(E-D73), so it would fail a working checkout. The four shapes above are computed
over the config rows only; the control case is what rules the fourth out.

## 7. E-D76 — the gate that cannot look

With `PATH` stripped of `opencode`:

```
status=null  documents=undefined  rows=plugins:skipped policies:skipped
```

`opencodeConfig()` returns `status: null` and no documents, the two rows say
`skipped` with "did not answer", and the report's `failed` predicate sees no `fail`.
`--offline` produces the same two rows with a different detail, and never spawns.
So "did the config get read" is not currently a fact any exit path consults; a gate
that wants to be fail-closed needs it as an explicit input.

## 8. Options, steelmanned and strawmanned

**A — leave it: a diagnostic reports, the shell decides.** Steelman: `brew doctor`
is the closest name, GCC and m4 both document that warnings do not affect exit
status, and a report that fails a build for an environment quirk teaches people to
ignore it. Strawman: the caller cannot decide, because the report has no
machine-readable "the config was discarded" bit; it would have to parse prose. That
is the silent-rejection class again, one layer up.

**B — change the default: `config` warn becomes `fail`.** Steelman: the row already
means "no plugin entry or policy in it is enforced", which is a failure of the thing
being diagnosed. Strawman: a rejected ancestor config need not be this checkout's
file, and a status change rewrites every existing consumer's contract at once — the
breaking change the CLI-rules source names.

**C — opt-in `--strict`, config-integrity rows only.** Steelman: non-breaking, one
predicate, matches yamllint's word for the same idea. Strawman: it is a flag nobody
discovers; a CI author reads the README once and either uses it or does not, which
is acceptable for a gate but is not a default.

**D — opt-in `--strict` that also fails when the config was not read.** Steelman:
it is D64's own principle — a silent stream must never read as clean — applied to
the exit code; it makes `--strict` mean "the doctor looked and found nothing", not
"the doctor found nothing it could see". Strawman: `--offline --strict` then fails
by construction, and a user who combines them sees a non-zero code for a flag
conflict rather than a finding.

**Exit code values.** `1` (what `fail` already returns), `2` (yamllint's
warnings-only code, `grep`'s "no match", terraform's `-detailed-exitcode`), `78`
(`EX_CONFIG`). Steelman for 2: a log can tell "refused config" from "host missing"
without parsing. Strawman: two codes double the documented contract for a consumer
that only asks "may I ship", and the report already names which row failed.

**Names.** `--strict` (yamllint, `MUSE_STRICT_HOST` in this repo, systemd's mode
knob), `--fail-on-warn` (eslint's `--max-warnings` is the nearest shape),
`--fail-on=config`. Steelman for `--strict`: it is the word the field and this repo
already use. Strawman: it promises "all warnings" and delivers two rows, so the
README has to say which.

## 9. Conditions for the recommendation

The recommendation below holds only while all four are true:

1. The gated rows stay the ones that report something the host discarded, and no
   environmental row joins them (E-D73's clean run).
2. The default exit contract does not change, so every existing caller keeps its
   meaning.
3. `--strict` never reports `ok` it did not observe: not-read is a failure under it,
   and the report says why.
4. The README names the rows it gates, because the flag's name is broader than its
   scope.

If (1) breaks — say `plugins` starts reporting a discarded entry only — the set has
to be revisited rather than extended by taste.

## 10. Deviations

- `s1.ts` spawns the doctor twice. The first spawn ran from the repo root with
  `PWD` pointed at the tree, so it measured this checkout's config, not the tree's;
  its result is discarded (`void run`) and the table above comes from the second
  spawn, which sets `cwd`. The bug is the same shape as round 13 §11's cwd bug and
  is recorded rather than quietly fixed.
- `s2.ts` computes the four shapes over the three config rows only. The `any warn`
  column is therefore optimistic for the clean tree; the control case in §6 uses the
  full report from E-D73 instead.
- `s2.ts` mutates `process.env.PATH` and restores it; the host-absent row is the
  only measurement taken while it is stripped.

## 11. What this does not answer

- Windows. The ACL caveat in §5 is the vendor's sentence, not a measurement here;
  there is no Windows machine, and U16 stays the row that would observe it.
- Whether a user's CI actually runs the doctor. No workflow in this repo does, so
  the contract is written for a caller this repo cannot see.
- The upstream half: `opencode debug config` has no structured diagnostics surface
  and no `-t` of its own. `anomalyco/opencode#60252` asks for the stricter half of
  the policy path; this repo's policy is not to file, so the row's dependency on a
  flag documented as a debugging aid and on message text stays a recorded
  limitation.
- The Console-delivered policy path and whether Muse ships a binding member: both
  unchanged from rounds 11–13.
