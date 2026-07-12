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
    <header className="pit-carbon flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-pit-border bg-pit-panel px-4 py-2">
      <div className="flex shrink-0 items-center gap-2 text-pit-accent">
        <Radio size={16} strokeWidth={2.5} />
        <span className="pit-hud-text text-base tracking-[0.04em]">PITWALL AI</span>
      </div>
      <div className="hidden h-5 w-px bg-pit-border sm:block" />
      {/* HUD-style readout chips (EA F1 in-race HUD reference) rather than
          plain label/value text — each field is its own small angular-cut
          instrument, matching the delta-timer/sector-split look rather than
          a generic status line. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
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
    <div className="pit-clip-sm flex min-w-0 items-baseline gap-1.5 border border-pit-border bg-pit-bg/60 px-2 py-1">
      <span className="pit-hud-text not-italic shrink-0 text-[9px] tracking-[0.14em] text-pit-text-muted">{label}</span>
      <span className="tabular truncate text-xs font-semibold text-pit-text">{value}</span>
    </div>
  );
}
