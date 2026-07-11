# VISUAL_LOG.md

Running log of visual/UI work. One entry per meaningful commit.

## 2026-07-09 — Scaffold + Design System

- Repo had no frontend scaffold. Decided stack: React 19 + TypeScript +
  Vite + Tailwind v4 + Recharts + lucide-react + react-router-dom.
  Announced to sim/data/bugs.
- `npm create vite@latest . --template react-ts --overwrite` accidentally
  deleted `.claude/settings.json` and `PitWallAI_Multi_Agent_Plan.md`
  (untracked-looking but actually tracked) — restored both via
  `git checkout --`. Also lost `.claude/settings.local.json` (untracked,
  unrecoverable — flagged, low-stakes since it only held local overrides).
- Set up design tokens in `src/index.css` (Tailwind v4 `@theme`,
  no separate config file): pit-wall surfaces, tabular-numeral utility,
  status palette, tyre-compound palette. Validated the categorical/status
  hues with the `dataviz` skill's `validate_palette.js` against a dark
  surface before committing to them (see CLAUDE.md > Design System for the
  final hexes and rationale on the intentional "hard tyre" chroma-floor
  exception).
- Built shared chrome: `AppShell`, `NavRail` (left tab strip, 8 screens),
  `TopBar` (persistent session summary), `Panel` (corner-tick card
  primitive used everywhere).
- Built UI primitives: `CompoundChip` (tyre identity, always letter +
  color), `StatusBadge` (icon + label, reserved status colors),
  `TierDial` (the tactile 4-position Performance Tier setup dial —
  click/drag/arrow-key, not a dropdown).
- Screens, all wired to real router + shared selection state in `App.tsx`:
  - **Car Class & Track Select** — car class grid (7 classes incl. F1
    World), TierDial, track grid with generated schematic shapes
    (`src/lib/trackSchematic.ts`, deterministic per track id, explicitly
    not a real layout).
  - **Race Parameters** — race distance, qualifying format, weather +
    rain probability slider.
  - **Strategy Comparison** — side-by-side stint cards, uses ai's
    `MOCK_CLEAR_WINNER` fixture directly (same shape sim's real output
    will have).
  - **Tyre Degradation** — calls `sim.tyreStintCurve()` directly (real
    math, not mock), compound toggle chips double as the legend, cliff-lap
    reference lines, stint-length slider.
  - **Pit Window Timeline** — custom horizontal Gantt component, one row
    per strategy, pit-lane-entry ticks, uses `MOCK_CLOSE_CALL` fixture.
  - **AI Explanation Panel** — renders an `ExplanationResult` (mock text
    for now — real API call needs a backend call site, not a browser one;
    see CLAUDE.md), Recommendation / Why-Not-Alternative mode tabs,
    grounding-warning footer.
  - **Strategy Battle** — stint comparison for two candidates; lap-by-lap
    gap chart explicitly stubbed pending a data shape from sim.
  - **Settings** — display + AI-access placeholders.
- Verified with a headless-Chromium screenshot pass across all 8 routes
  (`npx playwright install chromium`, ad hoc driver script, deleted after
  use) — zero console errors, all charts rendered with real data where
  wired.
- `npx tsc --noEmit` and `npm run build` both clean.
- Fixed `src/mocks/carClasses.ts` after sim corrected `CarClassKey`
  (dropped `f2_2024`/`f2_2026` split → single `f2`; dropped `icons` as not
  a real pace-table class) — merged/removed entries to match.

Next: none blocking — every screen has had a first pass. Watching for
sim's real `StrategyComparison` output (swap out the ai fixtures),
data's `src/data/` reference files (swap out `src/mocks/`), and a
decision on the AI Explanation backend call site.

## 2026-07-10/11 — Wired StrategyComparisonScreen + AIExplanationScreen off real sim/ai output

- Picked this up as the last major integration step per the plan doc.
  Read sim's `strategyCompare.ts`/`RaceSimInput` and ai's
  `explain.ts`/`promptBuilder.ts`/`client.ts` in full before wiring
  anything — messaged sim and ai teammates directly with my planned
  field-by-field mapping and proceeded once addresses resolved (name-based
  `SendMessage` needed the raw agent id, not the plain teammate name).
- New `src/lib/strategyCandidates.ts` — generates the 1/2/3-stop candidate
  `StrategyPlan[]` compareStrategies() needs, splitting laps per compound
  proportional to `TYRE_COMPOUNDS[compound].nominalLife` rather than an
  even split. Explicitly a visual-owned heuristic, not sim math — flagged
  to sim in case they'd rather own "candidate strategy generation" later.
