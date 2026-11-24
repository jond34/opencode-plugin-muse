# Remote `policies`: the local half is observable, the Console half is not

The `policies` plane has two delivery paths, and only one of them is readable
from this plugin's process.

## Local: H

A statement in `opencode.json(c)` is validated by the host the plugin already
spawns for the doctor. `bun run doctor` runs `opencode --print-logs debug config`
and reads the run's own stderr, so each `configuration normalization diagnostic`
is attributable to this run, at default log level, with no cross-contamination
between concurrent spawns. The `policies` row names every dropped statement by
pointer and action; a file the host refuses outright is a `config` row, and the
`policies` and `plugins` rows defer to it. `ok` requires a structured log line
and no drop; an empty stream is `skipped`, not `ok`. By default a dropped
statement exits 1, because a declaration the user made is not in force.

The README's hard-stop section states the same limit from the user's side: a
typo in an action or effect is indistinguishable from no policy unless the log is
checked, and a turn that should have been stopped is the effect-level signal.

## The precedence order

Policies invert the usual rule: broader configuration is evaluated later, so it
overrides narrower configuration. Managed configuration and a connected Console
always outrank user and project files (E-R21-03).

| Rank | Source |
|---|---|
| 1 (highest) | macOS managed preferences (`/Library/Managed Preferences/ai.opencode.managed.plist`) |
| 2 | System `opencode.json(c)` (`/Library/Application Support/opencode`, `/etc/opencode`, `%ProgramData%\opencode`) |
| 3 | Connected OpenCode Console workspace |
| 4 | Global `~/.config/opencode/opencode.json(c)` |
| 5 | Direct `opencode.json(c)`; outer directories beat inner on a conflict |
| 6 | `.opencode` config |

That is why the local half can be complete and the plane still be unknown: ranks
1–3 are delivered outside the process this plugin spawns. A policy at rank 3 can
change what the same user's `opencode.json` says, and nothing in the file tree
shows it.

## What the Console delivers

A Console account starts with a **Personal** workspace, and its owner is its only
member (E-R22-05); `/connect` binds a machine to that workspace. The workspace is
not a separate policy engine: the vendor states that it compiles the workspace's
Providers and Tools policies into ordinary `policies` statements inside the
workspace configuration, ranked just below managed preferences (E-R22-07). That
is the one place a Console policy might become visible to this plugin — as a
source in `debug config` rather than a remote decision. A denial that comes from
it names the workspace (`Blocked by Acme's policy`), where a local statement does
not.

The surface, as observed in round 23, is a **Controls** page with three groups:
*Reservations* (a provider, model or extension reserved to named members, which
nobody else may use), *Policies* (a member or group restricted to certain models,
spend caps, or tools), and *Control templates*. A policy targets *members tagged
with* a tag, and a workspace with no tags has no way to scope one. The Models
page is separate: a per-model switch decides what members may use at all. None of
this is a Providers/Tools editor in the shape round 22's research described, so
treat that description as the documented model rather than the observed UI.

| Event | Effect on the host |
|---|---|
| Policy added or changed | Applies on the next fetch, about once a minute |
| Another workspace connected | The new workspace's statements replace the old set |
| Disconnected | The workspace's statements are cleared |
| Console outage | The last fetched statements stay in effect |

## Remote: unobservable

A policy delivered by Console is decoded on the vendor's side. Console changes
apply on the host's next fetch, about once a minute; a Console outage leaves the
last fetched statements in effect rather than clearing them (E-R21-03). Unknown
actions and effects are filtered without a diagnostic (`anomalyco/opencode#60252`,
open), so there is no log line for the doctor to read (E-R21-04).

The observable surface is `opencode debug config`, not `config status --json`:
that command is not recognized on 2.4.1. On this machine `opencode debug config
--standalone` lists one `document` source and two `directory` sources and names
**no source with a Console type**, even though `opencode auth list` shows Console
credentials stored; before a Console policy was fetched, its `info.policies`
carried the local statements only (E-R21-05). E37 showed a Console statement
appearing in that same `document` source, so the surface changed but the label did
not. The doctor can read the statement and cannot attribute it to the Console.

