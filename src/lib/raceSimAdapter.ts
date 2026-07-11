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
import {
  compareStrategies,
  pitStopLoss,
  safetyCarProbability,
  raceGapEvolution,
  type RaceSimInput,
  type GapEvolutionResult,
} from '../sim';
import type { CarClassKey, PerformanceTierKey } from '../sim/constants';
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

/**
 * Mirrors sim's own private DEFAULT_BASE_LAP_TIME_SEC in strategyCompare.ts
 * (not exported from there). compareStrategies() can default this
 * internally when `baseLapTimeSec` is omitted from RaceSimInput, but
 * raceGapEvolution()'s GapEvolutionInput requires a concrete number — so
 * the adapter needs its own copy of the same fallback to pass through
 * explicitly. Keep in sync with strategyCompare.ts if that value changes.
 */
const FALLBACK_BASE_LAP_TIME_SEC = 90;

interface RaceSimContext {
  trackEntry: TrackCircuitEntry;
  totalLaps: number;
  carClassId: CarClassKey;
  performanceTier: PerformanceTierKey;
  weather: RaceSimInput['weather'];
  safetyCarProbabilityPct: number;
  pitLossSec: number;
  /** Real per-track figure if data has one for this track; undefined otherwise (RaceSimInput's own optional field — let compareStrategies() apply its placeholder flag). */
  baseLapTimeSec?: number;
  baseLapTimeSourceConfidence?: 'confirmed' | 'reasonable_estimate' | 'placeholder';
  /** Same value, resolved to sim's fallback constant when real data is missing — for consumers (raceGapEvolution) that require a concrete number rather than an optional one. */
  resolvedBaseLapTimeSec: number;
  trackAbrasivenessRating?: 1 | 2 | 3 | 4 | 5;
}

/**
 * Resolves the shared per-selection context (track lookup, pit loss,
 * safety-car probability, base laptime, abrasiveness) that both
 * `buildStrategyComparison()` and `buildGapEvolution()` need — kept in one
 * place so the two can never compute these inputs differently and quietly
 * disagree with each other.
 */
function resolveRaceSimContext(selection: AppSelection): RaceSimContext {
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

  return {
    trackEntry,
    totalLaps,
    carClassId,
    performanceTier,
    weather: { condition: raceParameters.weather, rainProbabilityPct: raceParameters.rainProbabilityPct },
    safetyCarProbabilityPct: sc.scProbabilityPct,
    pitLossSec: pit.totalPitLossSec,
    baseLapTimeSec: lapReference?.value,
    baseLapTimeSourceConfidence: lapReference?.confidence,
    resolvedBaseLapTimeSec: lapReference?.value ?? FALLBACK_BASE_LAP_TIME_SEC,
    trackAbrasivenessRating: abrasiveness,
  };
}

/** Builds a real StrategyComparison from the current app selection, or throws if selection is incomplete (caller should guard with a "pick a class/track first" state). */
export function buildStrategyComparison(selection: AppSelection): StrategyComparison {
  const ctx = resolveRaceSimContext(selection);

  const input: RaceSimInput = {
    trackId: ctx.trackEntry.id,
    trackName: ctx.trackEntry.name,
    totalLaps: ctx.totalLaps,
    carClass: ctx.carClassId,
    performanceTier: ctx.performanceTier,
    weather: ctx.weather,
    safetyCarProbabilityPct: ctx.safetyCarProbabilityPct,
    pitLossSec: ctx.pitLossSec,
    // The optional (possibly undefined) field, not resolvedBaseLapTimeSec — so
    // compareStrategies() applies its own 'base_lap_time_generic_placeholder'
    // assumption flag when data has no real figure for this track.
    baseLapTimeSec: ctx.baseLapTimeSec,
    baseLapTimeSourceConfidence: ctx.baseLapTimeSourceConfidence,
    trackAbrasivenessRating: ctx.trackAbrasivenessRating,
    strategies: buildStrategyCandidates(ctx.totalLaps),
  };

  return compareStrategies(input);
}

/**
 * Builds a real lap-by-lap gap-evolution series between two candidate
 * strategies (by id, as they appear in `buildStrategyComparison()`'s
 * output) via sim's `raceGapEvolution()` — same underlying per-lap trace
 * `compareStrategies()` uses, so this chart can't drift from the headline
 * numbers shown elsewhere. Throws if either id isn't one of the standard
 * candidates for this selection's race distance (shouldn't happen if the
 * ids came from a `buildStrategyComparison()` call for the same selection).
 */
export function buildGapEvolution(
  selection: AppSelection,
  candidateAId: string,
  candidateBId: string,
): GapEvolutionResult {
  const ctx = resolveRaceSimContext(selection);
  const candidates = buildStrategyCandidates(ctx.totalLaps);
  const candidateA = candidates.find((c) => c.id === candidateAId);
  const candidateB = candidates.find((c) => c.id === candidateBId);
  if (!candidateA || !candidateB) {
    throw new RaceSimAdapterError(`Could not find strategy candidates "${candidateAId}"/"${candidateBId}" for this race distance.`);
  }

  return raceGapEvolution({
    totalLaps: ctx.totalLaps,
    baseLapTimeSec: ctx.resolvedBaseLapTimeSec,
    pitLossSec: ctx.pitLossSec,
    candidateA,
    candidateB,
    degOptions: {
      carClass: ctx.carClassId,
      performanceTier: ctx.performanceTier,
      trackAbrasivenessRating: ctx.trackAbrasivenessRating,
    },
  });
}

export { CAR_CLASS_TO_DATA_ID };
