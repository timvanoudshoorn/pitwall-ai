import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, MessageSquareText, RadioTower } from 'lucide-react';
import { Panel } from '../components/ui/Panel';
import { StatusBadge } from '../components/ui/StatusBadge';
import { NoComparisonNotice } from '../components/ui/NoComparisonNotice';
import { useStrategyComparison } from '../lib/useStrategyComparison';
import { resolveTelemetryContext } from '../lib/raceSimAdapter';
import { buildPrompt, buildTrackReferenceFacts, generateTemplateExplanation } from '../ai';
import type { AppSelection } from '../types/session';
import type { ExplanationMode } from '../ai/types';

export function AIExplanationScreen({ selection }: { selection: AppSelection }) {
  const [mode, setMode] = useState<ExplanationMode>('recommendation');
  const [promptOpen, setPromptOpen] = useState(false);

  const { comparison, error } = useStrategyComparison(selection);

  const built = useMemo(() => {
    if (!comparison) return null;
    const referenceFacts = selection.trackId ? buildTrackReferenceFacts(selection.trackId) : [];
    // Only pass telemetry through to the prompt/template if it was actually applied to THIS
    // comparison (compareStrategies() flags that via assumptionsUsed) — resolveTelemetryContext()
    // reflects the live Settings-screen state, which could theoretically be toggled off again
    // between building the comparison and rendering here; checking the flag keeps the two in sync.
    const telemetryApplied = comparison.assumptionsUsed.includes('personal_pace_telemetry_applied');
    const telemetry = telemetryApplied ? resolveTelemetryContext(selection) : null;
    const prompt = buildPrompt(mode, comparison, undefined, referenceFacts, telemetry ?? undefined);
    // ai's real template generator (src/ai/templateExplain.ts) as of their 2026-07-12 rewrite —
    // terser, real race-engineer voice, replaces the inline version that used to live here.
    const text = generateTemplateExplanation(mode, comparison, referenceFacts, telemetry ?? undefined);
    return { prompt, text };
  }, [comparison, mode, selection]);

  if (!comparison || !built) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <NoComparisonNotice title="No explanation yet" message={error} />
      </div>
    );
  }

  const { raceContext, marginAnalysis } = comparison;

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
          <p className="whitespace-pre-line text-sm leading-relaxed text-pit-text">{built.text}</p>
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
            <PromptBlock label="System" text={built.prompt.system} />
            <PromptBlock label="User" text={built.prompt.user} />
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
      className={`pit-clip-sm pit-pressable relative px-3 py-1.5 text-xs pit-hud-text not-italic ${
        active ? 'pit-accent-edge border border-pit-accent bg-pit-panel-raised text-pit-accent' : 'border border-pit-border text-pit-text-secondary hover:border-pit-border-strong'
      }`}
    >
      {children}
    </button>
  );
}
