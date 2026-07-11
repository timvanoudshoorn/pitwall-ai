/**
 * types.ts
 * -----------------------------------------------------------------------
 * Shape of the data this module consumes and produces.
 *
 * OWNERSHIP NOTE: `StrategyComparison` (and its nested types) describes
 * what the `sim` teammate's strategy-comparison output looks like. It is
 * a DRAFT/PROPOSED shape, agreed asynchronously while sim was still
 * standing up their engine (see AILOG.md "Data shape reconciliation").
 * Treat this file as the single source of truth for "what fields am I
 * allowed to reference in an explanation" — if a fact isn't represented
 * here, the explanation code must not invent it.
 *
 * `ReferenceFact` models grounding context optionally supplied by the
 * `data` teammate (e.g. "what changed about ERS in the 2026 pack"), each
 * tagged with the confidence level from their DATALOG.md convention
 * (confirmed / reasonable_estimate / placeholder) so explanations can
 * caveat appropriately instead of stating everything as flat fact.
 * -----------------------------------------------------------------------
 */

import type { TelemetryImportResult } from '../sim/telemetry.ts';

export type TyreCompound = 'soft' | 'medium' | 'hard' | 'intermediate' | 'wet';

export type WeatherCondition = 'dry' | 'damp' | 'wet' | 'mixed';

export type ConfidenceLevel = 'confirmed' | 'reasonable_estimate' | 'placeholder';

export interface RaceContext {
  trackId: string;
  trackName: string;
  totalLaps: number;
  carClass: string;
  performanceTier: 'backmarker' | 'midfield' | 'contender' | 'top_tier';
  weather: {
    condition: WeatherCondition;
    rainProbabilityPct: number;
  };
  safetyCarProbabilityPct: number;
}

export interface Stint {
  compound: TyreCompound;
  startLap: number;
  endLap: number;
  lapsOnTyre: number;
  estimatedTyreLifeLaps: number;
}

export interface PitStop {
  lap: number;
  pitLossSeconds: number;
}

export interface StrategyCandidate {
  id: string;
  numStops: number;
  stints: Stint[];
  pitStops: PitStop[];
  predictedTotalRaceTimeSeconds: number;
  deltaToBestSeconds: number;
  /** sim's own confidence signal for this candidate, if supplied. */
  confidence?: 'high' | 'medium' | 'low';
}

export interface MarginAnalysis {
  closestPairIds: [string, string];
  deltaSeconds: number;
  isCloseCall: boolean;
}

export interface StrategyComparison {
  raceContext: RaceContext;
  strategies: StrategyCandidate[];
  recommendedStrategyId: string;
  marginAnalysis: MarginAnalysis;
  /** Identifiers of placeholder/assumed models used to produce this comparison. */
  assumptionsUsed: string[];
}

/** Grounding context optionally supplied by the `data` teammate. */
export interface ReferenceFact {
  topic: string;
  fact: string;
  confidence: ConfidenceLevel;
  source?: string;
}

export type ExplanationMode = 'recommendation' | 'why_not_alternative';

export interface ExplanationRequest {
  mode: ExplanationMode;
  comparison: StrategyComparison;
  /** Required for mode === 'why_not_alternative'. Defaults to the two closest candidates. */
  compareStrategyIds?: [string, string];
  referenceFacts?: ReferenceFact[];
  /**
   * Optional: sim's `importTelemetry()` result (see `sim/telemetry.ts`),
   * if the user has recalibrated pace from their own recorded laps and
   * that recalibration was applied to THIS comparison (i.e.
   * `assumptionsUsed` contains `personal_pace_telemetry_applied`). When
   * present, the prompt includes a PERSONAL PACE fact block and its
   * numbers are added to the grounding allow-list — see
   * `telemetryFacts.ts`. Left undefined for a comparison that wasn't
   * telemetry-recalibrated; nothing telemetry-specific is added.
   */
  telemetryContext?: TelemetryImportResult;
}

export interface GroundingWarning {
  token: string;
  context: string;
}

export interface ExplanationResult {
  text: string;
  mode: ExplanationMode;
  /** Numbers found in the generated text that could not be traced to input facts. */
  groundingWarnings: GroundingWarning[];
  modelUsed: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}
