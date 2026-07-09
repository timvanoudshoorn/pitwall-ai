import type { ReactNode } from 'react';

interface PanelProps {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Base instrument-panel card: hairline border, corner ticks, small-caps
 * eyebrow label above the title — the shared building block for every
 * screen so the app reads as one console rather than a stack of widgets.
 */
export function Panel({ title, eyebrow, action, children, className = '' }: PanelProps) {
  return (
    <div
      className={`relative rounded-sm border border-pit-border bg-pit-panel ${className}`}
    >
      <CornerTicks />
      {(title || eyebrow || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-pit-border px-4 py-3">
          <div>
            {eyebrow && (
              <div className="tabular text-[10px] font-semibold tracking-[0.16em] text-pit-text-muted uppercase">
                {eyebrow}
              </div>
            )}
            {title && <h2 className="text-sm font-semibold text-pit-text">{title}</h2>}
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
      <span className="pointer-events-none absolute left-0 top-0 h-2 w-2 border-l border-t border-pit-border-strong" />
      <span className="pointer-events-none absolute right-0 top-0 h-2 w-2 border-r border-t border-pit-border-strong" />
      <span className="pointer-events-none absolute bottom-0 left-0 h-2 w-2 border-b border-l border-pit-border-strong" />
      <span className="pointer-events-none absolute bottom-0 right-0 h-2 w-2 border-b border-r border-pit-border-strong" />
    </>
  );
}
