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

**Known limitation:** no track-specific abrasiveness/surface-temperature
modifier yet (e.g. Bahrain vs Monaco wear very differently in reality).
Track reference data would plug in as an additional multiplier alongside
`carClass`/`performanceTier` — flagged as a good next refinement once data
teammate has per-track abrasiveness notes.

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
  placeholders; real value should scale with race distance/track fuel
  consumption once data teammate supplies it.
- `tyreWearFuelCouplingFactor = 0.15` — invented, qualitatively reasonable
  coupling strength, not measured.

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
- `activeAeroDragDeltaPct = 0.12`, flat `estimatedLapTimeGainSec = 0.25s`
  in `activeAeroBenefit()` — flat estimate; should become
  track-straight-proportion-aware once data teammate has per-track
  straight-line percentage data (explicitly noted as a next step in the
  function's own doc comment).
- No confirmed in-game 2025-vs-2026 laptime delta exists yet (data
  teammate flagged this as open) — `f1_2026_season_pack.basePaceOffsetSec
  = -0.1s` in `constants.ts` is a small illustrative placeholder, not a
  researched figure.

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
