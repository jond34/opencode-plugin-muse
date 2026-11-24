# Round 34 research: what a staged publish can prove, and what must be true before approval

**Written** 2026-11-23. Base `b706d21` (`round-33`). Companion to
`docs/round-34-plan.md`.

Round 33 ended with a gate-green candidate and one blocked step. Round 34 is not
a new trust investigation; it is the release. The research below is about the
three things that decide the round: whether the packaged copy is honest, what
the stage/reject/approve sequence can actually prove, and which open questions
should be closed rather than measured.

## 1. Facts carried in

- Candidate: `0.1.13`, 160 `dist/` files,
  `3470ecc97c98ef8358aaf77dbea767cebd1824542762ae0fef50713f46d3a120`; 165-file
  tarball `67c66300921138281f06ba3626ca2658f1325fde5ddc4aa3559a579e96aafd60`.
- The tarball contains `dist/`, `README.md`, `LICENSE`, `CREDITS.md`, and
  `CHANGELOG.md`; it does not contain `docs/` or `scripts/`.
- `CHANGELOG.md` currently says “local candidate, not published.” That sentence
  is inside the artifact and cannot be edited after approval.
- `npm stage publish` needs no 2FA; `approve` and `reject` do. The stage queue
  is visible in the CLI and on npmjs.com.
- `npm stage publish` generates provenance on parity with a direct publish
  (npm’s GA FAQ). Community testing reports the attestation survives approval;
  a dedicated experiment repo exists to test that survival, which is a sign the
  behavior matters and is not assumed by everyone.
- Since 2026-07-28 npm scans a version before availability, typically 5–15
  minutes; since 2026-09-03 the stage approve button is disabled until the scan
  completes. A disabled button is not a broken stage.
- A stage is not a version. `npm view` does not list it, and rejecting it does
  not require a rollback.
- The nuqs staged-publishing write-up reports the operational details npm’s
  docs leave implicit: no expiry, reject-then-restage the same version works,
  and both approve and reject prompt for 2FA.
- opencode matches an MCP permission as `<server>_<tool>` and a `deny` blocks
  the operation. Issue `anomalyco/opencode#42548` confirms that a denied MCP
  tool can still be listed in the Code Mode catalog while per-call execution is
  blocked. The Muse name `mcp__opencode__bash` is not the opencode action name;
  the opencode action is `opencode_bash`.
- Muse 1.4.25 is installed; no 1.4.26 is observed. The round-33 watch item
  stands.

## 2. Perspective A: release management

### Steelman “do not rebuild; publish the candidate”

The candidate is already E64 B1 and gate-green. Rebuilding for a changelog
sentence adds a new hash, a new E64 run, and another chance for drift. The
release has been held for three rounds; the marginal value of a copy edit can
look smaller than the cost of re-verification.

### Strawman “do not rebuild”

It ships a package whose own changelog says it is not published. That is a
permanent, user-visible false statement in an immutable artifact. The rebuild is
one `npm pack` and one E64 rerun; the candidate identity is not sacred. The
cheap fix dominates.

### Steelman “stop at one verified stage”

Stages have no expiry. A verified stage is a durable, non-public artifact the
owner can approve later without re-running CI. If the owner’s 2FA is not
available, leaving the stage is safer than rejecting it and forcing a rebuild
later.

### Strawman “stop at one verified stage”

A stage is invisible to users. Calling the release done because a stage exists
would be the same overclaim as calling a candidate published. The status must
say “staged, not public,” and the release notes must not be published.

### Release conclusion

Fix the copy, rebuild, rerun E64, then rehearse reject and approve with the owner
present. If the owner is absent, leave one verified stage and report it.

## 3. Perspective B: the consumer

### What the consumer can verify

After approval, `npm view` shows the version, `dist.integrity`, and
`dist.attestations.provenance`; `npm audit signatures` verifies the registry
signature and attestation in an install; the npm page shows the build summary
and source commit. Before approval, none of that is public, even though the
attestation was generated at stage time.

### Steelman “publish only after provenance is visible”

A consumer should be able to see provenance before installing. But provenance
cannot be public before the version is public; that is a property of the
registry, not a choice the plugin can make. The honest sequence is: stage,
approve, then verify and announce.

### Strawman “provenance means the package is safe”

Provenance links the artifact to a build and a commit. It says nothing about
whether the code is safe, and nothing about dependency or install-time threats.
The release notes must not imply otherwise.

### Consumer conclusion

