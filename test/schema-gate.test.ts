import { describe, expect, test } from "bun:test";
import type { SpawnedMspConnection } from "@muse-code/sdk";
import {
  hasSchemaDrift,
  hostFactsFrom,
  schemaDriftWarning,
  strictHostRefusal,
  strictHostRequested,
  type HostFacts,
} from "../src/host-facts.js";

type InitializeResult = SpawnedMspConnection["initializeResult"];

const PINNED = "sha256:b7fb9137267a";

function served(overrides: Record<string, unknown> = {}): InitializeResult {
  return {
    experimentalApi: true,
    grantedCapabilities: ["sessionMcp"],
    museHome: "/home/tester/.muse",
    platformFamily: "unix",
    platformOs: "linux",
    schema: { version: 1, fingerprint: PINNED },
    serverInfo: { name: "muse", version: "1.4.24" },
    sessionDurability: "durable",
    userAgent: "muse/1.4.24",
    ...overrides,
  } as unknown as InitializeResult;
}

const additive = {
  kind: "schemaFingerprintMismatch" as const,
  tier: "additive" as const,
  pinned: PINNED,
  served: "sha256:add11",
  pinnedEpoch: 1,
  servedEpoch: 1,
  message: "additive schema advance",
};

const breaking = {
  kind: "schemaFingerprintMismatch" as const,
  tier: "declaredBreaking" as const,
  pinned: PINNED,
  served: "sha256:break1",
  pinnedEpoch: 1,
  servedEpoch: 2,
  message: "breaking schema advance",
};

const same: HostFacts = hostFactsFrom(served());
const minor: HostFacts = hostFactsFrom(served(), additive);
const major: HostFacts = hostFactsFrom(served(), breaking);
const unknown: HostFacts = hostFactsFrom(served({ schema: undefined }));

describe("schema gate", () => {
  test("an exact fingerprint is the only silent case", () => {
    expect(hasSchemaDrift(same)).toBe(false);
    expect(strictHostRefusal(same)).toBeNull();
  });

  test("a served schema with no fingerprint is unknown and refuses", () => {
    expect(unknown.schemaFingerprint).toBeNull();
    expect(strictHostRefusal(unknown)).toBe("the host served no schema fingerprint to pin");
  });

  test("an additive mismatch warns and, under strict, refuses", () => {
    expect(hasSchemaDrift(minor)).toBe(true);
    expect(schemaDriftWarning(minor)).toContain("differs from the SDK pin");
    expect(strictHostRefusal(minor)).toContain("sha256:add11");
  });

  test("a declared-breaking mismatch says so instead of reusing the additive line", () => {
    expect(hasSchemaDrift(major)).toBe(true);
    expect(schemaDriftWarning(major)).toContain("breaking");
    expect(schemaDriftWarning(major)).not.toBe(schemaDriftWarning(minor));
    expect(strictHostRefusal(major)).toContain("breaking");
    expect(strictHostRefusal(major)).toContain("sha256:break1");
  });

  test("no handshake or no bridge grant refuses under strict", () => {
    expect(strictHostRefusal(undefined)).toBe("the Muse host did not complete its handshake");
    const denied = hostFactsFrom(served({ grantedCapabilities: [] }));
    expect(strictHostRefusal(denied)).toBe("the host did not grant sessionMcp");
  });

  test("strict is opt-in on exactly `1`, so warn stays the default", () => {
    expect(strictHostRequested({} as NodeJS.ProcessEnv)).toBe(false);
    expect(strictHostRequested({ MUSE_STRICT_HOST: "0" } as NodeJS.ProcessEnv)).toBe(false);
    expect(strictHostRequested({ MUSE_STRICT_HOST: "true" } as NodeJS.ProcessEnv)).toBe(false);
    expect(strictHostRequested({ MUSE_STRICT_HOST: "1" } as NodeJS.ProcessEnv)).toBe(true);
  });
});
