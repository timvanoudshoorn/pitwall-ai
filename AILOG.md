# AILOG — AI Reasoning & Explainability

Running log of prompt/approach decisions, what worked, and hallucination
risks guarded against. One entry per meaningful change; newest on top.

Owner: `ai` teammate. Files: `src/ai/*`.

---

## 2026-07-10 — Sourced overtaking-difficulty fact replaces hand-written Monaco placeholder

Followed up on the "nice to have" I flagged to `data`: a sourceable
overtaking-difficulty fact per track, to replace the hand-written (and
honestly, improperly tagged `confirmed` despite being unsourced) Monaco
"historically very difficult to overtake on" text that had been sitting in
`mockFixtures.ts` since the very first version of this module. Data landed
`data/track-lap-reference.json` (commit `dad1596`) with an
`overtakingDifficulty` field per circuit (tier + basis string,
`reasonable_estimate` for most tracks, `confirmed` for Monaco specifically
since it's "near-universally cited" rather than a single citable stat).

`trackReferenceFacts.ts#buildTrackReferenceFacts()` now also joins this
file: one additional `ReferenceFact` per track (topic
`${trackId}_overtaking_difficulty`), carrying data's real confidence tag
through unchanged, same pattern as the pit-loss/safety-car/LiDAR facts
already built there. Madring's `tier: "unknown"` (no races run yet) is
explicitly skipped rather than surfaced as a fact that says nothing —
same fail-quiet convention as a missing lookup entry.

`mockFixtures.ts`'s `MOCK_REFERENCE_FACTS` no longer hand-writes the
Monaco overtaking claim; it now splices in the real fact from
`buildTrackReferenceFacts('monaco')` so the mock and the live path can't
drift out of sync.

Verified via smoke test (`npx tsx`, scratch file deleted after):
`buildTrackReferenceFacts('monaco')` returns pit-loss + safety-car +
overtaking-difficulty (3 facts, `confirmed` on the overtaking one);
`buildTrackReferenceFacts('madring')` correctly omits an overtaking fact
(tier `unknown`, skipped) while still returning its safety-car
placeholder fact; `buildTrackReferenceFacts('spa')` returns all three.
`tsc --noEmit -p tsconfig.app.json` clean for `src/ai/*`.

---

## 2026-07-10 — Wet-weather / probabilistic-event grounding rule + mock fixture

Picked up the "high safety-car probability and wet-weather scenarios not yet
specifically prompt-tested" open item from the previous session's log.
Named-teammate `SendMessage` was reportedly broken (missing `name` param on
spawn, since fixed by the coordinator with raw IDs) so no reply had landed
from anyone about this before I resumed; treating it as still open and
picking it up rather than waiting further.

**Risk identified:** `RaceContext.weather.rainProbabilityPct` and
`raceContext.safetyCarProbabilityPct` are both whole-race probabilities —
there is no per-lap forecast field anywhere in `StrategyComparison`. But
nothing in the original `GROUNDING_RULES` explicitly forbade the model from
narrating a specific lap as "when the rain arrives" or "when the safety car
comes out." This is exactly the kind of hallucination the numeric-grounding
checker (`grounding.ts`) is documented as unable to catch: if the model
picks a lap number that happens to already be a real pit-lap field (e.g.
"rain arrives around lap 12" where 12 is a genuine pit-stop lap from FACTS),
the number passes the allow-list check cleanly even though the *claim*
attached to it — that the model knows when rain starts — is invented. Same
failure shape as the undercut/overcut window-vs-full-race disambiguation
logged previously: a real number, misused.

**Fix:** added rule #6 to `GROUNDING_RULES` in `promptBuilder.ts` —
explicitly states these two fields are probabilities, not forecasts, bans
asserting a specific lap for rain arrival or safety-car deployment, and
carves out the one legitimate case (a strategy that's already described as
a reactive/contingency plan keyed to a real lap, e.g. "if the safety car
comes out before lap 35, box early" — this is conditional phrasing about an
already-real candidate's pit lap, not a claim about when the event itself
happens, and matches how `AIExplanationScreen.tsx`'s placeholder mock text
already phrases it).

**Test fixture added:** `MOCK_WET_WEATHER` in `mockFixtures.ts` — Spa,
`mixed` weather, 70% rain probability, 45% safety-car probability,
comparing an intermediate-start hedge against a slick-start gamble.
Verified via smoke test (`npx tsx`, scratch file deleted after):
- Rule 6 text is present in the constructed system prompt for both
  `buildRecommendationPrompt` and `buildWhyNotAlternativePrompt` against
  this fixture.
- Confirmed the failure mode rule 6 targets is real and un-catchable by
  `checkGrounding` alone: a synthetic explanation string asserting "rain
  will arrive around lap 12" (12 being the fixture's genuine pit-stop lap,
  27.4 being the fixture's genuine delta) produces zero grounding
  warnings — the numbers are 100% real, so only the new prompt-level rule
  guards against this, not the post-generation numeric check. This is the
  same category of defense as the undercut/overcut window-disambiguation
  fix: prompt-level instruction doing work the numeric checker structurally
  cannot.

No live API calls made (no `ANTHROPIC_API_KEY` available in this
environment, consistent with prior sessions) — this is prompt-construction
and grounding-logic verification only, same testing ceiling as the rest of
this module's development so far. `tsc --noEmit -p tsconfig.app.json`
clean for `src/ai/*`.

---

## 2026-07-10 — Undercut/overcut mechanism wired into why-not-alternative mode

Followed up on the undercut/overcut question from the sim reconciliation
thread now that I had a concrete case to test against (why-not-alternative
comparing two same-shape 1-stop strategies that differ only in pit-lap
timing — exactly the `MOCK_CLOSE_CALL`-style scenario). Went with the
approach I told sim I preferred: call `undercutOvercutDelta()` directly
rather than asking `StrategyComparison` to grow a new field, since the
value is a property of a *pair* of candidates being compared, not of one
strategy.

**What was built:**
- `src/ai/mechanismFacts.ts` — `deriveUndercutOvercutMechanism(comparison,
  idA, idB)` detects whether two candidates are "the same plan, different
  pit-lap timing" (same stop count, same compound sequence, exactly one
  divergent pit lap) and if so, derives the exact inputs
  (`earlyStopLap`/`lateStopLap`/compounds/`lapsOnTyreAtWindowStart`/pit-loss
  figures) from the candidates' own `stints`/`pitStops` fields and calls
  sim's `undercutOvercutDelta()` directly. Returns `null` — no forced
  framing, no crash — when the two candidates aren't directly comparable
  this way (different stop counts or compound choices). Verified both
  paths with an integration smoke test: a real same-shape Monaco case
  correctly derives the mechanism, and a real different-shape Monza case
  (1-stop vs 2-stop, different compounds) correctly returns `null`.
