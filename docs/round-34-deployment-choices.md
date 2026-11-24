# Round 34 deployment choices: publish, rehearse, version

**Written** 2026-11-23. Companion to `docs/round-34-plan.md`. This brief covers
only the three release/deployment decisions. It does not change the plan’s
defaults; it records the options, the evidence, and where the defaults are
weak.

## Scope: are these product decisions?

No. All three are about how `0.1.13` reaches npm:

1. **Publish now?** — whether a public version exists this round.
2. **Rehearse reject first?** — whether the first stage is deliberately
   rejected and re-created to prove the abort path.
3. **Keep `0.1.13`?** — which version label carries the release, and therefore
   what npm range behavior and compatibility promise apply.

The only product-adjacent part is the version number: it is a public
compatibility promise, not just a filename. The plugin’s runtime behavior is
already fixed by the candidate. Product choices that remain outside this brief:
whether to invest in an opencode-bridge harness (E61 Arm C) or retry E55, and
whether to create a GitHub Release (O51). O45 (fix the packaged changelog) is
not a choice; it is a prerequisite for any publish.

## Facts that constrain all three

- `npm stage publish` does not need 2FA; `approve` and `reject` do.
- A staged version shares the same semver uniqueness index as a published
  version. While `0.1.13` is staged, you cannot publish `0.1.13` directly, and
  you cannot stage another `0.1.13` (409) until the first is rejected. The
  version is effectively reserved, not public.
- A stage has no documented expiry. The nuqs experiment observed one for a
  month; treat it as durable but not contractual.
- Reject then re-stage the same `package@version` is supported and is the
  documented way to change a stage’s tag. The tag is immutable once staged.
- A rejected stage is removed; it does not become a public version.
- Approval publishes the staged tarball. The version is then immutable.
  `npm unpublish` is limited (72 hours for new packages, then conditions), so
  the real rollback is `npm deprecate` plus a fixed version.
- Moving `latest` back does not help consumers whose range resolves the bad
  version; only a deprecation message reaches them.
- Since 2026-07-28 npm scans a version before it becomes available, typically
  5–15 minutes; since 2026-09-03 the stage approve button is disabled until
  the scan completes. A hold or block is a real branch; re-staging does not
  fix it.
- Provenance is generated for a staged publish and is publicly verifiable only
  after approval.
- opencode treats a bare `name` as pinned; `name@latest` or a range updates on
  startup and every 24 hours; exact versions are pinned. The README’s
  `opencode plugin add @jonathand34/opencode-plugin-muse` is a bare name, so an
  existing install does not auto-update either way.

## Decision 1: publish now?

### Options

| Option | What happens | Reversibility |
|---|---|---|
| **A. Publish `0.1.13` to `latest`** | Stage, verify, owner approves; users can install; provenance public | Version immutable; `latest` movable; deprecate for range users |
| **B. Leave one verified stage pending** | No public version; stage reserves `0.1.13` | Reject later, or approve later |
| **C. Publish `0.1.13` to `next` only** | Public and verifiable, but `latest` stays `0.1.12`; promote later | Version immutable; `latest` can be promoted |
| **D. Publish `0.2.0` to `latest`** | Renumber, rebuild, stage, approve | Same as A |
| **E. Do not stage or publish** | Keep working privately | Nothing burned |

### Steelman A

The candidate is gate-green and E64-reproducible; the hardening (private host
config, project-hook trust) is worth making available. Three rounds of evidence
have converged, the stage path is the remaining unknown, and a pending stage
reserves the version anyway. A public version lets users install the fix and
lets provenance be verified. The cost of a bad release is bounded: move
`latest` back and deprecate the version; do not rely on unpublish.

### Strawman A

“Green tests mean it is safe” ignores that the suite does not run the installed
plugin inside a real opencode session with a real Muse account. The release
changes defaults, and a published version is forever. A deprecation is not a
rollback for anyone who already installed it.

### Steelman B

No public commitment, no 2FA, no immutable artifact. The stage is durable, so
the owner can approve when ready. If the release is wrong, rejecting it costs
nothing public. This is the lowest-regret option when the owner is not ready to
own a public version.

### Strawman B

The release never finishes, users do not get the hardening, and the stage
reserves `0.1.13` so nobody can publish that version until it is approved or
rejected. A forgotten stage is release debt.

### Steelman C

A `next` publish gives a public, provenance-bearing artifact with a smaller
blast radius: `latest` stays on `0.1.12`, and only users who opt into `next`
see it. It supports a soak before promotion. For a release that changes
defaults, that is a real risk reduction.

### Strawman C

