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

## 2026-07-11 (later still) — Wired sim's telemetry-import (personal pace) into the UI

- sim (76ce205) and ai (bba0cc6) had finished the telemetry-import
  stretch feature end-to-end in the engine/explanation layers, but no
  screen had a lap-time-entry input to actually call `importTelemetry()`
  — unreachable from the UI. Coordinator flagged it; read
  `src/sim/telemetry.ts` in full before building anything (input:
  `lapTimesSec[]` + the user's already-selected class/tier/track
  baseline; output: a median-filtered representative pace, a personal
  pace offset in both seconds/lap and percent-off-ultimate-pace, and a
  sample-size confidence tier — pace-only, deliberately not
  tyre-wear/fuel personalization, per sim's own scope note).
- Landed it on Settings (matches the coordinator's suggested placement —
  a session-level opt-in preference, not a per-race parameter): new
  "Personal Pace" panel, an Enabled/Disabled toggle button (same
  pattern as `ModeTab`/compound-chip toggles elsewhere, not a native
  checkbox, to stay visually consistent), and a textarea accepting
  either plain-seconds (`91.234`) or mm:ss(`.sss`) (`1:31.234`) lap
  times, one per line or comma-separated — both are realistic paste
  formats for a lap-time log. Live preview below the textarea calls the
  real `importTelemetry()` on every keystroke (via a new
  `resolveTelemetryContext()` in `raceSimAdapter.ts`) and shows the
  computed offset, kept/excluded lap counts, and a confidence badge
  before the user commits to anything — same "never show a number
  without its confidence" pattern as the rest of the app.
- `types/session.ts`: added `AppSelection.personalPace: { enabled,
  lapTimesSec }` — UI-local state, computed into a real
  `TelemetryImportResult` on demand rather than stored pre-computed, so
  it always reflects the current class/tier/track selection it's a
  delta against (mirrors how the rest of `AppSelection` already works).
- `raceSimAdapter.ts`: `buildStrategyComparison()` now resolves the
  telemetry context and passes `personalPaceOffsetSec`/
  `personalPaceConfidence` into `RaceSimInput` — when enabled, this
  measurably shifts every candidate's predicted race time (verified:
  Silverstone default 78.2min -> 82.0min with a synthetic +4.3s/lap
  slower personal offset applied). `resolveTelemetryContext()` fails
  quiet (returns `null`) rather than throwing on "not enough laps yet"
  or "no track selected," since the Settings screen calls it on every
  keystroke of a log still being typed.
- `AIExplanationScreen`: passes the resolved `TelemetryImportResult`
  into ai's `buildPrompt()` (which already had wiring for this from
  bba0cc6 — `telemetryContext` param, PERSONAL PACE fact block,
  grounding allow-list) and adds a matching sentence to the
  non-live template explanation, guarded behind
  `assumptionsUsed.includes('personal_pace_telemetry_applied')` so it
  only appears when the offset actually affected this comparison.
- `StrategyComparisonScreen`'s assumption-flag footer gets readable
  labels for `personal_pace_telemetry_applied` and
  `personal_pace_confidence_*` instead of falling back to the raw
  flag-id-as-words rendering.
- Verified via headless-Chromium against the dev server: pasted 7 lines
  (6 valid lap times + 1 garbage line + 1 laptime far outside the
  107%-of-fastest cutoff) into Settings, confirmed the preview correctly
  parsed 6/filtered 1 outlier/flagged 1 unrecognized line, showed
  +4.344s/lap medium-confidence; Compare screen's total race time and
  assumption footer updated accordingly; Explanation screen's template
  text and prompt preview both included the real PERSONAL PACE numbers.
  Zero console errors. `npx tsc --noEmit` and `npm run build` both
  clean, no new chunk-size regression (main chunk still 275KB).

## 2026-07-11 (later still) — Retired the lapsAndCorners mock; wired qualifying format into safety car

Two small teammate-flagged fixes landed together:

