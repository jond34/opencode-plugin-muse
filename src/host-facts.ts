import type { FingerprintWarning, SpawnedMspConnection } from "@muse-code/sdk";

/**
 * The host facts the containment treaty depends on, kept in one place.
 *
 * The SDK already returns all of this; the adapter used to narrow it to
 * `museHome`, so a schema change or a denied capability was invisible. This
 * view is derived, never hand-built: adding a field is an SDK-aware change,
 * not a protocol guess.
 */
export interface HostFacts {
  readonly serverName: string | null;
  readonly serverVersion: string | null;
  readonly schemaVersion: number | null;
  readonly schemaFingerprint: string | null;
  readonly grantedCapabilities: readonly string[];
  readonly sessionDurability: string | null;
  readonly platform: {
    readonly os: string;
    readonly family: string;
  } | null;
  readonly fingerprintWarning: FingerprintWarning | null;
  readonly museHome: string;
}

/** Build the view from the SDK's initialize result. */
export function hostFactsFrom(
  result: SpawnedMspConnection["initializeResult"],
  warning?: FingerprintWarning,
): HostFacts {
  const schema = result.schema as { version?: unknown; fingerprint?: unknown } | undefined;
  const server = result.serverInfo as { name?: unknown; version?: unknown } | undefined;
  return {
    serverName: typeof server?.name === "string" ? server.name : null,
    serverVersion: typeof server?.version === "string" ? server.version : null,
    schemaVersion: typeof schema?.version === "number" ? schema.version : null,
    schemaFingerprint: typeof schema?.fingerprint === "string" ? schema.fingerprint : null,
    grantedCapabilities: Array.isArray(result.grantedCapabilities)
      ? result.grantedCapabilities.filter((value): value is string => typeof value === "string")
      : [],
    sessionDurability:
      typeof result.sessionDurability === "string" ? result.sessionDurability : null,
    platform:
      typeof result.platformOs === "string" && typeof result.platformFamily === "string"
        ? { os: result.platformOs, family: result.platformFamily }
        : null,
    fingerprintWarning: warning ?? null,
    museHome: typeof result.museHome === "string" ? result.museHome : "",
  };
}

/** `sessionMcp` is what makes the tool bridge possible at all. */
export function sessionMcpGranted(facts: HostFacts): boolean {
  return facts.grantedCapabilities.includes("sessionMcp");
}

/**
 * True when the host reports a protocol fingerprint the SDK was not built
 * against. The SDK calls this advisory; we surface it, never throw on it
 * unless the operator asked us to.
 */
export function hasSchemaDrift(facts: HostFacts): boolean {
  return facts.fingerprintWarning !== null;
}

/** True only for the exact opt-in value; anything else stays advisory. */
export function strictHostRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MUSE_STRICT_HOST === "1";
}

/**
 * The advisory line for a drifted host. A declared-breaking tier names the
 * larger risk; an additive mismatch keeps the original wording.
 */
export function schemaDriftWarning(facts: HostFacts): string {
  return facts.fingerprintWarning?.tier === "declaredBreaking"
    ? "Muse declares a breaking schema change; review the containment report before trusting new behavior."
    : "Muse schema fingerprint differs from the SDK pin; review the containment report before trusting new behavior.";
}

/**
 * Why `MUSE_STRICT_HOST=1` refuses this host, or null when it may start.
 *
 * Strict fails closed: no handshake, no served fingerprint, any drift tier, or
 * a denied bridge all refuse. A host that serves no schema is *unknown*, not
 * compatible, so it refuses too rather than passing on an absent check.
 */
export function strictHostRefusal(facts: HostFacts | undefined): string | null {
  if (facts === undefined) return "the Muse host did not complete its handshake";
  if (facts.schemaFingerprint === null) return "the host served no schema fingerprint to pin";
  const warning = facts.fingerprintWarning;
  if (warning !== null) {
    return warning.tier === "declaredBreaking"
      ? `the host declares a breaking schema change (${warning.served})`
      : `the host schema differs from the pin (${warning.served})`;
  }
  if (!sessionMcpGranted(facts)) return "the host did not grant sessionMcp";
  return null;
}

/** One line for the startup log; no prompt text, no paths beyond the home. */
export function describeHostFacts(facts: HostFacts): string {
  const server = [facts.serverName, facts.serverVersion].filter((part) => part !== null).join(" ");
  const schema = facts.schemaFingerprint === null ? "no-fingerprint" : facts.schemaFingerprint.slice(0, 19);
  const drift =
    facts.fingerprintWarning === null
      ? "schema=pin"
      : `schema=drift(pinned ${facts.fingerprintWarning.pinned.slice(0, 19)})`;
  const grant = sessionMcpGranted(facts) ? "sessionMcp=granted" : "sessionMcp=denied";
  return `${server.length > 0 ? server : "muse"} ${drift} ${schema} ${grant} durability=${facts.sessionDurability ?? "unknown"}`;
}
