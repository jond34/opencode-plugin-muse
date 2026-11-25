import { describe, expect, test } from "bun:test";
import {
  MUSE_INTEGRATION_ID,
  MUSE_INTEGRATION_NAME,
  MUSE_LOGIN_METHOD,
  registerMuseIntegration,
  type IntegrationEditor,
} from "../src/registration.js";

interface MethodRegistration {
  integrationID: string;
  method: { id: string; type: "external"; label: string };
}

/** An editor with a backing map, keyed by integration id and then method id. */
function fakeEditor(initial: ReadonlyArray<{ id: string; name: string }> = []) {
  const records = new Map(initial.map((record) => [record.id, { ...record }]));
  const methods = new Map<string, MethodRegistration>();
  const editor: IntegrationEditor = {
    get: (id) => records.get(id),
    update: (id, update) => {
      const record = records.get(id) ?? { id, name: "" };
      update(record);
      records.set(id, record);
    },
    method: {
      update: (input) => {
        methods.set(`${input.integrationID}/${input.method.id}`, input);
      },
    },
  };
  return { editor, records, methods };
}

describe("registerMuseIntegration", () => {
  test("creates the row and its one external method on an empty editor", () => {
    const { editor, records, methods } = fakeEditor();

    registerMuseIntegration(editor, () => {});

    expect(records.get(MUSE_INTEGRATION_ID)).toEqual({
      id: MUSE_INTEGRATION_ID,
      name: MUSE_INTEGRATION_NAME,
    });
    expect([...methods.values()]).toEqual([
      { integrationID: MUSE_INTEGRATION_ID, method: MUSE_LOGIN_METHOD },
    ]);
    expect(methods.get(`${MUSE_INTEGRATION_ID}/${MUSE_LOGIN_METHOD.id}`)?.method.type).toBe(
      "external",
    );
  });

  test("leaves an existing row's name alone but still adds the method", () => {
    const { editor, records, methods } = fakeEditor([
      { id: MUSE_INTEGRATION_ID, name: "Someone Else's Muse" },
    ]);

    registerMuseIntegration(editor, () => {});

    expect(records.get(MUSE_INTEGRATION_ID)?.name).toBe("Someone Else's Muse");
    expect(methods.size).toBe(1);
  });

  test("a second call keeps one row and one method id", () => {
    const { editor, records, methods } = fakeEditor();

    registerMuseIntegration(editor, () => {});
    registerMuseIntegration(editor, () => {});

    expect(records.size).toBe(1);
    expect(methods.size).toBe(1);
    expect(methods.get(`${MUSE_INTEGRATION_ID}/${MUSE_LOGIN_METHOD.id}`)?.method.id).toBe(
      "muse-login",
    );
  });

  test("a throwing editor warns instead of failing setup", () => {
    const warnings: string[] = [];
    const editor: IntegrationEditor = {
      get: () => {
        throw new Error("host refused the read");
      },
      update: () => {},
      method: { update: () => {} },
    };

    expect(() =>
      registerMuseIntegration(editor, (message) => {
        warnings.push(message);
      }),
    ).not.toThrow();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("could not register the Muse login entry");
  });
});
