import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultSessionsRoot,
  sessionsRoot,
  probeToolsetObservation,
  sessionRecords,
  toolsetObservationFromJsonl,
} from "../src/toolset-record.js";

function record(activeTools: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    record_type: "event",
    payload_type: "runtime.session",
    recorded_at: "2026-11-20T04:10:00Z",
    payload: { event: { toolset: { active_tools: activeTools, mode: "named", source: "settings", ...extra } } },
  });
}

describe("toolset observation", () => {
  test("reads the last toolset block, host-resolved", () => {
    const text = [
      JSON.stringify({ record_type: "session_started" }),
      record(["mcp__opencode__read"], { mode: "pattern" }),
      record(["mcp__opencode__read", "mcp__opencode__shell"]),
      "",
    ].join("\n");
    const observation = toolsetObservationFromJsonl(text, "/r/sessions/2026/11/20/01a1fbca/session.jsonl");
    expect(observation?.tools).toEqual(["mcp__opencode__read", "mcp__opencode__shell"]);
    expect(observation?.mode).toBe("named");
    expect(observation?.source).toBe("settings");
    expect(observation?.session).toBe("01a1fbca");
    expect(observation?.recordedAt).toBe("2026-11-20T04:10:00Z");
  });

  test("skips a truncated tail and non-string names", () => {
    const text = [record(["mcp__opencode__read", 7]), '{"payload":{"event":{"toolset":{"active_tools":['].join("\n");
    const observation = toolsetObservationFromJsonl(text, "/r/sessions/2026/11/20/01a1fbcb/session.jsonl");
    expect(observation?.tools).toEqual(["mcp__opencode__read"]);
  });

  test("a log with no toolset block yields null", () => {
    const text = JSON.stringify({ record_type: "session_started" });
    expect(toolsetObservationFromJsonl(text, "/r/sessions/2026/11/20/x/session.jsonl")).toBeNull();
  });

  test("probe reports absent, observed, and unreadable distinctly", () => {
    const root = mkdtempSync(join(tmpdir(), "muse-records-"));
    expect(probeToolsetObservation(join(root, "missing"))).toEqual({
      status: "absent",
      root: join(root, "missing"),
    });

    const session = join(root, "sessions", "2026", "11", "20", "01a1fbca");
    mkdirSync(session, { recursive: true });
    writeFileSync(join(session, "session.jsonl"), `${record(["mcp__opencode__read"])}\n`);
    const observed = probeToolsetObservation(join(root, "sessions"));
    expect(observed.status).toBe("observed");
    expect(sessionRecords(join(root, "sessions"))).toEqual([join(session, "session.jsonl")]);

    const broken = join(root, "broken", "2026", "11", "20", "01a1fbcb");
    mkdirSync(broken, { recursive: true });
    writeFileSync(join(broken, "session.jsonl"), "not json at all\n");
    expect(probeToolsetObservation(join(root, "broken")).status).toBe("unreadable");
  });

  // The root is built with `join`, so the expected string has to be too: a
  // POSIX literal compared against a win32 join tests the OS separator, not the
  // precedence rule.
  test("the default root is the Muse sessions dir under the data home", () => {
    expect(defaultSessionsRoot({ XDG_DATA_HOME: "/d" } as NodeJS.ProcessEnv)).toBe(
      join("/d", "muse", "sessions"),
    );
    expect(defaultSessionsRoot({ XDG_DATA_HOME: "", HOME: "/h" } as NodeJS.ProcessEnv)).toBe(
      join("/h", ".local", "share", "muse", "sessions"),
    );
  });

  test("the root prefers the override, then the host's museHome, then XDG", () => {
    const env = { XDG_DATA_HOME: "/d", MUSE_SESSIONS_ROOT: "/o" } as NodeJS.ProcessEnv;
    // The override is returned as written, not rejoined: an empty or relative
    // path is refused elsewhere, and a caller's spelling is kept.
    expect(sessionsRoot({ env, museHome: "/home/tester/.muse" })).toBe("/o");

    const noOverride = { XDG_DATA_HOME: "/d" } as NodeJS.ProcessEnv;
    expect(sessionsRoot({ env: noOverride, museHome: "/home/tester/.muse" })).toBe(
      join("/home/tester/.muse", "sessions"),
    );
    expect(sessionsRoot({ env: noOverride, museHome: "" })).toBe(join("/d", "muse", "sessions"));
    expect(sessionsRoot({ env: noOverride })).toBe(join("/d", "muse", "sessions"));

    // An empty override is not a path; fall through instead of reading `//sessions`.
    const emptyOverride = { MUSE_SESSIONS_ROOT: "", XDG_DATA_HOME: "/d" } as NodeJS.ProcessEnv;
    expect(sessionsRoot({ env: emptyOverride, museHome: "/m" })).toBe(join("/m", "sessions"));
  });
});
