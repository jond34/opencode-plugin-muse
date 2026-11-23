import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HarnessError } from "../src/contract/index.js";
import {
  blockingHooks,
  forgetHookTrust,
  hookGateRefusal,
  hooksDigest,
  hooksFilePath,
  hooksTrusted,
  PROJECT_HOOKS_ENV,
  readHookCatalog,
  readHookRows,
  readHookTrust,
  recordHookTrust,
  type HookRow,
} from "../src/hooks.js";
import { MuseHarnessSession, type SessionHost } from "../src/session.js";

const PROJECT_ROW: HookRow = {
  enabled: true,
  event: "sessionStart",
  handlerKind: "project",
  key: "/repo/.muse/hooks.json:session_start:def-abc",
};
const PLUGIN_ROW: HookRow = {
  enabled: true,
  event: "preToolUse",
  handlerKind: "plugin",
  key: "plugin:sample-hooks:guard",
};
const USER_ROW: HookRow = { enabled: true, event: "stop", handlerKind: "user", key: "user:stop:notify" };
const MANAGED_ROW: HookRow = {
  enabled: true,
  event: "sessionEnd",
  handlerKind: "managed",
  key: "managed:audit",
};

/** A temp state dir, so a test never reads or writes the real trust record. */
async function stateEnv(): Promise<NodeJS.ProcessEnv> {
  const dir = await mkdtemp(join(tmpdir(), "muse-hook-trust-"));
  return { XDG_STATE_HOME: dir };
}

/** A workspace with a hooks file, returning its root and the file's digest. */
async function workspaceWithHooks(body = '{"hooks":{}}'): Promise<{ root: string; digest: string }> {
  const root = await mkdtemp(join(tmpdir(), "muse-hook-ws-"));
  await mkdir(join(root, ".muse"), { recursive: true });
  await writeFile(hooksFilePath(root), body);
  return { root, digest: hooksDigest(hooksFilePath(root)) as string };
}

interface FakeHost {
  host: SessionHost;
  commands: Array<{ method: string; params: Record<string, unknown> }>;
  requests: string[];
}

/** A host that answers `session/start` and `hook/list` from the given rows. */
function fakeHost(rows: HookRow[] | null): FakeHost {
  const commands: Array<{ method: string; params: Record<string, unknown> }> = [];
  const requests: string[] = [];
  let counter = 0;
  const host: SessionHost = {
    connection: {
      mintCommandId: () => `cmd-${counter++}`,
      command: async (method: string, params: Record<string, unknown>) => {
        commands.push({ method, params });
        if (method === "session/start") return { session: { sessionId: "native-1" } };
        return {};
      },
      request: async (method: string) => {
        requests.push(method);
        if (rows === null) throw new Error("method not found");
        return { hooks: rows };
      },
    },
    registerSink: () => {},
    unregisterSink: () => {},
  };
  return { host, commands, requests };
}

const saved = { hooks: process.env[PROJECT_HOOKS_ENV] };

afterEach(() => {
  if (saved.hooks === undefined) delete process.env[PROJECT_HOOKS_ENV];
  else process.env[PROJECT_HOOKS_ENV] = saved.hooks;
});

