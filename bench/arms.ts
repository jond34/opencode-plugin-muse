import { MuseLanguageModel } from "../src/language-model.js";
import { MuseSessionRegistry } from "../src/session-registry.js";
import { FakeAdapter, type FakeScript } from "./fake-host.js";
import { legacyRender } from "./legacy-renderer.js";

/**
 * Arms are configurations of the production path, never copies of it.
 *
 * `production` uses `renderTranscript` (the default). `legacy` injects the
 * frozen text-only renderer so the audit's baseline can be compared on the
 * same loop, with the same provider and the same fake host.
 */
export type ArmName = "production" | "legacy";

export interface BenchArm {
  readonly name: ArmName;
  readonly adapter: FakeAdapter;
  readonly registry: MuseSessionRegistry;
  readonly model: MuseLanguageModel;
}

export const BENCH_MODEL = "muse-spark-1.3";

export function createArm(name: ArmName, script: FakeScript = {}): BenchArm {
  const adapter = new FakeAdapter(script);
  const registry = new MuseSessionRegistry(adapter);
  const model = new MuseLanguageModel(
    BENCH_MODEL,
    {},
    registry,
    "muse",
    new Map(),
    name === "legacy" ? legacyRender : undefined,
  );
  return { name, adapter, registry, model };
}
