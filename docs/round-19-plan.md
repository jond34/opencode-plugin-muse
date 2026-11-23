# Round 19 plan: the divergence, the catalog, and the report shape

Round 19 answers a review of round 18's record. The review raised six items and
was right about five of them; two of its citations do not survive a read, and
the corrections are narrower and more useful than the review's framing. The
round is records-first: the exit-code sentence, the provider-id choice, the ACP
inheritance, the §3.2 posture, and the counts paragraph. Two small code changes
are candidates behind product questions: a report schema version and a histogram
summary.

Evidence: `docs/round-19-research.md` (E-D107–E-D120). This plan names the
decisions, the exact edits, the experiments, the product questions, and the
conditions that would change the answers.

## Decisions

**D102 — the exit-code sentence is corrected, and the correction is narrower
than the review's.** The field does split outcomes on a number: `ripr gate
evaluate` returns 2 for `config_error` and 3 for `blocked`; Vue Doctor's 3 is an
analyzer that failed or was skipped under `--strict`; alint's 3 is its internal
error. But the split encodes the tool's own setup or a completed blocking
decision, never "the user's declaration could not be evaluated". `a4 doctor`
reports `unknown` and still exits 0; its `0/1/2/10` ladder is the CLI's, where 10
is `self update --check` and 2 is usage. D85's "not on a number" becomes "not on
this axis", and the one-code choice is recorded as a choice inside a split
family, not a field norm (E-D107–E-D109).

**D103 — the provider id stays `muse`, and the shipped `canonical: "meta"` is
documented.** opencode's catalog has `meta`, and a plugin can register an
`AuthHook` for it; the competitor that does so mints an inference key and keeps
it in opencode's auth store. This plugin cannot take that route without holding
the credential it exists not to hold. It registers `muse`, owns the model list
and limits, and leaves sign-in to `muse login`. The cost is UX parity: `/connect`
does not list it. The MSP competitor also registers `muse`; the review's "the
competitor uses the catalog provider" is true of the auth plugin, not the MSP
one. The provider transform already sets `canonical: Provider.ID.make("meta")` at
`src/plugin.ts:414`, so the middle path is in the code, not a proposal; the
README is silent about it. E-D120 checks whether the inheritance is observable,
and the README sentence lands either way, because the field is shipped
(E-D111–E-D113).

**D104 — no protocol surface; document the inheritance.** `muse acp` is the
vendor's agent; `opencode acp` is opencode's. An ACP client that drives
`opencode acp` reaches these models through opencode's provider registry, with
opencode's loop, tools, transcript and permissions. The plugin adds no surface of
its own, and a client that wants Muse's own loop uses `muse acp` or a third-party
bridge, which is a different authority order (E-D114). No `muse acp` is run.

**D105 — the §3.2 posture is one README paragraph.** Meta's terms restrict the
Coding Harness Subscription credential to the coding harness and forbid using it
outside it or to circumvent billing. The plugin never receives that credential:
it spawns the signed-in CLI, speaks MSP over stdio, and reports a placeholder key
that is never sent. That is the mechanism the terms describe, not a claim of
endorsement. The paragraph also states the residual risk: the subscription docs
say "Muse Code only", the SDK is a developer preview, and the arrangement can be
restricted at any time. The competitor that extracts a credential publishes with
a disclaimer; this plugin's stronger position is the mechanism, not the
disclaimer (E-D115).

**D106 — `--json` gains `schemaVersion` and `pluginVersion` if Q4 is A.** Six
reports carry a version: codex, a4 and ripr doctor were re-read; proqi, recon and
claw are the review's count and were not re-read here. This one carries none.
The fields are additive and camelCase to match `asOf`: `schemaVersion: 1` and
`pluginVersion` from the package manifest. One test pins both. The README's
`--json` sentence and test count are updated to the suite's actual number
(E-D116).

**D107 — if a roll-up ever lands, it is a histogram, never a max.** A `summary`
count by status is order-free, includes `skipped`, and needs no severity
ordering; a max roll-up needs an ordering and would not equal the exit code
(D99). Vercel's doctor ships `summary` counts and exits 0 regardless; doctorkit
and vercel-labs/fx use the same shape. Q5 decides whether to add it now; the
default is to record the constraint and add it when a consumer appears
(E-D110, E-D117).

**D108 — the counts paragraph is corrected.** The table is H 41 · D 34 · P 1 ·
X 5 · U 1 · N 3 = 85. The prose says "eighty-three of eighty-four", "forty
verified" and "the two N rows"; it is stale by one H row and one N row. The
correction is its own commit before this round's records: 84 of 85 closed,
forty-one H, three N rows (OS isolation, the turn cap, two installs of the same
package) (E-D119).

**D109 — the Round 19 audit records the six items, the two review imprecisions,
and the Q answers.** It cites E-D107–E-D120, names the a4 correction, the
competitor distinction, and the histogram constraint. The four breadth doctors
(vercel, proqi, a4, recon) are cited, not added to the seven-doctor tally
(D110).

**D110 — the breadth doctors stay outside the tally.** Vercel is the non-gating
counterexample (exit 0 even when checks fail); a4 is the status-without-code
counterexample (`unknown` exits 0). They are evidence about shape, not new
members of the class.

**D111 — publishing does not change the credential analysis.** Anthropic's
clause targets offering login to users; neither plugin does. The competitor
publishes with a disclaimer. The variable is the mechanism, not the distribution
(E-D113). Q8 asks whether to add a standalone notice; the default is the §3.2
paragraph.

**D112 — OpenAI's #8494 is recorded as an open question, not evidence.** It asks
whether the TypeScript SDK can use a subscription; OpenAI says to use an API key
and closed it as not planned. It is about the SDK, not the CLI, and settles
nothing for Muse. No claim here rests on it (E-D118).

## Steps

**S1 (commit 1).** `docs/decision-coverage.md`, the counts paragraph.

Replace:

```text
Eighty-three of eighty-four rows are closed: forty verified and exercised,
```

with:

```text
Eighty-four of eighty-five rows are closed: forty-one verified and exercised,
```

and replace:

```text
The two N rows are opencode's: OS isolation for a bridged call,
which the harness owns and does not provide, and the turn cap, which opencode's
`agent.steps` supplies off by default.
```

with:

```text
The three N rows are opencode's: OS isolation for a bridged call,
which the harness owns and does not provide, the turn cap, which opencode's
`agent.steps` supplies off by default, and two installs of the same package,
where opencode loads one instance per package name and the first entry wins.
```

Commit this alone as `Correct the counts paragraph: 84 of 85, forty-one, three N
rows`. Do not include the round-19 files.

**S2 (done).** `docs/round-19-research.md` written: the exit-code table, the
provider shapes, the ACP inheritance, the §3.2 text, the report-versioning
survey, the histogram shapes, the two review imprecisions, E-D107–E-D120, and
sources.

**S3.** `docs/decision-coverage.md`, row 185 and the D85 sentence.

(a) The row's refs. Replace `D68–D71, D75–D80, D82–D86, D88–D93, D94–D101,
E-D72–E-D106:` with `D68–D71, D75–D80, D82–D86, D88–D93, D94–D112,
E-D72–E-D120:`.

(b) The D85 sentence. Replace:

> One code, not a ladder: the field splits "could not evaluate" from "found
> problems" but not on a number (E-D84), and the code states the verdict — did
> this certify? — while refusing the cause; the rows and `--json` state the
> cause. That is a doctrinal cost, not a missing diagnostic, and the flip
> condition is a caller that branches or a published `scripts/` (D85, D100;
> E-D106).

with:

> One code, not a ladder: the field does split outcomes on a number — ripr's gate
> returns 2 for a config error and 3 for a completed block, Vue Doctor's 3 is an
> analyzer that failed or was skipped, and alint's 3 is its internal error — but
> the split encodes the tool's own setup or a blocking decision, never "the
> user's declaration could not be evaluated"; `a4 doctor` reports `unknown` and
> still exits 0. So the field is split, and this doctor's one code is a choice
> inside a split family, not a norm. The code states the verdict — did this
> certify? — while refusing the cause; the rows and `--json` state the cause.
> That is a doctrinal cost, not a missing diagnostic, and the flip condition is a
> caller that branches or a published `scripts/` (D85, D100; E-D107–E-D109).

(c) Add to the paragraph that follows the status-model sentences, after the
sentence ending "the flip condition is a consumer that reads the report for the
roll-up (D99; E-D105).":

> The provider id is a choice, not a given: the MSP competitor registers `muse`,
> the auth competitor registers an `AuthHook` on `meta` and mints a credential,
> and this plugin keeps `muse` because the second route would hold the credential
> it exists not to hold; opencode's `canonical` field is the inheritance path
> that does not touch the credential (D103; E-D112, E-D113, E-D120). The plugin
> adds no protocol surface: an ACP client driving `opencode acp` inherits these
> models through opencode's registry, and a client that wants Muse's loop uses
> `muse acp` or a bridge (D104; E-D114). `--json` carries `schemaVersion` and
> `pluginVersion` if Q4 is A, and the roll-up, if it ever lands, is a `summary`
> histogram rather than a max (D106, D107; E-D116, E-D117).

**S4.** `README.md`, the §3.2 posture. Insert after the paragraph ending
"logging in again does not clear it." and before "Which credential that CLI
spends", a new subsection:

```markdown
### The subscription credential

