# Decision coverage: what is decided, what is not

**Written** 2026-11-22. Categorical, not narrative. The question is not "is the
plugin good" but "for each dimension this integration has to answer, is there an
answer, and is it a decision or an omission".

Status codes:

- **H — have.** Implemented and exercised by the suite or a live run.
- **D — decided against.** A written reason exists (`A#` = `steady-state.md`).
- **P — partial.** A decision exists but does not cover the whole dimension.
- **U — not considered.** No decision found in `docs/` or `src/`. Grepped for the
  term, not assumed.
- **X — impossible.** The wire or the vendor forbids it.
- **N — harness-supplied.** opencode owns it; not this layer's question.

The interesting column is **U**. Everything else is already defensible.

The evidence behind each row, and the experiment for each open one, is in
`decision-evidence.md`. Several rows were corrected after that check — U6, U8,
U11, P2, P4 — and nine closed on measured evidence rather than on argument: U2,
U3, U4, U6, U7, U8, U9, U10 and P4. Round 3 closed ten more: U5, U11, U12, U13,
U14, U15, P1, P2 and P3 by decision and implementation.

**Round 5 audit (HEAD `8e8448f`).** Each § 10.1 answer was checked against the
vendor's published schema rather than against `src/`, and the three probes ran
against the installed 1.4.25 host. The round moved seven rows and opened one it
could not close (U26). Two claims in round 4's record were wrong in detail and
are corrected here: the ACP route's premise (ACP does carry tools now; the real
reason is that opencode is an ACP agent, not a client) and the "resume loses the
declaration" caveat (a warm resume keeps it; a cold one loses it).

**Round 4 audit (HEAD `9c1dc6d`).** The four commits since `09c4a54` were checked
row by row against `src/`, not against this file's previous claims. Nineteen of
the twenty rows closed. Four new rows opened, three of them created by the
round's own additions: the idle clock does not know a bridged tool is running
(U17), the host's own retry notice is still ignored (U18), hook acceptance has
no way to cover a `plugin`-origin handler (P5), and the allowance warning has no
surface a user can see (P6). U16 is unchanged: the workflow is configured and
still undispatched (`gh run list` shows no `test` run on `main`).

---

## A. Auth and entitlement

| Dimension | This plugin | Status | Basis |
|---|---|---|---|
| Subscription via the user's own signed-in CLI | Yes | H | A12 |
| API-key / BYOK lane | None, ever | D | A2, A12 "no direct model API path", non-negotiable |
| Credential interposition (proxy, token store) | Never touches the token | D | A2 |
| Behaviour on `client_attestation_denied` | Turn fails with Muse's message, no degrade path, no retry | D | E-D1 measured the failure shape; the label stays `protocol` on purpose (D10): a denial is a client-identity mismatch, and `auth` would send users to a re-login that cannot help. Stated in README's attestation paragraph |
| Multi-account / account switching | One signed-in account per host | D | README `## Limits of the seam`, "Accounts": log out and back in |
| Shared or remote host (one `muse serve`, many users) | One host per user, spawned over stdio | X | README `## Limits of the seam`, "Deployment". Not a preference: the wire guide makes it normative — "a host must not accept a connection from a party that did not spawn it", the unix-socket and websocket transports are "deferred past v1", and "no v1 implementation may assume them". One host per spawning party is the only conformant deployment |
| Contributor mode / training trade | Disclosed, default off | H | A7 |
| Corporate TLS proxy / custom CA | `NODE_EXTRA_CA_CERTS` reaches the host | D | E-D3: the child inherits the plugin's environment (measured 2026-11-22); README `## Environment` says so |
| Offline / air-gapped operation | Requires a live host | D | README `## Limits of the seam`, "Network" |

## B. Loop control

