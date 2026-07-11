import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, MessageSquareText, RadioTower } from 'lucide-react';
import { Panel } from '../components/ui/Panel';
import { StatusBadge } from '../components/ui/StatusBadge';
import { buildStrategyComparison, RaceSimAdapterError } from '../lib/raceSimAdapter';
import { buildPrompt, buildTrackReferenceFacts } from '../ai';
import type { AppSelection } from '../types/session';
import type { ExplanationMode, StrategyCandidate, StrategyComparison } from '../ai/types';

/**
 * Deterministic, template-built stand-in for ai's real generateExplanation()
 * output — NOT an LLM call. There is no safe place to hold the Claude API
 * key in this Vite browser bundle yet (see src/ai/client.ts's deployment
 * note; this is an open infra decision, not visual's or ai's to make
 * unilaterally). Every number used here is read directly off the real
 * StrategyComparison this screen is given, so the *content* is live even
 * though the *generation* isn't — clearly labeled as such in the UI rather
 * than presented as if it were a real model response.
 */
function buildTemplateExplanation(mode: ExplanationMode, comparison: StrategyComparison): string {
  const { raceContext, strategies, recommendedStrategyId, marginAnalysis } = comparison;
  const recommended = strategies.find((s) => s.id === recommendedStrategyId) as StrategyCandidate;
  const stopWord = (s: StrategyCandidate) => `${s.numStops}-stop`;

  if (mode === 'why_not_alternative') {
    const [idA, idB] = marginAnalysis.closestPairIds;
    const a = strategies.find((s) => s.id === idA) as StrategyCandidate;
    const b = strategies.find((s) => s.id === idB) as StrategyCandidate;
    const [winner, loser] = a.deltaToBestSeconds <= b.deltaToBestSeconds ? [a, b] : [b, a];
    if (marginAnalysis.isCloseCall) {
      return `"${winner.id}" and "${loser.id}" are separated by only ${marginAnalysis.deltaSeconds.toFixed(1)}s over ${raceContext.totalLaps} laps at ${raceContext.trackName} — inside this model's noise floor, so treat it as a genuine tradeoff rather than "${loser.id}" being wrong. "${winner.id}" pits at lap ${winner.pitStops[0]?.lap ?? '?'}; "${loser.id}" pits at lap ${loser.pitStops[0]?.lap ?? '?'}. With safety-car probability modeled at ${raceContext.safetyCarProbabilityPct}% this race, the earlier stop banks a cheaper caution-period pit if the SC comes out first; the later stop keeps fresher rubber for the run to the flag if it doesn't.`;
    }
    return `"${loser.id}" loses to "${winner.id}" by ${loser.deltaToBestSeconds.toFixed(1)}s over the full ${raceContext.totalLaps}-lap race distance at ${raceContext.trackName} — a clear enough margin that this isn't a coin-flip. ${winner.id} runs ${winner.numStops} stop(s) versus ${loser.id}'s ${loser.numStops}, and the predicted total race time gap (${winner.predictedTotalRaceTimeSeconds.toFixed(1)}s vs ${loser.predictedTotalRaceTimeSeconds.toFixed(1)}s) comes from that stop-count and tyre-life tradeoff, not from a single lap's pace.`;
  }

  const marginNote = marginAnalysis.isCloseCall
    ? `It's close — the top two strategies are only ${marginAnalysis.deltaSeconds.toFixed(1)}s apart, so this is a genuine call rather than a runaway, and the box wall isn't overstating confidence here.`
    : `The margin to the next-best option is a clear ${marginAnalysis.deltaSeconds.toFixed(1)}s, so this isn't a close call.`;

  return `Box wall recommends the ${stopWord(recommended)}, pitting ${recommended.pitStops.map((p) => `lap ${p.lap}`).join(' and ')}, for a predicted total race time of ${(recommended.predictedTotalRaceTimeSeconds / 60).toFixed(1)} minutes over ${raceContext.totalLaps} laps at ${raceContext.trackName}.

${marginNote} Safety-car probability is modeled at ${raceContext.safetyCarProbabilityPct}% this race and rain probability at ${raceContext.weather.rainProbabilityPct}% — both are whole-race likelihoods, not a forecast of which lap either arrives, so treat them as contingencies to react to rather than a fixed plan.`;
}

