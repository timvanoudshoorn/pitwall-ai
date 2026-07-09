/**
 * session.ts
 * -----------------------------------------------------------------------
 * UI-local selection state (car class, track, tier, race parameters) that
 * flows between visual's own screens. Deliberately built on top of the
 * key types sim/ai already settled on (CarClassKey, PerformanceTierKey,
 * TyreCompound) rather than inventing parallel ones, so no translation
 * layer is needed when sim's real functions get wired in.
 *
 * OWNERSHIP: this file is visual's. Car-class/track *display* metadata
 * (names, descriptions, flags) lives in src/mocks/ until the data
 * teammate publishes src/data/ — swap the import there when it lands.
 * -----------------------------------------------------------------------
 */
import type { CarClassKey, PerformanceTierKey } from '../sim/constants';
import type { WeatherCondition } from '../ai/types';

export type { CarClassKey, PerformanceTierKey };

export interface TrackMeta {
  id: string;
  name: string;
  country: string;
  lengthKm: number;
  laps: number;
  corners: number;
  lidarScanned: boolean;
  circuitType: 'permanent' | 'street' | 'hybrid';
  reverseLayoutAvailable: boolean;
}

export interface CarClassMeta {
  id: CarClassKey;
  name: string;
  shortName: string;
  description: string;
  tierSliderApplies: boolean;
}

export type QualifyingFormat = 'one_shot' | 'short_qualifying' | 'full_qualifying';

export interface RaceParameters {
  raceLengthPct: 25 | 50 | 75 | 100;
  qualifyingFormat: QualifyingFormat;
  weather: WeatherCondition;
  rainProbabilityPct: number;
}

export interface AppSelection {
  carClassId: CarClassKey | null;
  performanceTier: PerformanceTierKey;
  trackId: string | null;
  raceParameters: RaceParameters;
}
