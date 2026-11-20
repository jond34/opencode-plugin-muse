/**
 * Prompt delivery is a probed fact, not a version assumption.
 *
 * `config.developerPrompt` is not in the published `SessionConfig`. It works
 * on the pinned CLI, but a host that ignores it would leave the adapter
 * believing the agent role and instructions arrived while Muse never saw them.
 * Unknown is therefore treated as "not delivered", and the preamble is sent.
 */

export type PromptDelivery = "pass" | "fail" | "unknown";

export interface PromptPolicyDecision {
  readonly delivery: PromptDelivery;
  /** True only when a probe observed the developer prompt reaching the model. */
  readonly nativeDeveloperPrompt: boolean;
}

/** Read a cached probe result; anything unrecognized is unknown. */
export function parsePromptDelivery(raw: unknown): PromptDelivery {
  return raw === "pass" || raw === "fail" ? raw : "unknown";
}

/**
 * A pass is the only evidence that lets the preamble be skipped. A failure is
 * explicit; unknown is the conservative default.
 */
export function decidePromptPolicy(delivery: PromptDelivery): PromptPolicyDecision {
  return { delivery, nativeDeveloperPrompt: delivery === "pass" };
}

/** The stable part of the probe: one word only the developer prompt contains. */
export function probeInstruction(canary: string): string {
  return `The instruction word is ${canary}. When asked, reply with only that word.`;
}

/** The user half of the probe; it never repeats the canary. */
export const PROBE_QUESTION = "What is the instruction word? Reply with only it.";

/** True when the model reproduced the canary from the developer prompt. */
export function probeSucceeded(response: string, canary: string): boolean {
  return response.toLowerCase().includes(canary.toLowerCase());
}

/** The session-store key: a probe is only valid for one schema fingerprint. */
export function promptProbeKey(fingerprint: string | null): string {
  return `v2:prompt:${fingerprint ?? "unknown"}`;
}
