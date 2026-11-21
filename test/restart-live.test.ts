import { describe, expect, test } from "bun:test";
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

const hostOptions = { preset: "empty", contributorMode: "off", trustWorkspace: true };

function toolBridge() {
  return {
    listTools: () => tools,
    callTool: async (call: { name: string; input: Record<string, unknown> }) => ({
      content: [{ type: "text" as const, text: `echo:${call.name}:${JSON.stringify(call.input)}` }],
    }),
  };
}

describe("restart", () => {
  test(
    "a resumed session keeps its context after the host is restarted",
    async () => {
      let nativeId: string;
      const before = new MuseHarnessAdapter({ hostOptions });
      try {
        const session = (await before.openSession({
          sessionId: "restart-source",
          cwd: process.cwd(),
          toolBridge: toolBridge(),
        })) as MuseHarnessSession;
        nativeId = session.nativeSessionId;
        const events = await runTurn(
          session,
          "before-restart",
          "Use the lookup tool with q=alpha, then reply with the exact tool output.",
        );
        expect(events.some((event) => event.type === "tool.completed")).toBe(true);
      }
      finally {
        await before.close();
      }

      // A new adapter means a new muse serve process: the old loopback MCP URL
      // and token are dead, which is the state that breaks resumption elsewhere.
      const after = new MuseHarnessAdapter({ hostOptions });
      try {
        const session = (await after.openSession({
          sessionId: "restart-source",
          cwd: process.cwd(),
          resumeSessionId: nativeId,
          toolBridge: toolBridge(),
        })) as MuseHarnessSession;
        // A fresh fallback would mint a new id; only a real resume keeps this one.
        expect(session.nativeSessionId).toBe(nativeId);

        const events = await runTurn(
          session,
          "after-restart",
          "Reply with the exact tool output from earlier in this session, and nothing else.",
        );
        const terminal = events.find((event) => event.type === "turn.terminal");
        if (terminal?.type !== "turn.terminal") throw new Error("expected terminal");
        expect(terminal.turn.status).toBe("completed");
        expect(events.some((event) => event.type === "session.error")).toBe(false);

        const reply = events
          .filter((event) => event.type === "message.delta")
          .map((event) => (event.type === "message.delta" ? event.text ?? "" : ""))
          .join("");
        expect(reply).toContain("echo:lookup");
      }
      finally {
        await after.close();
      }
    },
    { timeout: 300_000 },
  );
});