Meta's Model API Terms, §3.2, restrict the credential a Coding Harness
Subscription connects to the coding harness: it "may not be used to access the
Services outside the coding harness or to circumvent your subscription's usage
limits or billing." This plugin never receives that credential. It spawns the
signed-in `muse` CLI and speaks MSP to it over stdio, so every request is made by
Muse Code's own process under the account's own subscription; the API key
opencode sees is a placeholder that is never sent to Meta. The plugin does not
extract, cache, or forward a token, and it adds no login flow of its own. That is
the mechanism the terms describe, not a claim that Meta has endorsed this
arrangement: Muse's subscription documentation says the credential is "for use
with Muse Code only", and the SDK is a developer preview, so the arrangement can
be restricted at any time. If it is, the failure is a refused turn, not a leaked
credential.
```

**S5.** `README.md`, why `muse` rather than `meta`. Insert after the "What it
does" bullet list and before the auth paragraph:

```markdown
### Why `muse`, not `meta`

opencode's catalog has a `meta` provider, and a plugin can register an auth hook
for it; the competitor that does so mints an inference key and keeps it in
opencode's auth store. This plugin cannot take that route without holding a
credential it exists not to hold. It registers its own `muse` provider, owns the
model list and limits, and leaves sign-in to `muse login`. The provider declares
`canonical: "meta"`, so opencode's catalog supplies defaults where the plugin's
table is silent; the model list stays the plugin's. The cost is UX parity:
`/connect` does not list it, and a model switch is a picker entry rather than an
account connection. The benefit is that the credential never reaches opencode,
the config, or this plugin. The MSP competitor also registers `muse`, so the
split is about the credential, not the id.
```

**S5a (verification, E-D120).** The provider transform already sets
`canonical: Provider.ID.make("meta")` at `src/plugin.ts:414`; the probe is
confirmation, not a gate. In a throwaway `XDG_CONFIG_HOME`, write an
`opencode/opencode.jsonc` with one config-declared provider and no `models`
block:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "providers": {
    "muse-probe": {
      "name": "Muse Probe",
      "canonical": "meta",
      "package": "@ai-sdk/openai-compatible",
      "settings": { "baseURL": "http://127.0.0.1:1/v1" }
    }
  }
}
```

