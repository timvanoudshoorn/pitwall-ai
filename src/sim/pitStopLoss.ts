/**
 * pitStopLoss.ts
 * -----------------------------------------------------------------------
 * Pit-stop time loss per track: time lost traversing the pit lane (vs
 * staying on the racing line at full speed) + stationary time in the box.
 *
 * Two ways to get the pit-lane component:
 *  1. Track supplies a direct `pitLaneDeltaSec` (data teammate's preferred
 *     path once they have it — usually derived from real/observed values).
 *  2. Track supplies geometry (`pitLaneLengthM`, `pitLaneSpeedLimitKph`,
 *     `racingLineSpeedKph`) and we derive the delta from first principles.
 *
 * total pit loss = pitLaneDeltaSec + stationaryTimeSec
 *
 * See SIMLOG.md #3 for placeholder defaults used when no track data is
 * supplied at all.
 * -----------------------------------------------------------------------
 */

import type { ConfidenceLevel } from '../ai/types';
import { PIT_STOP } from './constants';

export interface TrackPitLaneGeometry {
  pitLaneLengthM: number;
  pitLaneSpeedLimitKph: number;
  /** Average speed the driver would carry on the racing line over the same stretch, if not for the pit lane. */
  racingLineSpeedKph: number;
}

export interface PitStopLossOptions {
  /** Direct override — used as-is if supplied (highest priority). */
  pitLaneDeltaSec?: number;
  /** Derive pitLaneDeltaSec from geometry if pitLaneDeltaSec isn't supplied. */
  geometry?: TrackPitLaneGeometry;
  stationaryTimeSec?: number;
  /** Safety-car / VSC compress pit loss since the whole field is slowed anyway — see safetyCar.ts. */
  fieldStateFactor?: number;
  /**
   * Confidence tag for a supplied `pitLaneDeltaSec`/`geometry`, using the
   * `data` teammate's DATALOG.md convention. If not 'confirmed', a flag is
   * added to assumptionFlags so downstream consumers (the `ai` teammate's
   * explanation layer) can hedge the number instead of stating it as flat
   * fact — this is how per-value confidence propagates without needing a
   * separate confidence field on every output number.
   */
  sourceConfidence?: ConfidenceLevel;
}

export interface PitStopLossResult {
  pitLaneDeltaSec: number;
  stationaryTimeSec: number;
  totalPitLossSec: number;
  assumptionFlags: string[];
}

/** Derive pit-lane delta (seconds) from geometry: time in pit lane vs time it would've taken at racing speed. */
export function pitLaneDeltaFromGeometry(geometry: TrackPitLaneGeometry): number {
  const { pitLaneLengthM, pitLaneSpeedLimitKph, racingLineSpeedKph } = geometry;
  const pitLaneTimeSec = (pitLaneLengthM / 1000 / pitLaneSpeedLimitKph) * 3600;
  const racingLineTimeSec = (pitLaneLengthM / 1000 / racingLineSpeedKph) * 3600;
  return pitLaneTimeSec - racingLineTimeSec;
}

/**
 * Total pit-stop time loss for a track, combining pit-lane transit delta
 * and stationary time. This is the number to add once to a strategy's
 * total race time per stop (undercutOvercut.ts and strategyCompare.ts
 * both consume it).
 */
export function pitStopLoss(options: PitStopLossOptions = {}): PitStopLossResult {
  const flags: string[] = [];

  let pitLaneDeltaSec: number;
  if (options.pitLaneDeltaSec !== undefined) {
    pitLaneDeltaSec = options.pitLaneDeltaSec;
  } else if (options.geometry) {
    pitLaneDeltaSec = pitLaneDeltaFromGeometry(options.geometry);
  } else {
    pitLaneDeltaSec = PIT_STOP.defaultPitLaneDeltaSec;
    flags.push('pit_lane_delta_generic_placeholder');
  }

  const stationaryTimeSec =
    options.stationaryTimeSec ??
    (flags.push('pit_stationary_time_placeholder'), PIT_STOP.defaultStationaryTimeSec);

  const fieldStateFactor = options.fieldStateFactor ?? 1;
  if (options.fieldStateFactor !== undefined && options.fieldStateFactor !== 1) {
    flags.push('pit_loss_field_state_factor_applied');
  }

  if (options.sourceConfidence && options.sourceConfidence !== 'confirmed') {
    flags.push(`pit_loss_source_confidence_${options.sourceConfidence}`);
  }

  const totalPitLossSec = (pitLaneDeltaSec + stationaryTimeSec) * fieldStateFactor;

  return {
    pitLaneDeltaSec: round3(pitLaneDeltaSec),
    stationaryTimeSec: round3(stationaryTimeSec),
    totalPitLossSec: round3(totalPitLossSec),
    assumptionFlags: dedupe(flags),
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
