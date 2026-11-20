import type { HarnessCapabilities } from "./contract/index.js";
import type { HostFacts } from "./host-facts.js";
import type { PromptDelivery } from "./prompt-policy.js";

/**
 * The containment treaty, in one place.
 *
 * Each invariant says what must be true, how it is enforced, and how a breach
 * is seen. "Unknown" is a first-class result: strict mode refuses to start on
 * a critical unknown instead of pretending the fence exists.
 */

export type ContainmentMode = "strict" | "warn" | "off";
export type ContainmentStatus = "enforced" | "degraded" | "breached" | "unknown";

export interface ContainmentCheck {
  readonly id: string;
  readonly statement: string;
  readonly critical: boolean;
  readonly status: ContainmentStatus;
  readonly evidence: string;
  readonly remedy: string;
}

export interface HostConfigFacts {
  /** The private XDG config was written. */
  readonly privateConfig: boolean;
  /** The toolset is pinned to the bridge namespace. */
  readonly toolset: boolean;
  /** Every Muse observer agent is off. */
  readonly remindersOff: boolean;
  /** Compaction thresholds sit at the window edge. */
  readonly thresholds: boolean;
  readonly skills: "enumerated" | "empty" | "failed" | "unknown";
}

export interface ContainmentInputs {
  readonly facts: HostFacts | null;
  readonly hostConfig: HostConfigFacts | null;
  readonly promptDelivery: PromptDelivery;
  readonly capabilities: HarnessCapabilities;
  /** Tool calls outside `mcp__opencode__*`. */
  readonly extraToolCalls?: number;
  /** Loop-owning item kinds the host emitted. */
  readonly loopItemKinds?: readonly string[];
  readonly compactions?: number;
}

function check(
  id: string,
  statement: string,
  critical: boolean,
  status: ContainmentStatus,
  evidence: string,
  remedy: string,
): ContainmentCheck {
  return { id, statement, critical, status, evidence, remedy };
}

/** Evaluate every invariant against observed facts. */
export function evaluateContainment(input: ContainmentInputs): ContainmentCheck[] {
  const facts = input.facts;
  const config = input.hostConfig;
  const extraTools = input.extraToolCalls ?? 0;
  const loopKinds = input.loopItemKinds ?? [];

  const toolsStatus: ContainmentStatus =
    extraTools > 0
      ? "breached"
      : config === null
        ? "unknown"
        : config.privateConfig && config.toolset
          ? "enforced"
          : "degraded";

  const loopStatus: ContainmentStatus =
    loopKinds.length > 0
      ? "breached"
      : config === null
        ? "unknown"
        : config.remindersOff
          ? "enforced"
          : "degraded";

  const promptStatus: ContainmentStatus =
    input.promptDelivery === "pass"
      ? "enforced"
      : input.promptDelivery === "fail"
        ? "breached"
        : "unknown";

  const historyStatus: ContainmentStatus = config === null ? "unknown" : config.thresholds ? "enforced" : "degraded";

  const checks: ContainmentCheck[] = [
    check(
      "tools.bridge-only",
      "Muse may call only mcp__opencode__*",
      true,
      toolsStatus,
      extraTools > 0
        ? `${extraTools} non-bridge tool call(s)`
        : config === null
          ? "no private host config observed"
          : `privateConfig=${config.privateConfig} toolset=${config.toolset}`,
      "keep the private config dir; never fall back to the user's Muse MCP config",
    ),
    check(
      "loop.opencode-only",
      "no reminders, workflows, subagents, or background tasks",
      true,
      loopStatus,
      loopKinds.length > 0
        ? `item kinds: ${loopKinds.join(",")}`
        : config === null
          ? "no private host config observed"
          : `remindersOff=${config.remindersOff}`,
      "set runtime_capabilities reminders off; treat an unknown kind as a report, not a crash",
    ),
    check(
      "history.opencode-authority",
      "no Muse rewrite without a reseed",
      true,
      historyStatus,
      config === null
        ? "no private host config observed"
        : `thresholds=${config.thresholds} compactions=${input.compactions ?? 0}`,
      "keep soft/hard thresholds at the edge and reseed on a compaction item or pressure",
    ),
    check(
      "prompt.instructions",
      "role and instructions arrive exactly once",
      true,
      promptStatus,
      `developerPrompt=${input.promptDelivery}`,
      "probe on a new fingerprint; otherwise send the preamble once",
    ),
    check(
      "quota.no-utility-turns",
      "titles and compaction are local",
      false,
      facts === null ? "unknown" : "enforced",
      facts === null ? "no host handshake" : "local title/digest hooks",
      "keep title and compaction hooks local; never open a native turn for them",
    ),
    check(
      "session.transport-only",
      "the native session is a cache, not history",
      false,
      facts === null ? "unknown" : "enforced",
      facts === null ? "no host handshake" : `durability=${facts.sessionDurability ?? "unknown"}`,
      "reseed on divergence; never migrate history out of opencode",
    ),
    check(
      "bridge.loopback",
      "the tool bridge is loopback plus a token",
      false,
      "enforced",
      "127.0.0.1 with a per-session bearer token",
      "never bind the bridge to a public interface",
    ),
    check(
      "identity.host-ids",
      "opencode ids are primary; native ids are references",
      false,
      input.capabilities.identity.nativeThreadIds === "strong" &&
        input.capabilities.identity.nativeTurnIds === "strong"
        ? "enforced"
        : "degraded",
      `thread=${input.capabilities.identity.nativeThreadIds} turn=${input.capabilities.identity.nativeTurnIds}`,
      "keep native ids behind nativeRef; never key a host session by them",
    ),
  ];
  return checks;
}

export interface ContainmentVerdict {
  readonly level: "ok" | "degraded" | "blocked";
  readonly criticalFailures: readonly ContainmentCheck[];
  readonly degraded: readonly ContainmentCheck[];
}

/** A critical unknown or breach blocks strict startup; anything else warns. */
export function containmentVerdict(checks: readonly ContainmentCheck[]): ContainmentVerdict {
  const criticalFailures = checks.filter(
    (entry) => entry.critical && (entry.status === "unknown" || entry.status === "breached"),
  );
  const degraded = checks.filter((entry) => entry.status === "degraded");
  return {
    level:
      criticalFailures.length > 0 ? "blocked" : degraded.length > 0 ? "degraded" : "ok",
    criticalFailures,
    degraded,
  };
}

/** One screen, no prompt text, no paths. */
export function formatContainmentReport(checks: readonly ContainmentCheck[]): string {
  const width = Math.max(...checks.map((entry) => entry.id.length), 1);
  const lines = checks.map(
    (entry) =>
      `${entry.status.padEnd(9)} ${entry.id.padEnd(width)} ${entry.evidence}${entry.critical ? " [critical]" : ""}`,
  );
  return ["[opencode-muse] containment", ...lines].join("\n");
}

/** Read `MUSE_CONTAINMENT`, defaulting to warn. */
export function containmentModeFromEnv(env: NodeJS.ProcessEnv = process.env): ContainmentMode {
  return env.MUSE_CONTAINMENT === "strict"
    ? "strict"
    : env.MUSE_CONTAINMENT === "off"
      ? "off"
      : "warn";
}
