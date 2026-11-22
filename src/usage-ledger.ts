import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * A local token ledger.
 *
 * The subscription's own meter is too coarse to see per-turn movement (three
 * probes of ~8,400 input tokens left it unchanged), so it cannot answer "what
 * did this session cost" or "how often did it reseed". The provider already
 * receives per-turn usage from the host; this appends it as JSONL beside the
 * other state. There is no prompt text, no tool output, and no file path.
 *
 * Turns are rows without a `type`. History and host facts carry a `type`, so
 * an old summary keeps counting turns exactly as before.
 */

type UsageKind = "primary" | "compaction" | "title" | "generate" | "probe";

export interface UsageEntry {
  readonly ts: string;
  readonly sessionID: string;
  readonly step: number;
  readonly kind: UsageKind;
  readonly model: string;
  /** Prompt tokens billed across the turn's completions, not the context max. */
  readonly input: number;
  readonly cached: number;
  readonly cacheWrite: number;
  readonly output: number;
  readonly toolCalls: number;
  readonly wallMs: number;
  readonly seed: "delta" | "full";
  /** Why this step seeded the native session; absent on legacy rows. */
  readonly seedReason?: string;
  /** Characters in the body sent to Muse for this step. */
  readonly renderedChars?: number;
  /** Messages in the OpenCode prompt for this step. */
  readonly promptMessages?: number;
  /** Tool call/result blocks in the rendered body. */
  readonly toolBlocks?: number;
  /** Whether the renderer dropped a tail block. */
  readonly truncated?: boolean;
  readonly hostFingerprint?: string | null;
  /** Wall ms from the `turn/start` send to its ack; includes a replay. Absent when the step steered. */
  readonly admitMs?: number;
  /** Characters that arrived as deltas; 0 when the surface streamed nothing. */
  readonly streamedChars?: number;
  /** Characters in the completed frames. The reply's true length. */
  readonly completedChars?: number;
  /** Characters only the completed frame supplied, i.e. the tail fill. */
  readonly fillChars?: number;
  /** Messages that needed a fill; a row may carry a parked step's fills. */
  readonly fillMessages?: number;
  /** The native Muse session this row was billed to, for cost attribution. */
  readonly nativeSessionId?: string;
  /** Cumulative-cost delta for the turn, in USD. */
  readonly costUsd?: number;
  /** At least one completion's price was provisional. */
  readonly costPartial?: boolean;
  readonly adapterVersion?: string;
  readonly contractVersion?: string;
}

/** A compaction or reseed event, kept beside the turns it explains. */
export interface HistoryRow {
  readonly type: "history";
  readonly ts: string;
  readonly sessionID: string;
  readonly event: "compaction" | "reseed" | "pressure";
  readonly reason: string;
  readonly tokensBefore?: number;
  readonly tokensAfter?: number;
  readonly trigger?: string;
  readonly strategy?: string;
  readonly outcome?: string;
  readonly direction?: string;
  /** Who owns the history at this boundary. */
  readonly source?: "opencode" | "muse";
  /** True when opencode supplied the native window rather than reseeding. */
  readonly native?: boolean;
  /** Messages in a native window, when the row describes one. */
  readonly windowMessages?: number;
}

/** One startup snapshot of the host; no prompt text, no user paths. */
interface HostRow {
  readonly type: "host";
  readonly ts: string;
  readonly serverName: string | null;
  readonly serverVersion: string | null;
  readonly schemaVersion: number | null;
  readonly schemaFingerprint: string | null;
  readonly grantedCapabilities: readonly string[];
  readonly sessionDurability: string | null;
  readonly platform: string | null;
  readonly fingerprintWarning: boolean;
  readonly promptDelivery: string;
  readonly adapterVersion: string;
  readonly contractVersion: string;
}

export type LedgerRow = UsageEntry | HistoryRow | HostRow | Record<string, unknown>;

export interface UsageSummary {
  readonly turns: number;
  readonly input: number;
  readonly cached: number;
  readonly cacheWrite: number;
  readonly output: number;
  readonly toolCalls: number;
  readonly costUsd: number;
  /** Turns that carried a priced cumulative delta, out of all turns. */
  readonly pricedTurns: number;
  /** Turns whose cost was provisional. */
  readonly partialCost: number;
  readonly reseeds: number;
  readonly reseedRate: number;
  readonly p50Input: number;
  readonly p90Input: number;
  /** Non-turn rows (compactions, reseeds, startup facts). */
  readonly historyRows: number;
  readonly compactions: number;
  /** Full seeds by reason; empty on legacy files. */
  readonly reseedReasons: Readonly<Record<string, number>>;
  /** Turns that carried a seed reason, out of all turns. */
  readonly seedReasons: number;
}

