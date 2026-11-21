import { describe, expect, test } from "bun:test";
import { MspError } from "@muse-code/sdk";
import { answerServerRequest, type MuseNotification, type NotificationSink } from "../src/host.js";

function sinkFor(sessionId: string): { sink: NotificationSink; seen: MuseNotification[] } {
  const seen: MuseNotification[] = [];
  return {
    seen,
    sink: { sessionId, handleNotification: (notification) => seen.push(notification) },
  };
}

describe("MSP server requests", () => {
  test("an approval request is routed as approval/requested and acknowledged", () => {
    const { sink, seen } = sinkFor("native");
    const params = {
      sessionId: "native",
      approvalId: "ap1",
      turnId: "t1",
      availableChoices: [{ choiceId: "allow", label: "Allow" }],
    };
    const receipt = answerServerRequest({ method: "approval/request", params }, (id) =>
      id === "native" ? sink : undefined,
    );
    expect(receipt).toEqual({});
    expect(seen).toEqual([{ method: "approval/requested", params }]);
  });

  test("a user-input request is routed as userInput/requested", () => {
    const { sink, seen } = sinkFor("native");
    const params = { sessionId: "native", userInputId: "ui1", questions: [] };
    const receipt = answerServerRequest({ method: "userInput/request", params }, (id) =>
      id === "native" ? sink : undefined,
    );
    expect(receipt).toEqual({});
    expect(seen).toEqual([{ method: "userInput/requested", params }]);
  });

  test("an unknown method is refused with -32601 instead of acknowledged", () => {
    let thrown: unknown;
    try {
      answerServerRequest({ method: "session/fork", params: { sessionId: "native" } }, () => undefined);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MspError);
    expect((thrown as MspError).code).toBe(-32601);
  });

  test("a request for an unregistered session is refused", () => {
    const { sink, seen } = sinkFor("native");
    expect(() =>
      answerServerRequest(
        { method: "approval/request", params: { sessionId: "other", approvalId: "ap1" } },
        (id) => (id === "native" ? sink : undefined),
      ),
    ).toThrow(/-32601|method not found/);
    expect(seen).toEqual([]);
  });
});
