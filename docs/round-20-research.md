# Round 20 research: the field, the seam, and the delta

Round 19 closed the exit-code, provider-id, ACP and §3.2 records. A review of that
record left three missing items and three unclear ones, and the owner added two
rows the review did not name: platform support and the remote half of `policies`.
This round checks each against source, not against the previous round's prose.

The headline: **round 19's `canonical` probe tested the wrong path.** It wrote a
config-declared provider, and opencode's `canonical` inheritance is applied by the
config provider plugin to config documents. A plugin-registered provider is not a
config document. The shipped `canonical: "meta"` is a label, not an inheritance
path, so the README's "catalog supplies defaults where the plugin's table is
silent" is false for this plugin. The plugin's own model records are the source.

Every claim below carries an E-id or a source. Where the review and the source
disagree, the source wins and the disagreement is recorded.

## 1. `canonical` is applied to config documents, not plugin transforms

opencode's provider schema defines `canonical?: Provider.ID` on `Provider.Info`
(`packages/schema/src/provider.ts`). The docs describe it as "Built-in provider ID
whose catalog defaults this provider inherits" (E-D121).

The code that performs the inheritance is
`packages/core/src/config/plugin/provider.ts`. Its provider transform iterates
`configuredProviders(loaded.entries)`, and that helper filters
`entry.type === "document" && !(entry instanceof ConfigIntegration.Document)` —
config documents, with integration documents handled separately by `integrate`.
Neither path sees a plugin transform. For each configured provider, `overlayProvider` resolves
`source = providers.get(item.canonical ?? current?.provider.canonical ?? providerID)`
and, when `canonical` changed, copies the source provider's info onto the target.
It then copies each **listed** model's base from the source. A plugin transform
that calls `ctx.provider.transform` and `editor.add({ info, models })` is not in
`loaded.entries`, so none of that runs for it (E-D121).

`packages/core/src/model.ts` does read `provider.canonical`: when materializing a
model it sets `canonical: provider.canonical`. `packages/core/src/provider.ts`
does the same for its model records. That is propagation of the label, not
inheritance of limits, costs, capabilities or variants (E-D121).

The plugin also reads the field back: `src/plugin.ts` passes
`event.model.canonical ?? event.model.providerID` as the key under which opencode
nests provider options, and `language-model.ts` reads the same key. That is a
real effect, but it is keying, not inheritance.

Two upstream facts bound the config path itself:

- PR #59880, "offer every model of a canonical provider", is open. It adds the
  source provider's unlisted models to a config provider that sets `canonical`.
  Until it lands, even a config provider inherits only the models it lists
  (E-D122).
- Issue #53912 reports that on opencode 2.0.24 a plugin-added provider never
  materializes, even with `canonical`, an active `integrationID` and
  `sourceConnection`. This install is opencode 2.3.2 and lists `muse/*`, so the
  bug is not universal, but it shows the plugin-added provider path is the
  fragile one (E-D123).

**Consequence.** The plugin's `canonical: "meta"` is still useful: it supplies the
model's canonical identity, the GUI icon (`PROVIDER_CANONICAL` in
`src/plugin.ts:62`), and the provider-options key the plugin reads back, and it is
the field opencode would use if it ever applies inheritance to plugin providers.
It does not supply limits. The plugin's own model records are the source:
`toModelInfo` (`src/plugin.ts:124`) builds each limit through
`resolveModelLimits` (`src/model-limits.ts`), which reads the host's
`model/list` value first, then a pinned table (empty today), then a
conservative fallback. The plugin sets no costs. The README must say the plugin
supplies the limits itself.

## 2. Round 19's probe tested the config path

E-D120 wrote `opencode/opencode.jsonc` with a `muse-probe` provider and
`canonical: "meta"`, then ran `opencode models`. The config was read, the schema
accepted the field, the catalog had seven `meta/*` models, but `muse-probe` did
not appear because the isolated data dir had no package install. The result was
recorded as inconclusive (round 19).

