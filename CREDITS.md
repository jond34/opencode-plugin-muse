# Credits

Most of the code here is the npm package
[`@rasyid_rafi/opencode-muse`](https://www.npmjs.com/package/@rasyid_rafi/opencode-muse)
(MIT, "Copyright (c) 2026 The opencode-muse authors"), published by the npm user
`rasyid_rafi`. The adapter, provider, session registry, tool bridge, and test suite come
from it; this repository adds patches 1-5 and the record describing them. The first
two reconcile the base tree with the published 0.1.9 tarball; the third contains Muse
to inference, the fourth makes opencode own the context (effort, titles, compaction,
transcript reconciliation, and approvals), and the fifth finishes the effort,
developer-prompt, empty-toolset, and rewritten-history boundaries. This 1.0.0
release is the first public counterpart for the last three.

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

## Why not patch upstream

Verifiability explains why the bytes had to be rebuilt. It does not explain why
the three behavioural patches could not have gone upstream as a pull request,
and the honest answer is that they are a disagreement with the default, not a
defect. Upstream keeps Muse's own tools, workflows, and subagents on and offers
presets to narrow them; patches 3 to 5 turn all of that off and make opencode the
sole executor. An author who picked the other default is entitled to keep it, so
the change belongs in a package with its own README rather than in their queue.

The pace argument is smaller but real: the five patches, with a diff and
evidence each, landed 2026-11-18 to 2026-11-21, and 1.0.0 on 2026-11-24. Two
forks can diverge faster than one tree can review, and that is a reason to
fork, not a reason to call the upstream slow.

The mechanisms inside patches 3 to 5 were not invented here. The containment
keys come from the settings `pi-muse-subscription` established, and the effort
handling follows [pgquiles/opencode-muse](https://github.com/pgquiles/opencode-muse)
1.1.0, which is a different fork making a compatible choice on the same
question. Both are credited because the port is theirs; what this package adds
is the packaging, the record, and the boundary tests.

## Second upstream

`src/contract/` and the `test/harness/` helpers ported from it come from
[`@rasyid_rafi/opencode-agent-harness-core`](https://www.npmjs.com/package/@rasyid_rafi/opencode-agent-harness-core)
0.1.0, same npm scope, MIT, and also without a `repository` field.

## Base

`edb5d52f9fa6e9571cc5741bb5f3c996e63996a7` (2026-11-15T12:02:37Z, "Name contributor
models the way models.dev does"). The base tree plus patches 1 and 2 rebuilds the 0.1.9
tarball byte for byte; patches 3 through 5 add containment, harness-owned context, and
their boundaries on top and are not in that tarball. The patches and their evidence are in
`docs/provenance.md` and `evidence/`.

That commit is asserted here, not certified upstream. `docs/provenance.md` says what the
record does and does not prove.
