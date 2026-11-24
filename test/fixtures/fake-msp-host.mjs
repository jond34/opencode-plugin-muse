/**
 * A minimal MSP host, for the seam tests that need a real process boundary.
 *
 * It answers `initialize` with a well-formed result (the SDK refuses one with no
 * `schema.fingerprint`) and then follows `FAKE_MSP_MODE`, or the mode named in
 * `FAKE_MSP_MODE_FILE` when that is set (so one test can change the mode between
 * spawns):
 *
 *   answer            — stay alive; answer nothing else.
 *   eof-alive         — end stdout after the handshake and keep running: the
 *                       shape a dead transport with a live process has.
 *   freeze            — stop responding on the first line after the handshake:
 *                       alive, reading nothing, so no request can ever settle.
 *   freeze-after-start — answer `session/start` and `turn/start`, then freeze:
 *                       the turn is admitted and no frame ever arrives.
 *   resume-answer     — answer `session/resume`, and a `turn/start` with a
 *                       started item, a delta, and a completion.
 *
 * `FAKE_MSP_METHODS_FILE` gets one line per request method, so a test can tell
 * a resume from a second start. `userAgent` echoes `NODE_EXTRA_CA_CERTS`, which
 * is how a test sees whether the child inherited the parent's environment.
 * `FAKE_MSP_PIDFILE` gets the pid, and `eof-alive` writes a `<pidfile>.term`
 * marker when SIGTERM arrives, so a test can tell "reaped by the shutdown
 * ladder" from "died on its own".
 *
 * Run it as `process.execPath <this file>`: no shebang, no exec bit, and the
 * same source works under bun and node on every platform.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { StringDecoder } from "node:string_decoder";

/**
 * Stop responding without exiting.
 *
 * POSIX has SIGSTOP; Windows has no such signal, and `process.kill(pid,
 * "SIGSTOP")` throws `ERR_UNKNOWN_SIGNAL` there. That throw killed the fixture
 * 100 ms into the Windows resume test, turning "frozen host" into "host exited"
 * and leaving the turn unannounced — which is why that cell never produced a
 * terminal (E30). Blocking the main thread on a shared buffer is the portable
 * equivalent: no further stdin is read, no timer fires, and the process is still
 * there to be terminated.
 */
function freezeForever() {
  if (process.platform === "win32") {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
    return;
  }
  process.kill(process.pid, "SIGSTOP");
}

const modeFile = process.env.FAKE_MSP_MODE_FILE;
const mode =
  modeFile !== undefined
    ? readFileSync(modeFile, "utf8").trim()
    : (process.env.FAKE_MSP_MODE ?? "answer");
const pidFile = process.env.FAKE_MSP_PIDFILE;
const methodsFile = process.env.FAKE_MSP_METHODS_FILE;

if (pidFile !== undefined) writeFileSync(pidFile, String(process.pid));

const record = (line) => {
  if (methodsFile !== undefined) appendFileSync(methodsFile, `${line}\n`);
};

const respond = (id, result) => {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
};

const notify = (method, params) => {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
};

if (mode === "eof-alive") {
  process.on("SIGTERM", () => {
    if (pidFile !== undefined) writeFileSync(`${pidFile}.term`, "");
    process.exit(0);
  });
}

const initializeResult = {
  experimentalApi: true,
  grantedCapabilities: ["sessionMcp"],
  museHome: tmpdir(),
  platformFamily: process.platform === "darwin" ? "darwin" : "linux",
  platformOs:
    process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux",
  schema: { fingerprint: "fixture-fingerprint" },
  serverInfo: { name: "fixture", version: "0" },
  sessionDurability: "durable",
  userAgent: process.env.NODE_EXTRA_CA_CERTS ?? "env-absent",
};

const decoder = new StringDecoder("utf8");
let buffer = "";
let answered = false;
let sessionId = "fixture-session-1";
let turns = 0;

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
    const isRequest = message.id !== undefined && typeof message.method === "string";
    if (!answered) {
      if (message.method !== "initialize") continue;
      answered = true;
      respond(message.id, initializeResult);
      if (mode === "eof-alive") {
        // The transport is gone from the client's side; the process is not.
        process.stdout.end();
        setInterval(() => {}, 1 << 30);
      }
      continue;
    }
    if (!isRequest) continue;
    if (mode === "freeze") {
      // Stopped with the request still in the pipe: the promise for it can
      // never settle, and neither can anything else sent afterwards.
      freezeForever();
    }
    record(message.method);
    const params = message.params ?? {};
    if (message.method === "session/start") {
      sessionId = typeof params.sessionId === "string" ? params.sessionId : "fixture-session-1";
      respond(message.id, { session: { sessionId, modelId: params.modelId ?? null } });
      if (mode === "freeze-after-start") {
        // Admitted, then silent: the shape the watchdog exists for. The delay
        // lets the ack above flush through the pipe first; freezing in the same
        // tick would leave the ack buffered and the turn unannounced.
        setTimeout(freezeForever, 100);
      }
      continue;
    }
    if (message.method === "session/resume") {
      sessionId = typeof params.sessionId === "string" ? params.sessionId : sessionId;
      respond(message.id, { session: { sessionId } });
      continue;
    }
    if (message.method === "session/leave") {
      respond(message.id, {});
      continue;
    }
    if (message.method === "turn/start") {
      turns += 1;
      const turnId = `fixture-turn-${turns}`;
      respond(message.id, { turnId, startedNewTurn: true });
      if (mode === "resume-answer") {
        notify("turn/started", { sessionId, turnId });
        notify("item/started", {
          sessionId,
          turnId,
          item: { itemId: `item-${turns}`, kind: "message", role: "assistant" },
        });
        notify("item/delta", {
          sessionId,
          turnId,
          itemId: `item-${turns}`,
          delta: { type: "text", text: "hello" },
        });
        notify("turn/completed", { sessionId, turnId, terminal: "completed" });
      }
      continue;
    }
    if (message.method === "turn/interrupt") {
      // A frozen host never answers; a live one acknowledges.
      if (mode !== "freeze-after-start") respond(message.id, {});
      continue;
    }
    // `answer` and `freeze` stay silent past the handshake on purpose; the
    // modes that model a session answer everything else with an empty result.
    if (mode === "resume-answer" || mode === "freeze-after-start") {
      respond(message.id, {});
    }
  }
});