- `promptBuilder.ts` — `buildWhyNotAlternativePrompt` now includes an
  `UNDERCUT/OVERCUT MECHANISM` fact block when applicable, with an
  explicit instruction to use its verdict/numbers directly rather than
  reasoning about pit timing qualitatively.
- `BuiltPrompt` gained an optional `groundedExtras` field so the
  mechanism result's numbers (which don't live inside the
  `StrategyComparison` object) still get added to the grounding
  checker's allow-list — `grounding.ts#buildAllowedNumbers` takes a third
  `extraGroundedObjects` param for this. Without it, the checker would
  have flagged every number in the mechanism block as "ungrounded" even
  though they're real sim output — an oversight that would have made the
  new feature actively worse than not having it (spurious warnings on a
  correct explanation), caught by re-running the grounding self-check as
  part of testing rather than assuming the plumbing was right.

**Hallucination risk found and addressed before it could reach a real
generation:** in testing, the window-isolated `netDeltaSec` from the
mechanism (20.625s, the undercut's advantage over just the 5-lap pit
window) turned out meaningfully different from the full-race
`deltaToBestSeconds` between the same two candidates (11.621s) — both are
genuine, correctly-grounded numbers, but they answer different questions
(the late pitter's fresher tyre for the remaining laps claws back most,
not all, of the window loss). Both numbers passing the grounding check
individually would NOT have caught a model conflating them — e.g.
stating "so this strategy loses by 20 seconds overall," which uses a
real number but misrepresents what it measures. That's exactly the kind
of subtler, non-numeric-hallucination risk the grounding checker is
explicitly documented as unable to catch (see grounding.ts's own
caveat). Addressed it in the prompt itself rather than trying to catch
it after the fact: `formatMechanismFact()` now includes an explicit
IMPORTANT note that the window number is not the full-race outcome, that
the FACTS block's "Delta to best strategy" is the full-race figure, and
that if both are cited, they must be labeled as measuring different
things. This is a good concrete instance of the general principle in my
brief: a number can be 100% traceable to real sim output and the
explanation can still be misleading — the numeric-grounding check is a
necessary but not sufficient defense, and prompt-level disambiguation is
still doing real work.

Not yet sent to sim/bugs — will mention in the next status update rather
than opening a new thread for something that didn't require any change
on sim's side.

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

