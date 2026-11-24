/**
 * Feature flags.
 *
 * Native history is gated off until the live compaction gate passes. The
 * default is deliberately off: an unverified hook-supplied window is silently
 * dropped by opencode, and a silent drop looks like a successful compaction
 * until the next turn is missing context.
 */
export function nativeHistoryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.MUSE_NATIVE_HISTORY?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "on";
}
