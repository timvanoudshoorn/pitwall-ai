import { AlertTriangle } from 'lucide-react';
import { Panel } from '../components/ui/Panel';
import { CompoundChip } from '../components/ui/CompoundChip';
import { StatusBadge } from '../components/ui/StatusBadge';
import { NoComparisonNotice } from '../components/ui/NoComparisonNotice';
import { useStrategyComparison } from '../lib/useStrategyComparison';
import type { AppSelection } from '../types/session';
import type { StrategyCandidate } from '../ai/types';

/** Human-readable captions for sim's assumptionsUsed flag ids — anything not listed falls back to the raw flag id. */
const FLAG_LABELS: Record<string, string> = {
  base_lap_time_generic_placeholder: 'Base laptime uses a generic 90s placeholder (no per-track figure published yet)',
  pit_lane_delta_generic_placeholder: 'Pit-lane delta uses a generic placeholder, not track-specific data',
  pit_stationary_time_placeholder: 'Stationary pit time uses a generic placeholder',
  safety_car_probability_generic_placeholder: 'Safety-car probability uses a generic circuit-type default',
  vsc_probability_generic_placeholder: 'VSC probability uses a generic circuit-type default',
  personal_pace_telemetry_applied: 'Personal pace offset from your recorded lap times (Settings) is applied to every candidate',
};

function describeFlag(flag: string): string {
  if (FLAG_LABELS[flag]) return FLAG_LABELS[flag];
  if (flag.includes('pit_loss_source_confidence_')) return `Pit-loss figure confidence: ${flag.split('_').pop()}`;
  if (flag.includes('base_lap_time_source_confidence_')) return `Base laptime figure confidence: ${flag.split('_').pop()}`;
  if (flag.includes('safety_car_source_confidence_')) return `Safety-car figure confidence: ${flag.split('_').pop()}`;
  if (flag.includes('personal_pace_confidence_')) return `Personal pace offset confidence: ${flag.split('_').pop()}`;
  return flag.replace(/_/g, ' ');
}

/**
 * Calls sim's real compareStrategies() (via src/lib/raceSimAdapter.ts) off
 * the current app selection — replaces ai's MOCK_CLEAR_WINNER fixture now
 * that sim's engine is wired end-to-end. assumptionsUsed flags are
 * surfaced directly rather than hidden, per CLAUDE.md's grounding
 * philosophy (a placeholder number should never look calibrated).
 */
export function StrategyComparisonScreen({ selection }: { selection: AppSelection }) {
  const { comparison, error } = useStrategyComparison(selection);

  if (!comparison) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <NoComparisonNotice title="No comparison yet" message={error} />
      </div>
    );
  }

  const { raceContext, strategies, recommendedStrategyId, marginAnalysis, assumptionsUsed } = comparison;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <Panel eyebrow={`${raceContext.trackName} · ${raceContext.totalLaps} laps`} title="Strategy Comparison">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {strategies.map((s) => (
            <StrategyCard key={s.id} strategy={s} isRecommended={s.id === recommendedStrategyId} />
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-pit-border pt-3">
          {marginAnalysis.isCloseCall ? (
            <StatusBadge level="warning">
              Close call — {marginAnalysis.deltaSeconds.toFixed(1)}s covers the top candidates
            </StatusBadge>
          ) : (
            <StatusBadge level="good">
              Clear recommendation — {marginAnalysis.deltaSeconds.toFixed(1)}s margin
            </StatusBadge>
          )}
        </div>

        {assumptionsUsed.length > 0 && (
          <div className="mt-3 border-t border-pit-border pt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-pit-text-muted uppercase">
              <AlertTriangle size={12} />
              Modeling assumptions in this comparison
            </div>
            <ul className="space-y-0.5 text-[11px] leading-snug text-pit-text-muted">
              {assumptionsUsed.map((flag) => (
                <li key={flag}>· {describeFlag(flag)}</li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
    </div>
  );
}

function StrategyCard({ strategy, isRecommended }: { strategy: StrategyCandidate; isRecommended: boolean }) {
  return (
    <div
      className={`rounded-sm border p-3.5 ${
        isRecommended ? 'border-pit-accent bg-pit-panel-raised' : 'border-pit-border bg-pit-bg'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className={`text-sm font-bold ${isRecommended ? 'text-pit-accent' : 'text-pit-text'}`}>
            {strategy.numStops}-Stop
          </div>
          <div className="tabular text-[11px] text-pit-text-muted uppercase tracking-wide">
            {strategy.confidence ?? 'unrated'} confidence
          </div>
        </div>
        <div className="tabular text-right">
          <div className="text-lg font-bold text-pit-text">
            {strategy.deltaToBestSeconds === 0 ? (
              <span className="text-status-good">BEST</span>
            ) : (
              `+${strategy.deltaToBestSeconds.toFixed(1)}s`
            )}
          </div>
          <div className="text-[11px] text-pit-text-muted">
            {(strategy.predictedTotalRaceTimeSeconds / 60).toFixed(1)} min total
          </div>
        </div>
      </div>

      {/*
        flex-wrap (not a fixed single row) — this used to force every stint
        chip onto one unbreakable line via flex-1 on each item, which was
        fine at desktop card widths but clipped the last stint clean off
        the card's edge on a real phone (a 3-stop card has 4 chips to fit).
        Caught via mobile-viewport screenshots.
      */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {strategy.stints.map((stint, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 rounded-sm border border-pit-border bg-pit-panel px-2 py-1.5">
              <CompoundChip compound={stint.compound} size="sm" />
              <span className="tabular text-[11px] whitespace-nowrap text-pit-text-secondary">
                L{stint.startLap}–{stint.endLap}
              </span>
            </div>
            {i < strategy.stints.length - 1 && (
              <span className="tabular text-[10px] whitespace-nowrap text-pit-text-muted">
                {strategy.pitStops[i] ? `${strategy.pitStops[i].pitLossSeconds.toFixed(1)}s` : ''}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
