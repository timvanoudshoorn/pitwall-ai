/**
 * useStrategyComparison.ts
 * -----------------------------------------------------------------------
 * Shared hook wrapping `buildStrategyComparison()` (src/lib/raceSimAdapter.ts)
 * in a `useMemo` keyed on the current `AppSelection` — every screen that
 * needs sim's real `StrategyComparison` (Comparison, Pit Window, AI
 * Explanation, Strategy Battle) goes through this single call site so the
 * "selection incomplete -> friendly error instead of a crash" handling
 * only lives in one place.
 * -----------------------------------------------------------------------
 */
import { useMemo } from 'react';
import { buildStrategyComparison, RaceSimAdapterError } from './raceSimAdapter';
import type { AppSelection } from '../types/session';
import type { StrategyComparison } from '../ai/types';

export interface StrategyComparisonResult {
  comparison: StrategyComparison | null;
  error: string | null;
}

export function useStrategyComparison(selection: AppSelection): StrategyComparisonResult {
  return useMemo(() => {
    try {
      return { comparison: buildStrategyComparison(selection), error: null };
    } catch (err) {
      const message =
        err instanceof RaceSimAdapterError
          ? err.message
          : 'Could not build a strategy comparison for this selection.';
      return { comparison: null, error: message };
    }
  }, [selection]);
}
