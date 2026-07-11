/**
 * trackLapReference.ts
 * -----------------------------------------------------------------------
 * Single parse point for data/track-lap-reference.json — shared by
 * dataAdapters.ts (TrackMeta's lengthKm/laps/corners for the Select
 * screen) and raceSimAdapter.ts (totalLaps + baseLapTimeSec for the sim
 * engine), so there's exactly one lookup rather than two independent
 * ones that could drift.
 *
 * Retires src/mocks/lapsAndCorners.ts (2026-07-11): that hand-written
 * supplement was missing shanghai/madring entirely (silently dropped by
 * dataAdapters.ts's `.filter((c) => TRACK_LAPS_CORNERS[c.id])`) and had a
 * stale Barcelona corner count (16, pre-2023 layout — F1's had a
 * 14-corner final sector since the 2023 Spanish GP). data added a
 * `corners` field to track-lap-reference.json for all 25 circuits
 * (commit 8a54958, source-verified for Shanghai/Barcelona) specifically
 * to close that gap — see CLAUDE.md's "swap for src/data's real
 * reference files wholesale" guidance. Flagged by data + coordinator
 * 2026-07-11.
 * -----------------------------------------------------------------------
 */
import trackLapReferenceData from '../../data/track-lap-reference.json';

interface ConfidenceValue<T> {
  value: T;
  confidence: 'confirmed' | 'reasonable_estimate' | 'placeholder';
  basis?: string;
  source?: string;
}

export interface TrackLapReferenceEntry {
  id: string;
  raceDistanceKm: number;
  raceLaps: ConfidenceValue<number>;
  circuitLengthKm: number;
  referenceLapTimeSec: ConfidenceValue<number>;
  fullThrottlePct: ConfidenceValue<number>;
  fuelPerLapKg: ConfidenceValue<number>;
  overtakingDifficulty: ConfidenceValue<string> & { tier: string };
  corners: ConfidenceValue<number>;
}

const CIRCUITS = trackLapReferenceData.circuits as unknown as TrackLapReferenceEntry[];

const BY_ID: Record<string, TrackLapReferenceEntry> = Object.fromEntries(CIRCUITS.map((c) => [c.id, c]));

export function getTrackLapReference(trackId: string): TrackLapReferenceEntry | undefined {
  return BY_ID[trackId];
}

export { CIRCUITS as TRACK_LAP_REFERENCE_CIRCUITS };
