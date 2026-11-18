# opencode-plugin-muse

Muse Code models inside [opencode](https://opencode.ai), registered as the provider
`muse` with four models: `muse-ember-1.0`, `muse-wonder-1.0`, `muse-spark-1.3`,
`muse-spark-1.2`.

This is a fork of [`rasyidrafi/opencode-muse`](https://github.com/rasyidrafi/opencode-muse)
(MIT) at commit `edb5d52f9fa6e9571cc5741bb5f3c996e63996a7`, with two small patches on
top. See [`docs/provenance.md`](docs/provenance.md) for the base commit, the byte-level
reproduction record, and what that record does and does not prove.

Not affiliated with Meta, Muse Code, or opencode. Maintenance is best-effort by one
person; there is no support commitment.

## What it does

- registers a provider named `Muse Code`, so Muse models appear in the model picker
  and can be used as a main or subagent model
- implements `LanguageModelV3`, translating opencode turns into Muse CLI sessions
- runs a loopback-only MCP server (`127.0.0.1`, random port, per-start bearer token)
  so Muse can call opencode's tools
- forwards `museAgent` and `museInstructions` options

Muse Code authenticates in its own CLI, so this plugin never holds Muse credentials.
The API key it reports to opencode is a placeholder that is never sent to Muse.

## Install

```bash
npm install @jonathand34/opencode-plugin-muse
```

Then point a plugin file at it, which is what opencode loads:

```js
// ~/.config/opencode/plugins/muse.js
export { default } from "@jonathand34/opencode-plugin-muse";
```

Requirements: Node >= 22 for the build, bun >= 1.4.4 for the tests, and a Muse Code
CLI that is already logged in. Runtime dependencies are `@ai-sdk/provider@3.0.8`,
`@muse-code/sdk@1.4.15`, and `@opencode/plugin@2.2.7`.

## Verify the build

```bash
bash scripts/repro.sh
```

It installs from the committed lockfile, compiles, and compares the resulting `dist/`
against the hash recorded in `docs/provenance.md`. It prints `PASS` or exits non-zero.

```bash
npm run check   # typecheck plus the offline test suite
```

`npm run check` runs 32 tests that need no network or credentials. Three further
suites (`tool-bridge`, `fork-live`, `conformance`) spawn a real `muse serve` host and
need a logged-in Muse Code CLI; run them with `bun test` once one is available. Without
credentials they fail with `code: "modelError"`, which is the adapter correctly
reporting a failure rather than exiting silently.

## Layout

```text
src/        upstream source plus the two patches in docs/provenance.md
test/       upstream test suite
docs/       upstream docs, provenance record, upstream README
evidence/   inputs for the reproduction check (diffs, API snapshots, measurements)
scripts/    repro.sh, check.sh
```

## Licence

MIT, same as upstream. See `LICENSE` and `CREDITS.md`.
