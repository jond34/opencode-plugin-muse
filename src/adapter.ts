import type {
  HarnessAdapterInfo,
  HarnessCapabilities,
} from "./contract/index.js";
import type { LanguageAdapter, LanguageOpenSessionInput, LanguageSession } from "./language.js";
import { MuseHost, type MuseHostOptions } from "./host.js";
import { hostFactsFrom, type HostFacts } from "./host-facts.js";
import { MuseHarnessSession, type CreateSessionInput } from "./session.js";
import { MUSE_CAPABILITIES } from "./capabilities.js";
import { packageVersion } from "./version.js";

export interface MuseAdapterOptions {
  /** Reuse an existing host instead of spawning one. */
  readonly host?: MuseHost;
  /** Options used when this adapter spawns its own host. */
  readonly hostOptions?: MuseHostOptions;
}

/**
 * Muse Code adapter for the harness-agnostic contract.
 *
 * The adapter is the only place that knows MSP. It spawns one `muse serve`
 * host per adapter instance (unless a host is injected) and translates every
 * session's native protocol into the normalized event stream.
 */
export class MuseHarnessAdapter implements LanguageAdapter {
  readonly info: HarnessAdapterInfo = {
    id: "muse",
    label: "Muse Code",
    version: packageVersion(),
  };

  private readonly injectedHost: MuseHost | undefined;
  private readonly hostOptions: MuseHostOptions;
  private host: MuseHost | undefined;
  private hostPromise: Promise<MuseHost> | undefined;

  constructor(options: MuseAdapterOptions = {}) {
    this.injectedHost = options.host;
    this.hostOptions = options.hostOptions ?? {};
  }

  getCapabilities(): HarnessCapabilities {
    return MUSE_CAPABILITIES;
  }

  /** Read the selectable Muse models: visible rows plus contributor variants. */
  async listModels(): Promise<Array<Record<string, unknown>>> {
    const host = await this.ensureHost();
    return host.listSelectableModels();
  }

  /**
   * The host's own handshake facts. Spawns the host if it has not started;
   * callers that cannot tolerate a spawn failure catch and degrade.
   */
  async getHostFacts(): Promise<HostFacts> {
    const host = await this.ensureHost();
    return hostFactsFrom(host.initializeResult, host.fingerprintWarning);
  }

  /**
   * The account's last-observed allowance window. No model call, no spend; the
   * host answers from the observation it already holds.
   */
  async readUsage(): Promise<unknown> {
    const host = await this.ensureHost();
    return host.connection.request("usage/read", {});
  }

  async openSession(input: LanguageOpenSessionInput): Promise<LanguageSession> {
    const host = await this.ensureHost();
    const createInput: CreateSessionInput = {
      sessionId: input.sessionId,
      cwd: input.cwd,
      model: input.model,
      ...(input.toolBridge === undefined ? {} : { toolBridge: input.toolBridge }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      ...(input.resumeSessionId === undefined ? {} : { resumeSessionId: input.resumeSessionId }),
      ...(input.developerPrompt === undefined ? {} : { developerPrompt: input.developerPrompt }),
      ...(input.containment === undefined ? {} : { containment: input.containment }),
    };
    return MuseHarnessSession.create(host, createInput);
  }

  private ensureHost(): Promise<MuseHost> {
    if (this.injectedHost) return Promise.resolve(this.injectedHost);
    if (this.host) return Promise.resolve(this.host);
    if (this.hostPromise) return this.hostPromise;
    let attempt: Promise<MuseHost>;
    attempt = MuseHost.spawn(this.hostOptions).then(
      (host) => {
        this.host = host;
        // A crash must not poison every later open: forget this host, so the
        // next caller spawns a new one and takes the existing resume path.
        void host.exited.then(
          () => this.forgetHost(host),
          () => this.forgetHost(host),
        );
        // `exited` never settles when only the transport died, so a hung host
        // would stay cached and every later open would land on it.
        void host.gone?.then(() => this.forgetHost(host));
        return host;
      },
      (error) => {
        // A rejected spawn is not a host: caching it would turn one bad minute
        // into a permanent failure for the life of the opencode process.
        if (this.hostPromise === attempt) this.hostPromise = undefined;
        throw error;
      },
    );
    this.hostPromise = attempt;
    return attempt;
  }

  /** Drop a dead host, unless `close()` or a newer spawn already replaced it. */
  private forgetHost(host: MuseHost): void {
    if (this.host !== host) return;
    this.host = undefined;
    this.hostPromise = undefined;
  }

  /** Close the adapter's own host. Injected hosts stay owned by the caller. */
  async close(): Promise<void> {
    if (this.injectedHost) return;
    const host = this.host ?? (this.hostPromise ? await this.hostPromise.catch(() => undefined) : undefined);
    this.host = undefined;
    this.hostPromise = undefined;
    await host?.close();
  }
}
