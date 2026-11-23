# Discovery: the channels that fit an opencode plugin

The ACP Registry is not one of them. It lists **agents** that implement the
Agent Client Protocol and return `authMethods` in the handshake; Muse Code and
OpenCode are listed as agents. This plugin is an opencode plugin: no ACP
handshake, no `authMethods`, no binary or npx entry of its own. A submission
would be rejected on category, not on quality.

| Channel | What it is | This plugin | Action |
|---|---|---|---|
| ACP Registry | Curated ACP agents with `authMethods` | Not an agent; not applicable | None |
| `awesome-opencode` | Curated list, now one YAML file per plugin under `data/plugins/`; README is generated | No Muse entry. Fails two entry rules: the repository has one star (needs 25) and was created 2026-11-18 (needs 30 days) | Deferred to 2026-12-18 at the earliest, and only at 25+ stars (E-R21-11, E-R21-12) |
| `opencode.im` | Reviewed directory that auto-discovers npm packages with the `opencode-plugin` keyword, checked daily | No listing found on 2026-11-23: `/plugin/opencode-plugin-muse` is a 404. Its search page is client-rendered, so its HTML is not evidence either way. The package carries the keyword, so it is eligible | Submit via <https://opencode.im/submit>; recheck at 24 hours and 7 days (E-R21-13) |
| `opendock.net` | Indexes npm and GitHub plugins automatically (3,414 indexed) | No direct listing found. The bare domain does not resolve; `www` does | Verify only; no submission (E-R21-14) |
| `flow-next` | Lists Muse Code as a supported **harness** (733★) | Not a directory of Muse providers for opencode | None |
| GitHub search | Repository and npm metadata | Reachable today | None |

Current package state: `@jonathand34/opencode-plugin-muse` 0.1.12, with the
`opencode-plugin` keyword present. The gap is the curated list and the "people
who already know to look" problem, not the package metadata: absence from a
directory is not a rejection, and neither auto-indexer has had a week yet.

## `awesome-opencode`: the shape changed, and the gate is new

The list is data-driven now. A contribution is one YAML file under
`data/plugins/`, and the README table is generated from it. The round-20 HTML
`<details>` block would be rejected, so it is gone from this record.

Required fields are `name`, `repo`, `tagline` (120 characters or fewer) and
`description`; `scope`, `tags`, `min_version`, `homepage` and `installation` are
optional. The entry rules are: public repository, maintained within 90 days, at
least 25 stars, at least 30 days old, unique, and complete (E-R21-11).

This repository meets the maintenance, visibility and uniqueness rules. It does
not meet the star or age rule: `jond34/opencode-plugin-muse` is public, created
2026-11-18, last pushed 2026-11-18, one star (E-R21-12). The earliest date the
age rule allows is **2026-12-18**. The star count is the binding constraint and
there is no honest way to accelerate it; asking for stars to clear a directory
gate is the one move this record rules out.

The draft entry, ready for the day both gates pass:

```yaml
name: Muse Code
repo: https://github.com/jond34/opencode-plugin-muse
tagline: Muse Code subscription provider for opencode; the credential stays in the muse CLI.
description: |
  Registers the muse provider and drives the signed-in muse CLI over MSP, so a
  Muse Code subscription works in opencode without the credential leaving the
  CLI. opencode V2 only; 2.3.2 or newer.
scope:
  - global
min_version: "2.3.2"
installation: |
  ## Install
  ```bash
  opencode plugin add @jonathand34/opencode-plugin-muse
  ```
  Sign in with `muse login`, then restart opencode. The plugin never holds the
  credential.
```

## The chosen action

Q11 is A, and D128 sequences it: `opencode.im` is the only channel actionable
today, so it is submitted through the form and rechecked; `awesome-opencode` is
deferred to its gate; `opendock.net` is verified. None of the three is a code
change.

A submission speaks for the repository in public, so it is the owner's action,
not an experiment: prepare the text, then stop at the form (D132). As of this
round the owner has held the submission, so the state is "eligible, not
submitted" and no timestamp exists to recheck against.

## Condition that changes this record

The ACP Registry adding a plugin category, a directory rejecting the package, or
`jond34/opencode-plugin-muse` reaching 25 stars on or after 2026-12-18. Until
one of those, the npm keyword is present and both auto-indexers accept it; the
curated list cannot.
