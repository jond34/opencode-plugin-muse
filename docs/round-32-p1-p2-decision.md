# P1/P2 decision: plugin-origin hooks and the release

**Date** 2026-11-23. Base `6d0369d` on `round-32`.
**Question** After E65 H3, should the plugin block `plugin`-origin hooks (P1 B)
and hold the release (P2 B/C), or keep the allow with a corrected claim (P1 A)
and resume with a caveat (P2 A)?

This memo records the evaluation the owner asked for: three perspectives,
steelman and strawman for each option, the risks, and the conditions that would
change the answer. The recommendation at the end is the confirmed one.

## Measured facts

1. **The amnesty is the one-time migration.** Seeding both E62 records before a
   fresh install makes `muse plugins update` stay `modified`; the changed hook
   does not run and the settings hash does not change (E65 Arm A).
2. **The private host does not inherit the user's approval.** In a
   `writeMuseHostConfig()`-shaped private config, the plugin record is visible
   and `project-trusted`, the hook is `review_needed`, and no marker fires
   (E65 Arm C).
3. **An approval made inside the private config is amnestied on update.**
   Approving there, then updating, runs the changed hook with no new approval
   and writes the amnesty pair (E65 Arm C).
4. **`hook/list` reports a dormant plugin hook as enabled.** With an installed
   but unapproved plugin, the catalog returns
   `{enabled: true, handlerKind: "plugin", key: "plugin:e65-probe:mark"}` and no
   trust status. A default private config with no plugins returns an empty
   catalog.
5. **The plugin never approves or updates inside its private config**, and that
   config is recreated per host process (`src/host-config.ts`, `src/host.ts`).

Fact 4 is the one that was missing when the H3 branch was written. It changes
the cost of P1 B from "a refusal for a legitimate hook" to "a refusal for a
hook the host would not run."

## Perspective 1: security and attacker model

### Steelman B (block plugin origins)

