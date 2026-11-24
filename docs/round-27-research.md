# Round 27 research: the premises that moved after round 26

**Read** 2026-11-24, against Muse Code 1.4.25 on this machine and the published
docs current that day. This file is the source base for `round-27-plan.md`. It
separates what was measured here, what the vendor documents, and what is still
inference. Every claim that changes a product sentence is marked with its
confidence and the result that would overturn it.

## R1. `SessionStart` fires at the first prompt, not at `session/start`

**What the docs say.** The hook-events reference says `SessionStart` "fires when
a session starts, resumes, is cleared, is forked, or continues after
compaction", and the event table matches on `source: startup | resume | clear |
compact | fork` ([hook events](https://meta-models.github.io/muse-code-sdk/latest/guides/plugins/reference/hook-events/)).
The older hooks guide also says handlers load "at session start" and are
"discovered and validated at session startup"
([hooks guide](https://meta-models.github.io/muse-code-sdk/latest/guides/extend/hooks/)).

**What a field probe found.** A 2026-10-12 probe on Muse 1.4.7 installed an
approved plugin with one `SessionStart` hook and started an empty session. The
TUI reached its prompt with no `SessionStart`; the hook test fixture fired, so
the command worked. The hook fired only when the first prompt was submitted,
in the same second as `UserPromptSubmit`, and never refired on prompt 2
([probe record](https://github.com/linuxdynasty/fleet-board/blob/main/docs/specs/01d4-muse-sessionstart.md)).
This is the "lazy at first prompt" ordering the probe's decision names.

**Implication for E35.** Round 26 started through MSP `session/start`, saw no
`SessionStart`, and recorded an "instrument gap". That observation is consistent
with the documented lazy dispatch and is not evidence that the hook is broken.
The existing wording in `docs/decision-coverage.md` ("the MSP `session/start`
path did not dispatch the SessionStart hook") is true but incomplete: it reads
as a defect. It should say that Muse dispatches `SessionStart` at the first
prompt, and that firing is unmeasured on 1.4.25 without a turn.

**Cheap closure.** Muse ships a built-in echo provider: `muse exec --provider
echo "hello"` "is enough to fire `SessionStart`, `UserPromptSubmit` and `Stop`"
([hooks guide, verified runs](https://meta-models.github.io/muse-code-sdk/latest/guides/extend/hooks/)).
That turns E41 into a free experiment, not a paid turn.

**Confidence.** High that the ordering is lazy in 1.4.7 and consistent with
1.4.25's docs; medium that 1.4.25 still behaves identically, because the probe
predates this build. A marker from E41 makes it measured on 1.4.25.

**Falsifier.** If E41's marker is written before the prompt reaches the echo
provider, the lazy claim is wrong for this build and E35's original gap returns.

## R2. Muse can save MCP tool approvals; the rule store is opaque

**What the changelog says.** Muse 1.4.0 added "Save MCP tool and network
destination approvals across sessions with Always allow"
([changelog](https://dev.meta.ai/docs/muse-code/changelog)). The MCP guide tells
authors to "Write approval rules and tool filters against the registered name,
not against a name you rebuild from the configuration"
([MCP servers](https://meta-models.github.io/muse-code-sdk/next/guides/extend/mcp-servers/)),
which only makes sense if a rule can name `mcp__<server>__<tool>`.

**What the protocol says.** `ApprovalSubject` has an open `kind` union including
`tool`, with `toolName` "present for every kind except `shell`" (SDK
`msp.d.ts`, lines 350–372). `ApprovalChoiceScope` is `once | session |
localPersistent`, and `localPersistent` is "saved in the local policy store"
(`msp.d.ts`, lines 50–60). The MSP approvals guide calls this the "workspace
policy store" and says a locally-persistent rule survives the session
([approvals](https://meta-models.github.io/muse-code-sdk/latest/guides/msp-concepts/approvals/)).

**What is not published.** `approval-policy.json` is named as the store for
shell prefix rules, but its path and schema are not published; a 2026-08-26
adapter issue records the same blocker and re-confirms it in later comments
([rulesync #2790](https://github.com/dyoshikawa/rulesync/issues/2790)). No
`muse` subcommand prints or validates the store (`muse --help` on 1.4.25 has no
approval command). So a rule can be created through an approval choice, but not
yet authored from a documented file format.

**Implication for the "allowAll is the only mode" sentence.** Round 6 measured
`denyUnmatched` refusing a bridged call when no rule matched, and concluded
that "Muse's saved rules are command-prefix scoped and cannot name an MCP tool"
(`src/session.ts`, `docs/decision-coverage.md` row C). That conclusion is too
strong for 1.4.25: the vendor says MCP tool rules can be saved. The honest
current sentence is narrower: *this plugin has no documented way to pre-seed a
persistent MCP-tool rule, and an unseeded `denyUnmatched` refuses the bridge;
`allowAll` is the only mode that works without that opaque per-user step.*

**Implication for E39.** The round-26 E39 wrote a test case
`{action:"tool.use", resource:"*", effect:"deny"}`. That vocabulary belongs to
opencode's `policies` plane, not to Muse's approval policy
([opencode policies](https://dev.opencode.ai/v2/docs/policies): `tool.use` is
opencode's action enum; Muse's approval subjects are shell/file/network/process/
tool). Running it against `denyUnmatched` would test the wrong engine. E39 is
retired as designed; E44 replaces it with the Muse question: *can a
locally-persistent `tool` rule for the bridge's registered name let a bridged
call through under `denyUnmatched`?*

**Confidence.** High that the capability exists (vendor changelog + protocol
types). Medium that it applies to a bridge session under `denyUnmatched`,
because the bridge's server name and tool names are session-scoped and the
store's matcher is unpublished. E44 is the measurement that settles it.

## R3. The two policy planes are independent

**opencode's plane.** `policies` statements are authored in `opencode.json(c)`
or delivered by a connected Console. `tool.use` resources are
`<action>:<value>`, wildcards `*`/`?` match whole values, last match wins, and a
deny runs after agent rules and saved approvals
([policies](https://dev.opencode.ai/v2/docs/policies)). The implementation
hooks permission evaluation and applies `ManagedPolicy.decision` after the
provider/MCP transforms
([policy.ts v2.0.32](https://github.com/anomalyco/opencode/blob/v2.0.32/packages/core/src/config/plugin/policy.ts)).
Console statements are appended after authored ones with the message "Blocked
by <organization>'s policy" when the connection knows the organization
([managed-policy.ts](https://github.com/anomalyco/opencode/blob/v2.0.32/packages/core/src/managed-policy.ts)).

**Muse's plane.** `ApprovalMode` is `allowAll | promptUnmatched | onRequest |
denyUnmatched`; a client selects a mode, never authors a rule on the wire
(`msp.d.ts` line 2832; approvals guide). Rules live in Muse's local policy
store. The two planes meet only at the tool boundary: Muse decides whether to
issue the bridged `tools/call`; opencode decides whether its executor may run
it.

**Implication for E37/E19.** E37 saw the Console policy appear inside
`debug config`'s `document` source, not a Console-typed source, and `opencode
models` still listed `mistral`. The source type explains why the denial
message may not name the workspace: `document` statements are mapped to
"Blocked by configuration policy", while organization statements get the
workspace name. The vendor docs describe the organization message; this build
may be compiling the Console policy into the document. That is a testable
product gap: E43 asks which sentence the user actually sees.

**Confidence.** High that the two planes are separate; high that the `document`
source explains a generic message; medium that this account's Console policy
still compiles into `document` after E37 deleted it (it was observed once).

## R4. Windows job objects explain a hosted-runner survivor test

**The OS rule.** A process in a job object passes membership to children by
default; `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` terminates all associated
processes when the last job handle closes, including a nested job's members
([Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)).
Membership is inherited through `CreateProcess`; `Win32_Process.Create` is the
documented exception. A CI runner commonly puts the job in a job object with
kill-on-close so a cancelled job leaves no tree.

**What E38 saw.** The detached grandchild was seen alive after `close()`, then
gone; 239 samples, 0 failed reads, `directAliveAtEnd=false`, `everInTable=true`,
no `taskkill`. That shape is consistent with a runner job object reaping the
tree shortly after the host exits, but E38 did not read job membership.

**Implication.** The orphan row can say "none observed on the hosted runner"
and must not generalise to a desktop where the parent is not inside such a job.
E45 reads `IsProcessInJob` for the host and the grandchild, which turns the
mechanism from inference into a named cause if both are members.

**Confidence.** High on the OS semantics; medium on this runner's configuration
until E45. A desktop with no job object remains the real unknown.

## R5. `close()` after transport EOF is a promise-lifetime question

**Node's rule.** A child's `close` event fires after the process ends *and* its
stdio streams close; `exit` can arrive first
([child_process](https://nodejs.org/api/child_process.html)). A process whose
stdout ended can still be alive, which is exactly the fixture's `eof-alive`
mode.

**The SDK's ladder.** `spawnMspConnection`'s close awaits a flush, sends stdin
EOF, waits for exit, then `SIGTERM`, then destroys stdin and `SIGKILL`, all
within one deadline; it deliberately does not let the EOF attempt gate the
ladder ([spawn.ts](https://raw.githubusercontent.com/meta-models/muse-code-sdk/main/clients/sdk-ts/src/connection/spawn.ts)).
The MCP stdio client has a similar 2 s close race
([typescript-sdk stdio.ts](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/client/src/client/stdio.ts)).

**What E34 saw.** On `windows-latest`, the fixture's pid died but the test's
`await connection.close()` did not settle within 15 s. On POSIX the same arm
passes. The SDK's own `exited` promise and the child's `close` event are the
two candidates; the test does not record which one was already resolved when
`close()` was called.

**Implication.** E42 is a diagnostic, not a product change: race `close()`
against a timer, record whether `exited` was already settled, whether the pid
is alive, and whether the close promise resolves after the child is gone. If
the child is already gone and `close()` still waits, the defect is in the
promise bookkeeping and belongs upstream; the test stays skipped with a named
cause rather than a timeout.

**Confidence.** High that the symptom is real on the runner; medium on the
cause. The diagnostic is cheap and does not require a new dependency.

## R6. The four older claims

Two were re-read far enough to keep their rows honest:

- **codex doctor** exits non-zero only when `overall_status` is `Fail`; warnings
  do not set the exit code
  ([doctor.rs](https://github.com/openai/codex/blob/main/codex-rs/cli/src/doctor.rs)).
- **Vue Doctor** exits 3 when an analyzer fails or is skipped **with
  `--strict`**; its default `--fail-on` is `none`
  ([CLI reference](https://remylagerweij.github.io/vue-doctor/reference/cli)).

`brew doctor` and `a4 doctor` were not re-located to a primary source in this
pass. They are field comparisons in the ledger, not sentences the plugin's
behavior depends on. E47 either adds a current row with a URL or marks the row
"not reopened; no product dependency", rather than inventing a quote.

## What this changes in the plan

1. E35's "instrument gap" becomes a documentation correction plus a free
   `--provider echo` measurement (E41), not a paid turn.
2. E39 is retired as written. The `tool.use` wildcard is opencode vocabulary;
   the Muse question is E44, and its answer decides whether `allowAll` remains
   the only workable bridge mode.
3. E19 is reachable through the *denial sentence*, not a model turn: E43 runs a
   denied provider and records whether the message names the workspace.
4. E38's mechanism is testable with `IsProcessInJob` (E45); the desktop claim
   still needs an owner-run check (E46), not another hosted dispatch.
5. The EOF arm needs a diagnostic (E42), not a longer timeout.

## Risks and counter-arguments

- **Steelman "just document it."** Every remaining item is a sentence in a doc;
  none changes code. That is true for E35/E38/E39 unless E44 proves a usable
  rule or E42 proves a product-visible hang. The default for each experiment is
  therefore "document the narrow fact", not "build a mechanism".
- **Strawman "the vendor docs are enough."** R2's capability is documented, but
  the store's matcher is not; a doc-only conclusion would repeat round 26's
  mistake of generalising from one unseeded `denyUnmatched` run.
- **Cost risk.** E44 can burn turns without a tool call. It is capped at three
  attempts and stops on the first non-tool reply; the doc correction lands even
  if E44 never runs.
- **Account risk.** E43 may need a reversible Console policy again. It uses one
  provider the host does not use for Muse work, waits for the fetch, records
  the sentence, and deletes it; no second workspace, no invite.
- **Desktop risk.** E46 is owner-assisted and may surface UAC/SmartScreen
  prompts that a headless agent cannot answer. It is a checklist, not an
  automated dispatch; a failed step is a result.