Run `XDG_CONFIG_HOME=$tmp opencode models` and look for `muse-probe/` entries.
If the catalog's `meta` models appear under `muse-probe`, the inheritance is
observable. If the provider appears but lists no inherited models, say
"declares" rather than "inherits" in the README. If the provider does not load
at all — a package-resolution or credential error — the probe is inconclusive;
record it and keep the README's "declares" wording. Record the result in
`docs/round-19-research.md` under E-D120. Do not edit `src/` for the probe.

**S6.** `README.md`, the ACP inheritance. In "This plugin, or `muse acp`?", after
"It is also one-directional, for now: opencode ships the ACP *agent* side only.",
insert:

```text
An ACP client that drives `opencode acp` therefore reaches these models through
opencode's provider registry, with opencode's loop, tools, transcript and
permissions; the plugin adds no protocol surface of its own. A client that wants
Muse's own loop uses `muse acp` or a third-party bridge, which is a different
authority order, not a thinner version of this plugin.
```

**S7 (Q4 = A only).** The report version.

- `scripts/doctor.ts`: add to `interface Report`:

  ```ts
  schemaVersion: 1;
  pluginVersion: string;
  ```

  and initialise the report with `schemaVersion: 1, pluginVersion: packageVersion()`.
  `packageVersion` is already imported.
