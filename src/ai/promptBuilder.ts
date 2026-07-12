/**
 * promptBuilder.ts
 * -----------------------------------------------------------------------
 * Turns a StrategyComparison (sim's output) into the system + user prompt
 * sent to Claude. This is the load-bearing file for grounding: the
 * strategy here is "hand the model a closed, serialized fact set and
 * forbid it from using anything else" rather than "describe the
 * situation in prose and hope it doesn't embellish."
 *
 * See AILOG.md for why this approach was chosen over alternatives.
 * -----------------------------------------------------------------------
 */

import { deriveUndercutOvercutMechanism, formatMechanismFact } from './mechanismFacts.ts';
import { formatTelemetryFact } from './telemetryFacts.ts';
import type {
  ExplanationMode,
  ReferenceFact,
  StrategyCandidate,
  StrategyComparison,
} from './types.ts';
import type { TelemetryImportResult } from '../sim/telemetry.ts';

const GROUNDING_RULES = `
GROUNDING RULES — these override any instinct to sound more complete or authoritative:
1. You may only state a number (lap, second, percentage, tyre-life figure) if it appears
   verbatim in the FACTS block below. Never compute, round beyond what's given, average,
   or infer a number that isn't already present as a field.
2. Never invent a historical claim, a fact about the track, a fact about a car class or
   tyre compound, or a safety-car/weather pattern unless it appears in FACTS or
   REFERENCE CONTEXT below. If you don't have a grounded reason for something, describe
   the tradeoff qualitatively instead of making up a justification.
3. Any fact tagged confidence: "placeholder" or "reasonable_estimate" in REFERENCE CONTEXT
   must be caveated in your explanation (e.g. "based on an estimated pit-loss figure") —
   do not present it with the same certainty as a "confirmed" fact or a number that came
   directly from the simulation.
4. If two strategies are within a small margin (see marginAnalysis.isCloseCall), do not
   manufacture false confidence. Say plainly that it's close and explain the tradeoff
   rather than declaring a decisive winner.
5. Do not restate every field in the FACTS block — select what's relevant to the
   explanation. Grounding means "never say something false," not "recite everything."
6. raceContext.weather.rainProbabilityPct and raceContext.safetyCarProbabilityPct are
   PROBABILITIES over the whole race, not a forecast of which lap rain falls or a safety
   car is deployed. Never state or imply a specific lap or lap range for when rain will
   arrive or a safety car will be called (e.g. never say "when it starts raining around
   lap 20" or "the safety car will come out in the second stint") — describe it as a
   likelihood/contingency instead ("if rain arrives," "given the elevated safety-car
   probability this race"), and only pair it with a specific lap if the strategy candidate
   itself is described as a reactive/contingency plan already keyed to that lap.
7. If a PERSONAL PACE block is present, it means the predicted times in FACTS already reflect
   this driver's own recorded pace, applied identically to every candidate. Never claim it
   explains why one strategy beats another, and never claim tyre-wear or fuel behavior was
   personalized — see the block's own IMPORTANT note.
`.trim();

const PERSONA = `
You are a Formula 1 race engineer explaining a strategy call over the radio/pit-wall
briefing, to a driver or team principal who trusts your numbers. Tone: direct, confident
where the data supports it, honest about uncertainty where it doesn't. No marketing
language, no hedging filler ("it's worth noting that..."), no bullet-point recitation of
every field — talk the way an engineer actually talks when justifying a call.

Structure: lead with the call itself, in one line, before the reasoning — "Box lap 35 for
the hard," not "based on our analysis, we recommend...". The decision comes first; the why
comes after, in the fewest sentences that actually earn it. Use real pit-wall vocabulary
where it's genuinely accurate to the situation in FACTS — box, undercut/overcut, pit window,
box wall, cover, track position, tyre cliff — but only when the FACTS actually describe that
mechanism; don't reach for jargon that isn't earned by the numbers in front of you. Write
like you're talking to someone who will act on this in the next thirty seconds, not like
you're filing a report: short clauses, no throat-clearing, no restating the question back.
A close call gets said as a close call in plain terms ("that's a coin-flip, not a knockout"),
not softened into vague hedging or inflated into false confidence either way.
`.trim();

