import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Integration, Model, Plugin, Provider } from "@opencode/plugin";
import { MuseHarnessAdapter } from "./adapter.js";
import { checkAllowance } from "./allowance.js";
import { buildEffortCatalog } from "./effort.js";
import { fingerprintCompactionOutput } from "./fingerprint.js";
import { nativeHistoryEnabled } from "./flags.js";
import {
  containmentModeFromEnv,
  containmentVerdict,
  evaluateContainment,
  formatContainmentReport,
  type HostConfigFacts,
} from "./containment.js";
import { BRIDGE_TOOLSET, MUSE_REMINDERS, writeMuseHostConfig, type HostConfigPaths } from "./host-config.js";
import {
  describeHostFacts,
  hasSchemaDrift,
  schemaDriftWarning,
  sessionMcpGranted,
  strictHostRefusal,
  strictHostRequested,
  type HostFacts,
} from "./host-facts.js";
import {
  CONTRIBUTOR_SUFFIX,
  contributorModeFromEnv,
  museBinFailure,
  resolveMuseBinFromProcess,
  resolveSessionLog,
} from "./host.js";
import {
  AGENT_OPTION,
  HEADERS,
  INSTRUCTIONS_OPTION,
  MuseLanguageModel,
  PROVIDER_ID,
} from "./language-model.js";
import { resolveModelLimits } from "./model-limits.js";
import { parsePromptDelivery, promptProbeKey, type PromptDelivery } from "./prompt-policy.js";
import { makeCompactionDigest, makeLocalTitle, nativeCompactionResult, nativeWindowDigest } from "./meta.js";
import { probeMuseLogin } from "./login-status.js";
import { MUSE_INTEGRATION_ID, registerMuseIntegration } from "./registration.js";
import { MuseSessionRegistry, type SessionStore } from "./session-registry.js";
import { setGlobalRegistry } from "./shared.js";
import { appendLedgerRow } from "./usage-ledger.js";
import { probeToolsetObservation, sessionsRoot } from "./toolset-record.js";
import { packageVersion } from "./version.js";

/**
 * Repo-controlled files that workspace trust hands to Muse, relative to the
 * cwd: project hooks (commands Muse runs) and project skills (instructions
 * Muse loads into the prompt). Project rules are `AGENTS.md`/`CLAUDE.md`,
 * which opencode already reads for its own prompt.
 */
function workspaceTrustHazards(root: string): string[] {
  return [".muse/hooks.json", ".agents/skills", ".codex/skills", ".claude/skills"].filter(
    (relative) => existsSync(join(root, relative)),
  );
}

const ADAPTER_VERSION = packageVersion();
const CONTRACT_VERSION = "1";

const PLUGIN_ID = "opencode-muse";
const PROVIDER_NAME = "Muse Code";
const PROVIDER_PACKAGE = "aisdk:muse";
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

/** Presentation names for the catalog rows, whose `displayLabel` is the id. */
const MODEL_NAMES: Readonly<Record<string, string>> = {
  "muse-wonder-1.0": "Muse Wonder",
  "muse-ember-1.0": "Muse Ember",
  "muse-spark-1.3": "Muse Spark 1.3",
  "muse-spark-1.2": "Muse Spark 1.2",
};

/**
 * Instruction sources the plugin drops. Muse supplies its own date and
 * environment, so forwarding ours would duplicate them. `core/codemode` is
 * dropped while `execute` stays offered; N5 (2026-11-26) A/B'd that over five
 * paired tasks and saw zero `execute` calls in both conditions, so it changed no
 * tool choice on that sample. That is a ceiling, not a general result: every
 * task was a lookup, where `execute` was never the attractive choice. Kept
 * excluded; only re-open it with a task set where Code Mode is actually
 * tempting (multi-step loops), which N5 did not test.
 */
const EXCLUDED_INSTRUCTIONS = new Set(["core/date", "core/environment", "core/codemode"]);

