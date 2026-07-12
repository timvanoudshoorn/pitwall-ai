import { CloudRain, Sun, CloudDrizzle, CloudSun } from 'lucide-react';
import { Panel } from '../components/ui/Panel';
import type { AppSelection, QualifyingFormat } from '../types/session';
import type { WeatherCondition } from '../ai/types';
import { TRACKS } from '../lib/dataAdapters';

interface RaceParametersScreenProps {
  selection: AppSelection;
  onChange: (patch: Partial<AppSelection>) => void;
}

/** F1 25's real race-distance options (25/35/50/100%) — the initial scaffold had a wrong 75% guess, see types/session.ts. */
const RACE_LENGTHS: AppSelection['raceParameters']['raceLengthPct'][] = [25, 35, 50, 100];

const QUALI_FORMATS: { id: QualifyingFormat; label: string; description: string }[] = [
  { id: 'one_shot', label: 'One-Shot Qualifying', description: 'Single flying lap, no second chances.' },
  { id: 'short_qualifying', label: 'Short Qualifying', description: 'Condensed single-session format.' },
  { id: 'full_qualifying', label: 'Full Qualifying', description: 'Standard Q1/Q2/Q3.' },
];

const WEATHER_OPTIONS: { id: WeatherCondition; label: string; Icon: typeof Sun }[] = [
  { id: 'dry', label: 'Dry', Icon: Sun },
  { id: 'damp', label: 'Damp', Icon: CloudSun },
  { id: 'wet', label: 'Wet', Icon: CloudDrizzle },
  { id: 'mixed', label: 'Mixed / Changeable', Icon: CloudRain },
];

export function RaceParametersScreen({ selection, onChange }: RaceParametersScreenProps) {
  const track = TRACKS.find((t) => t.id === selection.trackId);
  const rp = selection.raceParameters;

  function patchRP(patch: Partial<AppSelection['raceParameters']>) {
    onChange({ raceParameters: { ...rp, ...patch } });
  }

  const effectiveLaps = track ? Math.round((track.laps * rp.raceLengthPct) / 100) : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <Panel eyebrow="Race Parameters" title="Race Distance">
        <div className="grid grid-cols-4 gap-2.5">
          {RACE_LENGTHS.map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => patchRP({ raceLengthPct: pct })}
              className={`rounded-sm border p-3 text-center transition-colors ${
                rp.raceLengthPct === pct
                  ? 'border-pit-accent bg-pit-panel-raised text-pit-accent'
                  : 'border-pit-border bg-pit-bg text-pit-text hover:border-pit-border-strong'
              }`}
            >
              <div className="tabular text-lg font-bold">{pct}%</div>
            </button>
          ))}
        </div>
        <div className="tabular mt-3 text-xs text-pit-text-secondary">
          {track
            ? `${effectiveLaps} laps at ${track.name} (full distance: ${track.laps})`
            : 'Select a track on the Select screen to see lap count.'}
        </div>
      </Panel>

      <Panel eyebrow="Race Parameters" title="Qualifying Format">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {QUALI_FORMATS.map((f) => {
            const isActive = rp.qualifyingFormat === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => patchRP({ qualifyingFormat: f.id })}
                className={`rounded-sm border p-3 text-left transition-colors ${
                  isActive ? 'border-pit-accent bg-pit-panel-raised' : 'border-pit-border bg-pit-bg hover:border-pit-border-strong'
                }`}
              >
                <div className={`text-sm font-bold ${isActive ? 'text-pit-accent' : 'text-pit-text'}`}>{f.label}</div>
                <div className="mt-1 text-[11px] text-pit-text-secondary">{f.description}</div>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel eyebrow="Race Parameters" title="Weather">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {WEATHER_OPTIONS.map(({ id, label, Icon }) => {
            const isActive = rp.weather === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => patchRP({ weather: id })}
                className={`flex flex-col items-center gap-1.5 rounded-sm border p-3 transition-colors ${
                  isActive ? 'border-pit-accent bg-pit-panel-raised text-pit-accent' : 'border-pit-border bg-pit-bg text-pit-text hover:border-pit-border-strong'
                }`}
              >
                <Icon size={20} />
                <span className="text-xs font-semibold">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[10px] font-semibold tracking-[0.14em] text-pit-text-muted uppercase">
              Rain Probability
            </span>
            <span className="tabular text-sm font-bold text-pit-accent">{rp.rainProbabilityPct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={rp.rainProbabilityPct}
            onChange={(e) => patchRP({ rainProbabilityPct: Number(e.target.value) })}
            className="w-full accent-[color:var(--color-pit-accent)]"
          />
        </div>
      </Panel>
    </div>
  );
}