Do not announce until `npm view` and the attestation URL resolve. Record the
integrity and attestation in `docs/provenance.md` after approval, not before.

## 4. Perspective C: the maintainer and the human gate

### Steelman “the agent should handle the whole release”

It is faster and less error-prone for the agent to run every command, including
approve. The owner is in the chat and can paste an OTP.

### Strawman “the agent should handle approve”

An OTP in a transcript is a live second factor in the wrong place, and it
defeats the proof-of-presence that staged publishing exists to provide. npm
explicitly does not let OIDC tokens approve. The owner must run approve or click
it in the UI; the agent must not.

### Steelman “rehearse reject”

Reject is the recovery path. If it has never been exercised, the first real
mismatch is the wrong time to learn it. Reject and approve both need 2FA, but
the owner is already at the prompt; one extra OTP buys a proven recovery path.

### Strawman “rehearse reject”

It doubles the 2FA prompts and the stage count for a path that npm documents and
that a community experiment already exercised. The owner’s time is the scarce
resource.

### Maintainer conclusion

Rehearse once. The cost is one extra stage and one OTP; the benefit is that the
reject path is proven for this package, with this trusted publisher, before a
real mismatch. If the owner declines, record O37 as unproven and proceed with a
single stage; do not pretend it was rehearsed.

## 5. Perspective D: the open questions that should close

### E61 Arm C (opencode deny)

The vendor documents `<server>_<tool>` matching and a final deny. Issue #42548
shows the catalog can leak a denied tool while execution is still blocked. That
is enough for a limited claim: opencode enforces the deny per call; the bridge
does not bypass the engine. It is not a local measurement, and the earlier
framing used the wrong action name (`mcp__opencode__bash` instead of
`opencode_bash`). Building a full opencode-plus-bridge harness would take a
round and would not change 0.1.13.

### E55 (Console)

Still owner-browser-only. O42 B already ships a labelled vendor-doc note. Retry
only if the owner opens a Console session; do not substitute a local config test.

### Muse 1.4.26

Not observed. The watch item is the next minor or schema drift, or 2027-02-28.
No experiment this round.

## 6. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Publish ships “not published” changelog | High if unfixed | Permanent false claim | A1 grep + dry pack before rebuild |
| CI tarball headers differ from local | Medium | False tamper alarm | Compare file list + per-file hashes; normalize mtimes |
| Scan delay read as failure | Medium | Premature reject/re-stage | Poll 30 min; never approve during scan |
| OTP pasted into chat | Low if instructed | Live 2FA leak | Owner runs approve; agent never accepts OTP |
| Stage rejected before digest check | Low | Lose verified artifact | Verify content first, then reject |
| Stale README counts | Medium | Misleading release copy | A1 measures and replaces |
| Provenance claimed too early | Medium | Overclaim | R records it only after `npm view` resolves |
| 0.1.13 already staged/public | Low | Stacked stage / version burn | A5 preflight stops |

## 7. Steelman and strawman for the product choices

### O45. Fix the packaged copy (A) vs publish unchanged (B)

**Steelman A:** the artifact is immutable; the sentence is false the moment it
is approved. **Strawman A:** “the changelog is cosmetic.” It is the package’s
own record. **Steelman B:** avoid a rebuild. **Strawman B:** save one rebuild by
shipping a false statement. Recommend A.

### O46. Rehearse (A) vs single stage (B) vs stop at stage (C)

**Steelman A:** proves the recovery path with the real trusted publisher.
**Strawman A:** one extra OTP for a documented path. **Steelman B:** least owner
time. **Strawman B:** the first mismatch becomes the first reject. **Steelman
C:** no public artifact and no 2FA. **Strawman C:** the release does not
finish. Recommend A; B is defensible if owner time is the constraint.

### O47. Owner approves (A/B) vs agent approves with OTP (C)

**Steelman A:** proof-of-presence stays with the owner. **Strawman A:** slightly
more owner effort. **Steelman C:** one command for the agent. **Strawman C:** a
live OTP in the transcript and a defeated human gate. Recommend A; B is the same
decision in the UI.

### O48. Keep 0.1.13 (A) vs renumber 0.2.0 (B)

**Steelman A:** package, lock, changelog, and candidate already agree; no new
evidence needed. **Strawman A:** the scope is substantial, so a patch may
undersell it. **Steelman B:** SemVer 0.y allows a minor for substantial
compatible work. **Strawman B:** invalidates E64, the staged evidence, and the
release notes for a label. Recommend A unless the owner wants the minor before
F2.

