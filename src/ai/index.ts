/**
 * index.ts — public exports for the AI explanation module.
 */

export type {
  ConfidenceLevel,
  ExplanationMode,
  ExplanationRequest,
  ExplanationResult,
  GroundingWarning,
  MarginAnalysis,
  PitStop,
  RaceContext,
  ReferenceFact,
  Stint,
  StrategyCandidate,
  StrategyComparison,
  TyreCompound,
  WeatherCondition,
} from './types.ts';

export { buildAllowedNumbers, checkGrounding } from './grounding.ts';
export { buildPrompt, buildRecommendationPrompt, buildWhyNotAlternativePrompt } from './promptBuilder.ts';
export type { BuiltPrompt } from './promptBuilder.ts';
export { callClaudeForExplanation, DEFAULT_EXPLANATION_MODEL } from './client.ts';
export type { ClaudeCallResult } from './client.ts';
export {
  generateExplanation,
  generateRecommendationExplanation,
  generateWhyNotAlternativeExplanation,
} from './explain.ts';