There is no API to ask instead. On 2.4.1 `/api/policies`,
`/api/policies/current`, `/api/experimental/policies` and `/api/config/policies`
all 404; `/api/integration` exists but returns an empty list when no workspace is
connected, and `/api/policies/current` appears in the binary only as a string
(E-R22-08).

**Round 23 measured the connected case, and the answer is still no.** Disabling
one model (`beam-free`) in the workspace, waiting past the fetch window, and
re-reading the host changed nothing: the same one `document` and two `directory`
sources, no Console source, and `beam-free` still listed by `opencode models
--standalone`. The toggle was restored to `enabled` afterwards. So a workspace
model restriction was not visible through either surface this plugin can read.
A Providers policy is visible in `debug config` (E37), but not attributable; the
no-attribution rule is measured rather than inferred.

**Round 24 corrects the premise and then hits the policy surface.** Round 23's
binding rested on a label — `auth list` prints `OpenCode  Default  stored`, and
`Default` is also the workspace name — so it was consistent-with rather than
measured. E25 replaced it with a direct read. `opencode debug paths db` returns
`~/.local/share/opencode/opencode.db`; its `credential` table holds one active
`opencode` row, `cred_14b22fd9b001apW4pAdrUmjbtt`, label `Default`, whose value
contains `wrk_01KYJ6RT2QFFJ0AXV1J2JFEQR6` (367 characters, last written
2026-11-16), while the `workspace` table is empty. The value is a JSON blob —
`{type, methodID, refresh, access, expires, metadata}` — and the id sits in
`metadata.orgID` beside `accountID`, `email` and `orgName`; the two tokens are
39-character opaque strings with no readable scope. So the read proves **one
active credential labelled with exactly one workspace id, and no second binding
record**; it does not prove the token is refused in another workspace, which would
need a second workspace to test (`docs/evidence-audit.md` F2).

E26 then tried to create the Providers/Tools policy that would test compilation.
The Controls page reads "No policies yet. Every member can use all 76 enabled
models", and `/policies/new` offers one target, "Members tagged with…", whose
`Add tag` is disabled because no member tags exist. This build has no member page
carrying Controls (Settings → Members offers only View and Invite), no per-model
control on the Models table, and no tag affordance anywhere — `Tag` appears only
as a table filter.

The changelog's hand-picked-member route exists in this build; E31 read only the collapsed trigger. This Console build (`index-OIWtun4R.js`, 2026-11-24) renders "Members tagged with…" for its default audience mode, and with no tags the Add tag and Save controls were disabled. E36 read the builder chunk (`controls-Bf3Y4t9I.js`): its audience menu groups tag modes with `members`/`except-members` ("These members, picked by hand"), `workspace`/`everyone`/`all-service-accounts`, and service-account modes. The hand-picked route therefore needs no tag and was available; E31 recorded the closed control, not the menu. Tag creation through the API is untested. It is not on the measured route: E36 found the hand-picked member target, and E37 created the policy without a tag. No tag API is needed for the documented path. The compile question is now measured (E37): a policy targeting the sole member with a Providers deny for `mistral` was created through the builder, and `opencode debug config` gained `info.policies: [{action: "provider.use", resource: "mistral", effect: "deny"}]` — inside the existing `document` source, not a source with a Console type. `opencode models` stayed at 112 lines and still listed `mistral`. The policy was then deleted; the statement disappeared, Controls returned to "No policies yet", and the workspace baseline policy set (deny `*`, allow five providers) remained cached in the document. E26 left the account as found; E37 did too.

