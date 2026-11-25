/**
 * The `/connect` entry for Muse.
 *
 * This mirrors opencode's own `claude-agent` integration: one `external` method
 * that records the user's choice, and no credential. The login itself belongs to
 * the CLI (`muse login`), so neither opencode nor this plugin ever sees a token
 * (see "The subscription credential" in the README).
 *
 * The id is `muse-agent`, not the provider id `muse`: opencode names the
 * claude-agent provider and its integration `claude-agent`, and the display name
 * "Claude Agent" is what `/connect` shows. Muse keeps its existing provider id
 * (the compatibility promise) and gets the parallel name here.
 */

export const MUSE_INTEGRATION_ID = "muse-agent";
export const MUSE_INTEGRATION_NAME = "Muse Agent";

export const MUSE_LOGIN_METHOD = {
  id: "muse-login",
  type: "external",
  label: "Muse CLI login (muse login)",
} as const;

/** The parts of `IntegrationEditor` this module uses, kept structural for tests. */
export interface IntegrationRef {
  id: string;
  name: string;
}

export interface IntegrationEditor {
  get(id: string): IntegrationRef | undefined;
  update(id: string, update: (integration: IntegrationRef) => void): void;
  readonly method: {
    update(input: {
      integrationID: string;
      method: { id: string; type: "external"; label: string };
    }): void;
  };
}

/**
 * Register the Muse row and its one login method.
 *
 * Best-effort: a host without the integration domain, or a rejected write, must
 * not stop the provider from loading. A missing `/connect` row is a smaller loss
 * than a plugin that refuses to start.
 */
export function registerMuseIntegration(
  editor: IntegrationEditor,
  warn: (message: string, error?: unknown) => void = console.warn,
): void {
  try {
    // A record that already exists keeps its name. A future core or user
    // integration may own the id, and this entry only has to exist, not to be
    // renamed.
    if (editor.get(MUSE_INTEGRATION_ID) === undefined) {
      editor.update(MUSE_INTEGRATION_ID, (integration) => {
        integration.name = MUSE_INTEGRATION_NAME;
      });
    }
    // Always registered. The host keys methods by id, so a reload replaces the
    // same method instead of adding a second one.
    editor.method.update({
      integrationID: MUSE_INTEGRATION_ID,
      method: MUSE_LOGIN_METHOD,
    });
  } catch (error) {
    warn("[opencode-muse] could not register the Muse login entry:", error);
  }
}
