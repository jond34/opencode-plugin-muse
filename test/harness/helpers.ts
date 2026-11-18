import type { HarnessEvent, HarnessUserMessage } from "../../src/contract/index.js";

/** Helper to build a user message. */
export function userMessage(text: string): HarnessUserMessage {
  return { content: [{ type: "text", text }] };
}

/** Run one turn on a live session and return the events it produced. */
export async function runTurn(
  session: {
    subscribe(): AsyncIterable<HarnessEvent>;
    startTurn(input: { turnId: string; message: HarnessUserMessage }): Promise<unknown>;
  },
  turnId: string,
  text: string,
): Promise<HarnessEvent[]> {
  const events: HarnessEvent[] = [];
  const terminal = new Promise<HarnessEvent>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`turn ${turnId} timed out`)),
      90_000,
    );
    void (async () => {
      try {
        for await (const event of session.subscribe()) {
          events.push(event);
          if (event.type === "turn.terminal" && event.turn.id === turnId) {
            clearTimeout(timeout);
            resolve(event);
            return;
          }
        }
        clearTimeout(timeout);
        reject(new Error(`event stream ended before the terminal for ${turnId}`));
      }
      catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    })();
  });
  await session.startTurn({ turnId, message: userMessage(text) });
  await terminal;
  return events;
}
