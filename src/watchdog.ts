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
 */

/** Which budget expired. */
export type WatchdogExpiry = "first_byte" | "idle";

/** The three budgets, in milliseconds. `0` disables that clock. */
export interface WatchdogConfig {
  readonly firstByteMs: number;
  readonly idleMs: number;
  readonly warnMs: number;
}

/** Defaults: 900 s to start, 180 s of silence once started, warn at 90 s. */
export const WATCHDOG_DEFAULTS: WatchdogConfig = {
  firstByteMs: 900_000,
  idleMs: 180_000,
  warnMs: 90_000,
};

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
  };
}

/**
 * Whether a notification is evidence that the turn is producing something.
 *
 * `item/*` covers text deltas and every item lifecycle frame; approvals and
 * user-input requests are the turn waiting on a person, which is progress too.
 * Everything else — usage counters, status echoes, view traffic, keepalives —
 * is not.
 */
export function isSubstantiveProgress(method: string): boolean {
  return (
    method === "turn/started" ||
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

  const clear = (timer: ReturnType<typeof setTimeout> | undefined): undefined => {
    if (timer !== undefined) clearTimeout(timer);
    return undefined;
  };

  const stop = (): void => {
    stopped = true;
    firstByte = clear(firstByte);
    idle = clear(idle);
    warn = clear(warn);
  };

  const expire = (reason: WatchdogExpiry): void => {
    if (expired || stopped) return;
    expired = true;
    stop();
    options.onExpire(reason);
  };

  const armWarn = (): void => {
    warn = clear(warn);
    if (options.warnMs <= 0 || warned) return;
    warn = setTimeout(() => {
      if (expired || stopped) return;
      warned = true;
      options.onWarn?.(options.warnMs);
    }, options.warnMs);
    warn.unref?.();
  };

  const armIdle = (): void => {
    idle = clear(idle);
    if (options.idleMs <= 0) return;
    idle = setTimeout(() => expire("idle"), options.idleMs);
    idle.unref?.();
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
    stop,
    get expired(): boolean {
      return expired;
    },
  };
}
