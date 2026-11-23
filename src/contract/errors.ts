/**
 * Typed errors for the harness contract.
 *
 * Adapters throw `HarnessError` for expected failure modes. The `code` is the
 * stable machine-readable contract; `message` is for humans and logs only.
 */
type HarnessErrorCode = "open_failed" | "close_failed" | "session_stopped" | "protocol_error" | "unsupported" | "interrupt_timeout" | "host_idle_timeout" | "request_failed" | "event_stream_failed" | "usage_limit" | "auth_required" | "invalid_input" | "containment_breach";
interface HarnessErrorOptions {
    readonly code: HarnessErrorCode;
    readonly adapterId: string;
    readonly message: string;
    readonly cause?: unknown;
    readonly retryable?: boolean;
    readonly retryAfterMs?: number;
    /** Opaque harness-specific detail. Never part of the contract. */
    readonly details?: unknown;
}
export class HarnessError extends Error {
    declare readonly code: HarnessErrorCode;
    declare readonly adapterId: string;
    declare readonly retryable: boolean;
    declare readonly retryAfterMs: number | undefined;
    declare readonly details: unknown;

    constructor(options: HarnessErrorOptions) {
        super(options.message);
        this.name = "HarnessError";
        this.code = options.code;
        this.adapterId = options.adapterId;
        this.retryable = options.retryable ?? false;
        this.retryAfterMs = options.retryAfterMs;
        this.details = options.details;
        if (options.cause !== undefined) {
            this.cause = options.cause;
        }
    }
}

export function isHarnessError(value: unknown): value is HarnessError {
    return value instanceof HarnessError;
}
