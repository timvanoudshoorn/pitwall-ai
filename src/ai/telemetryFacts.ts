/**
 * telemetryFacts.ts
 * -----------------------------------------------------------------------
 * Formats sim's telemetry-import result (`importTelemetry()` in
 * `sim/telemetry.ts`) into a fact block for the explanation prompts,
 * unblocking AILOG backlog item #4 now that sim has shipped the feature
 * (commit 76ce205, SIMLOG.md #11).
 *
 * WHY THIS NEEDS ITS OWN FACT BLOCK RATHER THAN JUST RELYING ON
 * `assumptionsUsed`: `compareStrategies()` folds `personalPaceOffsetSec`
 * into every candidate's pace additively and only ever surfaces it as an
 * opaque flag string in `assumptionsUsed`
 * (`personal_pace_telemetry_applied`, plus a confidence flag if not
 * high) — see strategyCompare.ts lines ~112-117. The actual offset
 * number, the representative lap count, and the confidence basis are
 * NOT fields anywhere in `StrategyComparison`. Same shape of problem as
 * the undercut/overcut mechanism: a real number the model would need in
 * order to explain "your recorded pace" at all, but one that doesn't
 * live inside the object the grounding checker already scans. Handled
 * the same way — a dedicated fact block plus a `groundedExtras` entry
 * (see promptBuilder.ts / explain.ts) so the checker's allow-list
 * actually includes these numbers instead of flagging every one of them
 * as invented.
 *
 * HALLUCINATION RISK SPECIFIC TO THIS FEATURE: `personalPaceOffsetSec`
 * is applied as a single FLAT per-lap offset, identically to every
 * strategy candidate (see strategyCompare.ts: `classOffset` is computed
 * once and passed unchanged into every `evaluateStrategy()` call) — it
 * does NOT touch tyre-degradation or fuel-burn modeling at all (sim's
 * own doc comment on telemetry.ts is explicit this is pace-only, v1).
 * Without an explicit instruction, a plausible-sounding but false
 * elaboration would be "strategy X suits your pace better" or "your
 * fast in-laps mean your tyres last longer" — neither is true; the
 * offset shifts every candidate's absolute predicted time by the same
 * amount and changes nothing about *why* one strategy beats another.
 * `formatTelemetryFact()` says this explicitly rather than leaving it
 * to be inferred.
 * -----------------------------------------------------------------------
 */

import type { TelemetryImportResult } from '../sim/telemetry.ts';

export function formatTelemetryFact(telemetry: TelemetryImportResult): string {
  const {
    representativeLapCount,
    excludedLapCount,
    representativeLapSec,
    personalPaceOffsetSec,
    personalPaceOffsetPct,
    confidence,
  } = telemetry;

  const direction = personalPaceOffsetSec < 0 ? 'faster' : personalPaceOffsetSec > 0 ? 'slower' : 'identical to';
  const confidenceCaveat =
    confidence !== 'high'
      ? ` Confidence is "${confidence}" (based on sample size) — caveat this in the explanation rather than stating it with flat certainty.`
      : '';

  return `
PERSONAL PACE (from the driver's own recorded lap times, via telemetry import):
- Representative pace: ${representativeLapSec}s/lap, from ${representativeLapCount} kept laps (${excludedLapCount} excluded as outliers, e.g. box/traffic/mistake laps).
- Personal offset vs the model's expected pace for the selected class/tier: ${personalPaceOffsetSec}s/lap (${personalPaceOffsetPct}% of a lap) — ${direction} than the generic class/tier assumption.
- Confidence: ${confidence}.${confidenceCaveat}
- IMPORTANT: this offset is applied as a single flat per-lap shift, IDENTICALLY to every strategy
  candidate in FACTS — it recalibrates PACE ONLY, not tyre-degradation or fuel-burn modeling
  (those still use the standard class/tier assumptions). It does not make any one strategy suit
  this driver "better" than another and does not change tyre life. If you cite it, describe it as
  why the predicted times reflect this driver's own pace rather than a generic assumption for the
  class/tier — do not claim it explains why one strategy beats another, and do not claim tyre wear
  or fuel behavior has been personalized.
`.trim();
}