export function AIExplanationScreen({ selection }: { selection: AppSelection }) {
  const [mode, setMode] = useState<ExplanationMode>('recommendation');
  const [promptOpen, setPromptOpen] = useState(false);

  const result = useMemo(() => {
    try {
      const comparison = buildStrategyComparison(selection);
      const referenceFacts = selection.trackId ? buildTrackReferenceFacts(selection.trackId) : [];
      const prompt = buildPrompt(mode, comparison, undefined, referenceFacts);
      const text = buildTemplateExplanation(mode, comparison);
      return { comparison, prompt, text, error: null as string | null };
    } catch (err) {
      const message = err instanceof RaceSimAdapterError ? err.message : 'Could not build an explanation for this selection.';
      return { comparison: null, prompt: null, text: null, error: message };
    }
  }, [selection, mode]);

  if (!result.comparison || !result.prompt || !result.text) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <Panel eyebrow="Strategy Explanation" title="No explanation yet">
          <div className="flex items-center gap-2 text-sm text-pit-text-secondary">
            <AlertTriangle size={16} className="text-status-warning" />
            {result.error}
          </div>
        </Panel>
      </div>
    );
  }

  const { raceContext, marginAnalysis } = result.comparison;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Panel eyebrow={`${raceContext.trackName} · engineer radio`} title="Strategy Explanation">
        <div className="mb-3 flex items-center gap-2">
          <ModeTab active={mode === 'recommendation'} onClick={() => setMode('recommendation')}>
            Recommendation
          </ModeTab>
          <ModeTab active={mode === 'why_not_alternative'} onClick={() => setMode('why_not_alternative')}>
            Why Not The Alternative
          </ModeTab>
        </div>

        {marginAnalysis.isCloseCall && (
          <div className="mb-3">
            <StatusBadge level="warning">Close call — engineer is not overstating confidence</StatusBadge>
          </div>
        )}

        <div className="mb-3 flex items-center gap-2 rounded-sm border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-[11px] leading-snug text-pit-text-secondary">
          <RadioTower size={14} className="shrink-0 text-status-warning" />
          <span>
            Not a live Claude call — there is no safe place to hold the API key in this browser build yet (see
            src/ai/client.ts). The text below is a deterministic template built from the real numbers on this page,
            not a model response.
          </span>
        </div>

        <div className="rounded-sm border border-pit-border bg-pit-bg p-4">
          <div className="mb-2 flex items-center gap-2 text-pit-text-secondary">
            <MessageSquareText size={15} />
            <span className="text-xs font-semibold tracking-wide uppercase">Race Engineer (template preview)</span>
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-pit-text">{result.text}</p>
        </div>

        <button
          type="button"
          onClick={() => setPromptOpen((v) => !v)}
          className="mt-3 flex w-full items-center gap-1.5 border-t border-pit-border pt-3 text-[11px] font-semibold tracking-wide text-pit-text-muted uppercase hover:text-pit-text-secondary"
        >
          {promptOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          Prompt preview — what would actually be sent to Claude
        </button>
        {promptOpen && (
          <div className="mt-2 space-y-2">
            <PromptBlock label="System" text={result.prompt.system} />
            <PromptBlock label="User" text={result.prompt.user} />
          </div>
        )}
      </Panel>
    </div>
  );
}

function PromptBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-sm border border-pit-border bg-pit-bg p-3">
      <div className="mb-1 text-[10px] font-semibold tracking-[0.14em] text-pit-text-muted uppercase">{label}</div>
      <pre className="tabular max-h-64 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-pit-text-secondary">
        {text}
      </pre>
    </div>
  );
}

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-sm border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active ? 'border-pit-accent bg-pit-panel-raised text-pit-accent' : 'border-pit-border text-pit-text-secondary hover:border-pit-border-strong'
      }`}
    >
      {children}
    </button>
  );
}
