/**
 * raceSimAdapter.ts
 * -----------------------------------------------------------------------
 * Builds sim's `RaceSimInput` from visual's `AppSelection` UI state plus
 * data's reference files, calls `compareStrategies()`, and returns a real
 * `StrategyComparison` — the wiring that replaces ai's MOCK_CLEAR_WINNER /
 * MOCK_CLOSE_CALL fixtures on the Strategy Comparison and AI Explanation
 * screens.
 *
 * Field-by-field sourcing (see individual comments below for the
 * confidence/assumption story on each):
 *  - strategies         -> src/lib/strategyCandidates.ts (visual heuristic)
 *  - pitLossSec          -> sim.pitStopLoss() fed from data/tracks.json's pitLaneLoss
 *  - trackAbrasivenessRating -> data/track-tyre-characteristics.json
 *  - safetyCarProbabilityPct -> sim.safetyCarProbability() fed from tracks.json's
 *    safetyCarHistory.tier via a visual-owned tier->pct interpolation (NOT a
 *    data/sim-sourced number — see SAFETY_CAR_TIER_TO_PCT below)
 *  - baseLapTimeSec / baseLapTimeSourceConfidence -> data/track-lap-reference.json's
 *    referenceLapTimeSec (landed 2026-07-10, wired into sim's RaceSimInput same
 *    day) — a real per-track GP-lap-record floor value, differentiating e.g.
 *    Monaco from Silverstone instead of every track sharing sim's flat 90s
 *    fallback. Falls through to that fallback (and its assumption flag)
 *    automatically for any track missing from the reference file.
 * -----------------------------------------------------------------------
 */
import { compareStrategies, pitStopLoss, safetyCarProbability, type RaceSimInput } from '../sim';
import type { CarClassKey } from '../sim/constants';
import type { StrategyComparison } from '../ai/types';
import type { AppSelection } from '../types/session';
import { buildStrategyCandidates } from './strategyCandidates';
import tracksData from '../../data/tracks.json';
import trackTyreData from '../../data/track-tyre-characteristics.json';
import trackLapReference from '../../data/track-lap-reference.json';
import { TRACK_LAPS_CORNERS } from '../mocks/lapsAndCorners';

/** data's json uses different ids than sim's CarClassKey (src/lib/dataAdapters.ts already reconciles the display-metadata side of this same mismatch). */
const CAR_CLASS_TO_DATA_ID: Record<CarClassKey, string> = {
  f1_2025: 'f1_2025',
  f1_2026_season_pack: 'f1_2026',
  f2: 'f2',
  apxgp: 'apxgp',
  f1_world: 'f1_world_car',
};

/**
 * data/tracks.json's safetyCarHistory.tier is a qualitative label, not a
 * number — sim's safetyCarProbability() needs a percent override. This
 * mapping is visual's own interpolation of that label onto a plausible
 * 0-100 spread (anchored loosely to the one 'confirmed' figure we do have,
 * Yas Marina's ~38% at 'medium'); it is NOT a data- or sim-sourced number
 * and should not be read as more precise than the qualitative tier it
 * came from. Every use of it feeds `sourceConfidence` from tracks.json's
 * own safetyCarHistory.confidence, so downstream (ai's grounding layer)
 * still hedges correctly on anything other than 'confirmed'.
 */
const SAFETY_CAR_TIER_TO_PCT: Record<string, number> = {
  low: 15,
  low_medium: 25,
  medium: 38,
  medium_high: 50,
  high: 62,
  very_high: 80,
  unknown: 35, // falls back to sim's own generic-permanent-circuit default
};

interface TrackCircuitEntry {
  id: string;
  name: string;
  circuitType: string;
  pitLaneLoss: { seconds: number | null; confidence: 'confirmed' | 'reasonable_estimate' | 'placeholder' };
  safetyCarHistory: { tier: string; confidence: 'confirmed' | 'reasonable_estimate' | 'placeholder' };
}

const TRACK_CIRCUITS = tracksData.circuits as unknown as TrackCircuitEntry[];
const TRACK_ABRASIVENESS = trackTyreData.tracks as unknown as Record<
  string,
  { abrasivenessRating: 1 | 2 | 3 | 4 | 5 | null }
>;

interface LapReferenceEntry {
  id: string;
  referenceLapTimeSec: { value: number; confidence: 'confirmed' | 'reasonable_estimate' | 'placeholder' };
}
const TRACK_LAP_REFERENCE = trackLapReference.circuits as unknown as LapReferenceEntry[];

export class RaceSimAdapterError extends Error {}

/** Builds a real StrategyComparison from the current app selection, or throws if selection is incomplete (caller should guard with a "pick a class/track first" state). */
export function buildStrategyComparison(selection: AppSelection): StrategyComparison {
  const { carClassId, performanceTier, trackId, raceParameters } = selection;
  if (!carClassId || !trackId) {
    throw new RaceSimAdapterError('Select a car class and track before running a strategy comparison.');
  }

  const trackEntry = TRACK_CIRCUITS.find((c) => c.id === trackId);
  if (!trackEntry) {
    throw new RaceSimAdapterError(`No track reference data found for "${trackId}".`);
  }

  const lapsMeta = TRACK_LAPS_CORNERS[trackId];
  const fullDistanceLaps = lapsMeta?.laps ?? 55; // generic fallback, matches lapsAndCorners.ts's own scope note
  const totalLaps = Math.max(
    5,
    Math.round((fullDistanceLaps * raceParameters.raceLengthPct) / 100),
  );

  const isStreet = trackEntry.circuitType.toLowerCase().includes('street');
  const pit = pitStopLoss({
    pitLaneDeltaSec: trackEntry.pitLaneLoss.seconds ?? undefined,
    sourceConfidence: trackEntry.pitLaneLoss.confidence,
  });
  const sc = safetyCarProbability({
    circuitType: isStreet ? 'street' : 'permanent',
    totalLaps,
    scProbabilityPctOverride: SAFETY_CAR_TIER_TO_PCT[trackEntry.safetyCarHistory.tier],
    sourceConfidence: trackEntry.safetyCarHistory.confidence,
  });

  const abrasiveness = TRACK_ABRASIVENESS[trackId]?.abrasivenessRating ?? undefined;
  const lapReference = TRACK_LAP_REFERENCE.find((c) => c.id === trackId)?.referenceLapTimeSec;

  const input: RaceSimInput = {
    trackId,
    trackName: trackEntry.name,
    totalLaps,
    carClass: carClassId,
    performanceTier,
    weather: {
      condition: raceParameters.weather,
      rainProbabilityPct: raceParameters.rainProbabilityPct,
    },
    safetyCarProbabilityPct: sc.scProbabilityPct,
    pitLossSec: pit.totalPitLossSec,
    baseLapTimeSec: lapReference?.value,
    baseLapTimeSourceConfidence: lapReference?.confidence,
    trackAbrasivenessRating: abrasiveness,
    strategies: buildStrategyCandidates(totalLaps),
  };

  return compareStrategies(input);
}

export { CAR_CLASS_TO_DATA_ID };
