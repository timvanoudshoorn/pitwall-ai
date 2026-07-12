import { Mountain, MapPin, Radar } from 'lucide-react';
import { Panel } from '../components/ui/Panel';
import { TierDial } from '../components/ui/TierDial';
import { CAR_CLASSES, TRACKS } from '../lib/dataAdapters';
import { trackSchematicPath } from '../lib/trackSchematic';
import type { AppSelection } from '../types/session';

interface CarClassTrackSelectScreenProps {
  selection: AppSelection;
  onChange: (patch: Partial<AppSelection>) => void;
}

export function CarClassTrackSelectScreen({ selection, onChange }: CarClassTrackSelectScreenProps) {
  const activeClass = CAR_CLASSES.find((c) => c.id === selection.carClassId);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <Panel eyebrow="Setup · 1 of 3" title="Car Class">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {CAR_CLASSES.map((c) => {
            const isActive = c.id === selection.carClassId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange({ carClassId: c.id })}
                className={`pit-clip-sm pit-pressable relative border p-3 text-left ${
                  isActive
                    ? 'pit-accent-edge border-pit-accent bg-pit-panel-raised'
                    : 'border-pit-border bg-pit-bg hover:border-pit-border-strong'
                }`}
              >
                <div className={`pit-hud-text text-sm ${isActive ? 'text-pit-accent' : 'text-pit-text'}`}>
                  {c.shortName}
                </div>
                {/* line-clamp caps card height on mobile regardless of description length — a hard backstop on top of dataAdapters.ts's firstSentence() truncation, not a replacement for it (full text still available via the title attribute). */}
                <div className="mt-1 line-clamp-3 text-[11px] leading-snug text-pit-text-secondary sm:line-clamp-none" title={c.description}>
                  {c.description}
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel eyebrow="Setup · 2 of 3" title="Performance Tier">
        {activeClass && !activeClass.tierSliderApplies ? (
          <p className="text-xs text-pit-text-secondary">
            {activeClass.name} runs a fixed pace profile — the tier dial doesn't apply to this class.
          </p>
        ) : (
          <TierDial value={selection.performanceTier} onChange={(performanceTier) => onChange({ performanceTier })} />
        )}
      </Panel>

      <Panel eyebrow="Setup · 3 of 3" title="Track" action={<span className="flex items-center gap-1 text-[10px] text-pit-text-muted"><Radar size={12} /> LiDAR-scanned = higher-confidence data</span>}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {TRACKS.map((t) => {
            const isActive = t.id === selection.trackId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange({ trackId: t.id })}
                className={`pit-clip-sm pit-pressable relative flex flex-col items-center gap-1.5 border p-3 ${
                  isActive
                    ? 'pit-accent-edge border-pit-accent bg-pit-panel-raised'
                    : 'border-pit-border bg-pit-bg hover:border-pit-border-strong'
                }`}
              >
                <svg viewBox="0 0 100 100" className="h-14 w-14">
                  <path
                    d={trackSchematicPath(t.id, t.corners)}
                    fill="none"
                    stroke={isActive ? 'var(--color-pit-accent)' : 'var(--color-pit-text-secondary)'}
                    strokeWidth={4}
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="text-center">
                  <div className={`pit-hud-text text-xs ${isActive ? 'text-pit-accent' : 'text-pit-text'}`}>{t.name}</div>
                  <div className="tabular mt-0.5 flex items-center justify-center gap-1 text-[10px] text-pit-text-muted">
                    <MapPin size={10} /> {t.country}
                  </div>
                  <div className="tabular mt-1 flex items-center justify-center gap-2 text-[10px] text-pit-text-secondary">
                    <span>{t.laps} LAPS</span>
                    <span className="flex items-center gap-0.5">
                      <Mountain size={10} /> {t.corners}
                    </span>
                    {t.lidarScanned && <Radar size={11} className="text-pit-accent" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
