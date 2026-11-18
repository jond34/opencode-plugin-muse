import { describe, expect, test } from "bun:test";
import type { HarnessEvent } from "../src/contract/index.js";
import { writeMuseHostConfig } from "../src/host-config.js";
import { MuseHarnessAdapter, MuseHarnessSession } from "../src/index.js";
import { userMessage } from "./harness/helpers.js";

/**
 * Proves the production containment channel: a private Muse config whose
 * settings pin the toolset to the bridge and replace Muse's base prompt. The
 * user's real Muse config (which has its own MCP servers) is not read.
 */

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

async function turn(
  session: MuseHarnessSession,
  turnId: string,
  text: string,
): Promise<HarnessEvent[]> {
  const events: HarnessEvent[] = [];
  const pump = (async () => {
    for await (const event of session.subscribe()) {
      events.push(event);
      if (
        event.type === "request.updated" &&
        event.request.kind === "approval" &&
        event.request.status === "pending"
      ) {
        const option =
          event.request.options?.find((entry) => entry.id === "allow_once") ??
          event.request.options?.[0];
        await session.respondToRequest({
          requestId: event.request.id,
          ...(option ? { optionId: option.id } : {}),
        });
      }
      if (event.type === "turn.terminal" && event.turn.id === turnId) return;
    }
  })();

  await session.startTurn({ turnId, message: userMessage(text) });
  await Promise.race([
    pump,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`turn ${turnId} timed out`)), 120_000),
    ),
  ]);
  return events;
}

function reply(events: HarnessEvent[]): string {
  return events
    .filter((event) => event.type === "message.delta")
    .map((event) => (event.type === "message.delta" ? event.text ?? "" : ""))
    .join("");
}

describe("containment", () => {
  test(
    "the host sees only bridge tools and can call one",
    async () => {
      const config = writeMuseHostConfig();
      const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
      const adapter = new MuseHarnessAdapter({
        hostOptions: {
          env: { ...process.env, XDG_CONFIG_HOME: config.xdg },
          contributorMode: "off",
          trustWorkspace: true,
        },
      });

      try {
        const session = (await adapter.openSession({
          sessionId: "containment",
          cwd: process.cwd(),
          toolBridge: {
            listTools: () => tools,
            callTool: async (call: { name: string; input: Record<string, unknown> }) => {
              calls.push(call);
              return {
                content: [
                  { type: "text" as const, text: `echo:${call.name}:${JSON.stringify(call.input)}` },
                ],
              };
            },
          },
        })) as MuseHarnessSession;

        const listed = await turn(
          session,
          "turn-list",
          "List the exact names of every tool you can call, one per line, and nothing else.",
        );
        const names = reply(listed);
        expect(names).toContain("mcp__opencode.lookup");
        // Muse's built-ins and the user's own Muse MCP servers must be gone.
        expect(names).not.toContain("muse.");
        expect(names).not.toContain("mcp__mcpproxy");

        const called = await turn(
          session,
          "turn-call",
          "Use the lookup tool with q=hello, then reply with exactly the tool output.",
        );
        expect(calls.map((call) => call.name)).toContain("lookup");
        const completed = called.filter((event) => event.type === "tool.completed");
        expect(completed.length).toBeGreaterThan(0);
        const first = completed[0];
        if (first?.type !== "tool.completed") throw new Error("expected tool.completed");
        expect(first.item.status).toBe("completed");
        expect(first.item.output).toContain("echo:lookup");
      } finally {
        await adapter.close();
        config.remove();
      }
    },
    { timeout: 180_000 },
  );
});
