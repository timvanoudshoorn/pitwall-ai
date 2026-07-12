import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Panel } from './Panel';
import { CompoundChip } from './CompoundChip';
import { StatusBadge } from './StatusBadge';
import { COMPOUND_META } from '../../lib/compoundMeta';
import { useCustomStrategy } from '../../lib/useCustomStrategy';
import { resolveTotalLaps } from '../../lib/raceSimAdapter';
import type { AppSelection } from '../../types/session';
import type { StrategyPlan, StintPlan } from '../../sim';
import type { TyreCompound } from '../../ai/types';

const ALL_COMPOUNDS: TyreCompound[] = ['soft', 'medium', 'hard', 'intermediate', 'wet'];

interface CustomStrategyEditorProps {
  selection: AppSelection;
  /** The currently recommended candidate's predicted race time — the delta reference. */
  recommendedLabel: string;
  recommendedTimeSeconds: number;
}

/**
 * Interactive "what-if" strategy editor — build your own stint sequence
 * (compound + planned laps per stint) and see sim's real predicted race
 * time update live via `evaluateSingleStrategy()`
 * (src/sim/strategyCompare.ts, SIMLOG.md #14), through
 * `useCustomStrategy()`/`evaluateCustomStrategy()`. Delta is always shown
 * against the currently recommended standard candidate — one clear
 * reference point rather than the ambiguous "vs what" sim's doc comment
 * explicitly leaves to the caller.
 */
export function CustomStrategyEditor({ selection, recommendedLabel, recommendedTimeSeconds }: CustomStrategyEditorProps) {
  let totalLaps = 40;
  try {
    totalLaps = resolveTotalLaps(selection);
  } catch {
    // selection incomplete — parent screen already guards this case, but
    // fall back to a sane default rather than crash if this ever renders anyway.
  }

  const [stints, setStints] = useState<StintPlan[]>(() => defaultStints(totalLaps));

  const plan: StrategyPlan = { id: 'custom', stints };
  const { evaluation, error } = useCustomStrategy(selection, plan);

  const plannedSum = stints.reduce((sum, s) => sum + s.plannedLaps, 0);
  const lapsMismatch = plannedSum !== totalLaps;

  function updateStint(index: number, patch: Partial<StintPlan>) {
    setStints((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStint() {
    setStints((prev) => [...prev, { compound: 'medium', plannedLaps: Math.max(1, Math.round(totalLaps / (prev.length + 1))) }]);
  }

  function removeStint(index: number) {
    setStints((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  const delta = evaluation ? evaluation.predictedTotalRaceTimeSeconds - recommendedTimeSeconds : null;

  return (
    <Panel eyebrow="Interactive · sim.evaluateSingleStrategy" title="Build Your Own Strategy">
      <div className="flex flex-col gap-2.5">
        {stints.map((stint, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2.5 rounded-sm border border-pit-border bg-pit-bg p-2.5">
            <div className="flex items-center gap-1">
              {ALL_COMPOUNDS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => updateStint(i, { compound: c })}
                  className={`transition-opacity ${stint.compound === c ? 'opacity-100' : 'opacity-30 hover:opacity-60'}`}
                  title={COMPOUND_META[c].label}
                >
                  <CompoundChip compound={c} size="sm" />
                </button>
              ))}
            </div>
            <input
              type="range"
              min={1}
              max={Math.max(totalLaps - stints.length + 1, 1)}
              value={stint.plannedLaps}
              onChange={(e) => updateStint(i, { plannedLaps: Number(e.target.value) })}
              className="min-w-[80px] flex-1 accent-[color:var(--color-pit-accent)]"
            />
            <span className="tabular w-16 shrink-0 text-right text-sm font-bold text-pit-text">{stint.plannedLaps} lap{stint.plannedLaps === 1 ? '' : 's'}</span>
            <button
              type="button"
              onClick={() => removeStint(i)}
              disabled={stints.length <= 1}
              className="shrink-0 rounded-sm border border-pit-border p-1.5 text-pit-text-muted transition-colors hover:border-status-critical hover:text-status-critical disabled:opacity-30 disabled:hover:border-pit-border disabled:hover:text-pit-text-muted"
              title="Remove stint"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addStint}
          className="flex items-center justify-center gap-1.5 rounded-sm border border-dashed border-pit-border py-2 text-xs font-semibold text-pit-text-secondary transition-colors hover:border-pit-accent hover:text-pit-accent"
        >
          <Plus size={14} /> Add Stint
        </button>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-pit-border pt-3">
        <div className="tabular text-xs text-pit-text-muted">
          {plannedSum} / {totalLaps} laps planned
          {lapsMismatch && <span className="ml-1.5 text-status-warning">— doesn't sum to race distance yet</span>}
        </div>

        {error && <StatusBadge level="warning">{error}</StatusBadge>}

        {evaluation && delta !== null && !error && (
          <div className="tabular flex items-center gap-2 text-sm font-bold">
            <span className="text-pit-text-muted text-[11px] font-medium normal-case">vs {recommendedLabel}:</span>
            {Math.abs(delta) < 0.05 ? (
              <StatusBadge level="good">Matches recommended</StatusBadge>
            ) : delta < 0 ? (
              <StatusBadge level="good">{delta.toFixed(1)}s faster</StatusBadge>
            ) : (
              <StatusBadge level="warning">+{delta.toFixed(1)}s slower</StatusBadge>
            )}
          </div>
        )}
      </div>

      {evaluation && evaluation.assumptionFlags.length > 0 && (
        <p className="mt-2 text-[10px] leading-snug text-pit-text-muted">
          {evaluation.assumptionFlags.length} modeling assumption{evaluation.assumptionFlags.length === 1 ? '' : 's'} applied — same
          placeholders as the standard comparison above.
        </p>
      )}
    </Panel>
  );
}

/** A reasonable 2-stint medium/hard starting point, tyre-life-weighted like strategyCandidates.ts's own default split — not meant to be optimal, just a sane place to start editing from. */
function defaultStints(totalLaps: number): StintPlan[] {
  const first = Math.max(1, Math.round(totalLaps * 0.45));
  return [
    { compound: 'medium', plannedLaps: first },
    { compound: 'hard', plannedLaps: Math.max(1, totalLaps - first) },
  ];
}
