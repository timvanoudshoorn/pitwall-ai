# PitWall AI — Bug Log

## Predecessor QA Pass (completed)

**Status:** All verified working as of end of predecessor's session.

- All sim's math reference cases hand-verified exact (tyre degradation curves, pit-loss values, undercut/overcut deltas)
- tsc/lint clean
- Full end-to-end flow tested across 3 car-class/track combos with zero console errors:
  - F1 2025 / Monza / Backmarker
  - F2 / Silverstone / Contender
  - F1 2026 / Singapore / Top Tier
- Monaco/78 laps confirmed as intentional WIP scaffolding (StrategyComparisonScreen/AIExplanationScreen still on mock fixtures at that time)

## Current Session — Catch Up & Verify Recent Changes

Resuming QA after several commits since predecessor's last check, particularly:
- Commit `20769bd`: Wire undercut/overcut mechanism into why-not-alternative explanations
- Commits related to track abrasiveness and 2026 laptime delta integration
- Commits related to wiring Select/Parameters/TopBar to real reference files

### Tasks

- [x] Verify tsc/lint still clean — PASS (no errors)
- [x] Verify build succeeds — PASS (659KB bundle)
- [x] Validate data files (car-classes.json, tracks.json, etc.) — PASS (all valid JSON, loadable)
- [ ] Check if StrategyComparisonScreen/AIExplanationScreen are now wired to real sim output — IN PROGRESS (visual teammate starting wiring now)
- [ ] End-to-end test latest flow once visual completes wiring
- [ ] Verify undercut/overcut explanation integration works correctly
- [ ] Verify strategy candidate stint splits sum correctly to race distance

### Current Status

**SIM WIRING VERIFIED (commit ccdd70d):** ✓ COMPLETE
- baseLapTimeSec consumed from track-lap-reference.json referenceLapTimeSec
- baseLapTimeSourceConfidence flows into assumptionsUsed:
  - Confirmed (Bahrain, Monaco) → no flag added
  - Reasonable_estimate (other 21 circuits) → `base_lap_time_source_confidence_reasonable_estimate`
  - Undefined → old `base_lap_time_generic_placeholder` flag
- trackFuelPerLapKg converted to startFuelKg = trackFuelPerLapKg * totalLaps + reserveFuelKg
- fuelPerLapKg sourceConfidence flows into assumptionsUsed (formula-derived = reasonable_estimate)
- fullThrottlePct-scaled activeAeroBenefit() in ERS model (replaces flat 0.25s estimate)

**AI WIRING VERIFIED (commit 342a4f9):** ✓ COMPLETE
- overtakingDifficulty ReferenceFacts from track-lap-reference.json integrated
- Madring's "unknown" tier properly skipped (no race run yet)
- All confidence levels properly tagged on generated facts

**BLOCKED WAITING:**
- **visual:** Wiring StrategyComparisonScreen and AIExplanationScreen to real sim/ai output (in progress)

Once visual completes, full integration testing suite (QA_TEST_PLAN.md) will run.

**Verified Complete (pre-wiring):**
- tsc and oxlint: clean (no errors)
- Build: succeeds (659KB bundle)
- Data files: valid JSON, all required fields present
- Data adapters: correctly transform car-classes.json and tracks.json
- Mock fixtures: all 3 StrategyComparison mocks have correct stint sums (Silverstone/Monza/Monaco)
- Mock assumptions: properly document placeholder status
- Grounding logic: regex correctly handles lap ranges (no false-positives on "1-35")
- App state flow: AppSelection correctly propagates through screens
- TyreDegradationScreen: correctly uses real data from adapters

**To Test Once Visual Completes Wiring:**
1. Strategy stint splits sum to race distance (F1 2025/Silverstone, F1 2026/Monza, F2/Monaco)
2. assumptionsUsed flags correctly reflect base-lap-time-generic and other placeholders
3. Grounding check flags no hallucinated numbers in explanations
4. Undercut/overcut window-vs-full-race delta correctly explained (no conflation)
5. Margin analysis close-call detection shows in UI
6. Confidence ratings align with assumption flag count
7. Data flows correctly through RaceParametersScreen (effective laps calculation)

**Test Plan:** See QA_TEST_PLAN.md for detailed integration test cases

---

## Track-Lap-Reference Data Integration (2026-07-10)

**Data Validation: COMPLETE ✓**

`data/track-lap-reference.json` landed (commit dad1596). Verified:

✓ File structure: 25 circuits, 8 _meta fields
✓ Confidence distribution:
  - 2 circuits "confirmed" (Bahrain, Monaco — Wikipedia-verified)
  - 21 circuits "reasonable_estimate" (general F1 knowledge, not re-verified)
  - 2 circuits "placeholder" (Madring — no race run yet)
✓ All fuelPerLapKg values match formula (0.30*lengthKm + 0.15 + (throttle%-60)/100*0.4)
✓ Madring intentionally all placeholders (raceDistanceKm: null, referenceLapTimeSec: null)
✓ Overtaking difficulty tiers properly distributed (very_high/high/medium/low across calendar)
✓ Confidence levels properly documented in each field's basis string

**Ready for sim integration:** Sim can now call with track-specific baseLapTimeSec, fuelPerLapKg, and will surface confidence levels in assumptionsUsed flags (e.g., `referenceLapTime_source_confidence_reasonable_estimate`).

---

## Key Findings from Pre-Wiring Review

**Documentation Quality:**
- SIMLOG.md: Comprehensive, documents all 10 models + their placeholders
- AILOG.md: Covers grounding logic and explanation prompt design
- DATALOG.md: Reference data source tracking with confidence levels
- All assumption flags properly tagged in code

**Simulation State (Confirmed Stable):**
- All 9 core models complete (degradation, fuel, pit-loss, undercut/overcut, strategy-compare, safety-car, weather, ERS, tiers)
- Item 10 (lap-by-lap gap evolution for Strategy Battle) just added
- Track abrasiveness integration (2026-07-10) working correctly
- 2026 pace offset corrected to +2.75s (from erroneous -0.1s)
- All per-lap calculations verified internally (per SIMLOG.md verification notes)

**Data Integration:**
- `trackAbrasivenessRating` properly threads through DegradationOptions/RaceSimInput
- `sourceConfidence` (confirmed/reasonable_estimate/placeholder) propagates into assumptionsUsed
- Data files valid and loadable

**Visual/UI:**
- TyreDegradationScreen already wired to real tyreStintCurve (not mock)
- Design system correctly enforces icon+label (CompoundChip always includes letter)
- AppShell/NavRail/TopBar properly display session state
- MockFixtures properly validate all stints sum to race distance

**Ready to Test Once StrategyComparison/AIExplanation Wired:**
- Will verify assumptionFlags surface correctly (base_lap_time_generic, etc.)
- Will verify grounding logic doesn't hallucinate numbers
- Will verify stint splits sum across all car/track combos
