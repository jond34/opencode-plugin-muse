/**
 * Three clocks for one turn, because a wedged host is otherwise undetectable.
 *
 * The wire sets no deadline, and a host that is alive but silent answers
 * nothing: `turn/interrupt` parks with the rest (E-D2). So the only way out of
 * a frozen turn is to end the host, and the only question is when. Three clocks
 * answer it separately:
 *
 * - **first byte** — how long a turn may go with no frame at all. Generous,
 *   because a long prompt can legitimately take a while to start.
 * - **idle** — silence *after* frames have started. Short, because a host that
 *   was streaming and stopped is not thinking, it is stuck.
 * - **warn** — a log line before either budget runs out, once per silence
 *   episode, so a slow turn is visible before it is killed.
 *
 * Only substantive frames count as progress. Keepalives, `session/tokenUsage`,
 * and `view/*` traffic can arrive from a host that has stopped producing a
 * reply, so counting them would make a wedged turn look alive forever.
 *
 * The clocks measure the phase they are in. A bridged `tools/call` is the host
 * waiting on *us*, so the idle clock stands down while one is in flight — the
 * silence is our tool's, not the host's — and resumes when the last call
 * settles. The first-byte clock still bounds a host that never answers, and an
 * optional ceiling bounds a tool that never returns.
 */

/** Which budget expired. */
export type WatchdogExpiry = "first_byte" | "idle" | "tool_ceiling";

/** The budgets, in milliseconds. `0` disables that clock. */
export interface WatchdogConfig {
  readonly firstByteMs: number;
  readonly idleMs: number;
  readonly warnMs: number;
  /** Longest a retry frame may extend the idle clock. `0` keeps the normal reset. */
  readonly retryCapMs?: number;
  /** Wall clock for one bridged call. `0` (the default) means no ceiling. */
  readonly toolCeilingMs?: number;
}

/** Defaults: 900 s to start, 180 s of silence once started, warn at 90 s. */
export const WATCHDOG_DEFAULTS: WatchdogConfig = {
  firstByteMs: 900_000,
  idleMs: 180_000,
  warnMs: 90_000,
  retryCapMs: 600_000,
  toolCeilingMs: 0,
};

/** Grace added to the host's own `retryDelayMs` when a retry extends the clock. */
export const RETRY_GRACE_MS = 5_000;

function readBudget(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw.length === 0) return fallback;
  const value = Number(raw);
  // A value that is not a non-negative number is not a budget; keep the
  // default rather than silently disabling the clock on a typo.
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

/** Read the three budgets from the environment. */
export function watchdogConfigFromEnv(env: NodeJS.ProcessEnv = process.env): WatchdogConfig {
  return {
    firstByteMs: readBudget(env, "MUSE_FIRST_BYTE_TIMEOUT_MS", WATCHDOG_DEFAULTS.firstByteMs),
    idleMs: readBudget(env, "MUSE_IDLE_TIMEOUT_MS", WATCHDOG_DEFAULTS.idleMs),
    warnMs: readBudget(env, "MUSE_IDLE_WARN_MS", WATCHDOG_DEFAULTS.warnMs),
    retryCapMs: readBudget(env, "MUSE_RETRY_CAP_MS", WATCHDOG_DEFAULTS.retryCapMs ?? 0),
    toolCeilingMs: readBudget(env, "MUSE_TOOL_CEILING_MS", 0),
  };
}

/**
 * Whether a notification is evidence that the turn is producing something.
 *
 * `item/*` covers text deltas and every item lifecycle frame; approvals and
 * user-input requests are the turn waiting on a person, which is progress too.
 * `turn/modelRetryScheduled` is the host announcing a backoff it chose, which
 * is the opposite of a wedge (and extends the clock by that delay).
 * Everything else — usage counters, status echoes, view traffic, keepalives —
 * is not.
 */
export function isSubstantiveProgress(method: string): boolean {
  return (
    method === "turn/started" ||
    // The host's own "foreground work is done, named background reminders hold
    // the turn open" signal. It is explicitly non-terminal, so the silence that
    // follows it is the host working, not a wedge; counting it gives the
    // end-of-turn gate a fresh idle window instead of letting the gate outlast
    // a short one and fail a turn the host is about to complete (E-D32).
    method === "turn/foregroundCompleted" ||
    method === "turn/modelRetryScheduled" ||
    method.startsWith("item/") ||
    method.startsWith("approval/") ||
    method.startsWith("userInput/")
  );
}

export interface TurnWatchdogOptions extends WatchdogConfig {
  readonly onWarn?: (silentMs: number) => void;
  readonly onExpire: (reason: WatchdogExpiry) => void;
}