- `test/doctor.test.ts`: add `schemaVersion: number; pluginVersion: string;` to
  the `parse` return type, and add one test:

  ```ts
  test("carries the report schema and the package version", () => {
    const { root, state } = workspace();
    const { out } = run(["--json", "--offline", "--no-strict"], root, state);
    const report = parse(out);
    expect(report.schemaVersion).toBe(1);
    expect(report.pluginVersion).toMatch(/^\d+\.\d+\.\d+/);
  });
  ```

- `README.md`: the `--json` sentence gains "`schemaVersion`, `pluginVersion`",
  and "runs 416 tests" becomes the suite's actual count.
- No `docs/compatibility.md` change: it does not document the JSON shape.

**S8 (Q5 = A only).** The histogram.

- `scripts/doctor.ts`: add `summary: Record<Status, number>` to `Report`; compute
  it from `checks` in `main` with a small helper that counts all four statuses;
  include it in the JSON. `Status` already includes `skipped`.
- `test/doctor.test.ts`: add one test that the four counts sum to
  `report.checks.length`.
- `README.md`: the `--json` sentence gains "`summary`".
- If Q5 is B, record the shape in the coverage row and do not touch the code.

**S9.** `docs/decision-coverage.md`, the Round 19 audit. Insert after the Round
18 audit's last sentence, with commit 1's short SHA:

> **Round 19 audit (HEAD `<commit 1>`).** A review of round 18 raised six items,
> and two of its citations did not survive a read. `a4 doctor` exits 0 for `ok`,
> `warn` and `unknown`, and 1 for `fail`; the `0/1/2/10` ladder is the CLI's,
> where 10 is `self update --check` and 2 is usage (E-D107). The field does split
> outcomes on a number — ripr's 2 vs 3, Vue Doctor's 3, alint's 3 — but the split
> encodes the tool's own setup or a blocking decision, never a user declaration
> that could not be read; `a4 doctor`'s `unknown` exits 0. D85's "not on a
> number" is corrected to "not on this axis", and the one-code choice is recorded
> as a choice inside a split family (D102; E-D108, E-D109). The provider id is a
> control-versus-parity choice: the MSP competitor registers `muse`, the auth
> competitor registers `meta` and mints a credential, and this plugin cannot take
> the second route without holding the credential it exists not to hold;
> `canonical: "meta"` is already shipped at `src/plugin.ts:414`, and the round
> documents it and confirms the inheritance (D103; E-D112, E-D113, E-D120). The
> plugin
> adds no protocol surface: an ACP client driving `opencode acp` inherits these
> models through opencode's registry, and a client that wants Muse's loop uses
> `muse acp` or a bridge (D104; E-D114). The §3.2 posture is now one README
> paragraph: the credential stays inside the CLI, the plugin speaks the
> sanctioned MSP surface, and Meta has not documented the arrangement as
> supported (D105; E-D115). `--json` carries `schemaVersion` and `pluginVersion`
> if Q4 is A; the roll-up, if it ever lands, is a `summary` histogram rather than
> a max (D106, D107; E-D116, E-D117). The four breadth doctors are cited, not
> added to the tally. OpenAI's #8494 is about the SDK, not the CLI, and settles
> nothing here (D112; E-D118). The counts paragraph is corrected to 84 of 85,
> forty-one H and three N rows (D108; E-D119).

**S10.** Verify:

- `bun run check:offline` → the suite's actual count, 0 fail, exit 0. If Q4/Q5
  are A, the count is higher than 416; use the number the run reports.
- `grep -n "Eighty-four of eighty-five" docs/decision-coverage.md` and
  `grep -n "three N rows" docs/decision-coverage.md` show the correction.
- `grep -n "not on a number" docs/decision-coverage.md` is empty; the phrase
  survives only as the quoted old sentence in `docs/round-19-research.md`.
- `grep -n "a4 doctor" docs/round-19-research.md` shows 0/1, and the `0/1/2/10`
  line names the CLI.
- `grep -n "§3.2\|subscription credential" README.md` shows the new subsection.
- `grep -n "canonical" README.md docs/decision-coverage.md` shows the
  provider paragraph and the experiment's result, never "the field norm".
- If Q4 A: `grep -n "schemaVersion\|pluginVersion" scripts/doctor.ts
  test/doctor.test.ts README.md` shows both. If Q4 B: no code or test change.
