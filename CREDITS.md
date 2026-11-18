# Credits

Most of the code here is the npm package
[`@rasyid_rafi/opencode-muse`](https://www.npmjs.com/package/@rasyid_rafi/opencode-muse)
(MIT, "Copyright (c) 2026 The opencode-muse authors"), published by the npm user
`rasyid_rafi`. The adapter, provider, session registry, tool bridge, and test suite come
from it; this repository adds two patches and the record describing them.

Credit stops at the npm publisher on purpose. A GitHub repository presents itself as the
source of that package, nothing public connects it to the npm account, so it is not
linked or named as the author here. `docs/provenance.md` records the base commit and
treats the two identities as unconnected.

## Why republish

The published package is hard to check from outside. Its `package.json` has no
`repository` field, no public record ties the npm publisher to a GitHub account, the
build carries no attestations (the endpoint returns 404 for 0.1.9), and the source in the
0.1.9 tarball does not match the `master` of the repository it appears to come from.

I wanted to know what code I was running. I rebuilt 0.1.9 from a recorded tree and
published it with a `repository` field naming the repository that builds it, so the link
can be checked in the one direction that works: read the tarball's `repository` field,
then confirm that repository's release workflow is the only thing allowed to publish.

If upstream ships these fixes, use upstream's.

## Second upstream

`src/contract/` and the `test/harness/` helpers ported from it come from
[`@rasyid_rafi/opencode-agent-harness-core`](https://www.npmjs.com/package/@rasyid_rafi/opencode-agent-harness-core)
0.1.0, same npm scope, MIT, and also without a `repository` field.

## Base

`edb5d52f9fa6e9571cc5741bb5f3c996e63996a7` (2026-11-15T12:02:37Z, "Name contributor
models the way models.dev does"). Everything in `src/` except the two patched files
matches the 0.1.9 tarball byte for byte; the patches and their evidence are in
`docs/provenance.md` and `evidence/`.

That commit is asserted here, not certified upstream. `docs/provenance.md` says what the
record does and does not prove.