### O49. Close Arm C/E55 as documented (A) vs build harness (B)

**Steelman A:** neither blocks 0.1.13; the vendor docs plus #42548 support the
limited claim. **Strawman A:** no local bridge measurement. **Steelman B:** a
real measurement would close the last ambiguity. **Strawman B:** a round of
work for a claim the release does not depend on. Recommend A.

### O50. Leave the stage pending (A) vs reject (B)

**Steelman A:** no expiry, no public version, owner can approve later; nothing
is lost. **Strawman A:** a pending stage occupies the version until approved or
rejected. **Steelman B:** clean queue. **Strawman B:** throws away the verified
artifact and forces a new stage. Recommend A.

### O51. GitHub Release (A) vs none (B)

**Steelman A:** the draft already exists; a release note gives the version a
public record. **Strawman A:** another public surface to maintain. **Steelman
B:** the changelog and npm page are enough. **Strawman B:** the draft goes
unused. Recommend A only if the owner wants it; it is an owner action.

## 8. Confidence conditions

- **O45 A:** a grep and dry pack show no “not published” in packaged files. No
  experiment can make B honest.
- **O46 A:** reject succeeds and the same version can be restaged. If reject
  fails, stop; do not approve to “clear” it.
- **O47 A:** the owner can run one command. If not, O50 A (leave the stage) is
  the fallback.
- **O48 A:** keep the version only if no one has published or staged 0.1.13. If
  a stage exists, reject it before renumbering.
- **O49 A:** vendor docs plus #42548 remain current. A local bridge measurement
  would upgrade the claim; its absence limits it to “documented.”
- **O50 A:** stages still have no expiry. If npm adds an expiry, reject instead.
- **O51 A:** the release notes are final and the owner creates the Release. The
  agent does not create a tag.

## 9. Minimum decision layer

Three decisions need the owner:

1. **Publish now?** If yes, the owner runs approve at E67. If no, stop at the
   verified stage (O46 C/O50 A).
2. **Rehearse reject first?** Recommend yes (O46 A); one extra OTP.
3. **Keep 0.1.13?** Recommend yes (O48 A); renumber only before F2.

Everything else has a safe default: fix the copy (O45 A), owner approves (O47 A),
close Arm C/E55 as documented (O49 A), leave a blocked stage pending (O50 A),
and let the owner decide on a GitHub Release (O51 A).

## 10. Sources

- npm staged publishing: <https://docs.npmjs.com/staged-publishing>
- npm stage CLI, 2FA table and reject flags:
  <https://docs.npmjs.com/cli/v12/commands/npm-stage>
- npm trusted publishing (OIDC cannot approve; stage-only):
  <https://docs.npmjs.com/trusted-publishers>
- npm provenance: <https://docs.npmjs.com/generating-provenance-statements>,
  <https://docs.npmjs.com/viewing-package-provenance>
- npm staged-publishing GA FAQ (provenance parity, 2FA, stage-only):
  <https://github.com/orgs/community/discussions/196675>
- npm scan gate for staged approvals (2026-09-03):
  <https://github.blog/changelog/2026-09-03-multiple-trusted-publishing-configurations-for-npm/>
- npm publish-time malware scanning, 5–15 minute delay (2026-07-28):
  <https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/>
- Staged publishing GA (2026-05-22):
  <https://github.blog/changelog/2026-05-22-staged-publishing-and-new-install-time-controls-for-npm>
- nuqs staged-publishing field notes (no expiry, restage, 2FA):
  <https://nuqs.dev/blog/staged-publishing-for-supply-chain-security>
- Provenance-survival experiment:
  <https://github.com/franky47/npm-staged-publish-tests>
- Provenance transfer on approval:
  <https://privatedevops.com/articles/adopting-npm-stage-publish-in-ci>
- opencode permissions (`<server>_<tool>`, deny wins):
  <https://opencode.ai/docs/permissions>
- opencode MCP naming:
  <https://opencode.ai/docs/mcp-servers>
- opencode catalog leak with per-call deny:
  <https://github.com/anomalyco/opencode/issues/42548>
- opencode MCP permission report (could not reproduce):
  <https://github.com/anomalyco/opencode/issues/23045>
- SemVer 0.y.z: <https://semver.org/#spec-item-4>
- Muse Code changelog: <https://ai.developer.meta.com/docs/muse-code/changelog>

Search surfaces used: Parallel, Exa, TinyFish, Keenable, GitHub, direct fetch.
