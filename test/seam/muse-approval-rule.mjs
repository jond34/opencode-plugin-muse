/**
 * E44: can a locally-persistent `tool` approval let a bridged MCP call run
 * under `denyUnmatched`?
 *
 * Session 1 starts with `onRequest`, asks the model to call the fixture's
 * `echo` tool, and chooses the `localPersistent` allow choice when Muse asks.
 * Session 2 starts with `denyUnmatched` and the same MCP server. The result
 * records whether the tool runs, whether an approval was requested again, and
 * the policy store path/rule preview. Capped at three turns.
 *
 * Run under `zsh -lc` so Muse's provider credentials are loaded.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MuseClient } from "@muse-code/sdk";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "..", "fixtures", "fake-mcp-tool.mjs");
const OUT = join(HERE, "..", "..", "scratch", "r27-e44-result.json");
const MAX_TURNS = 3;

const workdir = mkdtempSync(join(tmpdir(), "muse-e44-"));
const mcpLog = join(workdir, "mcp.log");
const prompt = "Call the echo tool once with the text hi. Do not answer in text.";

const result = {
  experiment: "E44",
  date: "2026-11-24",
  muse: "1.4.25",
  prompt,
  turns: 0,
  sessions: [],
  approvals: [],
  policyStore: null,
  finding: null,
};

function toolCalls(items) {
  return items
    .filter((item) => item.kind === "toolCall")
    .map((item) => ({ toolName: item.tool, status: item.status, approvalId: item.approvalId }));
}

function choices(view) {
  return view.availableChoices.map((choice) => ({
    choiceId: choice.choiceId,
    label: choice.label,
    decision: choice.decision,
    scope: choice.scope,
    rulePreview: choice.rulePreview ?? null,
  }));
}

function handlerFor(session, label) {
  session.onApproval((request) => {
    const offered = choices(request);
    const entry = {
      session: label,
      approvalId: request.approvalId,
      subjectKind: request.subject.kind,
      subjectToolName: request.subject.toolName ?? null,
      toolName: request.toolName,
      choices: offered,
    };
    result.approvals.push(entry);
    const persistent = offered.find(
      (choice) => choice.scope === "localPersistent" && choice.decision === "allow",
    );
    const allow = offered.find((choice) => choice.decision === "allow");
    const reject = offered.find((choice) => choice.decision === "deny");
    const chosen = persistent ?? allow ?? reject ?? offered[0];
    entry.chosen = chosen?.choiceId ?? null;
    return { choiceId: chosen.choiceId };
  });
}

function mcpConfig() {
  return {
    e44: {
      transport: "stdio",
      command: process.execPath,
      args: [FIXTURE],
      env: { FAKE_MCP_LOG: mcpLog },
      framing: "lineDelimitedJson",
      mode: "required",
    },
  };
}

async function open(approvalMode, label) {
  const client = await MuseClient.spawn({
    museBin: "muse",
    args: ["serve", "--trust-workspace"],
    cwd: workdir,
    env: process.env,
    clientInfo: { name: "e44_probe", version: "0" },
    shutdownTimeoutMs: 0,
  });
  const session = await client.startSession({
    workspaceRoot: workdir,
    approvalMode,
    modelId: "muse-spark-1.3",
    config: { mcpServers: mcpConfig() },
  });
  handlerFor(session, label);
  return { client, session };
}

async function turn(session, label) {
  if (result.turns >= MAX_TURNS) return null;
  result.turns += 1;
  const run = await session.run(prompt, { signal: AbortSignal.timeout(180_000) });
  const entry = {
    session: label,
    turnId: run.turnId,
    outcome: run.outcome,
    finalText: run.finalText ?? null,
    toolCalls: toolCalls(run.items),
    usage: run.usage ?? null,
  };
  result.sessions.push(entry);
  return entry;
}

function findPolicyStore() {
  const roots = [
    join(homedir(), ".config", "muse"),
    join(homedir(), ".local", "share", "muse"),
    join(homedir(), ".muse"),
  ].filter((path) => existsSync(path));
  for (const root of roots) {
    try {
      const found = execFileSync("find", [root, "-name", "approval-policy.json"], {
        encoding: "utf8",
        timeout: 10_000,
      }).trim();
      if (found !== "") return found.split("\n")[0];
    } catch {
      // Keep looking; an absent root is not a failure.
    }
  }
  return null;
}

function readStore(path) {
  if (path === null) return null;
  try {
    const text = readFileSync(path, "utf8");
    return {
      path,
      bytes: text.length,
      matchingLines: text
        .split("\n")
        .filter((line) => /e44|echo/i.test(line))
        .slice(0, 20),
    };
  } catch (error) {
    return { path, error: String(error) };
  }
}

let clientA;
let clientB;
try {
  const first = await open("onRequest", "onRequest");
  clientA = first.client;
  let firstTurn = await turn(first.session, "onRequest");
  if (firstTurn !== null && firstTurn.toolCalls.length === 0 && result.turns < MAX_TURNS) {
    firstTurn = await turn(first.session, "onRequest-retry");
  }
  await first.client.close().catch(() => undefined);
  clientA = undefined;

  const storePath = findPolicyStore();
  result.policyStore = readStore(storePath);

  const second = await open("denyUnmatched", "denyUnmatched");
  clientB = second.client;
  let secondTurn = await turn(second.session, "denyUnmatched");
  if (secondTurn !== null && secondTurn.toolCalls.length === 0 && result.turns < MAX_TURNS) {
    secondTurn = await turn(second.session, "denyUnmatched-retry");
  }
  result.finding = {
    firstToolRan: result.sessions.some(
      (entry) =>
        entry.session.startsWith("onRequest") &&
        entry.toolCalls.some((call) => call.status === "completed"),
    ),
    secondToolRan: result.sessions.some(
      (entry) =>
        entry.session.startsWith("denyUnmatched") &&
        entry.toolCalls.some((call) => call.status === "completed"),
    ),
    secondToolRejected: result.sessions.some(
      (entry) =>
        entry.session.startsWith("denyUnmatched") &&
        entry.toolCalls.some((call) => call.status === "rejected"),
    ),
    secondApprovalRequested: result.approvals.some((entry) =>
      entry.session.startsWith("denyUnmatched"),
    ),
    mcpReached: existsSync(mcpLog)
      ? readFileSync(mcpLog, "utf8").split("\n").filter(Boolean).length
      : 0,
  };
} catch (error) {
  result.error = String(error);
} finally {
  await clientA?.close().catch(() => undefined);
  await clientB?.close().catch(() => undefined);
}

writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
rmSync(workdir, { recursive: true, force: true });
