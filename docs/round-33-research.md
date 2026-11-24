# Round 33 research: the caveated release, and the gates that can still stop it

**Written** 2026-11-23. Base `bc00fb6` (`round-32`). Companion to
`docs/round-33-plan.md`.

Round 32 decided P1 A / P2 A. Round 33 is not a new trust investigation; it is
the implementation and release-evidence round. The research below is about the
three things that can still change the outcome: the Muse MCP grant's scope
(E61), whether two clean builds agree (E64), and whether a staged tarball can be
rejected cleanly (E60). It also fixes the wording surface for the caveat.

## 1. Facts carried in

- Muse approvals — including plugin hooks — live in
  `$XDG_CONFIG_HOME/muse/settings.json` under `runtime_capabilities`. The plugin
  replaces that file with a private one, so the host sees no user approval. This
  is the structural reason P1 A is safe in this host, and the vendor documents
  the location explicitly.
- A Muse `tool` approval carries `toolName` and no `workspaceRoot`; a shell
  command prefix carries `workspaceRoot`. E57 observed a `tool` rule applying in
  a second workspace. E61 re-measures it with a server this round creates.
- opencode's `deny` is final and must win over any saved approval. E61 C is the
  test that can still stop the release.
- npm staged publishing: `npm stage publish` needs no 2FA; `npm stage approve`
  and `npm stage reject` both do. Trusted publishers can be stage-only, and a
  new trusted-publisher configuration expires after **2 days** without a first
  successful publish.
- 0.1.12 carries a SLSA provenance attestation; provenance is generated at
  public publish, not at stage.
- The next Muse changelog (preview) says “downgrade-save-upgrade cycles no
  longer re-run the one-time legacy hook trust amnesty” and “foreign hooks only
  ask for re-review when their own command or script changes.” Those entries are
  **not** in the installed 1.4.25 changelog section, so treat them as a future
  fix, not current behavior.

## 2. Perspective A: approval scope and the release (E61)

### What each branch means

- **B1 cross-workspace.** The Muse grant is user-local, as E57 saw. The plugin's
  `allowAll` posture is unchanged; O31 A is the honest description. The release
  proceeds.
- **B2 workspace-local.** The grant is narrower than the store rule suggested.
  O31 A still ships, because the plugin does not map a Muse grant to an opencode
  rule; but O31 B (a one-prompt `once`/`session` flow) becomes a real follow-up.
  O44 A separates the two decisions.
- **B3 deny ignored.** This is worse than the caveat: an opencode user who wrote
  a `deny` would not be protected. Stop the release; that is a security finding
  in the bridge seam, not a wording problem.
- **B4 tool/menu absent.** No claim; the existing `allowAll` caveat stands.

### Steelman O31 B (build the one-prompt flow)

A user who chose “always allow” in Muse might reasonably expect one prompt, not a
second invisible layer. If the grant is workspace-local, mapping it is closer to
what the user saw. The plan's own approval page says a `localPersistent` MCP
grant is broader than an opencode project-scoped approval, so mapping needs a
visible global-scope warning.

### Strawman O31 B

“Just prompt in both places; two prompts are safer.” Two gates for one call is
not safety, it is a UX failure that teaches users to click through. The current
API also lacks a non-prompting check (`permission.allows`) and a race-safe
admission, so a one-prompt mapping cannot be made correct yet.

### Confidence condition for O31 A

E61 B1, or B2 with no evidence that the bridge loses a `deny`. If E61 B2, O31 A
is still the release posture; only the follow-up changes.

## 3. Perspective B: reproducibility (E64)

`npm pack` writes tar headers that include file mtimes. A build that writes
`dist/` at 10:00 and another at 10:01 can produce different tarball bytes with
identical file contents. The reproducible-builds project's answer is
`SOURCE_DATE_EPOCH` plus timestamp clamping; the multi-run npm release
workflows that do this normalize mtimes before packing and compare the tarball
hashes.

E64 therefore has to distinguish:

- **content drift** — a file hash differs; that is a real reproducibility
  failure;
- **header drift** — only mtimes or order differ; the content is identical.

### Steelman “block on any tarball difference”

The published artifact is the tarball. If the bytes are not reproducible, a
consumer cannot rebuild the exact artifact, and a claim of reproducibility is
too strong.

### Strawman “block on any tarball difference”

It would block a release for a timestamp header while every file is identical,
and it would push the project toward a false “not reproducible” label. The
honest unit is: `dist/` is byte-identical, and the packed content is identical;
`npm pack` headers are not byte-stable.

### Confidence condition for O34 B

E64 B1, or B2 with a normalized content digest that matches. A dist content
mismatch is a stop, not a wording problem.

## 4. Perspective C: stage and reject (E60)

### Steelman “approve a disposable prerelease”

It is the only way to observe approval 2FA and provenance with real registry
metadata. It would turn O37 from “partial” into “measured”.

