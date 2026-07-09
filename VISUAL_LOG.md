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
