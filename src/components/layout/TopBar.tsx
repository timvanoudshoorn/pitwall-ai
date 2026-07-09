import { Radio } from 'lucide-react';
import type { AppSelection } from '../../types/session';
import { CAR_CLASSES, TRACKS } from '../../lib/dataAdapters';
import { PERFORMANCE_TIERS } from '../../lib/tierMeta';

interface TopBarProps {
  selection: AppSelection;
}

/** Persistent session summary strip — always shows what's currently loaded, like a pit-wall status readout. */
export function TopBar({ selection }: TopBarProps) {
  const carClass = CAR_CLASSES.find((c) => c.id === selection.carClassId);
  const track = TRACKS.find((t) => t.id === selection.trackId);
  const tier = PERFORMANCE_TIERS.find((t) => t.id === selection.performanceTier);

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-pit-border bg-pit-panel px-4">
      <div className="flex items-center gap-2 text-pit-accent">
        <Radio size={16} strokeWidth={2.5} />
        <span className="text-sm font-bold tracking-[0.1em]">PITWALL AI</span>
      </div>
      <div className="h-5 w-px bg-pit-border" />
      <div className="tabular flex flex-1 items-center gap-5 text-xs">
        <SummaryField label="CLASS" value={carClass?.shortName ?? '—'} />
        <SummaryField label="TIER" value={tier?.shortLabel ?? '—'} />
        <SummaryField label="TRACK" value={track?.name ?? '—'} />
        <SummaryField label="LAPS" value={selection.raceParameters.raceLengthPct === 100 ? (track ? String(track.laps) : '—') : `${selection.raceParameters.raceLengthPct}%`} />
      </div>
    </header>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] font-semibold tracking-[0.14em] text-pit-text-muted">{label}</span>
      <span className="font-semibold text-pit-text">{value}</span>
    </div>
  );
}