| Dimension | This plugin | Status | Basis |
|---|---|---|---|
| Turn start and admission | `turn/start`, ack-authoritative | H | G4 |
| Concurrent submit guard | Reserve-before-send | H | G3 |
| Queue vs refuse | Refuse-and-steer | D | product-gaps decision 2 |
| Mid-turn steering | `turn/steer` behind `supportsSteering` | H | `contract/adapter.ts:98` |
| Interrupt / cancel | Yes, not durable across restart | D | R2-era decision |
| Turn timeout on live sessions | Three clocks per turn, `0` disables each | H | `src/watchdog.ts`: first byte 900 s, idle 180 s after frames start, warn at 90 s; env-tunable (`MUSE_FIRST_BYTE_TIMEOUT_MS`, `MUSE_IDLE_TIMEOUT_MS`, `MUSE_IDLE_WARN_MS`). Only substantive frames count (item/delta, item lifecycle, approval, user input), never keepalives or usage echoes. Pinned by `test/watchdog.test.ts`. One-off turns keep their own 120 s |
| A bridged tool call that outlives the idle clock | Not distinguished from a wedge | U | U17: the clock measures host frames, and a `tools/call` executing in opencode sends none until it returns. Any tool over `MUSE_IDLE_TIMEOUT_MS` (180 s default) — a build, a test suite, a permission prompt nobody answers — fails the turn as `host_idle_timeout`, interrupts, and closes the host. The wire guide defines no keepalive or progress frame, and the approvals page says a pending approval "parks its turn indefinitely", so silence is the protocol's normal state for exactly the work this plugin delegates. Nothing in `session.ts` pauses the clock around the bridge |
| Provider backoff as dead air | `turn/modelRetryScheduled` is unread | U | U18: the wire carries a durable "retrying in N s, attempt N/M" fact specifically so a streaming client does not show dead air (`msp.d.ts:3768`), and `grep -r retryScheduled src/` is empty. A long retry chain looks exactly like a wedge to both the user and the clock. The vendor's own Rust client pairs per-method deadlines with this notification rather than a whole-turn silence budget |
| Retry / backoff | Disabled deliberately | D | edge table: `session.retry` disabled |
| Missed-notification recovery | `view/gap` splice-fill | H | G1 |
| Wedged host (alive, silent) | Detected by the idle clock, ended, resumed | H | E-D2 measured why: a frozen host settles nothing and `turn/interrupt` parks with it. The ladder is fail as `host_idle_timeout` → interrupt (2 s budget) → `host.close()` → the next turn resumes. E-D9 measured the resume half end to end (`test/watchdog-resume.test.ts`): one `session/resume`, no reseed, frozen pid reaped, one terminal |
| Reaping a dead child | The EOF arm closes the child | H | `announceExit` calls `child.close()` on the `transportEof` arm (`host.ts`), which is stdin EOF, the drain window, then SIGTERM→SIGKILL (`spawn.js:304-371`). Pinned by `test/host-death.test.ts` (one close on EOF, zero on a real exit) and `test/host-process.test.ts` (pid alive after the EOF, gone and SIGTERMed after `close()`) |

## C. Tools and permissions

