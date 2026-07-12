# SIMLOG — Strategy/Simulation Engine Log

Owner: `sim` teammate. This file documents every model in `src/sim/`, its
formula/approach, and every assumption made where real F1 25 data wasn't
available. Cross-referenced by number from code comments (`SIMLOG.md #N`).

Every placeholder constant lives in `src/sim/constants.ts` and is tagged
`PLACEHOLDER` in a comment. Every model function returns an
`assumptionFlags: string[]` array naming which placeholders fed that
specific result, so nothing is silently baked in — the `ai` teammate's
explanation layer is expected to read these and hedge accordingly.

**Convention borrowed from data teammate's DATALOG.md:** where a value
originates from their reference data, I tag it with their confidence
level (`confirmed` / `reasonable_estimate` / `placeholder`) via an
optional `sourceConfidence` param on the relevant function, which surfaces
as `<field>_source_confidence_<level>` in `assumptionFlags`.

---

## 1. Core tyre degradation model — `degradation.ts`

**Approach:** two-phase (linear + cliff) degradation curve per compound,
the standard shorthand used across motorsport strategy tooling when
telemetry-derived curves aren't available:

```
lapTimeDelta(lapsOnTyre) =
    paceOffsetVsHard                                    [compound baseline offset]
  + warmupPenalty(lapsOnTyre)                            [cold-tyre phase, decays to 0 by warmupLaps]
  + linearWearRate * min(lapsOnTyre-1, cliffLap-1)         [gradual wear]
  + cliffWearRate * max(0, lapsOnTyre - cliffLap)           [steep post-cliff wear]
```

All scaled by `carClass.tyreWearMultiplier * performanceTier.tyreWearMultiplier`.
Result is a DELTA in seconds vs a hypothetical fresh-hard tyre on lap 1 —
combine with `fuel.ts` and a track's absolute base laptime for a real
laptime.

**Placeholders (none of this is F1 25 telemetry-derived):**
- `paceOffsetVsHard` per compound (soft -0.9s, medium -0.45s, hard 0,
  intermediate +4.5s dry-baseline, wet +9.0s) — motorsport-realistic
  ballpark figures (soft/medium/hard gaps roughly match commonly-cited
  real-F1 compound deltas; inter/wet dry-baseline offsets are illustrative
  since those compounds are only meant to be read via `weather.ts`'s
  wetness-adjusted penalty, not their dry offset directly).
- `linearWearRate` / `cliffWearRate` / `cliffLap` / `nominalLife` per
  compound — invented curve shapes with the right qualitative behavior
  (softer = faster wear, earlier cliff) but not calibrated to any real
  degradation data.
- Cold-tyre warmup penalty (~0.6s on lap 1, PLACEHOLDER, decaying linearly
  to 0 over `warmupLaps`) — reasonable but unsourced.

