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
import type { CarClassKey, PerformanceTierKey, QualifyingFormatKey } from '../sim/constants';
import type { WeatherCondition } from '../ai/types';

export type { CarClassKey, PerformanceTierKey };

/**
 * Re-exports sim's QualifyingFormatKey rather than a parallel literal
 * union — same pattern as CarClassKey/PerformanceTierKey above. Was a
 * standalone type here until sim wired qualifying format into
 * safetyCarProbability() (SIMLOG.md #12, 2026-07-11); the literal values
 * were already identical, this just makes that guaranteed rather than
 * coincidental.
 */
export type QualifyingFormat = QualifyingFormatKey;

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

export interface RaceParameters {
  /**
   * F1 25's actual race-distance options — 25/35/50/100%, not the
   * initial scaffold's guessed 25/50/75/100% (F1 25 has no 75% option;
   * verified against real game UI/community docs 2026-07-12, flagged by
   * a real user on-device). See RaceParametersScreen.tsx.
   */
  raceLengthPct: 25 | 35 | 50 | 100;
  qualifyingFormat: QualifyingFormat;
  weather: WeatherCondition;
  rainProbabilityPct: number;
}

/**
 * Personal-pace telemetry import (sim's `importTelemetry()`, see
 * `src/sim/telemetry.ts`) — a raw lap-time log the user pastes in, kept
 * as UI-local state here the same way the rest of AppSelection is, and
 * turned into a `TelemetryImportResult` on demand by
 * `src/lib/raceSimAdapter.ts` rather than stored pre-computed (so it
 * always reflects the current class/tier/track selection it's a delta
 * against). `enabled` is a separate flag from "has lap times" so a user
 * can paste a log, see the preview, and still choose not to apply it to
 * this session's strategy comparison.
 */
export interface PersonalPaceSettings {
  enabled: boolean;
  lapTimesSec: number[];
}

export interface AppSelection {
  carClassId: CarClassKey | null;
  performanceTier: PerformanceTierKey;
  trackId: string | null;
  raceParameters: RaceParameters;
  personalPace: PersonalPaceSettings;
}
