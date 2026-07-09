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
    <div className="flex h-screen flex-col bg-pit-bg text-pit-text">
      <TopBar selection={selection} />
      <div className="flex min-h-0 flex-1">
        <NavRail />
        <main className="min-w-0 flex-1 overflow-y-auto p-5">{children}</main>
      </div>
    </div>
  );
}
