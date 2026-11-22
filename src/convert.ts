import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import type { HarnessEvent } from "./contract/index.js";

/**
 * Convert the harness event stream into AI SDK stream parts.
 *
 * The converter owns the text/reasoning block lifecycle so the stream parts
 * stay balanced (`text-start` before `text-delta` before `text-end`). Tool
 * calls are emitted by the tool bridge, not here: the bridge knows the call id
 * that matches OpenCode's tool result.
 */
export class StreamConverter {
  private textId: string | null = null;
  private reasoningId: string | null = null;
  private textOpen = false;
  private reasoningOpen = false;
  /** The message the open text block belongs to; the id alone cannot say. */
  private textMessage: string | null = null;
  /**
   * Characters already streamed per message id: the offset a completion
   * appends from. No text is retained, so this is an integer, not a buffer.
   */
  private readonly emitted = new Map<string, number>();
  /** Completions already closed. A delta replayed after one must not reopen. */
  private readonly settled = new Set<string>();

  /** Bound the settled set; a late delta arrives within the same step. */
  private settle(messageId: string): void {
    this.settled.add(messageId);
    if (this.settled.size <= 64) return;
    const oldest = this.settled.values().next().value;
    if (oldest !== undefined) this.settled.delete(oldest);
  }

  convert(event: HarnessEvent): LanguageModelV3StreamPart[] {
    const parts: LanguageModelV3StreamPart[] = [];
    switch (event.type) {
      case "message.started":
        if (event.message.role !== "assistant") break;
        // Reasoning items complete separately; a reasoning block is opened on
        // its first delta so an empty item emits nothing.
        break;
      case "message.delta":
        if (event.text) {
          // A replay can deliver a delta after its completion; opening a block
          // then would leave a start with no end.
          if (this.settled.has(event.messageId)) break;
          if (!this.textOpen) {
            this.textId = `text-${event.messageId}`;
            this.textMessage = event.messageId;
            parts.push({ type: "text-start", id: this.textId });
            this.textOpen = true;
          }
          parts.push({ type: "text-delta", id: this.textId!, delta: event.text });
          this.emitted.set(
            event.messageId,
            (this.emitted.get(event.messageId) ?? 0) + event.text.length,
          );
        } else if (event.reasoning) {
          if (!this.reasoningOpen) {
            this.reasoningId = `reasoning-${event.messageId}`;
            parts.push({ type: "reasoning-start", id: this.reasoningId });
            this.reasoningOpen = true;
          }
          parts.push({ type: "reasoning-delta", id: this.reasoningId!, delta: event.reasoning });
        }
        break;
      case "message.completed": {
        const completed = event.message;
        if (completed.role !== "assistant") break;
        const isReasoning = this.reasoningOpen && this.reasoningId === `reasoning-${completed.id}`;
        if (isReasoning) {
          parts.push({ type: "reasoning-end", id: this.reasoningId! });
          this.reasoningOpen = false;
          this.reasoningId = null;
          break;
        }
        // The completed frame carries the reply. Streamed deltas are its
        // prefix, so the characters past the offset are exactly the tail they
        // did not deliver: nothing if they all arrived, the whole reply if none
        // did, and nothing when the surface saturated (the frame is then the
        // shorter one and the preview already showed more than it records).
        const emitted = this.emitted.get(completed.id) ?? 0;
        const final = completed.content
          .map((block) => (block.type === "text" ? block.text : ""))
          .join("");
        const tail = final.slice(emitted);
        const holdsMessage = this.textOpen && this.textMessage === completed.id;
        if (tail.length > 0 && (holdsMessage || !this.textOpen)) {
          if (!holdsMessage) {
            // `text-<id>` is unused when nothing streamed; after a block was
            // closed for this message the id is spent, so the tail is its own
            // part rather than a second start under the same id.
            this.textId = emitted === 0 ? `text-${completed.id}` : `text-${completed.id}-tail`;
            this.textMessage = completed.id;
            parts.push({ type: "text-start", id: this.textId });
            this.textOpen = true;
          }
          parts.push({ type: "text-delta", id: this.textId!, delta: tail });
        }
        if (this.textOpen && this.textMessage === completed.id) {
          parts.push({ type: "text-end", id: this.textId! });
          this.textOpen = false;
          this.textId = null;
          this.textMessage = null;
        }
        this.emitted.delete(completed.id);
        this.settle(completed.id);
        break;
      }
      default:
        break;
    }
    return parts;
  }

  /** Close any open block; used when a step ends mid-block. */
  closeBlocks(): LanguageModelV3StreamPart[] {
    const parts: LanguageModelV3StreamPart[] = [];
    if (this.textOpen && this.textId) parts.push({ type: "text-end", id: this.textId });
    if (this.reasoningOpen && this.reasoningId) {
      parts.push({ type: "reasoning-end", id: this.reasoningId });
    }
    this.textOpen = false;
    this.reasoningOpen = false;
    this.textId = null;
    this.reasoningId = null;
    this.textMessage = null;
    return parts;
  }
}
