# Round 20 execution prompt

You are executing round 20 in `~/repos/opencode-plugin-muse`. Read
`docs/round-20-plan.md` and `docs/round-20-research.md` first. This file is the
brief; the plan has the reasoning.

## State

- HEAD is `8abc1d8` (`Version the doctor report: schemaVersion, pluginVersion`).
  `main` is 90 ahead of `origin/main`; nothing is pushed.
- The working tree has owner edits in `docs/decision-coverage.md` (U16→P, counts
  `H 41 · D 34 · P 2 · X 5 · U 0 · N 3`, "85 of 85") and
  `docs/integration-landscape.md`. **Never stage `docs/integration-landscape.md`.**
  Preserve the owner's `decision-coverage.md` edits; do not revert them.
- Round 19 committed `4085bbd`, `cbeb0c7`, `8abc1d8`. Do not amend them.
- Local: opencode 2.3.2; `opencode models` lists `muse/*`; package
  `@jonathand34/opencode-plugin-muse` 0.1.12.

## Rules

- No push, tag or publish. No `muse acp`. No new dependency. Never write the
  host's log. Scratch stays in `scratch/`. Commits only after the owner says go.
- Every new claim carries an E-id or a source. Do not say `canonical` "inherits"
  unless the plugin-path probe shows it. The default is "declares" and "the
  plugin's model records are the source".
- Experimental surfaces (opencode 2.x's plugin API, `canonical`, the `policies`
  plane, Muse's SDK/MSP) are snapshots, not contracts. Record the version, add no
  shim, and give every dependent decision a flip condition (D123).
- If a check disagrees with the research, stop and report; do not edit the
  expectation.

## Experiment (S1, E-D124)

Run one confirmation, not a gate. Use isolated dirs under
`scratch/round-20-probe/`:

0. Run `muse login --help` and `muse logout --help`; record whether either lists
   or switches accounts (E-D126).
1. Create `opencode/plugins/canonical-probe.js` with a plugin that adds a
   provider through `ctx.provider.transform` (not config):

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

2. Run:

```bash
tmp=$PWD/scratch/round-20-probe
XDG_CONFIG_HOME=$tmp XDG_DATA_HOME=$tmp/data XDG_STATE_HOME=$tmp/state \
XDG_CACHE_HOME=$tmp/cache opencode models --standalone
```

`--standalone` matters: isolated `XDG_*` dirs do not isolate the default
service port, and a running user service makes the plain command fail with a
port conflict.

3. If `probe-canonical/muse-spark-1.3` appears, read its limit through
   `opencode api get /api/model --standalone` and compare it with `meta`'s limit
   for `muse-spark-1.3` (`1048576 / 131072` on 2026-11-23). The sentinel
   `111111 / 22222` = no inheritance; `meta`'s numbers = inheritance.
4. If the provider does not appear, record "inconclusive: plugin-added provider
   did not materialize" and rely on the source read. A minimal model record is
   silently dropped; the full record above is the working shape. One attempt. Do
   not edit `src/` for the probe.

Record the result in `docs/round-20-research.md` under E-D124. If it shows
inheritance, **stop and report**; the README wording and D113 flip.

## Edits

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

**S5.** New `docs/platform-support.md`: a capability table (offline suite, ledger
mode, trust-record mode, shutdown ladder, UAC, spawn resolution) with Linux /
macOS / Windows columns. State: Linux tested; macOS and Windows unmeasured; the
matrix is `workflow_dispatch` only, has never run, and cannot be dispatched until
the branch exists remotely; the three Windows unknowns are POSIX modes (write bit
only), the shutdown ladder (forceful signals), and UAC under a headless spawn
(`host_idle_timeout`). Add one sentence to the README's Platforms bullet linking
it.

**S6.** New `docs/policy-remote.md`: local half H; remote half unobservable;
#60252; `config status --json` names only `system_file`; Chrome Enterprise's
per-policy source/precedence as the field technique; no deny-by-effect probe
because it is side-effectful and ambiguous; condition: a queryable surface or
#60252 shipping. Link it from the coverage row and the README's `policies`
paragraph.

**S7.** New `docs/ecosystem.md`: channel table (ACP Registry: agents only, not
applicable; awesome-opencode: PR; opencode.im: auto npm keyword; opendock: auto;
flow-next: harness, not listing; GitHub search), current package state, and the
Q11 action. If Q11 is A, include this block and the opencode.im check URL; do not
open the PR unless the owner asks:

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

**S8.** `docs/decision-coverage.md`, Round 20 audit after the Round 19 audit,
with HEAD `8abc1d8` and E-D121–E-D138. Record the canonical correction (config
path, not plugin path; the plugin's model records are the source; the round-19
probe was mis-targeted), the two-account seam and Magpie contrast, the ACP Registry
category correction and opencode directory channels, the terms reading
(credential, not client), the platform capability delta and undispatched matrix,
the remote-policy silence and no-probe decision, the volatility posture (D123),
and the settled items (one exit code, `muse`, no ACP surface). Then update the
basis cells:

- provider paragraph: "opencode's `canonical` field is the identity path that
  does not touch the credential; inheritance applies to config providers, so the
  plugin's own model records are the source" (D113; E-D121–E-D124).
- Accounts row: README "Accounts": one credential, MSP spawn rule, Magpie
  contrast (D114; E-D125–E-D127).
- Platform row: cite `docs/platform-support.md`; keep P; keep the three unknowns
  (D117; E-D133–E-D136).
- `policies` row: cite `docs/policy-remote.md`; keep P; no probe (D118;
  E-D137–E-D138).

Do not revert the owner's U16→P / 85-of-85 edits.

**S9 (optional).** If S1 confirms identity-only, add one test in
`test/contributor-models.test.ts` that `toModelInfo` keeps the model record's
limit instead of a catalog lookup. The probe covers the `canonical` label. No
production code change.

## Verify

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

## Commit (only after the owner says go)

Suggested sequence:

1. `Correct the provider and account records: canonical is identity, one host per account`
   — README S2–S4, `docs/decision-coverage.md` S8, `docs/round-20-research.md`,
   this plan and the prompt.
2. `Record the platform and remote-policy deltas`
   — `docs/platform-support.md`, `docs/policy-remote.md`, `docs/ecosystem.md`,
   and the README links.
3. If S9 is added: `Pin the canonical division and the model record's limits` — the test.

Do not push, tag or publish. Do not stage `docs/integration-landscape.md`.

## Report

Report the experiment result, the exact files changed, the suite count, and any
check that could not run. State whether the result was inheritance, no
inheritance, or inconclusive. Ask for commit approval if the owner has not given
it. Do not claim the matrix ran, the Console policy is visible, or macOS/Windows
are tested.
