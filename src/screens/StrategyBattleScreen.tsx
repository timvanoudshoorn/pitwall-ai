import { Panel } from '../components/ui/Panel';
import { CompoundChip } from '../components/ui/CompoundChip';
import { MOCK_CLOSE_CALL } from '../ai/mockFixtures';

/**
 * Head-to-head view: the plan lists this as a stretch feature ("if
 * built"). Sim hasn't produced a lap-by-lap gap-evolution series yet, so
 * this renders the two-strategy stint comparison it *can* support today
 * (from MOCK_CLOSE_CALL) plus a placeholder for the lap-by-lap race-gap
 * chart once that data shape exists.
 */
export function StrategyBattleScreen() {
  const [left, right] = MOCK_CLOSE_CALL.strategies;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <Panel eyebrow="Head-to-head · stretch feature" title="Strategy Battle">
        <div className="grid grid-cols-2 gap-4">
          <BattleSide label="Strategy A" stops={left.numStops} stints={left.stints} delta={left.deltaToBestSeconds} />
          <BattleSide label="Strategy B" stops={right.numStops} stints={right.stints} delta={right.deltaToBestSeconds} />
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
