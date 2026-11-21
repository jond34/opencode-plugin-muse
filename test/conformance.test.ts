import { describe, expect, test } from "bun:test";
import {
  runHarnessConformance,
  userMessage,
  type HarnessConformanceDriver,
} from "./harness/index.js";
import { MuseHarnessAdapter } from "../src/adapter.js";

/**
 * Harness-specific glue for the shared conformance suite.
 *
 * The scenarios are gated by the adapter's capabilities: this driver provides
 * only `startSimpleTurn`, so the interrupt, approval, and tool-bridge
 * scenarios stay skipped until their drivers are added. That keeps the run
 * deterministic while the adapter is still being built.
 */
const driver: HarnessConformanceDriver = {
  async startSimpleTurn(session, turnId) {
    await session.startTurn({
      turnId,
      message: userMessage("Reply with exactly: ok"),
    });
  },
  async startToolTurn(session, turnId) {
    // Muse asks before running a local MCP tool, unless an existing grant
    // covers it. Answer the way a user would, so the scenario behaves the same
    // either way instead of hanging on an unanswered approval.
    const subscription = session.subscribe();
    const approving = (async () => {
      for await (const event of subscription) {
        if (
          event.type === "request.updated" &&
          event.request.kind === "approval" &&
          event.request.status === "pending" &&
          event.request.turnId === turnId
        ) {
          const option =
            event.request.options?.find((entry) => entry.id === "allow_once") ??
            event.request.options?.[0];
          await session.respondToRequest({
            requestId: event.request.id,
            ...(option ? { optionId: option.id } : {}),
          });
          return;
        }
        if (event.type === "turn.terminal" && event.turn.id === turnId) return;
      }
    })().catch(() => undefined);

    await session.startTurn({
      turnId,
      message: userMessage("Use the lookup tool with q=hello, then reply with the result."),
    });
    await Promise.race([
      approving,
      new Promise((resolve) => setTimeout(resolve, 30_000)),
    ]);
  },
};

const toolBridge = {
  listTools: () => [
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
  ],
  callTool: async (call: { name: string; input: Record<string, unknown> }) => ({
    content: [{ type: "text" as const, text: `echo:${call.name}:${JSON.stringify(call.input)}` }],
  }),
};

describe("MuseHarnessAdapter conformance", () => {
  test(
    "passes the shared scenarios against a real muse serve host",
    async () => {
      const adapter = new MuseHarnessAdapter({
        hostOptions: { preset: "empty", contributorMode: "off", trustWorkspace: true },
      });
      try {
        const result = await runHarnessConformance({
          adapter,
          driver,
          toolBridge,
          timeoutMs: 60_000,
        });
        for (const check of result.checks.filter((entry) => !entry.passed)) {
          console.error(`FAIL ${check.name}: ${check.error}`);
        }
        const names = result.checks.map((check) => check.name);
        expect(names).toContain("simple turn");
        expect(names).toContain("tool bridge");
        expect(result.success).toBe(true);
      } finally {
        await adapter.close();
      }
    },
    { timeout: 120_000 },
  );
});
