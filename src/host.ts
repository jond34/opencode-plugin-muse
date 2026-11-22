import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MspError,
  spawnMspConnection,
  type Connection,
  type FingerprintWarning,
  type MuseServeChild,
  type ProcessExit,
  type SpawnedMspConnection,
} from "@muse-code/sdk";
import { packageVersion } from "./version.js";

/** Suffix Muse appends to a model id to select its contributor variant. */
export const CONTRIBUTOR_SUFFIX = "-contributor";

/** One row of Muse's on-disk model catalog, which keeps hidden rows. */
export interface CatalogRow {
  readonly model_id: string;
  readonly display_label: string | null;
  readonly description?: string | null;
}

/**
 * Append the hidden contributor variants to the visible catalog rows.
 *
 * `model/list` serves visible rows only, so contributor variants have to be
 * recovered from the on-disk catalog. A contributor row with no visible base
 * row contributes nothing: the base supplies the context/output limits and the
 * reasoning-effort variants.
 */
export function contributorModelEntries(
  visible: ReadonlyArray<Record<string, unknown>>,
  contributors: ReadonlyArray<CatalogRow>,
): Array<Record<string, unknown>> {
  const byId = new Map(visible.map((model) => [String(model.modelId), model]));
  const entries: Array<Record<string, unknown>> = [];
  for (const row of contributors) {
    if (!row.model_id.endsWith(CONTRIBUTOR_SUFFIX)) continue;
    const base = byId.get(row.model_id.slice(0, -CONTRIBUTOR_SUFFIX.length));
    if (base === undefined) continue;
    entries.push({
      ...base,
      modelId: row.model_id,
      displayLabel: row.display_label ?? row.model_id,
      ...(row.description == null ? {} : { description: row.description }),
    });
  }
  return entries;
}

/**
 * Read the plugin's Contributor mode switch.
 *
 * Muse documents its own override as `MUSE_CONTRIBUTOR_MODE=1|0`; the plugin
 * reuses the name, so a user following Meta's docs must not silently get the
 * opposite of what they asked for. `1`, `true`, and `on` are on; anything else,
 * including absent and unparseable values, stays off (the privacy-safe default).
 */
export function contributorModeFromEnv(value: string | undefined): "on" | "off" {
  switch (value?.trim().toLowerCase()) {
    case "1":
    case "true":
    case "on":
      return "on";
    default:
      return "off";
  }
}

/** Build the `muse serve` argument list. */
export function serveArgs(options: MuseHostOptions): string[] {
  const args = ["serve", ...(options.args ?? [])];
  if (options.preset !== undefined) args.push("--preset", options.preset);
  if (options.contributorMode !== undefined) args.push("--contributor-mode", options.contributorMode);
  if (options.trustWorkspace === true) args.push("--trust-workspace");
  // Vendor sandbox fences. opencode owns shell, writes, and approvals for every
  // bridged call, so Muse's own copies of those are only a way around the
  // harness. Keeping them off does not depend on the settings `run.toolset`
  // key, which the vendor does not document.
  args.push("--disable-write", "--disable-request-user-input");
  return args;
}

