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

**BLOCKED WAITING:** visual teammate wiring StrategyComparisonScreen and AIExplanationScreen

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
