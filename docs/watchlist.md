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
| `policies` plane | Six-level precedence documented; local half readable via `--print-logs debug config`; remote half silent | 2026-11-23 | #60252 shipping, or a `debug config` source that names the Console | If a source appears, add the doctor clause and the docs sentence. No deny-by-effect probe (E-R21-03, E-R21-04, E-R21-05, D127) |
| Muse SDK and MSP | SDK 1.4.24 pinned; CLI 1.4.25 installed; `MUSE_STRICT_HOST=1` refuses a host newer than the pin | 2026-11-23 | An SDK release, a CLI release that drifts the schema, or a new MSP command | Re-read `connection/spawn.js` for the Windows path, re-run the doctor's schema row, and re-check whether the pin can move (E-R21-07, E-R21-15) |
| `muse acp` | Shipped, no compatibility promise; no flags depended on here | 2026-11-23 | A vendor compatibility statement, or an ACP client inside opencode's engine | Revisit the ACP row in `decision-coverage.md`; the route stays closed until opencode ships a client side (D104) |
| Platform hosts | Linux tested; macOS and Windows unmeasured; Windows spawn likely `EINVAL`, close child-only | 2026-11-23 | Access to a macOS or Windows host, or a branch push that lets the matrix run | Run E2–E5 as written in `round-21-plan.md`; record the host result, never parity (D124–D126) |
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
```

If a cell changes, open a round: record the new value, the evidence, and what it
moves. Do not edit a past round's numbers to match.
