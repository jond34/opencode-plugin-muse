# Vendor issue drafts — **not submitted**

These are drafts only. No issue, discussion, comment, or advisory has been
opened. The owner decides whether either is filed.

They contain no credential, token, workspace identifier, or authentication path.
The evidence files are repository-local.

## Draft 1 — Publish the Muse approval-policy store schema

**Repository:** `meta-models/muse-code-sdk`
**Title:** Publish the `approval-policy.json` schema and reject unknown shapes

**Body:**

Muse Code 1.4.25 writes a local approval policy after a persistent choice. The
current store uses `schema_version: 2` and this shape:

```json
{
  "schema_version": 2,
  "rules": [
    {
      "effect": "allow",
      "durability": "local_persistent",
      "rule": {
        "kind": "tool_action",
        "tool_name": "mcp__opencode__bash"
      },
      "reason": null
    }
  ]
}
```

The approval flow also exposes a preview of the rule before the user accepts it.
Clients can read the store but cannot rely on its shape: the version, field
names, and rule kinds are implementation details, and an older client has no
defined behavior when a newer Muse writes an unknown shape.

Requested:

- a published, versioned schema for the policy store;
- migration rules between versions;
- an error or refusal when a client writes a shape the running Muse does not
  understand, rather than silently ignoring or misreading it.

This is not a request to make the store writable by third-party clients. A
documented read-only contract and a stable unknown-version failure would be
enough.

**Evidence:** [`evidence/2026-11-25-e48.json`](evidence/2026-11-25-e48.json).
The experiment measured the approval menu, the persistent choice, the
`schema_version: 2` store, and a second `denyUnmatched` session that ran the same
tool without a prompt.

## Draft 2 — `connection.closed` does not settle after transport EOF on Windows

**Repository:** `meta-models/muse-code-sdk`
**Title:** `connection.closed` remains pending after transport EOF on Windows

**Body:**

On `windows-latest`, with the SDK's transport fixture already closed, the
transport's `closed` promise was still pending after 10 seconds. Calling
`close()` then settled in 7 ms and the pid was gone. The skipped Windows test
awaits `closed` before it calls `close()`, so its 15-second timeout names the
wrong promise.

The observed sequence:

1. The fixture closes stdout (transport EOF).
2. `connection.connection.closed` remains pending after 10 s.
3. `close()` resolves in 7 ms; the process is no longer alive.

Requested: either make `closed` settle on transport EOF, or document that the
promise is not a close/exit signal on Windows so callers stop awaiting it. A
test that pins the Windows behavior would make the contract checkable.

**Evidence:** [`evidence/2026-11-24-e42.json`](evidence/2026-11-24-e42.json),
run `45315205129`.

## What is deliberately not here

- No request to change the approval model itself.
- No request about opencode's plugin-tool permission bypass
  (`anomalyco/opencode#50652`); this plugin does not register a custom tool.
- No workspace name, credential, token, or local path.
