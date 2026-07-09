/**
 * mechanismFacts.ts
 * -----------------------------------------------------------------------
 * Derives an undercut/overcut "mechanism" fact for the why-not-alternative
 * explanation mode, by calling sim's undercutOvercutDelta() directly with
 * inputs read off the two candidates being compared — per the approach
 * agreed with sim: call their function directly with the two candidates'
 * pit laps/compounds rather than asking StrategyComparison to grow a new
 * field for a value that's specific to a *pair* of candidates, not a
 * property of one strategy.
 *
 * Only applicable when the two candidates are directly comparable on
 * pit-lap timing: same number of stops, same compound sequence, and the
 * comparison boils down to "same plan, pits earlier or later." If that
 * doesn't hold (different stop counts, different compound choices), this
 * returns null and the why-not-alternative prompt falls back to its
 * existing tyre-life/pace-only comparison — it does NOT try to force an
 * undercut/overcut framing onto a case that isn't one.
 * -----------------------------------------------------------------------
 */

import { undercutOvercutDelta, type UndercutOvercutResult } from '../sim/undercutOvercut';
import type { StrategyCandidate, StrategyComparison } from './types.ts';

export interface UndercutOvercutMechanism {
  earlyCandidateId: string;
  lateCandidateId: string;
  earlyStopLap: number;
  lateStopLap: number;
  result: UndercutOvercutResult;
}

/** True if two candidates share the same stop count and compound sequence (only pit-lap timing differs). */
function sameShapeDifferentTiming(a: StrategyCandidate, b: StrategyCandidate): boolean {
  if (a.numStops !== b.numStops) return false;
  if (a.stints.length !== b.stints.length) return false;
  return a.stints.every((s, i) => s.compound === b.stints[i].compound);
}

/**
 * Find the first stint boundary where the two candidates' pit laps diverge
 * and derive an undercut/overcut mechanism for that specific stop, if the
 * two candidates are otherwise the same plan (see sameShapeDifferentTiming).
 */
export function deriveUndercutOvercutMechanism(
  comparison: StrategyComparison,
  idA: string,
  idB: string,
): UndercutOvercutMechanism | null {
  const a = comparison.strategies.find((s) => s.id === idA);
  const b = comparison.strategies.find((s) => s.id === idB);
  if (!a || !b) return null;
  if (!sameShapeDifferentTiming(a, b)) return null;

  // Find the first stint index where the pit lap (this stint's endLap, i.e.
  // where the NEXT stop happens) differs between the two candidates.
  let divergentIdx = -1;
  for (let i = 0; i < a.stints.length - 1; i += 1) {
    if (a.stints[i].endLap !== b.stints[i].endLap) {
      divergentIdx = i;
      break;
    }
  }
  if (divergentIdx === -1) return null; // identical pit laps too — nothing to explain

  const stopLapA = a.stints[divergentIdx].endLap;
  const stopLapB = b.stints[divergentIdx].endLap;
  if (stopLapA === stopLapB) return null;

  const [earlyCandidate, lateCandidate, earlyStopLap, lateStopLap] =
    stopLapA < stopLapB ? [a, b, stopLapA, stopLapB] : [b, a, stopLapB, stopLapA];

  const compoundAfterEarly = earlyCandidate.stints[divergentIdx + 1]?.compound;
  const compoundBeforeLate = lateCandidate.stints[divergentIdx].compound;
  if (!compoundAfterEarly) return null;

  const stintStartLap = earlyCandidate.stints[divergentIdx].startLap;
  const lapsOnTyreAtWindowStart = earlyStopLap - stintStartLap;

  const pitLossSecEarly = earlyCandidate.pitStops[divergentIdx]?.pitLossSeconds;
  const pitLossSecLate = lateCandidate.pitStops[divergentIdx]?.pitLossSeconds;
  if (pitLossSecEarly === undefined) return null;

  const result = undercutOvercutDelta({
    earlyStopLap,
    lateStopLap,
    compoundAfterEarly,
    compoundBeforeLate,
    lapsOnTyreAtWindowStart,
    pitLossSecEarly,
    pitLossSecLate,
  });

  return {
    earlyCandidateId: earlyCandidate.id,
    lateCandidateId: lateCandidate.id,
    earlyStopLap,
    lateStopLap,
    result,
  };
}

export function formatMechanismFact(mechanism: UndercutOvercutMechanism): string {
  const { earlyCandidateId, lateCandidateId, earlyStopLap, lateStopLap, result } = mechanism;
  const verdictLine =
    result.verdict === 'undercut_wins'
      ? `the undercut wins the window by ${Math.abs(result.netDeltaSec)}s`
      : result.verdict === 'overcut_wins'
        ? `the overcut wins the window by ${Math.abs(result.netDeltaSec)}s`
        : 'the window is essentially a wash';
  const caveats = result.assumptionFlags.length > 0
    ? ` (uses placeholder assumptions: ${result.assumptionFlags.join(', ')})`
    : '';
  return `
UNDERCUT/OVERCUT MECHANISM (from sim's undercutOvercutDelta, isolating just the pit-timing window):
- "${earlyCandidateId}" pits early on lap ${earlyStopLap}; "${lateCandidateId}" pits late on lap ${lateStopLap} (window: ${result.windowLaps} laps).
- Early car's time across the window: ${result.earlyCarWindowTimeSec}s. Late car's time across the same window: ${result.lateCarWindowTimeSec}s.
- Window result: ${verdictLine} (netDeltaSec: ${result.netDeltaSec}, positive favors the early pitter).${caveats}
- IMPORTANT: this netDeltaSec is the effect isolated to just the ${result.windowLaps}-lap pit-timing
  window, NOT the full-race outcome — it does not include what happens on the rest of each stint
  afterward (e.g. a fresher tyre on the remaining laps can claw some of this back). Do not state
  this window number as if it were the strategies' overall race-time difference; the FACTS block's
  "Delta to best strategy" figures are the full-race numbers. If both are worth citing, be explicit
  that one is a window-isolated effect and the other is the full-race result.
`.trim();
}