**Resolved 2026-07-10 (later):** `DEFAULT_BASE_LAP_TIME_SEC = 90s` fallback
in `strategyCompare.ts` unchanged, but `RaceSimInput.baseLapTimeSec` is now
documented as the intended landing spot for data teammate's
`data/track-lap-reference.json` `referenceLapTimeSec` (the circuit's
official GP lap record — a floor/reference value, same role the flat 90s
placeholder played; real race pace comes out higher once tyre/fuel deltas
are added on top, per data's own note). Added
`RaceSimInput.baseLapTimeSourceConfidence` so non-`confirmed` track values
(all but Bahrain/Monaco, per data's file) surface as
`base_lap_time_source_confidence_<level>` in `assumptionsUsed` instead of
silently reading as exact fact — same `sourceConfidence` convention as
`pitStopLoss.ts`/`safetyCar.ts`. No functional change to the calculation
itself (this field was already caller-suppliable); this closes the loop
now that a real source exists. Caller (visual) is responsible for the
JSON lookup, same pattern as track-tyre-characteristics.json.

**Resolved 2026-07-10:** track-specific abrasiveness is now wired in.
Data teammate supplied `data/track-tyre-characteristics.json` — a 1
(gentle, e.g. Monaco/Monza) to 5 (punishing, e.g. Silverstone/Lusail)
rating per circuit, synthesized from Pirelli's public rating methodology
applied to well-documented circuit reputations (their own confidence
label: `reasonable_estimate` for nearly every track, no official
per-season numeric table exists publicly). `degradation.ts` exposes
`trackAbrasivenessMultiplier(rating)` — a linear placeholder mapping
(rating 3 = neutral 1.0, each step = ±10% wear rate, PLACEHOLDER not
calibrated to real degradation data) — and `DegradationOptions.trackAbrasivenessRating`
threads it through `tyreLapTimeDelta`/`estimateTyreLife`/`strategyCompare.ts`'s
`RaceSimInput.trackAbrasivenessRating`. Caller is responsible for reading
the rating out of data's JSON and passing it in (sim doesn't duplicate
their reference file). Verified: medium tyre, lap 10, otherwise-identical
inputs — Monaco (rating 1) shows lapTimeDeltaSec -0.054s vs Silverstone
(rating 5) +0.144s, same base wear scaled by the multiplier.

---

## 2. Fuel-effect model — `fuel.ts`

**Approach:** linear laptime cost per kg of fuel carried, standard
approximation (real F1 cars are close to linear across race-fuel range).
`fuelRemaining()` assumes linear burn from `startFuelKg` to a small
reserve across the race distance. `fuelTyreWearCoupling()` adds a modest
wear-rate multiplier for cars carrying more fuel (heavier car -> more
load through the tyre).

**Placeholders:**
- `secondsPerKg = 0.032` — within the commonly-cited real-F1 range
  (~0.03-0.035s/kg/lap), not F1-25-specific.
- `fuelBurnPerLapKg = 1.6`, `startFuelKg = 110` — generic full-race
  placeholders, still used as the last-resort fallback when neither
  `startFuelKg` nor `trackFuelPerLapKg` is supplied.
- `tyreWearFuelCouplingFactor = 0.15` — invented, qualitatively reasonable
  coupling strength, not measured.

**Resolved 2026-07-10:** `FuelOptions` gained `trackFuelPerLapKg` +
`sourceConfidence`. Pass data teammate's
`data/track-lap-reference.json` `fuelPerLapKg` (their explicit,
documented-not-measured formula: `0.30*circuitLengthKm + 0.15 +
(fullThrottlePct-60)/100*0.4`) and `fuelRemaining()` derives
`startFuelKg = trackFuelPerLapKg * totalLaps + reserveFuelKg`
automatically — no need for the caller to hand-roll that arithmetic.
Ignored if `startFuelKg` is passed directly. Non-`confirmed` values surface
as `fuel_per_lap_source_confidence_<level>` (every circuit in data's file
is `reasonable_estimate`, so this will always fire when wired in — expected,
not a bug). Verified: Monaco-like 1.07kg/lap over 78 laps → 84.96kg start
load, vs the flat 110kg placeholder.

---

## 3. Pit-stop loss model — `pitStopLoss.ts`

**Approach:** `totalPitLoss = pitLaneDeltaSec + stationaryTimeSec`, optionally
scaled by a `fieldStateFactor` (used by `safetyCar.ts` for caution-period
stops). `pitLaneDeltaSec` can be supplied directly by the data teammate,
or derived from geometry (`pitLaneLengthM`, `pitLaneSpeedLimitKph`,
`racingLineSpeedKph`) via `pitLaneDeltaFromGeometry()`.

**Placeholders (used only when no track data is supplied at all):**
- `defaultPitLaneDeltaSec = 18.5s`, `defaultStationaryTimeSec = 2.4s` —
  generic-track / modern-F1-pit-crew ballpark.

**Data integration:** accepts `sourceConfidence` — when the caller passes
a data-teammate-sourced value tagged `reasonable_estimate` or
`placeholder` (per their DATALOG.md; as of 2026-07-09 only Singapore and
Abu Dhabi SC/VSC figures are `confirmed`, most `tracks.json` pit-loss
figures are `reasonable_estimate`), that propagates into
`assumptionFlags` as `pit_loss_source_confidence_<level>`.

---

## 4. Undercut/overcut delta calculator — `undercutOvercut.ts`

**Approach:** simulate the window between two cars' pit laps lap-by-lap
using the degradation model, assuming equal underlying base pace (isolates
the tyre-age effect, which is what undercut/overcut is actually about — if
the two cars aren't equal pace, add the known per-lap gap to the result
yourself). Early car pays pit loss up front and runs fresh laps 1..N; late
car keeps aging its current tyre for N laps then pays pit loss at the end.
`netDeltaSec > 0` = undercut wins, `< 0` = overcut wins, within ±0.15s =
`even`.

**Placeholders:**
- `outLapPenaltySec = 0.3s` (pit-exit traffic/cold-tyre snap beyond the
  compound's own warmup curve) and `inLapPenaltySec = 0.2s` (fuel-saving
  pace loss on the lap before a stop) — both invented, qualitatively
  standard in strategy commentary, not measured.
- `EVEN_THRESHOLD_SEC = 0.15s` — arbitrary "close enough to call a wash"
  cutoff.

---

## 5. One/two/three-stop full-race comparison — `strategyCompare.ts`

**Approach:** `compareStrategies()` takes a race context + an array of
candidate `StrategyPlan`s (ordered list of `{compound, plannedLaps}`
stints), runs the degradation + fuel model lap-by-lap for every stint of
every candidate, adds pit loss once per stop, sums to a predicted total
race time, ranks candidates, and returns the shape agreed with the `ai`
teammate (`StrategyComparison` in `src/ai/types.ts`) — see that file for
the field contract, reconciled 2026-07-09.

**Known limitation (documented, not hidden):** this is "isolated car,
clear track" pace — there's no inter-driver traffic/overtaking/track-position
model yet. A strategy's predicted total time doesn't yet account for
whether the car comes out of the pits into traffic. That's a reasonable
v2 once `undercutOvercut.ts`'s per-rival delta math is wired into a
multi-car race order simulation.

**Placeholders:**
- `DEFAULT_BASE_LAP_TIME_SEC = 90s` — used only if no track-specific
  baseline is supplied; wildly track-dependent in reality (Monaco ~72s,
  Spa ~106s), so this should always be overridden once data teammate's
  track file is wired in.
- `CLOSE_CALL_THRESHOLD_SEC = 2.0s` — arbitrary margin below which two
  strategies are flagged `isCloseCall: true` in `marginAnalysis`.
- Per-candidate `confidence` is a simple heuristic (≤2 distinct
  assumption flags = high, ≤5 = medium, else low) — not a statistical
  confidence interval, just a coarse signal for the `ai` teammate.

---

## 6. Safety car / VSC probability model — `safetyCar.ts`

**Approach:** first pass models "does an SC/VSC happen at all this race,
and roughly when" rather than a full per-lap hazard curve (e.g. elevated
lap-1 pileup risk isn't modeled separately yet — documented limitation,
not hidden). `safetyCarProbability()` converts a per-race "at least one
incident" probability into a Poisson rate (`lambda = -ln(1-p)`) so the
Monte Carlo generator (`generateSafetyCarScenarios()`) has an internally
consistent rate to sample from. Each Monte Carlo draw is a single
Bernoulli occurrence per race (not a full point process across laps) —
a reasonable first pass given the team doesn't yet have per-lap-bucket
incident data.

`pitLossUnderCaution()` reduces pit-stop time loss under SC/VSC (whole
field is slowed, so the relative cost of pitting drops).
`tierAdjustedCautionValue()` scales that savings by
`PERFORMANCE_TIERS[tier].safetyCarValueMultiplier` — a Backmarker values a
cheap/free stop more than a Top Tier car because track position matters
more when raw pace can't make up the difference, per the plan's explicit
ask (item 9 / item 6 interaction).

**Placeholders (flagged clearly, no historical data wired in yet):**
- `genericPermanentCircuit`: 35% SC / 45% VSC per race.
- `genericStreetCircuit`: 65% SC / 55% VSC per race.
- `SC_DURATION_LAPS_RANGE = [3,6]`, `VSC_DURATION_LAPS_RANGE = [1,3]`.
- `scPitLossFactor = 0.4`, `vscPitLossFactor = 0.6` (fraction of green-flag
  pit loss actually paid under caution).

