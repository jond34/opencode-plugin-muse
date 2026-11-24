# Windows desktop check (E46)

This is the owner-run half of the Windows claim. The hosted runner proves the
suite and the fixture seam; it cannot prove a signed-in desktop, UAC, SmartScreen
or a desktop job object. Do not treat a green runner as an answer here.

Run this on a **signed-in Windows 11 desktop**, from the repo root, with Muse and
Bun installed. It takes about 45 minutes including the sign-in.

## Before you start

- Record the exact build: `muse --version`.
- Use a non-administrator terminal for the probe. Install/login may ask for
  elevation or a browser; record what happened rather than bypassing it.
- Do not paste tokens, cookies, auth files, or the workspace id into the result.
  The probe writes only versions, exit codes, process facts, and command output.
- `scratch/` is gitignored; the JSON stays there.

## Checklist

| # | Step | What to record | What counts as a pass |
|---|---|---|---|
| 1 | `muse --version` | The exact string | The expected 1.4.25 build is named |
| 2 | `bun run doctor --json` | Exit code and the `hooks`, `platform`, and `sandbox` rows | Doctor completes; a warning is a warning, not a pass |
| 3 | `muse exec --provider echo "ok"` | Exit code and output | Exit 0, output `echo: ok`; no model call |
| 4 | `pwsh -NoProfile -File scripts/windows/desktop-probe.ps1` | Path to `scratch/windows-desktop-<stamp>.json` | The script completes and writes JSON |
| 5 | Open the JSON: `serve.job` | `ok`, `inJob` for the `muse serve` pid | Recorded, whatever the value |
| 6 | Open the JSON: `serve.exit` and `serve.timedOut` | Exit code, timeout flag, stderr | `close()` after stdin EOF ends it; a timeout is a failure to record |
| 7 | Sign in / first turn through the real TUI or `muse exec` | Whether login, UAC, or SmartScreen appeared; what you clicked | The step is described, not necessarily clean |
| 8 | Start one detached helper yourself (optional) | Whether it survived after the host closed | Record the observation; do not use `taskkill /T` |

Fill `observations.uac`, `observations.smartScreen`, `observations.signIn`, and
`observations.notes` in the JSON before calling E46 done. An empty observation is
“not run”, not a pass.

## How to read the result

- **All steps pass, JSON complete:** O11 B for the exact build named in step 1.
  Docs may say “tested on Windows 11, build X”; never “supported on Windows”.
- **Install/login passes, close leaves a survivor:** O13 A + B. Document it and
  add the doctor warning; no `taskkill /T` in the plugin.
- **UAC or SmartScreen blocks a headless step:** O11 A. Keep “best-effort” and
  mark that step interactive-only.
- **Not run:** O11 A. The runner facts stand; the desktop claim does not.

## What this does not cover

- A second Windows build, ARM64, or Windows 10.
- A real provider turn's cost or quality.
- A sandbox policy the owner has changed (record `:unrestricted` if present).
- Any machine other than the one named in the JSON.