That probe could not have settled the plugin question even if the package had
resolved: it was a config-declared provider. A config-declared probe tests
`configuredProviders`, which is the path that does inherit. The plugin's provider
is added by a transform, which is the path that does not. The correct experiment
is a throwaway plugin that calls `ctx.provider.transform` and adds a provider with
`canonical: "meta"` and one model with sentinel limits, then reads the model's
limit back (E-D124; plan S1).

**E-D124 result (2026-11-23): no inheritance.** The probe ran on opencode 2.3.2
with isolated `XDG_*` directories and `--standalone` (the default service port
was already held by the user's running server). It registered
`probe-canonical` through `ctx.provider.transform` with `canonical: "meta"` and
one model id that exists under `meta`, `muse-spark-1.3`, carrying sentinel
limits. `opencode models` listed `probe-canonical/muse-spark-1.3`, and
`opencode api get /api/model` returned:

```json
{"providerID":"meta","canonical":null,"limit":{"context":1048576,"output":131072}}
{"providerID":"probe-canonical","canonical":"meta","limit":{"context":111111,"output":22222}}
```

The plugin provider's model carries the label `canonical: "meta"` but keeps its
own `111111 / 22222` limits; the `meta` catalog's `1048576 / 131072` did not
reach it. That is the source read confirmed end to end: `canonical` is copied as
identity, not inherited as limits. The probe is recorded in
`scratch/round-20-probe/` and is not a test.

The source read is strong enough to state the answer now. The probe is
confirmation, not a gate. If the probe contradicts the source, stop and report:
that would mean a second consumer of `canonical` exists outside the config plugin.

## 3. One account per host is the seam, not a policy preference

The plugin spawns its own `muse serve` over stdio and never holds a credential.
MSP's own guide says "the client spawns a host process (`muse serve`), speaks
JSON-RPC 2.0 over stdio" and "the stdio wire is the only public protocol surface"
(E-D125). The wire guide's rule, quoted in the coverage row, is that "a host must
not accept a connection from a party that did not spawn it"; the unix-socket and
websocket transports are deferred past v1. One host per spawning party is the
only conformant deployment.

`muse login` stores one credential for the CLI; `muse logout` clears it. There is
no account list or switch in the CLI's own surface (the coverage row records
this; re-check `muse login --help` in the probe). A second account is therefore a
second CLI login, which is a different host, not a second account inside the same
host. The plugin has no place to put a second credential because it holds none
(E-D126).

The README's "Accounts" bullet states the limit but not the mechanism, and it
does not answer the obvious question: why can other tools do it? The answer is
that they leave MSP.

## 4. Magpie's two escapes are different, and neither is the CLI path

The review says "Magpie does multi-account by leaving the seam entirely (cookie
replay)." That is true of one Magpie plugin, not of the one usually cited:

- `sonvivu/magpie-muse-auth` signs in with Meta's device-code OAuth, mints an API
  key from the DCA token, stores the minted key and DCA token in
  `plugin-auth.json`, and sends requests to `api.meta.ai/v1/responses`. It
  supports multiple accounts because Magpie stores one credential set per
  account. No cookie is replayed; the escape is a minted key outside the CLI
  (E-D127).
- `JohnWangggg/magpie-muse-web` imports the `muse.ai` **web session** cookies over
  CDP `Storage.getCookies` into `muse2api`, a reverse-engineered wrapper of the
  consumer web app, with an account pool and 48-hour renewal. That is the cookie
  route. A `magpie-community/plugins` review declined the pattern: "Every
  provider in this repo signs in to a vendor's own account through the vendor's
  own service… a third-party server turning a consumer web session into an API,
  with account pooling built in… Meta hasn't offered or allowed this" (E-D127).

So the contrast is stronger than the review's sentence: the minted-key route is
the auth competitor's grey zone, the cookie route is a consumer-web-session
escape that the community itself declined, and the CLI path is the only one where
the credential stays inside Muse Code. The plugin's one-account limit is the
price of that path, not a missing feature.

