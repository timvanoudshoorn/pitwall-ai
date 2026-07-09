/**
 * ers.ts
 * -----------------------------------------------------------------------
 * ERS deployment guidance for F1® 25: 2026 Season Pack cars — Overtake
 * Mode and Active Aerodynamics are new for 2026-spec cars and change
 * strategy-relevant behavior vs 2025-spec legacy ERS. This module is
 * INERT (returns a "not applicable" result) for any car class whose
 * `ersModel` isn't '2026' (see CAR_CLASSES in constants.ts).
 *
 * See SIMLOG.md #8 — every numeric constant here is a PLACEHOLDER pending
 * the data teammate's research into how these systems actually behave
 * in-game; the *shape* of the guidance (deployment mode tradeoffs,
 * overtake-mode rationing) is a reasonable motorsport approximation of
 * publicly described 2026 F1 regulation concepts (manual override /
 * "push to pass"-style systems paired with active aero), not a literal
 * F1 25 implementation detail.
 * -----------------------------------------------------------------------
 */

import type { ConfidenceLevel } from '../ai/types';
import { CAR_CLASSES, ERS_2026_DEFAULTS, type CarClassKey } from './constants';

export type ErsDeployMode = 'qualifying' | 'hotlap' | 'balanced' | 'conservation';

export interface ErsApplicabilityResult {
  applicable: boolean;
  reason?: string;
}

export function ersModelApplicable(carClass: CarClassKey): ErsApplicabilityResult {
  const model = CAR_CLASSES[carClass].ersModel;
  if (model === '2026') return { applicable: true };
  if (model === 'none') return { applicable: false, reason: 'car_class_has_no_ers' };
  return { applicable: false, reason: 'car_class_uses_legacy_ers_model' };
}

export interface ErsDeployPlanResult {
  mode: ErsDeployMode;
  deploymentPct: number;
  batteryDrainMultiplier: number;
  /** Rough laptime benefit (seconds) of running this mode vs full conservation, PLACEHOLDER linear scaling. */
  estimatedLapTimeGainSec: number;
  assumptionFlags: string[];
}

/** Guidance for a single ERS deployment mode on a 2026-spec car. */
export function ersDeployPlan(mode: ErsDeployMode): ErsDeployPlanResult {
  const params = ERS_2026_DEFAULTS.deployModes[mode];
  const conservation = ERS_2026_DEFAULTS.deployModes.conservation;
  // Linear interpolation placeholder: full deployment (qualifying, 100%) assumed worth ~0.9s/lap
  // over full conservation (40%) — see SIMLOG.md #8.
  const maxGainSec = 0.9;
  const deploymentRange = 1.0 - conservation.deploymentPct;
  const estimatedLapTimeGainSec = round3(
    ((params.deploymentPct - conservation.deploymentPct) / deploymentRange) * maxGainSec,
  );
  return {
    mode,
    deploymentPct: params.deploymentPct,
    batteryDrainMultiplier: params.batteryDrainMultiplier,
    estimatedLapTimeGainSec,
    assumptionFlags: ['ers_2026_deploy_mode_gain_placeholder'],
  };
}

/**
 * Overtake Mode is battery-SoC-gated (replaces DRS for 2026 cars, per
 * data teammate's regulationChanges research), not a discrete per-race
 * allowance — model it as a depleting/regenerating resource across a
 * stint rather than a counter.
 */
export interface BatterySocStateInput {
  currentSoc: number;
  /** Number of Overtake Mode activations attempted this lap (0 if none). */
  activationsThisLap: number;
}

export interface BatterySocStateResult {
  socAfterLap: number;
  activationsGranted: number;
  /** True if the driver wanted to activate but didn't have enough SoC. */
  socLimited: boolean;
  assumptionFlags: string[];
}

