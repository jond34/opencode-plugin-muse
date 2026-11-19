/**
 * opencode variant -> Muse reasoning effort.
 *
 * opencode applies a model's variant last, then the provider sees it as
 * `request.model.variant` on the model.request hook. Muse takes the effort per
 * turn (`turn/start.reasoningEffort`), so the plugin carries the value across
 * the provider boundary in a request header and resolves it here.
 *
 * The vocabulary is closed on purpose: a typo must fail loudly instead of
 * silently running at Muse's default. A tier the model knows but does not offer
 * also fails, because choosing another tier would change the request the user
 * made. Only an omitted variant or `"default"` leaves the choice to Muse.
 */

export const EFFORT_ORDER = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const;

export type EffortTier = (typeof EFFORT_ORDER)[number];

export interface ModelEffort {
  /** Tiers this model offers, in catalog order. */
  readonly variants?: readonly string[];
}

export class UnsupportedEffortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedEffortError";
  }
}

function isTier(value: unknown): value is EffortTier {
  return typeof value === "string" && (EFFORT_ORDER as readonly string[]).includes(value);
}

/**
 * Resolve one request's effort.
 *
 * - no variant or `"default"`: omit the field and let Muse use its own default
 * - `"off"`: `"none"`
 * - an unknown tier: throw, because the request names something Muse cannot run
 * - a known tier the model does not offer: throw, because substituting another
 *   tier would not be the request the user made
 */
export function resolveEffort(
  model: ModelEffort | undefined,
  variant: string | undefined,
): EffortTier | undefined {
  if (variant === undefined || variant.length === 0) return undefined;
  if (variant === "default") return undefined;
  if (variant === "off") return "none";
  if (!isTier(variant)) {
    throw new UnsupportedEffortError(
      `Unknown reasoning effort "${variant}"; expected one of ${EFFORT_ORDER.join(", ")}`,
    );
  }
  const offered = (model?.variants ?? []).filter(isTier);
  if (offered.length === 0) {
    throw new UnsupportedEffortError(
      `Reasoning effort "${variant}" is not offered by this model`,
    );
  }
  if (offered.includes(variant)) return variant;
  throw new UnsupportedEffortError(
    `Reasoning effort "${variant}" is not offered by this model; expected one of ${offered.join(", ")}`,
  );
}

/** Build the per-model effort table from the Muse catalog rows. */
export function buildEffortCatalog(
  models: ReadonlyArray<Record<string, unknown>>,
): Map<string, ModelEffort> {
  const catalog = new Map<string, ModelEffort>();
  for (const model of models) {
    const modelId = typeof model.modelId === "string" ? model.modelId : undefined;
    if (modelId === undefined) continue;
    const variants = Array.isArray(model.variants)
      ? model.variants
          .map((variant) =>
            typeof variant === "string"
              ? variant
              : typeof (variant as { id?: unknown })?.id === "string"
                ? (variant as { id: string }).id
                : undefined,
          )
          .filter((variant): variant is string => variant !== undefined)
      : [];
    catalog.set(modelId, { variants });
  }
  return catalog;
}
