# Round 28 research: what is still unknown, and what only looks unknown

**Read** 2026-11-24, against Muse Code 1.4.25, `@muse-code/sdk` 1.4.24,
opencode 2.4.1, and npm `@jonathand34/opencode-plugin-muse` 0.1.12. This file
records the source base for `round-28-plan.md`; the plan owns the work, this file
owns the citations.

Searches used Parallel and the vendor docs/generated protocol reference. GitHub
state was read with `gh` on the same day. No account was changed and no model
turn was spent.

## R1. E44 did not test the approval path it meant to test

**What round 27 did.** It started a served session with
`approvalMode: "onRequest"` and a fixture MCP server, asked the model to call an
`echo` tool, and saw the call complete with no `approval/requested`. It then
concluded that Muse offered no `localPersistent` choice for the bridge and that
the saved-rule question was unmeasured.

**What the vendor says.** A new session starts in the **Auto-review** permission
profile, not Ask me. Auto-review is the same access as Ask me "with an automated
reviewer deciding eligible approval requests"; Ask me sends every eligible
request to the person. The profile is selected separately from the approval mode
([permissions](https://dev.meta.ai/docs/muse-code/permissions); 1.4.6 changelog:
"New sessions start in the Auto-review permission profile"). Ask me is the
built-in id `:ask-me`; Auto-review is `:auto-review`
([session/setPermissionProfile](https://meta-models.github.io/muse-code-sdk/latest/generated/msp/methods/session-setpermissionprofile/)).

**Why that matters.** `onRequest` names the enforcement mode, not who reviews an
eligible request. The round-27 probe never selected `:ask-me`, so the judge was
free to clear the fixture's call. Its "no approval offered" result therefore
tests Auto-review plus a trivial echo tool, not the availability of MCP tool
approvals. The vendor's own guide says an MCP call prompts under on-request
unless a rule already allows it, and a tool annotated `readOnlyHint: true` is
admitted without a prompt
([MCP servers in plugins](https://meta-models.github.io/muse-code-sdk/latest/guides/plugins/concepts/mcp-servers/)).
The fixture declares no annotations, so it was not the read-only shortcut.

**Confidence.** High that the default profile explains the observation; medium
that `:ask-me` yields the approval on this exact bridge, because the store's
matcher is still unpublished. That is exactly what a revised E48 measures.

**Consequence.** Do not edit the round-27 evidence file to turn a negative into
a positive. Add the missing condition to the current docs, then run E48 with
`:ask-me` and `requirePermissionProfile: true`. If the host refuses the profile,
that is the result, not a reason to fall back to Auto-review silently.

## R2. MCP tools sit outside the sandbox; this is a documentation fact

The vendor is explicit: MCP tools are not sandboxed. "Unlike shell commands, an
MCP server runs as an ordinary child process (stdio) or a direct network
connection, outside the filesystem and network sandbox. Approval still applies,
but containment does not"
([MCP servers](https://dev.meta.ai/docs/muse-code/extending)). A tool whose
server declares `readOnlyHint: true` is admitted without a prompt under
on-request, and any explicit deny or prompt rule still wins. The hint is the
server's claim about itself, not an enforcement boundary
([MCP tool annotations](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations)).

This supports the existing README sentence that the plugin's promise is
visibility and vetoability, not containment. It also means an approval-posture
change (O16) cannot be sold as a sandbox: it changes who may ask for a call, not
what a granted MCP server can do.

## R3. The Windows job-object result is a runner result, not a desktop guarantee

E45 read `IsProcessInJob` for the fixture host and its detached grandchild on
`windows-latest` and found both `inJob: true`. Microsoft's contract explains the
mechanism and its limit:

- a child created by a process in a job is in that job by default;
- `JOB_OBJECT_LIMIT_BREAKAWAY_OK` lets a child created with
  `CREATE_BREAKAWAY_FROM_JOB` leave;
- `JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK` lets every child leave without the flag;
- `IsProcessInJob` is how a caller asks whether a process is in a job
  ([Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects),
  [Nested Jobs](https://learn.microsoft.com/en-us/windows/win32/procthread/nested-jobs)).

On a hosted runner, the runner's job object is the plausible reaper. On a
desktop, the process may be in no job at all, or in the terminal's job, and the
SDK's Windows close path is child-only. So E45 closes the runner question and
does not close the desktop one. The plan keeps O17 at best-effort until E50 has
a desktop JSON.

Platform-support norms agree that CI is not qualification: a CI matrix "proves
the suite" and a support tier claims "release-tested" behavior. A project that
has only a runner should say best-effort, not supported
([one support policy example](https://github.com/FGLabs-dev/Blueprints/blob/develop/docs/support-policy.md);
[Maka's Windows baseline](https://github.com/openapphub/maka-agent/blob/main/docs/windows-support.md)).

## R4. Console attribution has a documented answer and an unmeasured build

opencode's docs say a Console workspace compiles its Providers/Tools policies
into regular `policies` statements and that "Denials from these statements name
the workspace: `Blocked by Acme's policy`"
([Policies](https://opencode.ai/v2/docs/policies)). E37 measured the statement
inside `debug config`'s `document` source, the same source a local file uses, and
no Console-typed source. `anomalyco/opencode#60252` ("Add strict validation for
policy entries") is still **open** on 2026-11-24, updated 2026-10-29, so the
vendor-side diagnostic gap is unchanged. `#59880` (canonical inheritance) is also
still open.

E43's local control showed a `provider.use` deny surfaces at model selection as
`Model unavailable: deepseek/deepseek-flash`, not a policy sentence. Whether a
Console-compiled denial names the workspace on this build is still unmeasured.
E49 is the one-read/two-command experiment that settles it if the browser session
exists; no new API is assumed.

## R5. Native history is a policy choice, not a measured saving

Caching literature is strongly positive about reusing a long prefix: agent loops
read a median 84% of input from cache, and cache misses deep in a session are
expensive ([Anthropic cost guide](https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence);
[Neuralwatt harness measurements](https://portal.neuralwatt.com/news/why-harnesses-matter-for-energy-efficiency)).
That is evidence about caching in general, not about this plugin's native
history under a flat subscription.

The repo's own 44-turn sweep found no attributable saving, and `muse usage`
reports account-wide percentages that a turn does not move. The native session is
a cache, and the digest is the fallback; the feature is already opt-in. Nothing
in this round justifies changing the default, and a new benchmark would spend
turns to answer a question the subscription cannot price. O19 keeps it opt-in.

## R6. The release question is real, and it is not an experiment

npm's latest is **0.1.12**. The tree carries patches 3–5, which no published
tarball carries; `docs/provenance.md` records a build hash for `bcfabcb` and says
`scripts/repro.sh` fails today because that hash predates the working tree. The
README says the same in fewer words. A 0.1.13 release is therefore a product
choice with a release checklist, not a measurement.

What can be checked without publishing: the package manifest, the files list,
the published README's version claims, and a dry-run pack after an explicit
decision to rebuild `dist`. `npm publish --dry-run` neither publishes nor tags,
but it still reads the built tree; it is release work, so O15 gates it.

## R7. What the round can and cannot close

| Question | Can this round close it? | Condition |
|---|---|---|
| Does an MCP tool approval exist under Ask me? | Yes | E48 selects `:ask-me` and records the request |
| Does a saved MCP rule survive into `denyUnmatched`? | Yes, if E48 gets a menu | Same workspace, second session, store readable |
| Does a Console denial name the workspace? | Yes, if a browser session exists | E49; otherwise blocked |
| Does a Windows desktop survive install, UAC, sign-in and close? | Only with the owner's machine | E50 |
| Should 0.1.13 ship? | No; it is a choice | O15 after the release checklist |
| Is native history worth defaulting on? | No | Keep opt-in; no new measurement |
| Is a granted MCP server contained? | No, and the vendor says it is not | Documentation only |
