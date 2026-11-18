# opencode-plugin-muse

Muse Code models inside [opencode](https://opencode.ai), registered as the provider
`muse` with four models: `muse-ember-1.0`, `muse-wonder-1.0`, `muse-spark-1.3`,
`muse-spark-1.2`.

Most of the code is the npm package
[`@rasyid_rafi/opencode-muse`](https://www.npmjs.com/package/@rasyid_rafi/opencode-muse)
(MIT), published by `rasyid_rafi` and rebuilt here from base
`edb5d52f9fa6e9571cc5741bb5f3c996e63996a7` with two patches. [`CREDITS.md`](CREDITS.md)
explains what changed and why the credit stops at the npm publisher;
[`docs/provenance.md`](docs/provenance.md) has the build hash and what it does and does
not prove.

Not affiliated with Meta, Muse Code, or opencode. Maintenance is best-effort by one
person; there is no support commitment.

## What it does

- registers a provider named `Muse Code`, so Muse models appear in the model picker
  and can be used as a main or subagent model
- implements `LanguageModelV3`, translating opencode turns into Muse CLI sessions
- runs a loopback-only MCP server (`127.0.0.1`, random port, per-start bearer token)
  so Muse can call opencode's tools
- forwards `museAgent` and `museInstructions` options

Muse Code authenticates in its own CLI. Meta attests the Muse Code client: a subscription
covers requests that client makes, and `api.meta.ai` refuses requests carrying a
subscription key from anything else (`permission_error`,
`code: client_attestation_denied`). So the plugin drives the signed-in CLI (`muse serve`,
via `@muse-code/sdk`) instead of calling the model API itself. It never holds Muse
credentials, and the API key it reports to opencode is a placeholder that is never sent
to Muse.

## Install

```bash
opencode plugin add @jonathand34/opencode-plugin-muse
```

If that fails (some opencode builds currently error in their embedded installer with
`NpmInstallFailedError`), install the package yourself and point a plugin file at it,
which is what opencode loads:

```js
// ~/.config/opencode/plugins/muse.js
export { default } from "@jonathand34/opencode-plugin-muse";
```

Requirements: opencode 2.x (the plugin targets the V2 plugin API in
`@opencode/plugin`); Muse Code CLI 1.4.20 or newer, already logged in; Node >= 22 for
the build and bun >= 1.4.4 for the tests. Runtime dependencies are
`@ai-sdk/provider@3.0.8`, `@muse-code/sdk@1.4.15`, and `@opencode/plugin@2.2.7`.

If the CLI is missing or signed out, model discovery fails and the provider has no
models; the plugin logs `model discovery failed` with the reason.

## Verify the build

```bash
bash scripts/repro.sh
```

It installs from the committed lockfile, compiles, and compares the resulting `dist/`
against the hash recorded in `docs/provenance.md`. It prints `PASS` or exits non-zero.

```bash
npm run check:offline   # typecheck plus the offline test suite
```

`npm run check:offline` runs 32 tests that need no network or credentials. `bun test`
adds four suites (`tool-bridge`, `fork-live`, `model-live`, `conformance`) that spawn a
real `muse serve` host: 36 tests in total, all needing a logged-in Muse Code CLI.

Those live suites pass `contributorMode: "off"` for the same reason the plugin does.
The `empty` preset turns contributor mode on, which routes every model to its
`-contributor` variant, and `muse-ember-1.0` has none, so the model request fails with
`code: "modelError"` unless the flag is set.

## Layout

```text
src/        upstream source plus the two patches in docs/provenance.md
test/       upstream test suite
docs/       provenance record
evidence/   inputs for the reproduction check (diffs, measurements); repository only
scripts/    repro.sh, check.sh
```

## Licence

MIT, same as upstream. See `LICENSE` and `CREDITS.md`.
