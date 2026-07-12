import { useRef } from 'react';
import { PERFORMANCE_TIERS, tierIndex } from '../../lib/tierMeta';
import type { PerformanceTierKey } from '../../sim/constants';

interface TierDialProps {
  value: PerformanceTierKey;
  onChange: (tier: PerformanceTierKey) => void;
}

/**
 * Performance Tier setup dial — a real, physical-feeling 4-position
 * selector (not a buried settings toggle). Click/tap a detent, drag the
 * puck between them, or use arrow keys. The fill bar communicates
 * "how much car" the way a boost-pressure gauge would.
 */
export function TierDial({ value, onChange }: TierDialProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const activeIndex = tierIndex(value);
  const steps = PERFORMANCE_TIERS.length;

  function selectFromClientX(clientX: number) {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const idx = Math.min(steps - 1, Math.round(ratio * (steps - 1)));
    onChange(PERFORMANCE_TIERS[idx].id);
  }

  function handlePointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    selectFromClientX(e.clientX);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (e.buttons !== 1) return;
    selectFromClientX(e.clientX);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight' && activeIndex < steps - 1) {
      onChange(PERFORMANCE_TIERS[activeIndex + 1].id);
    } else if (e.key === 'ArrowLeft' && activeIndex > 0) {
      onChange(PERFORMANCE_TIERS[activeIndex - 1].id);
    }
  }

  const fillPct = (activeIndex / (steps - 1)) * 100;

  return (
    <div className="select-none">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="pit-hud-text not-italic text-[10px] tracking-[0.16em] text-pit-text-muted uppercase">
          Performance Tier
        </span>
        <span className="pit-hud-text text-base text-pit-accent">
          {PERFORMANCE_TIERS[activeIndex].label}
        </span>
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Performance tier"
        aria-valuemin={0}
        aria-valuemax={steps - 1}
        aria-valuenow={activeIndex}
        aria-valuetext={PERFORMANCE_TIERS[activeIndex].label}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        className="pit-clip-sm relative h-11 cursor-pointer touch-none border border-pit-border bg-pit-bg outline-none focus-visible:ring-2 focus-visible:ring-pit-accent"
      >
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0 bg-pit-accent-dim/40 transition-[width] duration-150"
          style={{ width: `${fillPct}%` }}
        />

        {/* Detent ticks + labels */}
        <div className="absolute inset-0 grid grid-cols-4">
          {PERFORMANCE_TIERS.map((t, i) => (
            <div
              key={t.id}
              className={`pit-hud-text not-italic flex items-center justify-center border-r border-pit-border/60 text-[11px] tracking-wide last:border-r-0 ${
                i <= activeIndex ? 'text-pit-text' : 'text-pit-text-muted'
              }`}
            >
              {t.shortLabel}
            </div>
          ))}
        </div>

        {/* Puck */}
        <div
          className="absolute top-1/2 h-7 w-2 -translate-y-1/2 rounded-sm bg-pit-accent shadow-[0_0_8px_var(--color-pit-accent)] transition-[left] duration-150"
          style={{ left: `calc(${fillPct}% - ${activeIndex === steps - 1 ? '8px' : activeIndex === 0 ? '0px' : '4px'})` }}
        />
      </div>

      <p className="tabular mt-1.5 text-xs text-pit-text-secondary">
        {PERFORMANCE_TIERS[activeIndex].description}
      </p>
    </div>
  );
}
