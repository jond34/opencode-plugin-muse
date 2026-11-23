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

## Remote: unobservable

A policy delivered by Console is decoded on the vendor's side on opencode 2.3.2.
Unknown actions
and effects are filtered without a diagnostic (`anomalyco/opencode#60252`, open),
so there is no log line for the doctor to read. `config status --json` names only
`system_file` sources, and both are absent on this machine, so the channel is one
this checkout cannot observe at all.

The field technique is Chrome Enterprise's policy page: it shows a per-policy
source and a stated precedence (platform > machine cloud > OS-user > cloud-user),
and `chrome://policy` can reload and show it. This plugin has no equivalent. It
cannot query the host about a policy applied outside its process, and the one
policy it can name — a `plugin.use` or `provider.use` deny of itself — fails as
`Model unavailable`, the same sentence a typo in the model id produces.

## Why there is no probe

A `doctor --probe-policy` that attempts a denied action would be side-effectful
and ambiguous: a refused turn cannot distinguish "denied by policy" from "not
configured", and the attempt itself spends a turn or touches the workspace. The
effect is the only evidence, and it is the same evidence a typo produces. That is
not a diagnostic; it is a guess with a bill.

## Condition that changes this record

A queryable policy surface in the host, or #60252 shipping with a strict
validation or reject diagnostic. Until then the status is: local H, remote
unobservable, no probe.
