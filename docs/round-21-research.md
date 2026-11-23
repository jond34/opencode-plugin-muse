# Round 21 research: the platform seam, the policy plane, and the listing gates

Written 2026-11-23. HEAD `631e9a2` (round 20 closed at `8abc1d8`; three commits
after it). **Update during the round:** the owner updated the installed host to
opencode 2.4.1. `opencode models --standalone` lists the `muse/*` models, but
`opencode api get /api/model` returns `{"data":[]}` on 2.4.1, so the round-20
read shape no longer returns the model record. E1 is now a system-host probe,
not a scratch install.

This round re-checks the four items round 20 left as "not run or not
visible", and the assumptions underneath them:

- the platform matrix was not dispatched; macOS and Windows were unmeasured;
- the Console-delivered half of `policies` was unobservable;
- `opencode.im` had no listing;
- the experimental surfaces were pinned to opencode 2.3.2 and CLI 1.4.25.

The headline: **the Windows row is not merely unmeasured. The default spawn is
likely broken.** The vendor installs `muse` as a `muse.cmd` shim on Windows, and
Node cannot spawn a `.cmd` without a shell. The SDK this plugin uses calls
`child_process.spawn` without one. The same SDK's Windows shutdown path is
child-only, not a process tree. A green CI matrix would not catch either.

The second headline: **the `awesome-opencode` action in round 20 cannot run
today.** The list moved from a README `<details>` block to YAML files under
`data/plugins/`, and it requires 25 stars and a repository at least 30 days old.
This repository is public, five days old, and has one star. The earliest
eligible date is 2026-12-18; the star count is not there.

Every claim carries an E-id or a source. Third-party reproductions are labelled
as such; they are evidence of a failure mode, not a vendor contract.

## Evidence register