Hooks are commands outside opencode's permission engine, and the attack is
documented: HookPry binds attacker commands to ordinary lifecycle events under
a plugin identity the user already trusts, and install-time vetting does not
carry to the next version. Codex's answer is the strong form: trust is recorded
against the hook's current hash, and "if a plugin update changes a bundled
script, Codex requires a new review even if the hook definition stays the same."
Muse documents the same rule ("a modified hook does not run until you approve it
again"). E62 is a violation of that rule. A gate that refuses plugin origins
makes this plugin's own statement true regardless of Muse's migration, and it
costs nothing when no plugin hook is present.

### Strawman A (keep the allow)

"E62 is a Muse bug, so it cannot matter here." That is the assumption E65 was
built to test, and it is only half true: the host boundary holds for the user's
store, but the same amnesty applies to any store that has an approval.

### Why B does not close a live path in this host

The attacker chain needs four links:

1. a plugin with a hook is installed in the shared data dir;
2. an approval for that hook exists in the private config;
3. `muse plugins update` runs against that private config;
4. a session starts against it.

The plugin creates link 2 never, and link 3 never. A marketplace update writes
the user's store, not the private config, and the private host ignores that
store's approval (fact 2). So a malicious plugin update cannot reach execution
through this host today. B would be defending link 2 against an actor who can
already write the private 0700 config — at which point they can run code
directly.

### The real residual risk under A

If Muse changes the host to read approvals from the shared store, or if the
plugin ever approves inside its own config, the bypass becomes live and nothing
here refuses it. That is a watch item, not a current path.

## Perspective 2: product and user experience

### Steelman A (keep the allow)

The user installed and approved a Muse plugin in *their* Muse. In an opencode
session that plugin's hooks are already inert, because the private config does
not carry the approval. Blocking them would turn a silent no-op into a hard
refusal to start a session — for every workspace, for every installed plugin
with a hook, including plugins unrelated to opencode. The measured catalog
(fact 4) shows those dormant hooks are reported as enabled, so the refusal would
hit exactly the benign case. The only escape would be an environment variable
most users will never know.

### Strawman A

"Silently not running a hook is harmless." It is harmless to security but not to
expectations: a user who installed a plugin for its hooks will wonder why it
does nothing. That argues for a doctor/startup warning (P1 C's mechanism) even
while keeping the allow.

### Steelman B

A refusal is honest: the host cannot verify the hook's trust, so it does not
pretend to. The message can name the plugin and the env override.

### Strawman B

"Users will read the refusal and set the variable." Most will read it as the
plugin being broken, and the fix is not discoverable from the message unless the
message is excellent.

### Product conclusion

B's benefit is theoretical in this host; its cost is a real session-start
failure for a dormant hook. A with a warning dominates B on user impact, and
neither changes what executes today.

## Perspective 3: release, evidence, and operations

### Steelman hold (P2 B)

The release is already stopped; holding costs nothing except a delayed patch,
and it avoids shipping while a trust question is open. If the vendor fixes the
amnesty in the next Muse release, the caveat may disappear.

### Strawman hold

The tarball does not contain the Muse bug. Holding the opencode plugin does not
protect a single user from a Muse hook path; it only delays the plugin's own
fixes. The trust question belongs to the host and to the docs, not to the
artifact's version number.

### Steelman resume (P2 A)

0.1.13 is a plugin release whose gates are about packaging, claims, and
reproducibility. E65 says the host path is inert for normal sessions. Resuming
with a documented caveat and a watch item keeps the release honest without
pretending the Muse migration is fixed.

### Strawman resume

"Nothing to see here." The caveat has to be specific: plugin hooks approved in
the user's Muse do not run in opencode sessions, and a private config that was
manually approved is amnestied on update. Without that sentence, resume is
overclaiming.

### Release conclusion

Resume after the normal gates (E61, F1, E64, E60), with P3 A (no provenance
claim before approval) and P4 D (vendor-doc note for Console). E60 remains
blocked on the owner's npm login and reject 2FA, which is an operational gate,
not a product one.

## Risks

| Risk | Under A | Under B | Mitigation |
|---|---|---|---|
| Changed plugin hook runs in a normal session | No current path; needs an in-config approval the plugin never creates | No | Watch Muse approval inheritance; re-run E65 on a Muse update |
| User's plugin hooks silently do nothing | Yes | No (refused) | Document it; doctor/startup warning; P1 C wording |
| Session refuses to start for a dormant hook | No | Yes, measured in `hook/list` | Only if B; needs a per-plugin record, not an env var |
| Vendor changes the store split | Exposure returns | Gate holds | Watch item; gate is the pre-committed fallback |
| Release overclaims | Caveat must be explicit | Caveat plus gate | Docs correction in this memo |
| Stage/reject cannot verify provenance | Unchanged | Unchanged | P3 A |

## Confirmed recommendation

- **P1 A: keep the `plugin`-origin allow, correct the claim, and add the
  limitation to the docs/doctor.** Do not add `plugin` to `BLOCKING_KINDS`
  without a per-plugin trust signal; `hook/list` has none, and the measured
  catalog reports dormant hooks as enabled.
- **P2 A: resume the release with the documented caveat and a watch item**,
  after E61, F1, E64, and E60 pass. This deliberately departs from the
  pre-committed H3 → B/C branch because the follow-up measurement shows the
  branch's cost is paid by benign dormant hooks while the live path requires an
  approval the plugin never creates.
- **P3 A**, **P4 D**, **O31 A**, **O32 D**, **O33 A**, **O34 B only if E64 B1**,
  **O35 A**, **O36 A**, **O37 A partial**.

### Conditions that would flip P1 to B

1. `muse serve` starts reading approvals from the user's store (or the plugin
   starts approving in its private config), making the bypass reachable.
2. Muse exposes a per-plugin trust status (or a hash) on `hook/list`, so a gate
   can refuse only modified/untrusted rows instead of every dormant hook.
3. A measured session runs a changed plugin hook without a new approval in the
   production private-config shape.

Until one of those holds, B refuses more than it protects.

## Sources

- E65: `docs/evidence/2026-11-26-r32-e65.json`; catalog:
  `scratch/r32-hooklist/catalog-storea.json`.
- Muse trust/review: <https://meta-models.github.io/muse-code-sdk/1.4/guides/plugins/concepts/trust-review-and-scopes/>
- Muse hooks: <https://meta-models.github.io/muse-code-sdk/1.4/guides/plugins/concepts/hooks/>
- Muse SDK sessions (host/store statement):
  <https://meta-models.github.io/muse-code-sdk/1.4/guides/plugins/concepts/plugins-in-sdk-sessions/>
- Muse changelog (1.4.24/1.4.25 and the `next` amnesty fix):
  <https://ai.developer.meta.com/docs/muse-code/changelog>,
  <https://raw.githubusercontent.com/meta-models/muse-code-sdk/main/CHANGELOG.md>
- Codex hooks trust: <https://developers.openai.com/codex/hooks>
- Claude Code plugin security: <https://code.claude.com/docs/en/plugins/security>
- Install-once trust anti-pattern (HookPry): <https://agentpatterns.ai/patterns/anti-patterns/install-once-plugin-trust>
- Kward lifecycle hooks (workspace trust invalidated on change):
  <https://kaiwood.github.io/kward/file.lifecycle-hooks.html>

Search surfaces used: Parallel, TinyFish, Exa, Keenable, direct fetch, GitHub
issue search. Linkup was unavailable (account balance); its absence does not
change the conclusion because the same primary sources were fetched directly.
