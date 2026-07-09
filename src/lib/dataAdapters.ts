/**
 * dataAdapters.ts
 * -----------------------------------------------------------------------
 * Maps the data teammate's real reference files (repo-root `data/*.json`)
 * onto visual's display types (CarClassMeta / TrackMeta). This replaces
 * the hand-written placeholders that used to live in src/mocks/ now that
 * data has published real, cited research — src/mocks/ is kept only for
 * fields data's files don't cover yet (lap counts, corner counts for the
 * schematic — data's files focus on pit-loss/SC/LiDAR, not lap distance).
 *
 * Id mapping note: data's json uses 'f1_2026' / 'f1_world_car' as ids;
 * sim's CarClassKey (src/sim/constants.ts) uses 'f1_2026_season_pack' /
 * 'f1_world'. This adapter is the one place that reconciles the two so
 * screens never have to know about the mismatch.
 * -----------------------------------------------------------------------
 */
import carClassesData from '../../data/car-classes.json';
import tracksData from '../../data/tracks.json';
import type { CarClassMeta, TrackMeta } from '../types/session';
import type { CarClassKey } from '../sim/constants';
import { TRACK_LAPS_CORNERS } from '../mocks/lapsAndCorners';

const DATA_ID_TO_CAR_CLASS_KEY: Record<string, CarClassKey> = {
  f1_2025: 'f1_2025',
  f1_2026: 'f1_2026_season_pack',
  f2: 'f2',
  apxgp: 'apxgp',
  f1_world_car: 'f1_world',
};

function shortNameFor(id: CarClassKey): string {
  switch (id) {
    case 'f1_2025':
      return 'F1 2025';
    case 'f1_2026_season_pack':
      return 'F1 2026';
    case 'f2':
      return 'F2';
    case 'apxgp':
      return 'APXGP';
    case 'f1_world':
      return 'F1 World';
  }
}

/** First sentence only — data's descriptions are research prose, cards need a pit-wall-terse line. Full text still lives in data/car-classes.json for anything that wants it. */
function firstSentence(text: string): string {
  const match = text.match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : text).trim();
}

export const CAR_CLASSES: CarClassMeta[] = carClassesData.classes
  .map((c): CarClassMeta | null => {
    const id = DATA_ID_TO_CAR_CLASS_KEY[c.id];
    if (!id) return null; // 'icons' has no CarClassKey — driver-skill layer, not a class (see sim/constants.ts)
    return {
      id,
      name: c.name,
      shortName: shortNameFor(id),
      description: firstSentence(c.description),
      tierSliderApplies: true,
    };
  })
  .filter((c): c is CarClassMeta => c !== null);

function normalizeCircuitType(raw: string): TrackMeta['circuitType'] {
  const lower = raw.toLowerCase();
  const hasStreet = lower.includes('street');
  const hasPermanent = lower.includes('permanent');
  if (hasStreet && hasPermanent) return 'hybrid';
  if (hasStreet) return 'street';
  return 'permanent';
}

/** 2025 calendar only, and only circuits with a lap/corner figure on hand (see mocks/lapsAndCorners.ts). */
export const TRACKS: TrackMeta[] = tracksData.circuits
  .filter((c) => TRACK_LAPS_CORNERS[c.id])
  .map((c) => {
    const supplement = TRACK_LAPS_CORNERS[c.id];
    return {
      id: c.id,
      name: c.name,
      country: c.location.split(',').pop()?.trim() ?? c.location,
      lengthKm: supplement.lengthKm,
      laps: supplement.laps,
      corners: supplement.corners,
      lidarScanned: c.lidarScanned,
      circuitType: normalizeCircuitType(c.circuitType),
      reverseLayoutAvailable: c.reverseLayoutAvailable,
    };
  });
