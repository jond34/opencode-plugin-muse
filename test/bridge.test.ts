import { afterEach, describe, expect, test } from "bun:test";
import { startToolBridgeServer, type ToolBridgeServer } from "../src/bridge.js";
import type { HarnessToolBridge } from "../src/contract/index.js";

let server: ToolBridgeServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

function rpc(url: string, token: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("tool bridge", () => {
  test("binds loopback and rejects requests without the bearer token", async () => {
    const started = await startToolBridgeServer({
      listTools: () => [],
      callTool: async () => ({ content: [] }),
    });
    server = started;
    expect(new URL(started.url).hostname).toBe("127.0.0.1");
    const denied = await fetch(started.url, { method: "POST", body: "{}" });
    expect(denied.status).toBe(401);
  });

  test("initialize answers with a session id header", async () => {
    const started = await startToolBridgeServer({
      listTools: () => [],
      callTool: async () => ({ content: [] }),
    });
    server = started;
    const response = await rpc(started.url, started.token, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("mcp-session-id")).toBeTruthy();
    const payload = (await response.json()) as {
      result: { serverInfo: { name: string } };
    };
    expect(payload.result.serverInfo.name).toBe("opencode-muse-bridge");
  });

  test("a cancelled call aborts the tool and gets no result", async () => {
    let seen: AbortSignal | undefined;
    const started = await startToolBridgeServer({
      listTools: () => [{ name: "slow", inputSchema: { type: "object" } }],
      callTool: (call) =>
        new Promise((_resolve, reject) => {
          seen = call.signal;
          call.signal?.addEventListener("abort", () => reject(new Error("cancelled")));
        }),
    });
    server = started;
    await rpc(started.url, started.token, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });

    const call = rpc(started.url, started.token, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "slow", arguments: {} },
    }).then((response) => response.text());

    // Wait until the call is in flight so the cancel has a target.
    for (let i = 0; i < 100 && seen === undefined; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(seen).toBeDefined();

    const cancel = await rpc(started.url, started.token, {
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: 2, reason: "test" },
    });
    expect(cancel.status).toBe(202);
    expect(seen?.aborted).toBe(true);
    // The response is destroyed, so the cancelled request yields no JSON-RPC
    // result: the connection closes with an empty body.
    expect(await call).toBe("");
  });

  test("an unknown tool is a protocol error, not a tool result", async () => {
    let called = false;
    const started = await startToolBridgeServer({
      listTools: () => [{ name: "lookup", inputSchema: { type: "object" } }],
      callTool: async () => {
        called = true;
        return { content: [] };
      },
    });
    server = started;
    const response = await rpc(started.url, started.token, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "missing", arguments: {} },
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { error?: { code: number } };
    // MCP 2026-07-28 tools: an unknown tool name is InvalidParams, not an
    // execution failure the model could correct.
    expect(payload.error?.code).toBe(-32602);
    expect(called).toBe(false);
  });

  test("a known tool still dispatches", async () => {
    const started = await startToolBridgeServer({
      listTools: () => [{ name: "lookup", inputSchema: { type: "object" } }],
      callTool: async () => ({ content: [{ type: "text", text: "ok" }] }),
    });
    server = started;
    const response = await rpc(started.url, started.token, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "lookup", arguments: { q: "x" } },
    });
    const payload = (await response.json()) as {
      result?: { content: Array<{ type: string; text: string }> };
    };
    expect(payload.result?.content[0]?.text).toBe("ok");
  });

  test("an unknown notification is acknowledged, not answered", async () => {
    const started = await startToolBridgeServer({
      listTools: () => [],
      callTool: async () => ({ content: [] }),
    });
    server = started;
    const response = await rpc(started.url, started.token, {
      jsonrpc: "2.0",
      method: "notifications/bogus",
      params: {},
    });
    expect(response.status).toBe(202);
  });
});
