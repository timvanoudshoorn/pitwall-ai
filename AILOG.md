# AILOG — AI Reasoning & Explainability

Running log of prompt/approach decisions, what worked, and hallucination
risks guarded against. One entry per meaningful change; newest on top.

Owner: `ai` teammate. Files: `src/ai/*`.

---

## 2026-07-09 — Initial explanation module (core recommendation + why-not-alternative)

### What was built

- `src/ai/types.ts` — the `StrategyComparison` shape I'm treating as the
  contract with sim's output. **This is a DRAFT**, proposed to sim before
  their engine existed (name-resolution for inter-agent messaging was
  broken for the first part of this session, so the handshake took two
  attempts — see message log). Sim has not yet confirmed it. Building
  against it now so I'm not blocked, but this file is expected to change
  once sim replies, and everything downstream (prompts, grounding check,
  mock fixtures) is designed to be easy to re-shape.
- `src/ai/promptBuilder.ts` — constructs the system + user prompt for two
  modes: `recommendation` (backlog #1) and `why_not_alternative` (backlog
  #2), including honest-close-call handling (backlog #3).
- `src/ai/grounding.ts` — a post-generation heuristic check that flags any
  numeric token in the model's output that doesn't trace back to the
  input facts (defense-in-depth, not the primary defense).
- `src/ai/client.ts` — thin Anthropic SDK wrapper for the actual API call.
- `src/ai/explain.ts` — public entry point tying prompt + call + grounding
  check together.
- `src/ai/mockFixtures.ts` — two hand-built `StrategyComparison` fixtures
  (a clear-cut winner, and a genuine close call) to develop/test prompts
  against until sim's real output is wired in.

### Approach taken, and why

**Closed fact set, not open-ended description.** The single biggest
hallucination risk in this whole role (per the brief) is the model
introducing a stat, lap number, tyre-life figure, or historical claim that
isn't traceable to real data. The design choice that does the most work
against that: the prompt never describes the race situation in loose
prose and asks the model to "explain the strategy" — it hands the model a
tightly-formatted, closed `FACTS:` block built directly from the
`StrategyComparison` object's own fields (see `formatFacts()` in
promptBuilder.ts), plus an explicit `GROUNDING RULES` section that says,
in effect: "you may only state a number that appears verbatim in FACTS;
never compute, round beyond what's given, or infer a number that isn't a
field." The model is never given room to "fill in plausible detail"
because nothing outside FACTS is available to it as a first-class input —
whatever it might invent, it invents unprompted, not because the prompt
invited elaboration.

**Explicitly forbidding computed math.** I deliberately did *not* let the
model total, e.g., "43 seconds lost across two stops" even though it
could technically add 21.4 + 21.4 correctly — because "compute a stat
myself" is exactly the failure mode the brief warns against, and there's
no way to distinguish a model that adds two real numbers correctly from
one that adds two numbers it half-remembers incorrectly. If a total is
useful, sim's output should supply it as its own field, not have the
explanation layer (or the model) derive it.

**Separate "why not the alternative" mode.** Rather than trying to make
one prompt serve both "explain the winner" and "explain why the loser
lost," these are two distinct prompts (`buildRecommendationPrompt` /
`buildWhyNotAlternativePrompt`). The comparison prompt narrows the FACTS
block to just the two strategies being compared (via the `focusIds`
param to `formatFacts`) so the model can't wander off into discussing a
third candidate that isn't relevant to the specific "why not X" question.

**Close calls are handled by data, not by asking the model to be
humble.** `marginAnalysis.isCloseCall` is a field sim computes (a
threshold judgment that belongs in the sim layer, not something the
explanation layer should eyeball from a delta). The grounding rules
explicitly instruct: if `isCloseCall` is true, say so plainly instead of
manufacturing confidence. Tested against `MOCK_CLOSE_CALL` (0.3s delta,
`isCloseCall: true`) — the constructed prompt surfaces `Flagged as a
close call: true` directly in the FACTS block the model sees, so the
instruction has something concrete to act on rather than being a vague
tone request.

**Reference facts carry their own confidence tag.** The `ReferenceFact`
type mirrors the `data` teammate's DATALOG.md convention
(confirmed / reasonable_estimate / placeholder). Rule #3 in
`GROUNDING_RULES` requires the model to caveat anything sourced from a
non-confirmed reference fact rather than stating it with flat certainty.
This matters because the safety-car-probability figure in the current sim
placeholder data (`safety_car_model_default_placeholder` in the mock
fixture) is exactly the kind of number that would read as authoritative
in the wrong tone — "this track has a 61% safety car chance" sounds like
a fact, when right now it's a documented placeholder.

