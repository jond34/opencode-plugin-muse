# Round 19 research: the divergence, the catalog, and the report shape

Round 18 closed the status model and left the report shape recorded. A review of
that record raised six items: the exit-code divergence is wider than D85 says,
the provider id is a choice rather than a given, the plugin has no protocol
surface, the §3.2 posture is missing from the README, `--json` carries no
version, and a histogram would sidestep the roll-up question. This round checks
each claim against the field, corrects the two that are imprecise, and decides
what to document, what to measure, and what to build.

Every claim below carries an E-id or a source. Where the review and the source
disagree, the source wins and the disagreement is recorded.

## 1. The exit-code split is real, but not on this axis

The review says round 17's "the field splits could-not-evaluate from
found-problems but not on a number" is empirically wrong, citing a4's
`0/1/2/10`, ripr's `0/2/3`, Vue Doctor's `0/1/2/3` and alint's `0/1/2/3`. The
first citation does not survive a read: `a4 doctor` exits 0 for `ok`, `warn` and
`unknown`, and 1 for `fail`; the `0/1/2/10` ladder is the CLI's global contract,
where 2 is a usage error and 10 is `a4 self update --check` only (E-D107). The
other three do survive, and they sharpen the claim rather than refute it.

| Tool | Command | Codes | What the numbers distinguish | Source |
|---|---|---|---|---|
| `a4` | `doctor` | 0 / 1 | `ok`, `warn`, `unknown` / `fail`; `unknown` is a check that could not be decided and still exits 0 | E-D107 |
| `a4` | CLI | 0 / 1 / 2 / 10 | success / failure / usage / update available (`self update --check` only) | E-D107 |
| `ripr` | `check` | 0 | advisory: findings still exit 0 | E-D108 |
| `ripr` | `gate evaluate` | 2 / 3 | 2 = `config_error` (the evaluation could not complete); 3 = `blocked` (a completed blocking decision) | E-D108 |
| `ripr` | `doctor` | 0 / 2 | 0 = healthy; 2 = its own input, config, analysis or output failed | E-D108 |
| Vue Doctor | CLI | 0 / 1 / 2 / 3 | ok / gate breached / usage or bad config / analyzer failed or skipped under `--strict` | E-D109 |
| `alint` | CLI | 0 / 1 / 2 / 3 | ok / findings / its own config or usage / internal error | E-D109 |
| `codex` | `doctor` | 0 / 1 | 1 iff `overall_status == Fail`; `warn` never gates | E-D100 |
| `vercel` | `doctor` | 0 | always 0 when the checks run, even if some fail | E-D110 |

So the field does split outcomes on a number, and the review is right that D85's
"not on a number" overclaims. But the split is not "the user's declaration could
not be evaluated": ripr's 2 is ripr's own config or analysis, Vue's 3 is Vue's
analyzer, alint's 3 is alint's internal error, and a4's `unknown` is a status
that exits 0. The distinction the field encodes is **the tool's own setup or a
blocking decision**, not a user config that could not be read. That is the
correction: the field splits, and this doctor's one code is a choice inside a
split family rather than a field norm. The choice is defensible because this
doctor's "did not look" is voluntary (`--offline`) rather than a tool failure,
and because no field doctor gives the user's own config a separate code.

The review's other claim — "your closest analogues (codex, brew) agree with you,
so this is a family split, not a consensus against you" — holds. Codex and brew
both gate on a finding; neither has a second numeric code for did-not-look.

## 2. The provider id is a control-versus-parity choice

The plugin registers the provider id `muse`; the models appear as
`muse/muse-ember-1.0`, `muse/muse-spark-1.3` and so on, and `opencode models`
lists them on this machine (E-D111). The review says the competitor and
opencode's own `/connect` → `/models` flow use the catalog provider `meta`, and
that the plugin pays for control in UX parity. That is half right, and the half
that is right is the half that matters.

opencode's config has a `canonical` field: "Built-in provider ID whose catalog
defaults this provider inherits" (E-D112). The plugin API also has an `AuthHook`
(`provider`, `methods`, `loader`) and a `ProviderHook` (`models`); `/connect`
lists models.dev providers and providers registered by a plugin auth hook, while
a custom provider without an auth hook is reached through "Other" and a typed
provider id (E-D112). So there are three shapes:

