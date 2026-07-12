import { useMemo, useState } from 'react';
import { Gauge, AlertTriangle } from 'lucide-react';
import { Panel } from '../components/ui/Panel';
import { StatusBadge } from '../components/ui/StatusBadge';
import { resolveTelemetryContext } from '../lib/raceSimAdapter';
import type { AppSelection } from '../types/session';

interface SettingsScreenProps {
  selection: AppSelection;
  onChange: (patch: Partial<AppSelection>) => void;
}

/** Accepts either a plain seconds figure ("91.234") or mm:ss(.sss) ("1:31.234") — both are common ways a driver would paste a lap-time log. */
function parseLapTimeToken(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const mmss = t.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (mmss) {
    const minutes = Number(mmss[1]);
    const seconds = Number(mmss[2]);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return minutes * 60 + seconds;
  }
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Splits on newlines or commas so either "one lap per line" or "comma-separated" pastes both work. */
function parseLapTimes(text: string): { lapTimesSec: number[]; invalidCount: number } {
  const tokens = text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const lapTimesSec: number[] = [];
  let invalidCount = 0;
  for (const tok of tokens) {
    const v = parseLapTimeToken(tok);
    if (v === null) invalidCount += 1;
    else lapTimesSec.push(v);
  }
  return { lapTimesSec, invalidCount };
}

export function SettingsScreen({ selection, onChange }: SettingsScreenProps) {
  const { personalPace } = selection;
  const [rawText, setRawText] = useState(() => personalPace.lapTimesSec.map((t) => t.toFixed(3)).join('\n'));

  const { lapTimesSec, invalidCount } = useMemo(() => parseLapTimes(rawText), [rawText]);

  function patchPersonalPace(patch: Partial<AppSelection['personalPace']>) {
    onChange({ personalPace: { ...personalPace, ...patch } });
  }

  function handleTextChange(value: string) {
    setRawText(value);
    const parsed = parseLapTimes(value);
    patchPersonalPace({ lapTimesSec: parsed.lapTimesSec });
  }

  // Preview against the CURRENTLY TYPED laps (not just the committed selection.personalPace.lapTimesSec,
  // which handleTextChange already keeps in sync) so the offset updates live as the user types/pastes.
  const preview = useMemo(() => {
    if (!personalPace.enabled) return null;
    return resolveTelemetryContext({ ...selection, personalPace: { enabled: true, lapTimesSec } });
  }, [selection, personalPace.enabled, lapTimesSec]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Panel eyebrow="Settings" title="Display">
        <SettingRow label="Units" value="Metric (km, °C)" />
        <SettingRow label="Time format" value="Seconds, tabular digits" />
      </Panel>

      <Panel eyebrow="Settings" title="AI Explanation">
        <SettingRow label="API access" value="Not yet configured — pending centrally-paid vs bring-your-own-key decision" />
      </Panel>

      <Panel
        eyebrow="Settings · stretch feature"
        title="Personal Pace"
        action={
          <button
            type="button"
            onClick={() => patchPersonalPace({ enabled: !personalPace.enabled })}
            className={`pit-clip-sm pit-pressable relative px-3 py-1.5 text-xs pit-hud-text not-italic ${
              personalPace.enabled
                ? 'pit-accent-edge border border-pit-accent bg-pit-panel-raised text-pit-accent'
                : 'border border-pit-border text-pit-text-secondary hover:border-pit-border-strong'
            }`}
          >
            {personalPace.enabled ? 'Enabled' : 'Disabled'}
          </button>
        }
      >
        <p className="mb-3 text-xs leading-relaxed text-pit-text-secondary">
          Paste your own recorded lap times (one per line, or comma-separated — plain seconds like{' '}
          <span className="tabular">91.234</span> or minutes:seconds like <span className="tabular">1:31.234</span>{' '}
          both work) to recalibrate the pace model to your own driving, on top of the class/tier you've
          already selected. Applies as a single flat pace offset to every strategy candidate on the Compare
          and Explanation screens — it does not personalize tyre-wear or fuel modeling.
        </p>

        <textarea
          value={rawText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={'91.234\n91.876\n1:31.502\n...'}
          rows={5}
          className="tabular w-full resize-y rounded-sm border border-pit-border bg-pit-bg px-3 py-2 text-xs text-pit-text placeholder:text-pit-text-muted focus:border-pit-accent focus:outline-none"
        />

        <div className="mt-2 flex items-center justify-between text-[11px] text-pit-text-muted">
          <span>
            {lapTimesSec.length} lap{lapTimesSec.length === 1 ? '' : 's'} parsed
            {invalidCount > 0 ? ` · ${invalidCount} line${invalidCount === 1 ? '' : 's'} unrecognized` : ''}
          </span>
        </div>

        {personalPace.enabled && (
          <div className="mt-3 border-t border-pit-border pt-3">
            {!selection.carClassId || !selection.trackId ? (
              <div className="flex items-center gap-2 text-xs text-pit-text-secondary">
                <AlertTriangle size={14} className="text-status-warning" />
                Select a car class and track first — the offset is computed against your selected class/tier
                baseline.
              </div>
            ) : !preview ? (
              <div className="flex items-center gap-2 text-xs text-pit-text-secondary">
                <AlertTriangle size={14} className="text-status-warning" />
                Enter at least 3 lap times to compute a personal pace offset.
              </div>
            ) : (
              <PersonalPacePreview preview={preview} />
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

function PersonalPacePreview({ preview }: { preview: NonNullable<ReturnType<typeof resolveTelemetryContext>> }) {
  const { representativeLapSec, representativeLapCount, excludedLapCount, personalPaceOffsetSec, confidence } =
    preview;
  const direction = personalPaceOffsetSec < 0 ? 'faster' : personalPaceOffsetSec > 0 ? 'slower' : 'identical to';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Gauge size={14} className="text-pit-accent" />
        <span className="tabular text-sm font-semibold text-pit-text">
          {personalPaceOffsetSec > 0 ? '+' : ''}
          {personalPaceOffsetSec.toFixed(3)}s/lap
        </span>
        <span className="text-xs text-pit-text-secondary">{direction} than the model's class/tier assumption</span>
      </div>
      <div className="tabular text-[11px] text-pit-text-muted">
        Representative pace {representativeLapSec.toFixed(3)}s/lap from {representativeLapCount} kept lap
        {representativeLapCount === 1 ? '' : 's'}
        {excludedLapCount > 0 ? ` (${excludedLapCount} excluded as outliers)` : ''}.
      </div>
      {confidence !== 'high' && (
        <StatusBadge level="warning">{confidence} confidence — small sample size</StatusBadge>
      )}
      <div className="text-[11px] leading-snug text-pit-text-muted">
        Applied as a flat offset to every strategy candidate on Compare/Explanation — does not change tyre-wear
        or fuel modeling.
      </div>
    </div>
  );
}

/**
 * Stacks label above value below `sm` — the side-by-side layout was
 * forcing long values (e.g. the API-access row's full sentence) to wrap
 * word-by-word against a squeezed remaining width on a real phone,
 * producing an orphaned-word mess instead of the label/value pairing it
 * was meant to read as. Caught via mobile-viewport screenshots.
 */
function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-pit-border py-2.5 text-sm last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <span className="text-pit-text-secondary">{label}</span>
      <span className="tabular font-medium text-pit-text">{value}</span>
    </div>
  );
}