/**
 * No per-token price, the way opencode treats its own subscription logins. A
 * Sign in with ChatGPT model gets `cost: []` (core/src/plugin/provider/
 * chatgpt.ts) and a first-party Claude Agent account gets `cost: []` too
 * (claude-agent/provider.ts: "A subscription covers usage ... so they show no
 * cost"). The picker renders nothing for an empty cost and "Free" only for a
 * non-empty all-zero tier, so zero would be a label that is false of the bill.
 * Muse bills the subscription, not the token; usage is surfaced by the
 * allowance notice instead.
 */
const NO_COST: Model.Info["cost"] = [];

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

/**
 * Model metadata for the provider catalog.
 *
 * Do not set `settings.compaction = native` here. opencode 2.3.2 validates
 * that setting while resolving a model and rejects AI SDK providers with
 * `UnsupportedCompactionError` before the compaction hook can answer. The
 * session compaction hook's `event.result` is checked first by core, so the
 * native window still reaches history without the model mark.
 */
export function toModelInfo(
  providerID: ReturnType<typeof Provider.ID.make>,
  model: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
) {
  const modelId = String(model.modelId ?? "");
  const base = Model.Info.default(providerID, Model.ID.make(modelId));
  const limits = resolveModelLimits(model, env);
  const contextLimit = limits.context.value;
  const outputLimit = limits.output.value;
  const variants = Array.isArray(model.variants) ? model.variants : [];
  const displayLabel = typeof model.displayLabel === "string" ? model.displayLabel : modelId;
  const released = typeof model.releaseDate === "string" ? Date.parse(model.releaseDate) : Number.NaN;
  const isContributor = modelId.endsWith(CONTRIBUTOR_SUFFIX);
  const baseId = isContributor ? modelId.slice(0, -CONTRIBUTOR_SUFFIX.length) : modelId;
  return {
    ...base,
    modelID: Model.ID.make(modelId),
    cost: NO_COST,
    name: isContributor
      ? `${MODEL_NAMES[baseId] ?? baseId} Contributor`
      : MODEL_NAMES[baseId] ?? displayLabel,
    family: Model.Family.make(MODEL_FAMILY),
    // Muse's protocol has no sampling field, so temperature is false ("does
    // not accept"), never unset ("unknown") - A10/P5. opencode then does not
    // offer a knob that cannot reach the model.
    capabilities: { tools: true, input: ["text", "image"], output: ["text"], temperature: false },
    variants: variants.map((variant) => ({ id: Model.VariantID.make(String(variant)) })),
    time: { released: Number.isFinite(released) && released > 0 ? released : 0 },
    limit: { context: contextLimit, output: outputLimit },
  };
}

/**
 * Text the `/connect` row carries when the CLI has no login. It names the
 * command, because "sign in required" alone leaves people guessing.
 */
const LOGIN_STATUS_MESSAGE = "Muse is not signed in. Run `muse login` in a terminal, then reconnect.";

/** How long the boot probe keeps waiting for the credential store to answer. */
const LOGIN_BOOT_RETRY_MS = 750;
const LOGIN_BOOT_RETRIES = 4;

/**
 * Report the Muse CLI's login state on the `/connect` row.
 *
 * The row's `external` method records a choice, not a credential (see
 * `registration.ts`), so opencode shows a green tick as soon as someone clicks
 * it. This asks the CLI itself — read-only, `muse usage --json` — and turns
 * "not logged in" into a connection status, which the TUI renders as "Sign in
 * required". A verdict of "unknown" changes nothing, so an offline laptop never
 * accuses a signed-in user.
 *
 * Best-effort throughout: nothing here may fail a start or a turn. Returns the
 * disposer that stops the watcher.
 */
