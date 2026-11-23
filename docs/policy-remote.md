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

## Condition that changes this record

A queryable policy surface in the host, a `debug config` source the doctor can
name for a Console-delivered statement, or #60252 shipping with a strict
validation or reject diagnostic. Until then the status is: local H, remote
unobservable, no probe, and the docs say a Console or managed policy may apply
and is not visible here.