`next` is a second-class channel; bare opencode installs and normal npm
installs do not see it. Promotion is another write (and possibly another 2FA),
and the version is still immutable. For a small plugin, the extra channel may
buy more ceremony than signal.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Bad behavior in a real install | Medium | High: immutable version | `next` soak, or accept and deprecate quickly |
| npm scan hold/block | Low–medium | Delay; possible appeal | Wait; do not re-stage; appeal if blocked |
| Stage content differs from candidate | Low | Stop before approve | File-list and per-file hash comparison |
| Owner 2FA unavailable | Medium | No publish | Leave stage pending |
| `latest` moves to a bad version | Low | Range users get it | Move `latest` back; deprecate; publish fix |
| Packaged copy still says “not published” | High if unfixed | Permanent false claim | O45 before any rebuild |

### Recommendation

**A** after O45 and F2, if you are ready to own a public version. Choose **C**
if you want a soak and are willing to promote later. Choose **B** if you are
not ready; it is a clean stop, not a failure. Do not choose **E** unless you
are also pausing the release work, because it leaves the hardening unavailable
indefinitely.

## Decision 2: rehearse reject first?

### Options

| Option | Stages | 2FA prompts | What it proves |
|---|---|---|---|
| **A. Stage → verify → reject → stage → approve** | 2 | 2 | Reject, stage removal, restage same version, approve |
| **B. Stage → verify → approve** | 1 | 1 | Approve only |
| **C. Stage → verify → leave pending** | 1 | 0 | Stage and verification only |
| **D. Stage a throwaway version → reject → stage real → approve** | 2 | 2 | Reject/restage without risking the real stage |

### Steelman A

This is the first staged release for this package. Proving the abort path before
you need it is worth one extra OTP: it exercises the 2FA prompt for reject, the
removal, and the same-version restage, and it produces a runbook. Nuqs reports
the same reject/restage pattern working. The rejected stage was never public,
so nothing immutable is lost.

### Strawman A

You are testing ceremony, not the artifact. Reject is a documented one-liner;
the docs and the nuqs experiment already establish same-version restage. The
second stage is a different tarball, so you are not even approving the artifact
you rehearsed with. Extra 2FA for little new information.

### Steelman B

Least owner time and least risk to the good stage. Verify the stage, approve it.
If a future mismatch requires reject, run it then; if reject fails, leave the
stage pending and do not publish. The recovery path remains available.

### Strawman B

The first real reject happens under pressure, possibly with a bad artifact in
the queue. The owner may not know the command or the stage-ID flow. A rehearsal
turns that into a known procedure.

### Steelman D

Isolates the rehearsal from the release artifact: a throwaway version is
rejected, then the real version is staged. This avoids risking the verified
stage and still proves the reject flow. It costs a throwaway build and burns a
version number only until it is rejected.

### Strawman D

Overkill. A stage is already non-public until approval, so rejecting `0.1.13`
does not risk users; it only risks having to re-stage, which the docs support.
The throwaway build is extra work for the same procedural information.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Reject/restage hits a 409 or registry bug | Low | Lose the good stage; retry or renumber | Keep the commit; restage; fall back to pending |
| Extra 2FA prompt is unwanted | Medium | Owner friction | Choose B |
| Reject removes the only verified stage | Certain | Rebuild/restage needed | E64 makes rebuild cheap |
| Stage expires/vanishes | Low | Lose artifact | Treat as durable, not guaranteed; keep commit |

### Recommendation

**A** for the first staged release if the owner is present and can afford one
extra 2FA prompt. **B** is defensible if owner time is the constraint or you
are risk-averse about a restage bug; record O37 as unproven, do not claim it.
**D** only if you want the procedure proven without touching the real stage and
are willing to build a throwaway version.

## Decision 3: keep `0.1.13`?

### What the number controls

- npm caret semantics: `^0.1.13` allows `>=0.1.13 <0.2.0`; it does not allow
  `0.2.0`. `^0.2.0` allows `>=0.2.0 <0.3.0`.
- SemVer 0.y.z: “Anything MAY change at any time. The public API SHOULD NOT be
  considered stable.” But npm’s caret treats a `0.x` minor as the
  breaking-change boundary and presumes no breaking change between `0.2.4` and
  `0.2.5`.
- opencode bare installs pin; a range or `@latest` updates. So the version
  label matters most to npm consumers who use a range, and to how the release
  is described.

### Options

| Option | Signal | Uptake | Cost |
|---|---|---|---|
| **A. `0.1.13`** | Patch; compatible within `0.1` | `^0.1` users get it automatically | No renumber; candidate stays |
| **B. `0.2.0`** | Minor; behavior boundary | `^0.1` users must opt in | Renumber, new tarball, E64 rerun |
| **C. `0.1.13` now, `0.2.0` later** | Defers the boundary | Hardening reaches `^0.1`; next change gets the minor | Still labels this behavior change as a patch |
| **D. `0.2.0-rc.1` on `next`** | Prerelease | Only `next` users | Extra version and promotion step |

### Steelman A

