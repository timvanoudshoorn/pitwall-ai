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
