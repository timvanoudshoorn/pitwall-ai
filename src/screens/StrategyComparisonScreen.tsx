import { Panel } from '../components/ui/Panel';
import { CompoundChip } from '../components/ui/CompoundChip';
import { StatusBadge } from '../components/ui/StatusBadge';
import { MOCK_CLEAR_WINNER } from '../ai/mockFixtures';
import type { StrategyCandidate } from '../ai/types';

/**
 * Uses ai's MOCK_CLEAR_WINNER fixture directly (same shape sim's real
 * output will have) — swap for a live StrategyComparison prop once sim's
 * engine is wired end-to-end.
 */
export function StrategyComparisonScreen() {
  const { raceContext, strategies, recommendedStrategyId, marginAnalysis } = MOCK_CLEAR_WINNER;

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

      <div className="mt-3 flex items-center gap-1.5">
        {strategy.stints.map((stint, i) => (
          <div key={i} className="flex flex-1 items-center gap-1.5">
            <div className="flex flex-1 items-center gap-1.5 rounded-sm border border-pit-border bg-pit-panel px-2 py-1.5">
              <CompoundChip compound={stint.compound} size="sm" />
              <span className="tabular text-[11px] text-pit-text-secondary">
                L{stint.startLap}–{stint.endLap}
              </span>
            </div>
            {i < strategy.stints.length - 1 && (
              <span className="tabular text-[10px] text-pit-text-muted">
                {strategy.pitStops[i] ? `${strategy.pitStops[i].pitLossSeconds.toFixed(1)}s` : ''}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