export interface TurnWatchdog {
  /** A frame arrived; only a substantive one resets the clocks. */
  touch(substantive: boolean): void;
  /**
   * A bridged call started (`true`) or the last one settled (`false`). The
   * idle clock is suspended while true: the host is waiting on our tool, not
   * the other way round. The first-byte clock and any ceiling are unaffected.
   */
  setBridgePending(pending: boolean): void;
  /**
   * The host scheduled a model retry: it is backing off, not wedged. Extends
   * the idle clock by the host's own delay plus a grace, capped by
   * `retryCapMs`. `retryCapMs: 0` keeps the normal reset instead.
   *
   * `attempt` and `maxAttempts` are the frame's own bound. On the last attempt
   * there is nothing left to wait for, so the extension collapses to the normal
   * reset: holding a turn the host is about to fail helps nobody.
   */
  noteRetry(delayMs: number, attempt?: number, maxAttempts?: number): void;
  stop(): void;
  /** True once a budget expired; a late frame must not revive the turn. */
  readonly expired: boolean;
}

/**
 * Start the clocks for one turn.
 *
 * Every timer is `unref`'d: a pending budget must not be the reason a process
 * stays alive, and the session that owns the turn stops the watchdog when the
 * turn ends anyway.
 */
export function createTurnWatchdog(options: TurnWatchdogOptions): TurnWatchdog {
  let expired = false;
  let stopped = false;
  let warned = false;
  let firstByte: ReturnType<typeof setTimeout> | undefined;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let warn: ReturnType<typeof setTimeout> | undefined;
  let ceiling: ReturnType<typeof setTimeout> | undefined;
  let bridgePending = false;
  const retryCapMs = options.retryCapMs ?? 0;
  const toolCeilingMs = options.toolCeilingMs ?? 0;

  const clear = (timer: ReturnType<typeof setTimeout> | undefined): undefined => {
    if (timer !== undefined) clearTimeout(timer);
    return undefined;
  };

  const stop = (): void => {
    stopped = true;
    firstByte = clear(firstByte);
    idle = clear(idle);
    warn = clear(warn);
    ceiling = clear(ceiling);
  };

  const expire = (reason: WatchdogExpiry): void => {
    if (expired || stopped) return;
    expired = true;
    stop();
    options.onExpire(reason);
  };

  const armWarn = (): void => {
    warn = clear(warn);
    if (options.warnMs <= 0 || warned || bridgePending) return;
    warn = setTimeout(() => {
      if (expired || stopped) return;
      warned = true;
      options.onWarn?.(options.warnMs);
    }, options.warnMs);
    warn.unref?.();
  };

  const armIdle = (): void => {
    idle = clear(idle);
    // A pending bridge call is silence we caused, so it cannot be a wedge.
    if (options.idleMs <= 0 || bridgePending) return;
    idle = setTimeout(() => expire("idle"), options.idleMs);
    idle.unref?.();
  };

  /** Bound a call that never returns, when the owner asked for one. */
  const armCeiling = (): void => {
    if (toolCeilingMs <= 0 || ceiling !== undefined) return;
    ceiling = setTimeout(() => expire("tool_ceiling"), toolCeilingMs);
    ceiling.unref?.();
  };

  if (options.firstByteMs > 0) {
    firstByte = setTimeout(() => expire("first_byte"), options.firstByteMs);
    firstByte.unref?.();
  }
  armWarn();

  return {
    touch(substantive: boolean): void {
      if (!substantive || expired || stopped) return;
      firstByte = clear(firstByte);
      // A new silence episode may warn again; the warning is per gap, not per
      // turn, so a turn that stalls twice is reported twice.
      warned = false;
      armWarn();
      armIdle();
    },
    setBridgePending(pending: boolean): void {
      if (pending === bridgePending || expired || stopped) return;
      bridgePending = pending;
      if (pending) {
        // The host is waiting on a tool: neither the idle clock nor its warning
        // has anything to say about this silence.
        idle = clear(idle);
        warn = clear(warn);
        armCeiling();
        return;
      }
      ceiling = clear(ceiling);
      // Resuming is a fresh silence episode for the host's side of the turn.
      warned = false;
      armWarn();
      armIdle();
    },
    noteRetry(delayMs: number, attempt?: number, maxAttempts?: number): void {
      if (expired || stopped) return;
      // A retry frame is the host answering, so the first-byte clock is done.
      firstByte = clear(firstByte);
      warned = false;
      armWarn();
      if (bridgePending) return;
      // The last scheduled attempt is not a backoff: the host is about to try
      // once more, and then it is done either way.
      const lastAttempt = attempt !== undefined && maxAttempts !== undefined && attempt >= maxAttempts;
      if (lastAttempt) {
        armIdle();
        return;
      }
      const extension = Math.max(options.idleMs, Math.max(0, delayMs) + RETRY_GRACE_MS);
      const budget = retryCapMs > 0 ? Math.min(extension, retryCapMs) : options.idleMs;
      idle = clear(idle);
      if (budget <= 0) return;
      idle = setTimeout(() => expire("idle"), budget);
      idle.unref?.();
    },
    stop,
    get expired(): boolean {
      return expired;
    },
  };
}