- If Q5 A: `grep -n "summary" scripts/doctor.ts` shows the field. If Q5 B: no
  code or test change.
- The counts line is still `H 41 · D 34 · P 1 · X 5 · U 1 · N 3`.
- `git status -s` shows only `docs/integration-landscape.md` plus this round's
  files; no `scripts/` or `test/` changes if Q4/Q5 are B.

**S11.** Commit. Commit 1 is S1. Commit 2 is the records: S3–S6, S9, plus
`docs/round-19-research.md`, this plan and the prompt. Commit 3, only if Q4 or Q5
is A, is the report shape. Messages:

1. `Correct the counts paragraph: 84 of 85, forty-one, three N rows`
2. `Record round 19: the divergence, the catalog, and the §3.2 posture`
3. `Version the doctor report: schemaVersion, pluginVersion, summary`

Commit 2 and, if present, commit 3 carry the Codebuff footer. Do not push.

## Product questions

Raised after the experiments, as requested. The plan defaults to A in each.

**Q3. Provider registration: keep `muse` with the shipped `canonical`, drop the
`canonical`, or adopt `meta` + `AuthHook`?**
(A) Keep `muse` and document the existing `canonical: "meta"` — recommended. No
code change: the field is already in the provider transform (`src/plugin.ts:414`),
and the README is the gap (E-D111, E-D112, E-D120).
(B) Remove `canonical` and keep the table fully explicit. Only if the inherited
defaults conflict with the CLI's or the probe shows a surprising merge.
(C) Adopt `meta` + `AuthHook`. This is the competitor's shape and it requires
minting or extracting a credential, which breaks the plugin's central invariant.
Not recommended; flip only if the owner decides UX parity is worth holding a
credential, which the README currently promises never to do.

**Q4. Report versioning: add `schemaVersion` + `pluginVersion` now, later, or
never?**
(A) Add now — recommended. Two additive fields, one test, a bug report that says
which build produced it (E-D116).
(B) Record the gap and add when a consumer appears. Cheaper now; a bug report
still cannot name the schema.
(C) Never. The report is internal; `asOf` is enough. Not recommended, because
six reports in the field carry a version and the cost is two fields.

**Q5. Histogram: add `summary` now, later, or never?**
(A) Add now. It is order-free, includes `skipped`, and makes `--json`
self-describing for a bug report (E-D110, E-D117).
(B) Record the shape and add it when a consumer appears — recommended. No
consumer reads `--json` (E-D78), the exit code is the verdict, and a histogram
without a caller is a field to maintain.
(C) Never. A caller can count the checks. Not recommended if a roll-up ever
lands, because the histogram is the shape that needs no ordering decision.

**Q6. §3.2 posture: how strong?**
(A) Mechanism + residual risk — recommended. The credential stays in the CLI,
the plugin speaks MSP, and Meta has not documented the arrangement as supported
(E-D115).
(B) Mechanism only. Stronger-sounding, but it hides the risk the subscription
docs state.
(C) Mechanism + an explicit "not supported by Meta" warning. The strongest
disclaimer; it may overstate what the terms say, since they restrict the
credential rather than naming this client.

**Q7. ACP surface: none, a bridge, or measure first?**
(A) None; document the inheritance — recommended. `opencode acp` is the route,
and a second surface duplicates `muse acp` (E-D114).
(B) Publish an ACP bridge. Out of scope for this repo and a different authority
order; it is `muse-acp-bridge`'s product, not this plugin's.
(C) Measure `opencode acp` end to end first. An experiment, not a product; it
can be added to a later round if the inheritance claim needs a live witness.

**Q8. Publishing: keep, add a standalone notice, or stop?**
(A) Keep publishing with the §3.2 paragraph — recommended. The clause targets
offering login, which this plugin does not do; the mechanism is the defense
(E-D113).
(B) Add a standalone `DISCLAIMER.md` beside the README. More visible; the
paragraph already says the same thing.
(C) Stop publishing. The risk is the credential, not the tarball; stopping does
not change the mechanism.

## Steelmen and strawmen

**One code.** The steelman for a second code is ripr and Vue Doctor: both reserve
a number for "could not evaluate", so a CI script can page on 2 and fail on 3,
and this doctor's `--offline` run is exactly that case. The steelman against is
that the field's second code is the tool's own setup, not the user's declaration;
this doctor has no setup to fail, and `--offline` is a request, not a failure.
The gate already returns 1 for both and the rows name the cause. Strawman one:
"no doctor splits on a number" — false (ripr, Vue, alint). Strawman two: "every
doctor splits" — false (a4 doctor, codex, brew, Vercel).

