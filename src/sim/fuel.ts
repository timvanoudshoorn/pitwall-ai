/**
 * fuel.ts
 * -----------------------------------------------------------------------
 * Fuel-effect model: laptime delta from fuel load, and its interaction
 * with tyre wear (heavier car -> more load through the tyre -> modestly
 * higher wear rate).
 *
 * Model: linear laptime cost per kg of fuel carried (standard, widely-used
 * approximation in sim-racing strategy tools; real F1 cars are close to
 * linear across the race-fuel range). See SIMLOG.md #2 for constants.
 * -----------------------------------------------------------------------
 */

import type { ConfidenceLevel } from '../ai/types';
import { FUEL } from './constants';

export interface FuelOptions {
  startFuelKg?: number;
  /**
   * Track-specific fuel burn (kg/lap), e.g. data teammate's
   * data/track-lap-reference.json `fuelPerLapKg` (formula-derived from
   * circuit length + full-throttle %, see that file's `_meta`). Used to
   * derive `startFuelKg` as `trackFuelPerLapKg * totalLaps + reserveFuelKg`
   * when `startFuelKg` isn't supplied directly — ignored if `startFuelKg`
   * is set. Resolved 2026-07-10.
   */
  trackFuelPerLapKg?: number;
  reserveFuelKg?: number;
  secondsPerKg?: number;
  couplingFactor?: number;
  /** Confidence tag for `trackFuelPerLapKg`, propagated into assumptionFlags per the data-teammate sourceConfidence convention. */
  sourceConfidence?: ConfidenceLevel;
}

export interface FuelRemainingResult {
  fuelRemainingKg: number;
  assumptionFlags: string[];
}

/** Remaining fuel load at the start of a given lap, assuming linear burn. */
export function fuelRemaining(
  lap: number,
  totalLaps: number,
  options: FuelOptions = {},
): FuelRemainingResult {
  const flags: string[] = [];
  const reserveFuelKg = options.reserveFuelKg ?? 1.5;
  let startFuelKg: number;
  if (options.startFuelKg !== undefined) {
    startFuelKg = options.startFuelKg;
  } else if (options.trackFuelPerLapKg !== undefined) {
    startFuelKg = options.trackFuelPerLapKg * totalLaps + reserveFuelKg;
    if (options.sourceConfidence && options.sourceConfidence !== 'confirmed') {
      flags.push(`fuel_per_lap_source_confidence_${options.sourceConfidence}`);
    }
  } else {
    flags.push('fuel_start_load_placeholder');
    startFuelKg = FUEL.startFuelKg;
  }
  const burnPerLap = (startFuelKg - reserveFuelKg) / totalLaps;
  const fuelRemainingKg = Math.max(reserveFuelKg, startFuelKg - burnPerLap * (lap - 1));
  return { fuelRemainingKg: round3(fuelRemainingKg), assumptionFlags: dedupe(flags) };
}

export interface FuelLapTimeDeltaResult {
  fuelLapTimeDeltaSec: number;
  assumptionFlags: string[];
}

/** Laptime delta (seconds) from carrying `fuelKg`, vs a car running empty. */
export function fuelLapTimeDelta(
  fuelKg: number,
  options: FuelOptions = {},
): FuelLapTimeDeltaResult {
  const flags: string[] = [];
  const secondsPerKg =
    options.secondsPerKg ?? (flags.push('fuel_seconds_per_kg_placeholder'), FUEL.secondsPerKg);
  return {
    fuelLapTimeDeltaSec: round3(fuelKg * secondsPerKg),
    assumptionFlags: dedupe(flags),
  };
}

export interface FuelEffectForLapResult {
  fuelRemainingKg: number;
  fuelLapTimeDeltaSec: number;
  assumptionFlags: string[];
}

/** Combined fuel effect for a given lap of the race (convenience wrapper). */
export function fuelEffectForLap(
  lap: number,
  totalLaps: number,
  options: FuelOptions = {},
): FuelEffectForLapResult {
  const { fuelRemainingKg, assumptionFlags: f1 } = fuelRemaining(lap, totalLaps, options);
  const { fuelLapTimeDeltaSec, assumptionFlags: f2 } = fuelLapTimeDelta(fuelRemainingKg, options);
  return { fuelRemainingKg, fuelLapTimeDeltaSec, assumptionFlags: dedupe([...f1, ...f2]) };
}

export interface FuelTyreWearCouplingResult {
  tyreWearFuelMultiplier: number;
  assumptionFlags: string[];
}

/**
 * Tyre-wear coupling: extra fractional wear-rate multiplier from carrying
 * fuel above the reserve minimum. A near-empty car loads its tyres less,
 * so wear trends toward baseline (1.0) as fuel burns off.
 */
export function fuelTyreWearCoupling(
  fuelKg: number,
  startFuelKg: number,
  options: FuelOptions = {},
): FuelTyreWearCouplingResult {
  const flags: string[] = [];
  const couplingFactor =
    options.couplingFactor ??
    (flags.push('fuel_tyre_wear_coupling_placeholder'), FUEL.tyreWearFuelCouplingFactor);
  const fuelFraction = startFuelKg > 0 ? fuelKg / startFuelKg : 0;
  const tyreWearFuelMultiplier = 1 + couplingFactor * fuelFraction;
  return { tyreWearFuelMultiplier: round3(tyreWearFuelMultiplier), assumptionFlags: dedupe(flags) };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
