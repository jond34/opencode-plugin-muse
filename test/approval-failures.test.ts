import { describe, expect, test } from "bun:test";
import { MspError } from "@muse-code/sdk";
import type { HarnessEvent, HarnessRuntimeRequest } from "../src/contract/index.js";
import { MuseHarnessSession, type SessionHost } from "../src/session.js";

/**
 * The three typed failures `approval/decide` can answer with, and what the
 * local request must look like afterwards.
 *
 * `alreadyResolved` carries the winning decision, so the request settles here
 * and nothing is thrown. The other two leave the approval open — the host still
 * holds it — so the request stays `pending`, the requirement is refreshed where
 * the wire carried one, and the caller is told the decision was not applied
 * instead of being left to wait for a resolution that is not coming.
 */

const STARTED = {
  "session/start": { session: { sessionId: "native-1", modelId: "muse-spark-1.3" } },
};

const APPROVAL = {
  approvalId: "ap-1",
  sessionId: "native-1",
  turnId: "t1",
  availableChoices: [
    { choiceId: "yes", label: "Allow", decision: "approved" },
    { choiceId: "no", label: "Deny", decision: "denied" },
  ],
  currentRequirementId: "req-1",
};

interface RecordedCommand {
  method: string;
  params: Record<string, unknown>;
}

function fakeHost(failure?: MspError): { host: SessionHost; commands: RecordedCommand[] } {
  const commands: RecordedCommand[] = [];
  let counter = 0;
  let rejected = false;
  const host: SessionHost = {
    connection: {
      mintCommandId: () => `cmd-${counter++}`,
      command: async (method: string, params: Record<string, unknown>) => {
        commands.push({ method, params });
        // One rejection, like the host's: a retry after the refresh succeeds.
        if (method === "approval/decide" && failure && !rejected) {
          rejected = true;
          throw failure;
        }
        return method === "session/start" ? STARTED["session/start"] : {};
      },
    },
    registerSink: () => {},
    unregisterSink: () => {},
    grantedCapabilities: () => [],
  };
  return { host, commands };
}

function approvalFailure(
  kind: "approvalAlreadyResolved" | "approvalRequirementStale" | "approvalChoiceInvalid",
  extra: Record<string, unknown> = {},
): MspError {
  return new MspError({
    code: -32010,
    message: `host rejected the decision: ${kind}`,
    data: { kind, approvalId: "ap-1", ...extra },
  });
}

async function openWithApproval(failure?: MspError): Promise<{
  session: MuseHarnessSession;
  commands: RecordedCommand[];
  events: HarnessEvent[];
  pending: Promise<void>;
  lastRequest: () => HarnessRuntimeRequest | undefined;
}> {
  const { host, commands } = fakeHost(failure);
  const session = await MuseHarnessSession.create(host, { sessionId: "oc", cwd: "/tmp" });
  const events: HarnessEvent[] = [];
  const pending = (async () => {
    for await (const event of session.subscribe()) events.push(event);
  })();
  session.handleNotification({ method: "approval/requested", params: APPROVAL } as never);
  await new Promise((resolve) => setTimeout(resolve, 10));
  return {
    session,
    commands,
    events,
    pending,
    lastRequest: () =>
      [...events]
        .reverse()
        .find(
          (event): event is Extract<HarnessEvent, { type: "request.updated" }> =>
            event.type === "request.updated" && event.request.id === "ap-1",
        )?.request,
  };
}

describe("typed approval failures", () => {
  test("an already-resolved approval settles locally with the winning decision", async () => {
    const { session, events, pending, lastRequest } = await openWithApproval(
      approvalFailure("approvalAlreadyResolved", {
        resolution: { decision: "approved", resolvedBy: "policy", viewCursor: "c-9" },
      }),
    );

    // The caller must not see this as its failure: the approval did resolve.
    await session.respondToRequest({ requestId: "ap-1", optionId: "no" });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(lastRequest()?.status).toBe("resolved");
    expect(lastRequest()?.resolvedAt).not.toBeNull();
    expect(events.filter((event) => event.type === "request.updated").length).toBe(2);

    await session.close();
    await pending;
  });

  test("a stale requirement is refreshed, and the stale decision is not retried", async () => {
    const { session, commands, pending, lastRequest } = await openWithApproval(
      approvalFailure("approvalRequirementStale", { currentRequirementId: "req-2" }),
    );

    await expect(session.respondToRequest({ requestId: "ap-1", optionId: "yes" })).rejects.toThrow(
      /stale/,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Still open: the host holds the approval, so the user decides again.
    expect(lastRequest()?.status).toBe("pending");

    const decides = () => commands.filter((entry) => entry.method === "approval/decide");
    expect(decides().length).toBe(1);
    expect(decides()[0]?.params.requirementId).toBe("req-1");

    // The next decision carries the requirement the rejection named.
    await session.respondToRequest({ requestId: "ap-1", optionId: "yes" });
    expect(decides().length).toBe(2);
    expect(decides()[1]?.params.requirementId).toBe("req-2");

    await session.close();
    await pending;
  });

  test("an invalid choice keeps the approval open and does not invent a menu", async () => {
    const { session, pending, lastRequest } = await openWithApproval(
      approvalFailure("approvalChoiceInvalid", { choiceId: "yes" }),
    );

    await expect(session.respondToRequest({ requestId: "ap-1", optionId: "yes" })).rejects.toThrow(
      /choice/,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(lastRequest()?.status).toBe("pending");
    // The wire carries the rejected choice, not a replacement menu; the delivered
    // one stays visible rather than being replaced by a local guess.
    expect(lastRequest()?.options?.map((option) => option.id)).toEqual(["yes", "no"]);

    await session.close();
    await pending;
  });

  test("an untyped approval error still escapes unchanged", async () => {
    const other = new MspError({
      code: -32010,
      message: "host rejected the decision: something else",
      data: { kind: "internal", approvalId: "ap-1" },
    });
    const { session, pending } = await openWithApproval(other);

    await expect(session.respondToRequest({ requestId: "ap-1", optionId: "yes" })).rejects.toBe(
      other,
    );

    await session.close();
    await pending;
  });
});
