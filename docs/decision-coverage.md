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
U14, U15, P1, P2 and P3 by decision and implementation, and U16 is the one row
left, waiting on one CI dispatch. The reason for each is in that file.

---

## A. Auth and entitlement

| Dimension | This plugin | Status | Basis |
|---|---|---|---|
| Subscription via the user's own signed-in CLI | Yes | H | A12 |
| API-key / BYOK lane | None, ever | D | A2, A12 "no direct model API path", non-negotiable |
| Credential interposition (proxy, token store) | Never touches the token | D | A2 |
| Behaviour on `client_attestation_denied` | Turn fails with Muse's message, no degrade path, no retry | D | E-D1 measured the failure shape; the label stays `protocol` on purpose (D10): a denial is a client-identity mismatch, and `auth` would send users to a re-login that cannot help. Stated in README's attestation paragraph |
| Multi-account / account switching | One signed-in account per host | D | README `## Limits of the seam`, "Accounts": log out and back in |
| Shared or remote host (one `muse serve`, many users) | One host per user, spawned over stdio | D | README `## Limits of the seam`, "Deployment"; the vendor's "only the spawning process can talk to the host" is now the stated deployment shape, not only the rationale for `allowAll` |
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
| Muse subagents / workflows | Off by containment; activity ledger-only | D | A21 |
| MCP tools | `supportsMcpTools: true` | H | `capabilities.ts:49` |
| Authority order: `allowAll` vs opencode's engine | Muse `allowAll`, opencode gates | D | A20 decides it; README's Containment bullet now states it (D11): Muse runs `allowAll` because its only caller is this plugin, and every bridged call has crossed opencode's permission engine first |
| Muse permission profiles | Rejected until stable | D | A20 |
| Tool output saturation marking | Ledger-only for native calls | D | A21, A3 |

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
| Structured output / `toolChoice` | Not used | D | edge table: "no current path uses structured output" |
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
| Telemetry / OTel / metrics export | None, by decision | D | D13: the ledger is the record and the doctor is the only inspector; nothing about a session leaves the machine except the turns. Stated in README's on-disk paragraph. The only outbound write in `src/` stays the loopback bridge URL (`bridge.ts:198`) |
| Error taxonomy | 12 codes, failure classes | H | `contract/errors.ts` |
| Host death | Latch + fail the turn | H | 2026-11-22 |

## G. Distribution and policy

| Dimension | This plugin | Status | Basis |
|---|---|---|---|
| ACP surface | Not built | D | seam-review §14, plan §7 R2 withdrawn |
| Vendor partnership / host identity | Not pursued; the plugin says it is unofficial | D | D14: no partnership is sought, and the README says unofficial, not affiliated, not endorsed. Asking is the only move that changes the category, and it is a decision to leave alone |
| Published terms, privacy statement | README identity + on-disk paragraphs | D | D14: what the plugin holds (no credentials), what it writes (one ledger file, counts only), what it sends (nothing but the turns), and the MIT licence. No separate policy document: there is no server, no account, and no data collection to describe |
| Platform support (Windows, macOS) | Tested on Linux only | U | `.github/workflows/test.yml` runs the offline suite on all three, `workflow_dispatch` only: configured, never dispatched. Until it runs, this stays "Linux measured, the rest unmeasured" (U16, the owner's dispatch) |
| opencode Effect API migration | Tripwire, stay on Promise | D | A19 |
| Semver gate on host drift | Advisory by default; `MUSE_STRICT_HOST=1` refuses | H | `host-facts.ts:84-103` gates on no fingerprint, any drift tier, or no `sessionMcp`. Opt-in is the decision, not a placeholder: E-D5 measured the installed 1.4.25 host refusing against the 1.4.24 pin, so strict-by-default would break the normal case |

---

## The gaps, ranked by cost of leaving them blank

### P — partial (a decision exists, the dimension is not closed)

None. P1, P2, and P3 closed this round: the denial keeps its `protocol` label and
says so, the wedged host has a watchdog and a resume, and the README states which
layer is the fence.

### U — not considered at all

Rows are ordered by cost of leaving them blank. The **Ref** column is the canonical
`U#` used in `decision-evidence.md` and in the response that raised these; the two
numberings were different in the first draft and only one survives.

| Ref | Dimension | Why it bites | Cheapest closure |
|---|---|---|---|
| U16 | Platform support | Windows users will file the first bug | Dispatch `.github/workflows/test.yml`, then write what it showed. The only open row; it needs the owner's GitHub session, not a code change |

Closed this round, with where each landed: U5 (three-clock watchdog + resume,
`src/watchdog.ts`), U11 (cache share stays internal, D12), U12 (allowance warning,
`src/allowance.ts`), U13 (no telemetry, README), U14 and U15 (identity and on-disk
paragraphs, README). P1–P3 closed with them. The evidence for each is in
`decision-evidence.md`; the plan that carried them is
`implementation-plan.md` § 8.

## Counts

H 33 · D 28 · P 0 · X 1 · U 1 · (N not used: no row here is purely opencode's)

Sixty-two of sixty-three rows are closed: thirty-three verified and exercised,
and twenty-eight decided against with a written reason. One row is open — U16,
platform support — and it is not a code question: the workflow is configured and
nobody has dispatched it. The previous header (H 30 · D 22 · P 3 · U 7) counted
the same sixty-three rows; the difference is this round's closures, not a change
of scope.

What remains unproven is field behaviour, not policy: how often a host wedges,
how often a repo supplies hooks, and whether the other two platforms pass. The
first two are now observable through the ledger and the doctor; the third is U16.
`decision-evidence.md` holds the measurement behind every row that moved, and
`implementation-plan.md` § 8 holds the round that closed them.
