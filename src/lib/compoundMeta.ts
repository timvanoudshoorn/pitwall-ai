import type { TyreCompound } from '../ai/types';

export interface CompoundMeta {
  label: string;
  letter: string;
  colorVar: string;
}

/** Fixed real-world F1 broadcast convention — never reassign these. */
export const COMPOUND_META: Record<TyreCompound, CompoundMeta> = {
  soft: { label: 'Soft', letter: 'S', colorVar: 'var(--color-tyre-soft)' },
  medium: { label: 'Medium', letter: 'M', colorVar: 'var(--color-tyre-medium)' },
  hard: { label: 'Hard', letter: 'H', colorVar: 'var(--color-tyre-hard)' },
  intermediate: { label: 'Intermediate', letter: 'I', colorVar: 'var(--color-tyre-inter)' },
  wet: { label: 'Wet', letter: 'W', colorVar: 'var(--color-tyre-wet)' },
};
