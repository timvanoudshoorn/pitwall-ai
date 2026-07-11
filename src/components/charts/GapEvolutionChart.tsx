import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { GapEvolutionResult } from '../../sim/raceGapEvolution';

interface GapEvolutionChartProps {
  evolution: GapEvolutionResult;
  labelA: string;
  labelB: string;
}

/**
 * Lap-by-lap gap between two strategy candidates, from sim's real
 * raceGapEvolution() (reuses the exact per-lap trace compareStrategies()
 * uses, so this can't silently drift from the headline numbers elsewhere
 * in the app — see raceGapEvolution.ts). Single neutral line rather than
 * a categorical color: this isn't a compound/status encoding, it's a
 * signed quantity, so a zero reference line plus the sign of the value
 * does the work instead. Pit-lane laps for each candidate are marked as
 * dashed vertical ticks so a viewer can read "who pitted first" directly
 * off the gap inflection.
 */
export function GapEvolutionChart({ evolution, labelA, labelB }: GapEvolutionChartProps) {
  const data = evolution.points.map((p) => ({ lap: p.lap, gap: p.gapSeconds }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-pit-border)" strokeDasharray="2 3" vertical={false} />
          <XAxis
            dataKey="lap"
            stroke="var(--color-pit-text-muted)"
            tick={{ fontSize: 11, fill: 'var(--color-pit-text-secondary)', fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-pit-border)' }}
            label={{ value: 'LAP', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'var(--color-pit-text-muted)' }}
          />
          <YAxis
            stroke="var(--color-pit-text-muted)"
            tick={{ fontSize: 11, fill: 'var(--color-pit-text-secondary)', fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
            width={44}
            label={{ value: 'GAP (S)', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'var(--color-pit-text-muted)' }}
          />
          <Tooltip content={<GapTooltip labelA={labelA} labelB={labelB} />} />
          <ReferenceLine y={0} stroke="var(--color-pit-border-strong)" strokeWidth={1} />
          {evolution.pitLapsA.map((lap) => (
            <ReferenceLine key={`pitA-${lap}`} x={lap} stroke="var(--color-pit-accent)" strokeDasharray="3 3" strokeOpacity={0.5} />
          ))}
          {evolution.pitLapsB.map((lap) => (
            <ReferenceLine key={`pitB-${lap}`} x={lap} stroke="var(--color-pit-text-muted)" strokeDasharray="3 3" strokeOpacity={0.5} />
          ))}
          <Line
            dataKey="gap"
            stroke="var(--color-pit-text)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function GapTooltip({ active, payload, label, labelA, labelB }: any) {
  if (!active || !payload?.length) return null;
  const gap = payload[0].value as number;
  const leader = gap === 0 ? 'Level' : gap > 0 ? labelA : labelB;
  return (
    <div className="tabular rounded-sm border border-pit-border-strong bg-pit-panel-raised px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-pit-text-secondary">Lap {label}</div>
      <div className="text-pit-text">
        {leader === 'Level' ? 'Level' : `${leader} ahead by ${Math.abs(gap).toFixed(1)}s`}
      </div>
    </div>
  );
}