function formatStint(s: StrategyCandidate['stints'][number]): string {
  return `${s.compound} tyres, laps ${s.startLap}-${s.endLap} (${s.lapsOnTyre} laps run, estimated life ${s.estimatedTyreLifeLaps} laps)`;
}

function formatCandidate(c: StrategyCandidate, isRecommended: boolean): string {
  const lines = [
    `Strategy "${c.id}"${isRecommended ? ' [RECOMMENDED]' : ''}: ${c.numStops}-stop`,
    `  Stints: ${c.stints.map(formatStint).join(' | ')}`,
    `  Pit stops: ${c.pitStops.map((p) => `lap ${p.lap} (${p.pitLossSeconds}s loss)`).join(', ') || 'none'}`,
    `  Predicted total race time: ${c.predictedTotalRaceTimeSeconds}s`,
    `  Delta to best strategy: ${c.deltaToBestSeconds === 0 ? '0s (this is the fastest)' : `+${c.deltaToBestSeconds}s`}`,
  ];
  if (c.confidence) lines.push(`  Sim confidence: ${c.confidence}`);
  return lines.join('\n');
}

function formatReferenceFacts(facts: ReferenceFact[]): string {
  if (facts.length === 0) return '(none supplied)';
  return facts
    .map((f) => `- [${f.confidence}] ${f.topic}: ${f.fact}${f.source ? ` (source: ${f.source})` : ''}`)
    .join('\n');
}

function formatFacts(comparison: StrategyComparison, focusIds?: string[]): string {
  const { raceContext, strategies, recommendedStrategyId, marginAnalysis, assumptionsUsed } =
    comparison;
  const relevant = focusIds ? strategies.filter((s) => focusIds.includes(s.id)) : strategies;

  return `
RACE CONTEXT:
- Track: ${raceContext.trackName} (${raceContext.totalLaps} laps)
- Car class: ${raceContext.carClass}, performance tier: ${raceContext.performanceTier}
- Weather: ${raceContext.weather.condition}, rain probability ${raceContext.weather.rainProbabilityPct}%
- Safety car probability: ${raceContext.safetyCarProbabilityPct}%

STRATEGY CANDIDATES:
${relevant.map((s) => formatCandidate(s, s.id === recommendedStrategyId)).join('\n\n')}

MARGIN ANALYSIS:
- Closest pair: ${marginAnalysis.closestPairIds.join(' vs ')}
- Delta: ${marginAnalysis.deltaSeconds}s
- Flagged as a close call: ${marginAnalysis.isCloseCall}

ASSUMPTIONS/PLACEHOLDERS USED BY THE SIMULATION (caveat anything that traces to these):
${assumptionsUsed.length > 0 ? assumptionsUsed.map((a) => `- ${a}`).join('\n') : '(none flagged)'}
`.trim();
}

export interface BuiltPrompt {
  system: string;
  user: string;
  /**
   * Extra grounded data objects (e.g. an undercutOvercutDelta() result)
   * that were computed to build this prompt and cited in it, but don't
   * live inside the StrategyComparison object itself. The grounding
   * checker needs these too so it doesn't flag their numbers as
   * ungrounded — see explain.ts.
   */
  groundedExtras?: unknown[];
}

