import type { TyreCompound } from '../../ai/types';
import { COMPOUND_META } from '../../lib/compoundMeta';

interface CompoundChipProps {
  compound: TyreCompound;
  size?: 'sm' | 'md';
}

/**
 * Tyre-compound identity chip. Never color alone — the letter is always
 * rendered, since the "hard" compound's near-white swatch is intentionally
 * low-chroma (matches real broadcast convention) and needs the label to
 * carry identity on its own.
 */
export function CompoundChip({ compound, size = 'md' }: CompoundChipProps) {
  const meta = COMPOUND_META[compound];
  const dims = size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-7 w-7 text-xs';
  return (
    <span
      title={meta.label}
      className={`tabular inline-flex ${dims} shrink-0 items-center justify-center rounded-full border border-black/30 font-bold text-black`}
      style={{ background: meta.colorVar }}
    >
      {meta.letter}
    </span>
  );
}