/** `$XDG_STATE_HOME/opencode-muse`, or the home fallback. */
function ledgerDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const state = env.XDG_STATE_HOME?.trim();
  const base = state !== undefined && state.length > 0 ? state : join(homedir(), ".local", "state");
  return join(base, "opencode-muse");
}

/** `usage-YYYY-MM-DD.jsonl` inside the ledger directory. */
export function ledgerPath(date: Date = new Date(), env: NodeJS.ProcessEnv = process.env): string {
  return join(ledgerDirectory(env), `usage-${date.toISOString().slice(0, 10)}.jsonl`);
}

/**
 * Append one arbitrary ledger row. Best effort by design: a ledger failure
 * (read-only home, full disk) must never fail the turn it was measuring.
 */
export async function appendLedgerRow(
  row: LedgerRow,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  // Test turns are not usage: keeping them would pollute the percentiles and
  // the reseed rate for the real sessions in the same file.
  if (env.NODE_ENV === "test") return;
  try {
    await mkdir(ledgerDirectory(env), { recursive: true, mode: 0o700 });
    const at = new Date(String((row as { ts?: unknown }).ts ?? ""));
    const file = ledgerPath(Number.isNaN(at.getTime()) ? new Date() : at, env);
    await appendFile(file, `${JSON.stringify(row)}\n`, { mode: 0o600 });
  } catch {
    // Ignored: measurement must not break the measured turn.
  }
}

/** Append one turn's usage. */
export async function appendUsage(
  entry: UsageEntry,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await appendLedgerRow(entry, env);
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[rank] ?? 0;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Aggregate a ledger file. Malformed lines are skipped, not fatal. */
export async function summarizeUsage(file: string = ledgerPath()): Promise<UsageSummary> {
  let raw = "";
  try {
    raw = await readFile(file, "utf8");
  } catch {
    raw = "";
  }
  let turns = 0;
  let input = 0;
  let cached = 0;
  let cacheWrite = 0;
  let output = 0;
  let toolCalls = 0;
  let costUsd = 0;
  let pricedTurns = 0;
  let partialCost = 0;
  let reseeds = 0;
  let historyRows = 0;
  let compactions = 0;
  let seedReasons = 0;
  const reseedReasons: Record<string, number> = {};
  const inputs: number[] = [];

  for (const line of raw.split("\n")) {
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) continue;
    const entry = parsed as Record<string, unknown>;
    if (typeof entry.type === "string") {
      // History or host row: counted, never folded into turn totals.
      historyRows += 1;
      if (entry.type === "history" && entry.event === "compaction") compactions += 1;
      continue;
    }
    // A well-formed turn always names its time and kind; an empty object is
    // debris from a partial write, not a turn.
    if (typeof entry.ts !== "string" || typeof entry.kind !== "string") continue;
    turns += 1;
    if (entry.seed === "full") {
      reseeds += 1;
      const reason = typeof entry.seedReason === "string" ? entry.seedReason : "unrecorded";
      reseedReasons[reason] = (reseedReasons[reason] ?? 0) + 1;
      if (typeof entry.seedReason === "string") seedReasons += 1;
    } else if (typeof entry.seedReason === "string") {
      seedReasons += 1;
    }
    const turnInput = numberOrZero(entry.input);
    input += turnInput;
    cached += numberOrZero(entry.cached);
    cacheWrite += numberOrZero(entry.cacheWrite);
    output += numberOrZero(entry.output);
    toolCalls += numberOrZero(entry.toolCalls);
    if (typeof entry.costUsd === "number" && Number.isFinite(entry.costUsd)) {
      costUsd += entry.costUsd;
      pricedTurns += 1;
      if (entry.costPartial === true) partialCost += 1;
    }
    inputs.push(turnInput);
  }

  inputs.sort((left, right) => left - right);
  return {
    turns,
    input,
    cached,
    cacheWrite,
    output,
    toolCalls,
    costUsd,
    pricedTurns,
    partialCost,
    reseeds,
    reseedRate: turns === 0 ? 0 : reseeds / turns,
    p50Input: percentile(inputs, 0.5),
    p90Input: percentile(inputs, 0.9),
    historyRows,
    compactions,
    reseedReasons,
    seedReasons,
  };
}
