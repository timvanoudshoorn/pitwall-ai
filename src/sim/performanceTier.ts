/**
 * performanceTier.ts
 * -----------------------------------------------------------------------
 * Performance-tier slider (Backmarker / Midfield / Contender / Top Tier):
 * a single input that scales the pace and degradation models per car
 * class, not a separate model of its own. This module is the one place
 * that resolves "car class + tier" into the combined offsets every other
 * sim module consumes (degradation.ts, strategyCompare.ts,
 * undercutOvercut.ts, safetyCar.ts all accept `carClass`/`performanceTier`
 * directly and look these up internally — this module exists for
 * callers, e.g. the UI slider or the ai teammate, who want the resolved
 * numbers up front without running a full simulation).
 *
 * See SIMLOG.md #9 for the reasoning behind tier numbers and their
 * interaction with car class.
 * -----------------------------------------------------------------------
 */

import {
  CAR_CLASSES,
  PERFORMANCE_TIERS,
  type CarClassKey,
  type PerformanceTierKey,
} from './constants';

export interface CarProfile {
  carClass: CarClassKey;
  performanceTier: PerformanceTierKey;
  /**
   * Tier gap as percent-off-ultimate-pace (already scaled by the car
   * class's tierPaceRangeScale, e.g. F2's compressed range) — the
   * track-length-independent form. Convert to seconds for a specific
   * track via `combinedPaceOffsetSec`.
   */
  combinedPaceOffsetPct: number;
  /** Combined laptime offset (seconds/lap) vs a Top Tier car of the same class on THIS track (baseLapTimeSec * combinedPaceOffsetPct + class's flat category offset). */
  combinedPaceOffsetSec: number;
  /** Combined tyre-wear multiplier applied on top of TYRE_COMPOUNDS base wear rates. */
  combinedTyreWearMultiplier: number;
  /** How much this car "values" a cheap/free pit stop under caution — see safetyCar.ts. */
  safetyCarValueMultiplier: number;
  assumptionFlags: string[];
}

/**
 * Car classes where the tier slider currently defaults to 'midfield' when
 * the caller doesn't specify one, because there's no obvious alternative
 * default (F1 World has no team identity to infer competitiveness from;
 * per data teammate's DATALOG.md this is an agreed-default, not confirmed).
 */
const DEFAULT_TIER_BY_CLASS: Partial<Record<CarClassKey, PerformanceTierKey>> = {
  f1_world: 'midfield',
};

/**
 * Resolves a car class + tier (or class-appropriate default tier) into
 * the combined scaling profile for a specific track's base laptime
 * (needed because the tier gap is percent-off-ultimate-pace, not flat
 * seconds — see PERFORMANCE_TIERS doc comment in constants.ts).
 */
export function resolveCarProfile(
  carClass: CarClassKey,
  performanceTier: PerformanceTierKey | undefined,
  baseLapTimeSec: number,
): CarProfile {
  const flags: string[] = [];
  const tier = performanceTier ?? DEFAULT_TIER_BY_CLASS[carClass] ?? 'midfield';
  if (!performanceTier) flags.push('performance_tier_defaulted');

  const classParams = CAR_CLASSES[carClass];
  const tierParams = PERFORMANCE_TIERS[tier];
  if (!classParams) throw new Error(`Unknown car class: ${carClass}`);
  if (!tierParams) throw new Error(`Unknown performance tier: ${tier}`);

  flags.push(
    'car_class_pace_offset_placeholder',
    'performance_tier_pace_offset_placeholder',
    'performance_tier_wear_multiplier_placeholder',
  );

  const combinedPaceOffsetPct = round3(tierParams.paceOffsetPct * classParams.tierPaceRangeScale);

  return {
    carClass,
    performanceTier: tier,
    combinedPaceOffsetPct,
    combinedPaceOffsetSec: round3(classParams.basePaceOffsetSec + baseLapTimeSec * combinedPaceOffsetPct),
    combinedTyreWearMultiplier: round3(classParams.tyreWearMultiplier * tierParams.tyreWearMultiplier),
    safetyCarValueMultiplier: tierParams.safetyCarValueMultiplier,
    assumptionFlags: dedupe(flags),
  };
}

/** All four tier keys, in slider order (weakest to strongest) — for UI wiring. */
export const PERFORMANCE_TIER_ORDER: PerformanceTierKey[] = [
  'backmarker',
  'midfield',
  'contender',
  'top_tier',
];

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
