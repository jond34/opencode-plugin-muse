# Round 20 plan: the field, the seam, and the delta

Round 19 closed the exit-code, provider-id, ACP and §3.2 records. A review of that
record left three missing items and three unclear ones, and the owner added the
platform row and the remote half of `policies`. Round 20 is records-first, with
one confirmation experiment and one optional listing action. There is no new
runtime feature.

Evidence: `docs/round-20-research.md` (E-D121–E-D138). This plan names the
decisions, the exact edits, the experiment, the product questions, and the
conditions that would change the answers.

## Decisions

**D113 — `canonical` is the model's identity, not an inheritance path for a
plugin-registered provider.** opencode's config provider plugin applies
`canonical` inheritance to `providers` entries in config documents (integration
documents go through `integrate`); a plugin's `ctx.provider.transform` is neither.
`model.ts` copies `provider.canonical` onto models, which is a label. The
plugin's own model records are therefore the source of limits: `toModelInfo`
(`src/plugin.ts:124`) builds each limit through `resolveModelLimits`
(`src/model-limits.ts`), which reads the host's `model/list` value first, then a
pinned table (empty today), then a conservative fallback. The plugin sets no
costs. The README's "catalog supplies defaults where the plugin's table is
silent" is false and is corrected. The field stays because it supplies the model's canonical
identity, the picker icon, and the provider-options key the plugin reads back,
and because it is the field opencode would use if it extends inheritance to
plugin providers (E-D121–E-D124).

**D114 — one account per host is the seam, not a policy preference.** `muse
login` stores one credential and `muse logout` clears it; MSP's client spawns its
own `muse serve`, and a host must not accept a connection from a party that did
not spawn it. A second account is a second CLI login, not a second account in the
same host. The tools that support multiple accounts leave MSP: `magpie-muse-auth`
mints an API key per account and calls the Responses API directly;
`magpie-muse-web` imports the `muse.ai` web session's cookies into a
reverse-engineered wrapper. Both hold the credential outside the CLI, which this
plugin will not do. The README's Accounts bullet gains the mechanism and the
contrast (E-D125–E-D127).

**D115 — discovery is an opencode-plugin directory problem, not an ACP-registry
problem.** The ACP Registry lists agents that implement ACP and return
`authMethods`; this plugin is an opencode plugin with no ACP handshake, so a
submission is a category error. The channels that apply are
`awesome-opencode` (a curated README PR), `opencode.im` (auto-discovers npm
packages with the `opencode-plugin` keyword), and `opendock.net` (auto-index).
`flow-next` lists Muse Code as a supported harness, not as a Muse-provider
directory. Q11 decides whether to pursue the listing (E-D128–E-D131).

**D116 — the terms restrict the credential, not the client.** §3.2 says the key
or credential is for use only with the coding harness and may not be used outside
it. The credential is used by `muse serve`, which is Muse Code's documented
headless surface; the plugin is the client and never holds it. That is the
strongest reading available without a Meta statement, and it is not an
endorsement claim. The §3.2 paragraph gains one sentence saying so (E-D125,
E-D132).

**D117 — platform support is capability-negotiation, not parity.** Linux is
tested; macOS and Windows are unmeasured. The matrix is configured but has never
been dispatched and cannot be until the branch exists remotely. The three
Windows unknowns are not closed by it: POSIX modes (Windows changes only the
write bit; ACLs are not modeled), the shutdown ladder (Node documents `SIGTERM`
as unsupported and `SIGKILL`/`SIGTERM`/`SIGINT`/`SIGQUIT` as forceful, so the
ladder collapses), and UAC under a headless spawn (vendor-documented; surfaces as
`host_idle_timeout`). A `docs/platform-support.md` capability table states what is
tested, inferred and unmeasured. Q13 decides whether to push and dispatch the
matrix (E-D133–E-D136).