The hardening is additive containment; most users see no API change. `0.x`
already means “anything may change,” so a patch is not a SemVer violation. The
package, lockfile, changelog, release notes, and candidate all already say
`0.1.13`; keeping it avoids a rebuild and gets the fix to `^0.1` users
automatically. A `0.2.0` bump would make the security work opt-in for exactly
the users who need it.

### Strawman A

`0.1.13` tells npm caret users “this is a safe patch” while the release changes
private-config behavior, refuses project hooks, and changes error paths. “0.x”
is not a license to mislabel a behavior change. The users most affected are the
ones who will update automatically and be surprised.

### Steelman B

This release changes defaults and hook behavior; under 0.x, a minor is the
honest signal. `^0.1` users should choose the new behavior; `0.2.0` gives them
that choice and gives the release a coherent story (“containment line”). The
renumber cost is modest: `dist/` does not embed the version, so the dist digest
is unchanged; the tarball changes because `package.json` does, and E64 is
rerun. It is cheaper than shipping a mislabeled patch.

### Strawman B

It splits the release from the `0.1.13` identity that three rounds of evidence
use, forces a new tarball and E64, and makes the hardening opt-in for `^0.1`
users. If the project treats 0.x as “no compatibility promise,” the minor buys
semantics at the cost of uptake.

### Steelman C

Ship the hardening in the `0.1` line now, and reserve `0.2.0` for a future
feature or a larger behavior change. This keeps the release moving and avoids
a renumber for a change that is mostly internal containment.

### Strawman C

It is the worst of both: the behavior change still rides a patch, and the
minor is spent later on something that may be smaller. The label stops matching
the content.

### Recommendation

**B (`0.2.0`)** if you take the compatibility promise seriously: the release
changes defaults and hook behavior, and npm caret users should opt in. **A** if
you treat 0.x as no compatibility promise and want the hardening to reach
`^0.1` users automatically. My lean is **B**, because the changelog’s own
“Containment and private host configuration” section describes behavior users
will notice, not a bug fix. This is the one decision where I would not hide
behind a default; it is a product-intent question: is `0.1.13` a patch to the
`0.1` line, or the start of a containment line?

## Cross-cutting risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Immutability | A published version cannot be edited or reused | Stage and verify; deprecate rather than unpublish |
| Range uptake | `latest` rollback does not fix `^0.1` consumers | Deprecate the bad version with a clear message |
| Scan hold | Approval disabled; re-staging does not help | Poll; wait; appeal if blocked |
| Version reservation | A pending stage blocks direct publish of that version | Reject before restage; do not stack |
| 2FA handling | OTP in chat defeats proof-of-presence | Owner runs approve/reject; agent never handles OTP |
| False packaged copy | Changelog ships inside the tarball | O45 grep and dry pack before rebuild |
| Stale stage | No expiry, easily forgotten | Record stage ID and date; decide within the round |

## Minimum decision layer

If you want the smallest set of choices:

1. **Ship this round?** Yes → choose `latest` or `next`; no → leave the stage
   pending.
2. **Is this a patch or a behavior change?** Patch → `0.1.13`; behavior →
   `0.2.0`.
3. **Prove reject?** Yes → two stages, two 2FA prompts; no → one stage.

Everything else has a safe default: fix the packaged copy (mandatory), owner
runs approve (mandatory), leave a blocked stage pending, and let the owner
decide on a GitHub Release.

## Sources

- npm staged publishing: <https://docs.npmjs.com/staged-publishing>
- npm-stage CLI, 2FA table, tag immutability, version uniqueness:
  <https://docs.npmjs.com/cli/v12/commands/npm-stage>
- npm unpublish policy: <https://docs.npmjs.com/policies/unpublish>
- npm deprecate: <https://docs.npmjs.com/cli/v12/commands/npm-deprecate>
- npm caret ranges for 0.x:
  <https://docs.npmjs.com/cli/v6/using-npm/semver#caret-ranges-123-025-004>
- SemVer 0.y.z: <https://semver.org/#spec-item-4>
- npm scan delay: <https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/>
- approval disabled during scan:
  <https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/>
- nuqs reject/restage and no-expiry observations:
  <https://nuqs.dev/blog/staged-publishing-for-supply-chain-security>
- npm/cli 409 on a second stage of the same version:
  <https://github.com/npm/cli/issues/9519>
- semantic-release staged-publishing experience (polling, no notification):
  <https://github.com/semantic-release/npm/issues/1160>
- 2FA friction per approval:
  <https://github.com/orgs/community/discussions/196948>
- opencode plugin pin/range/update behavior: <https://opencode.ai/docs/plugins>
- npm tag rollback limits:
  <https://www.javascript-package-publishing.com/package-publishing-and-release/release-channels-and-dist-tags/fixing-a-wrong-latest-dist-tag/>
