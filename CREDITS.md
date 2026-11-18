# Credits

Upstream: [`rasyidrafi/opencode-muse`](https://github.com/rasyidrafi/opencode-muse),
published on npm as `@rasyid_rafi/opencode-muse`, MIT, "Copyright (c) 2026 The
opencode-muse authors".

Base commit: `edb5d52f9fa6e9571cc5741bb5f3c996e63996a7` (2026-11-15T12:02:37Z,
"Name contributor models the way models.dev does").

The work here is the two patches described in `docs/provenance.md` and the
reproduction record. Everything in `src/` other than those two files is upstream's.

Two things about upstream worth recording, because they affect how this fork should be
trusted:

- Upstream's published `package.json` has no `repository` field, and no verified link
  exists between the npm publisher and the GitHub account. The base commit above is
  asserted by this repository, not certified by upstream.
- Upstream publishes no build attestations (`dist.attestations` is false; the
  attestations API returns 404), although signature bundles are present.
