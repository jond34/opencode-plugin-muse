import { Model, Plugin, Provider } from "@opencode/plugin";
import { MuseHarnessAdapter } from "./adapter.js";
import { buildEffortCatalog } from "./effort.js";
import { fingerprintCompactionOutput } from "./fingerprint.js";
import { writeMuseHostConfig, type HostConfigPaths } from "./host-config.js";
import { CONTRIBUTOR_SUFFIX } from "./host.js";
import { HEADERS, MuseLanguageModel } from "./language-model.js";
import { makeCompactionDigest, makeLocalTitle } from "./meta.js";
import { MuseSessionRegistry, type SessionStore } from "./session-registry.js";
import { setGlobalRegistry } from "./shared.js";

export const PLUGIN_ID = "opencode-muse";
export const PROVIDER_ID = "muse";
export const PROVIDER_NAME = "Muse Code";
export const PROVIDER_PACKAGE = "aisdk:muse";
/** Models.dev's canonical provider for the Muse models; also the GUI icon. */
const PROVIDER_CANONICAL = "meta";
const MODEL_FAMILY = "muse";
/**
 * OpenChamber treats a provider as having credentials when `settings.apiKey`
 * is non-empty, which is what keeps its Providers page from hiding the model
 * list. Muse Code authenticates in its own CLI, so the key is a placeholder;
 * the plugin supplies the AI SDK and never sends it to Muse.
 */
const PROVIDER_API_KEY = "muse-code";

const AGENT_OPTION = "museAgent";
const INSTRUCTIONS_OPTION = "museInstructions";

/** Presentation names for the catalog rows, whose `displayLabel` is the id. */
const MODEL_NAMES: Readonly<Record<string, string>> = {
  "muse-wonder-1.0": "Muse Wonder",
  "muse-ember-1.0": "Muse Ember",
  "muse-spark-1.3": "Muse Spark 1.3",
  "muse-spark-1.2": "Muse Spark 1.2",
};

const EXCLUDED_INSTRUCTIONS = new Set(["core/date", "core/environment", "core/codemode"]);

interface SystemPart {
  readonly text: string;
  readonly metadata?: unknown;
}

/**
 * OpenCode's own instruction files, excluding what Muse supplies itself (the
 * date and environment). The first system part is OpenCode's stock prompt,
 * which Muse does not need; only the instruction sources OpenCode loaded are
 * forwarded.
 */
function instructionsText(system: ReadonlyArray<SystemPart>): string {
  const texts: string[] = [];
  for (const part of system.slice(1)) {
    const metadata = part.metadata as
      | { experimental?: { instructions?: ReadonlyArray<{ key: string; text: string }> } }
      | undefined;
    const instructions = metadata?.experimental?.instructions;
    if (instructions === undefined) {
      // A part without instruction metadata is still forwarded text; dropping
      // it would silently lose part of OpenCode's prompt.
      if (part.text.length > 0) texts.push(part.text);
      continue;
    }
    for (const source of instructions) {
      if (EXCLUDED_INSTRUCTIONS.has(source.key)) continue;
      texts.push(source.text);
    }
  }
  return texts.join("\n\n");
}

export function toModelInfo(providerID: ReturnType<typeof Provider.ID.make>, model: Record<string, unknown>) {
  const modelId = String(model.modelId ?? "");
  const base = Model.Info.default(providerID, Model.ID.make(modelId));
  const contextLimit = typeof model.contextLimit === "number" ? model.contextLimit : 1_048_576;
  const outputLimit = typeof model.outputLimit === "number" ? model.outputLimit : 8_192;
  const variants = Array.isArray(model.variants) ? model.variants : [];
  const displayLabel = typeof model.displayLabel === "string" ? model.displayLabel : modelId;
  const released = typeof model.releaseDate === "string" ? Date.parse(model.releaseDate) : Number.NaN;
  const isContributor = modelId.endsWith(CONTRIBUTOR_SUFFIX);
  const baseId = isContributor ? modelId.slice(0, -CONTRIBUTOR_SUFFIX.length) : modelId;
  return {
    ...base,
    modelID: Model.ID.make(modelId),
    name: isContributor
      ? `${MODEL_NAMES[baseId] ?? baseId} Contributor`
      : MODEL_NAMES[baseId] ?? displayLabel,
    family: Model.Family.make(MODEL_FAMILY),
    capabilities: { tools: true, input: ["text", "image"], output: ["text"] },
    variants: variants.map((variant) => ({ id: Model.VariantID.make(String(variant)) })),
    time: { released: Number.isFinite(released) && released > 0 ? released : 0 },
    limit: { context: contextLimit, output: outputLimit },
  };
}

/**
 * OpenCode plugin entrypoint.
 *
 * Registers the `muse` provider and supplies its AI SDK. OpenCode owns the
 * agent loop; Muse is the language model, and OpenCode's tools reach Muse
 * through the harness tool bridge.
 */
