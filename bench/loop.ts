import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import { HEADERS } from "../src/language-model.js";

/**
 * The opencode agent loop in miniature.
 *
 * This is the missing production-path experiment: every arm runs the real
 * `MuseLanguageModel.doStream`, executes the tool result the task supplies,
 * and feeds it back exactly as opencode would. There is no parallel renderer
 * and no second provider.
 */

export interface BenchTask {
  readonly id: string;
  readonly prompt: string;
  readonly toolName?: string;
  readonly toolCalls?: number;
  readonly toolResult: string;
  readonly toolError?: boolean;
}

export interface LoopOptions {
  /** Start with a conversation before the newest user message. */
  readonly history?: LanguageModelV3Prompt;
  readonly maxSteps?: number;
}

export interface LoopResult {
  readonly steps: number;
  readonly toolCalls: number;
  readonly text: string;
}

export async function collectStream(
  stream: ReadableStream<LanguageModelV3StreamPart>,
): Promise<LanguageModelV3StreamPart[]> {
  const parts: LanguageModelV3StreamPart[] = [];
  for await (const part of stream) parts.push(part);
  return parts;
}

function toolResultOutput(task: BenchTask) {
  return task.toolError
    ? { type: "error-text" as const, value: task.toolResult }
    : { type: "text" as const, value: task.toolResult };
}

/** Run one task through the real provider until it stops asking for tools. */
export async function runLoop(
  model: LanguageModelV3,
  sessionID: string,
  task: BenchTask,
  options: LoopOptions = {},
): Promise<LoopResult> {
  const toolName = task.toolName ?? "lookup";
  const tools = [
    {
      type: "function" as const,
      name: toolName,
      description: "Look up a fact for the task.",
      inputSchema: { type: "object" },
    },
  ];
  let prompt: LanguageModelV3Prompt =
    options.history ?? [
      { role: "system", content: "You are a coding agent." },
      { role: "user", content: [{ type: "text", text: task.prompt }] },
    ];
  let text = "";
  let toolCalls = 0;
  const maxSteps = options.maxSteps ?? 8;

  for (let step = 1; step <= maxSteps; step += 1) {
    const request: LanguageModelV3CallOptions = {
      prompt,
      tools,
      headers: {
        [HEADERS.kind]: "primary",
        [HEADERS.session]: sessionID,
        [HEADERS.directory]: process.cwd(),
      },
    } as unknown as LanguageModelV3CallOptions;
    const result = await model.doStream(request);
    const parts = await collectStream(result.stream);

    const calls: Array<{ toolCallId: string; toolName: string; input: unknown }> = [];
    for (const part of parts) {
      if (part.type === "text-delta") text += part.delta;
      if (part.type === "tool-call") {
        calls.push({ toolCallId: part.toolCallId, toolName: part.toolName, input: part.input });
      }
    }

    if (calls.length === 0) return { steps: step, toolCalls, text };

    toolCalls += calls.length;
    const assistant: LanguageModelV3Prompt[number] = {
      role: "assistant",
      content: [
        ...(text.length > 0 ? [{ type: "text" as const, text }] : []),
        ...calls.map((call) => ({
          type: "tool-call" as const,
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: call.input,
        })),
      ],
    };
    const results: LanguageModelV3Prompt[number] = {
      role: "tool",
      content: calls.map((call) => ({
        type: "tool-result" as const,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: toolResultOutput(task),
      })),
    };
    prompt = [...prompt, assistant, results];
  }
  throw new Error(`Task ${task.id} did not settle within ${maxSteps} steps`);
}
