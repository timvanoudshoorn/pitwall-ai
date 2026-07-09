import { useMemo } from 'react';
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
import { tyreStintCurve } from '../../sim/degradation';
import type { TyreCompound } from '../../ai/types';
import type { CarClassKey, PerformanceTierKey } from '../../sim/constants';
import { COMPOUND_META } from '../../lib/compoundMeta';

interface DegradationChartProps {
  compounds: TyreCompound[];
  stintLength: number;
  carClass?: CarClassKey;
  performanceTier?: PerformanceTierKey;
}

/**
 * Real per-compound degradation curves from sim.tyreStintCurve — not
 * decorative. One line per compound, direct-labeled (no legend box needed
 * since color IS the compound identity, reinforced via CompoundChip
 * elsewhere on the same screen). Cliff-phase laps are where the curve
 * visibly steepens; that inflection is the point of the chart.
 */
export function DegradationChart({
  compounds,
  stintLength,
  carClass,
  performanceTier,
}: DegradationChartProps) {
  const data = useMemo(() => {
    const options = { carClass, performanceTier };
    const perCompound = compounds.map((c) => tyreStintCurve(c, stintLength, options));
    const rows: Record<string, number | string>[] = [];
    for (let lap = 0; lap < stintLength; lap += 1) {
      const row: Record<string, number | string> = { lap: lap + 1 };
      compounds.forEach((c, ci) => {
        row[c] = perCompound[ci][lap]?.lapTimeDeltaSec ?? null;
      });
      rows.push(row);
    }
    return rows;
  }, [compounds, stintLength, carClass, performanceTier]);

  // Cliff lap markers, one per compound, from the same curve data.
  const cliffLaps = useMemo(() => {
    const options = { carClass, performanceTier };
    return compounds.map((c) => {
      const curve = tyreStintCurve(c, stintLength, options);
      const cliffPoint = curve.find((p) => p.phase === 'cliff');
      return { compound: c, lap: cliffPoint?.lap };
    });
  }, [compounds, stintLength, carClass, performanceTier]);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-pit-border)" strokeDasharray="2 3" vertical={false} />
          <XAxis
            dataKey="lap"
            stroke="var(--color-pit-text-muted)"
            tick={{ fontSize: 11, fill: 'var(--color-pit-text-secondary)', fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-pit-border)' }}
            label={{ value: 'LAPS ON TYRE', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'var(--color-pit-text-muted)' }}
          />
          <YAxis
            stroke="var(--color-pit-text-muted)"
            tick={{ fontSize: 11, fill: 'var(--color-pit-text-secondary)', fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
            width={36}
            label={{ value: 'Δ SEC/LAP', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'var(--color-pit-text-muted)' }}
          />
          <Tooltip content={<DegradationTooltip />} />
          {cliffLaps.map(
            ({ compound, lap }) =>
              lap && (
                <ReferenceLine
                  key={`cliff-${compound}`}
                  x={lap}
                  stroke={COMPOUND_META[compound].colorVar}
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                />
              ),
          )}
          {compounds.map((c) => (
            <Line
              key={c}
              dataKey={c}
              name={COMPOUND_META[c].label}
              stroke={COMPOUND_META[c].colorVar}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DegradationTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tabular rounded-sm border border-pit-border-strong bg-pit-panel-raised px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-pit-text-secondary">Lap {label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.stroke }} />
          <span className="text-pit-text-secondary">{COMPOUND_META[p.dataKey as TyreCompound].label}</span>
          <span className="ml-auto font-semibold text-pit-text">
            {p.value > 0 ? '+' : ''}
            {p.value.toFixed(2)}s
          </span>
        </div>
      ))}
    </div>
  );
}
