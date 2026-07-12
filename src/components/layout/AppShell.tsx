import type { ReactNode } from 'react';
import { NavRail } from './NavRail';
import { TopBar } from './TopBar';
import type { AppSelection } from '../../types/session';

interface AppShellProps {
  selection: AppSelection;
  children: ReactNode;
}

export function AppShell({ selection, children }: AppShellProps) {
  return (
    // NOTE: overflow-x-hidden intentionally does NOT go on this outer
    // h-screen div, even though it looks like the obvious safety-net spot.
    // Tried that first — it silently broke: per the CSS overflow spec, if
    // one axis is set to something other than 'visible' and the other is
    // left at the 'visible' default, the browser force-computes the
    // 'visible' axis to 'auto' too (so the two axes can't disagree on
    // whether the box scrolls). This div never sets overflow-y, so adding
    // overflow-x-hidden alone silently created a SECOND vertical scroll
    // container here — on top of `main`'s own explicit overflow-y-auto
    // below — which clipped the whole shell (header/nav included) to
    // h-screen instead of letting only `main` scroll as intended. Caught
    // via a screenshot script whose captured heights all collapsed to
    // exactly the viewport height the moment this line was added.
    // The safety net lives on `main` instead, which already declares BOTH
    // axes explicitly (overflow-x-hidden overflow-y-auto below) so there's
    // no ambiguous axis for the browser to "fix" out from under it.
    <div className="flex h-screen flex-col bg-pit-bg text-pit-text">
      <TopBar selection={selection} />
      <div className="flex min-h-0 flex-1">
        <NavRail />
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-5">{children}</main>
      </div>
    </div>
  );
}