| Dimension | This plugin | Status | Basis |
|---|---|---|---|
| Tool bridge into opencode's registry | Yes, 13 tools observed | H | A16 |
| Unknown tool name | JSON-RPC `-32602` | H | product-gaps §4 |
| Tool argument error | `isError: true` | H | product-gaps §4 |
| Parallel tool calls | Transport's normal case | H | product-gaps §6 |
| Per-call cancellation | Keyed by request id | H | `bridge.ts:263` |
| Muse built-in tools | Pinned off | H | A11, A16 |
| Muse subagents / workflows | Off by containment; activity ledger-only | D | A21, D21: README's Containment bullet states it and why — each would add a path that does not cross opencode's permission engine |
| MCP tools | `supportsMcpTools: true` | H | `capabilities.ts:49` |
| Authority order: `allowAll` vs opencode's engine | Muse `allowAll`, opencode gates | D | A20, D21: structural, not a shortcut — the plugin has no tool executor (`session-registry.ts` emits the call into opencode), so there is no private pre-check to bypass; `test/bridge-denial.test.ts` pins the denied case; the vendor's own justification for exposing `allowAll` is the spawn boundary ("the client already holds the user's ambient authority"). README states it |
| Muse permission profiles | Rejected until stable | D | A20 |
| Acceptance path for `plugin`-origin hooks | Refused, with only a per-run env var to get through | P | P5: `--trust-hooks` records the digest of `.muse/hooks.json`, but a handler whose origin is an installed Muse plugin has no file, so `hooksDigest` is null, `hooksTrusted` is false, and the record can never cover it. The documented acceptance path does not reach one of the two origins it blocks |
| Tool output saturation marking | Ledger-only for native calls | D | A21, A3 |
| MCP Tasks (durable handle for a long tool) | Not used; MSP's own `task/*` is the native mechanism | D | The bridge's client is Muse over MSP, not an MCP client that polls tasks: `MspMethod` lists `task/background`, `task/stop`, `task/stopAll`, `task/list` and no task-get, and the pinned `msp.d.ts` has no task handle to return from `tools/call`. SEP-2663 Tasks (final, 2026-07-28) would need a polling client. opencode's own MCP client is the other end and sends no progress token at all (`anomalyco/opencode#28186`), so a handle would never be polled |

## D. Context and session

| Dimension | This plugin | Status | Basis |
|---|---|---|---|
| Native history seeding | Opt-in, gated | H | A4 |
| Compaction hook + native window | Yes | H | compatibility.md |
| Compaction firing mid-turn | No native window, next turn reseeds | D | Accepted and documented: keeping the native context measured 1.9–2.7× the input tokens on the same workload and the wire has no cache-preservation option (E-D7, `evidence/measurements.md:159-195`) |
| Resume after restart | Yes, with fallback | H | `history.ts:34` |
| Fork | Yes | H | 110 resume / 31 fork references, fork-live suite |
| Session export or migration off Muse | Nothing to migrate | D | README `## Native history`: the exportable transcript is opencode's, the native Muse session is a cache |
| Image input | Declared and exercised | H | edge table "Image input: closed" |
| File / PDF attachments | `acceptsFiles: false` | D | README `## Limits of the seam`, "Attachments": the wire's vocabulary is `"image"` in v1 (`msp.d.ts:1517`), so this is the wire, not a policy |
| Prompt caching | Not modelled; the share stays internal | D | Split and carried at `events.ts:145-174`, analysed at `evidence/measurements.md:159-195`: cache reads were 0.31 of the reseed's input against 0.04 for the fork arm, and the TTL is under six minutes. Decision (D12): the ledger keeps the counts, no user-facing cache figure is surfaced, because the number is a comparison between arms rather than a per-turn saving |
| Transcript on disk: retention / redaction | Session jsonl, no copy | D | README `## Native history`: the plugin writes only the usage ledger (counts, mode 0600, no prompt or tool text); the transcript is opencode's under opencode's retention |
| Long-context hard limit | Conservative bounds | H | model-limits, edge table |

## E. Model surface

| Dimension | This plugin | Status | Basis |
|---|---|---|---|
| Model catalog | `model/list`, snapshot | H | A16 |
| Catalog refresh | Restart-only | D | product-gaps §7 |
| Model switch mid-session | `session/setModel` | H | protocol surface |
| Reasoning effort / variant | Header-driven | H | `effort.ts`, second pass |
| Sampling controls | Not expressible | X | A10 |
| Structured output / `toolChoice` | Not expressible | D | `generated/msp/methods/turn-start`: the nine members are `commandId`, `displayText`, `ifBusy`, `input`, `reasoningEffort`, `sessionId`, `tokenBudget`, `userShell`, `workspaceRoots` — there is no output-format member, and the escape hatch is closed by rule: "`turn/start.providerRequestOptions` is deliberately absent: **RULED to stay off the published schema.**" So this is not "unused": nothing on the wire can carry a schema. Vercel's `outputFormat` → `structured_output` has no counterpart here. A D rather than an X because the absence is a schema decision the vendor may revisit, not a transport impossibility |
| Title / summarize one-off turns | Yes, ledgered as own kind | H | `language-model.ts:464` |
| Sessionless completion (`model/complete`) | Rejected as a path | D | A14 |

