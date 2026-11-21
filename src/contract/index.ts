/**
 * The contract's outward surface: exactly what `src/` and the test double
 * import. Members used only inside `contract/` are not re-exported here, so
 * the seam is as wide as its implementors need and no wider.
 *
 * This directory is the spec; the implementation one level up reuses the same
 * basenames (`adapter`, `capabilities`, `events`) on purpose. Import from this
 * file, not from the sibling modules.
 */
export type {
  HarnessAdapter,
  HarnessAdapterInfo,
  HarnessRequestResponse,
  HarnessSession,
  HarnessUserMessage,
  InterruptTurnInput,
  OpenSessionInput,
  StartTurnInput,
  SteerTurnInput,
} from "./adapter.js";
export { disabledCapabilities, type HarnessCapabilities } from "./capabilities.js";
export type {
  HarnessContentBlock,
  HarnessFailure,
  HarnessFailureClass,
  HarnessMessage,
  HarnessMessageStatus,
  HarnessRequestStatus,
  HarnessRuntimeRequest,
  HarnessSessionInfo,
  HarnessSessionStatus,
  HarnessSnapshot,
  HarnessToolItem,
  HarnessToolItemStatus,
  HarnessTurn,
  HarnessTurnStatus,
} from "./entities.js";
export { HarnessError, isHarnessError } from "./errors.js";
export type { HarnessEvent } from "./events.js";
export { nativeRef } from "./ids.js";
export type { HarnessToolBridge, HarnessToolResult } from "./tool-bridge.js";
