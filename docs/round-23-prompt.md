# Round 23 prompt: execute the three unmeasured cells

Paste the block below as the first message of a fresh session. It assumes the
repository at `~/repos/opencode-plugin-muse` and the state recorded in
`docs/round-23-research.md` and `docs/round-23-plan.md`.

---

Round 23 in `~/repos/opencode-plugin-muse`. Read `docs/round-23-research.md` and
`docs/round-23-plan.md` first; they are the state. Then execute the plan.

**Where things stand.** `main` is at `aefec5b` and untouched. A local branch
`round-22` holds two unlanded commits — the Windows resolver (`src/host.ts`,
`src/plugin.ts`, `test/muse-bin.test.ts`, `package.json`) and the seam jobs
(`test/seam/*`, `.github/workflows/test.yml`). The working tree also has the
round-22 docs, uncommitted, and `docs/integration-landscape.md`, which is the
owner's edit and is never staged. The remote `ci/seam` branch was deleted after
round 22's run.

**Approved.** Every experiment in the plan, including E19's one model turn.
E16b (a Windows turn on `META_API_KEY`) was withdrawn: the plugin deletes that
variable from the child env, so a key tests a route it does not ship. Pushing a
short-lived branch to dispatch a
workflow is approved: push the local `round-22` branch to `origin/ci/seam` (the
`push:` trigger in `test.yml` names that branch), run, then delete the remote
branch again. Not approved: any commit to `main`, any tag, any publish, any
`opencode.im` submission.

**Owner-only steps.** Do not try to do these yourself; do them in this order and
wait for the answer between each:

1. E21's `gh auth refresh -h github.com -s user` (needs the owner at a browser).
2. E18's Console work: sign in, Policies page, `provider.use` / `openai` /
   `deny`, `/connect` in OpenCode, choose the workspace.

**Order of execution.** E16a → E16c → E17 → E18 → E19 → E21. Do not start E19
before E18 has produced a connected workspace; a denial needs a workspace that
compiles. There is no secret to add: no step needs one.

**E16a/E16c in practice.** The `real-windows` job and `test/seam/windows-real.mjs`
are already written. Dispatch with `real_windows: true`. The script resolves
through `dist/host.js`, spawns the binary twice (`--version`, `config validate
--plane policy`), starts a real `muse serve` via `MuseHost.spawn`, closes it, and
lists survivors with PowerShell's `Get-Process`. It prepends the install dir to
`PATH` first, because the installer edits the *user* PATH and a workflow step
inherits the old one. Capture the install log tail: whether an unauthenticated
install works is itself a result. The E16a assertions gate; the E16c survivor
count is reported, not asserted, because a runner's job object may reap the tree.

**Rules.** `zsh -lc` for `gh` and any harness CLI. No new dependency. Scratch
output in `scratch/`. Never `muse acp`. A red macOS or Windows suite is a
finding, not a round failure — record it and do not expand into fixture work.
Do not add `timeout-minutes` to hide a queue.

**What to report.** For each of E16a, E16c, E17, E18, E19, E21: the command, the
observed output (quoted, trimmed), and the decision it moves (D141–D146). Name
any assertion that failed and whether it is a finding about the plugin or about
the suite. Then
the blocked items and why, the files changed, the checks actually run, and the
proposed commit sequence. If E17 is cancelled twice, quote the annotation and
stop retrying. If E16a shows a layout the resolver does not expect, stop and
report before writing code — that is a code round, not a docs round.
