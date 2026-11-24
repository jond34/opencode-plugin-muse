# How inference providers get driven from other harnesses

**Written** 2026-11-22. Research pass, not a decision record. Sources are dated
because this landscape moved twice in 2026 alone.

Purpose: step outside the Muse case and see which integration shapes exist for
"provider X's model or agent, driven from harness Y", which ones survive, and
where this plugin's choices sit relative to them.

---

## 1. The two axes that actually decide the shape

Every integration in the survey resolves to a cell on two axes. Everything else
(pricing, tool surface, transcript) follows from them.

**Axis A — who runs the agent loop.** The harness, or the provider's agent.

**Axis B — what authenticates.** A metered API key, a user's subscription
through a surface the provider controls, or a credential the integrator
interposes (unofficial).

| | Harness owns loop | Provider agent owns loop |
|---|---|---|
| **API key (metered)** | Client SDK / raw API. Anthropic "Client SDK", OpenAI Responses, every harness's normal provider path | Provider agent SDK with a key: Claude Agent SDK, Codex SDK, Copilot SDK (BYOK) |
| **User subscription, provider-controlled surface** | *(nearly empty)* — Zed has no direct Claude Pro/Max LLM path | Official CLI as subprocess; ACP; MSP + `muse serve`; Managed Agents |
| **Interposed credentials (unofficial)** | OAuth proxies and harness plugins | Proxy in front of an agent CLI |

The upper-right cell is where 2026 pushed almost everything. The lower-left cell
is a dead end by policy, and the lower-right cell is what the community built to
get there anyway.

---

## 2. The seven shapes, with evidence

### S1 — Client SDK, harness owns everything

Harness calls the model API directly; it owns loop, tools, transcript,
permissions, recovery. Anthropic names this **Client SDK** and describes it as
"call the Claude API directly from your own code"
(`code.claude.com/docs/en/agent-sdk/overview`, 2026-11-12). Every harness's
provider list is this shape.

Sanctioned and metered. The only shape with no policy risk. The cost: the
provider contributes inference only.

### S2 — Provider agent SDK, embedded in your process

The SDK is a supervisor for the provider's own agent, not a model client.

- **Claude Agent SDK**: "When your code calls `query()`, the SDK spawns a
  separate `claude` CLI process and talks to it over stdio"
  (`code.claude.com/docs/en/agent-sdk/hosting`, 2026-11-19). Hosting guidance is
  explicit that a `SessionStore` "is required for this pattern, not optional".
- **Codex SDK**: "The Python SDK controls the local Codex app-server over
  JSON-RPC", and the app-server is documented as the way to "build custom clients
  that handle authentication" (`developers.openai.com/codex/sdk`).
- **Copilot SDK**: GA 2026-06-02, "a GitHub Copilot subscription is required to
  use the GitHub Copilot SDK, unless you are using BYOK".

The recurring architecture is identical: **a vendor-owned agent process, driven
over JSON-RPC/stdio, with the integrator supervising lifecycle and supplying
configuration.** Two of the three are subprocess supervisors, not libraries.

### S3 — The official CLI as a subprocess ("harness" pattern)

The integrator runs the vendor's published binary and gives up its own tools.

Docker Agent's `claude-code` harness documents the trade precisely
(`docs.docker.com/ai/docker-agent/features/harnesses`):

- "The external CLI drives the coding loop while Docker Agent provides
  orchestration";
- "Any `toolsets:` defined on a harness agent are silently ignored. The external
  CLI provides its own tools";
- "runs the official CLI with the CLI's own login. A Claude subscription sign-in
  is all it needs";
- "Docker Agent never reads, copies, or stores the CLI's tokens; it only launches
  `claude`, which authenticates itself";
- and the losses are stated plainly: no native budget enforcement, no compaction
  of the CLI's conversation, no mid-turn steering.

This is the most policy-durable subscription shape, and the most honest about
what the integrator loses.

### S4 — Protocol bridge (ACP)

The agent owns the loop; the client supplies editor primitives and receives an
event stream. Gemini CLI ships `--acp` "designed for programmatic control,
primarily for IDE and other developer tool integrations"
(`geminicli.com/docs/cli/acp-mode`). Zed's registry lists Claude Agent "via Zed's
SDK adapter" (`zed-industries/claude-agent-acp`), plus Codex CLI, Copilot CLI and
OpenCode; Google ships an `antigravity-acp` binary that users launch inside any
ACP client.

The pattern that repeats: **the vendor builds the protocol surface and the
adapter, and third parties stop building bridges.**

### S5 — Provider-hosted agent (managed)

