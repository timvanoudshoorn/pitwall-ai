/**
 * templateExplain.ts
 * -----------------------------------------------------------------------
 * Deterministic, non-LLM explanation generator. Exists because there is
 * currently no safe place to hold the Claude API key in the Vite browser
 * bundle (see client.ts's deployment note) — until that infra decision
 * lands, THIS is what the user actually reads on the AI Explanation
 * screen, not a live model response. That makes its prose quality a real
 * product surface, not a throwaway placeholder: it's the thing "insanely
 * good" gets judged against right now.
 *
 * Same discipline as the prompt-based path: every clause traces to a real
 * field on StrategyComparison / ReferenceFact / TelemetryImportResult /
 * UndercutOvercutMechanism. Nothing here is free text pulled from
 * nowhere — the *phrasing* is hand-written for voice, but the *content*
 * it's phrasing is always a real number or a real tier value read off
 * real data, same as every conditional branch in the prompt-based path.
 *
 * Ownership note: the actual call site (AIExplanationScreen.tsx) is
 * visual's file — this module only exports the generator function so
 * visual can call it, per the same "ai owns explanation content, visual
 * owns the screen" boundary as everywhere else in this module.
 * -----------------------------------------------------------------------
 */

import { deriveUndercutOvercutMechanism } from './mechanismFacts.ts';
import type {
  ExplanationMode,
  ReferenceFact,
  StrategyCandidate,
  StrategyComparison,
  TyreCompound,
} from './types.ts';

interface TelemetryLike {
  personalPaceOffsetSec: number;
  confidence: 'high' | 'medium' | 'low';
}

const COMPOUND_PLURAL: Record<TyreCompound, string> = {
  soft: 'softs',
  medium: 'mediums',
  hard: 'hards',
  intermediate: 'inters',
  wet: 'wets',
};

const OVERTAKING_TIER_PHRASE: Record<string, string> = {
  low: "this is one of the easier tracks on the calendar to pass on, so raw pace counts for more than track position",
  low_medium: 'passing is on the easier side here',
  medium: "passing is doable but you can't count on it",
  medium_high: 'passing is hard-won here',
  high: "this is a tough track to pass on — track position after the stop is worth more than it looks on paper",
  very_high: "this is about as hard as it gets to pass on — track position after the stop is worth more than the raw pace number suggests",
};

function pl(compound: TyreCompound): string {
  return COMPOUND_PLURAL[compound];
}

function sec1(n: number): string {
  return n.toFixed(1);
}

/** "Start on mediums. Box lap 24 for the hards." / "No stops — track it out on the mediums." */
function callLine(candidate: StrategyCandidate): string {
  if (candidate.pitStops.length === 0) {
    return `No stops — track it out on the ${pl(candidate.stints[0].compound)}.`;
  }
  const boxes = candidate.pitStops.map((p, i) => {
    const nextCompound = candidate.stints[i + 1]?.compound;
    const suffix = i === 0 ? '' : ' again';
    return `Box${suffix} lap ${p.lap}${nextCompound ? ` for the ${pl(nextCompound)}` : ''}.`;
  });
  return `Start on ${pl(candidate.stints[0].compound)}. ${boxes.join(' ')}`;
}

function overtakingClause(referenceFacts: ReferenceFact[]): string | null {
  const fact = referenceFacts.find((f) => f.topic.endsWith('_overtaking_difficulty'));
  if (!fact) return null;
  const tierMatch = fact.fact.match(/tiered as "(\w+)"/);
  const tier = tierMatch?.[1];
  if (!tier || !(tier in OVERTAKING_TIER_PHRASE)) return null;
  const phrase = OVERTAKING_TIER_PHRASE[tier];
  const caveat = fact.confidence === 'placeholder' ? ' (rough guide only, not independently verified)' : '';
  return `${phrase}${caveat}.`;
}

function telemetryClause(telemetry: TelemetryLike | null | undefined): string {
  if (!telemetry) return '';
  const sign = telemetry.personalPaceOffsetSec > 0 ? '+' : '';
  const confNote = telemetry.confidence !== 'high' ? `, ${telemetry.confidence} confidence` : '';
  return ` (running your own pace, ${sign}${telemetry.personalPaceOffsetSec.toFixed(2)}s/lap vs the class baseline${confNote} — applied the same across every option, so it's not why this one wins)`;
}

function contingencyClause(
  raceContext: StrategyComparison['raceContext'],
  referenceFacts: ReferenceFact[],
): string {
  const parts: string[] = [];
  if (raceContext.safetyCarProbabilityPct >= 40) {
    parts.push(`${raceContext.safetyCarProbabilityPct}% safety-car risk today — that's a contingency to react to, not a lap number, so stay ready to reshuffle if the board goes yellow`);
  } else if (raceContext.safetyCarProbabilityPct >= 20) {
    parts.push(`safety-car risk is modeled at ${raceContext.safetyCarProbabilityPct}% — not scripted to a specific lap`);
  }
  if (raceContext.weather.condition !== 'dry' && raceContext.weather.rainProbabilityPct >= 30) {
    parts.push(`${raceContext.weather.rainProbabilityPct}% rain risk — again, a likelihood over the race, not a forecast for a specific lap`);
  }
  const overtaking = overtakingClause(referenceFacts);
  if (overtaking) parts.push(overtaking);
  if (parts.length === 0) return '';
  const sentences = parts.map((p) => {
    const trimmed = p.replace(/\.$/, '');
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  });
  return ` ${sentences.join('. ')}.`;
}