function watchMuseLoginStatus(
  ctx: Plugin.Context,
  museBin: string,
): { readonly stop: () => void; readonly report: (signal: "auth" | "ok") => void } {
  const integration = ctx.integration;
  if (integration === undefined) return { stop: () => {}, report: () => {} };

  const abort = new AbortController();
  let probing = false;
  let again = false;
  /**
   * Which evidence is newest. A probe captures this before it starts; a turn
   * verdict bumps it. A probe that returns after a turn must not overwrite what
   * the turn just proved.
   */
  let verdictVersion = 0;
  let bootTimer: ReturnType<typeof setTimeout> | undefined;

  /** Write one verdict onto the row, skipping a write that changes nothing. */
  const apply = async (verdict: "signed-in" | "signed-out"): Promise<void> => {
    const connection = await integration.connection.active(MUSE_INTEGRATION_ID);
    // Without a connection there is no tick to correct; the row reads blank.
    if (connection === undefined) return;
    const wanted =
      verdict === "signed-out"
        ? ({ status: "needs_auth", message: LOGIN_STATUS_MESSAGE } as const)
        : undefined;
    const current = connection.status;
    // Rewriting the same status only republishes `integration.updated`.
    if (
      current === undefined
        ? wanted === undefined
        : wanted !== undefined && current.status === wanted.status && current.message === wanted.message
    ) {
      return;
    }
    await integration.connection.status({
      integrationID: MUSE_INTEGRATION_ID,
      connection,
      status: wanted,
    });
  };

  const probe = async (): Promise<void> => {
    const version = verdictVersion;
    const verdict = await probeMuseLogin(museBin, { signal: abort.signal });
    if (verdict === "unknown") return;
    // A turn verdict that arrived while the probe ran is newer evidence.
    if (version !== verdictVersion) return;
    await apply(verdict);
  };

  const sync = async (): Promise<void> => {
    // One probe at a time. An event during a probe asks for exactly one rerun,
    // which is what a connect does: the credential write and the row refresh
    // both arrive, and the second must not queue a third.
    if (probing) {
      again = true;
      return;
    }
    probing = true;
    try {
      do {
        again = false;
        await probe();
      } while (again && !abort.signal.aborted);
    } catch (error) {
      console.warn("[opencode-muse] could not report the Muse login state:", error);
    } finally {
      probing = false;
    }
  };

  // A login saved in an earlier session is the common case, and the credential
  // store may not answer on the first read, so retry the cheap lookup before
  // paying for a probe. The probe itself runs only once a connection exists.
  const boot = async (attempt: number): Promise<void> => {
    if (abort.signal.aborted) return;
    const connection = await integration.connection
      .active(MUSE_INTEGRATION_ID)
      .catch(() => undefined);
    if (connection !== undefined) {
      void sync();
      return;
    }
    if (attempt >= LOGIN_BOOT_RETRIES || abort.signal.aborted) return;
    bootTimer = setTimeout(() => void boot(attempt + 1), LOGIN_BOOT_RETRY_MS);
    // A pending retry must not keep a short-lived CLI alive.
    bootTimer.unref?.();
  };
  void boot(0);

  void (async () => {
    try {
      // `integration.updated` is deliberately absent: our own status write
      // publishes it. A connect creates a credential, which these events cover.
      for await (const _event of ctx.event.subscribe({
        types: ["credential.updated", "credential.switched"],
        signal: abort.signal,
      })) {
        void sync();
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        console.warn("[opencode-muse] Muse login watch stopped:", error);
      }
    }
  })();

  return {
    stop: () => {
      abort.abort();
      if (bootTimer !== undefined) clearTimeout(bootTimer);
    },
    /**
     * Apply what a turn already proved, without spending a probe. A turn that
     * failed for auth is the login itself refusing; a turn that finished is the
     * login working. Any other failure says nothing, so the row keeps its state.
     */
    report: (signal) => {
      // A turn verdict is newer than any probe already in flight; bumping the
      // version makes those probes discard their result when they return.
      verdictVersion += 1;
      void apply(signal === "auth" ? "signed-out" : "signed-in").catch((error) => {
        console.warn("[opencode-muse] could not report the Muse login state:", error);
      });
    },
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
    // Steps are ordered and each consumes what the one above discovered, so this
    // stays one function: a split would thread five values or add a context
    // object that exists to be passed. In order: 1 config dir (or `empty` when it
    // cannot be written), 2 adapter (host options, trust, contributor mode),
    // 3 session store + registry, 4 host handshake (drift, sessionMcp, strict
    // refusal), 5 model catalog + limits + efforts, 6 developer-prompt probe,
    // 7 containment treaty, 8 host ledger row, 9 provider transform + AI SDK hook,
    // 10 session hooks (request, retry, agent context, compaction, title),
    // 11 returned cleanup closure.

    // Muse reads its prompt and toolset from settings.json at startup, so the
    // only way to keep it to inference is a private config dir: the file pins
    // the toolset to the bridge and replaces Muse's own base prompt. Without
    // it, Muse's built-in tools and any MCP servers in the user's Muse config
    // answer inside Muse's own loop, bypassing OpenCode's permissions and
    // history.
    // On Windows the `muse` on PATH is a `.cmd` shim that Node refuses to
    // spawn, so resolve the native binary the installer put beside it first.
    // A failure here names MUSE_BIN and the file it looked for; Node's own
    // `EINVAL` names none of that.
    const resolvedMuse = resolveMuseBinFromProcess();
    const museBinFailureReason = museBinFailure(resolvedMuse);
    if (museBinFailureReason !== undefined) {
      throw new Error(`[opencode-muse] ${museBinFailureReason}`);
    }
    const museBin = resolvedMuse.command;
    let hostConfig: HostConfigPaths | undefined;
    try {
      hostConfig = await writeMuseHostConfig({ museBin });
    } catch (error) {
      // A session that runs without containment beats one that cannot start,
      // so the old preset remains the fallback. It hides the session's own
      // built-in tools but not MCP servers from the user's Muse config.
      console.warn("[opencode-muse] private Muse config failed; falling back to the empty preset:", error);
    }
    if (hostConfig?.diagnostics.skills === "failed") {
      // Skill activation is a best-effort second fence. When enumeration
      // fails, the control prompt still tells Muse to ignore the catalog, but
      // the lockdown itself is absent; say so instead of implying it worked.
      console.warn(
        "[opencode-muse] could not enumerate Muse skills; the control prompt is the fallback:",
        hostConfig.diagnostics.skillsError,
      );
    }
    // A preset set by the user wins; otherwise the private config is the
    // containment channel, and `empty` is only the fallback when it failed.
    const preset = process.env.MUSE_PRESET;
    // One resolved value per run, logged so a project entry that replaced the
    // options wholesale is visible rather than silent. Env wins: it is the
    // only form a repo config cannot erase.
    const sessionLog = resolveSessionLog(
      ctx.options as { readonly sessionLog?: unknown },
      process.env.MUSE_HOST_SESSION_LOG,
    );
    for (const warning of sessionLog.warnings) {
      console.warn(`[opencode-muse] ${warning}`);
    }
    console.info(`[opencode-muse] session log: ${sessionLog.enabled ? "on" : "off"} (${sessionLog.source})`);
    const adapter = new MuseHarnessAdapter({
      hostOptions: {
        museBin,
        sessionLog: sessionLog.enabled,
        ...(preset !== undefined
          ? { preset }
          : hostConfig === undefined
            ? { preset: "empty" }
            : { env: { ...process.env, XDG_CONFIG_HOME: hostConfig.xdg } }),
        // With the `empty` preset Muse turns contributor mode on, which routes
        // every model to its `-contributor` variant; a model without one
        // (ember) then fails. Off keeps the model id authoritative, so both the
        // base entry and the contributor entry work.
        contributorMode: contributorModeFromEnv(process.env.MUSE_CONTRIBUTOR_MODE),
        // Required: without it Muse withholds the per-session bridge server
        // (the host recorded "MCP startup withheld 1 server: workspace is
        // untrusted" when the flag was dropped, T1). Trust also loads the
        // repo's own hooks and rules, so the startup line below names them
        // instead of implying the workspace is contained.
        trustWorkspace: true,
      },
    });
    // Workspace trust is granted because the bridge requires it. Skills are
    // instructions and stay a warning; hooks are commands, and the gate that
    // refuses them runs where `hook/list` can be asked, at session start.
    const hazards = workspaceTrustHazards(process.cwd());
    const skills = hazards.filter((hazard) => hazard !== join(".muse", "hooks.json"));
    if (skills.length > 0) {
      console.warn(
        `[opencode-muse] workspace trust is granted because the bridge requires it; this repo also supplies ${skills.join(", ")}, which Muse loads into the prompt outside opencode's control`,
      );
    }
    if (hazards.includes(join(".muse", "hooks.json"))) {
      console.info(
        "[opencode-muse] this repo supplies .muse/hooks.json; a session opens only after those hooks are accepted (MUSE_ALLOW_PROJECT_HOOKS=1 for one run, or the doctor's --trust-hooks)",
      );
    }
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

    // The SDK already knows the served schema and every grant; keeping them
    // is what lets the containment report name drift instead of guessing.
    const containmentMode = containmentModeFromEnv();
    let hostFacts: HostFacts | undefined;
    try {
      hostFacts = await adapter.getHostFacts();
      console.info(`[opencode-muse] host ${describeHostFacts(hostFacts)}`);
      if (containmentMode !== "off") {
        if (hasSchemaDrift(hostFacts)) {
          console.warn(`[opencode-muse] ${schemaDriftWarning(hostFacts)}`);
        }
        if (!sessionMcpGranted(hostFacts)) {
          console.warn(
            "[opencode-muse] the host did not grant sessionMcp; the tool bridge cannot start.",
          );
        }
      }
    } catch (error) {
      console.warn("[opencode-muse] host handshake facts unavailable:", error);
    }
    if (strictHostRequested()) {
      const refusal = strictHostRefusal(hostFacts);
      if (refusal !== null) throw new Error(`MUSE_STRICT_HOST: ${refusal}`);
    }
    registry.setHostFingerprint(hostFacts?.schemaFingerprint ?? null);

    // Once per run, not per turn: a warning that repeats every step is noise,
    // and the window's reset stamp is what makes "once" meaningful. It cannot
    // block a start, and a host that cannot answer leaves it silent.
    void checkAllowance({ read: () => adapter.readUsage() });

    const providerID = Provider.ID.make(PROVIDER_ID);

    let models: Array<Record<string, unknown>> = [];
    try {
      models = await registry.listModels();
    } catch (error) {
      console.warn("[opencode-muse] model discovery failed:", error);
    }
    const modelInfos = models.map((model) => toModelInfo(providerID, model));
    if (models.length > 0) {
      const sources = models.map((model) => resolveModelLimits(model).context.source);
      const counts = new Map<string, number>();
      for (const source of sources) counts.set(source, (counts.get(source) ?? 0) + 1);
      console.info(
        `[opencode-muse] context limits: ${[...counts.entries()]
          .map(([source, count]) => `${source}=${count}`)
          .join(" ")}`,
      );
    }
    const efforts = buildEffortCatalog(models);

    // Prompt delivery is probed, never assumed. The probe is one tiny turn and
    // only runs when asked for, or when strict mode has no cached answer; a
    // command-line user should not pay for it on every startup.
    const probeKey = promptProbeKey(hostFacts?.schemaFingerprint ?? null);
    let promptDelivery: PromptDelivery = parsePromptDelivery(
      await ctx.storage.get(probeKey).catch(() => undefined),
    );
    const shouldProbe =
      process.env.MUSE_PROBE_PROMPT === "1" ||
      (containmentMode === "strict" && promptDelivery === "unknown");
    if (shouldProbe && promptDelivery === "unknown") {
      const canary = `muse-${randomUUID().slice(0, 8)}`;
      try {
        promptDelivery = (await registry.probeDeveloperPrompt(canary, String(models[0]?.modelId ?? "") || undefined))
          ? "pass"
          : "fail";
        await ctx.storage.set(probeKey, promptDelivery);
      } catch (error) {
        // No auth, no model, or a refused probe: unknown, and the preamble is
        // the fallback. Never fail plugin setup over an unproven optimization.
        console.warn("[opencode-muse] developer-prompt probe unavailable:", error);
        promptDelivery = "unknown";
      }
    }
    registry.setPromptDelivery(promptDelivery);
    registry.setContainmentMode(containmentMode);
    console.info(`[opencode-muse] developer prompt: ${promptDelivery}`);

    // The treaty is evaluated once, from observed facts, and printed in full
    // on request. Strict mode refuses to start on a critical unknown.
    const settings = hostConfig?.settings as
      | {
          run?: { toolset?: unknown };
          runtime_capabilities?: Record<string, { enabled?: unknown }>;
          context_compaction?: { soft_threshold?: unknown; hard_threshold?: unknown };
        }
      | undefined;
    const configFacts: HostConfigFacts = {
      privateConfig: hostConfig !== undefined,
      toolset:
        Array.isArray(settings?.run?.toolset) &&
        settings.run.toolset.includes(BRIDGE_TOOLSET[0] as string),
      // Configuration, not host behavior: those keys target the reminder
      // plugin, which a clean config does not install, so nothing attests that
      // Muse acted on the switch. The containment check is named for that.
      remindersConfiguredOff: MUSE_REMINDERS.every(
        (name) => settings?.runtime_capabilities?.[`plugin:tbh-reminders:reminder:${name}`]?.enabled === false,
      ),
      thresholds:
        typeof settings?.context_compaction?.hard_threshold === "number" &&
        settings.context_compaction.hard_threshold >= 0.99,
      skills: hostConfig?.diagnostics.skills ?? "unknown",
    };
    if (containmentMode !== "off") {
      const checks = evaluateContainment({
        facts: hostFacts ?? null,
        hostConfig: hostConfig === undefined ? null : configFacts,
        promptDelivery,
        capabilities: await adapter.getCapabilities(),
        // Read the host's own record when one exists; the config facts above
        // only say what we asked for.
        observedToolset: probeToolsetObservation(
          sessionsRoot({ museHome: hostFacts?.museHome }),
        ),
      });
      if (process.env.MUSE_DEBUG_CONTAINMENT === "1") {
        console.info(formatContainmentReport(checks));
      }
      const verdict = containmentVerdict(checks);
      if (containmentMode === "strict" && verdict.level === "blocked") {
        throw new Error(
          `MUSE_CONTAINMENT=strict: ${verdict.criticalFailures
            .map((entry) => `${entry.id}=${entry.status}`)
            .join(" ")}`,
        );
      }
      if (verdict.level !== "ok") {
        console.warn(
          `[opencode-muse] containment ${verdict.level}: ${checks
            .filter((entry) => entry.status !== "enforced")
            .map((entry) => `${entry.id}=${entry.status}`)
            .join(" ")}`,
        );
      }
    }
    void appendLedgerRow({
      type: "host",
      ts: new Date().toISOString(),
      serverName: hostFacts?.serverName ?? null,
      serverVersion: hostFacts?.serverVersion ?? null,
      schemaVersion: hostFacts?.schemaVersion ?? null,
      schemaFingerprint: hostFacts?.schemaFingerprint ?? null,
      grantedCapabilities: hostFacts?.grantedCapabilities ?? [],
      sessionDurability: hostFacts?.sessionDurability ?? null,
      platform: hostFacts?.platform === null || hostFacts?.platform === undefined
        ? null
        : `${hostFacts.platform.os}/${hostFacts.platform.family}`,
      fingerprintWarning: hostFacts === undefined ? false : hasSchemaDrift(hostFacts),
      promptDelivery,
      adapterVersion: ADAPTER_VERSION,
      contractVersion: CONTRACT_VERSION,
    });

    await ctx.provider.transform((editor) => {
      editor.add({
        info: {
          ...Provider.Info.empty(providerID),
          name: PROVIDER_NAME,
          activation: "enabled",
          package: PROVIDER_PACKAGE,
          // Tie the provider to the `/connect` row. The row is registered in the
          // same setup pass, and `enabled` keeps the provider in the list even
          // when no connection exists yet, so this link cannot hide the models.
          integrationID: Integration.ID.make(MUSE_INTEGRATION_ID),
          canonical: Provider.ID.make(PROVIDER_CANONICAL),
          settings: { apiKey: PROVIDER_API_KEY },
        },
        models: modelInfos,
      });
    });

    // `/connect` gets one Muse row, shaped like opencode's `claude-agent`
    // integration: an external method that records the choice, with the
    // credential left to `muse login`. The editor only exists inside the
    // transform, and the write is best-effort (see registration.ts): an older
    // host without the domain, or a rejected write, must not stop the provider
    // from loading.
    //
    // The watch below keeps that row honest about `muse login`. It exists only
    // where the row does, and it stops with the plugin.
    let stopLoginWatch: () => void = () => {};
    if (ctx.integration !== undefined) {
      try {
        await ctx.integration.transform((editor) => {
          registerMuseIntegration(editor);
        });
        const loginWatch = watchMuseLoginStatus(ctx, museBin);
        stopLoginWatch = loginWatch.stop;
        // A finished turn is better evidence than a probe: an auth failure is
        // the login refusing, a clean finish is the login working. That closes
        // the window where a login expires mid-session.
        registry.setTurnObserver((failure) => {
          if (failure === null) loginWatch.report("ok");
          else if (failure.class === "auth") loginWatch.report("auth");
        });
      } catch (error) {
        console.warn("[opencode-muse] could not register the Muse login entry:", error);
      }
    }

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
              // The key OpenCode nests `event.options` under when it calls the
              // model: the canonical provider when the host names one, since
              // that is what it keys provider options by. `language-model.ts`
              // reads the same key back; these two expressions must agree.
              event.model.canonical ?? event.model.providerID,
              efforts,
            ),
        };
      },
      { providerID },
    );

    // Tag every request with the session and directory. Opencode owns forking:
    // a fork arrives as a new session id, so the provider needs no lineage.
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
        const native = nativeHistoryEnabled();
        const result = native
          ? nativeCompactionResult(
              event.messages as unknown as Parameters<typeof nativeCompactionResult>[0],
              budget,
            )
          : {
              summary: makeCompactionDigest(
                event.messages as unknown as Parameters<typeof makeCompactionDigest>[0],
                budget,
              ),
            };
        const digestText = result.native
          ? (nativeWindowDigest(result.native.messages) ?? result.summary)
          : result.summary;
        const fingerprint = fingerprintCompactionOutput(digestText);
        await registry.recordCompaction(String(event.sessionID), fingerprint);
        // The marker tells the next primary request that the checkpoint came
        // from this hook, not from a rewind that happens to still contain it.
        // Carry the fingerprint and window size so a dropped window is named
        // instead of looking like an ordinary rewrite.
        if (native && result.native) {
          registry.markNativeCompaction(String(event.sessionID), {
            fingerprint,
            windowMessages: result.native.messages.length,
          });
        }
        event.result = result;
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
      stopLoginWatch();
      await registry.closeAll();
      await adapter.close();
      hostConfig?.remove();
    };
  },
});
