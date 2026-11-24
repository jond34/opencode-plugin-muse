# Security

## Reporting a vulnerability

Report privately through this repository's advisory form:

https://github.com/jond34/opencode-plugin-muse/security/advisories/new

Please do not open a public issue for a security report. Advisories stay
visible to the maintainer until they are published, which gives a fix a chance
to ship first.

There is no response-time commitment. This is a one-person project, and
reports are read in the order they arrive.

## Scope

In scope: this plugin's own code — how it launches and talks to `muse serve`,
how it surfaces tool calls and approvals to opencode, and anything that could
leak a payload, a file, or a session between the two. The measured approval
posture is in [`docs/approval.md`](docs/approval.md).

Out of scope: the behaviour of Meta's API or the Muse Code CLI, and the
permissions those grant. Requests are rejected by `api.meta.ai` unless they
come from the attested Muse Code client, and this plugin never holds
credentials — it drives the user's own signed-in CLI. A report about that
boundary belongs with the vendor, not here.

## Publishing

Releases are published from GitHub Actions using npm trusted publishing, with a
staged package that the maintainer approves with 2FA. Each version carries a
provenance attestation naming the repository, workflow, and commit it was built
from. Automatic provenance depends on three conditions: the staged publish uses
OIDC/trusted publishing, the source repository is public, and the npm package is
public. This repository and package meet them; a private mirror or fork does not
inherit this sentence. No long-lived npm token is used to publish. The gates and
rollback are in [`docs/release.md`](docs/release.md). You can check a release
yourself:

```
npm audit signatures
```
