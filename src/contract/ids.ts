/**
 * Identity model for the harness contract.
 *
 * The host (OpenCode) owns canonical ids for sessions, turns, messages, tool
 * items, and runtime requests. A harness may have its own ids; those are
 * reported as opaque native references and are never used by the host as
 * primary keys.
 *
 * `strength` tells the host how far a native id can be trusted:
 * - `strong`: stable across process restarts; safe to persist and resume from.
 * - `weak`: valid only while the live session/process is alive.
 * - `none`: the harness does not expose this kind of id.
 */
export type HarnessNativeRefStrength = "strong" | "weak" | "none";
export interface HarnessNativeRef {
    /** The harness-native id, or `null` when the harness does not expose one. */
    readonly id: string | null;
    readonly strength: HarnessNativeRefStrength;
}
export function nativeRef(id: string | null, strength: HarnessNativeRefStrength): HarnessNativeRef {
    return { id, strength };
}
