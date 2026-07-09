import { useState } from 'react';
import { MessageSquareText, ShieldAlert } from 'lucide-react';
import { Panel } from '../components/ui/Panel';
import { StatusBadge } from '../components/ui/StatusBadge';
import { MOCK_CLOSE_CALL } from '../ai/mockFixtures';
import type { ExplanationMode, ExplanationResult } from '../ai/types';

/**
 * UI-only placeholder explanation text, grounded strictly in
 * MOCK_CLOSE_CALL's own numbers (mirrors the constraint ai's real
 * generateExplanation() enforces) — this screen renders whatever
 * ExplanationResult it's given; it never calls the API itself. Swap the
 * mock below for ai's live generateExplanation() output once a backend
 * call site exists (browser can't hold the API key — see src/ai/client.ts).
 */
const MOCK_EXPLANATION: ExplanationResult = {
  mode: 'recommendation',
  text: `Box wall recommends the 1-stop, medium-to-hard, pitting lap 35.

Both one-stop plans land within three tenths of each other over 78 laps — that's inside the noise floor of this model, so treat it as a genuine coin-flip rather than a confident call. The lap-35 stop edges it by 0.3s over the lap-40 alternative, largely because the earlier stop banks slightly fresher hards for the final stint at a track where the safety-car probability is modeled at 61% — a stop taken under a safety car here is worth more than the raw pace delta suggests, since track position is unusually hard to recover at this circuit.

If the safety car comes out before lap 35, box early and take the free stop. If it comes out between laps 35 and 40, the lap-40 plan becomes the better bet — you're now protecting track position with fresher tyres for the run to the flag.`,
  groundingWarnings: [],
  modelUsed: 'claude-sonnet-5 (mock — not a live call)',
  usage: { inputTokens: 0, outputTokens: 0 },
};

export function AIExplanationScreen() {
  const [mode, setMode] = useState<ExplanationMode>('recommendation');
  const { raceContext, marginAnalysis } = MOCK_CLOSE_CALL;

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

        <div className="rounded-sm border border-pit-border bg-pit-bg p-4">
          <div className="mb-2 flex items-center gap-2 text-pit-text-secondary">
            <MessageSquareText size={15} />
            <span className="text-xs font-semibold tracking-wide uppercase">Race Engineer</span>
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-pit-text">{MOCK_EXPLANATION.text}</p>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-pit-border pt-3 text-[11px] text-pit-text-muted">
          <span className="flex items-center gap-1.5">
            <ShieldAlert size={12} />
            {MOCK_EXPLANATION.groundingWarnings.length === 0
              ? 'Every number above traces to the simulation output.'
              : `${MOCK_EXPLANATION.groundingWarnings.length} ungrounded reference(s) flagged.`}
          </span>
          <span className="tabular">{MOCK_EXPLANATION.modelUsed}</span>
        </div>
      </Panel>
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