/** Advances battery SoC by one lap: drains for activations actually granted, regenerates the rest. */
export function advanceBatterySoc(input: BatterySocStateInput): BatterySocStateResult {
  const { socDrainPerActivation, socRegenPerLap, batteryCapacitySoc } = ERS_2026_DEFAULTS;
  const affordable = Math.floor(input.currentSoc / socDrainPerActivation);
  const activationsGranted = Math.min(input.activationsThisLap, affordable);
  const socLimited = activationsGranted < input.activationsThisLap;

  const socAfterDrain = input.currentSoc - activationsGranted * socDrainPerActivation;
  const socAfterLap = Math.min(batteryCapacitySoc, socAfterDrain + socRegenPerLap);

  return {
    socAfterLap: round3(socAfterLap),
    activationsGranted,
    socLimited,
    assumptionFlags: ['ers_2026_battery_soc_model_placeholder'],
  };
}

export interface OvertakeModeRationingInput {
  currentSoc: number;
  lapsRemaining: number;
  /** How many of the remaining laps present a realistic attack/defend opportunity (battle for position, DRS-successor zones, etc). */
  highValueLapsRemaining?: number;
}

export interface OvertakeModeRationingResult {
  /** Recommended SoC budget to spend per high-value opportunity, so the car doesn't run dry before laps run out. */
  recommendedSocPerOpportunity: number;
  maxActivationsAtCurrentSoc: number;
  gainPerActivationSec: number;
  assumptionFlags: string[];
}

/** Rationing guidance: spread current battery SoC across remaining high-value opportunities. */
export function overtakeModeRationing(input: OvertakeModeRationingInput): OvertakeModeRationingResult {
  const flags = ['ers_2026_battery_soc_model_placeholder'];
  const opportunities = Math.max(1, input.highValueLapsRemaining ?? input.lapsRemaining);
  const recommendedSocPerOpportunity = round3(input.currentSoc / opportunities);
  const maxActivationsAtCurrentSoc = Math.floor(
    input.currentSoc / ERS_2026_DEFAULTS.socDrainPerActivation,
  );
  return {
    recommendedSocPerOpportunity,
    maxActivationsAtCurrentSoc,
    gainPerActivationSec: ERS_2026_DEFAULTS.overtakeModeGainSec,
    assumptionFlags: flags,
  };
}

export interface ActiveAeroBenefitResult {
  dragDeltaPct: number;
  /** Rough straight-line/top-speed laptime benefit at circuits with long straights, PLACEHOLDER flat estimate. */
  estimatedLapTimeGainSec: number;
  assumptionFlags: string[];
}

/**
 * Reference full-throttle % the original flat 0.25s/lap estimate was
 * implicitly calibrated against — the rough calendar-wide average across
 * data teammate's data/track-lap-reference.json `fullThrottlePct` field
 * (values range Monaco ~40% to Monza ~82%). PLACEHOLDER, not measured.
 */
const REFERENCE_FULL_THROTTLE_PCT = 65;
const FLAT_GAIN_AT_REFERENCE_SEC = 0.25;

/**
 * Active Aero drag-reduction benefit, per-lap. Track-straight-proportion-
 * aware (resolved 2026-07-10): pass `fullThrottlePct` from data teammate's
 * data/track-lap-reference.json to scale the estimate — more full-throttle
 * time means more of the lap benefits from reduced drag, so the gain
 * scales up/down linearly from the flat estimate's implicit reference
 * point. Omit `fullThrottlePct` to fall back to the flat estimate (still a
 * PLACEHOLDER either way — the scaling shape is a reasonable
 * approximation, not calibrated to real Active Aero data).
 */
export function activeAeroBenefit(
  fullThrottlePct?: number,
  sourceConfidence?: ConfidenceLevel,
): ActiveAeroBenefitResult {
  const flags = ['active_aero_flat_gain_placeholder'];
  let estimatedLapTimeGainSec = FLAT_GAIN_AT_REFERENCE_SEC;
  if (fullThrottlePct !== undefined) {
    estimatedLapTimeGainSec = round3(
      FLAT_GAIN_AT_REFERENCE_SEC * (fullThrottlePct / REFERENCE_FULL_THROTTLE_PCT),
    );
    if (sourceConfidence && sourceConfidence !== 'confirmed') {
      flags.push(`active_aero_full_throttle_source_confidence_${sourceConfidence}`);
    }
  }
  return {
    dragDeltaPct: ERS_2026_DEFAULTS.activeAeroDragDeltaPct,
    estimatedLapTimeGainSec,
    assumptionFlags: flags,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
