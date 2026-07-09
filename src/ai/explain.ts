/**
 * explain.ts
 * -----------------------------------------------------------------------
 * Public entry point: given a sim StrategyComparison, produce a grounded
 * natural-language explanation.
 * -----------------------------------------------------------------------
 */

import type Anthropic from '@anthropic-ai/sdk';
import { callClaudeForExplanation, DEFAULT_EXPLANATION_MODEL } from './client.ts';
import { buildAllowedNumbers, checkGrounding } from './grounding.ts';
import { buildPrompt } from './promptBuilder.ts';
import type { ExplanationRequest, ExplanationResult } from './types.ts';

export async function generateExplanation(
  client: Anthropic,
  request: ExplanationRequest,
  options: { model?: string } = {},
): Promise<ExplanationResult> {
  const { mode, comparison, compareStrategyIds, referenceFacts = [] } = request;

  const prompt = buildPrompt(mode, comparison, compareStrategyIds, referenceFacts);
  const result = await callClaudeForExplanation(client, prompt, options);

  const allowedNumbers = buildAllowedNumbers(comparison, referenceFacts, prompt.groundedExtras ?? []);
  const groundingWarnings = checkGrounding(result.text, allowedNumbers);

  if (groundingWarnings.length > 0) {
    // Non-fatal: surfaced to the caller (and worth logging) rather than
    // thrown, since this is a heuristic check that can false-positive.
    // See grounding.ts for what this catches and what it doesn't.
    console.warn(
      `[ai/explain] ${groundingWarnings.length} ungrounded number(s) detected:`,
      groundingWarnings,
    );
  }

  return {
    text: result.text,
    mode,
    groundingWarnings,
    modelUsed: result.model,
    usage: result.usage,
  };
}

export async function generateRecommendationExplanation(
  client: Anthropic,
  comparison: ExplanationRequest['comparison'],
  referenceFacts: ExplanationRequest['referenceFacts'] = [],
  options: { model?: string } = {},
): Promise<ExplanationResult> {
  return generateExplanation(
    client,
    { mode: 'recommendation', comparison, referenceFacts },
    options,
  );
}

export async function generateWhyNotAlternativeExplanation(
  client: Anthropic,
  comparison: ExplanationRequest['comparison'],
  compareStrategyIds?: [string, string],
  referenceFacts: ExplanationRequest['referenceFacts'] = [],
  options: { model?: string } = {},
): Promise<ExplanationResult> {
  return generateExplanation(
    client,
    { mode: 'why_not_alternative', comparison, compareStrategyIds, referenceFacts },
    options,
  );
}

export { DEFAULT_EXPLANATION_MODEL };
