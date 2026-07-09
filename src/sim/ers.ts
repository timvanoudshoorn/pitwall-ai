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
 * Active Aero drag-reduction benefit, expressed as a flat per-lap
 * estimate. A track-length/straight-proportion-aware version should
 * replace this once the data teammate has track-specific straight-line
 * percentage data.
 */
export function activeAeroBenefit(): ActiveAeroBenefitResult {
  return {
    dragDeltaPct: ERS_2026_DEFAULTS.activeAeroDragDeltaPct,
    estimatedLapTimeGainSec: 0.25, // PLACEHOLDER flat estimate, see SIMLOG.md #8
    assumptionFlags: ['active_aero_flat_gain_placeholder'],
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