| E-id | Claim | Source | Confidence | What it changes |
|---|---|---|---|---|
| E-R21-01 | opencode 2.4.1 shipped 2026-11-23; 2.4.0 shipped the same day. The installed host here was 2.3.2 at the start of the round and is now 2.4.1 (owner update during the round). | `gh release list --repo anomalyco/opencode`; `opencode --version` | High | The round-20 snapshot is one minor release stale. E1 now uses the installed 2.4.1. |
| E-R21-02 | PR #59880, "offer every model of a canonical provider", is still open and unmerged; the plugin-provider path still does not inherit. | `gh pr view 59880 --repo anomalyco/opencode` | High | D113 stands on 2.3.2; re-test on 2.4.1, but do not assume a change. |
| E-R21-03 | Policies now have a six-level authority order: macOS managed preferences, system file, connected Console workspace, global config, direct config, `.opencode` config. Console changes apply on the next fetch, about once a minute; a Console outage leaves the last statements in effect. | <https://opencode.ai/docs/policies/>; <https://opencode.ai/docs/enterprise/> | High | The README and `docs/policy-remote.md` need the precedence table, not only the local/remote split. |
| E-R21-04 | #60252 is open. The remote decoder filters unknown actions and effects without a diagnostic; local config logs a warning. | <https://github.com/anomalyco/opencode/issues/60252> | High | The remote half is still unobservable. No deny-by-effect probe. |
| E-R21-05 | On this machine, `opencode debug config --standalone` lists one `document` source and two `directory` sources. It names no Console source, although `opencode auth list` shows OpenCode Console credentials stored. Its `info.policies` contains local policy statements. | Local run 2026-11-23 | Medium-high | `config status --json` is not a valid command on 2.4.1. The doctor can read local `info.policies`, but there is no evidence yet that it can attribute a Console policy. |
| E-R21-06 | On Windows, the normal Muse install puts `muse` on PATH as `muse.cmd` (or a PowerShell launcher), not a directly spawnable `.exe`. Node reports `spawn EINVAL` for a `.cmd` without a shell. | Paseo #6894 (2026-10-14) and #6193 (2026-10-06), both third-party reproductions; <https://dev.meta.ai/docs/muse-code> says the PowerShell installer puts a native binary on PATH | Medium-high | The plugin's default `muse` spawn is likely broken on Windows. This is a code defect risk, not only a docs gap. |
| E-R21-07 | SDK 1.4.24 calls `child_process.spawn` with no `shell`; `buildSpawnOptions` sets only `cwd`, `env`, `detached` and `windowsHide`. `ownsProcessGroup` is false on `win32`. | `node_modules/@muse-code/sdk/dist/src/connection/spawn.js:457` and `buildSpawnOptions` | High | There is no `.cmd` handling and no Windows process-group kill in the pinned SDK. |
| E-R21-08 | A Windows harness that did use `taskkill /PID <pid> /T /F` found the tree stopped but `taskkill` exited 255 because a child had already gone; its code tolerated only 128, so `host.close()` threw. Muse took about 3.2 s to exit after stdin EOF. | Paseo #6193, third-party, Muse 1.4.3 | Medium | If a Windows close leaves an orphan, the fix needs a tree kill and a deliberate exit-code policy, not a blind ignore. |
| E-R21-09 | Muse's Windows sandbox may show a UAC prompt on first initialization. Issue #138 reports that setup creates persistent local users, a group, profiles, a ProgramData root and workspace ACL/sharing changes without disclosing them before the prompt. The issue is open. | <https://dev.meta.ai/docs/muse-code>; <https://dev.meta.ai/docs/muse-code/permissions>; <https://github.com/meta-models/muse-code-sdk/issues/138> | High for the UAC prompt; medium for the inventory (one reporter, open) | Windows support has a consent/disclosure cost beyond code. Document it; do not silently spawn into it. |
| E-R21-10 | Meta Model API Terms §3.2: the key or credential "is for use only with the coding harness under your Coding Harness Subscription ... and may not be used to access the Services outside the coding harness or to circumvent your subscription's usage limits or billing." | <https://dev.meta.ai/legal/terms-of-service> | High | D116 holds: the object is the credential, and `muse serve` is the documented headless surface. It is not an endorsement of this client. |
| E-R21-11 | `awesome-opencode` now takes one YAML file under `data/plugins/`; README is generated. Required fields are `name`, `repo`, `tagline` (≤120 chars) and `description`; optional `scope`, `tags`, `min_version`, `homepage`, `installation`. Entry rules: public, maintained within 90 days, at least 25 stars, repository at least 30 days old, unique, complete. | <https://github.com/awesome-opencode/awesome-opencode/blob/main/contributing.md>; `data/schema.json`; `data/examples/plugin.yaml` | High | `docs/ecosystem.md` is factually stale. The round-20 HTML block must not be used. |
| E-R21-12 | `jond34/opencode-plugin-muse` is public, created 2026-11-18, last pushed 2026-11-18, one star. | `gh repo view jond34/opencode-plugin-muse --json ...` | High | It fails the 25-star and 30-day rules. Earliest date is 2026-12-18; stars are unknown. Submission is deferred, not rejected. |
| E-R21-13 | `opencode.im` says it auto-discovers npm packages with the `opencode-plugin` keyword, checks daily, and reviews candidates before publication. No listing was found on 2026-11-23: the direct slug is 404 and `?search=muse` has no hit. The package has the keyword and an install command. | <https://opencode.im/>; <https://opencode.im/submit>; direct checks | High for "no listing found"; the review outcome is unknown | Submit through the form; recheck after 24 hours and 7 days. Absence is not a rejection. |
| E-R21-14 | `opendock.net` does not resolve without `www`; `https://www.opendock.net/` reports 3,414 indexed plugins and says it syncs npm and GitHub daily. No direct listing was found for this package. | Site checks; <https://github.com/qunqin24/opendock> | High for the site state; the index may lag | Verify again after the next sync; no submission is required. |
| E-R21-15 | Muse Code is 1.4.25; `@muse-code/sdk` is 1.4.24; `muse login --help` takes no arguments and names no account; `muse auth` is provider API-key storage, not subscription account switching. | Local versions and help; npm | High | D114 stands: one credential per host. |
| E-R21-16 | opencode ships native Windows zips; Windows package managers are not supported. The plugin install command is still `opencode plugin add`. | <https://opencode.ai/docs> | High | Installation docs should not imply a package-manager path on Windows. |
| E-R21-17 | The Magpie multi-account routes are still current: `JohnWangggg/magpie-muse-web` (43 stars, updated 2026-11-19) imports web-session cookies; `sonvivu/magpie-muse-auth` (2 stars, updated 2026-11-16) mints API keys and calls the Responses API. | GitHub search, 2026-11-23 | Medium | The steelman for multi-account is real but niche, and both routes leave MSP. |
| E-R21-18 | On the installed 2.4.1, `opencode models --standalone` lists `muse/muse-ember-1.0`, `muse/muse-spark-1.2`, `muse/muse-spark-1.3`, `muse/muse-wonder-1.0` and their contributor variants. `opencode api get /api/model --standalone` returns `{"location":...,"data":[]}`. | Local run 2026-11-23 | High | The plugin loads on 2.4.1. The round-20 limit/canonical read is not available in that shape; use `opencode models` for load and the unit test/source for limits until a new read is found. |
| E-R21-19 | The package still depends on `@opencode/plugin` 2.3.2 while the host is 2.4.1. The plugin loads and lists models on the newer host, but the dependency pin is unchanged. | `package.json`; E-R21-18 | High for the pin; medium for long-term compatibility | Do not bump the dependency blindly. Test the API surface on 2.4.1 first; bump only if a needed API is missing or a warning appears. |
| E-R21-20 | Executed 2026-11-23: with isolated `XDG_*` directories and this checkout as the only plugin, `opencode models --standalone` on 2.4.1 lists `muse/muse-ember-1.0`, `muse-spark-1.2`, `muse-spark-1.2-contributor`, `muse-spark-1.3`, `muse-spark-1.3-contributor`, `muse-wonder-1.0`, `muse-wonder-1.0-contributor`; no plugin-API warning on load. `opencode api get /api/model --standalone` and `/api/provider --standalone` both return `{"data":[]}`. `bun test test/contributor-models.test.ts` is 12 pass, 0 fail, 24 expects, and pins that the model record's `contextLimit`/`outputLimit` (sentinel `111111`/`22222`) win and `canonical` is left undefined on the record. | Local run 2026-11-23 | High | E1 passes: the README may say "tested on 2.3.2; loads on 2.4.1; limit read via the model record test". The live limit value is not readable through the API on 2.4.1, so it is pinned by test rather than reported. |
| E-R21-21 | Recheck 2026-11-23: `jond34/opencode-plugin-muse` is PUBLIC, not archived, created 2026-11-18T19:17Z, pushed 2026-11-18T21:37Z, one star. `https://www.opendock.net/plugins/opencode-plugin-muse` is 404, and its search HTML is server-rendered (219 plugin-name occurrences) with no match for this package. `https://opencode.im/plugin/opencode-plugin-muse` is 404; its search page serves zero plugin names in HTML, so that page is client-rendered and its HTML is not evidence either way. | `gh repo view`; direct HTTP checks | High for the 404s and the repository state; medium for the opencode.im search page, which cannot be read from `curl` | The `awesome-opencode` gate is unmet on both axes. `opendock` has not indexed the package after five days. The opencode.im conclusion rests on the direct slug 404, not on the search page. |

