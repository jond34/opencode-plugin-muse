import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * The version this package actually is, read from its own manifest.
 *
 * Two places reported a version and both were literals that drifted: the
 * adapter info said `1.4.15` (a Muse SDK release it was written against) and the
 * host-facing client info defaulted to `0.1.0`. A version an operator uses to
 * debug a handshake has to be the version on disk, so both now read this.
 *
 * `package.json` sits at the package root, which is `..` from `src/` and from
 * `dist/`, so the same relative require works before and after `tsc`.
 *
 * The host's own version is a different fact and comes from
 * `HostFacts.serverVersion`, which is the `serverInfo` the host reports.
 */
export function packageVersion(): string {
  const manifest = require("../package.json") as { version?: unknown };
  return typeof manifest.version === "string" ? manifest.version : "0.0.0";
}
