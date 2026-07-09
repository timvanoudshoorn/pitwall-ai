import type { PerformanceTierKey } from '../sim/constants';

export interface TierMeta {
  id: PerformanceTierKey;
  label: string;
  shortLabel: string;
  description: string;
}

/** Fixed left-to-right order for the tier dial — Backmarker to Top Tier. */
export const PERFORMANCE_TIERS: TierMeta[] = [
  { id: 'backmarker', label: 'Backmarker', shortLabel: 'BACK', description: 'Bottom-of-the-grid pace.' },
  { id: 'midfield', label: 'Midfield', shortLabel: 'MID', description: 'Competitive point-scoring pace.' },
  { id: 'contender', label: 'Contender', shortLabel: 'CNTD', description: 'Podium-capable on a good day.' },
  { id: 'top_tier', label: 'Top Tier', shortLabel: 'TOP', description: 'Championship-front pace.' },
];

export function tierIndex(id: PerformanceTierKey): number {
  return PERFORMANCE_TIERS.findIndex((t) => t.id === id);
}