Anthropic lists **Managed Agents**: "Have Anthropic host the agent, configured
through the Claude API". The provider owns everything including runtime. The
integrator becomes a UI.

### S6 — Credential interposition (unofficial, fragile)

Proxies and plugins that put a subscription credential where an API key is
expected:

- `claude-auth-proxy`, `openclaw-claude-proxy`, `vellum-oauth-proxy`,
  `claude-code-proxy` — local reverse proxies over `claude login` credentials;
- `opencode-anthropic-auth`, `opencode-claude-max-plugin`,
  `opencode-claude-subscription`, `opencode-anthropic`, and forks — harness
  plugins that restore Anthropic OAuth;
- `dsh-codex` / `dsh-codex-oauth` — DeepSeek Harness plugins that read Codex
  CLI's stored login.

The most candid of them states both the mechanism and the limit: the proxy keeps
the caller's loop ("openclaw keeps its own tool-execution loop"), and its own
usage guidance is "development and prototyping", "unblocking in-flight work",
"personal productivity … no users, no service, no scale", and for anything else:
"**don't**" (`openclaw-claude-proxy`).

### S7 — Provider-blessed partnership

The vendor publishes support for a named harness instead of tolerating it:
GitHub's changelog "GitHub Copilot now supports OpenCode" (2026-01-16), with
`/connect` and GitHub device login "through a formal partnership". The same
document pattern appears in Zed's subscription matrix, where each provider row
states which integration mode that subscription is valid for.

---

## 3. What the providers actually permit

This is the part that changed, and the part that decides which shapes are durable.

**Anthropic**, `code.claude.com/docs/en/legal-and-compliance` (2026-10-30):

- OAuth is "intended exclusively for purchasers of Claude Free, Pro, Max, Ultra,
  Team, and Enterprise subscription plans and … ordinary use of Claude Code and
  other native Anthropic applications";
- "Anthropic does not permit third-party developers to offer Claude.ai login into
  their own applications, or to route requests through Free, Pro, Max, or Ultra
  plan credentials on behalf of their users. Moreover, developers may not
  collect, store, or intermediate Claude.ai credentials or session tokens";
- **but**: "Nor does it prevent an end user from signing in to the unmodified
  Claude Code binary with their own Claude subscription, including where a
  platform hosts Claude Code";
- hosting requires the binary unmodified, per-user auth, and no resale or
  intermediation.

**Google**, Gemini CLI FAQ: third-party use of Gemini CLI's OAuth "is a direct
violation", and "the supported and secure method is to use a Vertex AI or Google
AI Studio API key". Google nonetheless ships `--acp` and `antigravity-acp` — the
sanctioned escape hatch is always the vendor's own binary.

**OpenAI**, "Sign in with ChatGPT": plan usage is offered for "open-source and
locally hosted apps", with host identifiers registered in the OAuth flow, and
"paid or remotely hosted apps must complete an interest form".

