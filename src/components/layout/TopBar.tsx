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
    <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-pit-border bg-pit-panel px-4 py-2">
      <div className="flex shrink-0 items-center gap-2 text-pit-accent">
        <Radio size={16} strokeWidth={2.5} />
        <span className="text-sm font-bold tracking-[0.1em]">PITWALL AI</span>
      </div>
      <div className="hidden h-5 w-px bg-pit-border sm:block" />
      <div className="tabular flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <SummaryField label="CLASS" value={carClass?.shortName ?? '—'} />
        <SummaryField label="TIER" value={tier?.shortLabel ?? '—'} />
        <SummaryField label="TRACK" value={track?.name ?? '—'} />
        <SummaryField label="LAPS" value={selection.raceParameters.raceLengthPct === 100 ? (track ? String(track.laps) : '—') : `${selection.raceParameters.raceLengthPct}%`} />
      </div>
    </header>
  );
}

/**
 * `min-w-0` on the value matters here, not just decoration — without it a
 * flex child refuses to shrink below its content's intrinsic width (a
 * classic flexbox default), which was forcing this whole row — and via it,
 * the header, and via IT, the entire page — wider than the viewport on a
 * real phone screen instead of wrapping. Caught via mobile-viewport
 * screenshots, not desktop testing, where the row always had slack.
 */
function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0 text-[10px] font-semibold tracking-[0.14em] text-pit-text-muted">{label}</span>
      <span className="truncate font-semibold text-pit-text">{value}</span>
    </div>
  );
}
