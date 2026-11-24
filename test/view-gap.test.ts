import { expect, spyOn, test } from "bun:test";
import type { HarnessEvent } from "../src/contract/index.js";
import type { MuseNotification } from "../src/host.js";
import { MuseHarnessSession, type SessionHost } from "../src/session.js";

interface RecordedRequest {
  method: string;
  params: Record<string, unknown>;
}

interface FakeHost {
  host: SessionHost;
  requests: RecordedRequest[];
}

/**
 * A host whose connection can page the view. Omit `page` to model a replay
 * host or double that has no request mode: a gap must then degrade to a
 * warning instead of throwing.
 */
function fakeHost(page?: () => Promise<Record<string, unknown>>): FakeHost {
  const requests: RecordedRequest[] = [];
  const host: SessionHost = {
    connection: {
      mintCommandId: () => "cmd-0",
      command: async (method: string) => (method === "turn/start" ? { turnId: "native-1" } : {}),
      ...(page === undefined
        ? {}
        : {
            request: async (method: string, params: Record<string, unknown>) => {
              requests.push({ method, params });
              return page();
            },
          }),
    },
    registerSink: () => {},
    unregisterSink: () => {},
  };
  return { host, requests };
}

async function drive(session: MuseHarnessSession, body: () => Promise<void>): Promise<HarnessEvent[]> {
  const events: HarnessEvent[] = [];
  const collecting = (async () => {
    for await (const event of session.subscribe()) events.push(event);
  })();
  await body();
  await session.close();
  await collecting;
  return events.filter((event) => event.type !== "session.updated");
}

function open(host: SessionHost): MuseHarnessSession {
  return MuseHarnessSession.fromNativeSession(host, { sessionId: "oc", cwd: "/tmp" }, "native");
}

async function start(session: MuseHarnessSession): Promise<void> {
  await session.startTurn({ turnId: "t1", message: { content: [{ type: "text", text: "hi" }] } });
}

test("a view gap is spliced from its after bound and settles the turn", async () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  const { host, requests } = fakeHost(async () => ({
    events: [
      {
        method: "turn/completed",
        params: { turnId: "native-1", sessionId: "native", terminal: "completed" },
      },
    ],
    // Equal to the gap's `next`: the page covers the range, so paging stops.
    nextCursor: "c2",
  }));
  const session = open(host);
  const events = await drive(session, async () => {
    await start(session);
    session.handleNotification({
      method: "view/gap",
      params: { after: "c1", next: "c2", sessionId: "native" },
    } satisfies MuseNotification);
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(requests).toHaveLength(1);
  expect(requests[0]).toEqual({
    method: "view/page",
    params: { sessionId: "native", cursor: "c1", direction: "forward", limit: 1000 },
  });
  const terminal = events.find((event) => event.type === "turn.terminal");
  expect(terminal?.type === "turn.terminal" ? terminal.turn.id : undefined).toBe("t1");
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test("a live frame that arrives during the fill is delivered after the page", async () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  const { host } = fakeHost(async () => {
    // Hold the page open long enough for the live frame to arrive behind it.
    await new Promise((resolve) => setTimeout(resolve, 20));
    return {
      events: [
        {
          method: "item/started",
          params: {
            sessionId: "native",
            item: { itemId: "m1", kind: "agentMessage", turnId: "native-1", status: "inProgress" },
          },
        },
      ],
      nextCursor: "c2",
    };
  });
  const session = open(host);
  const events = await drive(session, async () => {
    await start(session);
    session.handleNotification({
      method: "view/gap",
      params: { after: "c1", next: "c2", sessionId: "native" },
    } satisfies MuseNotification);
    session.handleNotification({
      method: "item/completed",
      params: {
        sessionId: "native",
        item: {
          itemId: "m1",
          kind: "agentMessage",
          turnId: "native-1",
          status: "completed",
          text: "late",
        },
      },
    } satisfies MuseNotification);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
  expect(events.map((event) => event.type)).toEqual([
    "turn.started",
    "message.started",
    "message.completed",
  ]);
  warn.mockRestore();
});

test("a failed fill still drains what waited on it", async () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  const { host } = fakeHost(async () => {
    throw new Error("gone");
  });
  const session = open(host);
  const events = await drive(session, async () => {
    await start(session);
    session.handleNotification({
      method: "view/gap",
      params: { after: "c1", next: "c2", sessionId: "native" },
    } satisfies MuseNotification);
    session.handleNotification({
      method: "item/started",
      params: {
        sessionId: "native",
        item: { itemId: "m1", kind: "agentMessage", turnId: "native-1", status: "inProgress" },
      },
    } satisfies MuseNotification);
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  // The live frame is not swallowed by the failed repair.
  expect(events.map((event) => event.type)).toContain("message.started");
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test("a host without a request surface leaves the session usable", async () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  const { host } = fakeHost();
  const session = open(host);
  const events = await drive(session, async () => {
    await start(session);
    session.handleNotification({
      method: "view/gap",
      params: { after: "c1", next: "c2", sessionId: "native" },
    } satisfies MuseNotification);
    // The gap could not be repaired, but the live stream carries on.
    session.handleNotification({
      method: "turn/completed",
      params: { turnId: "native-1", sessionId: "native", terminal: "completed" },
    } satisfies MuseNotification);
    const next = await session.startTurn({
      turnId: "t2",
      message: { content: [{ type: "text", text: "again" }] },
    });
    expect(next.id).toBe("t2");
  });
  const terminal = events.find((event) => event.type === "turn.terminal");
  expect(terminal?.type === "turn.terminal" ? terminal.turn.id : undefined).toBe("t1");
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});
