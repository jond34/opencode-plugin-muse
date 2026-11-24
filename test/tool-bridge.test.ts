import { describe, expect, test } from "bun:test";
import type { HarnessEvent } from "../src/contract/index.js";
import { MuseHarnessAdapter } from "../src/adapter.js";
import { MuseHarnessSession } from "../src/session.js";
import { runTurn } from "./harness/helpers.js";

const tools = [
  {
    name: "lookup",
    description: "Look something up",
    inputSchema: {
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
      additionalProperties: false,
    },
  },
];

describe("tool bridge", () => {
  test(
    "Muse calls an OpenCode tool through the per-session MCP server",
    async () => {
      const adapter = new MuseHarnessAdapter({
        hostOptions: { preset: "empty", contributorMode: "off", trustWorkspace: true },
      });
      const bridge = {
        listTools: () => tools,
        callTool: async (call: { name: string; input: Record<string, unknown> }) => ({
          content: [{ type: "text" as const, text: `echo:${call.name}:${JSON.stringify(call.input)}` }],
        }),
      };

      try {
        const session = await adapter.openSession({
          sessionId: "bridge-test",
          cwd: process.cwd(),
          toolBridge: bridge,
        });

        const events: HarnessEvent[] = [];
        const terminal = new Promise<HarnessEvent>((resolve, reject) => {
          void (async () => {
            const timeout = setTimeout(
              () => reject(new Error("turn timed out")),
              90_000,
            );
            try {
              for await (const event of session.subscribe()) {
                events.push(event);
                if (event.type === "turn.terminal") {
                  clearTimeout(timeout);
                  resolve(event);
                  return;
                }
              }
            } catch (error) {
              clearTimeout(timeout);
              reject(error);
            }
          })();
        });

        await session.startTurn({
          turnId: "turn-bridge",
          message: {
            content: [
              { type: "text", text: "Use the lookup tool with q=hello, then reply with the result." },
            ],
          },
        });

        const done = await terminal;
        expect(done.type).toBe("turn.terminal");
        if (done.type !== "turn.terminal") throw new Error("expected terminal");
        expect(done.turn.status).toBe("completed");

        const completed = events.filter(
          (event) => event.type === "tool.completed",
        );
        expect(completed.length).toBeGreaterThan(0);
        const first = completed[0];
        if (first?.type !== "tool.completed") throw new Error("expected tool.completed");
        expect(first.item.name).toBe("lookup");
        expect(first.item.status).toBe("completed");
        expect(first.item.output).toContain("echo:lookup");
        expect(first.item.output).toContain("hello");
      } finally {
        await adapter.close();
      }
    },
    { timeout: 120_000 },
  );

  test(
    "a second turn carries the first turn's tool result",
    async () => {
      const adapter = new MuseHarnessAdapter({
        hostOptions: { preset: "empty", contributorMode: "off", trustWorkspace: true },
      });
      try {
        const session = (await adapter.openSession({
          sessionId: "multi-turn",
          cwd: process.cwd(),
          toolBridge: {
            listTools: () => tools,
            callTool: async (call: { name: string; input: Record<string, unknown> }) => ({
              content: [{ type: "text" as const, text: `echo:${call.name}:${JSON.stringify(call.input)}` }],
            }),
          },
        })) as MuseHarnessSession;

        const first = await runTurn(
          session,
          "turn-one",
          "Use the lookup tool with q=alpha, then reply with the exact tool output.",
        );
        const called = first.filter((event) => event.type === "tool.completed");
        expect(called.length).toBeGreaterThan(0);
        const call = called[0];
        if (call?.type !== "tool.completed") throw new Error("expected tool.completed");
        expect(call.item.status).toBe("completed");
        expect(call.item.output).toContain("echo:lookup");

        // The failure this guards against is a second turn that throws, fails,
        // or answers empty because the earlier tool result is still in history.
        const second = await runTurn(
          session,
          "turn-two",
          "Reply with the exact tool output text from earlier in this session, and nothing else.",
        );
        const terminal = second.find((event) => event.type === "turn.terminal");
        if (terminal?.type !== "turn.terminal") throw new Error("expected terminal");
        expect(terminal.turn.status).toBe("completed");
        expect(second.some((event) => event.type === "session.error")).toBe(false);

        const reply = second
          .filter((event) => event.type === "message.delta")
          .map((event) => (event.type === "message.delta" ? event.text ?? "" : ""))
          .join("");
        expect(reply).toContain("echo:lookup");
      }
      finally {
        await adapter.close();
      }
    },
    { timeout: 240_000 },
  );
});