describe("hook catalog", () => {
  test("keeps only rows that carry a kind and a key", () => {
    const rows = readHookRows({
      hooks: [
        { enabled: true, event: "stop", handlerKind: "project", key: "k" },
        { event: "stop", key: "no-kind" },
        { handlerKind: "user", key: "no-event" },
        null,
        "junk",
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.enabled).toBe(true);
    expect(rows[1]?.event).toBe("");
  });

  test("a disabled row is not blocking", () => {
    expect(blockingHooks([{ ...PROJECT_ROW, enabled: false }])).toHaveLength(0);
  });

  test("a project row blocks; plugin, managed and user rows do not", () => {
    const blocking = blockingHooks([PROJECT_ROW, PLUGIN_ROW, USER_ROW, MANAGED_ROW]);
    expect(blocking.map((row) => row.handlerKind)).toEqual(["project"]);
  });

  test("an unreadable catalog is unknown, not empty", async () => {
    const { host } = fakeHost(null);
    expect(await readHookCatalog(host, "native-1")).toBeNull();
  });

  test("a host without a request channel is unknown too", async () => {
    const { host } = fakeHost([PROJECT_ROW]);
    const withoutRequest: SessionHost = {
      ...host,
      connection: { mintCommandId: host.connection.mintCommandId, command: host.connection.command },
    };
    expect(await readHookCatalog(withoutRequest, "native-1")).toBeNull();
  });
});

describe("hook gate", () => {
  test("no blocking rows means no refusal", async () => {
    const env = await stateEnv();
    const { root } = await workspaceWithHooks();
    expect(hookGateRefusal([USER_ROW, MANAGED_ROW], root, env)).toBeNull();
    expect(hookGateRefusal([], root, env)).toBeNull();
    expect(hookGateRefusal(null, root, env)).toBeNull();
  });

  test("a project hook in an unaccepted workspace is refused, and the message names it", async () => {
    const env = await stateEnv();
    const { root } = await workspaceWithHooks();
    const refusal = hookGateRefusal([PROJECT_ROW], root, env);
    expect(refusal).toContain("sessionStart:/repo/.muse/hooks.json:session_start:def-abc");
    expect(refusal).toContain(PROJECT_HOOKS_ENV);
    expect(refusal).toContain(hooksFilePath(root));
  });

  test("a plugin hook is allowed with no hooks file, because the user installed it", async () => {
    const env = await stateEnv();
    const root = await mkdtemp(join(tmpdir(), "muse-hook-ws-"));
    expect(hookGateRefusal([PLUGIN_ROW], root, env)).toBeNull();
    // A plugin row does not excuse a repo-supplied file in the same workspace.
    expect(hookGateRefusal([PLUGIN_ROW, PROJECT_ROW], root, env)).not.toBeNull();
  });

  test("an accepted file passes until its bytes change", async () => {
    const env = await stateEnv();
    const { root, digest } = await workspaceWithHooks();
    expect(hookGateRefusal([PROJECT_ROW], root, env)).not.toBeNull();

    recordHookTrust({ canonicalPath: root, hooksSha256: digest, acceptedAtMs: 1 }, env);
    expect(hooksTrusted(root, digest, env)).toBe(true);
    expect(hookGateRefusal([PROJECT_ROW], root, env)).toBeNull();

    await writeFile(hooksFilePath(root), '{"hooks":{"Stop":[]}}');
    expect(hookGateRefusal([PROJECT_ROW], root, env)).not.toBeNull();
  });

  test("a record for another workspace does not carry over", async () => {
    const env = await stateEnv();
    const first = await workspaceWithHooks();
    const second = await workspaceWithHooks();
    recordHookTrust({ canonicalPath: first.root, hooksSha256: first.digest, acceptedAtMs: 1 }, env);
    expect(hookGateRefusal([PROJECT_ROW], second.root, env)).not.toBeNull();
  });

  test("forgetting the record asks again", async () => {
    const env = await stateEnv();
    const { root, digest } = await workspaceWithHooks();
    recordHookTrust({ canonicalPath: root, hooksSha256: digest, acceptedAtMs: 1 }, env);
    expect(forgetHookTrust(root, env)).toBe(true);
    expect(readHookTrust(env)).toHaveLength(0);
    expect(forgetHookTrust(root, env)).toBe(false);
    expect(hookGateRefusal([PROJECT_ROW], root, env)).not.toBeNull();
  });

  test("the env override accepts the same rows for one run", async () => {
    const env = { ...(await stateEnv()), [PROJECT_HOOKS_ENV]: "1" };
    const { root } = await workspaceWithHooks();
    expect(hookGateRefusal([PROJECT_ROW, PLUGIN_ROW], root, env)).toBeNull();
  });

  test("the override accepts only the documented spellings", async () => {
    const base = await stateEnv();
    const { root } = await workspaceWithHooks();
    for (const value of ["1", "true", "ON", "on"]) {
      expect(hookGateRefusal([PROJECT_ROW], root, { ...base, [PROJECT_HOOKS_ENV]: value })).toBeNull();
    }
    for (const value of ["0", "", "yes"]) {
      expect(hookGateRefusal([PROJECT_ROW], root, { ...base, [PROJECT_HOOKS_ENV]: value })).not.toBeNull();
    }
  });
});

describe("session creation", () => {
  test("refuses before any turn and leaves the native session", async () => {
    const root = await mkdtemp(join(tmpdir(), "muse-hook-ws-"));
    delete process.env[PROJECT_HOOKS_ENV];
    const { host, commands, requests } = fakeHost([PROJECT_ROW]);

    let failure: unknown;
    try {
      await MuseHarnessSession.create(host, { sessionId: "oc", cwd: root });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(HarnessError);
    expect((failure as HarnessError).code).toBe("containment_breach");
    expect((failure as HarnessError).message).toContain("repo-supplied hook");
    expect(requests).toEqual(["hook/list"]);
    expect(commands.map((entry) => entry.method)).toEqual(["session/start", "session/leave"]);
    expect(commands.some((entry) => entry.method === "turn/start")).toBe(false);
  });

  test("opens when the override is set", async () => {
    const root = await mkdtemp(join(tmpdir(), "muse-hook-ws-"));
    process.env[PROJECT_HOOKS_ENV] = "1";
    const { host } = fakeHost([PROJECT_ROW]);
    const session = await MuseHarnessSession.create(host, { sessionId: "oc", cwd: root });
    expect(session.nativeSessionId).toBe("native-1");
    await session.close();
  });

  test("opens when the catalog cannot be read", async () => {
    const root = await mkdtemp(join(tmpdir(), "muse-hook-ws-"));
    delete process.env[PROJECT_HOOKS_ENV];
    const { host } = fakeHost(null);
    const session = await MuseHarnessSession.create(host, { sessionId: "oc", cwd: root });
    expect(session.nativeSessionId).toBe("native-1");
    await session.close();
  });
});