**Data integration:** as of 2026-07-09, data teammate's `tracks.json` has
per-track SC/VSC figures for all 24+1 calendar tracks, but only Singapore
(~100% SC) and Abu Dhabi (~38%/38%) are `confirmed` — everything else is
`reasonable_estimate`. `safetyCarProbability()` accepts
`scProbabilityPctOverride`/`vscProbabilityPctOverride` plus
`sourceConfidence` so non-confirmed track values still show up in
`assumptionFlags` as `safety_car_source_confidence_reasonable_estimate`
rather than being silently presented as fact.

**Why this wasn't escalated to a heavier Monte Carlo / Opus pass:** the
plan flagged this as the one item worth slowing down on if it turned out
"genuinely hard." The single-Bernoulli-per-race model plus a Monte Carlo
scenario generator for callers who want distributions covers the
strategy-comparison use case (does pitting into a caution window change
the expected-value ranking) without needing a full stochastic race
simulator. Revisit if the `ai` or `visual` teammate needs lap-by-lap
incident hazard curves for a chart rather than a summary probability.

---

## 7. Weather transition modeling — `weather.ts`

**Approach:** `trackWetnessAtLap()` models a 0 (dry) - 1 (full wet)
fraction ramping linearly over `transitionWindowLaps` from a rain start
lap (and optionally back down from a rain end lap). `compoundWeatherPenalty()`
scores each compound's mismatch to current wetness: slicks get a
quadratically-growing "aquaplane" penalty past a wetness threshold;
inter/wet get a linear penalty for wetness outside their configured
optimal range (`crossoverWetnessMin/Max` in `constants.ts`).
`recommendedCompoundForWetness()` picks the lowest-total-offset compound.
`rainScenarioExpectedValue()` blends dry / rain-adapted / rain-misjudged
total race times by rain probability and an (optional, defaults to 50/50)
"correct tyre call" probability — a simple 3-branch decision tree, not a
full Markov/Monte Carlo weather model, chosen to keep the first pass
usable without a stochastic race simulator.

**Placeholders:**
- `SLICK_AQUAPLANE_WETNESS_THRESHOLD = 0.12`, penalty scale constants —
  invented curve shape (correct qualitative behavior: slicks become
  unraceable fast past a low wetness threshold).
- `crossoverWetnessMin/Max` per wet compound in `constants.ts` (inter:
  0.15-0.6, wet: 0.55-1.0) — reasonable motorsport ballpark, not measured.
- Default 50/50 "correct call" probability in `rainScenarioExpectedValue()`
  when the caller doesn't supply one.

---

## 8. ERS deployment guidance (2026 Season Pack) — `ers.ts`

**Approach (revised 2026-07-09 after data teammate correction):** data
teammate's research into the 2026 regulation pack found Overtake Mode
replaces DRS entirely and is **battery-state-of-charge-gated** (up to
350kW within 1s of a car at a Detection Line, through the next Activation
Line, gated by remaining SoC) — not a fixed per-race allowance of discrete
uses. Modeled accordingly as a depleting/regenerating resource:
`advanceBatterySoc()` drains SoC per activation and regenerates a flat
amount per lap (capped at capacity); `overtakeModeRationing()` gives
budget-per-opportunity guidance from current SoC. Active Aero
(Cornering/Straight Line Mode) is automatic and zone-locked per data
teammate's research — not a driver-controlled lever — so `activeAeroBenefit()`
returns a flat estimated per-lap gain rather than a mode selector.

`ersModelApplicable()` gates all of this off for any car class whose
`ersModel !== '2026'` (returns `applicable: false` with a reason).

**Placeholders (everything numeric here, shape is the only thing informed
by real research):**
- `batteryCapacitySoc = 100`, `socDrainPerActivation = 12`,
  `socRegenPerLap = 12` — invented abstract SoC units, no in-game figures
  published.
- `overtakeModeGainSec = 0.45s` per activation — illustrative.
- `activeAeroDragDeltaPct = 0.12` — still a flat invented estimate.
  `estimatedLapTimeGainSec` is now track-aware (**resolved 2026-07-10**):
  `activeAeroBenefit(fullThrottlePct?, sourceConfidence?)` scales the
  0.25s reference gain by `fullThrottlePct / 65` (65% = rough
  calendar-average full-throttle %, itself a PLACEHOLDER guess at what the
  original flat estimate was implicitly calibrated against) when the
  caller passes data teammate's `data/track-lap-reference.json`
  `fullThrottlePct`. Falls back to the flat 0.25s if omitted. Verified:
  Monaco (40%) → 0.154s, Monza (82%) → 0.315s vs the 0.25s flat baseline —
  correct direction (more straight-line time = bigger Active Aero payoff).
  Still explicitly a shape approximation, not calibrated to real Active
  Aero telemetry.
