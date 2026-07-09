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

**Waiting for visual teammate** to complete wiring of:
- StrategyComparisonScreen: will call sim's real compareStrategies() via raceSimAdapter
- AIExplanationScreen: will use real StrategyComparison and buildPrompt(), labeled as non-live placeholder for text

**Ready to test** once visual commits the wiring. Will focus on:
- assumptionFlags correctly reflecting placeholder status
- Stint splits summing to race distance
- No hallucinated lap numbers or stats in explanations
