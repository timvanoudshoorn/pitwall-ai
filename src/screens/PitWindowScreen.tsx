import { Panel } from '../components/ui/Panel';
import { PitWindowTimeline } from '../components/charts/PitWindowTimeline';
import { MOCK_CLOSE_CALL } from '../ai/mockFixtures';

export function PitWindowScreen() {
  const { raceContext, strategies, recommendedStrategyId } = MOCK_CLOSE_CALL;

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
