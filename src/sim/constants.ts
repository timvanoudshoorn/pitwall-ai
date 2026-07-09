/**
 * constants.ts
 * -----------------------------------------------------------------------
 * Default/fallback reference constants for the sim engine.
 *
 * OWNERSHIP NOTE: the `data` teammate owns the long-term reference-data
 * files (car classes, tracks, tier definitions). Until those exist (or
 * for any field they haven't populated yet), this file supplies
 * motorsport-realistic PLACEHOLDER defaults so every sim model is
 * runnable and testable today. Every model function accepts an optional
 * override object so real data can be swapped in later without changing
 * function signatures — see SIMLOG.md for the full list of placeholders
 * and their justification.
 *
 * Nothing in this file should be treated as ground truth from F1 25
 * telemetry unless explicitly marked CONFIRMED in SIMLOG.md.
 * -----------------------------------------------------------------------
 */

import type { TyreCompound } from '../ai/types';

export type PerformanceTierKey = 'backmarker' | 'midfield' | 'contender' | 'top_tier';

/**
 * CORRECTION (2026-07-09, per data teammate DATALOG.md): F2 likely has a
 * single Dallara chassis running unchanged 2024-2026 per FIA — the
 * originally-briefed "2024 vs 2026 F2 chassis" split is probably not
 * real in-game and has been collapsed to one `f2` key. `icons` has been
 * removed as a car-class entry entirely: Icons/legends drivers race
 * whatever team car they're recruited into in Driver Career, so they
 * consume that team's class+tier rather than having their own pace
 * table row — model this as a driver-skill layer elsewhere, not here.
 */
export type CarClassKey = 'f1_2025' | 'f1_2026_season_pack' | 'f2' | 'apxgp' | 'f1_world';

export interface TyreCompoundParams {
  gripLevel: number;
  paceOffsetVsHard: number;
  warmupLaps: number;
  linearWearRate: number;
  cliffLap: number;
  cliffWearRate: number;
  nominalLife: number;
  crossoverWetnessMin?: number;
  crossoverWetnessMax?: number;
}

/**
 * Tyre compound base characteristics (PLACEHOLDER — see SIMLOG.md #1).
 * All laptime figures are DELTAS in seconds relative to that compound's
 * own fresh-tyre (lap 1) pace, not absolute laptimes (absolute laptime is
 * track-specific and supplied by the track reference data / a base
 * laptime input).
 */
export const TYRE_COMPOUNDS: Record<TyreCompound, TyreCompoundParams> = {
  soft: {
    gripLevel: 1.0,
    paceOffsetVsHard: -0.9,
    warmupLaps: 1,
    linearWearRate: 0.085,
    cliffLap: 14,
    cliffWearRate: 0.35,
    nominalLife: 12,
  },
  medium: {
    gripLevel: 0.97,
    paceOffsetVsHard: -0.45,
    warmupLaps: 2,
    linearWearRate: 0.055,
    cliffLap: 24,
    cliffWearRate: 0.28,
    nominalLife: 20,
  },
  hard: {
    gripLevel: 0.93,
    paceOffsetVsHard: 0,
    warmupLaps: 3,
    linearWearRate: 0.035,
    cliffLap: 36,
    cliffWearRate: 0.22,
    nominalLife: 30,
  },
  intermediate: {
    gripLevel: 0.9,
    paceOffsetVsHard: 4.5, // vs hard slick, in the dry; flips negative once track is wet enough — see weather.ts
    warmupLaps: 2,
    linearWearRate: 0.05,
    cliffLap: 22,
    cliffWearRate: 0.3,
    nominalLife: 18,
    crossoverWetnessMin: 0.15,
    crossoverWetnessMax: 0.6,
  },
  wet: {
    gripLevel: 0.85,
    paceOffsetVsHard: 9.0,
    warmupLaps: 3,
    linearWearRate: 0.03,
    cliffLap: 30,
    cliffWearRate: 0.2,
    nominalLife: 25,
    crossoverWetnessMin: 0.55,
    crossoverWetnessMax: 1.0,
  },
};

/** Fuel-effect constants (PLACEHOLDER — see SIMLOG.md #2). */
export const FUEL = {
  secondsPerKg: 0.032,
  fuelBurnPerLapKg: 1.6,
  startFuelKg: 110,
  tyreWearFuelCouplingFactor: 0.15,
};

/** Pit-stop loss defaults (PLACEHOLDER — see SIMLOG.md #3). */
export const PIT_STOP = {
  defaultStationaryTimeSec: 2.4,
  defaultPitLaneDeltaSec: 18.5,
};

export interface PerformanceTierParams {
  paceOffsetSec: number;
  tyreWearMultiplier: number;
  safetyCarValueMultiplier: number;
}

