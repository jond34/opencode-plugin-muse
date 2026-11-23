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
**no Console source**, even though `opencode auth list` shows Console credentials
stored; its `info.policies` carries the local statements only (E-R21-05). So the
doctor can read what a file says, and cannot attribute anything to the Console.

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
restriction is not visible through either surface this plugin can read, and the
no-attribution rule is measured rather than inferred.

**Round 24 corrects the premise and then hits the policy surface.** Round 23's
binding rested on a label — `auth list` prints `OpenCode  Default  stored`, and
`Default` is also the workspace name — so it was consistent-with rather than
measured. E25 replaced it with a direct read. `opencode debug paths db` returns
`~/.local/share/opencode/opencode.db`; its `credential` table holds one active
`opencode` row, `cred_14b22fd9b001apW4pAdrUmjbtt`, label `Default`, whose value
contains `wrk_01KYJ6RT2QFFJ0AXV1J2JFEQR6` (367 characters, last written
2026-11-16), while the `workspace` table is empty. The stored token is scoped to
that workspace, and the CLI keeps no second binding record. No rename probe was
run and none is needed.

E26 then tried to create the Providers/Tools policy that would test compilation.
The Controls page reads "No policies yet. Every member can use all 76 enabled
models", and `/policies/new` offers one target, "Members tagged with…", whose
`Add tag` is disabled because no member tags exist. This build has no member page
carrying Controls (Settings → Members offers only View and Invite), no per-model
control on the Models table, and no tag affordance anywhere — `Tag` appears only
as a table filter. So the changelog's hand-picked-member route is not in this
build, a tag cannot be created to use the route that is, and a policy cannot be
created on this account at all. The compile question is therefore **unmeasured
rather than negative**, which is weaker than round 23 implied: a model toggle
never tested a policy, and a policy could not be made to test. The Console was
left exactly as found — no policy, no reservation, no tag; `debug config` still
one `document` and two `directory` sources; `opencode models` unchanged at
112 lines.

What that leaves untested is still the wording of a denial: the vendor says a
Console-derived denial names the workspace, while a local statement does not.
Reproducing it needs a member tag and a Providers or Tools deny; the tag half is
not reachable in this build, so E19 stays unmeasured with that cost stated. It
would not change the doctor either way — the plugin still cannot attribute the
decision it sees.

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
