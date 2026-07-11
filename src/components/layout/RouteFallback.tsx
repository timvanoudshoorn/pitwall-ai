import { RadioTower } from 'lucide-react';

/**
 * Suspense fallback for lazy-loaded screens (see App.tsx) — deliberately
 * terse and consistent with the pit-wall aesthetic rather than a generic
 * spinner. Screens are small/fast chunks on any real connection; this is
 * mostly here so React has something non-jarring to render during the
 * brief gap, not a "long operation" indicator.
 */
export function RouteFallback() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center text-pit-text-muted">
      <div className="flex items-center gap-2 text-xs tracking-wide uppercase">
        <RadioTower size={14} className="animate-pulse" />
        Loading
      </div>
    </div>
  );
}
