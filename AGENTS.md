# opencode-plugin-muse

Muse Code as an opencode provider, built on the npm package
`@rasyid_rafi/opencode-muse@0.1.9` (MIT). The base tree is recorded in
`docs/provenance.md`; credit and rationale are in `CREDITS.md`.

- Build: `npm run build` (TypeScript). Tests: `npm run check:offline` (Bun >= 1.4.4,
  Node 22+ for the npm toolchain). `npm ci` installs from `package-lock.json`.
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

## Public and local

Tracked files are public. `scratch/` is ignored and may hold local records;
`scratch/archive/MANIFEST.md` lists what was removed and why. Never link to,
publish, or treat anything under `scratch/` as current public guidance. `bench/`
is a local experiment harness, not part of the public test set.

New prose is local by default: it belongs in `scratch/` unless it is a README
section or replaces an existing tracked doc. A new file under `docs/` needs a
reason it cannot be a README section. `README.md` is the only public surface
that should grow, and it stays near the ~1,700-word category median; long
material goes into an existing doc, not a new one.