## What changed in the committed record

`docs/ecosystem.md` is the largest correction. It describes `awesome-opencode`
as a README with a `PLUGINS` section of `<details>` entries and supplies an HTML
block. That is the old shape. The list is now data-driven YAML, and the HTML
block would be rejected. The same file says "submit" without the 25-star and
30-day gate; this repository cannot pass it yet. The action is deferred, not
chosen and not done.

`docs/platform-support.md` is too generous on spawn resolution. It says `muse`
must resolve on PATH and leaves it unmeasured. The pinned SDK does not use a
shell, and the vendor's Windows shim is a `.cmd`. The row should say "likely
`spawn EINVAL` until the native `muse-bin-*.exe` is resolved", and the shutdown
row should say the SDK's Windows path is child-only, so an orphan is possible.
The matrix is still worth dispatching, but it proves the fixtures, not the
spawn or the close.

`docs/policy-remote.md` cites `config status --json`. On 2.3.2 that command is
not recognized; the observable surface is `opencode debug config`, whose
sources are `document` and `directory` entries. The local half is still H. The
remote half is still unobservable, but the reason is now sharper: no source
attribution, not just a missing log line. The precedence table belongs in the
doc.

`README.md` says "as of opencode 2.3.2". 2.4.1 is now installed, and the plugin
loads and lists `muse/*` on it (E-R21-18). The sentence should say "tested on
2.3.2; loads on 2.4.1, limit read pending" until E1's limit check is complete.
The test count remains 418 until code or tests change.

