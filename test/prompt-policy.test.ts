import { describe, expect, test } from "bun:test";
import {
  LiveSession,
  MuseHarnessSession,
  decidePromptPolicy,
  parsePromptDelivery,
  probeInstruction,
  probeSucceeded,
  promptProbeKey,
  type SessionHost,
} from "../src/index.js";

function fakeHost(): SessionHost {
  return {
    connection: {
      mintCommandId: () => "cmd",
      command: async () => ({}),
    },
    registerSink: () => {},
    unregisterSink: () => {},
  };
}

function live(nativeDeveloperPrompt: boolean): LiveSession {
  const session = MuseHarnessSession.fromNativeSession(
    fakeHost(),
    { sessionId: "oc", cwd: "/tmp" },
    "native",
  );
  return new LiveSession("oc", session, { current: [] }, "BE TERSE", false, nativeDeveloperPrompt);
}

describe("prompt policy", () => {
  test("only a passing probe suppresses the preamble", () => {
    expect(decidePromptPolicy("pass")).toEqual({ delivery: "pass", nativeDeveloperPrompt: true });
    expect(decidePromptPolicy("fail")).toEqual({ delivery: "fail", nativeDeveloperPrompt: false });
    expect(decidePromptPolicy("unknown")).toEqual({
      delivery: "unknown",
      nativeDeveloperPrompt: false,
    });
  });

  test("an unrecognized cache value is unknown, not a pass", () => {
    expect(parsePromptDelivery(undefined)).toBe("unknown");
    expect(parsePromptDelivery("yes")).toBe("unknown");
    expect(parsePromptDelivery("pass")).toBe("pass");
    expect(parsePromptDelivery("fail")).toBe("fail");
  });

  test("the probe key is scoped to the schema fingerprint", () => {
    expect(promptProbeKey("sha256:abc")).toBe("v2:prompt:sha256:abc");
    expect(promptProbeKey(null)).toBe("v2:prompt:unknown");
  });

  test("the probe only succeeds when the canary was reproduced", () => {
    expect(probeSucceeded("pineapple", "pineapple")).toBe(true);
    expect(probeSucceeded("The word is Pineapple.", "pineapple")).toBe(true);
    expect(probeSucceeded("I do not know.", "pineapple")).toBe(false);
    expect(probeInstruction("pineapple")).toContain("pineapple");
  });

  test("a host that ignores developerPrompt gets the preamble exactly once", () => {
    const session = live(false);
    expect(session.prependPreamble("BE TERSE")).toBe(true);
    expect(session.prependPreamble("BE TERSE")).toBe(false);
    void session.close();
  });

  test("a verified host does not receive a duplicate preamble", () => {
    const session = live(true);
    expect(session.prependPreamble("BE TERSE")).toBe(false);
    void session.close();
  });

  test("changed instructions are sent once more even after a verified prompt", () => {
    const session = live(true);
    expect(session.prependPreamble("BE TERSE")).toBe(false);
    expect(session.prependPreamble("BE VERY TERSE")).toBe(true);
    expect(session.prependPreamble("BE VERY TERSE")).toBe(false);
    void session.close();
  });
});
