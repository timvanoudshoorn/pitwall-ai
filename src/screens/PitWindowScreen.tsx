import { Panel } from '../components/ui/Panel';
import { NoComparisonNotice } from '../components/ui/NoComparisonNotice';
import { PitWindowTimeline } from '../components/charts/PitWindowTimeline';
import { useStrategyComparison } from '../lib/useStrategyComparison';
import type { AppSelection } from '../types/session';

/**
 * Calls sim's real compareStrategies() (via useStrategyComparison, same
 * adapter as StrategyComparisonScreen) — replaces ai's MOCK_CLOSE_CALL
 * fixture now that sim's engine is wired end-to-end.
 */
export function PitWindowScreen({ selection }: { selection: AppSelection }) {
  const { comparison, error } = useStrategyComparison(selection);

  if (!comparison) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <NoComparisonNotice title="No pit window yet" message={error} />
      </div>
    );
  }

  const { raceContext, strategies, recommendedStrategyId } = comparison;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <Panel eyebrow={`${raceContext.trackName} · ${raceContext.totalLaps} laps`} title="Pit Window Timeline">
        <PitWindowTimeline
          raceContext={raceContext}
          strategies={strategies}
          recommendedStrategyId={recommendedStrategyId}
        />
        <p className="mt-4 border-t border-pit-border pt-3 text-[11px] leading-snug text-pit-text-muted">
          Dark ticks mark pit-lane entry laps. When two strategies' pit ticks sit close together, that gap is
          the undercut/overcut window — pitting first trades track position for tyre offset.
        </p>
      </Panel>
    </div>
  );
}
