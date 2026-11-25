/**
 * E-D17: the package's `./tui` part is the only surface that can show the
 * allowance warning, because the server half cannot publish a toast.
 *
 * These tests use a stand-in for the TUI context: `showAllowanceNotice` takes
 * the smallest surface it needs, so the wiring is tested without a terminal.
 */
import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  allowanceNoticePath,
  clearAllowanceNotice,
  readAllowanceNotice,
  writeAllowanceNotice,
} from "../src/allowance.js";
import { plugin, showAllowanceNotice, TUI_PLUGIN_ID, type ToastSurface } from "../src/tui.js";

const NOTICE = {
  atMs: 1_700_000_000_000,
  usedPercent: 94,
  // A reset still in the future: a live notice must be shown.
  resetsAtMs: Date.now() + 60 * 60 * 1000,
  message: "[opencode-muse] allowance window 94% used (warning threshold 90%)",
};

async function stateEnv(): Promise<NodeJS.ProcessEnv> {
  const root = await mkdtemp(join(tmpdir(), "muse-tui-"));
  return { XDG_STATE_HOME: root };
}

function surface(): { context: ToastSurface; shown: Array<{ message: string }> } {
  const shown: Array<{ message: string }> = [];
  return {
    shown,
    context: {
      ui: {
        toast: {
          show: (options) => {
            shown.push(options);
          },
        },
      },
    },
  };
}

describe("the allowance notice", () => {
  test("round-trips through the state directory and clears", async () => {
    const env = await stateEnv();
    writeAllowanceNotice(NOTICE, env);
    expect(readAllowanceNotice(env)).toEqual(NOTICE);
    clearAllowanceNotice(env);
    expect(readAllowanceNotice(env)).toBeNull();
  });

  test("a malformed notice is silent, not a crash", async () => {
    const env = await stateEnv();
    const path = allowanceNoticePath(env);
    await writeFile(path, "{ this is not json", { flag: "w" }).catch(async () => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, "{ this is not json");
    });
    expect(readAllowanceNotice(env)).toBeNull();
    const { context, shown } = surface();
    expect(showAllowanceNotice(context, env)).toBe(false);
    expect(shown).toHaveLength(0);
  });

  test("a pending notice is shown once and removed", async () => {
    const env = await stateEnv();
    writeAllowanceNotice(NOTICE, env);
    const { context, shown } = surface();
    expect(showAllowanceNotice(context, env)).toBe(true);
    expect(shown).toHaveLength(1);
    expect(shown[0]?.message).toBe(NOTICE.message);
    // The second poll finds nothing: the person has already read it.
    expect(showAllowanceNotice(context, env)).toBe(false);
    expect(shown).toHaveLength(1);
  });

  test("a notice whose window already reset is dropped, not shown", async () => {
    const env = await stateEnv();
    writeAllowanceNotice({ ...NOTICE, resetsAtMs: Date.now() - 60_000 }, env);
    const { context, shown } = surface();
    // A notice can outlive its window. Showing it would name a reset in the
    // past and a number nobody can act on.
    expect(showAllowanceNotice(context, env)).toBe(false);
    expect(shown).toHaveLength(0);
    expect(readAllowanceNotice(env)).toBeNull();
  });

  test("a throwing toast leaves the notice for the next poll", async () => {
    const env = await stateEnv();
    writeAllowanceNotice(NOTICE, env);
    const failing: ToastSurface = {
      ui: {
        toast: {
          show: () => {
            throw new Error("no ui");
          },
        },
      },
    };
    expect(showAllowanceNotice(failing, env)).toBe(false);
    expect(readAllowanceNotice(env)).not.toBeNull();
  });

  test("setup shows a pending notice and returns a cleanup", async () => {
    const env = await stateEnv();
    writeAllowanceNotice(NOTICE, env);
    const { context, shown } = surface();
    const previous = process.env.XDG_STATE_HOME;
    process.env.XDG_STATE_HOME = env.XDG_STATE_HOME;
    try {
      expect(plugin.id).toBe(TUI_PLUGIN_ID);
      const cleanup = await plugin.setup(context);
      expect(shown).toHaveLength(1);
      expect(typeof cleanup).toBe("function");
      cleanup?.();
    } finally {
      if (previous === undefined) delete process.env.XDG_STATE_HOME;
      else process.env.XDG_STATE_HOME = previous;
    }
  });
});
