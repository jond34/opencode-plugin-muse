import { MuseLanguageModel } from "../../src/language-model.js";
import { MuseSessionRegistry } from "../../src/session-registry.js";
import { FakeAdapter, type FakeScript } from "./fake-language-host.js";

export const PRODUCTION_ARM_MODEL = "muse-spark-1.3";

export function productionArm(script: FakeScript = {}) {
  const adapter = new FakeAdapter(script);
  const registry = new MuseSessionRegistry(adapter);
  const model = new MuseLanguageModel(
    PRODUCTION_ARM_MODEL,
    {},
    registry,
    "muse",
    new Map(),
  );
  return { adapter, registry, model };
}