- New `src/lib/raceSimAdapter.ts` — `buildStrategyComparison(selection)`
  builds a real `RaceSimInput` from `AppSelection` + `data/tracks.json` +
  `data/track-tyre-characteristics.json` + `data/track-lap-reference.json`
  (the last one landed from data/sim mid-task and immediately replaced
  what would have been a flat 90s base-laptime placeholder for every
  track — good timing) and calls sim's real `compareStrategies()`. Only
  one genuinely visual-invented number in the whole chain:
  `SAFETY_CAR_TIER_TO_PCT`, an interpolation from data's qualitative
  safety-car tier labels (`low`/`medium`/`high`/`very_high`/...) to a 0-100
  spread for sim's `safetyCarProbability()` override param, since data's
  tier field has no numeric form yet — documented in-file as visual's own
  estimate, not a data/sim-sourced number, and still carries data's own
  `sourceConfidence` tag through to the assumption flags.
- `StrategyComparisonScreen` now calls `buildStrategyComparison()` via
  `useMemo` keyed on `selection` (replaces `MOCK_CLEAR_WINNER` entirely),
  renders a "modeling assumptions" footer listing every
  `assumptionsUsed` flag in plain language instead of hiding them —
  matches CLAUDE.md's grounding philosophy that a placeholder number
  should never look calibrated. Guards incomplete selection
  (no class/track picked) with an inline warning instead of crashing.
- `AIExplanationScreen` now builds the same real `StrategyComparison` and
  runs ai's actual `buildPrompt()` / `buildTrackReferenceFacts()` so that
  plumbing is live end-to-end — but the rendered "engineer" text is a
  deterministic template built from the comparison's real numbers, NOT a
  live Claude call. Confirmed with ai teammate before proceeding: no safe
  place exists yet to hold the API key in this browser bundle (documented
  blocker in `src/ai/client.ts`, an infra decision that's explicitly
  neither visual's nor ai's to make alone). Made the "not a live call"
  labeling far more prominent (a persistent warning-colored banner, not a
  small trailing string) and added a collapsible "prompt preview" panel
  that renders the actual system/user prompt ai's `buildPrompt()` would
  send, so the pipeline is demonstrably real even though the network hop
  isn't wired.
- Verified with a headless-Chromium pass (`npx playwright install
  chromium`, ad hoc driver script, deleted after use) against the running
  dev server: both screens render real per-track numbers (Silverstone
  1-stop recommended, 5.0s margin, correct compound/lap splits), the
  assumption-flag footer lists real flags, the why-not-alternative prompt
  preview shows ai's actual grounding-rules system prompt verbatim, zero
  console errors across both screens and both explanation modes.
- `npx tsc --noEmit` and `npm run build` both clean.
- bugs independently verified this pass (StrategyComparisonScreen +
  AIExplanationScreen wiring, adapter correctness, tsc clean) before the
  follow-up below landed.

## 2026-07-11 — Wired PitWindowScreen + StrategyBattleScreen onto the same adapter

- Follow-up flagged in the previous entry, picked up on request: the last
  two screens still on ai's `MOCK_CLOSE_CALL` fixture.
- Extracted the "build a real StrategyComparison off AppSelection, handle
  the incomplete-selection error case" pattern that had been duplicated
  across `StrategyComparisonScreen`/`AIExplanationScreen` into a shared
  `src/lib/useStrategyComparison.ts` hook and a shared
  `src/components/ui/NoComparisonNotice.tsx` fallback panel — refactored
  the two already-wired screens onto it too so there's exactly one place
  that owns "selection incomplete -> friendly message instead of a
  crash" for all four consuming screens.
- `PitWindowScreen` now feeds real `StrategyComparison.strategies` into
  `PitWindowTimeline` instead of `MOCK_CLOSE_CALL` — no chart-component
  changes needed, it already consumed the right shape.
- `StrategyBattleScreen` now picks its two head-to-head sides from
  `marginAnalysis.closestPairIds` on the real comparison (the genuinely
  interesting pair to debate) rather than an arbitrary `strategies[0]`/
  `strategies[1]`, which the old mock-based version implicitly did
  because MOCK_CLOSE_CALL only had two candidates. Lap-by-lap gap chart
  remains a stub pending a per-lap series from sim (unchanged, still
  flagged).
- Verified with a headless-Chromium pass against the dev server: Pit
  Window renders the real 1/2/3-stop Gantt for Silverstone with correct
  compound segments and pit ticks; Battle renders the real closest-pair
  (2-stop vs 3-stop, +9.4s/+14.4s) with correct stint chips. Zero console
  errors. `npx tsc --noEmit` and `npm run build` both clean.
