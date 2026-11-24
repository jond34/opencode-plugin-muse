/**
 * E44's minimal MCP server: one `echo` tool, newline-delimited JSON-RPC.
 *
 * `FAKE_MCP_LOG` gets one JSON line per request, so the probe can tell whether
 * Muse actually reached `tools/call` in the second session.
 */
import { appendFileSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";

const logFile = process.env.FAKE_MCP_LOG;
const log = (entry) => {
  if (logFile !== undefined) appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
};

const respond = (id, result) => {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
};

const decoder = new StringDecoder("utf8");
let buffer = "";

process.stdin.on("data", (chunk) => {
  buffer += decoder.write(chunk);
  let newline;
  while ((newline = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line === "") continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.id === undefined || typeof message.method !== "string") continue;
    log({ method: message.method, params: message.params ?? null });
    if (message.method === "initialize") {
      respond(message.id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "e44-fixture", version: "0.1.0" },
      });
      continue;
    }
    if (message.method === "tools/list") {
      respond(message.id, {
        tools: [
          {
            name: "echo",
            description: "Echo the text argument back.",
            inputSchema: {
              type: "object",
              properties: { text: { type: "string" } },
              required: ["text"],
            },
          },
        ],
      });
      continue;
    }
    if (message.method === "tools/call") {
      const text = message.params?.arguments?.text ?? "";
      respond(message.id, {
        content: [{ type: "text", text: `echo:${text}` }],
        isError: false,
      });
      continue;
    }
    if (message.method === "ping") {
      respond(message.id, {});
      continue;
    }
    respond(message.id, {});
  }
});