## F. Metering and observability

| Dimension | This plugin | Status | Basis |
|---|---|---|---|
| Token usage | `session/tokenUsage` | H | ledger |
| Context usage | `session/contextUsage` | H | ledger |
| Cost basis | `postpaid` / `unpriced` | H | `usage-ledger.ts:123` |
| USD budget cap | Rejected (flat rate) | D | plan §4 |
| Allowance headroom warning | Once per window at 90 %, log only | H | `src/allowance.ts`, called once per run from `src/plugin.ts`: `usage/read` over the existing connection, no model call, keyed to `window.resetsAtMs` so one window warns once, `MUSE_ALLOWANCE_WARN_PERCENT=0` disables, a failed read is silent. `quota` remains a *failure* (`events.ts:131`); the warning is the separate, earlier signal. Pinned by `test/allowance.test.ts` |
| Who sees the allowance warning | `console.warn`, which is the server log | P | P6: the server half's context has no dialog or toast (`dist/promise/plugin.d.ts` Context: `app` is name/version/channel, `event` is subscribe-only), so the log line is the only channel this layer has and a TUI user does not see it. The package does ship the surface — `@opencode/plugin/tui` exposes `ui.toast.show({title,message,variant,duration})` and promise dialogs, and the host has a `tui.toast.show` event type — but the package has no `./tui` part, so nothing raises it |
| Telemetry / OTel / metrics export | None, by decision | D | D13: the ledger is the record and the doctor is the only inspector; nothing about a session leaves the machine except the turns. Stated in README's on-disk paragraph. The only outbound write in `src/` stays the loopback bridge URL (`bridge.ts:198`) |
| Error taxonomy | 12 codes, failure classes | H | `contract/errors.ts` |
| Host death | Latch + fail the turn | H | 2026-11-22 |

## G. Distribution and policy

| Dimension | This plugin | Status | Basis |
|---|---|---|---|
| ACP surface | Not built | D | seam-review §14, plan §7 R2 withdrawn. Premise corrected 2026-11-22: `muse acp` "runs the same Muse Code host as `muse serve`" — same login, same attestation — and ACP now **does** carry a tool channel, because "when the editor passes its MCP servers to the agent, Muse Code starts the stdio and HTTP servers for the session" (`guides/editors-acp`). The route still closes, for the real reason: opencode is an ACP *agent*, not a client. Its docs describe only the agent side (`opencode.ai/docs/cli/acp`), and a source-level audit of 2.0.29 records "Drive other ACP agents — Not supported… neither 2.x nor 1.x contains ACP client code". Reaching Muse over ACP from opencode would mean writing an ACP client, a second integration surface for the same turn |
| Vendor partnership / host identity | Not pursued; the plugin says it is unofficial | D | D14: no partnership is sought, and the README says unofficial, not affiliated, not endorsed. Asking is the only move that changes the category, and it is a decision to leave alone |
| Published terms, privacy statement | README identity + on-disk paragraphs | D | D14: what the plugin holds (no credentials), what it writes (one ledger file, counts only), what it sends (nothing but the turns), and the MIT licence. No separate policy document: there is no server, no account, and no data collection to describe |
| Platform support (Windows, macOS) | Tested on Linux only | U | `.github/workflows/test.yml` runs the offline suite on all three, `workflow_dispatch` only: configured, never dispatched, and `gh run list` on 2026-11-22 shows no `test` run. U16. The vendor supports all three (native binary, PowerShell installer, and a documented Windows list: PowerShell instead of Bash, a UAC prompt when the sandbox initialises, no voice, no session messaging), so spawn resolution is not the concern; the matrix would only prove the suite, whose hosts are `.mjs` fixtures under node, not the seam. What it would not answer either way: POSIX modes on the ledger and trust record; the shutdown ladder, which Windows cannot honour — Node's docs say `SIGTERM`/`SIGKILL` "terminate the process forcefully and abruptly", so "drain, then SIGTERM, then SIGKILL" collapses to one hard kill; and the UAC prompt, which spawned headless surfaces as `host_idle_timeout` |
| opencode Effect API migration | Tripwire, stay on Promise | D | A19 |
| Semver gate on host drift | Advisory by default; `MUSE_STRICT_HOST=1` refuses | H | `host-facts.ts:84-103` gates on no fingerprint, any drift tier, or no `sessionMcp`. Opt-in is the decision, not a placeholder: E-D5 measured the installed 1.4.25 host refusing against the 1.4.24 pin, so strict-by-default would break the normal case |