## 5. Discovery: opencode directories, not the ACP registry

The ACP Registry lists **agents** that implement the Agent Client Protocol, and
its README says it is "a curated list of agents that support user
authentication", verified to return valid `authMethods` in the ACP handshake.
Muse Code and OpenCode are listed as agents. This plugin is an opencode plugin,
not an ACP agent: it has no ACP handshake, no `authMethods`, and no binary or npx
entry of its own. A submission would be rejected on category, not on quality
(E-D128).

The discovery channels that do apply:

- `awesome-opencode/awesome-opencode` (11,086★) is a curated README with a
  `PLUGINS` section of `<details>` entries; a PR adds one block. It has no Muse
  entry today (E-D129).
- `opencode.im` is a reviewed directory that auto-discovers npm packages with
  the `opencode-plugin` keyword and says it checks daily; the package
  `@jonathand34/opencode-plugin-muse` 0.1.12 carries that keyword, so it is
  eligible for automatic discovery (E-D130). A direct check on 2026-11-23 found
  no page at `/plugin/opencode-plugin-muse` (404) and no site-search hit, so no
  listing was found; the site's `submit` path is open.
- `opendock.net` indexes 3,056 plugins from npm and GitHub automatically
  (E-D130).
- `flow-next` (733★) lists Muse Code as a supported **harness**, not as a
  directory of Muse providers. It shows the ecosystem exists; it is not a
  listing this plugin can join (E-D131).

The review's "ACP registry" is a category error; the opencode directories are the
real channel. The plugin is reachable today by install command and GitHub search,
which is the "people who already know to look" problem.

## 6. The terms restrict the credential, not the client

Meta's Model API Terms, §3.2 (last updated 2026-10-09):

> That key or credential is for use only with the coding harness under your
> Coding Harness Subscription, is subject to the restrictions on Meta Model API
> keys in Section 3.1, and may not be used to access the Services outside the
> coding harness or to circumvent your subscription's usage limits or billing.

The object of the restriction is the **key or credential**, and the permitted
place is **the coding harness**. MSP's guide defines the client as "an editor, a
desktop app, a script" that "spawns a host process (`muse serve`)" and says the
stdio wire is the only public protocol surface. The plugin is the client; the
host is `muse serve`; the credential is used by the host. The plugin never reads,
stores or forwards it (E-D125, E-D132).

That is the strongest reading available without a Meta statement. It does not
claim endorsement: the subscription docs say "Muse Code only", the SDK is a
developer preview, and Meta can restrict the arrangement. The residual risk is a
refused turn, not a leaked credential. The review's "unclear 1" is therefore a
reading, not an experiment; the condition that would change it is a Meta
statement or a refusal that names the client.

## 7. Platform: three deltas, one matrix that cannot test the seam

Linux is the tested surface. The matrix (`.github/workflows/test.yml`) runs the
offline suite on ubuntu, macOS and Windows, `workflow_dispatch` only. It has
never been dispatched; `gh run list` shows no `test` run, and the branch does not
exist remotely, so a dispatch is a 404 until the tree is pushed (E-D133).

The three Windows unknowns are not closed by that matrix:

- **POSIX modes.** The ledger and the hook trust record are written `0600` on
  POSIX. Node documents that on Windows only the write permission (the read-only
  attribute) can be changed, with no owner/group/others distinction; Windows
  uses ACLs. The matrix would run the suite, whose hosts are `.mjs` fixtures, not
  the ledger or the trust record (E-D134).
- **Shutdown ladder.** Node documents `SIGTERM` as not supported on Windows and
  says `SIGKILL`, `SIGTERM`, `SIGINT` and `SIGQUIT` "terminate the process
  forcefully and abruptly". "Drain, then SIGTERM, then SIGKILL" collapses to one
  hard kill. The SDK owns the ladder and offers no rung switch (E-D135).
- **UAC.** The vendor documents a UAC prompt when the sandbox initialises; a
  headless spawn cannot answer it, and it surfaces 900 s later as
  `host_idle_timeout`, which names the wrong cause. There is no Windows machine
  here, and no test claims to have seen it (E-D136).

