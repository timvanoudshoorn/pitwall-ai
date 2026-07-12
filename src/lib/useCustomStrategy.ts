/**
 * useCustomStrategy.ts
 * -----------------------------------------------------------------------
 * Live "what-if" evaluation for the interactive strategy editor — as the
 * user edits stint compound/lap choices, this recomputes sim's real
 * predicted total race time via `evaluateSingleStrategy()`
 * (src/sim/strategyCompare.ts, SIMLOG.md #14) through
 * `evaluateCustomStrategy()` (src/lib/raceSimAdapter.ts) on every change.
 * Same "one shared call site owns the incomplete-selection error case"
 * pattern as `useStrategyComparison.ts`, but for a single user-built plan
 * instead of the standard candidate set.
 * -----------------------------------------------------------------------
 */
import { useMemo } from 'react';
import { evaluateCustomStrategy, RaceSimAdapterError } from './raceSimAdapter';
import type { AppSelection } from '../types/session';
import type { StrategyPlan } from '../sim';
import type { SingleStrategyEvaluation } from '../sim';

export interface CustomStrategyResult {
  evaluation: SingleStrategyEvaluation | null;
  error: string | null;
}

export function useCustomStrategy(selection: AppSelection, plan: StrategyPlan): CustomStrategyResult {
  return useMemo(() => {
    try {
      return { evaluation: evaluateCustomStrategy(selection, plan), error: null };
    } catch (err) {
      const message =
        err instanceof RaceSimAdapterError
          ? err.message
          : 'Could not evaluate this strategy for the current selection.';
      return { evaluation: null, error: message };
    }
    // plan is a plain object rebuilt by the caller on every edit — stringify
    // its meaningful shape so the memo doesn't recompute on referential
    // inequality alone but does on any actual stint/compound/lap change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, JSON.stringify(plan)]);
}