---

## The gaps, ranked by cost of leaving them blank

### P — partial (a decision exists, the dimension is not closed)

Round 3's P1–P3 are closed (denial label, wedged host, authority order). Round 4
opened two that the new code created.

| Ref | Dimension | What is closed | What is not |
|---|---|---|---|
| P5 | Hook acceptance, `plugin` origin | A workspace file is refused until its exact hash is recorded, and editing it asks again | **Closed round 4 (D19).** The gate now covers `project` only: a `plugin` handler is contributed by an install the user performed and approved, and every install scope writes into the user's own store ("Nothing is written into the repository"), so it is not a file a checkout can plant. The doctor prints every handler's origin. Superseded reasoning: there is no file to hash for an installed Muse plugin's handler, so `--trust-hooks` cannot accept it. Only `MUSE_ALLOW_PROJECT_HOOKS=1`, per run, gets through. Either the record needs a plugin identity (name + version + handler set) or the doctor needs to say plainly that this origin has no record. `src/hooks.ts` also justifies "a record, not a prompt" with "2.3.2 has no dialog surface", which is true of the server Context and false of the package: a `./tui` part could ask |
| P6 | Allowance warning | The read, threshold, once-per-window keying and disable switch all work and are tested | **Closed round 4 (D20).** `src/allowance.ts` writes `allowance-notice.json` beside the ledger when it warns, and `src/tui.ts` — exported as `./tui`, so it loads with the server part — polls it, calls `ui.toast.show`, and deletes it; `console.warn` stays for headless runs. Superseded reasoning: the only channel was `console.warn`, and the server context cannot publish a toast (`EventDomain` is subscribe-only). The package exposes one — `@opencode/plugin/tui` `ui.toast.show`, and a `tui.toast.show` event — so the closure is a small `./tui` part, not a workaround. Until then the row claimed "warned" and what happens is "logged" |

### U — not considered at all

Rows are ordered by cost of leaving them blank. The **Ref** column is the canonical
`U#` used in `decision-evidence.md` and in the response that raised these; the two
numberings were different in the first draft and only one survives.

