import type { BenchTask } from "../loop.js";

/**
 * Neutral fixtures. No prompt names the shape being measured (tool use,
 * truncation, error propagation), so a task cannot coach the arm it is
 * supposed to test.
 */
export const TASKS: readonly BenchTask[] = [
  {
    id: "short",
    prompt: "Name two primary colors.",
    toolResult: "not used",
  },
  {
    id: "long",
    prompt: [
      "Read the following project note and summarize the decision it records.",
      "The note is long on purpose: it describes a migration, the two options",
      "the team weighed, the reason the smaller option won, and the follow-up",
      "work that remains. Keep the summary to three sentences.",
    ].join(" "),
    toolResult: "not used",
  },
  {
    id: "lookup",
    prompt: "Look up the current build number and report it with its date.",
    toolName: "lookup",
    toolCalls: 1,
    toolResult: "build 417, 2026-11-18",
  },
  {
    id: "multi",
    prompt: "Look up the build number and the release date, then report both.",
    toolName: "lookup",
    toolCalls: 2,
    toolResult: "build 417, 2026-11-18",
  },
  {
    id: "error",
    prompt: "Look up the staging endpoint and report what it returned.",
    toolName: "lookup",
    toolCalls: 1,
    toolResult: "lookup failed: no such host",
    toolError: true,
  },
];
