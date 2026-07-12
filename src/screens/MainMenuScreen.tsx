import { Link } from 'react-router-dom';
import { Radio, FlagTriangleRight, ChevronRight, History, BookOpen } from 'lucide-react';
import { Panel } from '../components/ui/Panel';

/**
 * Landing/home screen — the app used to launch straight into Car Class &
 * Track Select, which read like the middle of a flow rather than an app
 * with a front door. This is the real title screen: a pit-wall "ready
 * board" rather than a generic splash. Primary action is "New Strategy",
 * which leads into the existing select flow (`/select`). The two disabled
 * rows below it are deliberate placeholders for future entries (saved
 * strategies, reference library) rather than features being promised —
 * they're visibly inert (StatusBadge-style muted, no hover state, no
 * onClick) so they read as "coming soon" rather than broken.
 */
export function MainMenuScreen() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pt-4 sm:pt-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex items-center gap-2 text-pit-accent">
          <Radio size={28} strokeWidth={2.5} />
          <span className="text-2xl font-bold tracking-[0.14em]">PITWALL AI</span>
        </div>
        <p className="tabular text-xs font-semibold tracking-[0.2em] text-pit-text-muted uppercase">
          Race Strategy Console
        </p>
      </div>

      <Panel eyebrow="Pit Wall · Ready" title="Session Control">
        <div className="flex flex-col gap-2.5">
          <Link
            to="/select"
            className="group flex items-center justify-between gap-3 rounded-sm border border-pit-accent bg-pit-panel-raised px-4 py-4 transition-colors hover:bg-pit-accent/10"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-pit-accent text-pit-accent">
                <FlagTriangleRight size={18} strokeWidth={2.5} />
              </span>
              <div className="text-left">
                <div className="text-sm font-bold text-pit-text">New Strategy</div>
                <div className="text-[11px] text-pit-text-secondary">
                  Set car class, performance tier, and track
                </div>
              </div>
            </div>
            <ChevronRight size={18} className="shrink-0 text-pit-accent transition-transform group-hover:translate-x-0.5" />
          </Link>

          <PlaceholderRow
            Icon={History}
            label="Saved Strategies"
            sublabel="Revisit a previous session — coming soon"
          />
          <PlaceholderRow
            Icon={BookOpen}
            label="Strategy Reference Library"
            sublabel="Compound/track notes outside a live session — coming soon"
          />
        </div>
      </Panel>

      <p className="tabular px-1 text-center text-[10px] tracking-[0.12em] text-pit-text-muted uppercase">
        Modeled strategy, not a live telemetry feed
      </p>
    </div>
  );
}

function PlaceholderRow({
  Icon,
  label,
  sublabel,
}: {
  Icon: typeof History;
  label: string;
  sublabel: string;
}) {
  return (
    <div className="flex cursor-not-allowed items-center gap-3 rounded-sm border border-pit-border bg-pit-bg px-4 py-4 opacity-50">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-pit-border text-pit-text-muted">
        <Icon size={18} strokeWidth={2} />
      </span>
      <div className="text-left">
        <div className="text-sm font-bold text-pit-text-secondary">{label}</div>
        <div className="text-[11px] text-pit-text-muted">{sublabel}</div>
      </div>
    </div>
  );
}
