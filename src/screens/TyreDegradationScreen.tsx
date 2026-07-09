import { useState } from 'react';
import { Panel } from '../components/ui/Panel';
import { CompoundChip } from '../components/ui/CompoundChip';
import { DegradationChart } from '../components/charts/DegradationChart';
import { COMPOUND_META } from '../lib/compoundMeta';
import type { TyreCompound } from '../ai/types';
import type { AppSelection } from '../types/session';

const ALL_COMPOUNDS: TyreCompound[] = ['soft', 'medium', 'hard', 'intermediate', 'wet'];

interface TyreDegradationScreenProps {
  selection: AppSelection;
}

export function TyreDegradationScreen({ selection }: TyreDegradationScreenProps) {
  const [active, setActive] = useState<TyreCompound[]>(['soft', 'medium', 'hard']);
  const [stintLength, setStintLength] = useState(35);

  function toggle(c: TyreCompound) {
    setActive((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <Panel
        eyebrow="Live from sim.tyreStintCurve"
        title="Tyre Degradation"
        action={
          <div className="flex items-center gap-1.5">
            {ALL_COMPOUNDS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                className={`transition-opacity ${active.includes(c) ? 'opacity-100' : 'opacity-30'}`}
                title={`Toggle ${COMPOUND_META[c].label}`}
              >
                <CompoundChip compound={c} size="sm" />
              </button>
            ))}
          </div>
        }
      >
        <DegradationChart
          compounds={active}
          stintLength={stintLength}
          carClass={selection.carClassId ?? undefined}
          performanceTier={selection.performanceTier}
        />

        <div className="mt-3 flex items-center gap-3 border-t border-pit-border pt-3">
          <span className="text-[10px] font-semibold tracking-[0.14em] text-pit-text-muted uppercase">
            Stint Length
          </span>
          <input
            type="range"
            min={5}
            max={50}
            value={stintLength}
            onChange={(e) => setStintLength(Number(e.target.value))}
            className="max-w-xs flex-1 accent-[color:var(--color-pit-accent)]"
          />
          <span className="tabular text-sm font-bold text-pit-accent">{stintLength} laps</span>
        </div>

        <p className="mt-2 text-[11px] leading-snug text-pit-text-muted">
          Dashed vertical lines mark the modeled cliff lap per compound — where degradation shifts from
          linear wear to steep thermal/structural falloff. Curve shape scales with the selected car class
          and performance tier.
        </p>
      </Panel>
    </div>
  );
}
