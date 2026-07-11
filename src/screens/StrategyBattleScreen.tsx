import { Panel } from '../components/ui/Panel';
import { CompoundChip } from '../components/ui/CompoundChip';
import { NoComparisonNotice } from '../components/ui/NoComparisonNotice';
import { useStrategyComparison } from '../lib/useStrategyComparison';
import type { AppSelection } from '../types/session';
import type { StrategyCandidate } from '../ai/types';

/**
 * Head-to-head view: the plan lists this as a stretch feature ("if
 * built"). Sim hasn't produced a lap-by-lap gap-evolution series yet, so
 * this renders the two-strategy stint comparison it *can* support today —
 * calls sim's real compareStrategies() (via useStrategyComparison, same
 * adapter as the other screens) and picks marginAnalysis.closestPairIds
 * as the two sides, since that's the genuinely interesting head-to-head
 * (the two candidates worth debating), not an arbitrary pair — plus a
 * placeholder for the lap-by-lap race-gap chart once that data shape
 * exists.
 */
export function StrategyBattleScreen({ selection }: { selection: AppSelection }) {
  const { comparison, error } = useStrategyComparison(selection);

  if (!comparison) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <NoComparisonNotice title="No battle yet" message={error} />
      </div>
    );
  }

  const { strategies, marginAnalysis } = comparison;
  const [idA, idB] = marginAnalysis.closestPairIds;
  const left = strategies.find((s) => s.id === idA) as StrategyCandidate;
  const right = strategies.find((s) => s.id === idB) as StrategyCandidate;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <Panel eyebrow="Head-to-head · closest pair" title="Strategy Battle">
        <div className="grid grid-cols-2 gap-4">
          <BattleSide
            label={left.id}
            stops={left.numStops}
            stints={left.stints}
            delta={left.deltaToBestSeconds}
          />
          <BattleSide
            label={right.id}
            stops={right.numStops}
            stints={right.stints}
            delta={right.deltaToBestSeconds}
          />
        </div>

        <div className="mt-4 flex items-center justify-center rounded-sm border border-dashed border-pit-border bg-pit-bg py-8 text-center">
          <p className="max-w-sm text-xs text-pit-text-muted">
            Lap-by-lap gap evolution chart pending — needs a per-lap position/gap series from sim's
            full-race comparison output. Flagged to sim; will wire in once that shape lands.
          </p>
        </div>
      </Panel>
    </div>
  );
}

function BattleSide({
  label,
  stops,
  stints,
  delta,
}: {
  label: string;
  stops: number;
  stints: { compound: import('../ai/types').TyreCompound; startLap: number; endLap: number }[];
  delta: number;
}) {
  return (
    <div className="rounded-sm border border-pit-border bg-pit-bg p-3.5">
      <div className="tabular text-[10px] font-semibold tracking-[0.14em] text-pit-text-muted uppercase">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-pit-text">{stops}-Stop</div>
      <div className="tabular mt-0.5 text-xs text-pit-text-secondary">
        {delta === 0 ? <span className="text-status-good">BEST</span> : `+${delta.toFixed(1)}s`}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {stints.map((s, i) => (
          <div key={i} className="flex items-center gap-1 rounded-sm border border-pit-border bg-pit-panel px-1.5 py-1">
            <CompoundChip compound={s.compound} size="sm" />
            <span className="tabular text-[10px] text-pit-text-secondary">
              L{s.startLap}-{s.endLap}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
