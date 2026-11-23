/**
 * The allowance warning: one read, one threshold, one line per window.
 *
 * A subscription bills in blocks, and the host knows the current one:
 * `usage/read` returns the last-observed window over the connection the plugin
 * already holds, with no model call and no allowance spend (E-D6). A flat-rate
 * user otherwise meets the wall as a failed turn with no notice.
 *
 * This is a warning, never a gate: a failed read is silent, and nothing here
 * can block a session from starting.
 */

/** The fields this module reads, from `UsageReadResult.usage`. */
export interface AllowanceUsage {
  readonly observedAtMs: number | null;
  readonly tier: string | null;
  /** The provider's 5-hour-class window; the one the warning measures. */
  readonly window: { readonly usedPercent: number; readonly resetsAtMs: number | null } | null;
  readonly weekly: { readonly usedPercent: number; readonly resetsAtMs: number | null } | null;
}

/** Default: warn at 90 % of the rolling window. */
export const ALLOWANCE_WARN_PERCENT = 90;

/** Read the threshold from the environment. `0` disables the warning. */
export function allowanceWarnPercent(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MUSE_ALLOWANCE_WARN_PERCENT?.trim();
  if (raw === undefined || raw.length === 0) return ALLOWANCE_WARN_PERCENT;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : ALLOWANCE_WARN_PERCENT;
}

function readWindow(raw: unknown): AllowanceUsage["window"] {
  const value = raw as Record<string, unknown> | null | undefined;
  if (value === null || typeof value !== "object") return null;
  if (typeof value.usedPercent !== "number" || !Number.isFinite(value.usedPercent)) return null;
  return {
    usedPercent: value.usedPercent,
    resetsAtMs:
      typeof value.resetsAtMs === "number" && Number.isFinite(value.resetsAtMs)
        ? value.resetsAtMs
        : null,
  };
}

/**
 * Narrow a `usage/read` result. Accepts either the result envelope or the
 * usage object itself, so a caller holding one or the other needs no branch.
 */
export function parseAllowance(result: unknown): AllowanceUsage | null {
  const envelope = result as { usage?: unknown } | null | undefined;
  const raw = (envelope?.usage ?? result) as Record<string, unknown> | null | undefined;
  if (raw === null || typeof raw !== "object") return null;
  const window = readWindow(raw.window);
  const weekly = readWindow(raw.weekly);
  if (window === null && weekly === null) return null;
  return {
    observedAtMs:
      typeof raw.observedAtMs === "number" && Number.isFinite(raw.observedAtMs)
        ? raw.observedAtMs
        : null,
    tier: typeof raw.tier === "string" ? raw.tier : null,
    window,
    weekly,
  };
}

/** True when the rolling window is at or above the threshold. */
export function shouldWarn(usage: AllowanceUsage, percent: number): boolean {
  if (percent <= 0) return false;
  const used = usage.window?.usedPercent;
  return used !== undefined && used >= percent;
}

/** The line a user reads. Names the number, the threshold, and the reset. */
export function allowanceMessage(usage: AllowanceUsage, percent: number): string {
  const used = usage.window?.usedPercent ?? 0;
  const resets = usage.window?.resetsAtMs;
  const when =
    resets === null || resets === undefined
      ? "the reset time is not reported"
      : `the window resets at ${new Date(resets).toISOString()}`;
  return (
    `[opencode-muse] allowance window ${used}% used (warning threshold ${percent}%); ${when}. ` +
    `Turns fail when it runs out; MUSE_ALLOWANCE_WARN_PERCENT=0 silences this.`
  );
}

/** The reset stamp already warned about, so one window warns once. */
let warnedResetAtMs: number | null = null;

/** Test hook: forget the warned window. */
export function resetAllowanceWarning(): void {
  warnedResetAtMs = null;
}

/**
 * Read the allowance and warn at most once per window.
 *
 * Returns the message it logged, or `null` when it stayed quiet. A read failure
 * is swallowed on purpose: this is advice, and a start must not depend on it.
 */
export async function checkAllowance(
  source: { read(): Promise<unknown> },
  env: NodeJS.ProcessEnv = process.env,
  log: (message: string) => void = (message) => console.warn(message),
): Promise<string | null> {
  const percent = allowanceWarnPercent(env);
  if (percent <= 0) return null;
  let usage: AllowanceUsage | null;
  try {
    usage = parseAllowance(await source.read());
  } catch {
    return null;
  }
  if (usage === null || !shouldWarn(usage, percent)) return null;
  // The window is identified by when it resets; an absent stamp still warns,
  // but then only once per process, which is the best identity available.
  const key = usage.window?.resetsAtMs ?? null;
  if (warnedResetAtMs === key) return null;
  warnedResetAtMs = key;
  const message = allowanceMessage(usage, percent);
  log(message);
  return message;
}