function generateRecommendationText(
  comparison: StrategyComparison,
  referenceFacts: ReferenceFact[],
  telemetry: TelemetryLike | null | undefined,
): string {
  const { raceContext, strategies, recommendedStrategyId, marginAnalysis } = comparison;
  const recommended = strategies.find((s) => s.id === recommendedStrategyId) as StrategyCandidate;
  const runnerUp = strategies.find((s) => marginAnalysis.closestPairIds.includes(s.id) && s.id !== recommendedStrategyId);

  const call = callLine(recommended);
  const telemetryTail = telemetryClause(telemetry);

  if (marginAnalysis.isCloseCall) {
    const marginLine = runnerUp
      ? `Only ${sec1(marginAnalysis.deltaSeconds)}s covers it over ${raceContext.totalLaps} laps — that's inside the model's noise floor, not a real gap. Calling it "${recommended.id}" over "${runnerUp.id}", but this is a genuine toss-up, not a knockout${telemetryTail}.`
      : `Only ${sec1(marginAnalysis.deltaSeconds)}s covers the top two here${telemetryTail} — treat this as a coin-flip we're calling early, not a runaway.`;
    return `${call}\n\n${marginLine}${contingencyClause(raceContext, referenceFacts)}`;
  }

  const marginLine = `${sec1(marginAnalysis.deltaSeconds)}s clear of the next-best option over ${raceContext.totalLaps} laps${telemetryTail} — not close, we're not overthinking this one.`;
  return `${call}\n\n${marginLine}${contingencyClause(raceContext, referenceFacts)}`;
}

function generateWhyNotAlternativeText(
  comparison: StrategyComparison,
  referenceFacts: ReferenceFact[],
  telemetry: TelemetryLike | null | undefined,
): string {
  const { raceContext, strategies, marginAnalysis } = comparison;
  const [idA, idB] = marginAnalysis.closestPairIds;
  const a = strategies.find((s) => s.id === idA) as StrategyCandidate;
  const b = strategies.find((s) => s.id === idB) as StrategyCandidate;
  const [winner, loser] = a.deltaToBestSeconds <= b.deltaToBestSeconds ? [a, b] : [b, a];
  const telemetryTail = telemetryClause(telemetry);

  const mechanism = deriveUndercutOvercutMechanism(comparison, idA, idB);

  if (mechanism) {
    const verdict =
      mechanism.result.verdict === 'undercut_wins'
        ? `the early stop wins the pit-window itself by ${sec1(Math.abs(mechanism.result.netDeltaSec))}s`
        : mechanism.result.verdict === 'overcut_wins'
          ? `the late stop wins the pit-window itself by ${sec1(Math.abs(mechanism.result.netDeltaSec))}s`
          : `the pit-window itself is basically a wash`;
    const fullRaceLine =
      marginAnalysis.isCloseCall
        ? `Over the full race that shrinks to ${sec1(marginAnalysis.deltaSeconds)}s — the later car claws most of it back on fresher rubber for the rest of the stint. Genuine tradeoff on timing, not "${loser.id}" getting it wrong.`
        : `Over the full race that's still ${sec1(loser.deltaToBestSeconds)}s in "${winner.id}"'s favor — the window edge holds up, it doesn't get clawed all the way back.`;
    return `"${loser.id}" isn't a mistake, it's a pit-window timing call. Same tyres, same shape — "${mechanism.earlyCandidateId}" boxes lap ${mechanism.earlyStopLap}, "${mechanism.lateCandidateId}" boxes lap ${mechanism.lateStopLap}. In that window alone, ${verdict}${telemetryTail}. ${fullRaceLine}${contingencyClause(raceContext, referenceFacts)}`;
  }

  if (marginAnalysis.isCloseCall) {
    return `"${winner.id}" and "${loser.id}" are separated by ${sec1(marginAnalysis.deltaSeconds)}s over ${raceContext.totalLaps} laps${telemetryTail} — inside the noise floor, so "${loser.id}" isn't wrong, it's just the other side of a genuine coin-flip. ${callLine(winner)} for the winner; "${loser.id}" runs ${loser.numStops} stop(s) against ${winner.numStops}.${contingencyClause(raceContext, referenceFacts)}`;
  }

  return `"${loser.id}" loses by ${sec1(loser.deltaToBestSeconds)}s over the full ${raceContext.totalLaps} laps${telemetryTail} — that's a real margin, not a coin-flip. ${winner.numStops}-stop against ${loser.numStops}-stop: the extra stop-count/tyre-life tradeoff is what's costing it, not a single bad lap.${contingencyClause(raceContext, referenceFacts)}`;
}

/**
 * Build a deterministic, race-engineer-voiced explanation directly from a
 * real StrategyComparison — no LLM call, but every clause is conditioned
 * on a real field, same grounding discipline as the prompt-based path.
 */
export function generateTemplateExplanation(
  mode: ExplanationMode,
  comparison: StrategyComparison,
  referenceFacts: ReferenceFact[] = [],
  telemetry?: TelemetryLike | null,
): string {
  return mode === 'recommendation'
    ? generateRecommendationText(comparison, referenceFacts, telemetry)
    : generateWhyNotAlternativeText(comparison, referenceFacts, telemetry);
}