/** Performance tier multipliers (PLACEHOLDER — see SIMLOG.md #4). */
export const PERFORMANCE_TIERS: Record<PerformanceTierKey, PerformanceTierParams> = {
  backmarker: { paceOffsetSec: 1.6, tyreWearMultiplier: 1.12, safetyCarValueMultiplier: 1.3 },
  midfield: { paceOffsetSec: 0.9, tyreWearMultiplier: 1.05, safetyCarValueMultiplier: 1.1 },
  contender: { paceOffsetSec: 0.35, tyreWearMultiplier: 1.0, safetyCarValueMultiplier: 1.0 },
  top_tier: { paceOffsetSec: 0, tyreWearMultiplier: 0.97, safetyCarValueMultiplier: 0.9 },
};

export interface CarClassParams {
  basePaceOffsetSec: number;
  tyreWearMultiplier: number;
  ersModel: 'legacy' | '2026' | 'none';
}

/**
 * Car-class baseline modifiers (PLACEHOLDER — see SIMLOG.md #5).
 *
 * IMPORTANT: `basePaceOffsetSec` here represents a genuine CATEGORY pace
 * gap (e.g. F2 cars are structurally slower than F1 cars regardless of
 * team quality) — it must NOT be used to encode team-quality/competitive
 * narrative (a strong or weak team within a class). That's exactly what
 * the performance-tier slider (PERFORMANCE_TIERS) is for, and stacking
 * both would double-count. Per data teammate's DATALOG.md correction
 * (2026-07-09): Konnersport, Cadillac, and APXGP all have narrative
 * competitiveness assumptions attached, but none of that belongs at the
 * class level — it's what the user's tier selection should express.
 */
export const CAR_CLASSES: Record<CarClassKey, CarClassParams> = {
  f1_2025: { basePaceOffsetSec: 0, tyreWearMultiplier: 1.0, ersModel: 'legacy' },
  f1_2026_season_pack: { basePaceOffsetSec: -0.1, tyreWearMultiplier: 0.98, ersModel: '2026' },
  // Single Dallara F2 chassis assumed to run unchanged 2024-2026 per FIA (data teammate correction).
  f2: { basePaceOffsetSec: 4.9, tyreWearMultiplier: 1.07, ersModel: 'none' },
  // No official pace baseline exists; left at parity with f1_2025, let the tier slider carry underdog/competitive narrative.
  apxgp: { basePaceOffsetSec: 0, tyreWearMultiplier: 1.0, ersModel: 'legacy' },
  // PLACEHOLDER: agreed-default (not confirmed) — F1 World is a competitively-neutral-by-design
  // mode with fixed setups in Ranked; kept at parity with f1_2025, tier slider expected to default
  // to 'midfield' for this class (see data teammate's DATALOG.md).
  f1_world: { basePaceOffsetSec: 0, tyreWearMultiplier: 1.0, ersModel: 'legacy' },
};

/** Safety car / VSC defaults (PLACEHOLDER — see SIMLOG.md #6). */
export const SAFETY_CAR_DEFAULTS = {
  genericPermanentCircuit: { scProbabilityPerRace: 0.35, vscProbabilityPerRace: 0.45 },
  genericStreetCircuit: { scProbabilityPerRace: 0.65, vscProbabilityPerRace: 0.55 },
  pitLoss: { scPitLossFactor: 0.4, vscPitLossFactor: 0.6 },
};

/** Weather defaults (PLACEHOLDER — see SIMLOG.md #7). */
export const WEATHER_DEFAULTS = {
  defaultRainProbability: 0.15,
  transitionWindowLaps: 3,
};

/**
 * ERS defaults for 2026-spec cars (PLACEHOLDER — see SIMLOG.md #8).
 *
 * CORRECTION (2026-07-09, per data teammate car-classes.json
 * regulationChanges): Overtake Mode replaces DRS entirely for 2026 cars
 * and is BATTERY-STATE-GATED, not a fixed per-race allowance of discrete
 * uses — up to 350kW available within 1s of a car at a Detection Line,
 * through to the next Activation Line, gated by remaining battery State
 * of Charge (SoC). So battery SoC across a stint is a real stateful
 * strategic resource (deplete it defending/attacking, it's unavailable
 * later), not a "push to pass" counter. Active Aero (Cornering/Straight
 * Line Mode) is automatic and zone-locked — it changes the car's
 * drag/top-speed profile per track rather than being a driver-controlled
 * lever, so there's no separate "mode" to choose for it.
 */
export const ERS_2026_DEFAULTS = {
  overtakeModeGainSec: 0.45,
  /** Battery capacity in an abstract 0-100 SoC unit (PLACEHOLDER — no in-game figure published). */
  batteryCapacitySoc: 100,
  /** SoC drained per Overtake Mode activation (PLACEHOLDER). */
  socDrainPerActivation: 12,
  /** SoC regenerated per lap under normal (non-deploying) running (PLACEHOLDER). */
  socRegenPerLap: 12,
  activeAeroDragDeltaPct: 0.12,
  deployModes: {
    qualifying: { deploymentPct: 1.0, batteryDrainMultiplier: 1.4 },
    hotlap: { deploymentPct: 0.85, batteryDrainMultiplier: 1.15 },
    balanced: { deploymentPct: 0.65, batteryDrainMultiplier: 1.0 },
    conservation: { deploymentPct: 0.4, batteryDrainMultiplier: 0.75 },
  },
};
