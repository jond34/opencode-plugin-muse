# Muse options for OpenCode

A dated comparison of the OpenCode plugins that spend a Muse Code subscription.
Each row links to that project's own README, and the notes say what its README
states. `verified 2026-11-24`; corrections welcome through
[this repository's issues](https://github.com/jond34/opencode-plugin-muse/issues).

The rows are grouped by where the credential lives and who executes tools, not
ranked. Read the linked README before choosing; features and versions move.

| Project | Credential boundary | Who executes tools | Tested host pair | Package / install | Notes |
|---|---|---|---|---|---|
| [Muse Bridge for OpenCode](https://github.com/jond34/opencode-plugin-muse/blob/main/README.md) (this package) | Plugin spawns the signed-in `muse serve` host; no Muse credential reaches the plugin or opencode; the API key opencode sees is a placeholder. | opencode executes every bridged call; Muse's built-in tools, workflows, and subagents are off. | opencode 2.4.1 / Muse CLI 1.4.25 (X9a and X9b) | `opencode plugin add @jonathand34/opencode-plugin-muse` | Republished upstream plus patches 1-5 and a `/connect` row; SLSA provenance attestation and immutable GitHub Releases from `v1.0.0`. verified 2026-11-24 |
| [pgquiles/opencode-muse](https://github.com/pgquiles/opencode-muse/blob/main/README.md) | CLI-mediated through `muse serve`; README states no subscription credential is extracted, cached, or injected into OpenCode. | Muse's own tools by default; `OPENCODE_MUSE_TOOL_BACKEND=opencode` moves tool execution to opencode. | Muse CLI 1.4.12, 1.4.13, 1.4.14, 1.4.20; opencode 2.0.32 and 2.2.5 appear in the README's probes | `"plugins": ["opencode-muse@1.1.0"]` | Contributor lane by default with an opt-out; conversational Muse approvals; PDF, audio, and video attachments. verified 2026-11-24 |
| [jaylamping/open-muse](https://github.com/jaylamping/open-muse/blob/main/README.md) | Local OpenAI-compatible proxy drives `muse serve` under the CLI's own sign-in; README states no API key. | Muse's agent runs with its own sandboxed tools; tool activity streams back to opencode. | opencode 1.18.30 and 2.0.27 / Muse CLI 1.4.6, on Windows and macOS | `"plugins": [{ "package": "open-muse" }]` on 2.x; `"plugin": ["open-muse"]` on 1.x. A source build is also documented. No npm release found for `open-muse` on 2026-11-24. | Proxy-based design; README documents Windows sandbox setup. verified 2026-11-24 |
| [swalker326/opencode-muse-code](https://github.com/swalker326/opencode-muse-code/blob/main/README.md) | Reads the Muse CLI login or macOS keychain and mints an API key; requests go directly to `https://api.meta.ai/v1`. | opencode executes the tool calls the model returns. | opencode V2, tested on 2.0.8; Muse CLI version not stated | `opencode plugin add opencode-muse-code`; npm `opencode-muse-code@0.1.2` | Direct API path with the minted key; models discovered at startup and every 30 minutes. verified 2026-11-24 |
| [TheStreamCode/opencode-muse-auth](https://github.com/TheStreamCode/opencode-muse-auth/blob/main/README.md) | Device-code login mints a stable inference key into opencode's auth or integration store; the OAuth token stays in memory. | opencode executes tools; a loopback adapter rewrites tool names and parameters for the Model API. | opencode 2.2.4 or newer for inference through the adapter; no Muse CLI | `"plugins": ["opencode-muse-auth"]`; npm `opencode-muse-auth@0.5.2` | README warns that Meta may restrict or revoke account or credential access; its disclaimer is the source for that. verified 2026-11-24 |
| [rasyidrafi/opencode-muse](https://github.com/rasyidrafi/opencode-muse/blob/master/README.md) | CLI-mediated through `@muse-code/sdk` and `muse serve`. | opencode executes every tool call through a per-session MCP bridge; README documents `MUSE_PRESET=empty` for OpenCode-only tools. | opencode v2.2+ / Muse CLI 1.4.x; no single live pair stated | `opencode plugin add @rasyid_rafi/opencode-muse`; npm `@rasyid_rafi/opencode-muse@0.1.9` | Upstream project this package is republished from. verified 2026-11-24 |

## Reading the table

- **Credential boundary** is where the subscription credential stays. A
  CLI-mediated plugin lets `muse serve` make the request under its own sign-in;
  a direct-API plugin mints a key and calls the model endpoint itself.
- **Who executes tools** decides which permission system sees a tool call. With
  opencode executing, opencode's permission rules and history apply. With Muse
  executing, Muse's own approval and sandbox behavior applies.
- **Tested host pair** is copied from each README and is not re-run here. An
  absent exact pair means the README gives a range, not that the project is
  untested.

This page compares mechanisms, not quality. No row implies endorsement by Meta,
opencode, or the projects listed.
