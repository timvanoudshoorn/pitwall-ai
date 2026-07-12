import type { ReactNode } from 'react';

interface PanelProps {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Base instrument-panel card — EA F1-menu-referenced chrome (coordinator
 * direction, 2026-07-12): angular diagonal-cut corners (`pit-clip-lg`,
 * top-right/bottom-left, not all four — a directional cut reads as
 * technical/aggressive the way a symmetric octagon wouldn't), a subtle
 * carbon-fiber texture (`pit-carbon`), a bold condensed italic eyebrow/
 * title (`pit-hud-text`) with a short accent bar ahead of it instead of a
 * plain label, and a brief fade+rise reveal on mount. Corner ticks now
 * mark only the two UN-clipped corners (top-left/bottom-right) in accent
 * color — a HUD reticle detail rather than a decorative frame on all
 * four. This is the single highest-leverage place to land the style pass
 * since every screen is built from this component.
 */
export function Panel({ title, eyebrow, action, children, className = '' }: PanelProps) {
  return (
    <div className={`pit-panel-in pit-clip-lg pit-carbon relative border border-pit-border bg-pit-panel ${className}`}>
      <CornerTicks />
      {(title || eyebrow || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-pit-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            {(eyebrow || title) && <span className="h-6 w-[3px] shrink-0 rounded-full bg-pit-accent" aria-hidden="true" />}
            <div>
              {eyebrow && (
                <div className="pit-hud-text text-[10px] tracking-[0.16em] text-pit-text-muted uppercase not-italic">
                  {eyebrow}
                </div>
              )}
              {title && <h2 className="pit-hud-text text-base text-pit-text">{title}</h2>}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

function CornerTicks() {
  return (
    <>
      <span className="pointer-events-none absolute left-0 top-0 h-2.5 w-2.5 border-l-2 border-t-2 border-pit-accent/70" />
      <span className="pointer-events-none absolute bottom-0 right-0 h-2.5 w-2.5 border-b-2 border-r-2 border-pit-accent/70" />
    </>
  );
}
