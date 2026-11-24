import type { MuseSessionRegistry } from "./session-registry.js";

/**
 * The plugin and the provider entrypoint are separate modules: OpenCode loads
 * the plugin from TypeScript source but imports the provider from its bundled
 * JavaScript. They share the process, so the registry lives on `globalThis`.
 */
const KEY = "__opencodeMuseRegistry__";

export function setGlobalRegistry(registry: MuseSessionRegistry): void {
  (globalThis as Record<string, unknown>)[KEY] = registry;
}

/**
 * The text of an opencode content array: plain string parts and `type: "text"`
 * parts, concatenated in order. Non-text parts (files, images) contribute
 * nothing; callers that need them read them separately.
 */
export function textOfContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push(part);
      continue;
    }
    if (typeof part !== "object" || part === null) continue;
    if ((part as { type?: unknown }).type === "text") {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("");
}
