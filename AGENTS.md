# opencode-plugin-muse

Muse Code as an opencode provider. Fork of `rasyidrafi/opencode-muse` at
`edb5d52f9fa6e9571cc5741bb5f3c996e63996a7`, MIT.

- Build: `npx tsc -p tsconfig.json`. Tests: `bun test` (bun >= 1.4.4).
- `dist/` and `dist-pkg/` are build output; never commit them.
- `src/` matches upstream except for the commits named in `docs/provenance.md`.
  Keep new patches as their own commit so `git show` stays the whole delta.
- `evidence/` holds inputs for the reproduction check, not runtime code.
- Do not add a remote or publish without deciding the privacy of the commits
  first: history is public the moment it is pushed.