**Muse** (this repo's own finding, 2026-10-29): non-builtin tool schemas are
refused with `403 client_attestation_denied`; sanctioned surfaces are `muse exec`,
`muse serve` (MSP), and `@muse-code/sdk`.

The 2026 chronology, from the reporting: Anthropic cracked down on third-party
harnesses (VentureBeat, 2026-01-09); OpenCode V2 removed Anthropic OAuth "after a
legal request from Anthropic" (per the `opencode-anthropic` plugin README); in
April subscribers were told third-party usage would be billed extra (TechCrunch,
2026-04-04); in June Anthropic **paused** those changes and said "third-party app
usage still draws from your subscription limits"; in October it added monthly API
credits to Max/Ultra/Team instead of repricing plan usage.

**Read that sequence as a trend, not a stable rule.** The direction is:
attestation, host identity, official binary, named partnership. Not API keys
only, and not OAuth reuse.

---

## 4. Where this plugin sits

The plugin's cell is unusual and worth naming precisely.

| Property | This plugin (MSP) | Nearest neighbour |
|---|---|---|
| Loop owner | **Muse host** (`turn/start` → host streams `toolCall` → `turn/completed`) | Codex app-server, Claude Agent SDK |
| Tool execution | **Harness** (tool bridge calls back into opencode tools) | Nobody in the survey exactly; ACP's client supplies fs/terminal, not a full tool registry |
| Transcript / history | Harness | S1 only |
| Permissions | Split: `allowAll` on the Muse side, opencode's engine for opencode tools | ACP sends permission requests *to* the client instead |
| Auth | User's own subscription, via the vendor's sanctioned surface, attested | Docker Agent's official-CLI harness |
| Metering | Flat-rate; `muse usage` is the only truth | Same as any subscription shape |

Three consequences:

1. **It is not "harness owns the loop".** The README says "opencode keeps the
   loop, the tools, the transcript, permissions, and history". The tools,
   transcript and history are opencode's; the loop is the Muse host's. The
   landscape makes this the single most load-bearing sentence in the docs,
   because it is the axis every other integration is classified on. `muse acp`
   also puts the loop in the vendor agent — the real differentiator is tool
   surface and transcript ownership, which `seam-review.md` §14 already says.
2. **The hybrid is defensible but needs a stated authority order.** Vendor loop
   plus harness tools plus `allowAll` means two permission systems where one is
   silently the fence. ACP chose the opposite direction (agent asks client).
   Either choice is legitimate; an unstated one is a support burden.
3. **S2/S3 is a mainstream architecture.** Spawning a vendor agent and speaking
   JSON-RPC to it is exactly what Claude Agent SDK and Codex SDK do. The plugin
   is not doing something exotic; it is doing the standard thing for a
   subscription-funded provider.

---

## 5. Patterns: leaning towards, against, missing

### Leaning towards — validated by the landscape

- **Vendor agent as a supervised subprocess with a typed protocol.** Same shape
  as the two largest commercial agent SDKs. Keep it.
- **Never interposing credentials.** No proxy, no token store, no shared host.
  This is the line Anthropic draws hardest ("may not collect, store, or
  intermediate"), and the line Docker Agent advertises as its safety property.
  The plugin is a passenger on the user's own signed-in CLI, which is the shape
  providers permit.
- **No ACP shim.** Google and Anthropic both converge on "the vendor's own
  binary is the escape hatch"; `muse acp` is that binary.
- **Flat-rate accounting, tokens not USD.** Nothing in the survey invents a
  better allowance read than the provider's own command.
- **Durable session state as the source of truth.** Anthropic: the store "is
  required for this pattern, not optional". MSP's log-as-session is the same
  conclusion reached independently.

### Leaning against — worth a second look

- **Subscription as the *only* auth path.** Every provider in the survey reserves
  the right to reprice or gate subscription usage in third-party contexts, and
  Anthropic exercised it twice in six months. A plugin with no BYOK path has a
  single point of failure that the vendor controls and the user cannot route
  around. S2 answers the *economics* question ("don't use a plugin to spend API
  tokens") but not the *continuity* question ("what happens the week attestation
  changes").
- **Treating `allowAll` as a permanent solution rather than a fence.** It is
  fenced correctly, but ACP's permission-request direction exists because users
  do want to see vendor-side approvals. This is already recorded as A20; the
  landscape just says the opposite design is the popular one.
- **No capability discovery surface.** ACP advertises capabilities at
  `initialize` and per-session config options; MSP relies on handshake probing.
  Not wrong, but it means every capability question becomes a research task
  (see E5).

### Missing — patterns with no equivalent here

- **A BYOK fallback path.** Not for pay-as-you-go users (S2 is right that they
  should use the key directly elsewhere) but for *this plugin's* resilience: if
  attestation denies, the session currently dies with an error rather than
  degrading. Every mature harness keeps an API-key lane open.
- **A host-identity story.** OpenAI registers host identifiers; Anthropic
  requires commercial terms to host. The plugin inherits the CLI's attestation,
  which works only while the CLI is the one talking to the vendor — fine today,
  but there is no written answer to "what if Muse asks integrators to identify
  themselves".
- **An official-partnership channel (S7).** The Copilot/OpenCode changelog is the
  highest-leverage event in this whole landscape: it converted a tolerated
  integration into a supported one. Nothing equivalent exists for Muse +
  opencode.
- *(Deliberately not missing)* Managed hosting (S5) and ACP server mode (S4).
  Both contradict S3 and would duplicate the vendor's front door.

---

## 6. Recommendations, in order

1. Fix the loop-ownership sentence in the README. It is the axis the entire
   ecosystem classifies on, and it is currently wrong in the direction that
   flatters the plugin.
2. Decide the BYOK question explicitly, even if the answer stays "no": record
   whether an attestation denial degrades or fails, and why.
3. State the authority order between `allowAll` and opencode's permissions in one
   user-facing sentence, not only in `steady-state.md` A20.
4. Ask the vendor for a support statement. It costs nothing and it is the only
   move in the survey that changes the integration's category.

---

## 7. Open questions

- Whether OpenAI's interest-form path has produced public examples of approved
  hosted apps (not searched).
- Whether the April 2026 Anthropic "rebilling" ever took effect for any cohort;
  reporting and the later support article disagree in tone, and the June update
  says the changes were paused.
- Whether `muse acp` is itself attested differently from `muse serve` on the same
  account. One prompt attempt returned `modelError`, so this is untested.
