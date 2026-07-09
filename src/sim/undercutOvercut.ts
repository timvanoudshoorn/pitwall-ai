/**
 * undercutOvercut.ts
 * -----------------------------------------------------------------------
 * Undercut/overcut delta calculator: given two cars of comparable base
 * pace pitting on different laps, compute the net time gained or lost by
 * the car that pits earlier (the "undercut attempt"), accounting for:
 *   - fresh tyre pace of the early pitter over the window
 *   - continued (aging) tyre pace of the late pitter over the same window
 *   - each car's pit-stop loss (paid at different points in the window)
 *   - optional out-lap penalty (pit-exit traffic/cold tyres beyond the
 *     compound's own warmup curve) and in-lap penalty (fuel-saving pace
 *     loss on the lap before a stop)
 *
 * This assumes both cars have equal underlying base pace (car
 * class/tier/track are held constant) — it isolates the tyre-age effect,
 * which is what "undercut/overcut" is actually about. If the two cars are
 * NOT equal pace, add the known per-lap pace gap to the result yourself.
 *
 * Sign convention: a positive `netDeltaSec` means the EARLY pitter comes
 * out of the window ahead (the undercut worked). A negative value means
 * the LATE pitter comes out ahead (the overcut worked).
 *
 * See SIMLOG.md #4 for the out-lap/in-lap penalty placeholders.
 * -----------------------------------------------------------------------
 */

import type { TyreCompound } from '../ai/types';
import { tyreLapTimeDelta, type DegradationOptions } from './degradation';

export interface UndercutOvercutInput {
  /** Lap the early car pits on (1-indexed; this lap becomes lap 1 on the new tyre). */
  earlyStopLap: number;
  /** Lap the late car pits on. Must be > earlyStopLap. */
  lateStopLap: number;
  /** Compound the early car fits at its stop. */
  compoundAfterEarly: TyreCompound;
  /** Compound the late car is still running (same stint as the early car was on before its stop). */
  compoundBeforeLate: TyreCompound;
  /** How many laps the late car's current tyre had already done as of earlyStopLap. */
  lapsOnTyreAtWindowStart: number;
  /** Pit-stop time loss paid by the early car (from pitStopLoss.ts). */
  pitLossSecEarly: number;
  /** Pit-stop time loss paid by the late car; defaults to pitLossSecEarly (same track). */
  pitLossSecLate?: number;
  /**
   * Extra pit-exit penalty (traffic, cold-tyre snap beyond the compound's
   * own warmup curve) applied to the early car's first lap out.
   * PLACEHOLDER default — see SIMLOG.md #4.
   */
  outLapPenaltySec?: number;
  /**
   * Fuel-saving / pace-management penalty applied to the late car's final
   * lap before its stop (the "in-lap"). PLACEHOLDER default — see
   * SIMLOG.md #4.
   */
  inLapPenaltySec?: number;
  degradationOptions?: DegradationOptions;
}

export interface UndercutOvercutResult {
  windowLaps: number;
  earlyCarWindowTimeSec: number;
  lateCarWindowTimeSec: number;
  /** Positive = undercut (early pit) wins; negative = overcut (late pit) wins. */
  netDeltaSec: number;
  verdict: 'undercut_wins' | 'overcut_wins' | 'even';
  assumptionFlags: string[];
}

const DEFAULT_OUT_LAP_PENALTY_SEC = 0.3; // PLACEHOLDER, see SIMLOG.md #4
const DEFAULT_IN_LAP_PENALTY_SEC = 0.2; // PLACEHOLDER, see SIMLOG.md #4
const EVEN_THRESHOLD_SEC = 0.15; // below this magnitude, call it a wash

export function undercutOvercutDelta(input: UndercutOvercutInput): UndercutOvercutResult {
  if (input.lateStopLap <= input.earlyStopLap) {
    throw new Error('lateStopLap must be greater than earlyStopLap');
  }
  const flags: string[] = [];
  const windowLaps = input.lateStopLap - input.earlyStopLap;
  const degOptions = input.degradationOptions ?? {};

  const outLapPenaltySec =
    input.outLapPenaltySec ??
    (flags.push('undercut_out_lap_penalty_placeholder'), DEFAULT_OUT_LAP_PENALTY_SEC);
  const inLapPenaltySec =
    input.inLapPenaltySec ??
    (flags.push('undercut_in_lap_penalty_placeholder'), DEFAULT_IN_LAP_PENALTY_SEC);
  const pitLossSecLate = input.pitLossSecLate ?? input.pitLossSecEarly;

  // Early car: fresh tyre, laps 1..windowLaps on the new compound, pit loss paid up front.
  let earlyCarWindowTimeSec = input.pitLossSecEarly;
  for (let i = 1; i <= windowLaps; i += 1) {
    const { lapTimeDeltaSec, assumptionFlags } = tyreLapTimeDelta(
      input.compoundAfterEarly,
      i,
      degOptions,
    );
    earlyCarWindowTimeSec += lapTimeDeltaSec + (i === 1 ? outLapPenaltySec : 0);
    flags.push(...assumptionFlags);
  }

  // Late car: continues aging on its current tyre for windowLaps laps, pit loss paid at the end.
  let lateCarWindowTimeSec = pitLossSecLate;
  for (let i = 1; i <= windowLaps; i += 1) {
    const lapsOnTyre = input.lapsOnTyreAtWindowStart + i;
    const { lapTimeDeltaSec, assumptionFlags } = tyreLapTimeDelta(
      input.compoundBeforeLate,
      lapsOnTyre,
      degOptions,
    );
    lateCarWindowTimeSec += lapTimeDeltaSec + (i === windowLaps ? inLapPenaltySec : 0);
    flags.push(...assumptionFlags);
  }

  const netDeltaSec = round3(lateCarWindowTimeSec - earlyCarWindowTimeSec);
  const verdict =
    Math.abs(netDeltaSec) < EVEN_THRESHOLD_SEC
      ? 'even'
      : netDeltaSec > 0
        ? 'undercut_wins'
        : 'overcut_wins';

  return {
    windowLaps,
    earlyCarWindowTimeSec: round3(earlyCarWindowTimeSec),
    lateCarWindowTimeSec: round3(lateCarWindowTimeSec),
    netDeltaSec,
    verdict,
    assumptionFlags: dedupe(flags),
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
