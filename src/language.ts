import type {
  HarnessAdapter,
  HarnessSession,
  OpenSessionInput,
  SteerTurnInput,
} from "./contract/index.js";
import type { ContextUsage } from "./session.js";

/**
 * The language-provider seam.
 *
 * `MuseLanguageModel` and the registry only need a session that can start a
 * turn, switch models, and report its native context. Declaring that here means
 * the bench can drive the real `doStream` path with a deterministic host,
 * instead of reimplementing the provider.
 */
export interface LanguageSession extends HarnessSession {
  /** Native session id, used for resume and persistence. */
  readonly nativeSessionId: string;
  readonly contextUsage: ContextUsage | null;
  /** How the native id was obtained, when the adapter distinguishes it. */
  readonly resumeOutcome?: "started" | "resumed" | "resume_fallback";
  /** True once the host died under this session; it cannot serve a turn again. */
  readonly hostExited?: boolean;
  setModel(model: string): Promise<void>;
  /** The language path always steers; the optional contract member is required here. */
  steerTurn(input: SteerTurnInput): Promise<void>;
}

export interface LanguageOpenSessionInput extends OpenSessionInput {
  readonly resumeSessionId?: string;
  readonly developerPrompt?: string;
  readonly containment?: "strict" | "warn" | "off";
}

export interface LanguageAdapter extends HarnessAdapter {
  listModels(): Promise<Array<Record<string, unknown>>>;
  openSession(input: LanguageOpenSessionInput): Promise<LanguageSession>;
}