| Ref | Dimension | Why it bites | Cheapest closure |
|---|---|---|---|
| U17 | Bridged tool call outliving the idle clock | **Closed round 4 (D16).** The bridge reports its `tools/call` count; while one is in flight the idle clock is suspended and an optional `MUSE_TOOL_CEILING_MS` bounds the call instead (E-D13 measured the false kill first). Superseded: it fails healthy turns. 180 s is shorter than a build or a test suite, the failure names the host rather than the tool, so the user learns the wrong lesson — and the vendor sets **no** deadline of its own on a host-run tool. The peer numbers bracket us: `pi-muse-subscription` runs Muse with `tool_timeout_sec` set to a week and `idleMinutes` 20, and openclaw's model-idle windows are 120 s cloud / 300 s self-hosted — applied to a *model* request with keepalive comments, which is the phase distinction we lost. `STREAM_BUDGET_MS` in the vendor's quickstart is a test harness constant, not a wire limit, so nothing on the wire would have ended the call | Pause the idle clock while `bridge.ts` has a call in flight — the `inFlight` map already exists for aborts, so this is a size check beside `watchdog.touch` — and, better, declare it: see U19. The declaration is a status signal, not protection — it is absent from the unload condition set ("zero subscribers, no active or pending run, and no pending approval or user-input prompt") and is lost on restart, resume and the next input. The first-byte clock still bounds a host that never answers |
| U18 | Provider-backoff dead air | **Closed round 4 (D17).** `turn/modelRetryScheduled` is substantive and extends the idle clock by the host's own `retryDelayMs` plus a grace, capped by `MUSE_RETRY_CAP_MS` (E-D14 measured the kill first). Superseded: the wire already distinguishes "thinking" from "retrying"; the plugin threw that away and then killed the host for it | Count `turn/modelRetryScheduled` as substantive in `isSubstantiveProgress`, and log the attempt/delay it carries. The frame carries a required `maxAttempts` with the producer contract `attempt < nextAttempt <= maxAttempts`, so the host already bounds its own chain: the extension should stop at the last attempt rather than hold a turn that is about to fail (D24) |
| U19 | A long bridged call, announced | **Closed round 4 (D18).** `declareExternalWait` is sent on 0→1 and `clearExternalWait` on 1→0 with the tool label; E-D15 proved the live host serves `externalWait` on `session/read`. `task/background` is deliberately not used: it backgrounds a *Muse* tool task, and under the `empty` preset Muse has none. Superseded: the wire carries exactly the two affordances this situation needs and the plugin used neither: `session/declareExternalWait({sessionId, reason})` / `session/clearExternalWait`, whose declaration is served on the session as `externalWait` so a client can show "waiting on bash", and `task/background({commandId, sessionId, taskId})` where a `toolCall`'s `itemId` **is** the task id, so a running call can be durably backgrounded and its terminal arrives as a `backgroundTerminalCompletion` item. Both are client commands; `grep` finds no use in `src/`. Declaring the wait is what makes the runtime and any client see the wait instead of silence; backgrounding is what lets a turn survive a call longer than the turn. Caveat: a declaration is live-only — lost on restart, resume, and the next user input — so it is a status signal, not durability | Call `declareExternalWait` when `inFlight.size` goes 0→1 and `clearExternalWait` at 1→0, reason from the tool names; then use `task/background` past a threshold instead of holding the turn |
| U16 | Platform support | Unmeasured off Linux; the matrix proves the suite, not the seam | Dispatch `.github/workflows/test.yml`, then write what it showed — including the three Windows-specific unknowns in the G table. Needs the owner's GitHub session |
| U20 | Live long-call behaviour | **Closed round 5 (D22, E-D19).** Live, through the production path: a bridged `sleep_ms` call was still running 17.6 s into a 15 s idle window and the turn had not failed. The same probe at a 4 s window showed no kill during a 20 s park either. The suspension is real on a live host, not only against a fixture | Measurement stands; the remaining live question moved to U26 |
| U21 | The hook trust unit is the file | **Closed round 5 (D23).** The record is per handler, keyed by a hash of the handler's canonical JSON with its event and matcher, so an edited neighbour does not re-ask and a changed command cannot ride a stable key or position into trust (the second case is pinned by a test). The gate stays all-or-nothing because the host loads the whole file once the workspace is trusted: per handler is accounting, not execution. A v1 record still passes a file whose bytes still match it, and the next `--trust-hooks` writes v2; a file with no handler the plugin can parse is refused rather than trusted, which is the fail-closed side of a format this plugin does not own. E-D22 confirmed the vendor's own key is content-derived too, so the two agree | Record written by `bun run doctor --trust-hooks`, which reports how many handlers it accepted |
| U22 | The Windows shutdown ladder | **Closed round 5 (D25a).** Node documents `SIGTERM`/`SIGKILL`/`SIGINT` as "terminate the process forcefully and abruptly", so "drain, then `SIGTERM`, then `SIGKILL`" collapses to one hard kill. The SDK owns the ladder and offers no switch for a rung, so the plugin cannot skip it; what it can do is state it: `shutdownLadder(platform)` is injected and tested for `win32`, the doctor prints the rungs this machine has, and the README says the host is ended rather than asked to stop | No code path is claimed to work on Windows that a test has run there |
| U23 | POSIX modes on Windows | **Closed round 5 (D25b).** `fs.chmod` on Windows: "only the write permission can be changed, and the distinction among the permissions of group, owner, or others is not implemented", so a doctor that prints `0600` would be lying. `describeFilePermissions(path, platform)` reports the real mode on POSIX and `inherited ACL (Windows chmod changes only the write bit)` on `win32`, injected and tested | The ledger and trust record still ask for `0600`; the claim about it is what changed |
| U24 | A UAC prompt on a headless spawn | **Closed round 5 (D25c).** The vendor documents a UAC prompt when the sandbox initialises; a spawn that blocks on consent surfaces 900 s later as `host_idle_timeout`, which names the wrong cause. The doctor's `platform` row says it on `win32`, the README names it under Platforms, and no test claims to have seen it — there is no Windows machine here | U16 remains the row that would observe it |
| U25 | `task/background` on a bridged call | **Closed round 5 (E-D19).** Refused on a live host: `task/background command … rejected: invalid_target`, sent with the running `toolCall`'s `itemId`. A bridged call is not a backgroundable Muse task, so D18's "no backgrounding path" is now measured rather than inferred, and G4 has nothing to decide | Refusal recorded; no code follows |
| U27 | A resumed declaration, warm versus cold | **Closed round 5 (E-D21).** The docs' "live-only" is precise about the cause and imprecise about the word: a warm `session/resume` against the same host keeps `externalWait`, and a cold resume after the host exits returns `null`. So the loss is the process going away, not the resume command. The README sentence now says which | One sentence |
| U26 | The end-of-turn gate, as seen by the idle clock | The clock knows a call is in flight and a retry is scheduled; it does not know the host is finishing. Measured on a live turn: `eot_gate_ms: 8138` of silence, the host recorded `terminal: "completed"` at 36.7 s, and the plugin failed the same turn at 43.3 s with `host_idle_timeout` — 6.6 s after the host had finished. Harmless at the 180 s default (an 8 s gate is well inside it), which is why it has not bitten; it bites when a gate outlasts the window, and `turn/foregroundCompleted` says named background reminder checks hold a turn open. Whether the completion frame arrives late or the handler drops it is not separated yet — the probe logged frame counts, not times | Timestamp `turn/completed` in the probe (rides on any future paid turn), then either stop the clock on the gate's own signal or extend it by the gate |

