# Performance Tier Slider — Reference Definitions

Status: DRAFT — jointly owned with `sim`. This file records the *reasoning* behind each band per the plan's instruction ("document the reasoning, not just the numbers"). Numeric values below are data's proposed starting point; sim owns final calibration since these numbers feed directly into their pace/degradation models. Reconcile via message before treating as final.

## Why a tier slider at all (context, not new)

Per `PitWallAI_Multi_Agent_Plan.md`: My Team / Driver Career let a car's real pace drift a long way from its starting point over a season via upgrades. Tracking individual upgrade paths (chassis/aero/powertrain/durability points) is out of scope. The tier slider abstracts "how competitive is this car right now" into 4 bands that the sim's pace/tyre-life models consume directly.

## The four bands

For each band: a qualifying-pace description (how far off pole/ultimate pace), and how that should plausibly propagate into tyre life — because a slower car isn't just "slower," it usually gets there differently (less downforce efficiency = more sliding = more tyre wear per lap; a struggling car dragging more also burns tyre life fighting for balance).

### Backmarker
- **Qualifying pace:** Roughly 1.5–2.5% off ultimate pace (very rough real-world analogue: the gap from a current back-of-grid team to pole in a normal, non-outlier season — historically has ranged from ~1.5s to over 3s at some circuits, so this is circuit-relative, not a fixed seconds figure).
- **Tyre life:** Reasoned to be worse than a flat pace penalty alone would suggest — a car lacking outright downforce/mechanical grip typically compensates with more steering input and slip angle to find lap time, which increases surface degradation. Proposed: Backmarker tyre wear rate should be modeled as pace-deficit-plus-a-degradation-penalty-on-top, not pace-deficit alone.
- **Strategy-relevant consequence:** Track position matters *more*, not less, for a Backmarker — it has less pace in hand to recover from a bad strategy call, so a well-timed safety-car pit stop can be disproportionately valuable (converts an off-strategy race into a points finish) while a badly-timed one is disproportionately costly (stuck in traffic it can't pass).

### Midfield
- **Qualifying pace:** Roughly 0.7–1.5% off ultimate pace — "competitive point-scoring pace, no more" per the brief.
- **Tyre life:** Baseline/reference tyre wear — this is the band the sim's core degradation curves should probably be tuned against by default, with Backmarker/Contender/Top Tier as multipliers off this baseline.
- **Strategy-relevant consequence:** Standard undercut/overcut math applies without much adjustment; this is the "textbook" strategy band.

### Contender
- **Qualifying pace:** Roughly 0.3–0.7% off ultimate pace — "podium-capable on a good day, not a title favorite."
- **Tyre life:** Reasoned to be slightly better than Midfield baseline — more efficient aero generally means less compensatory sliding, though not to Top Tier levels.
- **Strategy-relevant consequence:** Wider strategic optionality — enough raw pace in hand to attempt an aggressive undercut and still defend the position on worse tyres, which a Midfield car can't always do.

### Top Tier
- **Qualifying pace:** 0–0.3% off ultimate pace (this band effectively defines "ultimate pace" — the fastest realistic car in the field) — "championship-front pace."
- **Tyre life:** Reasoned to be the best in the field, all else equal — most aero-efficient, least compensatory sliding — but note this can invert under specific real-world conditions (a very high-downforce/high-deg car can chew tyres *faster* despite being fastest; this is a known real-F1 nuance sim may want to model as a track-type interaction rather than a flat rule).
- **Strategy-relevant consequence:** A Top Tier car pitting under a safety car has the pace in hand to recover lost track position through the field even after a suboptimal call — much lower variance/risk than the same call for a Backmarker car. This is the core of the plan's example: "A Backmarker car pitting under a safety car should show a different risk/reward than a Top Tier car doing the same, since track position matters more when raw pace is worse."

## Cross-class application

- **F1 2025 / F1 2026 Season Pack:** Tiers apply directly; a fresh-season car and a fully-upgraded My Team car of equivalent competitiveness slot onto the same slider position regardless of how they got there.
- **F2:** Since the real-world FIA F2 championship runs a single spec chassis (Dallara F2 2024) across the whole 2024–2026 window, car-to-car pace variance in F2 is much smaller than in F1 — driver skill dominates. Recommend the tier slider have a *compressed* range for F2 (e.g. Backmarker-to-Top-Tier spanning maybe 0.3–0.8% off pace, versus F1's wider spread) rather than reusing F1's absolute percentages. This needs sim's confirmation before being treated as a real number.
- **Konnersport / APXGP:** Both are narrative teams without a fixed real-world competitive record. Recommend treating their tier as player-driven/career-state-dependent rather than defaulting to a fixed tier — Konnersport's Braking Point narrative frames it as capable of Top Tier by the end of its arc; APXGP's movie narrative frames it as starting Backmarker-to-Midfield on an underdog arc. Neither should be hardcoded to one tier as a "true" value.
- **F1 World Car:** See `car-classes.json` — proposed Midfield default, reasoning: F1 World explicitly optimizes for competitively-neutral matchmaking (fixed setups in Ranked, License-based skill pairing), so a car designed not to feel like a Backmarker or dominate as a Top Tier car logically sits at the midpoint. Flagged reasonable_estimate, not confirmed by an EA source.
- **Icons/Legends:** Not a car class at all — Icons drive whatever team car they're recruited into. Tier is inherited from that team's slider position, not set independently.

## Open items for sim to confirm/adjust

1. Whether the qualifying-pace percentage ranges above are the right unit for the pace model (percent-off-ultimate vs. flat seconds-off-pole per track) — percent scales naturally across circuits of different lap length, flat seconds doesn't, but sim may prefer a different internal representation.
2. Whether tyre-wear-as-multiplier-on-Midfield-baseline (proposed above) matches how sim's degradation curves are actually structured.
3. F2's compressed-range proposal — needs sim sign-off before use.
4. Whether "Top Tier chews tyres faster on high-deg tracks" nuance is worth modeling or overkill for v1 — flagged as a real-F1 nuance, not asserting it must be included.