E37's Console policy compiled into `debug config`'s `document` source, the same source a local file uses. For `provider.use`, a document-source deny removes the model from selection: E43's local control made `deepseek` disappear from `opencode models` and `opencode run` said `Model unavailable: deepseek/deepseek-flash`, not "Blocked by configuration policy". The policy sentence belongs to an action that is attempted (a tool call), and only organization statements are documented to name the workspace. E43 could not rerun the Console arm (no browser session), so whether a Console-compiled provider deny shows a different sentence is unmeasured.

E31 pinned that observation to a build and read the page's own requests instead of
its buttons. The build has no footer version and no `x-…-version` header; the pin
is the bundle hash `/console/assets/index-OIWtun4R.js`, observed 2026-11-24, and
the builder lives at `/console/<wrk-id>/policies/new` (the workspace id is part of
the path — `/console/policies/new` without it is a 404). The page called
`/console/api/policies`, `/console/api/members?page=1&pageSize=100`,
`/console/api/orgs/current`, `/console/api/orgs?expect=<wrk-id>` and
`/console/api/auth/session`; no tag endpoint, because no tag exists to read. The
activity here is GET-only by construction: `Add tag` and `Save` are disabled, so
there is nothing to submit.

Two things sharpened the absence claim. The members page's per-member menu (never
opened in round 24) offers only "View details" and "Remove…", and the builder's
"Tag members first" link points at that page — so the control is absent from the
one page the builder sends you to. But the client bundle does carry a tag model:
the member schema includes `tags` and the members list accepts a `tags` filter, so
tags exist server-side and only the UI cannot make one. The tag target is still
unexercised; the hand-picked target needs no tag, so it does not block a policy.

**What compiles, and what cannot be attributed.** The statement is readable: the
doctor's `debug config` document carries it, and this plugin could report it as a
policy on the member. It cannot say where it came from. The source type is
`document`, the same label a local `opencode.json` gets, so a Console rule and a
local rule are indistinguishable by provenance. That is the narrow claim: the
remote half is not unobservable, it is unattributable. The workspace baseline
(the five-provider allowlist) appears the same way after the first fetch and is
not removed by deleting a policy.

What that leaves untested is still the wording of a denial: the vendor says a
Console-derived denial names the workspace, while a local statement does not.
E37 made the policy but did not spend a turn against the denied provider. E43's
local control showed that a `provider.use` deny is enforced at model selection:
`opencode run` reports `Model unavailable: deepseek/deepseek-flash` without a
turn, not a policy sentence. The Console arm was not rerun (no browser session),
so whether a Console-compiled provider deny differs remains unmeasured. The
plugin still cannot attribute a statement from provenance alone.

The field technique is Chrome Enterprise's policy page: it shows a per-policy
source and a stated precedence, and `chrome://policy` can reload and show it.
This plugin has no equivalent. It cannot query the host about a policy applied
outside its process, and the one policy it can name — a `plugin.use` or
`provider.use` deny of itself — fails as `Model unavailable`, the same sentence
a typo in the model id produces.

## Why there is no probe

A `doctor --probe-policy` that attempts a denied action would be side-effectful
and ambiguous: a refused turn cannot distinguish "denied by policy" from "not
configured", and the attempt itself spends a turn or touches the workspace. The
effect is the only evidence, and it is the same evidence a typo produces. That is
not a diagnostic; it is a guess with a bill.

The one thing that would narrow this is E14, and round 22 did not run it: there
was no connected workspace to deny anything, and the probe spends a turn. If a
Console denial does name its workspace, the effect becomes attributable — still
not a diagnostic, still not something to probe by default, but no longer
indistinguishable from a typo. Until then the rule stands as written.

## Condition that changes this record

A queryable policy surface in the host, a `debug config` source the doctor can
name for a Console-delivered statement, or #60252 shipping with a strict
validation or reject diagnostic. The cheapest of those is E13 against a connected
workspace: one policy, one minute, two reads. Until then the status is: local H,
remote unobservable, no probe, and the docs say a Console or managed policy may
apply and is not visible here.
