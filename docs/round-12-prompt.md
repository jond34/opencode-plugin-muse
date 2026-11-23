Execute round 12 of `~/repos/opencode-plugin-muse`.

Read `docs/round-12-plan.md` first — decisions D59–D62 in §5, the answered
product choices in §8, prohibitions in §11, and the phase table in §10 (S0–S2
are already done). `docs/round-12-research.md` holds every measurement; §6–§9
are the four experiments this round turns on, §10 discloses a deviation. Use it
instead of re-deriving, and correct it only where an implementation contradicts
it.

HEAD is `4ea16da`, suite green at 397 pass / 0 fail / 1023 expect / 37 files.
`docs/integration-landscape.md` is the owner's uncommitted edit — read it, never
modify or stage it. All experiments are approved; no paid turn is planned.

The answer is settled: **D59-B, host diagnostics, and `parseJsonc` is deleted.**
The evidence, in three sentences: the log delta was clean 5/5, parallel-safe,
relocation-safe, and its two failure modes are detectable rather than silent
(stale offset, no liveness line); the file count reports `ok` over a config set
where one file was rejected outright, which is the failure this round exists to
close; and `parseJsonc` matched the host in 13/13 fixtures, so it is redundant
rather than wrong. Do not re-open A or C unless an implementation finding
contradicts one of those three sentences — if it does, stop and say which.

Phases S3–S7:

1. **S3 — read the log.** Locate the directory with `opencode debug paths log`
   (plain subcommand: it rejects `--standalone`), take the log size, spawn
   `debug config`, then read only the bytes after that offset. If the size went
   backwards, skip — a naive read returns 0 bytes and looks exactly like "no
   drops" (research §7). Parse `key=value` pairs accepting quoted and bare
   values: a source with a space is quoted (research §7). Keep lines whose
   `message="configuration normalization diagnostic"` and whose `source` is a
   candidate config file — the documents' paths **plus** the candidate files in
   the config directory and the working directory, because a rejected file is
   not among the documents (research §6). A clean run's delta already contains
   three INFO lines naming the source, so filter on the message before the path
   (research §7).

2. **Liveness is what makes `ok` honest.** If the delta names no candidate
   source at all, the log did not report this run — raised level, moved file,
   silent truncation — and the row is `skipped` with that reason. `ok` means
   "the log mentioned our file and reported no drop", never "the log was
   quiet". This is the one rule the implementation may not soften.

3. **S4 — one finding for a rejected file (D60).** A `path=$` diagnostic is a
   whole-file rejection: emit it once, as its own check, naming the file and the
   action string (`rejected malformed JSON or JSONC document`). Both rows defer:
   `plugins` must not say "no plugins entry names …" when the entry exists in a
   rejected file, and `policies` must not say "nothing to drop". The mixed case —
   broken `opencode.jsonc` beside a valid `opencode.json` — is the regression
   test; today it returns `ok` (research §6).

4. **Per-statement drops stay in `policies`**, one line each with the pointer and
   the action, including `$.experimental.policies.N` (research §9). The detail
   can now name the index and the reason, which is more than the count said.

5. **Delete `parseJsonc`, `declaredStatements`, and the three tests whose subject
   is the parser.** Under B they have no caller. The evidence says the subject
   was deleted; it does not say a check was skipped. Keep the enforced count
   read from the documents — that is vendor data, not parsing.

6. **S5–S6 — the record.** README: name the diagnostic string and
   `opencode debug paths log`, keep the Console caveat (`anomalyco/opencode#60252`),
   and add the one clause the field supports — a deny you cannot see enforced is
   not a deny. The actionlint / terraform / Cedar / Argo comparison stays in
   `docs/decision-evidence.md`. `docs/compatibility.md`: replace round 11's
   declared-versus-printed sentence with the diagnostics method and its limits.
   Coverage: rewrite the P row to the method that shipped, restate the counts,
   add the round-12 audit paragraph.

Run `bun run check:offline` after S4 and again after S6. Report one line each for
D59, D60, D61, D62, and for E-D62–E-D65 with their pass/fail as measured; the
suite result; whether any of the three sentences above turned out wrong; anything
that could not be measured. Then stop and ask before committing — commit in
logical increments only if asked, never staging `docs/integration-landscape.md`.

Never write to the host's log; the truncation case in research §10 was tested
against a copy, and it must stay that way.
