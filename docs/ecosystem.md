# Discovery: the channels that fit an opencode plugin

The ACP Registry is not one of them. It lists **agents** that implement the
Agent Client Protocol and return `authMethods` in the handshake; Muse Code and
OpenCode are listed as agents. This plugin is an opencode plugin: no ACP
handshake, no `authMethods`, no binary or npx entry of its own. A submission
would be rejected on category, not on quality.

| Channel | What it is | This plugin | Action |
|---|---|---|---|
| ACP Registry | Curated ACP agents with `authMethods` | Not an agent; not applicable | None |
| `awesome-opencode` | Curated README with a `PLUGINS` section of `<details>` entries (11,086★) | No Muse entry today | PR, if the owner wants it |
| `opencode.im` | Reviewed directory that auto-discovers npm packages with the `opencode-plugin` keyword, checked daily | No listing found on 2026-11-23: `/plugin/opencode-plugin-muse` is a 404 and site search has no hit; the package carries the keyword, so it is eligible | Submit via `/submit`; verify the listing |
| `opendock.net` | Indexes npm and GitHub plugins automatically (3,056 plugins) | Eligible for automatic indexing | Verify; no submission |
| `flow-next` | Lists Muse Code as a supported **harness** (733★) | Not a directory of Muse providers for opencode | None |
| GitHub search | Repository and npm metadata | Reachable today | None |

Current package state: `@jonathand34/opencode-plugin-muse` 0.1.12, with the
`opencode-plugin` keyword present. A direct check on 2026-11-23 found no
`opencode.im` page (`/plugin/opencode-plugin-muse` is a 404) and no site-search
hit, so no listing was found; `opendock.net` was not checked. The
gap is the curated list and the "people who already know to look" problem, not
the package metadata.

## The chosen action

Q11 is A: submit to `awesome-opencode` and submit/verify `opencode.im`. Neither
is a code change, and neither is done in this round. The exact block for the
`PLUGINS` section is below; the `opencode.im` check is
<https://opencode.im/> (submission: <https://opencode.im/submit>).

```html
<details>
  <summary><b>Muse Code</b> <img src="https://badgen.net/github/stars/jond34/opencode-plugin-muse" height="14"/> - <i>Muse Code subscription provider</i></summary>
  <blockquote>
    Registers the <code>muse</code> provider and drives the signed-in <code>muse</code> CLI over MSP, so a Muse Code subscription works in opencode without the credential leaving the CLI. Install with <code>opencode plugin add @jonathand34/opencode-plugin-muse</code>.
    <br><br>
    <a href="https://github.com/jond34/opencode-plugin-muse">🔗 <b>View Repository</b></a>
  </blockquote>
</details>
```

Opening the PR is the owner's call. It is the only action here that speaks for
the repository in public, and it is not required for the package to be
installable.

## Condition that changes this record

The ACP Registry adding a plugin category, or a directory rejecting the package.
Neither is true today; the npm keyword is present and both auto-indexers accept
it.