Closed in round 3, with where each landed: U5 (three-clock watchdog + resume,
`src/watchdog.ts`), U11 (cache share stays internal, D12), U12 (allowance warning,
`src/allowance.ts`), U13 (no telemetry, README), U14 and U15 (identity and on-disk
paragraphs, README). Round 3's three partials closed with them. The evidence for each is in
`decision-evidence.md`; the plan that carried them is
`implementation-plan.md` § 8. The round-4 findings are this file's, checked
against `9c1dc6d` on 2026-11-22; the plan that closes them is
`implementation-plan.md` § 9 (V0–V7), and each row's experiment is in § 9.3.

## Counts

H 39 · D 34 · P 0 · X 2 · U 2 · (N not used: no row here is purely opencode's)

Seventy-five of seventy-seven rows are closed: thirty-nine verified and
exercised, and thirty-four decided with a written reason. Two are impossible by
rule (sampling controls, and one host per spawning party) rather than chosen.
Two are open, both unmeasured rather than undecided: U16 needs the owner's
GitHub session, and U26 needs one timestamped frame.

Round 4 closed the five rows it opened: U17, U18 and U19 (the first two were the
only ones that failed a turn a user was entitled to) and P5 and P6 (a record
that could not cover half its subject, and a surface rather than a message).
The evidence is E-D13–E-D18 in `decision-evidence.md`; the plan that carried
them is `implementation-plan.md` § 9.

Round 5 (`implementation-plan.md` § 10) opened eight rows, **U20–U27**, and
closed seven of them: U20 and U21 by measurement and implementation (H), U22,
U23, U24, U25 and U27 by decision (D). U26 is the one it opened and could not
close. The five questions § 10.1 answers were upgrades to existing rows rather
than new ones: structured output (E), ACP (G), and the caveats on U17–U19.

What remains unproven is field behaviour, not policy: how often a host wedges,
how often a repo supplies hooks, and whether the other two platforms pass. The first two are now observable through the ledger and the doctor; the third is U16.
`decision-evidence.md` holds the measurement behind every row that moved, and
`implementation-plan.md` § 8 holds the round that closed them.

The round-4 rows were checked against primary sources, not only against `src/`:
`meta-models.github.io/muse-code-sdk/latest/guides/msp-concepts/approvals/`
(approvals park indefinitely; user input does time out),
`.../msp-wire/framing-and-caps/` (stdio is the whole v1 wire; a host must not
accept a non-spawning party; socket transports are deferred),
`.../msp-concepts/exit-classification/` (exit codes, stderr unparseable,
missing terminals reconciled on the next resume),
`.../msp-wire/conformance/` (the transcript corpus is still "not shipped" as a
package, which is what E5 assumed), the vendor's platform page (Windows is
supported, with a UAC prompt at sandbox init), Node's `child_process` docs (on
Windows `SIGTERM` is forceful and abrupt), and opencode's plugin docs (`./tui`
part, `ui.toast.show`, `tui.toast.show` event).

