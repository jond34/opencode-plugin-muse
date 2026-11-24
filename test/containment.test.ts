import { describe, expect, test } from "bun:test";
import { MUSE_CAPABILITIES } from "../src/capabilities.js";
import {
  containmentVerdict,
  evaluateContainment,
  formatContainmentReport,
  type ContainmentInputs,
  type HostConfigFacts,
} from "../src/containment.js";
import { hostFactsFrom, type HostFacts } from "../src/host-facts.js";
import { MuseHarnessSession, type SessionHost } from "../src/session.js";
import type { SpawnedMspConnection } from "@muse-code/sdk";

type InitializeResult = SpawnedMspConnection["initializeResult"];

function facts(): HostFacts {
  return hostFactsFrom({
    experimentalApi: true,
    grantedCapabilities: ["sessionMcp"],
    museHome: "/tmp/muse",
    platformFamily: "unix",
    platformOs: "linux",
    schema: { version: 1, fingerprint: "sha256:abc" },
    serverInfo: { name: "muse", version: "1.4.23" },
    sessionDurability: "durable",
    userAgent: "muse/1.4.23",
  } as unknown as InitializeResult);
}

function config(overrides: Partial<HostConfigFacts> = {}): HostConfigFacts {
  return {
    privateConfig: true,
    toolset: true,
    remindersConfiguredOff: true,
    thresholds: true,
    skills: "enumerated",
    ...overrides,
  };
}

function input(overrides: Partial<ContainmentInputs> = {}): ContainmentInputs {
  return {
    facts: facts(),
    hostConfig: config(),
    promptDelivery: "pass" as const,
    capabilities: MUSE_CAPABILITIES,
    observedToolset: {
      status: "observed",
      observation: {
        tools: ["mcp__opencode__read", "mcp__opencode__shell"],
        mode: "named",
        source: "settings",
        session: "01a1fbca",
        recordPath: "/tmp/muse/sessions/x/session.jsonl",
        recordedAt: "2026-11-20T00:00:00Z",
      },
    },
    ...overrides,
  };
}

describe("toolset attestation from the host record", () => {
  test("bridge-only names in the host's own record are enforced", () => {
    const checks = evaluateContainment(input());
    const observed = checks.find((entry) => entry.id === "tools.bridge-only-observed");
    expect(observed?.status).toBe("enforced");
    expect(observed?.evidence).toContain("session 01a1fbca");
    expect(observed?.evidence).toContain("2 tool(s)");
  });

  test("a foreign name in the host record is a critical breach naming it", () => {
    const checks = evaluateContainment(
      input({
        observedToolset: {
          status: "observed",
          observation: {
            tools: ["mcp__opencode__read", "shell", "write"],
            mode: "named",
            source: "settings",
            session: "01a1fbcb",
            recordPath: "/tmp/muse/sessions/x/session.jsonl",
            recordedAt: "2026-11-20T00:00:00Z",
          },
        },
      }),
    );
    const observed = checks.find((entry) => entry.id === "tools.bridge-only-observed");
    expect(observed?.status).toBe("breached");
    expect(observed?.evidence).toContain("foreign: shell,write");
    expect(containmentVerdict(checks).level).toBe("blocked");
  });

  test("no record yet is degraded, not enforced and not blocking", () => {
    const checks = evaluateContainment(input({ observedToolset: { status: "absent", root: "/tmp/muse/sessions" } }));
    const observed = checks.find((entry) => entry.id === "tools.bridge-only-observed");
    expect(observed?.status).toBe("degraded");
    expect(observed?.evidence).toBe("no session record yet");
    expect(containmentVerdict(checks).level).toBe("degraded");
  });

  test("an unreadable record is unknown and blocks strict startup", () => {
    const checks = evaluateContainment(
      input({ observedToolset: { status: "unreadable", root: "/tmp/muse/sessions", error: "no toolset block" } }),
    );
    expect(checks.find((entry) => entry.id === "tools.bridge-only-observed")?.status).toBe("unknown");
    expect(containmentVerdict(checks).level).toBe("blocked");
  });
});