**Post-generation grounding check as a second, independent layer.**
`grounding.ts` builds an allow-list of every numeric value that literally
appears anywhere in the `StrategyComparison` object (recursively) plus
any numbers embedded in reference-fact text, then scans the generated
text for numeric tokens and flags anything not within a small tolerance
of an allowed value (tolerance exists to cover natural rounding — "21
seconds" for a `21.4` field, "22%" for `22`). This is explicitly
documented as a *heuristic*, not a proof: a model could still misattribute
a real number to the wrong strategy, or make an unsupported qualitative
claim with zero numbers in it, and this check would say nothing. It
exists to catch the blunt failure mode (an outright invented number) as a
safety net behind the prompt design, not as the primary defense.
Verified with a smoke test: a synthetic explanation containing a
fabricated "99.9 seconds" figure alongside real numbers (18, 21.4) — the
real numbers passed clean, the fabricated one was flagged with its
surrounding context.

### Model choice

Defaulted `DEFAULT_EXPLANATION_MODEL` to `claude-sonnet-5` (adaptive
thinking on, `output_config.effort: "high"`) rather than the "always use
opus" default some tooling suggests. Rationale: this is a per-user,
per-explanation runtime API call (not a one-off build-time task), the
plan's own model-assignment table puts the `ai` teammate itself at
Sonnet-5/high effort, and the plan separately flags "who pays for the
app's own runtime API calls" as an open cost question for the lead —
defaulting to the cheaper-but-still-strong tier keeps that decision
cheaper to make either way. `model` is a plain parameter on every public
function in `explain.ts`/`client.ts`, so this is trivially overridable
per call if the lead decides otherwise.

### SDK version note (not my file to fix broadly, but worth logging)

`package.json` had `@anthropic-ai/sdk` pinned to `^0.68.0` (whoever
scaffolded the project set that), but 0.68.0 predates adaptive thinking
and `output_config.effort` support — TS compilation failed against those
fields. Bumped to `^0.110.0` (current at time of writing) via `npm
install @anthropic-ai/sdk@^0.110.0`; full app `tsc --noEmit` and `oxlint`
both clean afterward. Flagging here in case another teammate's code was
written against the older API surface and needs the same bump.

### Grounding correction from `data` teammate (received after initial build)

Data flagged two concrete hallucination risks specific to this app's
domain, both now on my radar for prompt design and reference-fact
sourcing:

1. Only 5 tracks are LiDAR-scanned in F1 25 (Bahrain, Miami, Melbourne,
   Suzuka, Imola) — not the 8 the original plan doc listed. Silverstone,
   Red Bull Ring, and Zandvoort are reverse-layout venues instead, a
   different feature entirely. An explanation must never claim
   LiDAR-accurate kerb data for those three.
2. F2 is very likely a single chassis (Dallara F2 2024) through
   2024–2026, not two distinct "2024 vs 2026" car classes as the plan
   doc speculated. An explanation must not invent a 2026 F2 chassis
   distinction.
3. Most of data's track pit-loss-seconds and safety-car-history figures
   are labeled `reasonable_estimate`, not `confirmed` — only Singapore
   (~100% SC) and Abu Dhabi (~38%/38%) are sourced. This directly affects
   how `raceContext.safetyCarProbabilityPct` should be presented: as a
   bare number in my current proposed shape it carries no confidence
   signal, so I've asked sim to either tag it (or its source
   `pitLossSeconds`/SC-probability figures) with a confidence level, or
   guarantee it shows up in `assumptionsUsed` when derived from a
   non-confirmed data figure — otherwise the explanation risks stating
   "61% safety car probability" with false precision instead of hedging
   as "historically high SC risk."

None of my current mock fixtures make LiDAR or F2-chassis claims, so
there was nothing to retroactively fix — but this is now baked into how
I'll treat any track/car-class fact I pass through as a `ReferenceFact`:
always carry data's confidence tag through verbatim rather than
hardcoding a claim into prompt text.

### Open items / not yet done

- **Data shape not yet confirmed by sim.** Messaged sim twice (once to a
  broken name reference before the coordinator fixed inter-agent
  addressing, once to their correct raw ID) with the proposed shape above
  and specific questions about field names/units, whether every citable
  number will be an explicit field, and how placeholder-derived values
  get flagged per-value. Building against `mockFixtures.ts` until that
  reply lands; will reconcile `types.ts` once it does.
- **No wiring into the UI yet** — `visual` owns the AI Explanation Panel
  screen; this module just needs to be called with a `StrategyComparison`
  and an `Anthropic` client instance. Deployment question (server-side
  key vs bring-your-own-key) is still open per the plan; `client.ts` is
  written to accept an already-constructed `Anthropic` client rather than
  assume where the key comes from, specifically so it doesn't have to
  wait on that decision.
- **Telemetry-import explanation mode (backlog #4)** — not started;
  depends on a stretch feature from sim that doesn't exist yet.
- **Edge cases beyond close-calls** — high safety-car-probability framing
  and wet-weather scenarios (mentioned in the "after the backlog" section
  of my brief) not yet specifically prompt-tested; `MOCK_CLOSE_CALL` gives
  Monaco a high (61%) safety-car probability as a first pass at that, but
  I haven't yet run real generations against it to see how the model
  handles combining "close call" framing with "high safety-car risk"
  framing in the same explanation.
