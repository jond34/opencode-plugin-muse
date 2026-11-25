/**
 * Ask the Muse CLI whether it has a login, for the `/connect` row.
 *
 * The row's `external` method records a choice, not a credential (see
 * `registration.ts`), so opencode marks the row connected the moment somebody
 * clicks it. That tick is honest about the choice and wrong about the login.
 *
 * `muse usage --json` is the read-only answer: it runs no model turn, and when
 * no credential is stored it fails in a few milliseconds with the CLI's own
 * sentence, before any request. The probe never reads `auth.json`, never prints
 * what it gets, and never runs `muse login`.
 *
 * The classification is deliberately three-valued. Offline, a timeout, a
 * renamed subcommand or an expired token can all look like failure, and a wrong
 * "Sign in required" would send people to a login they do not need. Only the
 * exact not-logged-in sentence counts; everything else is "unknown" and leaves
 * the row alone.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** What the probe could establish. */
export type MuseLoginVerdict = "signed-in" | "signed-out" | "unknown";

/** The CLI call. Public so a test can assert it without spawning anything. */
export const MUSE_USAGE_ARGS: readonly string[] = ["usage", "--json"];

/**
 * Generous beside the measured cost: 0.02 s signed out, ~1.2 s signed in. A
 * slow network must not become a "please sign in" banner.
 */
export const LOGIN_PROBE_TIMEOUT_MS = 15_000;

/** The one sentence the CLI prints when no credential is stored. */
const NOT_LOGGED_IN = /not logged in/i;

/** The parts of an `execFile` outcome the verdict needs. */
export interface UsageProbeResult {
  /** Exit code, or `null` when the process was killed or never started. */
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Map one CLI outcome to a verdict.
 *
 * `muse usage --json` exits 0 and prints an allowance object when a login
 * exists. It exits 1 with "not logged in: run `muse login` first" when none
 * does. Any other failure (offline: "usage refresh failed (transient)", a bad
 * argument, a killed process) says nothing about the login.
 */
export function classifyMuseUsage(result: UsageProbeResult): MuseLoginVerdict {
  if (result.code === 0) return "signed-in";
  if (NOT_LOGGED_IN.test(`${result.stdout}\n${result.stderr}`)) return "signed-out";
  return "unknown";
}

export interface MuseProbeOptions {
  /** Environment for the child; defaults to this process's. */
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  /** Aborting kills the child, so a stopping plugin does not wait out the timeout. */
  readonly signal?: AbortSignal;
}

/**
 * Run the probe against the Muse binary this host would use.
 *
 * A missing binary, a Windows `.cmd` shim (which `execFile` cannot start without
 * a shell), a timeout, and an abort all resolve to "unknown". The probe must
 * never be the reason a turn or a start fails, so this function does not throw.
 */
export async function probeMuseLogin(
  museBin: string,
  options: MuseProbeOptions = {},
): Promise<MuseLoginVerdict> {
  const { env = process.env, timeoutMs = LOGIN_PROBE_TIMEOUT_MS, signal } = options;
  try {
    const { stdout } = await execFileAsync(museBin, [...MUSE_USAGE_ARGS], {
      env: { ...env, MUSE_NO_AUTO_UPDATE: "1" },
      timeout: timeoutMs,
      maxBuffer: 1 << 20,
      encoding: "utf8",
      windowsHide: true,
      ...(signal === undefined ? {} : { signal }),
    });
    return classifyMuseUsage({ code: 0, stdout, stderr: "" });
  } catch (error) {
    const failure = error as {
      code?: unknown;
      stdout?: unknown;
      stderr?: unknown;
    };
    if (typeof failure.code === "number") {
      return classifyMuseUsage({
        code: failure.code,
        stdout: typeof failure.stdout === "string" ? failure.stdout : "",
        stderr: typeof failure.stderr === "string" ? failure.stderr : "",
      });
    }
    // ENOENT, EINVAL, a timeout's SIGTERM, an abort: the CLI never answered.
    return "unknown";
  }
}