describe("containment report", () => {
  test("a fully observed host is enforced everywhere", () => {
    const checks = evaluateContainment(input());
    expect(checks.every((entry) => entry.status === "enforced")).toBe(true);
    expect(containmentVerdict(checks).level).toBe("ok");
  });

  test("a non-bridge tool call is a critical breach", () => {
    const checks = evaluateContainment(input({ extraToolCalls: 1 }));
    const tools = checks.find((entry) => entry.id === "tools.bridge-only");
    expect(tools?.status).toBe("breached");
    const verdict = containmentVerdict(checks);
    expect(verdict.level).toBe("blocked");
    expect(verdict.criticalFailures.map((entry) => entry.id)).toContain("tools.bridge-only");
  });

  test("an unprobed prompt is unknown and blocks strict startup", () => {
    const checks = evaluateContainment(input({ promptDelivery: "unknown" }));
    expect(checks.find((entry) => entry.id === "prompt.instructions")?.status).toBe("unknown");
    expect(containmentVerdict(checks).level).toBe("blocked");
  });

  test("a failed prompt probe is a breach", () => {
    const checks = evaluateContainment(input({ promptDelivery: "fail" }));
    expect(checks.find((entry) => entry.id === "prompt.instructions")?.status).toBe("breached");
  });

  test("a missing private config is unknown, never enforced", () => {
    const checks = evaluateContainment(input({ hostConfig: null }));
    expect(checks.find((entry) => entry.id === "tools.bridge-only")?.status).toBe("unknown");
    expect(checks.find((entry) => entry.id === "loop.configured-off")?.status).toBe("unknown");
    expect(containmentVerdict(checks).level).toBe("blocked");
  });

  test("a loop-owning item kind is a breach", () => {
    const checks = evaluateContainment(input({ loopItemKinds: ["subagent"] }));
    expect(checks.find((entry) => entry.id === "loop.configured-off")?.status).toBe("breached");
  });

  test("the loop check reports the reminder switch as configuration, not behavior", () => {
    const loop = evaluateContainment(input()).find((entry) => entry.id === "loop.configured-off");
    expect(loop?.statement).toContain("configured off");
    expect(loop?.evidence).toContain("config only");
  });

  test("the report names every invariant in one screen", () => {
    const report = formatContainmentReport(evaluateContainment(input()));
    for (const id of [
      "tools.bridge-only",
      "loop.configured-off",
      "history.opencode-authority",
      "prompt.instructions",
      "quota.no-utility-turns",
      "session.transport-only",
      "bridge.loopback",
      "identity.host-ids",
    ]) {
      expect(report).toContain(id);
    }
    expect(report).toContain("[critical]");
  });
});

describe("runtime containment", () => {
  function sessionHost(commands: Array<{ method: string; params: Record<string, unknown> }>): SessionHost {
    return {
      connection: {
        mintCommandId: () => "cmd",
        command: async (method: string, params: Record<string, unknown>) => {
          commands.push({ method, params });
          return {};
        },
      },
      registerSink: () => {},
      unregisterSink: () => {},
    };
  }

  test("a non-bridge tool is counted and reported once", async () => {
    const session = await MuseHarnessSession.create(sessionHost([]), {
      sessionId: "oc",
      cwd: "/tmp",
      containment: "warn",
      toolBridge: {
        listTools: () => [],
        callTool: async () => ({ content: [{ type: "text", text: "ok" }], isError: false }),
      },
    });
    const events: unknown[] = [];
    const collecting = (async () => {
      for await (const event of session.subscribe()) events.push(event);
    })();
    for (const id of ["t1", "t2"]) {
      session.handleNotification({
        method: "item/started",
        params: {
          item: { itemId: id, kind: "toolCall", turnId: "turn", tool: "bash", args: "{}" },
        },
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(session.containmentBreachCount).toBe(2);
    expect(events.filter((event) => (event as { type?: string }).type === "session.error")).toHaveLength(1);
    await session.close();
    await collecting;
  });

  test("the bridge namespace is not a breach", async () => {
    const session = await MuseHarnessSession.create(sessionHost([]), {
      sessionId: "oc",
      cwd: "/tmp",
      containment: "warn",
      toolBridge: {
        listTools: () => [],
        callTool: async () => ({ content: [{ type: "text", text: "ok" }], isError: false }),
      },
    });
    session.handleNotification({
      method: "item/started",
      params: {
        item: {
          itemId: "t1",
          kind: "toolCall",
          turnId: "turn",
          tool: "mcp__opencode__lookup",
          args: "{}",
        },
      },
    });
    expect(session.containmentBreachCount).toBe(0);
    await session.close();
  });
});