A second, wider sweep checked the *neighbourhood* rather than the docs we already
had, and it moved two rows:

- **The wire's own answer to a long wait.** `session/declareExternalWait` /
  `clearExternalWait` and `task/background` / `task/stop` / `task/list` are in
  `MspMethod` (pinned 1.4.24); `Item.background`, `backgroundInitiator`,
  `backgroundTarget` and `backgroundTerminalCompletion` are the view side. None is
  used in `src/`. This is U19, and it upgrades U17's closure from "pause a timer"
  to "tell the runtime what we are waiting on".
- **What the neighbours do.** `pi-muse-subscription` (npm `pi`, MIT, 0.1.0,
  2026-10-30) runs a Muse subscription the same way and reports
  `tool_timeout_sec` set to a week with `idleMinutes` defaulting to 20; openclaw's
  agent loop documents model-idle windows of 120 s cloud / 300 s self-hosted,
  reset by keepalives, with a separate progress deadline. `oh-my-pi`'s request for
  the same thing (`can1357/oh-my-pi#17444`) records the plain `muse serve` host
  mode as "Muse runs its own agent loop and tools; the host's tools are not
exposed to it" — the configuration this plugin exists to avoid.
- **MCP Tasks** (SEP-2663, final, 2026-07-28) is the protocol's long-tool answer
  and is now a D row: MSP has no task-get and the bridge returns a result, not a
  handle; opencode's MCP client passes no `onprogress` and sends no progress token
  (`anomalyco/opencode#28186`, ~60 s default, unfixed), so a handle would never be
  polled.
- **Two things that turned out not to be gaps.** Hook deadlines are declared by
  the workspace file's author (`HookDeclaration.timeoutMs`), not by this plugin,
  and the pinned typings expose no such field — no row. And the vendor's
  `STREAM_BUDGET_MS` is a 60 s constant inside the quickstart *example*, not a wire
  limit, so it does not bound a host-run tool.