/** A raw MSP notification, as it arrives on the connection. */
export interface MuseNotification {
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

/** A session that wants to receive the notifications routed to its id. */
export interface NotificationSink {
  /** The native Muse session id notifications are addressed to. */
  readonly sessionId: string;
  handleNotification(notification: MuseNotification): void;
  /** The host process is gone; this session can never serve another turn. */
  handleHostExit?(): void;
}

/**
 * Answer one MSP server request.
 *
 * Only the two presentation-request methods get the `{}` receipt, and only
 * when the session they name is registered. Every other method keeps the
 * `-32601` a bare Connection answers: the receipt is a claim that a surface
 * presented the request, and a false claim suppresses the re-issue that would
 * otherwise recover it (`msp.d.ts:2249`).
 */
export function answerServerRequest(
  request: { readonly method?: unknown; readonly params?: unknown },
  sinkFor: (sessionId: string) => NotificationSink | undefined,
): Record<string, unknown> {
  const method = typeof request.method === "string" ? request.method : "";
  const params =
    request.params !== null && typeof request.params === "object" && !Array.isArray(request.params)
      ? (request.params as Record<string, unknown>)
      : {};
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : undefined;
  // `approval/request` and `userInput/request` share params with their
  // notification twins (`msp.d.ts:4667`, `:4669`).
  const twin =
    method === "userInput/request"
      ? "userInput/requested"
      : method === "approval/request"
        ? "approval/requested"
        : undefined;
  if (twin !== undefined && sessionId !== undefined) {
    const sink = sinkFor(sessionId);
    if (sink !== undefined) {
      sink.handleNotification({ method: twin, params });
      return {};
    }
  }
  throw new MspError({
    code: -32601,
    message: `method not found: ${method}`,
    data: { kind: "methodNotFound", retryable: false },
  });
}

export interface MuseHostOptions {
  /** Muse binary path. Defaults to `muse` on PATH. */
  readonly museBin?: string;
  /** Extra arguments for `muse serve`. */
  readonly args?: readonly string[];
  /** Working directory for the host process. */
  readonly cwd?: string;
  /** Environment for the host process. */
  readonly env?: NodeJS.ProcessEnv;
  /** Host preset, for example `empty` (no built-in tools). */
  readonly preset?: string;
  /**
   * Per-process contributor mode override. The `empty` preset turns it on,
   * which routes every model to its `-contributor` variant; a model without
   * one fails. Omit to keep the host's own default.
   */
  readonly contributorMode?: "on" | "off";
  /** Start the host with `--trust-workspace`; required for per-session MCP. */
  readonly trustWorkspace?: boolean;
  readonly clientName?: string;
  readonly clientVersion?: string;
  readonly onStderr?: (chunk: string) => void;
}

/**
 * One `muse serve` process and its raw MSP connection.
 *
 * The host owns the connection and routes notifications to registered sinks by
 * `sessionId`. Server-initiated requests (`approval/request`,
 * `userInput/request`) only need the presentation receipt; the decision or
 * answer travels later as a command.
 */
export class MuseHost {
  readonly connection: Connection;
  /** The SDK's full initialize result; narrowing it hides schema drift. */
  readonly initializeResult: SpawnedMspConnection["initializeResult"];
  /** The SDK's advisory schema-fingerprint warning, when it served one. */
  readonly fingerprintWarning: FingerprintWarning | undefined;
  readonly exited: Promise<ProcessExit>;
  private readonly child: MuseServeChild;
  private readonly sinks = new Map<string, NotificationSink>();
  private closed = false;

  private constructor(
    connection: Connection,
    initializeResult: SpawnedMspConnection["initializeResult"],
    fingerprintWarning: FingerprintWarning | undefined,
    child: MuseServeChild,
    exited: Promise<ProcessExit>,
  ) {
    this.connection = connection;
    this.initializeResult = initializeResult;
    this.fingerprintWarning = fingerprintWarning;
    this.child = child;
    this.exited = exited;
  }

  static async spawn(options: MuseHostOptions = {}): Promise<MuseHost> {
    // `muse serve` is the MSP host; extra args follow the subcommand.
    const args = serveArgs(options);

    const handshake = spawnMspConnection({
      command: options.museBin ?? "muse",
      args,
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options.env === undefined ? {} : { env: options.env }),
      ...(options.onStderr === undefined ? {} : { onStderr: options.onStderr }),
    });

    let spawned;
    try {
      spawned = await handshake.initialize({
        clientInfo: {
          name: options.clientName ?? "opencode_muse",
          version: options.clientVersion ?? packageVersion(),
        },
        capabilities: {
          // Per-session MCP servers (the tool bridge) need this grant.
          requestedCapabilities: ["sessionMcp"],
        },
      });
    } catch (error) {
      await handshake.close().catch(() => undefined);
      throw error;
    }