export function buildRecommendationPrompt(
  comparison: StrategyComparison,
  referenceFacts: ReferenceFact[] = [],
  telemetryContext?: TelemetryImportResult,
): BuiltPrompt {
  const telemetryBlock = telemetryContext ? `\n\n${formatTelemetryFact(telemetryContext)}` : '';
  const system = `${PERSONA}\n\n${GROUNDING_RULES}`;
  const user = `
Explain why the recommended strategy is the right call, using only the facts below.
If the margin analysis shows a close call, be honest about that rather than overstating
confidence. Keep it to a tight pit-wall-style briefing — a few sentences to a short
paragraph, not an exhaustive report.

FACTS:
${formatFacts(comparison)}${telemetryBlock}

REFERENCE CONTEXT (background facts you may cite, each with a confidence level):
${formatReferenceFacts(referenceFacts)}
`.trim();
  return { system, user, groundedExtras: telemetryContext ? [telemetryContext] : undefined };
}

export function buildWhyNotAlternativePrompt(
  comparison: StrategyComparison,
  compareStrategyIds: [string, string],
  referenceFacts: ReferenceFact[] = [],
  telemetryContext?: TelemetryImportResult,
): BuiltPrompt {
  const [idA, idB] = compareStrategyIds;
  const strategyA = comparison.strategies.find((s) => s.id === idA);
  const strategyB = comparison.strategies.find((s) => s.id === idB);
  if (!strategyA || !strategyB) {
    throw new Error(
      `buildWhyNotAlternativePrompt: strategy id not found in comparison (${idA}, ${idB})`,
    );
  }
  const winnerId =
    strategyA.deltaToBestSeconds <= strategyB.deltaToBestSeconds ? strategyA.id : strategyB.id;
  const loserId = winnerId === strategyA.id ? strategyB.id : strategyA.id;

  // If the two candidates are the same plan differing only in pit-lap
  // timing, compute the actual undercut/overcut mechanism from sim's
  // model instead of leaving the model to reason about pit timing
  // qualitatively. Null when not applicable (e.g. different stop counts
  // or compound choices) — the prompt falls back to the general framing.
  const mechanism = deriveUndercutOvercutMechanism(comparison, idA, idB);
  const mechanismBlock = mechanism ? `\n\n${formatMechanismFact(mechanism)}` : '';
  const telemetryBlock = telemetryContext ? `\n\n${formatTelemetryFact(telemetryContext)}` : '';

  const system = `${PERSONA}\n\n${GROUNDING_RULES}`;
  const user = `
Compare strategy "${winnerId}" against strategy "${loserId}" and explain specifically what
the "${loserId}" strategy gets wrong, or — if the margin analysis shows this is a close
call — explain honestly that it's a genuine tradeoff rather than a clear mistake. Reference
only the two strategies below; don't discuss other candidates. Keep it tight: a few
sentences on the specific mechanism (undercut/overcut timing, tyre life at the pit lap,
compound choice under the given weather/safety-car odds) rather than a generic "strategy A
is faster" statement.${mechanism ? ' An UNDERCUT/OVERCUT MECHANISM block is included below — use its verdict and numbers directly rather than reasoning about pit timing qualitatively.' : ''}

FACTS:
${formatFacts(comparison, [idA, idB])}${mechanismBlock}${telemetryBlock}

REFERENCE CONTEXT (background facts you may cite, each with a confidence level):
${formatReferenceFacts(referenceFacts)}
`.trim();
  const groundedExtras = [
    ...(mechanism ? [mechanism.result] : []),
    ...(telemetryContext ? [telemetryContext] : []),
  ];
  return { system, user, groundedExtras: groundedExtras.length > 0 ? groundedExtras : undefined };
}

export function buildPrompt(
  mode: ExplanationMode,
  comparison: StrategyComparison,
  compareStrategyIds: [string, string] | undefined,
  referenceFacts: ReferenceFact[] = [],
  telemetryContext?: TelemetryImportResult,
): BuiltPrompt {
  if (mode === 'recommendation') {
    return buildRecommendationPrompt(comparison, referenceFacts, telemetryContext);
  }
  const ids = compareStrategyIds ?? comparison.marginAnalysis.closestPairIds;
  return buildWhyNotAlternativePrompt(comparison, ids, referenceFacts, telemetryContext);
}