**D118 — the remote half of `policies` stays unobservable.** The local half is H:
the doctor reads the host's own diagnostic and names each dropped statement. A
Console-delivered policy is decoded on the vendor's side, where unknown actions
and effects are filtered without a diagnostic (#60252, open), and `config status
--json` names only `system_file` sources. Chrome Enterprise's per-policy source
and precedence are the field technique; the plugin has no equivalent, and a
deny-by-effect probe is side-effectful and ambiguous. A `docs/policy-remote.md`
records the gap and the condition (a queryable surface, or #60252 shipping); no
probe is added (E-D137, E-D138).

**D119 — one exit code, the provider id `muse`, and no ACP surface are settled.**
The exit-code correction is closed (D102); the provider id is `muse` (D103); the
plugin adds no protocol surface (D104). Round 20 does not reopen them. The ACP
Registry finding reinforces D104: the registry is for agents, and this is not
one.

**D120 — the round-19 `canonical` probe tested the config path, not the plugin
path.** E-D120 wrote a config-declared `muse-probe`, which is the path that does
inherit; a plugin transform is the path that does not. The result was
inconclusive for a package-resolution reason, but it could not have settled the
plugin question even if it had resolved. The round records the correction and
runs one plugin-path confirmation (E-D124; S1).

**D121 — ecosystem presence is a distribution decision, not a code change.** No
runtime code, dependency or protocol surface is added for discovery. The options
are a curated-list PR, ensuring the npm keyword is present (it is), and doing
nothing. Q11 chooses.

**D122 — the round's code surface is one optional test, not a feature.** If the
plugin-path probe confirms `canonical` is identity-only, add one test that pins
the canonical division and the model record's limits, so a future opencode change
that starts inheriting is visible. No production code changes. If the probe is
inconclusive, no test is added and the source read stands.

**D123 — experimental surfaces are recorded as snapshots, not contracts.**
opencode 2.x's plugin API, `canonical` inheritance, the `policies` plane, and
Muse's SDK/MSP preview are moving. This round records what opencode 2.3.2 and
CLI 1.4.25 do, adds no shim for an unshipped field, and keeps the decisions that
depend on them provisional: `canonical` is identity on this version (D113),
remote policy is unobservable on this version (D118), and the platform matrix
is undispatched. The existing `MUSE_STRICT_HOST` opt-in is the pattern: schema
drift is visible, not fatal. A change in any of these is a new round, not a
silent edit to this record; revisit when the surface stabilizes.

## Volatility

The experimental surfaces are recorded at the versions this round ran, not as
contracts. A change is a new round, not a silent edit.

| Surface | Snapshot | Posture | Revisit when |
|---|---|---|---|
| opencode plugin API / `canonical` | 2.3.2; `canonical` inheritance is config-only; PR #59880 open | Identity is documented; no shim for a plugin-provider inheritance path | Inheritance reaches plugin providers, or the plugin API changes |
| `policies` plane | 2.3.2; local drops readable, remote decoder silent (#60252) | Local H, remote unobservable, no probe | #60252 ships, or the host exposes a query surface |
| Muse SDK / MSP | SDK 1.4.24, CLI 1.4.25, developer preview | Pinned; `MUSE_STRICT_HOST` opt-in; no new surface | The SDK/MSP leaves preview, or the served schema drifts |
| `muse acp` | Shipped, no compatibility promise | No ACP surface | The vendor promises compatibility, or opencode grows an ACP client |
| Platform matrix | `workflow_dispatch` only; never run | Documented capability delta | The branch is remote and the matrix is dispatched, or a host produces evidence |

## Experiment

**S1 (E-D124, confirmation, not a gate).** A throwaway plugin that adds a
provider through `ctx.provider.transform`, not through config. In
`scratch/round-20-probe/`, with isolated `XDG_CONFIG_HOME`, `XDG_DATA_HOME`,
`XDG_STATE_HOME` and `XDG_CACHE_HOME`:

0. Run `muse login --help` and `muse logout --help`; record whether either lists
   or switches accounts. This is E-D126's fresh check.
1. Write `opencode/plugins/canonical-probe.js`:

```js
export default {
  id: "canonical-probe",
  async setup(ctx) {
    await ctx.provider.transform((editor) => {
      editor.add({
        info: {
          id: "probe-canonical",
          name: "Probe Canonical",
          activation: "enabled",
          package: "@ai-sdk/openai-compatible",
          canonical: "meta",
          settings: { baseURL: "http://127.0.0.1:1/v1", apiKey: "probe" },
        },
        models: [
          {
            id: "muse-spark-1.3",
            modelID: "muse-spark-1.3",
            providerID: "probe-canonical",
            name: "Probe Model",
            type: "chat",
            capabilities: { tools: true, input: ["text"], output: ["text"] },
            variants: [],
            time: { released: 0 },
            cost: [],
            status: "active",
            enabled: true,
            limit: { context: 111111, output: 22222 },
          },
        ],
      });
    });
  },
};
```

2. Run `XDG_CONFIG_HOME=$tmp XDG_DATA_HOME=$tmp/data XDG_STATE_HOME=$tmp/state XDG_CACHE_HOME=$tmp/cache opencode models --standalone` and look for `probe-canonical/muse-spark-1.3`. `--standalone` matters: the isolated `XDG_*` dirs do not isolate the default service port, and a running user service makes the plain command fail with a port conflict.
3. Read the limit through `opencode api get /api/model --standalone` and compare it with `meta`'s limit for `muse-spark-1.3` (`1048576 / 131072` on 2026-11-23). If the plugin provider keeps `111111 / 22222`, `canonical` did not inherit; if it shows `meta`'s numbers, it did.
4. If the provider does not appear, record "inconclusive: plugin-added provider did not materialize" and rely on the source read. A minimal model record is silently dropped; the full record above is the working shape. Do not edit `src/` for the probe. Do not install a package into the isolated data dir; one attempt is the budget.

Decision mapping:

- **No inheritance (expected):** D113 stands; S2's README correction lands; the optional test in S9 is added.
- **Inheritance:** stop and report. The source read missed a consumer; the README must say "inherits" and the table becomes a fallback, not the source.
- **Inconclusive:** D113 stands on the source read; the README says "declares" and "the plugin's model records are the source", not "inherits".

## Steps

**S2.** `README.md`, "Why `muse`, not `meta`". Replace:

```text
model list and limits, and leaves sign-in to `muse login`. The provider declares
`canonical: "meta"`, so opencode's catalog supplies defaults where the plugin's
table is silent; the model list stays the plugin's. The cost is UX parity:
```

with:

```text
model list and limits, and leaves sign-in to `muse login`. The provider declares
`canonical: "meta"` for the model's catalog identity and the picker icon;
opencode applies `canonical` inheritance in its config-provider path, which reads
`providers` entries from config documents, not providers added by a plugin
transform. So the plugin supplies each model's limits itself, and the model list
stays the plugin's. The cost is UX parity:
```

**S3.** `README.md`, "Accounts". Replace:

```text
- **Accounts.** One signed-in identity per host. Switching accounts means
  `muse logout` and a fresh login before opencode restarts; the plugin has no
  account switch and never sees the credential.
```

with:

```text
- **Accounts.** One signed-in identity per host. `muse login` stores one
  credential and `muse logout` clears it, so a second account is a second CLI
  login, not a second account inside the same host. MSP makes that structural:
  the client spawns its own `muse serve`, and a host must not accept a connection
  from a party that did not spawn it. The tools that do support multiple accounts
  leave MSP to do it: `magpie-muse-auth` mints an API key per account and calls
  the Responses API directly, and `magpie-muse-web` imports the `muse.ai` web
  session's cookies into a reverse-engineered wrapper. Both hold the credential
  outside the CLI; this plugin does not. Switching is therefore `muse logout`,
  a fresh login, and an opencode restart; the plugin never sees the credential.
```

**S4.** `README.md`, the §3.2 paragraph. Replace:

```text
be restricted at any time. If it is, the failure is a refused turn, not a leaked
credential.
```

with:

```text
be restricted at any time. The terms restrict the credential, not the client:
the credential is used by Muse Code, which is the coding harness, and
`muse serve` is its documented headless surface. If Meta restricts the
arrangement, the failure is a refused turn, not a leaked credential.
```

**S5.** New `docs/platform-support.md`: a capability table with one row per
surface (offline suite, ledger mode, trust-record mode, shutdown ladder, UAC,
spawn resolution), columns Linux / macOS / Windows, and the evidence. State
plainly: Linux tested; macOS and Windows unmeasured; the matrix is
`workflow_dispatch` only, has never run, and cannot be dispatched until the
branch exists remotely; the three Windows unknowns are not closed by the matrix.
Link it from the README's Platforms bullet with one sentence.

**S6.** New `docs/policy-remote.md`: the local half (H), the remote half
(unobservable), #60252, `config status --json` naming only `system_file`, the
Chrome Enterprise source/precedence comparison, why a deny-by-effect probe is not
added, and the condition (a queryable surface or #60252 shipping). Link it from
the coverage row and the README's `policies` paragraph.

**S7.** New `docs/ecosystem.md`: the channel table (ACP Registry: agents only,
not applicable; awesome-opencode: PR; opencode.im: auto npm keyword; opendock:
auto; flow-next: harness, not listing; GitHub search), the current package state
(`@jonathand34/opencode-plugin-muse` 0.1.12, `opencode-plugin` keyword present),
and the chosen action from Q11. If Q11 is A, include this exact awesome-opencode
block and the opencode.im check URL, but do not open the PR from this round
unless the owner asks:

```html
<details>
  <summary><b>Muse Code</b> <img src="https://badgen.net/github/stars/jond34/opencode-plugin-muse" height="14"/> - <i>Muse Code subscription provider</i></summary>
  <blockquote>
    Registers the <code>muse</code> provider and drives the signed-in <code>muse</code> CLI over MSP, so a Muse Code subscription works in opencode without the credential leaving the CLI. Install with <code>opencode plugin add @jonathand34/opencode-plugin-muse</code>.
    <br><br>
    <a href="https://github.com/jond34/opencode-plugin-muse">🔗 <b>View Repository</b></a>
  </blockquote>
</details>
```

**S8.** `docs/decision-coverage.md`, the Round 20 audit. Insert after the Round 19
audit, with HEAD `8abc1d8` and E-D121–E-D138. It records:

- the `canonical` correction: config path, not plugin path; the table is the
  source; the round-19 probe was mis-targeted;
- the two-account seam and the Magpie contrast;
- the ACP Registry category correction and the opencode directory channels;
- the terms reading (credential, not client);
- the platform capability delta and the undispatched matrix;
- the remote-policy silence and the no-probe decision;
- the settled items (one exit code, `muse`, no ACP surface).

Then update the basis cells:

- provider paragraph: "opencode's `canonical` field is the identity path that does
  not touch the credential; inheritance applies to config providers, so the
  plugin's own model records are the source" (D113; E-D121–E-D124).
- Accounts row: README `## Limits of the seam`, "Accounts": one credential, MSP
  spawn rule, Magpie contrast (D114; E-D125–E-D127).
- Platform row: cite `docs/platform-support.md`; keep P; keep the three unknowns
  (D117; E-D133–E-D136).
- `policies` row: cite `docs/policy-remote.md`; keep P; no probe (D118;
  E-D137–E-D138).

Do not revert the owner's working-tree changes in `docs/decision-coverage.md`
(U16→P, counts 85/85). Layer the round-20 edits on top.

**S9 (optional, only if S1 confirms identity-only).** `test/contributor-models.test.ts`:
one test that `toModelInfo` keeps the model record's limit instead of a catalog
lookup. The probe already covers the `canonical` label; the unit test pins the
half that is local. No production code change.

**S10.** Verify:

- `bun run check:offline` → the suite's actual count, 0 fail, exit 0.
- `grep -n "canonical" README.md docs/decision-coverage.md` shows "identity" and
  "supplies each model's limits itself", never "catalog supplies defaults".
- `grep -n "Accounts" README.md` shows the seam and the Magpie contrast.
- `grep -n "credential, not the client" README.md` shows the §3.2 sentence.
- `grep -n "ACP Registry" docs/ecosystem.md docs/decision-coverage.md` shows
  "agents only" and "not applicable".
- `grep -n "workflow_dispatch" docs/platform-support.md` shows the matrix status.
- `grep -n "60252" docs/policy-remote.md docs/decision-coverage.md` shows the
  remote silence.
- `git status -s` shows only `docs/integration-landscape.md` plus the round-20
  files and the owner's `docs/decision-coverage.md` edits; nothing under `src/`
  unless S9 is added.

**S11.** Commit only after the owner says go. Suggested sequence:

1. `Correct the provider and account records: canonical is identity, one host per account`
   — README S2–S4, `docs/decision-coverage.md` S8, `docs/round-20-research.md`,
   this plan and the prompt.
2. `Record the platform and remote-policy deltas`
   — `docs/platform-support.md`, `docs/policy-remote.md`, `docs/ecosystem.md`,
   and the README links.
3. If S9 is added: `Pin the canonical division and the model record's limits` — the test.

Do not push, tag or publish. Do not stage `docs/integration-landscape.md`.

## Product questions

Raised after the evidence, as requested. The plan defaults to A in each.

**Q9. `canonical`: keep it as identity, remove it, or replace the table with
inheritance?**
(A) Keep `canonical` for identity, the picker icon, and the provider-options key,
and correct the README — recommended. No code change; the field is already
shipped; the table stays the source (E-D121–E-D124).
(B) Remove `canonical` and keep the table fully explicit. Only if the owner
prefers no field that does nothing for limits; the cost is the Meta icon and the
model's canonical label.
(C) Rely on inheritance and delete the table. Not available: the plugin path does
not inherit, and the table is the only source.

**Q10. Two accounts: document the seam, add a logout/login helper, or support
multiple accounts by minting keys?**
(A) Document the seam and the Magpie contrast — recommended. No code change; the
limit is structural (E-D125–E-D127).
(B) Add a `muse account` helper that runs `muse logout` and `muse login` for you.
A UX wrapper around the same one-account seam; it still needs an opencode
restart, and it still holds no credential.
(C) Support multiple accounts by minting or storing keys. This is the auth
competitor's route and breaks the plugin's central invariant. Not recommended.

**Q11. Discovery: submit to `awesome-opencode` and verify the auto-index, add a
README line only, or do nothing?**
(A) Submit a PR to `awesome-opencode` and check `opencode.im`'s auto-discovery —
recommended. The package already has the keyword; the ACP Registry is not a
channel (E-D128–E-D130).
(B) Add a "Where to find it" README line only. Cheaper; does not solve the
"people who already know to look" problem.
(C) Do nothing. The plugin remains reachable by install command and GitHub
search.

**Q12. §3.2: add the credential-vs-client sentence, keep the paragraph, or
strengthen the disclaimer?**
(A) Add the sentence — recommended. It answers the review's "unclear 1" without
claiming endorsement (E-D125, E-D132).
(B) Keep the paragraph as is. Honest, but leaves the client/harness question
implicit.
(C) Add a stronger "not supported by Meta" warning. The paragraph already says
Meta has not documented the arrangement as supported; a stronger claim may
overstate what the terms say.

**Q13. Platform: document the capability delta, push a branch and dispatch the
matrix, or claim parity?**
(A) Document the delta and keep Linux as the tested surface — recommended. The
matrix proves the fixtures, not the seam; the three unknowns need a Windows host
(E-D133–E-D136).
(B) Push a branch and dispatch `test.yml`, then write what it showed. The matrix
is still only the suite; it does not close the three unknowns. Needs the owner's
GitHub session and a push.
(C) Claim parity. Not supported: macOS and Windows are unmeasured.

**Q14. Remote `policies`: document the silence, add a deny-by-effect probe, or
wait for #60252?**
(A) Document the silence and the condition — recommended. There is nothing to
build against silence; a probe is side-effectful and ambiguous (E-D137,
E-D138).
(B) Add a `doctor --probe-policy` that attempts a denied action. It cannot
distinguish "denied" from "not configured", and it may have side effects.
(C) Wait for #60252. That is the same as A for now, minus the record.

**Q15. Commit and push.** The round is records-first. Commit only after the owner
says go; push only if the owner asks. The matrix question (Q13 B) is the only
reason to push.

## Steelmen and strawmen

**`canonical`.** The steelman for inheritance is the docs' "catalog defaults this
provider inherits" and PR #59880, which extends the config path. The steelman
against is the code: `configuredProviders` filters config documents, and a plugin
transform is not one; `model.ts` only copies the field. Strawman one: "the probe
proved inheritance" — it proved the config was read, not that a plugin provider
inherits. Strawman two: "`canonical` is useless" — it still supplies identity and
the icon, and it is the field opencode would use if it extends the path.

**Two accounts.** The steelman for multi-account is Magpie: it is convenient, and
the plugins exist. The steelman against is the seam: the client spawns its own
host, the host must only accept its spawner, and the CLI stores one credential;
the multi-account tools leave MSP and hold the credential outside the CLI.
Strawman one: "one account is a Meta rule" — it is a consequence of MSP, not a
stated rule. Strawman two: "Magpie is one thing" — it is two escapes, a minted
key and a web-cookie import, and the community declined the second.

**Discovery.** The steelman for the ACP Registry is its audience and its curated
verification. The steelman against is category: it lists agents with
`authMethods`, and this is an opencode plugin. Strawman one: "listing is
marketing" — discovery is the difference between a tool people find and one they
do not. Strawman two: "the package is already listed everywhere" — it is not in
`awesome-opencode`, and the auto-indexers may or may not have picked it up.

**Terms.** The steelman for "outside the harness" is that the request originates
in opencode, not the Muse TUI. The steelman against is the text: the object is
the credential, the permitted place is the coding harness, the credential is used
by `muse serve`, and MSP documents the client as an editor, app or script.
Strawman one: "publishing is the violation" — the clause targets the credential's
use, not the tarball. Strawman two: "the plugin is the harness" — the CLI is.

**Platform.** The steelman for parity is user expectation: a plugin that works on
Linux should work on macOS and Windows. The steelman against is evidence: the
matrix has never run, it proves the fixtures, and the three Windows unknowns need
a Windows host. Strawman one: "Linux-only is a bug" — it is a documented
capability delta. Strawman two: "the matrix would prove the seam" — it would not.

**Remote policy.** The steelman for a probe is the field technique: prove a deny
by its effect, as Chrome's policy page does. The steelman against is that the
plugin has no query surface, the remote decoder is silent, and a probe cannot
distinguish denial from absence. Strawman: "the doctor should read the Console" —
there is no API to read.

## Conditions for confidence

| Decision | Confident when | Flip when |
|---|---|---|
| D113 `canonical` identity | source shows the config path only; the plugin-path probe shows no inherited limit | the probe shows an inherited limit, or opencode starts applying `canonical` to plugin providers |
| D114 one account | `muse login` holds one credential; MSP's spawn rule; Magpie's escapes hold the credential outside the CLI | the CLI adds an account list/switch, or MSP adds a multi-tenant transport |
| D115 discovery | the ACP Registry requires `authMethods`; the package has the npm keyword; the directories index it | the ACP Registry adds a plugin category, or a directory rejects the package |
| D116 terms | §3.2 restricts the credential; `muse serve` is the documented headless surface | Meta states the client is outside the harness, or a refusal names it |
| D117 platform delta | Linux tested; the three Windows unknowns are documented; the matrix has not run | a Windows/macOS host produces evidence, or the matrix is dispatched |
| D118 remote policy | #60252 is open; `config status` names only `system_file`; no query surface | #60252 ships, or the host exposes policy source/precedence |
| D119 settled items | D102, D103 and D104 stand; the ACP Registry is agents-only | a new caller branches on the exit code, or an ACP client needs Muse's loop inside opencode |

## Gates

- No push, tag or publish. No `muse acp`. No new dependency. Never write the
  host's log. `docs/integration-landscape.md` is the owner's edit: never stage.
  Scratch stays in `scratch/`. Commits only after the owner says go.
- Preserve the owner's working-tree changes in `docs/decision-coverage.md`
  (U16→P, counts 85/85); do not revert them. Layer the round-20 edits on top.
- Every new claim carries an E-id or a source. Do not say "inherits" for
  `canonical` unless the plugin-path probe shows it; the default is "declares"
  and "the plugin's model records are the source".
- The ACP Registry is "agents only", never "a listing we should join".
- The two-account answer names the seam and the Magpie contrast; it does not call
  the limit a Meta rule.
- The §3.2 sentence says "the credential, not the client"; it does not claim
  endorsement.
- Platform: "tested on Linux; macOS and Windows unmeasured"; no parity claim.
- Remote policy: "local H, remote unobservable"; no probe claim.
- Experimental surfaces are snapshots, not contracts: do not add a shim for an
  unshipped field, and give every decision that depends on one a flip condition.
- If a check disagrees with the research, stop and report rather than editing the
  expectation.

## Prohibitions

No push, tag or publish. No `muse acp`. No new dependency. Never write to the
host's log. `docs/integration-landscape.md` is the owner's edit: never stage.
Scratch stays in `scratch/`. Commits only after the owner says go.