    const host = new MuseHost(
      spawned.connection,
      spawned.initializeResult,
      spawned.fingerprintWarning,
      spawned.child,
      spawned.exited,
    );
    host.startRouting();
    return host;
  }

  get museHome(): string {
    return this.initializeResult.museHome;
  }

  /** Capabilities the handshake actually granted, for seam checks. */
  grantedCapabilities(): readonly string[] {
    return this.initializeResult.grantedCapabilities;
  }

  /** Read the visible model catalog (`model/list`). */
  async listModels(): Promise<Array<Record<string, unknown>>> {
    const result = await this.connection.request("model/list", {});
    // SDK 1.4.24 types the rows as `ModelCatalogEntry`. The wire shape is the
    // same camelCase records this file already reads field-by-field; the cast
    // only restores the loose row type the callers share.
    return Array.isArray(result?.models)
      ? (result.models as unknown as Array<Record<string, unknown>>)
      : [];
  }

  /** Read the hidden rows Muse keeps in its on-disk catalog. */
  private async readContributorRows(): Promise<CatalogRow[]> {
    const directory = join(this.museHome, "model-catalog");
    let files: string[];
    try {
      files = await readdir(directory);
    } catch {
      return [];
    }
    const rows: CatalogRow[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const parsed: unknown = JSON.parse(await readFile(join(directory, file), "utf8"));
        const catalogRows = (parsed as { rows?: unknown })?.rows;
        if (!Array.isArray(catalogRows)) continue;
        for (const row of catalogRows) {
          const record = row as Partial<CatalogRow> | null;
          if (typeof record?.model_id !== "string") continue;
          rows.push({
            model_id: record.model_id,
            display_label: typeof record.display_label === "string" ? record.display_label : null,
            description: typeof record.description === "string" ? record.description : null,
          });
        }
      } catch {
        // A missing, stale, or partially written catalog file is skipped.
      }
    }
    return rows;
  }

  /**
   * Models OpenCode may select: the visible `model/list` rows plus the hidden
   * contributor variants. Falls back to the visible rows alone when the
   * on-disk catalog is unavailable.
   */
  async listSelectableModels(): Promise<Array<Record<string, unknown>>> {
    const visible = await this.listModels();
    const contributors = await this.readContributorRows();
    return [...visible, ...contributorModelEntries(visible, contributors)];
  }

  private startRouting(): void {
    this.connection.onNotification((notification) => {
      if (this.closed) return;
      const params = notification.params as Record<string, unknown> | undefined;
      const sessionId = typeof params?.sessionId === "string" ? params.sessionId : undefined;
      if (sessionId === undefined) return;
      this.sinks.get(sessionId)?.handleNotification({ method: notification.method, params });
    });

    // The receipt says a surface showed the request; the decision or answer
    // travels later as a command. It is only true for the two presentation
    // methods on a session this host routes, so every other request is
    // refused rather than acknowledged.
    this.connection.onServerRequest(async (request) =>
      answerServerRequest(request, (sessionId) => this.sinks.get(sessionId)),
    );

    // Without this, a crash is invisible: sessions wait on notifications that
    // will never arrive. `exited` never rejects in practice, but a second arm
    // keeps an unhandled rejection from taking the process with it.
    void this.exited.then(
      () => this.announceExit(),
      () => this.announceExit(),
    );
  }

  /**
   * Tell every registered session the host is gone.
   *
   * `closed` is set before the connection is closed on purpose: an intentional
   * shutdown must not look like a crash, and the registry closes its sessions
   * before the adapter closes the host, so nothing is left waiting here.
   */
  private announceExit(): void {
    if (this.closed) return;
    // Copy: a sink may unregister itself while this loop runs.
    for (const sink of [...this.sinks.values()]) sink.handleHostExit?.();
  }

  registerSink(sink: NotificationSink): void {
    this.sinks.set(sink.sessionId, sink);
  }

  unregisterSink(sessionId: string): void {
    this.sinks.delete(sessionId);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.connection.close();
  }
}