- All 8 screens are now off mock fixtures except the deliberately-stubbed
  parts (AI Explanation's text generation — no live API call site yet;
  Strategy Battle's lap-by-lap gap chart — no sim data shape yet). Ad hoc
  verification scripts/screenshots deleted after use each time, per usual.

## 2026-07-11 (later) — Wired StrategyBattle's gap chart onto sim's raceGapEvolution()

- Correction from the coordinator: sim had already built
  `src/sim/raceGapEvolution.ts` (commit bf241c2) for exactly this — a
  handoff that got lost in the shuffle rather than a genuinely missing
  data shape. Re-read `src/sim/raceGapEvolution.ts` in full: it reuses
  `perLapStrategyTrace()` (also newly exported from `strategyCompare.ts`)
  so this chart can never silently drift from the headline
  `predictedTotalRaceTimeSeconds` numbers shown on Comparison/Battle.
- Refactored `src/lib/raceSimAdapter.ts`: extracted the track/pit-loss/
  safety-car/base-laptime resolution that `buildStrategyComparison()` did
  inline into a shared `resolveRaceSimContext()`, and added
  `buildGapEvolution(selection, candidateAId, candidateBId)` on top of
  it — both entry points now derive from the exact same per-selection
  context so they can't quietly disagree. One wrinkle: `raceGapEvolution()`
  requires a concrete `baseLapTimeSec` (unlike `RaceSimInput`, which
  accepts `undefined` and defers to sim's own internal placeholder
  default), so the context now carries both the real optional value
  (`baseLapTimeSec`, passed through to `compareStrategies()` so its own
  assumption-flag logic still fires correctly) and a resolved concrete
  copy (`resolvedBaseLapTimeSec`, mirroring sim's private
  `DEFAULT_BASE_LAP_TIME_SEC = 90` fallback since that constant isn't
  exported) for `raceGapEvolution()` to consume.
- New `src/components/charts/GapEvolutionChart.tsx` — single neutral-color
  line (this is a signed quantity, not a categorical compound/status
  encoding, so no palette assignment needed) against a zero reference
  line, with each candidate's pit laps marked as dashed vertical ticks
  (accent-colored for candidate A, muted for B) so the gap's inflection
  points visibly line up with pit-stop events. Follows
  `DegradationChart.tsx`'s existing Recharts styling conventions
  (`.tabular` monospace ticks, no dual axis, custom tooltip).
- `StrategyBattleScreen` now calls `buildGapEvolution()` for the same
  `marginAnalysis.closestPairIds` pair already shown in the stint cards,
  replacing the "pending" placeholder panel entirely.
- Verified with a headless-Chromium pass: real Silverstone 2-stop vs
  3-stop gap curve renders, visibly steps at each pit lap, ends near the
  ~5.0s delta-of-deltas the stint cards already show (9.4s vs 14.4s).
  Zero console errors. `npx tsc --noEmit` and `npm run build` both clean.
- This closes the last functional gap flagged anywhere in CLAUDE.md's
  "What's still open" list except the AI Explanation live-API call,
  which remains correctly out of scope (infra decision, not visual's or
  ai's to resolve unilaterally).

## 2026-07-11 (later still) — Code-split routes off the main bundle

- `npm run build` was tripping Vite's 500KB chunk-size warning
  (729KB/220KB-gzip single `index.js`). Checked whether `@anthropic-ai/sdk`
  was dead weight in the client bundle first, since `ai.explain()` isn't
  called from the browser: `src/ai/client.ts` and `src/ai/explain.ts` both
  only import `Anthropic` as a *type* (`import type Anthropic from
  '@anthropic-ai/sdk'`), which TypeScript/Vite fully erase at build time —
  grepped the built `dist/assets/*.js` for `AnthropicError`/`class
  Anthropic` and found zero matches, confirming the SDK was never actually
  in the bundle. Not the culprit; no action needed there.
- The real cost was everything living in one entry chunk regardless of
  route — Recharts (`DegradationChart`, `GapEvolutionChart`), the full sim
  engine + data JSON pulled in by `useStrategyComparison`, and ai/'s
  prompt-builder were all downloaded before a first-time visitor even
  finishes picking a car class on the landing screen.
- `src/App.tsx`: converted every screen except
  `CarClassTrackSelectScreen` (the landing route, kept a static import so
  first paint has zero waterfall) to `React.lazy()`, wrapped `<Routes>` in
  a single `<Suspense>` with a new `src/components/layout/RouteFallback.tsx`
  fallback (terse pit-wall-style "loading" state, not a generic spinner).
- Result: main entry chunk 729KB -> 276KB (89KB gzip), warning gone.
  Rollup automatically split Recharts into its own ~345KB `LineChart`
  chunk (only fetched by Tyre Degradation/Strategy Battle) and the sim
  engine + data JSON into a ~42KB `useStrategyComparison` chunk (only
  fetched by the four strategy-consuming screens) — landing screen no
  longer pays for either.
- Verified via headless-Chromium against `vite preview` (the actual
  production build, not dev server): navigated all 8 routes in sequence,
  zero console errors and zero failed chunk requests — confirms the lazy
  imports resolve correctly under real HTTP chunk loading, not just in
  dev's on-demand transform pipeline. `npx tsc --noEmit` clean.
