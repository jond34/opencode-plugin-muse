import { describe, expect, test } from "bun:test";
import { connect } from "node:net";
import { MuseHarnessAdapter } from "../src/adapter.js";
import type { HarnessEvent } from "../src/contract/index.js";
import { MuseHost, type MuseNotification } from "../src/host.js";
import { MuseHarnessSession, type SessionHost } from "../src/session.js";
import { MuseSessionRegistry, storeKey, type SessionStore } from "../src/session-registry.js";

const STARTED = { "session/start": { session: { sessionId: "native-1", modelId: "muse-spark-1.3" } } };

interface RecordedCommand {
  method: string;
  params: Record<string, unknown>;
}

/** A host that records commands and answers from a fixed method -> result map. */
function fakeHost(
  results: Record<string, Record<string, unknown>> = {},
  grants: readonly string[] = [],
): { host: SessionHost; commands: RecordedCommand[] } {
  const commands: RecordedCommand[] = [];
  let counter = 0;
  const host: SessionHost = {
    connection: {
      mintCommandId: () => `cmd-${counter++}`,
      command: async (method: string, params: Record<string, unknown>) => {
        commands.push({ method, params });
        return results[method] ?? {};
      },
    },
    registerSink: () => {},
    unregisterSink: () => {},
    grantedCapabilities: () => grants,
  };
  return { host, commands };
}

/** Collect every event the session emits until its bus closes. */
async function collect(session: MuseHarnessSession): Promise<HarnessEvent[]> {
  const events: HarnessEvent[] = [];
  for await (const event of session.subscribe()) events.push(event);
  return events;
}

