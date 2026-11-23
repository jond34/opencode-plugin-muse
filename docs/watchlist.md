# Watchlist: the experimental surfaces and what reopens a round

The plugin stands on surfaces the vendors call experimental or that change
without a compatibility promise. This is the snapshot each claim rests on and
the signal that invalidates it. A change is a new round with its own evidence,
not a silent edit to a committed record (D129).

**Snapshot taken 2026-11-23. Check monthly, and on any release that moves a
version cell below.**

| Surface | Snapshot | Last checked | Trigger | Action |
|---|---|---|---|---|
| opencode host and plugin API | `opencode` v2.4.1 installed; `@opencode/plugin` pinned at 2.3.2; plugin loads and lists `muse/*` | 2026-11-23 | A new minor release, or a plugin-API warning at load | Re-run E1: load, `opencode models --standalone`, the model-record limit test. Update the README's tested version only on a pass (E-R21-01, E-R21-18, E-R21-19) |
| `canonical` inheritance | PR #59880 open and unmerged; inheritance still applies in the config-provider path only, so the plugin supplies its own limits | 2026-11-23 | #59880 merging, or a release note about provider model records | Re-run the plugin-path probe; if the plugin transform starts inheriting, the limit table and the test change (E-R21-02, E-D124) |
| `policies` plane | Six-level precedence documented; local half readable via `--print-logs debug config`; remote half silent; no policy API on 2.4.1 | 2026-11-23 | #60252 shipping, or a `debug config` source that names the Console | If a source appears, add the doctor clause and the docs sentence. No deny-by-effect probe (E-R21-03, E-R21-04, E-R21-05, E-R22-08, D127) |
| Console workspace lifecycle | Personal workspace at signup, owner is its only member; policies fetch about once a minute, replace on switch, clear on disconnect, last kept on outage; workspace policies compile into the workspace configuration | 2026-11-23 | A policy API appearing, or E13 finding a `debug config` source | Run E13 (ten minutes, one policy, two reads); on a source, add the doctor clause (E-R22-05, E-R22-06, E-R22-07) |
| Node `.cmd` spawn contract | Node refuses `.cmd`/`.bat` without `shell` (the CVE-2024-27980 fix, 18.20.2+); measured on `windows-latest`: bare name `ENOENT`, explicit `.cmd` `EINVAL` | 2026-11-23 | A Node release that changes the rule, or libuv's PATH search gaining `.cmd` | Re-run `test/seam/windows-spawn.mjs`; if the bare name starts working, the resolver stops being required (E-R22-01, E11, D133) |
| Vendor Windows launcher layout | Confirmed by running the installer on `windows-latest` (run 45281586619): `.muse-version` `1.4.25-R9361.1`, `muse-bin-1.4.25-R9361.1.exe` (413 MB), `muse.cmd`, `.muse-launcher.ps1`, `.muse-channel`, `.muse-release-info.json`, no `muse.exe`; install is unauthenticated | 2026-11-23 | A launcher change that renames the binary, drops `.muse-version`, or ships `muse.exe` (which would make the `path-exe` branch live) | Re-run `test/seam/windows-real.mjs`; update `resolveMuseBin` and its tests (E-R22-03, E16a, D134, D141) |
| Muse SDK and MSP | SDK 1.4.24 pinned; CLI 1.4.25 installed; `MUSE_STRICT_HOST=1` refuses a host newer than the pin | 2026-11-23 | An SDK release, a CLI release that drifts the schema, or a new MSP command | Re-read `connection/spawn.js` for the Windows path, re-run the doctor's schema row, and re-check whether the pin can move (E-R21-07, E-R21-15) |
| `muse acp` | Shipped, no compatibility promise; no flags depended on here | 2026-11-23 | A vendor compatibility statement, or an ACP client inside opencode's engine | Revisit the ACP row in `decision-coverage.md`; the route stays closed until opencode ships a client side (D104) |
| Platform hosts | Linux tested; macOS tested on `macos-15` (406 tests, 0 fail); Windows install, resolution, `config validate`, real `muse serve` handshake and close measured on `windows-latest`; no desktop | 2026-11-23 | A Windows desktop, or a vendor release that moves the launcher layout | Run the doctor and one turn on a signed-in desktop; record it, never parity (D141, D142, D144) |
| macOS runner supply | `macos-latest` is macOS 26 (arm64) and the free pool is arm64 only; Intel labels are paid larger runners; a 2026-11-23 dispatch queued 15 minutes with zero steps and was cancelled, a later one was acquired at once (run 45282185770) | 2026-11-23 | Repeated cancellations across both `macos-15` and `macos-26`, or a billing-allowance change | Retry twice, quote the annotation, then record "unobtainable on the free pool" rather than "unmeasured" (E17, D144, D145) |
| Discovery listings | No `opencode.im` listing, no direct `opendock` listing, `awesome-opencode` gated at 25 stars and 30 days | 2026-11-23 | The package appearing in a directory, or `jond34/opencode-plugin-muse` reaching 25 stars on or after 2026-12-18 | Update `docs/ecosystem.md`; the `awesome-opencode` YAML is already drafted there (E-R21-11–E-R21-14) |
| Terms §3.2 | Credential restricted to the coding harness; the plugin never receives it | 2026-11-23 | A terms change, or a vendor statement about third-party clients | Re-read the README's subscription paragraph; the mechanism, not the endorsement, is what it claims (E-R21-10) |

## How to check

```bash
opencode --version
muse --version
node -p "require('./node_modules/@muse-code/sdk/package.json').version"
gh release list --repo anomalyco/opencode | head -3
gh pr view 59880 --repo anomalyco/opencode --json state
gh issue view 60252 --repo anomalyco/opencode --json state
gh repo view jond34/opencode-plugin-muse --json stargazerCount,createdAt,pushedAt
gh run list --repo jond34/opencode-plugin-muse --workflow test.yml --limit 3
curl -sI https://api.meta.ai/muse-launcher.ps1 | head -1
```

If a cell changes, open a round: record the new value, the evidence, and what it
moves. Do not edit a past round's numbers to match.