`docs/decision-coverage.md` keeps the platform and policy rows at P. The basis
cells need the new evidence, but the counts do not change unless a new row is
opened. Do not open a row for "Windows spawn" unless the fix ships; the platform
row already owns the dimension.

## Unknowns that only a host or an owner can close

- Windows: does 1.4.25 still install `muse.cmd`, or does it now put a spawnable
  `.exe` on PATH? Does `MUSE_BIN` pointing at `muse-bin-*.exe` work? Does
  `host.close()` leave a `muse-bin` or `conhost` process? Does a headless spawn
  hit UAC and time out? What do `icacls` and the ledger show?
- macOS: does the offline suite pass, does the seam spawn, is the ledger `0600`,
  and does close leave anything behind?
- Console: does a workspace policy appear in `opencode debug config`? If it
  does, can the doctor attribute it to the Console rather than to a local file?
- opencode 2.4.1: the plugin loads and lists `muse/*` (E-R21-18). Does it keep
  its model-record limits and the `canonical` label without inheriting? The
  `/api/model` read is empty, so this needs a new read or the unit test/source.
  Does the local policy diagnostic still work?
- `opencode.im`: does the review accept the package, and how long does it take?
- `awesome-opencode`: will the repository reach 25 stars by 2026-12-18? If not,
  the action stays deferred; there is no shortcut.

## Search method and limits

Searches used Exa, TinyFish, You.com and Keenable through the MCP proxy, plus
direct `read_url` fetches of primary pages. Parallel and Linkup returned credit
or funding errors, so they contributed nothing. Primary sources were preferred:
opencode docs and GitHub, Meta docs and terms, npm metadata, the local SDK code,
and `gh` repository metadata. The Paseo issues are third-party reproductions and
are labelled as such; they explain a failure mode, not a guarantee about 1.4.25.

Not available from this checkout: a Windows host, a macOS host, a Console
workspace whose policy can be changed for a test, a remote branch for the CI
matrix, and authorization to submit a public listing. Those are the gates in
the plan, not omissions in the research.

## Round 21 execution record (2026-11-23)

Baseline: HEAD `631e9a2`, `main` 93 ahead of `origin/main`, `src/` clean,
`docs/integration-landscape.md` modified by the owner and left alone.
`opencode` v2.4.1, `muse` 1.4.25, bun 1.4.4.

| Experiment | Status | Evidence |
|---|---|---|
| E1, re-baseline on 2.4.1 | **Pass** | Seven `muse/*` entries listed with isolated XDG; no plugin-API warning; `/api/model` and `/api/provider` both empty; `test/contributor-models.test.ts` 12 pass, 0 fail (E-R21-20) |
| E2, Windows spawn resolution | **Blocked: no Windows host** | Not run. D124 stays a defect risk, not an observation |
| E3, Windows close and process tree | **Blocked: no Windows host** | Not run. D125 stays conditional |
| E4, Windows ACLs and UAC | **Blocked: no Windows host** | Not run. D130 is documentation only |
| E5, macOS seam | **Blocked: no macOS host** | Not run. The macOS cells stay "unmeasured" |
| E6, Console policy visibility | **Blocked: no Console policy change** | No workspace policy was added, so `opencode debug config` has no before/after to compare. D127 stands: local H, remote unobservable, no probe |
| E7, `opencode.im` submission | **Held by the owner** | No submission, no timestamp to recheck. The package is eligible; the state is "not submitted", not "rejected" (E-R21-13) |
| E8, `awesome-opencode` and `opendock` | **Read-only check, gate unmet** | One star and a 2026-11-18 creation date against a 25-star and 30-day rule; `opendock` 404 and not in its server-rendered index (E-R21-21) |
| E9, watchlist | **Created** | `docs/watchlist.md`, snapshot 2026-11-23 |

The owner held the product choices this round raised (the `opencode.im`
submission among them), so no public action ran and no branch was pushed. With
E2 and E3 blocked there is no evidence that would justify the Windows resolver
or a tree-kill wrapper, so **no runtime code changed** and D131 holds: no new
surface, no dependency, no code.

One measurement correction follows from E8. The `opendock.net` search page is
server-rendered and can be read from `curl`; the `opencode.im` search page is
not, so the earlier "site search has no hit" is weaker than it read. The
`opencode.im` conclusion therefore rests on the direct slug 404 alone.
