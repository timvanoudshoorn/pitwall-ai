import { AlertTriangle } from 'lucide-react';
import { Panel } from './Panel';

/**
 * Shared "selection incomplete / adapter threw" fallback for every screen
 * built on useStrategyComparison() (Comparison, Pit Window, Explanation,
 * Battle) — one place to keep this consistent instead of four ad hoc
 * copies.
 */
export function NoComparisonNotice({ title, message }: { title: string; message: string | null }) {
  return (
    <Panel eyebrow="Strategy" title={title}>
      <div className="flex items-center gap-2 text-sm text-pit-text-secondary">
        <AlertTriangle size={16} className="text-status-warning" />
        {message}
      </div>
    </Panel>
  );
}
