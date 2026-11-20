import { CONTRIBUTOR_SUFFIX } from "./host.js";

/**
 * Model limits without a lying fallback.
 *
 * The old code reported 1,048,576 tokens whenever the catalog omitted a
 * context limit. That is the worst direction to be wrong: opencode compacts
 * late, Muse compacts first, and the adapter cannot see the rewrite. An
 * unknown window must fall back *below* the real one, never above it.
 */

export const FALLBACK_CONTEXT_LIMIT = 128_000;
export const FALLBACK_OUTPUT_LIMIT = 8_192;

/**
 * Per-model context limits recovered from a pinned host's `model/list`.
 * Empty until a `scripts/compat.ts` run records real values; an empty table
 * simply falls through to the conservative default.
 */
export const MODEL_CONTEXT_LIMITS: Readonly<Record<string, number>> = {};

/** Per-model output limits, same provenance as the context table. */
export const MODEL_OUTPUT_LIMITS: Readonly<Record<string, number>> = {};

export type LimitSource = "override" | "catalog" | "table" | "fallback";

export interface LimitResolution {
  readonly value: number;
  readonly source: LimitSource;
}

export interface ModelLimits {
  readonly context: LimitResolution;
  readonly output: LimitResolution;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function envLimit(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim().length === 0) return undefined;
  const value = Number(raw);
  return finitePositive(value) ? Math.floor(value) : undefined;
}

/** A contributor variant shares its base model's limits. */
export function baseModelId(modelId: string): string {
  return modelId.endsWith(CONTRIBUTOR_SUFFIX)
    ? modelId.slice(0, -CONTRIBUTOR_SUFFIX.length)
    : modelId;
}

function resolve(
  catalogValue: unknown,
  table: Readonly<Record<string, number>>,
  modelId: string,
  override: number | undefined,
  fallback: number,
): LimitResolution {
  if (override !== undefined) return { value: override, source: "override" };
  if (finitePositive(catalogValue)) return { value: Math.floor(catalogValue), source: "catalog" };
  const fromTable = table[baseModelId(modelId)] ?? table[modelId];
  if (finitePositive(fromTable)) return { value: fromTable, source: "table" };
  return { value: fallback, source: "fallback" };
}

/** Resolve one model's context and output limits and where each came from. */
export function resolveModelLimits(
  model: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
  contextTable: Readonly<Record<string, number>> = MODEL_CONTEXT_LIMITS,
  outputTable: Readonly<Record<string, number>> = MODEL_OUTPUT_LIMITS,
): ModelLimits {
  const modelId = String(model.modelId ?? "");
  return {
    context: resolve(
      model.contextLimit,
      contextTable,
      modelId,
      envLimit(env.MUSE_CONTEXT_LIMIT),
      FALLBACK_CONTEXT_LIMIT,
    ),
    output: resolve(
      model.outputLimit,
      outputTable,
      modelId,
      envLimit(env.MUSE_OUTPUT_LIMIT),
      FALLBACK_OUTPUT_LIMIT,
    ),
  };
}