1. **`muse` with an explicit table** (shipped): the plugin owns the model list,
   limits, and labels; `/connect` does not list it; the user signs in with
   `muse login`.
2. **`muse` with `canonical: "meta"`** (also shipped): the provider transform
   already sets `canonical: Provider.ID.make("meta")` at `src/plugin.ts:414`, so
   the id stays, the catalog's defaults (limits, modalities, costs) are
   inherited, and the plugin still owns the model list. The README does not say
   so; E-D120 checks whether the inheritance is observable.
3. **`meta` with an `AuthHook`**: `/connect` parity, but the hook has to supply
   a credential. The competitor that does this (`opencode-muse-auth`) mints an
   inference key from the OAuth token and keeps it in opencode's auth store
   (E-D113). The MSP competitor (`opencode-muse`) registers `muse` and drives
   `muse serve` (E-D113). The review conflates the two.

Shape 3 is not available to this plugin without breaking its central invariant:
it never holds a Muse credential, and the key it reports to opencode is a
placeholder that is never sent to Muse (README). Shape 2 is already in the code;
the work is the README sentence and one observation, not a rewrite. The review's
"your own provider id `muse` rather than opencode's catalog `meta`" is therefore
half right: the id is `muse`, and the catalog is already declared as its
canonical source.

## 3. The protocol surface is opencode's, not the plugin's

`muse acp` is the vendor's ACP agent; `opencode acp` is opencode's ACP agent;
opencode has no ACP client upstream (six requests, one unlanded PR), and the
community shim drives opencode's TUI against an ACP agent by replacing
opencode's engine (README; `docs/integration-landscape.md` §8). The plugin adds
no protocol surface: an ACP client that drives `opencode acp` reaches these
models through opencode's provider registry, with opencode's loop, tools,
transcript and permissions. A client that wants Muse's own loop uses `muse acp`
or a third-party bridge such as `muse-acp-bridge`, which is a different product
with a different authority order (E-D114). The review's "you inherit interop
only through opencode's server, not your own" is correct; the response is to say
so, not to build a second surface.

## 4. §3.2 is the highest-stakes paragraph

Meta's Model API Terms, §3.2 (last updated 2026-09-18):

> That key or credential is for use only with the coding harness under your
> Coding Harness Subscription, is subject to the restrictions on Meta Model API
> keys in Section 3.1, and may not be used to access the Services outside the
> coding harness or to circumvent your subscription's usage limits or billing.