## 2026-07-09 — Track confidence lookup wired in (`trackReferenceFacts.ts`)

Data shipped `data/track-confidence-lookup.json` (commit `60d437d`) — a
flat, single-lookup view of tracks.json's pit-loss and safety-car
confidence/basis fields, keyed by the same `trackId`s tracks.json uses.
Explicitly documented on their end as a derived convenience file, not a
new source of truth (`_meta.sourceOfTruth: "data/tracks.json"`).

Added `src/ai/trackReferenceFacts.ts`: `buildTrackReferenceFacts(trackId)`
joins against that file and returns `ReferenceFact[]` — one for pit-loss
(skipped if `pitLossSeconds` is `null`, e.g. Madring which has no
real-world data yet), one for safety-car tier, and a `confirmed`-tier
LiDAR fact when applicable. Each carries data's actual confidence tag
through unchanged (`confirmed` / `reasonable_estimate` / `placeholder`),
which is the whole point — this exists independently of whatever sim's
`raceContext` shape ends up doing with `safetyCarProbabilityPct`, so I'm
not blocked on sim adding a confidence sibling field to that.

Verified via smoke test (`npx tsx`, scratch file deleted after):
- Monaco → both facts `reasonable_estimate`, as expected.
- Singapore → pit-loss `reasonable_estimate`, safety-car `confirmed` with
  its source URL — matches data's flagged "only Singapore and Abu Dhabi
  are sourced" note.
- Unknown trackId → empty array, no throw (fail-quiet by design; a
  missing optional caveat is better than a request failing outright).

Read-only consumer of `data/track-confidence-lookup.json` — never writes
to anything under `data/`, per role boundaries. Full-project `tsc
--noEmit` shows pre-existing errors in `src/mocks/carClasses.ts` and
`src/sim/weather.ts` (not my files, not touched) but nothing in
`src/ai/*`; `oxlint src/ai` clean.

## 2026-07-09 — Sim shape confirmed; first real integration test found + fixed a grounding bug

Sim confirmed `src/sim/strategyCompare.ts#compareStrategies()` produces
`StrategyComparison` exactly as specified in `types.ts` — no changes
needed on either side. Confirmed: seconds as floats (rounded to 3
decimals), 1-indexed inclusive lap ranges, every number I might cite is
an explicit field (never derive one myself), and per-value placeholder
provenance is via `assumptionsUsed` string flags rather than a per-field
confidence tag (their reasoning: avoids shape bloat). Each candidate also
carries a coarse `confidence: 'high'|'medium'|'low'` derived from how
many placeholder flags fed that specific candidate.

Ran a real integration smoke test (`compareStrategies()` → `buildRecommendationPrompt()`
→ `checkGrounding()`, scratch file deleted after) using an actual
Monaco 1-stop-vs-1-stop-late case. This caught a genuine bug in my own
grounding check, not a hypothetical: the numeric-token regex in
`grounding.ts` tokenized a lap range like `"laps 1-35"` as `1` and
`-35` (reading the range hyphen as a minus sign), producing a
false-positive grounding warning on `-35` even though `35` was a
perfectly grounded number straight from sim's `endLap` field. Fixed by
adding a negative lookbehind (`(?<!\d)-?\d+(\.\d+)?`) so a `-` is only
treated as a sign when it isn't immediately preceded by a digit.
Re-verified: the real prompt now produces zero grounding warnings, a
synthetic fabricated number (99.9) is still caught, and a genuine
negative number in prose ("-5.2s") is still correctly parsed as negative
(the lookbehind only changes the range-hyphen case). This is exactly the
kind of thing bugs flagged wanting watched — worth noting that the bug
was in my own hallucination-detection code, not in an actual model
output, but it would have produced a spurious warning against a
perfectly grounded real explanation, which is its own kind of failure
(crying wolf erodes trust in the check). Caught by testing against real
sim output rather than only hand-built mocks — the mock fixtures'
`formatCandidate()` output happened not to trigger it in earlier manual
review.

Also noted: sim flagged that `RaceContext.carClass` is typed as plain
`string`, so data's car-class cleanup (F2 collapsed to one `f2` key,
`icons` removed as a class) doesn't break anything on my end — no action
needed, just don't write copy assuming `f2_2024`/`icons` exist as
classes.

sim's `assumptionsUsed` output for the Monaco test case included flags
like `base_lap_time_generic_placeholder` and `tyre_compound_params_placeholder`
— confirms the placeholder-caveat instruction in `GROUNDING_RULES` has
real content to act on, not just the mock's hand-picked assumption
strings.

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
