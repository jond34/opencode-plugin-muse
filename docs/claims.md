# External claims the ledger rests on

One row per outside statement a decision depends on. The ledger cites the
decision; this file says where the sentence came from, when it was read, and what
would make it stale. `scripts/check-claims.ts` reads the JSON mirror and, with
`--strict`, fails when a state changed. Warn-only by default (O5).

| ID | Claim | Source | Quote | As of | Version | Check |
|---|---|---|---|---|---|---|
| muse-scope | A Muse plugin can be installed with a project scope | [Muse changelog](https://dev.meta.ai/docs/muse-code/changelog) | "`/plugins install` accepts `--scope user` or `--scope project`, so a local plugin can be installed for the project instead of only for you" | 2026-11-24 | 1.4.25 | http |
| muse-hooks-approve | A plugin's hooks wait for an explicit approve | [Muse plugin CLI](https://meta-models.github.io/muse-code-sdk/latest/guides/plugins/reference/cli/) | "hooks, MCP servers, reminders and agent definitions wait for approve" | 2026-11-24 | 1.4.25 | http |
| console-targets | The Console documents hand-picked members as a policy target | [Console changelog](https://opencode.ai/console/changelog/budgets-in-policies) | "These members, picked by hand, or everyone except them." | 2026-11-24 | 2026-10-10 entry | http |
| opencode-54806 | The turn-cap request was declined | [#54806](https://github.com/anomalyco/opencode/issues/54806) | state `closed`, reason `not_planned` | 2026-11-24 | 2.4.1 | github-issue |
| opencode-53356 | The turn-cap request is still open | [#53356](https://github.com/anomalyco/opencode/issues/53356) | state `open` | 2026-11-24 | 2.4.1 | github-issue |
| opencode-63257 | opencode's MCP client sends no progress token | [#63257](https://github.com/anomalyco/opencode/issues/63257) | state `open` | 2026-11-24 | 2.4.1 | github-issue |
| opencode-49929 | A second thread on the same missing progress token | [#49929](https://github.com/anomalyco/opencode/issues/49929) | state `open` | 2026-11-24 | 2.4.1 | github-issue |
| opencode-28186 | The earlier duplicate was closed | [#28186](https://github.com/anomalyco/opencode/issues/28186) | state `closed`, reason `duplicate` | 2026-11-24 | 2.4.1 | github-issue |
| opencode-60252 | A Console policy is decoded with no diagnostic | [#60252](https://github.com/anomalyco/opencode/issues/60252) | state `open` | 2026-11-24 | 2.4.1 | github-issue |
| opencode-63599 | A core sandbox PR is open and non-draft | [#63599](https://github.com/anomalyco/opencode/pull/63599) | state `open`, draft `false` | 2026-11-24 | 2.4.1 | github-pr |
| opencode-64093 | A second core sandbox PR is open and draft | [#64093](https://github.com/anomalyco/opencode/pull/64093) | state `open`, draft `true` | 2026-11-24 | 2.4.1 | github-pr |
| sep-2663 | Tasks are an extension with polling and server-elected creation | [SEP-2663](https://modelcontextprotocol.io/seps/2663-tasks-extension) | "three methods: `tasks/get`, `tasks/update`, and `tasks/cancel` … Task creation is server-directed" | 2026-11-24 | Final, created 2026-04-27 | http |
| taskkill-t | `taskkill /T` walks child processes from the parent id | [taskkill](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill) | "`/T` terminates the specified process and any child processes which were started by it" | 2026-11-24 | Windows Server docs | http |
| node-signals | Windows signal termination is forceful and abrupt | [Node process](https://nodejs.org/api/process.html#signal-events) | "`SIGTERM`, `SIGKILL`, and `SIGINT` … terminate the process forcefully and abruptly" | 2026-11-24 | Node 24 | http |
| mxc-plugin | An MXC sandbox plugin ships for opencode | [npm registry](https://registry.npmjs.org/universal-opencode-sandbox/latest) | package `universal-opencode-sandbox`, version 0.4.1 | 2026-11-24 | 0.4.1 | http |
| codex-doctor | `codex doctor` exits 1 only when the overall status is `Fail` | [doctor.rs](https://github.com/openai/codex/blob/main/codex-rs/cli/src/doctor.rs) | `if report.overall_status == CheckStatus::Fail` | 2026-11-24 | main | http |
| vue-doctor | Vue Doctor's `--strict` exits 3 on an analyzer failure or skip | [CLI reference](https://remylagerweij.github.io/vue-doctor/reference/cli) | "Exit with code 3 if any analyzer fails or is skipped." | 2026-11-24 | current | http |

The older `brew doctor` and `a4 doctor` rows are **not reopened**: no primary
source was re-located in round 27, and no product sentence depends on either.
They stay in the ledger as historical comparisons, with their original dates.
Add a row when a decision starts depending on a new outside sentence, not when a
sentence is merely quoted.