export const MusePlugin = Plugin.define({
  id: PLUGIN_ID,
  async setup(ctx) {
    // Muse reads its prompt and toolset from settings.json at startup, so the
    // only way to keep it to inference is a private config dir: the file pins
    // the toolset to the bridge and replaces Muse's own base prompt. Without
    // it, Muse's built-in tools and any MCP servers in the user's Muse config
    // answer inside Muse's own loop, bypassing OpenCode's permissions and
    // history.
    const museBin = process.env.MUSE_BIN ?? "muse";
    let hostConfig: HostConfigPaths | undefined;
    try {
      hostConfig = await writeMuseHostConfig({ museBin });
    } catch (error) {
      // A session that runs without containment beats one that cannot start,
      // so the old preset remains the fallback. It hides the session's own
      // built-in tools but not MCP servers from the user's Muse config.
      console.warn("[opencode-muse] private Muse config failed; falling back to the empty preset:", error);
    }
    // A preset set by the user wins; otherwise the private config is the
    // containment channel, and `empty` is only the fallback when it failed.
    const preset = process.env.MUSE_PRESET;
    const adapter = new MuseHarnessAdapter({
      hostOptions: {
        museBin,
        ...(preset !== undefined
          ? { preset }
          : hostConfig === undefined
            ? { preset: "empty" }
            : { env: { ...process.env, XDG_CONFIG_HOME: hostConfig.xdg } }),
        // With the `empty` preset Muse turns contributor mode on, which routes
        // every model to its `-contributor` variant; a model without one
        // (ember) then fails. Off keeps the model id authoritative, so both the
        // base entry and the contributor entry work.
        contributorMode: process.env.MUSE_CONTRIBUTOR_MODE === "on" ? "on" : "off",
        trustWorkspace: true,
      },
    });
    const store: SessionStore = {
      get: async (key) => {
        const value = await ctx.storage.get(key);
        return typeof value === "string" ? value : undefined;
      },
      set: async (key, value) => {
        await ctx.storage.set(key, value);
      },
    };
    const registry = new MuseSessionRegistry(adapter, store);
    setGlobalRegistry(registry);

    const providerID = Provider.ID.make(PROVIDER_ID);

    let models: Array<Record<string, unknown>> = [];
    try {
      models = await registry.listModels();
    } catch (error) {
      console.warn("[opencode-muse] model discovery failed:", error);
    }
    const modelInfos = models.map((model) => toModelInfo(providerID, model));
    const efforts = buildEffortCatalog(models);

    await ctx.provider.transform((editor) => {
      editor.add({
        info: {
          ...Provider.Info.empty(providerID),
          name: PROVIDER_NAME,
          activation: "enabled",
          package: PROVIDER_PACKAGE,
          canonical: Provider.ID.make(PROVIDER_CANONICAL),
          settings: { apiKey: PROVIDER_API_KEY },
        },
        models: modelInfos,
      });
    });

    // Supply the AI SDK for the provider: OpenCode calls this instead of
    // loading a package from npm.
    await ctx.aisdk.hook(
      "sdk",
      (event) => {
        event.sdk = {
          languageModel: (modelID: string) =>
            new MuseLanguageModel(
              modelID,
              event.options,
              registry,
              event.model.canonical ?? event.model.providerID,
              efforts,
            ),
        };
      },
      { providerID },
    );

    // Tag every request with the session, directory, and fork lineage.
    await ctx.session.hook(
      "model.request",
      async (event) => {
        if (event.model.providerID !== PROVIDER_ID) return;
        const variant = (event.model as { variant?: unknown }).variant;
        if (typeof variant === "string" && variant.length > 0) {
          event.headers[HEADERS.variant] = variant;
        } else {
          delete event.headers[HEADERS.variant];
        }
        event.headers[HEADERS.kind] = event.kind;
        if (event.kind !== "primary") return;
        event.headers[HEADERS.session] = event.sessionID;
        try {
          const session = await ctx.session.get({ sessionID: event.sessionID });
          event.headers[HEADERS.directory] = session.location.directory;
          const fork = (session as { fork?: { sessionID?: string } }).fork;
          if (fork?.sessionID) event.headers[HEADERS.forkSource] = fork.sessionID;
        } catch {
          // Keep the default directory.
        }
      },
      { providerID },
    );

    // Muse retries model failures itself. Replaying the whole turn here would
    // also retry permanent errors, and the native turn cannot survive a replay.
    await ctx.session.hook(
      "retry",
      async (event) => {
        event.decision = { retry: false };
      },
      { providerID },
    );

    // Forward the agent role and OpenCode's instruction files.
    const forwardAgentContext = async (event: {
      agent: Parameters<typeof ctx.agent.get>[0]["agentID"];
      system: ReadonlyArray<SystemPart>;
      options: Record<string, unknown>;
    }) => {
      const agent = await ctx.agent.get({ agentID: event.agent });
      event.options[AGENT_OPTION] = agent.data.system ?? "";
      event.options[INSTRUCTIONS_OPTION] = instructionsText(event.system);
    };
    for (const kind of ["context", "generate"] as const) {
      await ctx.session.hook(kind, forwardAgentContext, { providerID });
    }

    // Compaction is answered locally: opencode owns the history, and the
    // digest is deterministic, so no Muse turn is spent on a summary. The
    // digest's fingerprint is recorded so a later prompt that carries it is
    // recognized as a compaction instead of an unexplained rewrite.
    await ctx.session.hook(
      "compaction",
      async (event) => {
        await forwardAgentContext(event);
        const budget =
          typeof event.options.maxOutputTokens === "number"
            ? event.options.maxOutputTokens
            : undefined;
        const summary = makeCompactionDigest(
          event.messages as unknown as Parameters<typeof makeCompactionDigest>[0],
          budget,
        );
        await registry.recordCompaction(String(event.sessionID), fingerprintCompactionOutput(summary));
        event.result = { summary };
      },
      { providerID },
    );

    // Titles are a local derivation of the first user message. Muse has no
    // title model, and a title request must never open a native turn.
    await ctx.session.hook(
      "title",
      async (event) => {
        event.result = makeLocalTitle(event.messages);
      },
      { providerID },
    );

    return async () => {
      await registry.closeAll();
      await adapter.close();
      hostConfig?.remove();
    };
  },
});

export default MusePlugin;
