# DATALOG — Data & Research teammate running log

Confidence key: **confirmed** (stated by official/primary source) / **reasonable estimate** (inferred from confirmed facts + general knowledge) / **placeholder** (no basis yet, needs follow-up).

---

## 2026-07-09 — Initial pass: car classes, tracks, performance tiers

**Added `data/car-classes.json`**
- F1 2025 base game: all 10 real teams with current official sponsor-inclusive names + Konnersport as the fictional 11th. Confidence: confirmed (team names/roster), reasonable estimate (Konnersport's implied competitive trajectory from Braking Point narrative).
- F1® 25: 2026 Season Pack: 11 real teams (Cadillac joins as an all-new constructor; Kick Sauber becomes Audi for 2026) + My Team as a 12th slot. Documented Overtake Mode, Active Aerodynamics, MGU-H removal/MGU-K deployment increase, narrower tyres/lighter cars, and Advanced Sustainable Fuel — each with a "strategyImplication" note on how it plausibly affects the sim's models (confirmed), separate from open questions (e.g. no confirmed in-game 2025-vs-2026 laptime delta found — flagged as an open question, not asserted).
- F2: flagged a likely **correction to the project brief** — the brief assumes F1 25 may distinguish "F2 2024 vs F2 2026 chassis," but the real-world FIA F2 championship runs a single spec chassis (Dallara F2 2024) through 2024, 2025, and 2026, so there is very likely only one F2 car class in-game, not two. Marked as an open question for sim/ai rather than silently correcting the brief.
- APXGP (F1 THE MOVIE tie-in, Iconic Edition): confirmed team existence, drivers (Sonny Hayes / Joshua Pearce), and access model (My Team 2.0 + 6 movie scenario missions). No official pace baseline exists; proposed Backmarker-to-Midfield default from the movie's underdog narrative, marked reasonable estimate.
- Icons/Legends: confirmed roster of 10 (8 real historical drivers + 2 new fictional legends created for F1 25 — Callum Voisin, Matias Zagazeta). Documented that Icons are a driver-skill layer on top of whatever team car they're recruited into, not a separate car class with its own pace/tyre profile.
- F1 World Car: no official EA-published baseline pace found. Proposed Midfield default reasoning documented (competitively-neutral-by-design mode), marked reasonable estimate, explicitly not confirmed.

**Added `data/tracks.json`**
- Full confirmed 24-round 2025 real-world calendar (source: Wikipedia 2025 F1 World Championship page, cross-checked against EA's "every 2025 GP venue is in F1 25" claim).
- 2026 calendar delta: Madring (Madrid) replaces Barcelona as Spanish GP host from Sept 2026, confirmed via F1.com and Wikipedia (Madring). Added as its own circuit entry with pit-loss/SC fields marked placeholder (no real-world race data exists yet as of 2026-07-09).
- **Important correction to the project brief**: the brief lists 8 venues as "LiDAR-scanned" (Silverstone, Bahrain, Imola, Melbourne, Miami, Suzuka, Red Bull Ring, Zandvoort). Multiple independent sources (EA's own circuits page via Traxion/GTPlanet/ESPN coverage) confirm only **5** venues are actually LiDAR-scanned in F1 25: Bahrain, Miami, Melbourne, Suzuka, Imola. Silverstone, Red Bull Ring, and Zandvoort are instead the **3 reverse-layout venues** — a separate, unrelated feature (first time an EA F1 game has reverse layouts at all). Documented this explicitly in `tracks.json._meta.importantCorrectionToBrief` and set `lidarScanned` / `reverseLayoutAvailable` as two independent booleans per circuit so sim/ai don't conflate "high accuracy scan" with "reverse layout available." This matters because the plan implies both features signal "higher-confidence track modeling" — only the LiDAR 5 actually carry that surface-accuracy signal.
- Pit-lane-loss seconds and safety-car-history tier per circuit: no single authoritative published table exists for either figure across the full calendar (checked F1.com pit stop summary pages, GTPlanet forums, STATS F1, axiorablogs). Populated all 24 circuits (plus Madring) with **reasonable estimate** values derived from well-documented circuit characteristics (pit lane length/speed limit, wall proximity, historical incident reputation), each with an explicit `basis` string explaining the reasoning. Two exceptions with sourced numbers: Singapore (near-100% historical SC probability, essentially confirmed) and Abu Dhabi/Yas Marina (~38% SC / ~38% VSC, sourced from axiorablogs). Las Vegas and Madring marked as placeholder for SC history specifically — too few real races run yet for even a confident estimate.

**Added `data/performance-tiers.md`**
- Drafted reasoning (not just numbers) for Backmarker/Midfield/Contender/Top Tier bands: rough qualifying-pace-percentage ranges, a proposed tyre-wear-as-consequence-of-pace-deficit model (not a flat independent penalty), and the strategy-relevant consequence of each band (track position value scales inversely with raw pace).
- Explicitly marked DRAFT / jointly owned with sim — numbers are a starting proposal, not final. Flagged specific open items for sim to confirm: unit representation (percent-off-ultimate vs flat seconds), whether tyre-wear-as-multiplier-on-Midfield matches sim's actual degradation curve structure, a proposed compressed pace range for F2 given its single-spec chassis, and whether the "Top Tier can chew tyres faster on high-deg tracks" real-F1 nuance is worth modeling for v1.
- Recommended Konnersport and APXGP tiers be treated as narrative/player-driven rather than hardcoded, since neither has a fixed real-world competitive record.

**Coordination note:** SendMessage name resolution was broken at team spawn (all teammates spawned under the same subagent_type); coordinator supplied raw agent IDs. Received early requests from `sim` (baseline pace deltas, tier numbers, track pit-loss/SC data, 2026 ERS/Active Aero context) and an FYI from `bugs` (standing by for data to land). Responding to both now that the first pass above is committed.

**Next up:** reconcile performance-tier numbers with sim directly (their message references placeholders already in `src/sim/constants.js` — need to diff against what's proposed here), then track down whatever sim/ai flag as missing once they've actually consumed these files.

---

## 2026-07-09 (later same session) — Flat confidence lookup for ai teammate

**Added `data/track-confidence-lookup.json`**
- `ai` teammate is building a ReferenceFact pattern (grounding claims in explanations to a traceable source) and needs to join on trackId for pit-loss/safety-car confidence without walking the full nested `tracks.json` object each time, especially for the case where sim's `raceContext` output collapses per-circuit data down to a bare `safetyCarProbabilityPct` with no confidence sibling — ai can join against this file directly instead.
- This is explicitly a **derived convenience file, not a new source of truth** — flattens the `pitLossSeconds`/`pitLossConfidence`/`pitLossBasis`/`safetyCarTier`/`safetyCarConfidence`/`safetyCarBasis`/`lidarScanned`/`reverseLayoutAvailable` fields already in `tracks.json` into one flat `{ trackId: {...} }` map. Documented in its own `_meta` that `tracks.json` is authoritative and this file needs manual regeneration if `tracks.json` changes — worth watching for drift as a maintenance risk going forward.
- Confidence: same as the underlying `tracks.json` values (no new claims made, pure reshaping).

---

## 2026-07-09 (later still) — Sim's next placeholder: track abrasiveness + 2026 laptime delta

Sim landed the performance-tier reconciliation (commit af4a55c, SIMLOG.md item 9) and flagged their next placeholder: flat tyre-degradation multipliers in constants.ts, wanting track-specific abrasiveness data and an F1-2026-vs-2025 laptime delta. Per priority rule ("whenever sim flags an assumption or placeholder, treat that as next priority"), addressed immediately rather than queuing.

**Added `data/track-tyre-characteristics.json`**
- Per-circuit `abrasivenessRating` (1=gentle, 5=very hard on tyres) for all 24 2025-calendar circuits + Madring. No official Pirelli numeric table across all circuits for one season is publicly published in a citable form, so every rating is `reasonable_estimate`, synthesized from Pirelli's own published methodology (traction/braking/lateral/abrasion factors) applied to well-documented circuit reputations — documented per-circuit `basis` strings, same pattern as tracks.json. Las Vegas and Madring marked lower-confidence/placeholder for the same too-new-to-know reason as their safety-car entries.

**Updated `data/car-classes.json`** (`f1_2026.openQuestions`)
- Previously this field said no 2025-vs-2026 laptime delta was confirmed. Found real-world sourced data since: FIA's Nikolas Tombazis predicted 2026 cars ~1.0-2.5s/lap slower pre-season; actual 2026 Australian GP results came in slower than that (Russell's pole ~3.4s slower than Norris's 2025 Melbourne pole; Verstappen's fastest lap ~2.1s slower than 2025's). Recommended sim use ~2-3.5s/lap slower as a reasonable_estimate range if a baseline is needed now, sourced to real-world 2026 season results rather than in-game F1 25 telemetry (which still isn't directly confirmed/observed).

**Sim wired both in (commit 89bd66a, SIMLOG items 1 and 8):**
- `trackAbrasivenessMultiplier(rating)` in degradation.ts reads `abrasivenessRating` straight out of our JSON at call time (rating 3 = neutral 1.0x, ±10%/step — sim's own linear mapping, flagged placeholder on their side) rather than duplicating the data into their constants, so `track-tyre-characteristics.json` stays the single source of truth. Sanity-checked against Monaco (1) vs Silverstone (5).
- Caught and fixed a sign error in their own prior placeholder (`f1_2026_season_pack.basePaceOffsetSec` had implied 2026 cars were faster) — now set to +2.75s, the midpoint of our recommended 2-3.5s range, documented as real-world-sourced not in-game-confirmed per our caveat.
- Nothing currently blocking sim.

---

## 2026-07-10 — Resumed after idle handoff: per-track lap reference file

Re-read plan doc + this log, checked `git log` for what landed since last entry (visual wired Select/Parameters/TopBar onto the real `car-classes.json`/`tracks.json`; ai wired undercut/overcut mechanism into why-not-alternative explanations — neither touched `data/`). Name-based SendMessage to teammates initially bounced (needed raw agent IDs, since fixed by coordinator); pinged all four teammates once IDs were corrected.

**Responses received:**
- `sim`: confirmed `baseLapTimeSec`/fuel/straight-line-% is the right next target, no other placeholder to reprioritize over it.
- `visual`: independently flagged the exact same gap — `strategyCompare.ts` has no per-track laptime source and is falling back to the flat 90s placeholder while they wire the Strategy Comparison screen today; asked for it as the highest-value next addition.
- `ai`: nothing blocking; flagged a nice-to-have for later (sourced qualitative "why hard to overtake here" text per track, to replace a hand-written Monaco placeholder in their mock fixtures) — folded into this delivery's `overtakingDifficulty` field rather than deferred, since it was cheap to add alongside the rest.
- `bugs`: no known issues in `data/*`, standing by to test consumption of the new file.

**Added `data/track-lap-reference.json`**
- `raceLaps` + `circuitLengthKm` (derived from `raceDistanceKm / raceLaps`) for all 24 2025-calendar circuits, sourced from 2024 season official FIA lap counts (a Yahoo Sports 2024 recap compiling per-race figures) and carried forward as the 2025 figures — lap counts essentially never change year-to-year for an unchanged circuit, but that carry-forward itself isn't independently reconfirmed for 2025, so tagged `reasonable_estimate` rather than `confirmed`. Cross-checked the derived `circuitLengthKm` against independently-known circuit lengths (Bahrain 5.41km, Monaco 3.34km, Spa 7.00km, etc.) — all matched within rounding, validating the source data.
- `referenceLapTimeSec` per circuit: each circuit's official F1 Grand Prix lap record (fastest race lap ever set), replacing sim's flat `DEFAULT_BASE_LAP_TIME_SEC = 90s`. Only Bahrain (1:31.447, de la Rosa 2005) and Monaco (1:12.909, Hamilton 2021) were independently re-verified against Wikipedia this pass — both matched general knowledge exactly. The remaining 22 circuits' exact lap-record digits are from general F1 knowledge and were **not** independently re-verified per-circuit here — tagged `reasonable_estimate`, with an explicit note in the file's `_meta` that the field is directionally reliable (correctly rank-orders Monaco << Silverstone << Spa) but exact digits shouldn't be treated as broadcast-accurate without a follow-up check. Also documented that this is a *reference floor*, not typical race pace — sim's own degradation/fuel models still need to add time on top, same role the 90s placeholder was playing.
- `fullThrottlePct` per circuit: real, commonly-published F1 technical-preview stat. Anchored to confirmed public figures for Monza (>80%), Jeddah (79%), Silverstone (70%), Suzuka (~66%), Hungaroring (~53-61%), Singapore (49%), Mexico City (grouped among the lowest) — each tagged `confirmed` with a source URL — and interpolated the remaining circuits via the same circuit-characteristic reasoning already used for `track-tyre-characteristics.json`'s abrasiveness ratings, tagged `reasonable_estimate`.
- `fuelPerLapKg` per circuit: no single published per-circuit fuel-consumption table exists (same gap as pit-loss/SC data). Computed via an explicit documented formula (`0.30 * circuitLengthKm + 0.15 + (fullThrottlePct - 60) / 100 * 0.4`) rather than invented ad hoc per circuit — lands in the commonly-cited real-F1 range (~1.0-2.3kg/lap, Monaco lowest, Spa/Vegas/Jeddah highest). Explicitly flagged `reasonable_estimate` everywhere, methodology documented transparently in `_meta` so sim/bugs can see exactly how each number was derived rather than treating it as sourced data. Sim can multiply by `raceLaps` for a track-specific `startFuelKg` instead of the flat 110kg placeholder.
- `overtakingDifficulty` per circuit (low/medium/high/very_high + basis): added per `ai`'s nice-to-have request, folded in now since it reuses the same per-circuit pass. `reasonable_estimate` throughout except Monaco (`confirmed` — near-universally cited as the calendar's hardest circuit to pass on in F1 broadcast/technical coverage, not really in dispute).
- `madring`: consistent with `tracks.json`'s existing treatment — every field `placeholder`, no real race run yet (first race Sept 2026).

**Committed. Notified `sim` it's ready to wire in** (baseLapTimeSec into RaceSimInput's fallback resolution, plus the fuel/ERS pieces), **notified `visual`** they can drop the 90s-fallback UI flag once sim wires it through, **notified `ai`** their overtaking-difficulty nice-to-have landed alongside this delivery, **notified `bugs`** the file is ready to test.

**Next up:** nothing currently blocking from any teammate. Will watch for sim's wiring confirmation and address whatever placeholder they flag next, per the standing "sim/teammate flags an assumption = next priority" convention.

**`ai` wired their piece in (commit 342a4f9):** `buildTrackReferenceFacts()` in `trackReferenceFacts.ts` now also joins `track-lap-reference.json`'s `overtakingDifficulty`, same join pattern as pit-loss/safety-car. Replaced the old hand-written Monaco placeholder in `mockFixtures.ts` with the real sourced fact so mock and live paths can't drift apart. Correctly skipped Madring (tier `"unknown"`) rather than surfacing an empty/meaningless fact. Smoke-tested: Monaco returns 3 facts (pit-loss, safety-car, overtaking — all `confirmed`), Spa returns all 3, Madring omits the overtaking fact while keeping its safety-car placeholder. `tsc` clean. This closes out `ai`'s nice-to-have from earlier in this entry — nothing further needed from data on it.

**Still waiting on:** `sim`'s wiring of `referenceLapTimeSec`/`fuelPerLapKg` into `strategyCompare.ts`/`fuel.ts`/`ers.ts`. `bugs` is standing by to run the full `QA_TEST_PLAN.md` suite (stint splits, `assumptionsUsed` flags, grounding logic, undercut/overcut integrity, data flow round-trip) once that + visual's screen wiring land — will ping them the moment sim confirms.
