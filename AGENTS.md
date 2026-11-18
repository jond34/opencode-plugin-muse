# opencode-plugin-muse

Muse Code as an opencode provider, built on the npm package
`@rasyid_rafi/opencode-muse@0.1.9` (MIT). The base tree is recorded in
`docs/provenance.md`; credit and rationale are in `CREDITS.md`.

- Build: `npx tsc -p tsconfig.json`. Tests: `bun test` (bun >= 1.4.4).
- `dist/` and `dist-pkg/` are build output; never commit them.
- `src/` matches that package's source except for the commits named in
  `docs/provenance.md`. Keep new patches as their own commit so `git show` stays
  the whole delta.
- Only `plugin.ts` may import `@opencode/plugin`, and only `host.ts` may import
  `@muse-code/sdk`. Those two boundaries are what would let another client reuse
  the adapter without a rewrite.
- `evidence/` holds inputs for the reproduction check, not runtime code, and is
  not published in the tarball.
- Do not add a remote or publish without deciding the privacy of the commits
  first: history is public the moment it is pushed.