### Strawman “approve a disposable prerelease”

It publishes a version users can install. For a project at 0.1.x with no need
for a public prerelease, that is a release decision masquerading as a test. The
stage/reject rehearsal already proves the tarball identity and the reject path;
provenance remains a documented, post-approval property.

### Operational risks

- The local npm token was `E401` on 2026-11-23. E60 is blocked until the owner
  runs `npm login`; this is not a product defect.
- The trusted-publisher configuration expires in 2 days without a first publish.
  Create or refresh it when the release is ready to stage, not before.
- A stage ID is not a version. A rejected stage needs no rollback.

### Confidence condition for O37 A

E60 B1: stage created, digest matches, reject succeeds, no public 0.1.13. If the
stage cannot be rejected, leave it pending and record blocked; never approve to
“clean up”.

## 5. Perspective D: where the caveat lives (A1–A3, O38–O40)

The caveat is not a marketing sentence; it changes what a user should expect.

- **Doctor.** The existing `hooks` row already lists each handler's origin and
  annotates `plugin`. Extending its detail is the lowest-noise surface: it is
  on demand, it names the exact condition, and it does not refuse a session.
  Precedent: `openclaw doctor` reports plugin advisories as warnings with a
  check id and remediation, and keeps ordinary doctor runs non-blocking.
- **README/CHANGELOG.** A “Known limitation” bullet is the durable surface. It
  must say the two facts: the private host sees no user approval, and a private
  config that holds one is amnestied on update.
- **Startup warning.** Rejected as the primary surface: every session with any
  installed plugin hook would print it, including users who do not care about
  Muse plugins.

### Steelman a startup warning

A user who never runs the doctor would otherwise not learn that their plugin
hooks are inert. The README and CHANGELOG are not read either.

### Strawman a startup warning

A warning that fires for a dormant, unrelated plugin on every session is noise;
users learn to ignore it, and it makes the plugin look broken. The doctor is the
right place for a condition that is stable and inspectable.

### Confidence condition to add a startup warning

A user report that the doctor was not enough, or a measured session where a
plugin hook was expected and silently did nothing.

## 6. Console (O42)

E55a/E55b remain blocked on an owner-authenticated browser. The vendor documents
effect/timing and the workspace-named denial, but the local evidence is still a
`document` source and a generic model error. O42 B is a clearly labelled
vendor-doc note; do not claim local measurement. O42 A requires both E55 runs.

## 7. Minimum decision layer

Most of round 33 decides itself. The owner is left with:

1. **O31/E61 B2** — ship under the current posture and schedule the one-prompt
   spike, or hold. Recommend ship (O44 A).
2. **O34/E64 B2** — content-identical wording vs dist-only. Recommend
   content-identical (O43 A).
3. **O37/P3** — stage/reject only vs a disposable public prerelease. Recommend
   stage/reject only (O41 A).
4. **O38/O39** — doctor + README/CHANGELOG vs a louder surface. Recommend the
   quiet one.
5. **O42** — vendor-doc note vs no Console claim. Recommend the labelled note.

## 8. Sources

- Muse trust/review and where decisions are stored:
  <https://meta-models.github.io/muse-code-sdk/1.4/guides/plugins/concepts/trust-review-and-scopes/>
- Muse permissions and grant scopes: <https://dev.meta.ai/docs/muse-code/permissions>
- Muse SDK sessions (host reads the plugin store at start):
  <https://meta-models.github.io/muse-code-sdk/1.4/guides/plugins/concepts/plugins-in-sdk-sessions/>
- Muse changelog (1.4.25 and preview): <https://ai.developer.meta.com/docs/muse-code/changelog>,
  <https://raw.githubusercontent.com/meta-models/muse-code-sdk/main/CHANGELOG.md>
- npm staged publishing: <https://docs.npmjs.com/staged-publishing>,
  <https://docs.npmjs.com/cli/v12/commands/npm-stage>
- npm trusted publishing (stage-only, 2-day expiry):
  <https://docs.npmjs.com/trusted-publishers>
- npm provenance: <https://docs.npmjs.com/generating-provenance-statements>
- Reproducible builds / `SOURCE_DATE_EPOCH`:
  <https://reproducible-builds.org/specs/source-date-epoch>
- Two-builder release workflow with mtime normalization:
  <https://github.com/forgesworn/anvil>
- openclaw doctor advisory findings:
  <https://github.com/openclaw/openclaw/blob/main/docs/cli/doctor/lint.md>
- Codex hook trust: <https://developers.openai.com/codex/hooks>
- Claude Code plugin security: <https://code.claude.com/docs/en/plugins/security>
- HookPry / install-once trust:
  <https://agentpatterns.ai/patterns/anti-patterns/install-once-plugin-trust>

Search surfaces used: Parallel, TinyFish, Exa, Keenable, direct fetch, GitHub
issue search. Linkup was unavailable (account balance), so primary pages were
fetched directly.
