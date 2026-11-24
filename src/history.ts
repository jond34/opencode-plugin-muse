/**
 * One decision table for the native-history question.
 *
 * opencode owns the conversation; the native Muse session is a cache. A seed
 * is full exactly when that cache cannot be trusted to match the prompt, and
 * every full seed records *why* so a fork, a compaction, a restart, and a
 * tool rewrite are distinguishable in the ledger.
 */

type SeedReason =
  | "first"
  | "same"
  | "new_session"
  | "restart"
  | "opencode_compaction"
  | "native_history_missing"
  | "rewrite"
  | "tool_rewrite"
  | "muse_compaction"
  | "pressure";

export interface HistoryDecision {
  readonly mode: "delta" | "full";
  readonly reason: SeedReason;
}

export interface HistoryInput {
  /** True only for the first step of a live session. */
  readonly fresh: boolean;
  /** The native session already holds context the prompt repeats. */
  readonly nativeHasHistory: boolean;
  /** The registry replaced the native session after a transcript divergence. */
  readonly reseed: boolean;
  /** A stored native id was found and resumed. */
  readonly resumed: boolean;
  /** A stored native id was found but the resume was refused. */
  readonly resumeFallback: boolean;
  /** A native window was installed, but the prompt does not carry its digest. */
  readonly nativeMissing: boolean;
  /** Result of comparing the visible transcript to the native history. */
  readonly reconciliation: "same" | "compacted" | "diverged";
  /** The only differences are tool calls or tool results. */
  readonly toolOnly: boolean;
  /** Muse reported a compaction the adapter has not reseeded yet. */
  readonly compactionPending: boolean;
  /** Context pressure is at or above the reseed threshold. */
  readonly pressure: boolean;
  /** The prompt carries conversation beyond the newest user message. */
  readonly promptHasHistory: boolean;
}

/**
 * Decide whether this step sends a delta or the whole transcript.
 *
 * Order matters: a rewrite is named before a restart, and a Muse compaction
 * outranks pressure because it is the more specific cause. `first` is a delta:
 * a first-ever request is only the system prompt and one user message, which
 * the delta already carries.
 */
export function decideHistory(input: HistoryInput): HistoryDecision {
  if (!input.fresh) return { mode: "delta", reason: "same" };

  if (input.reseed) {
    if (input.reconciliation === "compacted") {
      return { mode: "full", reason: "opencode_compaction" };
    }
    if (input.nativeMissing) return { mode: "full", reason: "native_history_missing" };
    if (input.reconciliation === "diverged") {
      return { mode: "full", reason: input.toolOnly ? "tool_rewrite" : "rewrite" };
    }
    // A rebuild caused by a native rewrite keeps the more specific cause ahead
    // of the resume-fallback label, which is only an artifact of the rebuild.
    if (input.compactionPending) return { mode: "full", reason: "muse_compaction" };
    if (input.pressure) return { mode: "full", reason: "pressure" };
    if (input.resumeFallback) return { mode: "full", reason: "restart" };
    return { mode: "full", reason: "rewrite" };
  }

  if (input.resumeFallback) return { mode: "full", reason: "restart" };
  if (input.compactionPending) return { mode: "full", reason: "muse_compaction" };
  if (input.pressure) return { mode: "full", reason: "pressure" };
  if (!input.nativeHasHistory && input.promptHasHistory) {
    return { mode: "full", reason: "new_session" };
  }
  return {
    mode: "delta",
    reason: input.nativeHasHistory || input.resumed ? "same" : "first",
  };
}

/**
 * A rewrite where every changed position is a tool entry. Both lists are in
 * prompt order, so a same-length diff confined to `tool-` entries is a tool
 * output change, not a different conversation.
 */
export function isToolOnlyRewrite(
  previous: readonly string[],
  current: readonly string[],
): boolean {
  if (previous.length !== current.length || previous.length === 0) return false;
  let changed = false;
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] === current[index]) continue;
    const before = previous[index] ?? "";
    const after = current[index] ?? "";
    if (!before.startsWith("tool-") || !after.startsWith("tool-")) return false;
    changed = true;
  }
  return changed;
}