- **data's find**: `src/mocks/lapsAndCorners.ts` (visual's own hand-written
  supplement, predating `data/track-lap-reference.json`) was silently
  dropping Shanghai and Madring from Track Select entirely (via
  `dataAdapters.ts`'s `.filter((c) => TRACK_LAPS_CORNERS[c.id])`), and had
  a stale Barcelona corner count (16, pre-2023 layout — F1's run a
  14-corner final sector since the 2023 Spanish GP). data closed the one
  gap that was blocking a full swap by adding a `corners` field to
  `track-lap-reference.json` for all 25 circuits (commit 8a54958,
  Shanghai/Barcelona independently source-verified). New
  `src/lib/trackLapReference.ts` is now the single parse point for that
  file, shared by `dataAdapters.ts` (Track Select's `TrackMeta`) and
  `raceSimAdapter.ts` (sim's `totalLaps`/`baseLapTimeSec`) — previously
  each had its own separate lookup (one via the mock, one via a raw JSON
  import in raceSimAdapter.ts) that could in principle disagree; now
  there's one. `src/mocks/lapsAndCorners.ts` deleted outright, per
  CLAUDE.md's "swap for src/data's real reference files wholesale"
  framing — nothing else referenced it. Verified via headless-Chromium:
  Shanghai and Madring both now appear on Track Select; all 8 routes
  still navigate clean.
- **sim's find**: `raceParameters.qualifyingFormat` (One-Shot/Short/Full
  Qualifying, a Race Parameters screen control since the first scaffold)
  had zero effect on any calculation — `resolveRaceSimContext()` never
  read it. sim built the real model (`safetyCarProbability()`'s new
  optional `qualifyingFormat` param, commit 43517e0, SIMLOG.md #12) and
  asked for a one-line wire-up: passed
  `qualifyingFormat: raceParameters.qualifyingFormat` into the existing
  `safetyCarProbability()` call in `resolveRaceSimContext()`. Also took
  sim's optional suggestion to make `session.ts`'s `QualifyingFormat` a
  re-export of sim's `QualifyingFormatKey` (same pattern already used for
  `CarClassKey`/`PerformanceTierKey`) rather than a coincidentally-matching
  parallel literal union.
- `npx tsc --noEmit` and `npm run build` both clean; no chunk-size
  regression (main chunk 302KB — grew slightly since the landing screen
  now shares the real, larger `track-lap-reference.json` instead of the
  tiny hand-written mock, still well under the 500KB warning threshold).

## 2026-07-12 — Real-device feedback: race-length bug + mobile viewport was never actually tested

A user installed the app on their phone and reported (1) a factual bug in
the race-distance options and (2) that it "looks ass" — after every prior
verification pass in this log reported screens as checked/polished. Both
addressed; (2) required admitting a real gap in how verification was done,
not just fixing CSS, so it's documented in full below.

**1. Race-distance options were wrong.** `RACE_LENGTHS`/`RaceParameters.raceLengthPct`
had `[25, 50, 75, 100]` since the original scaffold — a guess, never
sourced. F1 25 has no 75% option; the real set is 25/35/50/100%. Verified
two ways before shipping the fix (coordinator explicitly asked not to
take either source alone on faith): a web search (EA Forums threads) and
an independent re-check from the data teammate specifically re-searching
EA Forums rather than trusting the coincidence — both agreed, no
conflicting source found. Fixed in `types/session.ts` (`raceLengthPct: 25
| 35 | 50 | 100`) and `RaceParametersScreen.tsx`'s `RACE_LENGTHS` array.

**2. The mobile gap — what was actually wrong, and why prior verification missed it.**

Two compounding problems, one bug and one methodology gap:

- **The real bug: the app has never fit inside a real phone's viewport
  width.** At 390px (iPhone-width), the page rendered at ~503px wide —
  every screen required invisible horizontal scroll on load, silently
  clipping the right ~110px of content including part of the persistent
  TopBar. Root cause: `TopBar.tsx`'s summary-field row (`CLASS`/`TIER`/
  `TRACK`/`LAPS`) was a non-wrapping flex row whose children had no
  `min-w-0` — a classic flexbox default (a flex child won't shrink below
  its content's intrinsic width unless told to), so a long value like
  "Silverstone Circuit" forced the whole row, and via it the header, and
  via IT the entire page, wider than the viewport instead of wrapping.
  This was invisible on every desktop-width screenshot taken all session
  (1400px has slack to spare) and is exactly the kind of bug that only
  shows up once you actually constrain to a phone width — which nothing
  in this session had done before now.
- **Compounding real bugs found via the same mobile screenshots**:
  `StrategyComparisonScreen`'s stint-chip row (a 3-stop card has 4 chips)
  used the same unwrapped-flex pattern and was clipping the last chip
  clean off the card's right edge — content spilling past its own
  border, not just tight. `SettingsScreen`'s `SettingRow` label/value
  `justify-between` row doesn't stack at narrow widths, so the longer
  values (e.g. the AI-access sentence) wrapped word-by-word into an
  orphaned mess instead of reading as a label/value pair. `NavRail` was
  a fixed 76px regardless of viewport — never itself the overflow
  source, but eating ~20% of a 390px screen unconditionally compounded
  every other width problem.
- **The methodology gap, which is the more important finding**: fixing
  the above required first fixing my OWN verification tooling. Every
  screenshot taken this session (and, per VISUAL_LOG's history, likely
  every prior session too) used `page.screenshot({ fullPage: true })`,
  which reports it captured the whole page but silently did not:
  `AppShell.tsx`'s outer container is `h-screen` (a fixed viewport-height
  box) with only the inner `<main>` scrolling via `overflow-y-auto` —
  Playwright's `fullPage` option measures `document`/`body` scroll
  height, which never grows in this layout, since the *document* itself
  never scrolls, only an inner div does. So every "verified" screenshot,
  desktop included, was quietly truncated to exactly the viewport size
  and never showed anything below the fold. It went unnoticed because at
  1400x1000 most single-panel screens happened to fit anyway; the Select
  screen (which has 3 stacked panels well past 1000px tall) should have
  been the tell, but nobody compared image pixel dimensions to viewport
  dimensions to catch it. Fixed the capture technique for this pass by
  temporarily overriding `main`'s `overflow`/`height` via an injected
  style tag before the real screenshot, forcing the document to its true
  content height — confirmed working (image heights now vary correctly
  by actual content per screen instead of every one being exactly
  viewport-sized). Also hit and fixed a subtler CSS trap while adding an
  `overflow-x-hidden` safety net to the shell: adding `overflow-x-hidden`
  alone to a box that never sets `overflow-y` causes the browser to
  force-compute `overflow-y` to `auto` too (an overflow-axis-consistency
  rule in the CSS spec), which silently created a second vertical-scroll
  boundary at the shell level and re-broke the very screenshot fix above
  — caught because captured heights collapsed back to exactly the
  viewport the moment that line was added. Resolved by keeping the
  safety net only on `main`, which already declares both axes explicitly.
- **Fixes**: `TopBar.tsx` — flex-wrap row, `min-w-0` + `truncate` on
  value spans (the actual fix), header height changed from fixed `h-12`
  to `min-h-12` so a wrapped second line doesn't clip. `NavRail.tsx` —
  narrower by default (`w-[60px]`, widening to the original 76px at
  `sm`+), smaller icon/text at the base size — still always-visible
  icon+label per CLAUDE.md's explicit mandate, just responsively sized
  rather than fixed. `StrategyComparisonScreen.tsx` — stint-chip row
  `flex-wrap` instead of forced single-line. `SettingsScreen.tsx` —
  `SettingRow` stacks label above value below `sm`. `AppShell.tsx` —
  `overflow-x-hidden` safety net on `main` only (see above for why not
  on the outer shell).
- Re-verified full-content (not viewport-truncated) screenshots at both
  390x844 and 1400x1000 across all 8 screens after the fix: mobile image
  widths are now exactly 390px on every screen (zero horizontal
  overflow, confirmed via reading PNG header dimensions directly rather
  than eyeballing), TopBar wraps cleanly to two lines with every field
  fully visible, the 3-stop stint row wraps instead of clipping, Settings
  rows stack cleanly. Desktop screenshots are pixel-identical to before
  the responsive changes (confirmed no regression at 1400px). Zero
  console errors across all 8 routes at both viewports. `npx tsc
  --noEmit` and `npm run build` both clean, no chunk-size regression.
- Not touched: `TierDial`'s detent labels look tight at 390px in a
  downscaled preview image but I don't have strong evidence they're
  actually clipped at full resolution — didn't want to modify a
  component CLAUDE.md explicitly protects ("don't regress it back to a
  dropdown") on a hunch. Flagging as a possible follow-up if the user
  still sees an issue there specifically, rather than guessing at a fix.

## 2026-07-12 (later) — TierDial mobile-depth investigation: corrected a measurement, then fixed the real (smaller) issue anyway

bugs re-verified the mobile fix above and flagged a follow-up: on
`CarClassTrackSelectScreen`, the `TierDial` supposedly sat ~2792px down
the page at 375px width — "not clipped, but arguably buried" against
CLAUDE.md's "feel tactile and immediate... not a buried settings toggle"
mandate for that exact component. Investigated rather than took the
number at face value (same discipline as the race-length fix above):

- **The 2792px figure doesn't reproduce.** Measured the live page
  directly via Playwright `getBoundingClientRect()` (not a screenshot —
  a hard DOM measurement, immune to any of this session's earlier
  screenshot-truncation issues) on the current build at 375px width: the
  `TierDial` sat at **y=943px**, not 2792px, out of a ~3447px-tall page.
  Cross-checked with a properly-full-page screenshot (same corrected
  capture technique from the prior entry) — visually confirms the same
  position. Best read of the discrepancy: BUGLOG's own methodology note
  says they computed it as `scrollHeight (3386) - clientHeight (594) =
  2792` — that's the page's *total* remaining scroll distance from the
  top (dominated by the long Track grid, which sits *below* the dial,
  not above it), not the dial's own offset from the top. Reported this
  back to bugs directly so it doesn't propagate into other BUGLOG
  findings that used the same method.
- **943px still isn't nothing, and the underlying concern was fair even
  at the corrected number** — CLAUDE.md's "immediate" bar is a real
  design intent, and requiring a full screen-height-plus of scroll past
  the Car Class grid before reaching a component explicitly designed to
  feel tactile is worth tightening regardless of whether the original
  number was right. Chose NOT to reorder the three setup panels
  (Car Class / Performance Tier / Track) via CSS `order` on mobile only
  — that would desync the "Setup 1/2/3 of 3" labels from their visual
  position and trade one confusing thing for another. Instead found and
  fixed what was actually making the Car Class panel unnecessarily tall:
  `dataAdapters.ts`'s `firstSentence()` truncation (meant to give each
  card a "pit-wall-terse line") only broke on `.`/`!`/`?`, so a
  description using a semicolon before its first real sentence-ending
  period (F2's "F1 25 includes F2 as a class; the real-world
  championship has run a single chassis..." — semicolon, not period,
  right after the useful part) sailed straight through untruncated,
  rendering as a multi-line paragraph on every car-class card. Fixed the
  regex to also break on `;`. Added `line-clamp-3 sm:line-clamp-none` on
  the card description as a hard backstop for any future source text
  that still runs long (full text still available via a `title`
  tooltip), independent of whether the regex catches it.
- Result, re-measured the same way: `TierDial` now at **y=610px**
  (down from 943px), total page height 3053px (down from 3447px) — on a
  typical ~812px-tall phone viewport that's now visible at or near the
  very first screen, not "buried." This is a genuine, verified
  improvement, not a fix for the originally-reported (unreproducible)
  number — and it improves the same cards on desktop too (F2's card now
  reads "F1 25 includes F2 as a class." instead of a paragraph), so
  there's no viewport-specific tradeoff here at all.
- Verified zero console errors across all 8 routes at both 1400x1000 and
  375x812 on the rebuilt app. `npx tsc --noEmit` and `npm run build`
  both clean, no chunk-size regression.
