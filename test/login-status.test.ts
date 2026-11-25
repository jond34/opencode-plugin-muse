import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MUSE_USAGE_ARGS,
  classifyMuseUsage,
  probeMuseLogin,
} from "../src/login-status.js";

/** A throwaway executable that prints `stdout`, `stderr` and exits `code`. */
function fakeMuse(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "opencode-muse-login-"));
  roots.push(dir);
  const path = join(dir, "muse");
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("classifyMuseUsage", () => {
  test("exit 0 is a login, whatever it printed", () => {
    expect(classifyMuseUsage({ code: 0, stdout: '{"allowance":{}}', stderr: "" })).toBe("signed-in");
  });

  test("the CLI's own not-logged-in sentence is signed out", () => {
    expect(
      classifyMuseUsage({
        code: 1,
        stdout: "",
        stderr: "muse usage: not logged in: run `muse login` first",
      }),
    ).toBe("signed-out");
  });

  test("an offline refresh is unknown, not signed out", () => {
    // Measured against the real CLI with the proxy pointed at a dead port.
    expect(
      classifyMuseUsage({
        code: 1,
        stdout: "",
        stderr: "muse usage: usage refresh failed (transient)",
      }),
    ).toBe("unknown");
  });

  test("a usage error and a killed process are unknown", () => {
    expect(classifyMuseUsage({ code: 2, stdout: "", stderr: "error: unexpected argument" })).toBe(
      "unknown",
    );
    expect(classifyMuseUsage({ code: null, stdout: "", stderr: "" })).toBe("unknown");
  });
});

describe("probeMuseLogin", () => {
  test("calls the documented read-only subcommand", () => {
    expect([...MUSE_USAGE_ARGS]).toEqual(["usage", "--json"]);
  });

  test.skipIf(process.platform === "win32")("reads a signed-in CLI from exit 0", async () => {
    const bin = fakeMuse("printf '{\"schemaVersion\":1}'; exit 0");
    expect(await probeMuseLogin(bin)).toBe("signed-in");
  });

  test.skipIf(process.platform === "win32")("reads a signed-out CLI from its stderr", async () => {
    const bin = fakeMuse("printf 'not logged in: run `muse login` first' >&2; exit 1");
    expect(await probeMuseLogin(bin)).toBe("signed-out");
  });

  test.skipIf(process.platform === "win32")("a transient failure does not accuse the user", async () => {
    const bin = fakeMuse("printf 'usage refresh failed (transient)' >&2; exit 1");
    expect(await probeMuseLogin(bin)).toBe("unknown");
  });

  test("a missing binary is unknown and does not throw", async () => {
    expect(await probeMuseLogin(join(tmpdir(), "opencode-muse-no-such-binary"))).toBe("unknown");
  });

  test.skipIf(process.platform === "win32")("a timeout is unknown", async () => {
    const bin = fakeMuse("sleep 5");
    expect(await probeMuseLogin(bin, { timeoutMs: 100 })).toBe("unknown");
  });
});
