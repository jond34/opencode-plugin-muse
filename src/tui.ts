/**
 * The TUI half of the allowance warning.
 *
 * A package's `./tui` part loads with its server part — "One entry loads every
 * part" — so this file needs no install step beyond the plugin the user already
 * added. The server half cannot publish a toast (its `Context` is
 * subscribe-only, and v1's `client.tui.publish` has no v2 equivalent), so it
 * writes a notice beside the ledger and this part shows it.
 *
 * The notice is polled rather than pushed: the only channel between the halves
 * is the state directory, and a five-second read of one small file is cheaper
 * than a protocol the package does not have. A shown notice is removed, so a
 * TUI restart does not repeat a warning the person has already read.
 *
 * The part is a plain object typed by the vendor's `Definition`, not a call to
 * `Plugin.define`: that helper is the identity function, and importing the
 * package's runtime pulls in `solid-js`, which is a peer of the TUI and not a
 * dependency here. The type import is erased, so this file stays loadable in a
 * plain bun process.
 */
import type { Plugin } from "@opencode/plugin/tui";
import {
  clearAllowanceNotice,
  isExpiredNotice,
  readAllowanceNotice,
  type AllowanceNotice,
} from "./allowance.js";

/** The id the TUI half registers under. */
export const TUI_PLUGIN_ID = "opencode-muse";

/** How often the notice file is read while the TUI is open. */
export const NOTICE_POLL_MS = 5_000;

/** The smallest surface this part needs, so a test can stand in for the TUI. */
export interface ToastSurface {
  readonly ui: {
    readonly toast: {
      show(options: {
        readonly title?: string;
        readonly message: string;
        readonly variant?: "info" | "success" | "warning" | "error";
        readonly duration?: number;
      }): void;
    };
  };
}

/**
 * Show the pending notice once and remove it. Returns whether a toast was
 * shown. A throwing toast leaves the notice in place for the next attempt.
 */
export function showAllowanceNotice(
  surface: ToastSurface,
  env: NodeJS.ProcessEnv = process.env,
  nowMs: number = Date.now(),
): boolean {
  const notice: AllowanceNotice | null = readAllowanceNotice(env);
  if (notice === null) return false;
  // The window may have reset while the notice waited (a failed toast leaves
  // the file for the next poll). Drop it instead of showing yesterday's wall.
  if (isExpiredNotice(notice, nowMs)) {
    clearAllowanceNotice(env);
    return false;
  }
  try {
    surface.ui.toast.show({
      title: "Muse allowance",
      message: notice.message,
      variant: "warning",
      duration: 8_000,
    });
  } catch {
    return false;
  }
  clearAllowanceNotice(env);
  return true;
}

export const plugin: Plugin.Definition = {
  id: TUI_PLUGIN_ID,
  setup(context) {
    showAllowanceNotice(context);
    const timer = setInterval(() => showAllowanceNotice(context), NOTICE_POLL_MS);
    // A notice poll must never be the reason a process stays alive.
    timer.unref?.();
    return () => clearInterval(timer);
  },
};

export default plugin;
