# PitWall AI — CLAUDE.md

Read `PitWallAI_Multi_Agent_Plan.md` first for full scope (car classes, tracks,
performance tiers, strategy math, agent roles). This file is the living
reference for the codebase itself: stack, folder ownership, and conventions.

## Tech stack

- **React 19 + TypeScript + Vite** — scaffolded via `create-vite react-ts`.
- **Tailwind CSS v4** (`@tailwindcss/vite` plugin, CSS-first `@theme` config
  in `src/index.css` — no `tailwind.config.js`).
- **Recharts** for line/area charts (tyre degradation). Custom SVG/HTML for
  the pit-window Gantt-style timeline — recharts doesn't have a native
  primitive for that shape.
- **lucide-react** for all icons — no emoji anywhere in the UI.
- **react-router-dom** (`HashRouter`, since this ships as a static bundle
  with no server-side routing yet) for the 8 screens.
- **@anthropic-ai/sdk** — used only by `src/ai/`, and only from a context
  that can hold a real API key (never bundled into the browser build as-is;
  see `src/ai/client.ts`'s deployment note).

Run `npm run dev`, `npm run build`, `npx tsc --noEmit -p tsconfig.app.json`.

## Folder ownership (enforced by instruction, not branches — see plan doc)

| Path | Owner | Notes |
|---|---|---|
| `src/screens/`, `src/components/`, `src/lib/`, `src/mocks/`, `src/index.css` | **visual** | UI, charts, design tokens, placeholder display data |
| `src/sim/` | **sim** | Strategy/math engine |
| `src/data/` (not yet created) | **data** | Car-class/track reference files |
| `src/ai/` | **ai** | Explanation prompt construction, Claude API client, grounding checks |
| `src/types/session.ts` | **visual** | UI-local selection state, built on top of sim/ai's key types (not a parallel contract) |

`src/mocks/` holds visual's placeholder display metadata (car class
names/descriptions, a track list, track schematics) — swap for `src/data/`'s
real reference files wholesale once published; ids/keys are kept identical
to `sim/constants.ts`'s `CarClassKey`/`PerformanceTierKey` so no translation
layer is needed.

## Design System — instrument-panel / timing-tower aesthetic

This is a race engineer's pit-wall display, not a consumer dashboard. Every
decision below is in service of that: dense, legible, numeric-first, dark by
default, no decorative chrome.

### Surfaces & structure

- Near-black background (`--color-pit-bg #0a0b0d`), panels one step up
  (`--color-pit-panel #14171b`), hairline borders
  (`--color-pit-border #262b32`), never a drop shadow — depth comes from
  border/surface contrast, not blur.
- Every content block is a `Panel` (`src/components/ui/Panel.tsx`): thin
  border, four corner "ticks" (like an oscilloscope readout frame), an
  eyebrow label + title, never a floating card with a shadow.
- Left nav rail, not a top nav bar or hamburger menu — a timing-tower tab
  strip, icon + label, always visible, current screen lit with a left accent
  bar.
- Top status strip always shows the current class/tier/track/laps — the
  session state is never hidden behind a screen transition.

### Typography

- UI text: system sans stack (`--font-display`) — no webfont network
  dependency.
- **All numeric data — laptimes, deltas, lap counts, percentages — uses
  `.tabular` (`ui-monospace`, `font-variant-numeric: tabular-nums`)**. A
  timing tower never lets digits jitter width as they update; this is
  non-negotiable for anything that reads as "live data."

### Color

Palette validated with the `dataviz` skill's `validate_palette.js`
(categorical six-checks, dark mode, surface `#0a0b0d`) — do not hand-pick a
replacement hue without re-running it (`node scripts/validate_palette.js
"<hexes>" --mode dark` from the skill's directory).

**Status** (`src/components/ui/StatusBadge.tsx`) — fixed, reserved, always
icon + label, never color alone:
`good #22c55e` · `warning #eab308` · `serious #f97316` · `critical #ef4444`.

**Tyre compounds** (`src/lib/compoundMeta.ts`) — this is a fixed real-world
F1 broadcast convention, not a generic categorical ramp, so it's exempt from
"assign in fixed hue order" but still validated for CVD/contrast on the dark
surface:
`soft #ef4444` (S) · `medium #b58312` (M) · `hard #c9c2b0` (H) ·
`intermediate #16a34a` (I) · `wet #3b82f6` (W).
The **hard** compound's swatch is intentionally low-chroma (near-white, like
the real tyre marking) and fails the chroma-floor check in isolation — this
is accepted deliberately because `CompoundChip` always renders the letter
label, satisfying the skill's "WARN legal only with secondary encoding"
rule. Never remove the letter from a compound chip.

**Accent** (`--color-pit-accent #a855f7`) — selection/active state only,
modeled on timing-tower purple (fastest-lap purple in F1 broadcast
convention). Not reused for anything else.

### Charts

- **Tyre Degradation** (`src/components/charts/DegradationChart.tsx`) calls
  `sim.tyreStintCurve()` directly — this is real math, not mock data, and
  should stay that way. One line per compound, color = compound identity
  (no separate legend box needed since `CompoundChip` toggles double as the
  legend). Dashed reference lines mark the modeled cliff lap per compound.
- **Pit Window Timeline** (`src/components/charts/PitWindowTimeline.tsx`) is
  a custom horizontal Gantt: one row per strategy candidate, segments =
  stints colored by compound, dark ticks = pit-lane entry laps. Built custom
  because recharts has no stacked-horizontal-interval primitive that fits.
- Never a dual-axis chart. Never a rainbow categorical palette — the fixed
  compound/status hues above are the only categorical sets in this app.

### The Performance Tier dial

`src/components/ui/TierDial.tsx` — deliberately not a `<select>` or a plain
range input. Click any of the four detents, drag the puck continuously
between them, or use arrow keys; the fill bar reads like a boost-pressure
gauge. This exists because the plan explicitly calls out the tier control as
needing to "feel tactile and immediate, like a real setup dial, not a
buried settings toggle" — don't regress it back to a dropdown.

### Track select

`src/lib/trackSchematic.ts` generates a deterministic abstract closed-loop
SVG per track id (seeded, not random per render) so track cards have a
distinct shape instead of being a flat list — explicitly **not** claiming
positional accuracy to the real circuit. Replace with real corner-by-corner
geometry if/when the data teammate supplies it; keep the "this is a
schematic, not a map" framing either way.

## What's still open / stubbed

- **AI Explanation screen** renders a fixed mock `ExplanationResult` — it
  does not call the live Claude API (correctly: the browser can't hold the
  key, see `src/ai/client.ts`). Needs a backend/serverless call site before
  this can go live; that's an infra decision flagged in the plan doc, not
  visual's or ai's alone to make.
- **Strategy Battle** screen has no lap-by-lap gap-evolution chart yet —
  sim hasn't produced a per-lap position/gap series. Flagged to sim.
- Car-class/track display metadata in `src/mocks/` is a placeholder pending
  `src/data/` — ids match `sim/constants.ts` exactly so the swap is
  mechanical.