The subscription documentation says the credential "is for use with Muse Code
only" (E-D115). The sanctioned programmatic surfaces are `muse exec`, `muse
serve` (MSP) and `@muse-code/sdk`; MSP's own guide says "the stdio wire is the
only public protocol surface" (E-D115).

This plugin's mechanism is the strongest position in the field: it never reads,
stores, or forwards the credential; it spawns the signed-in `muse` CLI and speaks
MSP to it; every request is made by Muse Code's own process; the key opencode
sees is a placeholder. The competitor that uses `meta` + `AuthHook` extracts or
mints a credential and disclaims the terms (E-D113). The honest paragraph says
both things: the mechanism keeps the credential inside the vendor's harness, and
Meta has not documented this arrangement as supported. It does not claim
endorsement, and it does not hide the residual risk.

The review's "highest stakes, one paragraph, and you have the better position to
assert than the competitor does" is right. The paragraph is the product.

## 5. The report shape: versioning and a histogram

Six reports carry a version: codex carries `schema_version` and `codex_version`;
`a4` carries `schemaVersion: 1`; `ripr doctor` carries a schema version (0.4);
proqi, recon and claw are the review's count (both fields, both fields, "schema
version 1") and were not re-read here (E-D116). This report carries `asOf`,
`checks`, `hooks` and no version (round 18, E-D105). That is the same kind of gap
as the absent roll-up, and it is cheaper to close: two fields and one test.

The review's histogram suggestion is stronger than the max roll-up. Vercel's
`doctor --json` has `summary` counts by status over four statuses, including
`skipped`, and exits 0 regardless (E-D110). doctorkit's summary is
`{ok, warn, fail, skipped, slow, total}`; vercel-labs/fx emits
`ok_count/warn_count/fail_count` (E-D117). A histogram is order-free: it needs no
severity ordering for `skipped`, so it sidesteps the Q1/Q2 blocker. A max
roll-up needs an ordering and would not equal the exit code (D99). If a roll-up
ever lands, it is a histogram; the exit code remains the verdict.

## 6. Where the review is imprecise

1. **a4's `0/1/2/10` is the CLI, not `a4 doctor`.** `a4 doctor` is 0/1; 10 is
   `self update --check`, 2 is usage (E-D107). The review's conclusion survives
   on ripr, Vue and alint, but the citation does not.
2. **"The competitor uses the catalog provider" conflates two plugins.** The MSP
   plugin (`opencode-muse`) registers `muse`; the auth plugin
   (`opencode-muse-auth`) registers an `AuthHook` on `meta` and mints a
   credential (E-D113). The structural difference is the credential, not the id.
3. **"The field splits ... but not on a number" is wrong; "the field does not
   split on this axis" is right.** The numbers exist; they encode tool setup and
   blocking decisions, not a user declaration that could not be read.
4. **Publishing does not change the credential analysis.** Anthropic's clause
   targets offering login to users; neither plugin does. The competitor
   publishes with a disclaimer (E-D113). The plugin's distribution is not the
   variable; the mechanism is.
5. **OpenAI's #8494 is about the SDK, not the CLI.** The issue asks whether the
   TypeScript SDK can use a subscription; OpenAI says to use an API key and
   closed it as not planned (E-D118). It settles nothing for Muse, and no claim
   here rests on it.

## 7. Open questions

- Whether Meta treats an MSP client inside another harness as "the coding
  harness". The terms restrict the credential, not the client; the SDK is a
  developer preview and may change.
- Whether `canonical: "meta"` is honored for a plugin-registered provider, or
  only for config-declared ones. E-D120 is the experiment.
- Whether any consumer reads `--json` for a roll-up or a version. Still none
  (E-D78); the fields are for bug reports and future callers.
- Whether `opencode acp` can be driven with a `muse/*` model end to end. The
  provider registry is the same path, but the handshake was not measured here.

## 8. Experiments

| Id | Question | Result | Source |
|---|---|---|---|
| E-D107 | What is `a4 doctor`'s exit contract, and what is the CLI's? | Doctor 0 for `ok`/`warn`/`unknown`, 1 for `fail`; CLI 0/1/2/10 with 10 = `self update --check`, 2 = usage. | docs.arete.run/cli/commands |
| E-D108 | What do ripr's numbers mean? | `check` advisory 0; `gate evaluate` 2 = `config_error`, 3 = `blocked`; `doctor` 0/2; the swarm variant adds 3. | ripr `docs/EXIT_CODES.md`; issue #5065 |
| E-D109 | What do Vue Doctor and alint encode? | Vue 0/1/2/3 with 3 = analyzer failed or skipped under `--strict`; alint 0/1/2/3 with 2 = its config/usage, 3 = internal error. | Round 17 E-D90, E-D95 |
| E-D110 | Does Vercel's doctor gate, and what is its JSON? | Always 0 when the checks run; four statuses including `skipped`; `--json` carries per-check `id`/`status`/`message`/`next` and a `summary` count. | vercel.com/docs/cli/doctor |
| E-D111 | What does this install list today? | `opencode models` lists `muse/muse-ember-1.0`, `muse/muse-spark-1.2`, `muse/muse-spark-1.3`, `muse/muse-wonder-1.0` and contributor variants. | Local, 2026-11-23 |
| E-D112 | How does opencode register a provider, inherit a catalog, and offer `/connect`? | `providers.<id>` with `canonical` = built-in id whose catalog defaults it inherits; `AuthHook` = `{provider, methods, loader}`; `ProviderHook` = `{id, models}`; `/connect` lists models.dev and auth-hook providers. | opencode.ai/docs/providers; `@opencode/plugin` types |
| E-D113 | What do the two competitors do? | `opencode-muse` (MSP) registers `muse` and drives `muse serve`; `opencode-muse-auth` registers an auth hook on `meta`, mints a key, and disclaims Meta's terms. | GitHub READMEs |
| E-D114 | What is the ACP surface? | `muse acp` is the vendor agent; `opencode acp` is opencode's agent; no upstream client; the shim replaces opencode's engine; `muse-acp-bridge` is a separate third-party bridge. | README; `integration-landscape.md` §8 |
| E-D115 | What do Meta's §3.2 and the MSP docs say? | The credential is for the coding harness only and may not be used outside it or to circumvent billing; subscription docs say "Muse Code only"; MSP's stdio wire is the only public protocol surface; `muse serve`/SDK are sanctioned. | dev.meta.ai/legal/terms-of-service; MSP concepts |
| E-D116 | Which doctors version their report? | Re-read: codex `schema_version` + `codex_version`; a4 `schemaVersion: 1`; ripr doctor schema 0.4. Review-reported, not re-read: proqi both, recon both, claw "schema version 1". | Round 18 E-D105; a4/ripr docs |
| E-D117 | What shape does a histogram take? | Vercel `summary` counts by status; doctorkit `{ok, warn, fail, skipped, slow, total}`; vercel-labs/fx `ok_count/warn_count/fail_count`. | vercel.com/docs/cli/doctor; npm; GitHub |
| E-D118 | What does OpenAI's #8494 say? | The TypeScript SDK needs an API key; subscription use is not offered; closed as not planned. | github.com/openai/codex/issues/8494 |
| E-D119 | Are the counts line and the prose consistent? | Table: H 41, D 34, P 1, X 5, U 1, N 3 = 85. Prose says "eighty-three of eighty-four", "forty", and "two N rows"; it is stale by one H row and one N row. | Local table, 2026-11-23 |
| E-D120 | Is the shipped `canonical: "meta"` observable, and is the README silent about it? | The provider transform sets it at `src/plugin.ts:414`. Run 2026-11-23: the probe config is read (`opencode debug config` shows `muse-probe` with `canonical: meta`), the schema accepts the field, and the catalog has seven `meta/*` models, but `muse-probe` does not appear in `opencode models` and the isolated data dir has no package install, so the provider was likely skipped at package resolution. Inconclusive; the README says "declares", not "inherits". | Source read + experiment (inconclusive), round 19 |

## 9. Sources

- `a4` CLI reference: https://docs.arete.run/cli/commands
- `ripr` exit codes: https://github.com/EffortlessMetrics/ripr/blob/main/docs/EXIT_CODES.md ;
  the 2-vs-3 split: https://github.com/EffortlessMetrics/ripr-swarm/issues/5065
- Vue Doctor: https://remylagerweij.github.io/vue-doctor/reference/cli ;
  https://remylagerweij.github.io/vue-doctor/guide/cli-usage
- `alint`: https://alint.org/docs/concepts/start-here/severity-and-exit-codes
- Vercel: https://vercel.com/docs/cli/doctor
- opencode providers: https://opencode.ai/docs/providers/ ;
  CLI providers: https://opencode.ai/docs/cli/providers/ ;
  plugin types: https://github.com/anomalyco/opencode/blob/ec3ae17e/packages/plugin/src/index.ts
- `opencode-muse`: https://github.com/pgquiles/opencode-muse ;
  `opencode-muse-auth`: https://github.com/TheStreamCode/opencode-muse-auth
- Meta terms: https://dev.meta.ai/legal/terms-of-service ;
  subscriptions: https://dev.meta.ai/docs/muse-code/subscriptions
- MSP concepts: https://meta-models.github.io/muse-code-sdk/1.4/guides/msp-concepts/
- OpenAI #8494: https://github.com/openai/codex/issues/8494
- Round 17: `docs/round-17-research.md`; round 18: `docs/round-18-research.md`;
  this repo's `README.md` for the credential mechanism and the ACP section
