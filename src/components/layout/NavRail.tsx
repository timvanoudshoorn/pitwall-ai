import { NavLink } from 'react-router-dom';
import {
  Home,
  Flag,
  Gauge,
  GitCompareArrows,
  LineChart,
  TimerReset,
  MessagesSquare,
  Swords,
  Settings2,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Menu', Icon: Home, end: true },
  { to: '/select', label: 'Select', Icon: Flag },
  { to: '/parameters', label: 'Parameters', Icon: Gauge },
  { to: '/comparison', label: 'Compare', Icon: GitCompareArrows },
  { to: '/degradation', label: 'Tyre Deg', Icon: LineChart },
  { to: '/pit-window', label: 'Pit Window', Icon: TimerReset },
  { to: '/explanation', label: 'Engineer', Icon: MessagesSquare },
  { to: '/battle', label: 'Battle', Icon: Swords },
  { to: '/settings', label: 'Settings', Icon: Settings2 },
];

/**
 * Left nav rail — timing-tower tab strip, icon + label, always visible
 * (CLAUDE.md is explicit this stays a rail, never a hamburger/bottom-tab
 * collapse). Narrower by default and widening at `sm`+ is a concession to
 * real phone widths (was a fixed 76px regardless of viewport, eating ~20%
 * of a 390px screen) — the rail itself was never the overflow bug's
 * source, but reclaiming this space is still worth it on a screen this
 * tight.
 */
export function NavRail() {
  return (
    <nav className="flex w-[60px] shrink-0 flex-col border-r border-pit-border bg-pit-panel sm:w-[76px]">
      {NAV_ITEMS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 border-l-2 px-0.5 py-2.5 text-center text-[9px] font-medium tracking-wide transition-colors sm:px-1 sm:py-3 sm:text-[10px] ${
              isActive
                ? 'border-pit-accent bg-pit-panel-raised text-pit-text'
                : 'border-transparent text-pit-text-muted hover:bg-pit-panel-raised hover:text-pit-text-secondary'
            }`
          }
        >
          <Icon size={16} strokeWidth={2} className="sm:hidden" />
          <Icon size={18} strokeWidth={2} className="hidden sm:block" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
