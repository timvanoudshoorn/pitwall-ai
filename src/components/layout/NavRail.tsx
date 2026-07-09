import { NavLink } from 'react-router-dom';
import {
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
  { to: '/', label: 'Select', Icon: Flag, end: true },
  { to: '/parameters', label: 'Parameters', Icon: Gauge },
  { to: '/comparison', label: 'Compare', Icon: GitCompareArrows },
  { to: '/degradation', label: 'Tyre Deg', Icon: LineChart },
  { to: '/pit-window', label: 'Pit Window', Icon: TimerReset },
  { to: '/explanation', label: 'Engineer', Icon: MessagesSquare },
  { to: '/battle', label: 'Battle', Icon: Swords },
  { to: '/settings', label: 'Settings', Icon: Settings2 },
];

/** Left nav rail — timing-tower tab strip, icon + label, active tab lit. */
export function NavRail() {
  return (
    <nav className="flex w-[76px] shrink-0 flex-col border-r border-pit-border bg-pit-panel">
      {NAV_ITEMS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 border-l-2 px-1 py-3 text-center text-[10px] font-medium tracking-wide transition-colors ${
              isActive
                ? 'border-pit-accent bg-pit-panel-raised text-pit-text'
                : 'border-transparent text-pit-text-muted hover:bg-pit-panel-raised hover:text-pit-text-secondary'
            }`
          }
        >
          <Icon size={18} strokeWidth={2} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
