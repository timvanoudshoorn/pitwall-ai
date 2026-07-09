# QA Test Plan — Integration Testing (Post-Visual Wiring)

## Overview

Once visual teammate completes wiring of StrategyComparisonScreen and AIExplanationScreen to real sim/ai output, run the following test suite.

## Test Cases

### 1. Strategy Stint Split Validation

**Objective:** Verify that strategy candidate stints sum correctly to race distance for all car-class/track/lap-count combinations.

**Test Data:**
- F1 2025 / Silverstone / 52 laps (100% = full distance)
- F1 2026 / Monza / 53 laps
- F2 / Monaco / 78 laps

**For each combination:**
1. Navigate to CarClassTrackSelectScreen → select car class
2. RaceParametersScreen → set raceLengthPct to 100
3. StrategyComparisonScreen → verify each strategy candidate's stints
   - Sum all `stint.endLap - stint.startLap + 1` across the strategy
   - Assert sum equals totalLaps (within tolerance for off-by-one indexing)
   - Assert no gaps or overlaps between stints

**Expected:** All three combinations pass stint validation

### 2. Assumption Flags Correctness

**Objective:** Verify that assumptionFlags correctly reflect placeholders in the simulation result.

**For each strategy from test case 1:**
1. Inspect `StrategyComparison.assumptionsUsed[]` 
2. Log all flags to console
3. Verify presence of:
   - `base_lap_time_generic_placeholder` (if baseLapTimeSec not provided)
   - `tyre_compound_params_placeholder` (if no per-track tyre override)
   - Any performance tier/class wear multiplier flags
4. Assert flags list is non-empty (indicates transparent assumption documentation)

**Expected:** Assumption flags correctly surface the actual data sources (real vs placeholder)

### 3. Grounding Logic — No Hallucinated Numbers

**Objective:** Verify that AI explanation grounding check doesn't miss hallucinated numbers.

**If API key available:**
1. StrategyComparisonScreen → run comparison for F1 2025 / Silverstone
2. AIExplanationScreen → generate explanation (mode: 'recommendation')
3. Capture `ExplanationResult.groundingWarnings[]`
4. Verify no ungrounded numbers in explanation text:
   - Any lap number should appear in strategy stint laps
   - Any time delta should trace to strategyCandidate properties
   - Any percentage should trace to simulation inputs

**If API key NOT available:**
1. Examine mock explanation text against MOCK_CLEAR_WINNER/MOCK_CLOSE_CALL data
2. Manually verify all numeric tokens could plausibly trace to sim output
3. Flag any numbers that look invented

**Expected:** `groundingWarnings` array is empty, or lists only false-positives already known

### 4. Undercut/Overcut Explanation Integration

**Objective:** Verify that "why not alternative" explanations correctly reference undercut/overcut mechanism (commit `20769bd`).

**Test Data:** F2 / Silverstone / 52 laps, two 1-stop strategies with different pit windows

1. StrategyComparisonScreen → select race generating close-margin strategies
2. AIExplanationScreen → toggle to 'why_not_alternative' mode
3. Inspect explanation text:
   - Should reference tyre freshness differences from different pit windows
   - Should explain why earlier pit lost track position but gains fresher rubber
   - Should NOT conflate pit-window delta with full-race delta

**Expected:** Explanation correctly narrates undercut/overcut tradeoff without numerical confusion

### 5. Margin Analysis Close-Call Detection

**Objective:** Verify `marginAnalysis.isCloseCall` is correctly surfaced in UI.

1. For each strategy comparison from test cases 1–2:
   - Capture `marginAnalysis.isCloseCall` and `deltaSeconds`
   - Assert UI shows warning badge when isCloseCall = true
   - Assert badge message includes `deltaSeconds` value formatted to 1 decimal

**Expected:** UI correctly reflects margin analysis; user can see which strategy calls are uncertain

### 6. Confidence Rating Alignment

**Objective:** Verify strategy `confidence` rating aligns with assumption flag count.

1. For each strategy candidate:
   - Count assumptionFlags in full comparison
   - Verify confidence rating:
     - 'high': <= 2 flags
     - 'medium': 3–5 flags
     - 'low': >= 6 flags

**Expected:** Confidence ratings are consistent with assumption count

### 7. Data Adapter Round-Trip

**Objective:** Verify that data/ reference files correctly feed into screen display.

1. CarClassTrackSelectScreen:
   - Verify all car classes from data/car-classes.json render as buttons
   - Verify selection flow updates state correctly
2. Pit-window / Degradation screens:
   - Verify track-tyre-characteristics.json abrasiveness rating is used
   - Verify performance-tiers.md tier definitions are applied

**Expected:** Data files flow through adapters without corruption or missing fields

## Known Non-Blocking Issues

- **Monaco 78 laps:** Intentional WIP fixture (StrategyBattleScreen still on mocks) — skip until visual wires battle screen
- **Placeholder track values (Madring, Las Vegas):** Expected to be rough, per data teammate — don't flag as bugs
- **No API key for live explanation generation:** Mock-based grounding verification sufficient for now

## Pass/Fail Criteria

**PASS:** 
- All stint splits sum correctly across 3 test combos
- Assumption flags surface correctly
- Grounding logic catches hallucinations (or empty warnings if no key)
- Undercut/overcut explanations are coherent
- Close-call detection shows in UI
- Data adapters feed correctly

**FAIL:**
- Any stint split doesn't sum to race distance
- Missing or incorrect assumption flags
- Grounding warnings suggest hallucinated numbers that are actually real (false-positive)
- Explanation text makes unsupported numerical claims
- Data files don't flow through adapters
