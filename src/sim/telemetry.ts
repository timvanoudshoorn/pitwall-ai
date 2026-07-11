/**
 * telemetry.ts
 * -----------------------------------------------------------------------
 * Stretch feature from the plan doc ("a telemetry import so a user's own
 * lap times recalibrate the pace model to them specifically"), picked up
 * now that the core backlog + gap-evolution addition are done and wired
 * in by visual, per the coordinator's go-ahead (2026-07-11).
 *
 * SCOPE (deliberately narrow for a first pass, per the coordinator's
 * explicit sizing guidance): a simple lap-time-array input that computes
 * ONE personal pace offset (seconds/lap, and its percent-off-ultimate-pace
 * equivalent) vs the class+tier baseline the user already selected, then
 * hands that number to callers to feed into the existing performance-tier
 * resolver / strategyCompare.ts — NOT a whole new model. In particular,
 * this pass does NOT recalibrate tyre-wear rate, fuel burn, or anything
 * else per-user; it only touches raw pace. A natural v2 if this proves
 * useful in practice, not built now to keep the first pass reviewable.
 *
 * Ownership note: this reuses `resolveCarProfile()` from
 * `performanceTier.ts` rather than duplicating its class/tier math — the
 * "baseline" a telemetry import recalibrates against is exactly what that
 * function already returns for the user's selected class+tier.
 * -----------------------------------------------------------------------
 */

import { resolveCarProfile, type CarProfile } from './performanceTier';
import type { CarClassKey, PerformanceTierKey } from './constants';

export interface TelemetryImportInput {
  /** Raw lap times in seconds from the user's own recorded session, any order, no metadata required. */
  lapTimesSec: number[];
  /**
   * The class/tier the user has already selected in the UI. Telemetry
   * recalibrates pace AROUND this baseline (how much faster/slower this
   * specific user actually is vs what the model assumes for that
   * class+tier) — it does not replace or infer the class/tier selection.
   */
  carClass: CarClassKey;
  performanceTier?: PerformanceTierKey;
  /** Track's baseline laptime (seconds) the recorded laps were set at — e.g. data teammate's `referenceLapTimeSec`, same input `resolveCarProfile()`/`compareStrategies()` already take. */
  baseLapTimeSec: number;
  /**
   * Laps slower than `fastestLap * outlierMultiplier` are excluded before
   * computing the representative pace. A raw lap-time array has no
   * explicit flag for box laps / out-laps / traffic / spins / safety-car
   * laps, so some filter is needed to keep those from dragging the
   * "representative pace" slower than the driver's real raceable pace.
   * Reuses F1's own real 107%-rule multiplier as a readymade,
   * motorsport-grounded (if borrowed-from-a-different-context) default —
   * PLACEHOLDER methodology, not validated against real telemetry logs;
   * a real implementation would ideally use actual lap-flag metadata
   * (pit-in/out, SC/VSC, track limits) instead of a blanket time cutoff.
   */
  outlierMultiplier?: number;
}

export interface TelemetryImportResult {
  /** Laps kept after outlier filtering. */
  representativeLapCount: number;
  /** Laps dropped as outliers (box/out laps, traffic, spins, SC laps, etc — see outlierMultiplier doc). */
  excludedLapCount: number;
  /** Median laptime of the kept laps — median rather than mean specifically to resist skew from any remaining slow laps the outlier filter didn't catch. */
  representativeLapSec: number;
  /** This driver's pace vs the model's expected pace for their selected class+tier at THIS track's baseline. Negative = faster (better) than the model assumed; positive = slower. */
  personalPaceOffsetSec: number;
  /** Same offset as percent-off-ultimate-pace, consistent with PERFORMANCE_TIERS' unit convention (see SIMLOG.md #9) — use this form when applying the offset at a different track's baseLapTimeSec. */
  personalPaceOffsetPct: number;
  /** Confidence signal from raw sample size — a coarse heuristic (same spirit as strategyCompare.ts's per-candidate confidence field), NOT a statistical confidence interval. */
  confidence: 'high' | 'medium' | 'low';
  /** The class+tier baseline this offset was computed against — pass this along so a caller/explanation layer can state what it's a delta FROM. */
  baselineProfile: CarProfile;
  assumptionFlags: string[];
}

const DEFAULT_OUTLIER_MULTIPLIER = 1.07; // PLACEHOLDER, borrowed from F1's real 107% rule — see outlierMultiplier doc comment
const MIN_LAPS_REQUIRED = 3; // PLACEHOLDER floor below which a "representative pace" isn't a meaningful claim

/**
 * Computes a personal pace offset from a raw lap-time log. Throws if fewer
 * than MIN_LAPS_REQUIRED laps are supplied — there's no meaningful
 * "representative pace" claim to make from 1-2 laps.
 */
export function importTelemetry(input: TelemetryImportInput): TelemetryImportResult {
  if (input.lapTimesSec.length < MIN_LAPS_REQUIRED) {
    throw new Error(
      `importTelemetry needs at least ${MIN_LAPS_REQUIRED} lap times, got ${input.lapTimesSec.length}`,
    );
  }
  const flags = ['telemetry_outlier_filter_placeholder'];

  const sorted = [...input.lapTimesSec].sort((a, b) => a - b);
  const fastestLapSec = sorted[0];
  const threshold = fastestLapSec * (input.outlierMultiplier ?? DEFAULT_OUTLIER_MULTIPLIER);
  const kept = sorted.filter((t) => t <= threshold);
  const excludedLapCount = input.lapTimesSec.length - kept.length;

  const representativeLapSec = round3(median(kept));

  const baselineProfile = resolveCarProfile(
    input.carClass,
    input.performanceTier,
    input.baseLapTimeSec,
  );
  baselineProfile.assumptionFlags.forEach((f) => flags.push(f));

  const modelExpectedLapSec = input.baseLapTimeSec + baselineProfile.combinedPaceOffsetSec;
  const personalPaceOffsetSec = round3(representativeLapSec - modelExpectedLapSec);
  const personalPaceOffsetPct = round3(personalPaceOffsetSec / input.baseLapTimeSec);

  const confidence: TelemetryImportResult['confidence'] =
    kept.length >= 15 ? 'high' : kept.length >= 5 ? 'medium' : 'low';
  if (confidence !== 'high') flags.push(`telemetry_sample_size_confidence_${confidence}`);

  return {
    representativeLapCount: kept.length,
    excludedLapCount,
    representativeLapSec,
    personalPaceOffsetSec,
    personalPaceOffsetPct,
    confidence,
    baselineProfile,
    assumptionFlags: dedupe(flags),
  };
}

function median(sortedAscending: number[]): number {
  const n = sortedAscending.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sortedAscending[mid - 1] + sortedAscending[mid]) / 2 : sortedAscending[mid];
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