- **Updated 2026-07-10:** No confirmed in-game 2025-vs-2026 laptime delta
  exists yet, but data teammate supplied a real-world sourced range:
  FIA/Tombazis predicted 2026 cars ~1.0-2.5s/lap slower than 2025
  pre-season; actual 2026 Melbourne results came in slower still (~2.1-3.4s
  off 2025 times). `f1_2026_season_pack.basePaceOffsetSec` corrected from
  an erroneous `-0.1s` (implying 2026 cars are FASTER, which was wrong) to
  `+2.75s` (midpoint of data's recommended 2-3.5s range). Still explicitly
  NOT confirmed in-game F1 25 telemetry — how EA's in-game modeling maps
  to the real 2026 regulation transition remains an open question data
  flagged, so this stays in `assumptionFlags` as `car_class_pace_offset_placeholder`.

---

## 9. Performance-tier slider — `performanceTier.ts` + `constants.ts`

**Approach:** the tier slider (Backmarker/Midfield/Contender/Top Tier) is
not a separate model — `resolveCarProfile(carClass, tier)` combines
`CAR_CLASSES[carClass]` (category-level pace/wear, e.g. F1 vs F2 gap) with
`PERFORMANCE_TIERS[tier]` (competitiveness-level pace/wear/caution-value)
additively/multiplicatively, and every other model (`degradation.ts`,
`strategyCompare.ts`, `undercutOvercut.ts`, `safetyCar.ts` via
`tierAdjustedCautionValue`) accepts `carClass`/`performanceTier` directly
rather than requiring callers to pre-resolve a profile.

**Important design correction (2026-07-09, from data teammate's
DATALOG.md):** `CAR_CLASSES[*].basePaceOffsetSec` must represent a
genuine category pace gap (F2 structurally slower than F1) and must NOT
encode team-quality/competitive narrative (a strong or weak team within a
class) — that's what the tier slider is for. Originally `apxgp` and
`icons` had narrative-driven pace offsets baked in at the class level;
both were wrong for different reasons — `apxgp` should let the tier
slider carry its "underdog" narrative instead of presupposing it, and
`icons` was removed as a class entirely (Icons/legends drivers race
whatever team car they're recruited into, so they inherit that team's
class+tier rather than having their own).

**Placeholders:**
- `PERFORMANCE_TIERS` pace offsets are now **percent-off-ultimate-pace**
  (revised 2026-07-09 per data teammate's `data/performance-tiers.md`
  open item #1 — percentage scales correctly across circuits of
  different lap length, flat seconds doesn't): Backmarker 2.0%,
  Midfield 1.1%, Contender 0.5%, Top Tier 0% — each the midpoint of the
  range data proposed. Converted to seconds for a specific track via
  `baseLapTimeSec * paceOffsetPct * carClass.tierPaceRangeScale`
  (`strategyCompare.ts`/`performanceTier.ts`). Tyre-wear multipliers
  (1.12/1.05/1.0/0.97) unchanged — invented, qualitatively reasonable
  (worse car = more sliding = modestly worse tyre life despite lower
  pace), not calibrated against real data.
- `CAR_CLASSES[*].tierPaceRangeScale`: F2 compressed to 0.25x the F1
  reference range (data teammate's reasoning: real-world FIA F2 runs a
  single spec chassis, so driver skill dominates over car-to-car pace
  variance — a Backmarker-to-Top-Tier F2 spread should be much narrower
  than F1's). All other classes at 1.0x (no compression) pending
  class-specific reasoning.
- `safetyCarValueMultiplier` per tier (1.3/1.1/1.0/0.9) — invented,
  directionally matches the plan's explicit ask (track position matters
  more for a Backmarker), not measured.
- `CAR_CLASSES` category pace offsets: F1 2025/2026/APXGP/F1 World at
  parity (0s, class-level), F2 at +4.9s (average of data teammate's two
  now-collapsed F2 estimates). `f2.tyreWearMultiplier = 1.07` similarly
  averaged. These stay flat seconds (not percentage) — a genuine category
  gap between formulae, not yet converted to percentage form; revisit if
  it turns out to also need track-length scaling.
- F1 World defaults to `midfield` tier when the caller doesn't specify one
  (`DEFAULT_TIER_BY_CLASS` in `performanceTier.ts`) — data teammate's
  agreed-default (not confirmed, no EA-published number exists), since F1
  World has no team identity to infer competitiveness from.
- Konnersport and APXGP are explicitly NOT hardcoded to a fixed tier per
  data's reasoning (narrative teams without a fixed competitive record) —
  the tier slider is the mechanism for a user/career-state to express
  "where is this team right now," not a class-level default.

**Resolved:** the flat-seconds-vs-percentage question (open item #1 in
data's draft) is resolved as above. Still open from their draft: whether
"Top Tier chews tyres faster on high-deg tracks" (a real-F1 nuance) is
worth modeling — deferred as a v2 refinement, not core to the backlog.

---

## 10. Lap-by-lap gap evolution — `raceGapEvolution.ts`

**Approach:** `visual`'s Strategy Battle screen was stubbed with a
placeholder panel explicitly flagged to sim (CLAUDE.md's "What's still
open" list: "sim hasn't produced a per-lap position/gap series"). Rather
than re-deriving lap-by-lap math separately, refactored
`strategyCompare.ts`'s inner per-lap loop into an exported
`perLapStrategyTrace()` (same tyre/fuel/pit-loss math, now also returning
`cumulativeTimeSec[]` indexed by lap) so `compareStrategies()`'s headline
`predictedTotalRaceTimeSeconds` and this chart's gap series can never
silently drift apart. `raceGapEvolution()` calls it once per candidate and
diffs the two cumulative-time arrays lap-by-lap.

**Sign convention:** `gapSeconds > 0` = candidate A ahead (broadcast-style
gap readout, A is always the reference car). Also returns each candidate's
pit laps so the chart can mark pit-lane events on the gap line.

**Known limitation (inherited from `strategyCompare.ts`, documented not
hidden):** isolated-car pace only — assumes the SAME car (class/tier/track
held constant) running two different strategies, not two different cars'
actual on-track gap (that needs the not-yet-built multi-car race-order/
traffic model). Because both candidates share one car, class+tier pace
offset cancels out of the gap and is deliberately omitted from this
calculation (see the file's doc comment for how to extend it if a future
use case needs to diff two different cars).

**No new placeholders** — reuses `degradation.ts`/`fuel.ts`'s existing
ones, surfaced the same way via `assumptionFlags`.

Verified: 20-lap smoke test, 1-stop (M10/H10) vs 2-stop (S7/S7/M6)
candidate — 21 points (lap 0..20), pit laps correctly at [10] and [7,14],
gap starts at 0 and diverges as expected once tyre age/pit timing differ.

---

## 11. Telemetry import (personal pace recalibration) — `telemetry.ts`

**Approach:** the plan doc's stretch feature ("a telemetry import so a
user's own lap times recalibrate the pace model to them specifically"),
picked up 2026-07-11 once the core backlog + gap-evolution addition were
done and wired in by visual, per the coordinator's explicit go-ahead and
sizing guidance. Deliberately narrow first-pass scope: `importTelemetry()`
takes a raw `lapTimesSec: number[]` plus the user's already-selected
class/tier/track baseline, and returns ONE personal pace offset
(seconds/lap and percent-off-ultimate-pace) — no personal tyre-wear or
fuel recalibration in this pass, flagged as a natural v2 rather than
built now.

**Outlier filtering:** a raw lap log has no metadata for box laps/
out-laps/traffic/spins/safety-car laps, so laps slower than
`fastestLap * 1.07` are dropped before taking the **median** of what's
left as the "representative pace." The 1.07 multiplier reuses F1's real
107%-qualifying-rule number as a readymade cutoff — explicitly flagged
PLACEHOLDER methodology (borrowed from a different context, not validated
against real telemetry logs; a real implementation would use actual
lap-flag metadata instead of a blanket time cutoff).

**Wiring into strategyCompare.ts:** `RaceSimInput` gained
`personalPaceOffsetSec?`/`personalPaceConfidence?`, added additively onto
the existing class-offset term (so class/tier selection isn't replaced,
just recalibrated around this specific user) and flagged in
`assumptionsUsed` as `personal_pace_telemetry_applied` +
`personal_pace_confidence_<level>` when not high-confidence. Reuses
`resolveCarProfile()` from `performanceTier.ts` for the "what did the
model expect" baseline rather than duplicating that math.

**Confidence heuristic** (sample-size-based, not a real statistical CI,
same spirit as `strategyCompare.ts`'s per-candidate confidence field):
≥15 kept laps = high, ≥5 = medium, else low. Throws if fewer than 3 laps
are supplied at all — no meaningful "representative pace" claim from 1-2
laps.

Verified: 10-lap synthetic log (9 consistent ~88.0s laps + one 95.5s
traffic/mistake outlier) against a midfield F1 2025 90s-baseline track —
outlier correctly excluded (9 laps kept), representative pace 88.0s,
personalPaceOffsetSec -2.99s vs the model's 90.99s expectation, medium
confidence (9 laps). Fed into `compareStrategies()`: a 20-lap race totalled
59.8s less (20 × -2.99s, exact) with the offset applied vs without —
confirms the wiring lands exactly as intended, additively, with no
side-effects on tyre/fuel math.

Messaged `ai` teammate directly (2026-07-11) — they flagged a
telemetry-aware explanation mode as their backlog item #4, blocked on
exactly this landing.

---

## 12. Qualifying-format grid chaos — `constants.ts` + `safetyCar.ts`

**Found by coordinator's audit (2026-07-11):** `qualifyingFormat`
(One-Shot / Short Qualifying / Full Qualifying — original plan-doc scope,
"qualifying-format-aware grid assumptions") was stored UI state in
`src/types/session.ts`/`RaceParametersScreen.tsx` with **zero effect on
any sim calculation** — confirmed by tracing it through
`src/lib/raceSimAdapter.ts`'s `resolveRaceSimContext()`, which never reads
`raceParameters.qualifyingFormat` at all. A genuinely dead/decorative
parameter, not a placeholder-with-a-flag — worse, since nothing even
signaled it was unused.

**Model built:** qualifying format doesn't change race-distance pace (that
model is deliberately not touched), but it plausibly changes how scattered
the STARTING GRID is relative to true pace, which is a real motorsport
effect on first-lap contact/incident risk — exactly the "SC/VSC exposure"
hook the coordinator suggested. Added `QUALIFYING_FORMATS` to
`constants.ts`: a `scProbabilityMultiplier`/`vscProbabilityMultiplier`
per format, applied in `safetyCarProbability()` (new optional
`qualifyingFormat` input) on top of whatever SC/VSC probability was
already resolved (generic default or data-sourced override) — multiplies,
doesn't replace, so it composes cleanly with the existing
`sourceConfidence` machinery. New `qualifying_format_grid_chaos_placeholder`
assumption flag when applied.

**Reasoning per format (PLACEHOLDER multipliers, not measured, but
qualitatively grounded):**
- `one_shot` (single flying lap, no second chance) — most
  luck/weather/traffic-sensitive format, so a small mistake or bad luck
  produces a bigger grid-position swing than true pace would predict:
  scProbabilityMultiplier 1.25, vscProbabilityMultiplier 1.1 (VSC scaled
  up less — VSC is more often mechanical/debris-triggered than a direct
  consequence of a scrappier grid).
- `short_qualifying` — treated as the neutral 1.0 baseline the existing
  `SAFETY_CAR_DEFAULTS`/data-sourced SC numbers were implicitly calibrated
  against (no format-specific adjustment).
- `full_qualifying` — multi-session knockout format giving every driver
  several representative laps, closest to real F1 quali and the most
  pace-accurate/calmest grid: scProbabilityMultiplier 0.9,
  vscProbabilityMultiplier 0.95.

Also added `gridVarianceMultiplier` per format (1.6 / 1.0 / 0.75) —
exposed for `ai` to reference qualitatively in explanations ("One-Shot
Qualifying tends to scramble the grid...") but **not** currently consumed
by any grid-position calculation, since no full starting-grid-position
model exists yet (documented limitation, not hidden — a real "predicted
grid slot for a given pace tier" model would be the natural v2, but is a
materially bigger scope than this pass).

**Ownership note:** `QualifyingFormatKey` in `constants.ts` matches
visual's `QualifyingFormat` type in `src/types/session.ts` value-for-value
by design (`'one_shot' | 'short_qualifying' | 'full_qualifying'`) so no
translation layer is needed — same pattern as `CarClassKey`/
`PerformanceTierKey`. Did not edit `session.ts` myself (visual-owned);
messaged them to wire `raceParameters.qualifyingFormat` into
`safetyCarProbability()`'s new input inside `raceSimAdapter.ts`, and
optionally re-export sim's type the same way `CarClassKey` already is.

Verified: street circuit, SC/VSC overridden to 40%/30% — one_shot ->
50%/33%, short_qualifying -> 40%/30% (unchanged), full_qualifying ->
36%/28.5%, no format supplied -> 40%/30% with no new flag (fully
backward-compatible, matches pre-existing behavior when omitted).

---

## 13. Stop-count plausibility — `stopCountPlausibility.ts`

**Correctness bug found by coordinator (2026-07-12):** `strategyCandidates.ts`
(visual's file, `src/lib/`) unconditionally generated 1/2/3-stop candidates
regardless of race distance. For a 25%- or 35%-distance race, pit-stop
time loss (~18-22s per stop) dominates over any tyre-degradation savings
at that short a distance, so a 2-stop is essentially never competitive and
a 3-stop is absurd — but the app was showing them as if they were live
options every time, misrepresenting what a real strategist would even
consider.

**Model:** `plausibleStopCounts(totalLaps, degOptions?, maxStopCountToConsider?)`
returns a plausibility verdict per stop count (1..3 by default) BEFORE any
candidate is generated — a cheap pre-filter, not a run of
`compareStrategies()`. Two floors, applied per stop count:

1. **Hard floor (`MIN_VIABLE_STINT_LAPS = 5`, PLACEHOLDER):** applies to
   every stop count including 1-stop — an average stint below this isn't
   a real strategic choice, it doesn't even clear tyre warmup
   (`degradation.ts`'s `warmupLaps`, 1-3 laps/compound) plus a handful of
   representative racing laps.
2. **Economic floor (`CLIFF_MARGIN_FRACTION = 0.5`, PLACEHOLDER):**
   applies only to stop counts beyond the first (1-stop is always the
   baseline once it clears floor #1 — some minimum strategy is the
   default case, not something to filter away). Requires the average
   stint length be at least half of the medium compound's
   tier/class/track-adjusted cliff lap (via `estimateTyreLife()`) — below
   that, the stint would never have reached the steep post-cliff wear
   phase anyway, so splitting further just pays `pitLossSec` again for no
   real degradation benefit. Medium is used as a "representative race
   compound" for this planning-level threshold, not a claim every
   candidate must run medium.

Both constants are PLACEHOLDER (qualitatively sound, not calibrated to
real strategy data) but the mechanism is real: `cliffLapEstimate` already
factors in carClass/performanceTier/trackAbrasivenessRating via the
existing `estimateTyreLife()` model, so e.g. a high-wear car/track
combination naturally supports relatively more stops at a given race
distance than a low-wear one — an emergent property of reusing sim's own
degradation model rather than a distance-only lookup table.

**Verified** (60-lap full-distance baseline, no track/class/tier
adjustment): 25% (15 laps) → only 1-stop plausible; 35% (21 laps) → only
1-stop; 50% (30 laps) → only 1-stop; 75% (45 laps) → 1-stop and 2-stop;
100% (60 laps) → all of 1/2/3-stop. Matches the coordinator's stated
expectation exactly (2-stop essentially never optimal and 3-stop absurd
at 25%/35%) while leaving full-distance races unaffected.

**Ownership/wiring:** built as an exported sim function per the
coordinator's split ("the reasoning/thresholds should be yours, wired in
with their help") — did not edit `strategyCandidates.ts` myself
(visual-owned, `src/lib/`). Messaged visual with the exact integration:
call `plausibleStopCountNumbers(totalLaps, degOptions)` and filter
`CANDIDATE_SEQUENCES` down to sequences whose stop count (compounds.length
- 1) is in that list, before generating stints.

---

## 14. Single-strategy evaluator — `evaluateSingleStrategy()`

**New feature (coordinator, 2026-07-12):** an interactive "what-if"
strategy editor — user adjusts pit lap/compound choices on a single
strategy and sees a live predicted-laptime delta as they type — needs a
fast single-plan evaluator, not `compareStrategies()`'s multi-candidate
ranking/margin-analysis shape.

**Design decision:** rather than a new lightweight model, extracted the
exact per-candidate logic `compareStrategies()` already runs into a
standalone exported function, `evaluateSingleStrategy(plan, input)` where
`input` is `Omit<RaceSimInput, 'strategies'>` (same race context, minus
the array). Refactored the shared tier/class/personal-pace-offset/
baseLapTime resolution (previously inlined at the top of
`compareStrategies()`) into `resolveRaceContext()`, called by both
`compareStrategies()` and `evaluateSingleStrategy()` — so a live editor's
number for a given plan can never drift from what the same plan would
score inside a full comparison. Same "share the exact math, don't
re-derive it" principle already used for `perLapStrategyTrace()`
(`raceGapEvolution.ts`) and now applied one level up.

Returns `{ id, numStops, stints, pitStops, predictedTotalRaceTimeSeconds,
confidence, assumptionFlags }` — everything a `StrategyCandidate` has
except `deltaToBestSeconds` (no "best" concept for a single plan).
**Delta framing is explicitly NOT this function's job** — the doc comment
spells out why: "vs the recommended candidate," "vs the plan before this
edit," and "vs a rival's known strategy" are all valid UI framings for
different moments in an editing flow, and picking one would bake a UI
decision into sim. The caller calls this once per plan being compared and
subtracts `predictedTotalRaceTimeSeconds` themselves.

**Performance note:** did NOT build this because
`compareStrategies({ strategies: [plan] })` was too slow — a full-race
lap-by-lap loop is on the order of tens of iterations, sub-millisecond in
practice. This exists for API shape/clarity (no meaningless "best of one"
ranking or margin analysis in the return type), not a performance
optimization.

**Verified:** `evaluateSingleStrategy(plan, ctx)` and
`compareStrategies({ ...ctx, strategies: [plan] }).strategies[0]` produce
byte-identical `predictedTotalRaceTimeSeconds`/`confidence` for the same
plan and context (20-lap test case, both 1879.071s / `low` confidence) —
confirms the refactor didn't introduce any drift between the two call
paths. Full existing vitest suite (180 tests across 8 files) still passes
after the `resolveRaceContext()` refactor.

**Not yet done:** messaging `visual` with this API shape so they can
design the interactive editor UI against it — next step, see change log.

---

## 15. Edge-case hardening pass (2026-07-12)

**Prompted by:** the coordinator explicitly asked for genuine stress-testing
across all car-class × track × tier combinations rather than another spot
check, once the backlog was functionally complete — "does the math still
make sense, or does something go non-physical." Built an ad hoc stress
script (not committed — throwaway, findings captured here + as permanent
vitest cases instead) that ran every `CarClassKey`/`PerformanceTierKey`
combination × 5 abrasiveness ratings × 3 representative `baseLapTimeSec`
values through `compareStrategies()`, every race-length percentage 1-100%
(not just the UI's 25/35/50/75/100 steps) across 5 real track lap counts
through `stopCountPlausibility.ts`, `safetyCarProbability()` across every
qualifying format × several SC/VSC override levels, and
`importTelemetry()`/`evaluateSingleStrategy()` under normal, garbage, and
deliberately extreme personal-pace inputs. Found and fixed 4 real issues:

1. **Empty plausible-stop-count set on very short races.** Scanning every
   race-length percentage boundary (not just 25/35/50/75/100) found that
   totalLaps as low as 1-9 laps — reachable by combining a short track
   with a low race-length percentage, or any caller passing a small
   `totalLaps` directly — made EVERY stop count fail `MIN_VIABLE_STINT_LAPS`,
   so `plausibleStopCountNumbers()` returned an empty array. Downstream,
   `strategyCandidates.ts` would then generate zero candidates. Fixed in
   `stopCountPlausibility.ts`: if literally nothing clears the normal
   floors, the lowest stop count (1-stop, the only sequence
   `strategyCandidates.ts` can build a plan around at that length) is now
   forced plausible with a distinct `forced_minimum_fallback_extremely_short_race`
   reason — honest about being a compromise, not silently presented as a
   comfortable recommendation. A race, however short, still needs at
   least one strategy to recommend.

2. **`compareStrategies()` crashed on an empty `strategies` array** with
   an opaque native `"Reduce of empty array with no initial value"` error
   from deep inside the ranking logic (`evaluated.reduce(...)`) — the
   *symptom* of issue #1 propagating downstream, but a real hardening gap
   in its own right for any other caller that could hit it (e.g. a UI bug
   filtering candidates down to nothing for an unrelated reason). Added
   an explicit upfront check that throws a clear, descriptive error
   instead.

3. **Garbage/mistyped telemetry produced non-physical predicted
   laptimes.** `importTelemetry()` had no sanity check on the raw lap
   times themselves — a plausible real-world mistake (typing "9.5"
   instead of "95", or a minutes-vs-seconds units slip) computed a
   personal pace offset so large (-82.3s/lap on a 90s baseline) that
   downstream `compareStrategies()` predicted an average laptime of
   ~12.3s — obviously not a real F1 laptime. Fixed with two layers in
   `telemetry.ts`: (a) an input-side plausibility filter — laps outside
   40%-250% of `baseLapTimeSec` are excluded before the outlier/median
   calc even runs (flagged `telemetry_implausible_laps_filtered`), and
   the whole call throws a clear "check for typos or a units mismatch"
   error if fewer than `MIN_LAPS_REQUIRED` plausible laps remain after
   that filter; (b) a defense-in-depth clamp on the *final*
   `personalPaceOffsetSec` to ±50% of `baseLapTimeSec`
   (`MAX_PERSONAL_OFFSET_FRACTION`, flagged
   `personal_pace_offset_clamped_non_physical`) in case some combination
   of individually-plausible laps still compounds into an absurd number.
   A single obvious typo mixed into an otherwise-clean log is now
   correctly filtered out rather than either corrupting the whole
   calculation or rejecting the entire log.

4. **No physical floor on computed laptime anywhere in the shared
   per-lap loop.** Even with telemetry.ts's own clamp, `RaceSimInput`/
   `evaluateSingleStrategy()`'s `personalPaceOffsetSec` field is directly
   settable by any caller (not just via `importTelemetry()`) — a
   sufficiently extreme direct value could still drive a lap's computed
   time toward zero or negative, which is never physically meaningful
   regardless of how it got there. Added an absolute last-resort floor in
   `perLapStrategyTrace()`: a lap's time can never compute below
   `MIN_PHYSICAL_LAPTIME_FRACTION` (40%) of `baseLapTimeSec`, flagged
   `non_physical_laptime_clamped` when it engages. Verified this is a
   true last resort, not a normal-operation clamp — a real ~8s
   circuit-record correction (data's Singapore lap-record upgrade,
   commit 6f084cd, landed mid-pass) came nowhere near triggering it.

**Areas stress-tested that found NO issues** (worth recording so a future
pass doesn't re-walk the same ground from scratch): F2's compressed
`tierPaceRangeScale` (0.25x) combined with every abrasiveness rating 1-5
and all three `baseLapTimeSec` reference points — no non-finite/negative/
out-of-band results at any combination. `safetyCarProbability()`'s
qualifying-format multiplier combined with SC/VSC override values from 0
to 100 — stayed correctly bounded to [0,100] at every combination (the
existing `Math.min(0.999, ...)` guard on the Poisson conversion already
handled the 100%-probability edge correctly). Every `CarClassKey` ×
`PerformanceTierKey` combination's average predicted laptime stayed
within a 0.3x-3x band of its `baseLapTimeSec` — no combination is close
to non-physical without deliberately extreme/garbage input.

**Permanent regression coverage added** (24 new test cases, full suite
now 203 tests / 9 files, all green): `stopCountPlausibility.test.ts` (new
file) — the extremely-short-race fallback across totalLaps 1-10, the
forced-fallback reason tag, and a high-wear-vs-low-wear widening check.
`strategyCompare.test.ts` — the empty-array error message and the
extreme/normal personalPaceOffsetSec clamp behavior. `telemetry.test.ts`
— the fully-implausible-log rejection, the single-typo filtering case,
and the final-offset clamp.

**Placeholder audit (second half of the coordinator's ask):** reviewed
every `**Placeholders:**` section above for constants `data` could now
plausibly source real values for, as opposed to sim's own invented
modeling/UX-judgment constants (confidence thresholds, close-call
margins, curve *shapes* — those aren't "facts" to source). Messaged data
directly with a prioritized list (SC/VSC period duration, SC/VSC pit-loss
factor, 2026 Active Aero drag-reduction %, generic pit-stop stationary
time) rather than repeating it here — see their reply/DATALOG.md for
what came of it.

---

## Change log

- **2026-07-09:** Initial build of all 9 backlog items (degradation,
  fuel, pit-loss, undercut/overcut, strategy-compare, safety-car,
  weather, ERS, performance-tier). Revised car-class keys and ERS 2026
  model after data teammate's first DATALOG.md delivery (F2 chassis
  collapsed to one key, `icons` removed as a class, Overtake Mode
  remodeled as battery-SoC resource instead of discrete uses). Added
  `sourceConfidence` propagation into `assumptionFlags` for
  data-teammate-sourced values, per `ai` teammate's request during data
  shape reconciliation. `bugs` verified all 5 published reference cases
  exact/within rounding tolerance, no issues found.
- **2026-07-09 (later same day):** Reconciled `performance-tiers.md`
  open item #1 with data teammate — switched `PERFORMANCE_TIERS` from
  flat seconds/lap to percent-off-ultimate-pace, added
  `CAR_CLASSES[*].tierPaceRangeScale` for F2's compressed range. See
  item 9 above for the resulting formula.
- **2026-07-10:** Wired in data teammate's `data/track-tyre-characteristics.json`
  (per-circuit 1-5 abrasiveness rating) as a new `trackAbrasivenessMultiplier()`
  in `degradation.ts`, threaded through `DegradationOptions`/`RaceSimInput`.
  Corrected `f1_2026_season_pack.basePaceOffsetSec` from an erroneous
  -0.1s (2026 faster) to +2.75s (2026 slower, per real-world 2026 season
  results data supplied) — see item 1 and item 8 sections above.
- **2026-07-10 (later):** Picked up the sim role from a predecessor
  session; all 9 backlog items confirmed complete and stable
  (`git log` clean since last handoff). Built item 10,
  `raceGapEvolution.ts`, to unblock `visual`'s Strategy Battle screen
  stub (explicitly flagged to sim in CLAUDE.md). Refactored
  `strategyCompare.ts`'s per-lap loop into exported `perLapStrategyTrace()`
  so both consumers share one lap-by-lap implementation.
- **2026-07-10 (later still):** Data teammate landed
  `data/track-lap-reference.json` (per-circuit `referenceLapTimeSec`,
  `fuelPerLapKg`, `fullThrottlePct`, `overtakingDifficulty`). Wired all
  three sim-relevant fields same day per the "sim's flagged placeholder =
  next priority" convention: `RaceSimInput.baseLapTimeSec` +
  `baseLapTimeSourceConfidence` (item 1), `FuelOptions.trackFuelPerLapKg` +
  `sourceConfidence` in `fuel.ts` (item 2), and
  `activeAeroBenefit(fullThrottlePct?, sourceConfidence?)` in `ers.ts`
  (item 8). `overtakingDifficulty` is ai's field to consume (ReferenceFact
  grounding), not sim's. See items 1, 2, and 8 above for details.
- **2026-07-11:** Picked up the plan doc's telemetry-import stretch
  feature (item 11, `telemetry.ts`) per the coordinator's go-ahead now
  that the core backlog is done end-to-end. Wired `personalPaceOffsetSec`
  into `strategyCompare.ts`'s `RaceSimInput`. Messaged `ai` directly since
  it unblocks their backlog item #4.
- **2026-07-11 (later):** Coordinator's audit found `qualifyingFormat`
  was dead UI state with zero effect on any calculation, despite being
  original plan-doc scope ("qualifying-format-aware grid assumptions").
  Built item 12: `QUALIFYING_FORMATS` in `constants.ts` +
  `safetyCarProbability()`'s new `qualifyingFormat` input, scaling SC/VSC
  probability for a more/less scattered starting grid. Messaged `visual`
  to wire it in from `raceSimAdapter.ts` (visual-owned file, not edited
  directly).
- **2026-07-12:** Two coordinator-flagged items, both addressed same day.
  Item 13: `stopCountPlausibility.ts` — fixes a correctness bug where
  short-distance races (25%/35%) showed implausible 2-/3-stop candidates;
  built `plausibleStopCounts()`/`plausibleStopCountNumbers()`, messaged
  visual to filter `strategyCandidates.ts` through it. Item 14: new
  `evaluateSingleStrategy()` in `strategyCompare.ts` — a single-plan
  evaluator for an interactive strategy editor, sharing the newly
  extracted `resolveRaceContext()` helper with `compareStrategies()` so
  the two can't drift. Full vitest suite (180 tests) still green after
  the refactor.
- **2026-07-12 (later):** Data teammate verified a user-flagged claim
  that APXGP is mechanically just the standard My Team car with a livery
  skin, not a distinct chassis (data/car-classes.json commit 090bdfd
  folds it into `f1_2025.teams`, same treatment as Konnersport). Removed
  `'apxgp'` from `CarClassKey`/`CAR_CLASSES` in `constants.ts` — see item
  9's Konnersport/APXGP note, now superseded for APXGP specifically
  (Konnersport itself is unaffected, still narrative/tier-driven). Fixed
  every resulting call site TS flagged: `dataAdapters.ts` and
  `raceSimAdapter.ts`'s id maps/switch (visual-owned, but pure dead-code
  removal so fixed directly to keep the build green — left their
  unrelated concurrent work in those files uncommitted for them),
  `performanceTier.test.ts`'s now-dead APXGP case, and three
  `raceSimAdapter.test.ts` assertions that hardcoded `toHaveLength(3)`
  strategies for Monza — now correctly `toHaveLength(2)`, since Monza's
  low (1/5) abrasiveness rating combined with item 13's plausibility
  floor means a 3-stop no longer clears the economic threshold at full
  race distance there (a real, intentional consequence of item 13's fix
  surfacing through a previously-hardcoded test, not a regression).
  Committed b41fff6. `DEFAULT_TIER_BY_CLASS` in `performanceTier.ts`
  needed no change (never had an `apxgp` entry).
- **2026-07-12 (later still):** Coordinator-requested edge-case hardening
  pass across all class×track×tier combinations found and fixed 4 real
  issues (empty plausible-stop-count set on very short races,
  `compareStrategies()` crashing on an empty strategies array, garbage
  telemetry producing non-physical laptimes, no absolute physical floor
  on computed laptime) — see item 15 for full detail. Added 24 permanent
  regression tests (203 total, 9 files). Also messaged data a prioritized
  list of remaining placeholder constants worth real-world sourcing.
