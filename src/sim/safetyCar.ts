/**
 * safetyCar.ts
 * -----------------------------------------------------------------------
 * Safety car / VSC probability model, built per-track from historical
 * patterns when the data teammate can supply them; otherwise falls back
 * to generic permanent-circuit vs street-circuit defaults (PLACEHOLDER —
 * see SIMLOG.md #6, which also documents why this uses a Poisson-style
 * "at least one incident" model rather than a full per-lap hazard curve
 * as the first pass).
 *
 * Two things this module provides:
 *  1. A probability estimate (single race, "will there be an SC/VSC at
 *     all, and roughly when") — cheap, deterministic, good enough to
 *     drive UI displays and simple EV weighting.
 *  2. A Monte Carlo scenario generator for when a caller (typically
 *     strategyCompare's future EV mode, or weather.ts) wants to run many
 *     randomized race scenarios rather than a single expected value.
 *
 * IMPORTANT LIMITATION (documented, not hidden): this models "does an SC
 * happen and when" per race, not per-track lap-by-lap incident hazard
 * (e.g. first-lap pileup risk vs late-race risk). That refinement is a
 * good next iteration once the data teammate has historical per-track,
 * per-lap-bucket incident data.
 * -----------------------------------------------------------------------
 */

import type { ConfidenceLevel } from '../ai/types';
import { SAFETY_CAR_DEFAULTS } from './constants';

export type CircuitType = 'permanent' | 'street';

export interface SafetyCarProbabilityInput {
  circuitType?: CircuitType;
  totalLaps: number;
  /** Direct override (0-100) if the data teammate supplies a track-specific historical figure. */
  scProbabilityPctOverride?: number;
  vscProbabilityPctOverride?: number;
  /**
   * Confidence tag for the overrides above, per the `data` teammate's
   * DATALOG.md convention (confirmed / reasonable_estimate / placeholder
   * — e.g. as of 2026-07-09 only Singapore and Abu Dhabi are 'confirmed'
   * in tracks.json, everything else is 'reasonable_estimate'). Anything
   * other than 'confirmed' is added to assumptionFlags so the `ai`
   * teammate can hedge the stated probability instead of presenting it
   * as flat fact.
   */
  sourceConfidence?: ConfidenceLevel;
}

export interface SafetyCarProbabilityResult {
  scProbabilityPct: number;
  vscProbabilityPct: number;
  /** Expected number of SC periods in the race (Poisson lambda), derived from scProbabilityPct. */
  expectedScPeriods: number;
  assumptionFlags: string[];
}

/**
 * P(at least one SC) = scProbabilityPct/100. Convert to Poisson lambda via
 * lambda = -ln(1 - p), the standard "at least one event" <-> rate
 * relationship, so downstream Monte Carlo sampling has an internally
 * consistent rate to draw from.
 */
export function safetyCarProbability(input: SafetyCarProbabilityInput): SafetyCarProbabilityResult {
  const flags: string[] = [];
  const defaults =
    input.circuitType === 'street'
      ? SAFETY_CAR_DEFAULTS.genericStreetCircuit
      : SAFETY_CAR_DEFAULTS.genericPermanentCircuit;
  if (!input.circuitType) flags.push('safety_car_circuit_type_unknown_defaulted_permanent');

  const scProbabilityPct =
    input.scProbabilityPctOverride ??
    (flags.push('safety_car_probability_generic_placeholder'), defaults.scProbabilityPerRace * 100);
  const vscProbabilityPct =
    input.vscProbabilityPctOverride ??
    (flags.push('vsc_probability_generic_placeholder'), defaults.vscProbabilityPerRace * 100);

  if (input.sourceConfidence && input.sourceConfidence !== 'confirmed') {
    flags.push(`safety_car_source_confidence_${input.sourceConfidence}`);
  }

  const p = Math.min(0.999, Math.max(0, scProbabilityPct / 100));
  const expectedScPeriods = round3(-Math.log(1 - p));

  return {
    scProbabilityPct: round3(scProbabilityPct),
    vscProbabilityPct: round3(vscProbabilityPct),
    expectedScPeriods,
    assumptionFlags: dedupe(flags),
  };
}

export interface SafetyCarScenario {
  scOccurs: boolean;
  scStartLap: number | null;
  scDurationLaps: number | null;
  vscOccurs: boolean;
  vscStartLap: number | null;
  vscDurationLaps: number | null;
}