/** Whether anything accepts a TCP connection at this bridge URL. */
function listening(url: string): Promise<boolean> {
  const { hostname, port } = new URL(url);
  return new Promise((resolve) => {
    const socket = connect({ host: hostname, port: Number(port) });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

describe("a host that dies mid-session", () => {
  test("its running turn is retired instead of left waiting", async () => {
    const { host, commands } = fakeHost(STARTED);
    const session = await MuseHarnessSession.create(host, { sessionId: "oc", cwd: "/tmp" });
    const events = collect(session);
    session.handleNotification({
      method: "turn/started",
      params: { turnId: "t1", sessionId: "native-1" },
    } as MuseNotification);
    expect(session.hostExited).toBe(false);

    session.handleHostExit();
    const emitted = await events;

    expect(session.hostExited).toBe(true);
    const terminal = emitted.find(
      (event): event is Extract<HarnessEvent, { type: "turn.terminal" }> =>
        event.type === "turn.terminal",
    );
    expect(terminal?.turn.status).toBe("failed");
    expect(terminal?.failure?.code).toBe("event_stream_failed");
    // A dead host cannot be asked to leave the session.
    expect(commands.some((entry) => entry.method === "session/leave")).toBe(false);
  });

  test("closing on the death path still tears down the bridge socket", async () => {
    const { host, commands } = fakeHost(STARTED, ["sessionMcp"]);
    const session = await MuseHarnessSession.create(host, {
      sessionId: "oc",
      cwd: "/tmp",
      toolBridge: {
        listTools: () => [],
        callTool: async () => ({ content: [{ type: "text", text: "ok" }], isError: false }),
      },
    });
    const started = commands.find((entry) => entry.method === "session/start");
    const config = started?.params.config as
      | { mcpServers?: Record<string, { url: string }> }
      | undefined;
    const url = Object.values(config?.mcpServers ?? {})[0]?.url;
    expect(url).toBeDefined();
    expect(await listening(url!)).toBe(true);

    session.handleHostExit();
    // `close()` is started, not awaited, by the death path.
    for (let attempt = 0; attempt < 50 && (await listening(url!)); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(await listening(url!)).toBe(false);
  });

  test("the adapter spawns a new host after a crash", async () => {
    const original = MuseHost.spawn;
    let spawns = 0;
    let exit = (_value: unknown) => {};
    const firstExit = new Promise((resolve) => {
      exit = resolve;
    });
    const hosts: Array<{ commands: RecordedCommand[] }> = [];
    MuseHost.spawn = (async () => {
      const fake = fakeHost(STARTED);
      spawns += 1;
      hosts.push({ commands: fake.commands });
      return {
        connection: fake.host.connection,
        initializeResult: {},
        fingerprintWarning: undefined,
        exited: spawns === 1 ? firstExit : new Promise(() => {}),
        registerSink: fake.host.registerSink,
        unregisterSink: fake.host.unregisterSink,
        grantedCapabilities: () => [],
        close: async () => {},
      } as unknown as MuseHost;
    }) as typeof MuseHost.spawn;

    try {
      const adapter = new MuseHarnessAdapter({});
      try {
        const first = await adapter.openSession({ sessionId: "oc", cwd: "/tmp" });
        expect(spawns).toBe(1);
        exit({});
        await new Promise((resolve) => setTimeout(resolve, 10));

        const second = await adapter.openSession({ sessionId: "oc", cwd: "/tmp" });
        expect(spawns).toBe(2);
        expect(second).not.toBe(first);
        expect(hosts[1]?.commands.some((entry) => entry.method === "session/start")).toBe(true);
      } finally {
        await adapter.close();
      }
    } finally {
      MuseHost.spawn = original;
    }
  });

  test("a rejected spawn is retried, not cached forever", async () => {
    const original = MuseHost.spawn;
    let attempts = 0;
    MuseHost.spawn = (async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("spawn failed");
      const fake = fakeHost(STARTED);
      return {
        connection: fake.host.connection,
        initializeResult: {},
        fingerprintWarning: undefined,
        exited: new Promise(() => {}),
        registerSink: fake.host.registerSink,
        unregisterSink: fake.host.unregisterSink,
        grantedCapabilities: () => [],
        close: async () => {},
      } as unknown as MuseHost;
    }) as typeof MuseHost.spawn;

    try {
      const adapter = new MuseHarnessAdapter({});
      try {
        await expect(adapter.openSession({ sessionId: "oc", cwd: "/tmp" })).rejects.toThrow(
          "spawn failed",
        );
        const session = await adapter.openSession({ sessionId: "oc", cwd: "/tmp" });
        expect(session.nativeSessionId).toBe("native-1");
        expect(attempts).toBe(2);
      } finally {
        await adapter.close();
      }
    } finally {
      MuseHost.spawn = original;
    }
  });

  test("a dead session is replaced and reopened with its stored id", async () => {
    const map = new Map<string, string>();
    const store: SessionStore = {
      get: async (key) => map.get(key),
      set: async (key, value) => {
        map.set(key, value);
      },
    };
    const opened: Array<Record<string, unknown>> = [];
    let counter = 0;
    const adapter = {
      listModels: async () => [],
      openSession: async (input: Record<string, unknown>) => {
        opened.push(input);
        counter += 1;
        const fake = fakeHost({
          "session/start": {
            session: { sessionId: `native-${counter}`, modelId: "muse-spark-1.3" },
          },
        });
        return MuseHarnessSession.create(fake.host, {
          sessionId: input.sessionId as string,
          cwd: input.cwd as string,
        });
      },
    } as unknown as MuseHarnessAdapter;
    const registry = new MuseSessionRegistry(adapter, store);
    try {
      const first = await registry.get("oc", "/tmp");
      expect(map.get(storeKey("oc"))).toBe("native-1");

      // The host dies under it; the registry must not hand this back.
      const muse = first.muse as MuseHarnessSession;
      muse.handleHostExit();
      await new Promise((resolve) => setTimeout(resolve, 10));

      const second = await registry.get("oc", "/tmp");
      expect(second).not.toBe(first);
      expect(opened[1]?.resumeSessionId).toBe("native-1");
      expect(second.muse.nativeSessionId).toBe("native-2");
    } finally {
      await registry.closeAll();
    }
  });
});