The field's pattern is capability-negotiation with a documented delta, not a
parity claim: Anthropic's ARM64-Windows source fallback, Codex's three Windows
sandbox implementations, opencode's native Windows binaries with unsupported
package managers, and Muse's own Windows list. This plugin already follows it in
the README; the gap is a single capability table that says what is tested, what
is inferred, and what is unmeasured.

## 8. Remote `policies`: nothing to build against silence

The local half is H: the doctor spawns `opencode --print-logs debug config`, reads
its own stderr, and names each dropped statement by pointer and action; a refused
file is a `config` row; a dropped statement gates by default (E-D137).

The remote half is not. A Console-delivered policy is decoded on the vendor's
side, where unknown actions and effects are filtered without a diagnostic
(`anomalyco/opencode#60252`, open). The issue asks for strict validation or a
reject; it has not shipped. `config status --json` names only `system_file`
sources, both absent on this machine, so the channel is one this checkout cannot
observe (E-D137).

The field's technique is to prove a deny by its effect: Chrome Enterprise's
policy page shows a per-policy source and a stated precedence (platform > machine
cloud > OS-user > cloud-user), and `chrome://policy` can reload and show it. The
plugin has no equivalent: it cannot query the host about a policy that was
applied outside its process, and a probe that attempts a denied action is
side-effectful and cannot distinguish "denied" from "not configured". There is
nothing to build against silence; the honest record is the gap and the condition
(a queryable policy surface, or #60252 shipping) (E-D138).

## 9. Experiments

| Id | Question | Result | Source |
|---|---|---|---|
| E-D121 | Where does opencode apply `canonical` inheritance? | `packages/core/src/config/plugin/provider.ts` iterates config `Document` entries only; `model.ts` copies `provider.canonical` onto models. Plugin transforms are not in that path. | opencode `dev` source, 2026-11-23 |
| E-D122 | Does a config provider inherit unlisted models today? | No. PR #59880 (open) would add them; until then only listed models get a base. | github.com/anomalyco/opencode/pull/59880 |
| E-D123 | Do plugin-added providers materialize on 2.0.24? | No, even with `canonical`, `integrationID` and `sourceConnection`; this install is 2.3.2 and does list `muse/*`. | github.com/anomalyco/opencode/issues/53912; local |
| E-D124 | Does a plugin-registered provider with `canonical` inherit a catalog model's limits? | No. The plugin-path probe kept sentinel `111111/22222` while `meta` reported `1048576/131072` for the same model id; the model still carried `canonical: "meta"`. Round 19's config probe did not test this path. | Plan S1; `scratch/round-20-probe/`; round 19 E-D120 |
| E-D125 | What is MSP's client/host model? | A client (editor, desktop app, script) spawns `muse serve`; the stdio wire is the only public protocol surface. | meta-models.github.io/muse-code-sdk/1.4/guides/msp-concepts |
| E-D126 | How many accounts does the CLI hold? | One credential; `muse login` stores it, `muse logout` clears it; no account list/switch. Re-checked 2026-11-23: both help texts take no arguments and name no account. | Local CLI help; coverage row |
| E-D127 | How does Magpie do multi-account? | Two escapes: `magpie-muse-auth` mints an API key per account; `magpie-muse-web` imports `muse.ai` web cookies into `muse2api` with a pool. The community declined the cookie pattern. | github.com/sonvivu/magpie-muse-auth; github.com/JohnWangggg/magpie-muse-web; magpie-community/plugins#95 |
| E-D128 | Is the ACP Registry a channel for this plugin? | No. It lists ACP agents with `authMethods`; this is an opencode plugin, not an agent. | agentclientprotocol.com/get-started/registry; registry README |
| E-D129 | Is the plugin in awesome-opencode? | No Muse entry; the list has a `PLUGINS` section of `<details>` blocks. | github.com/awesome-opencode/awesome-opencode |
| E-D130 | Do opencode directories auto-index npm plugins? | `opencode.im` auto-discovers packages with the `opencode-plugin` keyword; `opendock.net` indexes npm/GitHub. The package carries the keyword, but a direct check on 2026-11-23 found no `opencode.im` page (404) or search hit, so no listing was found. | opencode.im/plugin/opencode-plugin-muse; opencode.im/submit; opendock.net/plugins; npm view |
| E-D131 | Is flow-next a listing channel? | No. It lists Muse Code as a supported harness, not Muse providers for opencode. | github.com/gmickel/flow-next |
| E-D132 | What do the terms restrict? | The key/credential, to the coding harness; not the client. The CLI is the harness; `muse serve` is its documented headless surface. | dev.meta.ai/legal/terms-of-service §3.2 |
| E-D133 | Has the platform matrix run? | No. `workflow_dispatch` only; `gh run list` shows no `test` run; the branch is not remote, so a dispatch is a 404. | `.github/workflows/test.yml`; `gh run list` |
| E-D134 | What happens to POSIX modes on Windows? | Only the write bit (read-only attribute) can change; no owner/group/others; ACLs are not modeled. | Node fs docs; nodejs/node#20636 |
| E-D135 | Does the shutdown ladder survive Windows? | No. `SIGTERM` is not supported; `SIGKILL`/`SIGTERM`/`SIGINT`/`SIGQUIT` terminate forcefully; the ladder collapses to one hard kill. | Node process and child_process docs |
| E-D136 | What does UAC do to a headless spawn? | The vendor documents a UAC prompt at sandbox init; a headless spawn cannot answer; it surfaces as `host_idle_timeout` 900 s later. No Windows host here. | Vendor Windows list; coverage row U24 |
| E-D137 | Can the plugin see a Console-delivered policy? | No. The remote decoder filters unknown actions/effects without a diagnostic (#60252); `config status --json` names only `system_file`, both absent. | github.com/anomalyco/opencode/issues/60252; local |
| E-D138 | What is the field technique for policy visibility? | Chrome Enterprise shows per-policy source and precedence, and `chrome://policy` reloads it. The plugin has no equivalent; a deny-by-effect probe is side-effectful and ambiguous. | support.google.com/chrome/a/answer/9037717 |

## 10. Sources

- opencode `canonical`: https://opencode.ai/docs/providers/ ;
  https://github.com/anomalyco/opencode/blob/dev/packages/core/src/config/plugin/provider.ts ;
  https://github.com/anomalyco/opencode/blob/dev/packages/core/src/model.ts ;
  https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/provider.ts
- opencode PR #59880: https://github.com/anomalyco/opencode/pull/59880
- opencode issue #53912: https://github.com/anomalyco/opencode/issues/53912
- opencode issue #60252: https://github.com/anomalyco/opencode/issues/60252
- MSP concepts: https://meta-models.github.io/muse-code-sdk/1.4/guides/msp-concepts/
- Meta terms: https://dev.meta.ai/legal/terms-of-service
- Magpie: https://github.com/sonvivu/magpie-muse-auth ;
  https://github.com/JohnWangggg/magpie-muse-web ;
  https://github.com/magpie-community/plugins/pull/95
- ACP registry: https://agentclientprotocol.com/get-started/registry ;
  https://github.com/agentclientprotocol/registry
- Directories: https://github.com/awesome-opencode/awesome-opencode ;
  https://opencode.im/ ; https://opencode.im/submit ; https://www.opendock.net/plugins/
- flow-next: https://github.com/gmickel/flow-next
- Node: https://nodejs.org/api/fs.html ; https://nodejs.org/api/process.html ;
  https://nodejs.org/api/child_process.html ; https://github.com/nodejs/node/pull/20636
- Chrome policy: https://support.google.com/chrome/a/answer/9037717
- Local: `.github/workflows/test.yml`; `docs/decision-coverage.md`;
  `README.md`; `src/plugin.ts`; `scripts/doctor.ts`
