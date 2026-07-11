import { useMemo } from 'react';
import { Panel } from '../components/ui/Panel';
import { CompoundChip } from '../components/ui/CompoundChip';
import { NoComparisonNotice } from '../components/ui/NoComparisonNotice';
import { GapEvolutionChart } from '../components/charts/GapEvolutionChart';
import { useStrategyComparison } from '../lib/useStrategyComparison';
import { buildGapEvolution, RaceSimAdapterError } from '../lib/raceSimAdapter';
import type { AppSelection } from '../types/session';
import type { StrategyCandidate } from '../ai/types';

/**
 * Head-to-head view: calls sim's real compareStrategies() (via
 * useStrategyComparison, same adapter as the other screens) and picks
 * marginAnalysis.closestPairIds as the two sides — the genuinely
 * interesting head-to-head (the two candidates worth debating), not an
 * arbitrary pair. The lap-by-lap gap chart calls sim's real
 * raceGapEvolution() (src/sim/raceGapEvolution.ts, reuses the exact same
 * per-lap trace compareStrategies() uses internally, so it can't drift
 * from the stint/delta numbers shown above it).
 */
export function StrategyBattleScreen({ selection }: { selection: AppSelection }) {
  const { comparison, error } = useStrategyComparison(selection);

  const battle = useMemo(() => {
    if (!comparison) return null;
    const [idA, idB] = comparison.marginAnalysis.closestPairIds;
    const left = comparison.strategies.find((s) => s.id === idA) as StrategyCandidate;
    const right = comparison.strategies.find((s) => s.id === idB) as StrategyCandidate;
    try {
      const evolution = buildGapEvolution(selection, idA, idB);
      return { left, right, evolution, error: null as string | null };
    } catch (err) {
      const message = err instanceof RaceSimAdapterError ? err.message : 'Could not build a gap-evolution chart for this pair.';
      return { left, right, evolution: null, error: message };
    }
  }, [comparison, selection]);

  if (!comparison || !battle) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <NoComparisonNotice title="No battle yet" message={error} />
      </div>
    );
  }

  const { left, right, evolution } = battle;

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

        {evolution ? (
          <div className="mt-4 border-t border-pit-border pt-4">
            <div className="mb-2 text-[11px] font-semibold tracking-wide text-pit-text-muted uppercase">
              Lap-by-lap gap
            </div>
            <GapEvolutionChart evolution={evolution} labelA={left.id} labelB={right.id} />
            <p className="mt-2 text-[11px] leading-snug text-pit-text-muted">
              Positive = <span className="text-pit-text-secondary">{left.id}</span> ahead, negative ={' '}
              <span className="text-pit-text-secondary">{right.id}</span> ahead. Dashed ticks mark each
              candidate's pit-lane laps (accent-colored for {left.id}, muted for {right.id}). Isolated-car pace
              only — no traffic/overtaking model yet, see CLAUDE.md.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-center rounded-sm border border-dashed border-pit-border bg-pit-bg py-8 text-center">
            <p className="max-w-sm text-xs text-pit-text-muted">{battle.error}</p>
          </div>
        )}
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