export interface MonteCarloOptions {
  numScenarios: number;
  totalLaps: number;
  expectedScPeriods: number;
  vscProbabilityPct: number;
  /** Deterministic seed for reproducible tests; falls back to Math.random if omitted. */
  rng?: () => number;
}

const SC_DURATION_LAPS_RANGE: [number, number] = [3, 6]; // PLACEHOLDER, see SIMLOG.md #6
const VSC_DURATION_LAPS_RANGE: [number, number] = [1, 3]; // PLACEHOLDER, see SIMLOG.md #6
const INCIDENT_START_LAP_MIN_FRACTION = 0.05; // skip the first few laps (formation/lap-1 chaos handled separately if ever added)

/**
 * Monte Carlo scenario generator: draws `numScenarios` independent
 * race-incident scenarios. Occurrence is modeled as a single Bernoulli
 * draw per race from the Poisson "at least one" probability (not a full
 * per-lap point process) — a reasonable first pass; see module doc.
 */
export function generateSafetyCarScenarios(options: MonteCarloOptions): SafetyCarScenario[] {
  const rng = options.rng ?? Math.random;
  const pSc = 1 - Math.exp(-options.expectedScPeriods);
  const pVsc = options.vscProbabilityPct / 100;

  const scenarios: SafetyCarScenario[] = [];
  for (let i = 0; i < options.numScenarios; i += 1) {
    const scOccurs = rng() < pSc;
    const vscOccurs = rng() < pVsc;

    const scStartLap = scOccurs ? randomLap(options.totalLaps, rng) : null;
    const scDurationLaps = scOccurs ? randomInt(SC_DURATION_LAPS_RANGE, rng) : null;
    const vscStartLap = vscOccurs ? randomLap(options.totalLaps, rng) : null;
    const vscDurationLaps = vscOccurs ? randomInt(VSC_DURATION_LAPS_RANGE, rng) : null;

    scenarios.push({ scOccurs, scStartLap, scDurationLaps, vscOccurs, vscStartLap, vscDurationLaps });
  }
  return scenarios;
}

export interface PitUnderCautionInput {
  /** Green-flag total pit loss (seconds), from pitStopLoss.ts. */
  greenFlagPitLossSec: number;
  cautionType: 'sc' | 'vsc';
}

export interface PitUnderCautionResult {
  cautionPitLossSec: number;
  savingsVsGreenSec: number;
  assumptionFlags: string[];
}

/** Reduced pit loss when a stop is taken under SC/VSC, since the whole field is slowed. */
export function pitLossUnderCaution(input: PitUnderCautionInput): PitUnderCautionResult {
  const factor =
    input.cautionType === 'sc'
      ? SAFETY_CAR_DEFAULTS.pitLoss.scPitLossFactor
      : SAFETY_CAR_DEFAULTS.pitLoss.vscPitLossFactor;
  const cautionPitLossSec = round3(input.greenFlagPitLossSec * factor);
  return {
    cautionPitLossSec,
    savingsVsGreenSec: round3(input.greenFlagPitLossSec - cautionPitLossSec),
    assumptionFlags: ['safety_car_pit_loss_factor_placeholder'],
  };
}

export interface TierAdjustedCautionValueInput {
  savingsVsGreenSec: number;
  tierSafetyCarValueMultiplier: number;
}

/**
 * Tier-adjusted "value" of a caution-period pit stop: track position
 * matters more for a car that can't easily pass on raw pace, so a
 * Backmarker's effective value of a free/cheap stop is scaled up relative
 * to a Top Tier car's (see PERFORMANCE_TIERS.safetyCarValueMultiplier,
 * SIMLOG.md #9). This is a relative weighting for strategy EV comparison,
 * not a literal time value.
 */
export function tierAdjustedCautionValue(input: TierAdjustedCautionValueInput): number {
  return round3(input.savingsVsGreenSec * input.tierSafetyCarValueMultiplier);
}

function randomLap(totalLaps: number, rng: () => number): number {
  const minLap = Math.ceil(totalLaps * INCIDENT_START_LAP_MIN_FRACTION);
  return minLap + Math.floor(rng() * (totalLaps - minLap));
}
function randomInt([min, max]: [number, number], rng: () => number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
