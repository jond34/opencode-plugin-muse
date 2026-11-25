import { describe, expect, test } from "bun:test";
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import type { HarnessFailure } from "../src/contract/index.js";
import { HEADERS } from "../src/language-model.js";
import { productionArm } from "./harness/production-arm.js";

/**
 * The `/connect` row's second source of truth: a finished turn.
 *
 * A probe can be wrong about the login (it reads the CLI's local answer), but a
 * turn that fails for auth *is* the refusal, and a turn that completes is the
 * login working. The plugin turns both into a connection status, so the registry
 * has to hand the classified failure out without disturbing the stream.
 */

const TOOL = { type: "function" as const, name: "bash", inputSchema: { type: "object" } };

function request(sessionID: string): LanguageModelV3CallOptions {
  return {
    prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    tools: [TOOL],
    headers: {
      [HEADERS.kind]: "primary",
      [HEADERS.session]: sessionID,
      [HEADERS.directory]: "/tmp",
    },
  } as unknown as LanguageModelV3CallOptions;
}

/** Drain one turn. A refusing host may fail the stream; that is the point. */
async function turn(
  model: { doStream: (options: LanguageModelV3CallOptions) => Promise<{ stream: ReadableStream<LanguageModelV3StreamPart> }> },
  sessionID: string,
): Promise<void> {
  try {
    const result = await model.doStream(request(sessionID));
    for await (const _part of result.stream) {
      // Drain: the assertion is on the observer, not on the parts.
    }
  } catch {
    // A failed turn can surface as a rejected stream.
  }
}

/** Poll rather than sleep, so a slow machine is not a failure. */
async function until(what: string, predicate: () => boolean, ms = 3000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > ms) throw new Error(`deadline: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("turn observer", () => {
  test("an auth failure reaches the observer as auth", async () => {
    const { registry, model } = productionArm({ failTurnClass: "auth" });
    const seen: Array<HarnessFailure | null> = [];
    registry.setTurnObserver((failure) => seen.push(failure));

    await turn(model, "ses_observer_auth");
    await until("auth failure observed", () => seen.length > 0);

    expect(seen.at(-1)?.class).toBe("auth");
  });

  test("a completed turn reaches the observer as null", async () => {
    const { registry, model } = productionArm({ answer: "ok" });
    const seen: Array<HarnessFailure | null> = [];
    registry.setTurnObserver((failure) => seen.push(failure));

    await turn(model, "ses_observer_ok");
    await until("completion observed", () => seen.length > 0);

    expect(seen.at(-1)).toBeNull();
  });

  test("another failure class is passed through unchanged", async () => {
    // The plugin ignores these; the registry must not relabel them as auth.
    const { registry, model } = productionArm({ failTurnClass: "unknown" });
    const seen: Array<HarnessFailure | null> = [];
    registry.setTurnObserver((failure) => seen.push(failure));

    await turn(model, "ses_observer_unknown");
    await until("failure observed", () => seen.length > 0);

    expect(seen.at(-1)?.class).toBe("unknown");
  });

  test("an interrupted turn says nothing, so the observer does not fire", async () => {
    // A user pressing stop is not proof that the login works or that it failed.
    const { registry, model } = productionArm({ interruptTurn: true });
    const seen: Array<HarnessFailure | null> = [];
    registry.setTurnObserver((failure) => seen.push(failure));

    await turn(model, "ses_observer_interrupted");

    // The drain ended after `turn.terminal` was handled, so an observer call
    // would already have happened.
    expect(seen).toHaveLength(0);
  });

  test("an observer that throws does not lose the turn", async () => {
    const { registry, model } = productionArm({ answer: "ok" });
    let called = 0;
    registry.setTurnObserver(() => {
      called += 1;
      throw new Error("observer exploded");
    });

    await turn(model, "ses_observer_throws");
    await until("observer called", () => called > 0);

    // The stream settled rather than hanging on the throwing listener.
    expect(called).toBe(1);
  });
});
