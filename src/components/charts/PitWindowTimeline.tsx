import type { StrategyCandidate, RaceContext } from '../../ai/types';
import { COMPOUND_META } from '../../lib/compoundMeta';

interface PitWindowTimelineProps {
  raceContext: RaceContext;
  strategies: StrategyCandidate[];
  recommendedStrategyId: string;
}

/**
 * Horizontal stint timeline across the full race distance — one row per
 * candidate strategy, segmented by compound, pit stops marked as ticks.
 * This is the "pit window" view: it's meant to make overlapping/adjacent
 * pit laps between strategies visually obvious (the undercut/overcut
 * question), not just list stint lengths in a table.
 */
export function PitWindowTimeline({ raceContext, strategies, recommendedStrategyId }: PitWindowTimelineProps) {
  const totalLaps = raceContext.totalLaps;

  return (
    <div className="w-full">
      {/* Lap axis */}
      <div className="tabular mb-1 flex justify-between pl-[92px] text-[10px] text-pit-text-muted">
        <span>LAP 1</span>
        <span>LAP {Math.round(totalLaps / 2)}</span>
        <span>LAP {totalLaps}</span>
      </div>

      <div className="space-y-2.5">
        {strategies.map((strat) => {
          const isRecommended = strat.id === recommendedStrategyId;
          return (
            <div key={strat.id} className="flex items-center gap-3">
              <div className="tabular w-[80px] shrink-0 text-right text-xs">
                <div className={`font-bold ${isRecommended ? 'text-pit-accent' : 'text-pit-text-secondary'}`}>
                  {strat.numStops}-STOP
                </div>
                {isRecommended && <div className="text-[9px] tracking-wide text-pit-accent">RECOMMENDED</div>}
              </div>

              <div
                className={`relative h-8 flex-1 overflow-hidden rounded-sm border ${
                  isRecommended ? 'border-pit-accent/70' : 'border-pit-border'
                }`}
              >
                {strat.stints.map((stint, i) => {
                  const leftPct = ((stint.startLap - 1) / totalLaps) * 100;
                  const widthPct = ((stint.endLap - stint.startLap + 1) / totalLaps) * 100;
                  return (
                    <div
                      key={i}
                      className="tabular absolute top-0 flex h-full items-center justify-center border-r border-black/25 text-[10px] font-bold text-black/80"
                      style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: COMPOUND_META[stint.compound].colorVar }}
                      title={`${COMPOUND_META[stint.compound].label}: laps ${stint.startLap}-${stint.endLap} (${stint.lapsOnTyre} laps)`}
                    >
                      {widthPct > 6 ? COMPOUND_META[stint.compound].letter : ''}
                    </div>
                  );
                })}

                {/* Pit stop markers */}
                {strat.pitStops.map((stop, i) => {
                  const leftPct = (stop.lap / totalLaps) * 100;
                  return (
                    <div
                      key={i}
                      className="absolute top-0 h-full w-[2px] bg-pit-bg"
                      style={{ left: `${leftPct}%` }}
                      title={`Pit stop, lap ${stop.lap} (${stop.pitLossSeconds.toFixed(1)}s loss)`}
                    />
                  );
                })}
              </div>

              <div className="tabular w-[64px] shrink-0 text-xs font-semibold text-pit-text-secondary">
                {strat.deltaToBestSeconds === 0 ? (
                  <span className="text-status-good">BEST</span>
                ) : (
                  `+${strat.deltaToBestSeconds.toFixed(1)}s`
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
