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
- Not yet touched: `PitWindowScreen` and `StrategyBattleScreen` are still
  on `MOCK_CLOSE_CALL` — flagged as a natural follow-up (same adapter,
  trivial to wire) but out of scope for this pass, which was scoped to
  the two screens named in the task.