**Provider id.** The steelman for `meta` + `AuthHook` is `/connect`: it is the
field's onboarding path, and the auth competitor proves the flow works. The
steelman against is that the flow requires a credential in opencode, which is the
one thing this plugin promises never to hold; the MSP competitor also registers
`muse`, so the split is the credential, not the id. Strawman one: "`muse` is
non-standard" — false; the MSP competitor uses it. Strawman two: "`meta` is free
parity" — false; it costs the invariant.

**ACP.** The steelman for a surface is that the field's expansion path is ACP,
and a plugin with its own endpoint could be driven by Zed or JetBrains without
opencode. The steelman against is that `muse acp` already is that endpoint and
`muse-acp-bridge` already bridges it; a second one duplicates the vendor and
changes the authority order. Strawman: "no protocol surface means no interop" —
false; `opencode acp` carries these models through opencode's registry.

**§3.2.** The steelman for a strong claim is that the mechanism is stronger than
the competitor's: the credential never leaves the CLI, which is what the terms
ask. The steelman against is that the subscription docs say "Muse Code only",
the SDK is a preview, and a compliance claim the vendor has not documented is a
liability. The paragraph takes the mechanism and names the risk. Strawman one:
"publishing is the violation" — false; the clause targets offering login, and
the competitor publishes with a disclaimer. Strawman two: "the plugin is outside
the harness" — the credential is used by the CLI, which is the harness.

**Report shape.** The steelman for adding both fields now is that two fields and
one test make a bug report name the schema. The steelman against is that no
consumer reads `--json` and the exit code is the verdict; the histogram is the
shape that needs no ordering, so it can wait. The defaults split: version now
(Q4 A), histogram later (Q5 B).

## Conditions for confidence

| Decision | Confident when | Flip when |
|---|---|---|
| D102 one code | `--offline` and a dropped policy both exit 1, and the rows name the cause; no caller branches | a caller needs to tell "did not look" from "finding" without parsing `--json` |
| D103 `muse` | the credential invariant holds; `canonical` is shipped and the README says so | the inherited defaults conflict with the CLI's, so `canonical` is removed; or the owner accepts holding a credential for `/connect` parity |
| D104 no ACP surface | `opencode acp` reaches `muse/*` through the registry; `muse acp` covers the direct case | an ACP client needs Muse's loop without opencode, which is `muse acp`'s job |
| D105 §3.2 paragraph | the credential never enters the plugin; the terms restrict the credential, not the client | Meta documents the arrangement as unsupported, or the SDK changes the surface |
| D106 version fields | Q4 A; the fields are additive and tested | a consumer needs a different versioning scheme |
| D107 histogram | no consumer reads `--json`; the exit code is the verdict | a caller needs counts, or a roll-up lands |

## Gates

- No push, tag or publish. No `muse acp`. No new dependency. Never write the
  host's log. `docs/integration-landscape.md` is the owner's edit: never stage.
  Scratch stays in `scratch/`. Commits only after the owner says so.
- Every new claim carries an E-id or a source; no status value is named that the
  source does not have.
- The a4 citation is corrected: `a4 doctor` is 0/1; the `0/1/2/10` ladder is the
  CLI's.
- The provider decision names both competitors and the credential invariant.
- The ACP sentence says inheritance through `opencode acp`, never a plugin
  surface.
- The §3.2 paragraph states the mechanism and the residual risk; it does not
  claim endorsement.
- `canonical` is documented as shipped at `src/plugin.ts:414`; it is not a new
  field. `schemaVersion`/`pluginVersion` only if Q4 is A; `summary` only if Q5
  is A.
- The counts line stays `H 41 · D 34 · P 1 · X 5 · U 1 · N 3`; the prose matches
  85 rows and 84 closed.
- The README test count is the number the suite reports, never a guess.
- If a check disagrees with the research, stop and report rather than editing
  the expectation.

## Prohibitions

No push, tag or publish. No `muse acp`. No new dependency. Never write to the
host's log. `docs/integration-landscape.md` is the owner's edit: never stage.
Scratch stays in `scratch/`. Commits only after the owner says so.
