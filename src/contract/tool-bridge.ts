/**
 * Tool bridge: how the host (OpenCode) exposes its own tools to an external
 * harness and how harness tool calls are routed back.
 *
 * The host implements `HarnessToolBridge`. The adapter is responsible for
 * advertising the bridge's tools to its harness through the harness's native
 * mechanism (usually MCP) and for forwarding `tools/call` to `callTool`.
 *
 * A bridge is scoped: the host may change the tool set between turns, so the
 * latest bridge supplied to `openSession`/`startTurn` wins.
 */
interface HarnessToolDefinition {
    readonly name: string;
    readonly description?: string;
    /** JSON Schema object describing the tool input. */
    readonly inputSchema: Record<string, unknown>;
}
interface HarnessToolCall {
    /** Host-generated call id, used for logging and correlation. */
    readonly id: string;
    readonly name: string;
    readonly input: Record<string, unknown>;
    /** Aborted when the caller cancelled the request; stop waiting. */
    readonly signal?: AbortSignal;
}
type HarnessToolContentBlock = {
    readonly type: "text";
    readonly text: string;
} | {
    readonly type: "image";
    readonly mediaType: string;
    readonly data: string;
} | {
    readonly type: "file";
    readonly mediaType: string;
    readonly data: string;
    readonly name?: string;
};
export interface HarnessToolResult {
    readonly content: ReadonlyArray<HarnessToolContentBlock>;
    readonly structuredContent?: unknown;
    readonly isError?: boolean;
}
export interface HarnessToolBridge {
    listTools(): Promise<HarnessToolDefinition[]> | HarnessToolDefinition[];
    callTool(call: HarnessToolCall): Promise<HarnessToolResult>;
    /** Called when the session/turn no longer needs the bridge. */
    close?(): Promise<void> | void;
}