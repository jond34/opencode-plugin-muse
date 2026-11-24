import { describe, expect, test } from "bun:test";
import type { SpawnedMspConnection } from "@muse-code/sdk";
import {
  describeHostFacts,
  hasSchemaDrift,
  hostFactsFrom,
  sessionMcpGranted,
  type HostFacts,
} from "../src/host-facts.js";

type InitializeResult = SpawnedMspConnection["initializeResult"];

function initializeResult(overrides: Record<string, unknown> = {}): InitializeResult {
  return {
    experimentalApi: true,
    grantedCapabilities: ["sessionMcp"],
    museHome: "/home/tester/.muse",
    platformFamily: "unix",
    platformOs: "linux",
    schema: { version: 1, fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    serverInfo: { name: "muse", version: "1.4.23" },
    sessionDurability: "durable",
    userAgent: "muse/1.4.23",
    ...overrides,
  } as unknown as InitializeResult;
}

describe("host facts", () => {
  test("keeps the full initialize result instead of narrowing it", () => {
    const facts = hostFactsFrom(initializeResult());
    expect(facts).toMatchObject({
      serverName: "muse",
      serverVersion: "1.4.23",
      schemaVersion: 1,
      schemaFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      grantedCapabilities: ["sessionMcp"],
      sessionDurability: "durable",
      platform: { os: "linux", family: "unix" },
      fingerprintWarning: null,
      museHome: "/home/tester/.muse",
    });
    expect(sessionMcpGranted(facts)).toBe(true);
    expect(hasSchemaDrift(facts)).toBe(false);
  });

  test("a missing schema is unknown, not an invented fingerprint", () => {
    const facts = hostFactsFrom(initializeResult({ schema: undefined, serverInfo: undefined }));
    expect(facts.schemaFingerprint).toBeNull();
    expect(facts.schemaVersion).toBeNull();
    expect(facts.serverVersion).toBeNull();
  });

  test("a denied sessionMcp grant is visible", () => {
    const facts = hostFactsFrom(initializeResult({ grantedCapabilities: [] }));
    expect(sessionMcpGranted(facts)).toBe(false);
  });

  test("a fingerprint warning is carried, never thrown", () => {
    const warning = {
      kind: "schemaFingerprintMismatch" as const,
      pinned: "sha256:pinned",
      served: "sha256:served",
      message: "schema advanced",
    };
    const facts = hostFactsFrom(initializeResult(), warning);
    expect(hasSchemaDrift(facts)).toBe(true);
    expect(describeHostFacts(facts)).toContain("schema=drift");
    expect(describeHostFacts(facts)).toContain("sessionMcp=granted");
  });

  test("a denied host is described without prompt text", () => {
    const facts: HostFacts = hostFactsFrom(initializeResult({ grantedCapabilities: [] }));
    expect(describeHostFacts(facts)).toContain("sessionMcp=denied");
  });
});
