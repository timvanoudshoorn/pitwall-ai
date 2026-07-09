/**
 * grounding.ts
 * -----------------------------------------------------------------------
 * Defense-in-depth against hallucinated numbers.
 *
 * The primary defense is the prompt itself (see promptBuilder.ts): the
 * model is only ever shown the facts it's allowed to cite, and is
 * instructed to reason from those facts alone. This module is a SECOND,
 * independent layer that inspects the model's generated text afterward
 * and flags any numeric token that doesn't trace back to something in
 * the input facts.
 *
 * This is a heuristic, not a proof. It catches the common failure mode
 * (the model states a lap number, a tyre-life figure, or a time delta
 * that never appeared anywhere in the sim output) but it is NOT a
 * guarantee of full groundedness — a model could still misattribute a
 * real number to the wrong strategy, or make an unsupported qualitative
 * claim with no numbers in it at all. Treat a clean grounding-warning
 * result as "no obviously invented numbers," not "verified accurate."
 * -----------------------------------------------------------------------
 */

import type { GroundingWarning, ReferenceFact, StrategyComparison } from './types.ts';

/** Recursively collect every finite numeric value out of an arbitrary object/array tree. */
function collectNumbers(value: unknown, out: Set<number>): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, out);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectNumbers(item, out);
  }
}

/** Pull numeric literals out of free-text reference-fact strings (e.g. "2026 pack adds +15% ERS deployment"). */
function collectNumbersFromText(text: string, out: Set<number>): void {
  const matches = text.match(/-?\d+(\.\d+)?/g);
  if (!matches) return;
  for (const m of matches) {
    const n = Number.parseFloat(m);
    if (Number.isFinite(n)) out.add(n);
  }
}

/**
 * Build the set of numbers the explanation is allowed to cite: every
 * numeric value that appears anywhere in the sim comparison object, plus
 * any numbers embedded in supplied reference facts. Deliberately does
 * NOT include derived values (sums, averages) — if the model needs a
 * computed total, that computation should happen in sim's output, not
 * be trusted from the model's own arithmetic.
 */
export function buildAllowedNumbers(
  comparison: StrategyComparison,
  referenceFacts: ReferenceFact[] = [],
): Set<number> {
  const nums = new Set<number>();
  collectNumbers(comparison, nums);
  for (const f of referenceFacts) {
    collectNumbersFromText(f.fact, nums);
  }
  return nums;
}

/** Is `candidate` within tolerance of any allowed number (covers rounding: "21s" for 21.4, "22%" for 22.0)? */
function isGrounded(candidate: number, allowed: Set<number>): boolean {
  for (const a of allowed) {
    const diff = Math.abs(candidate - a);
    if (diff <= 0.6 || diff <= Math.abs(a) * 0.03) return true;
  }
  return false;
}

/** Numbers that are never worth flagging: years, common percentages of speech, ordinals like "1" in "P1". */
const IGNORE_NUMBERS = new Set([0, 1, 2, 3, 100]);

export function checkGrounding(text: string, allowed: Set<number>): GroundingWarning[] {
  const warnings: GroundingWarning[] = [];
  const tokenRe = /-?\d+(\.\d+)?/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(text)) !== null) {
    const raw = match[0];
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value)) continue;
    if (IGNORE_NUMBERS.has(value)) continue;
    // Skip 4-digit numbers that look like a year (e.g. "F1 2025", "2026 Season Pack").
    if (raw.length === 4 && value >= 2000 && value <= 2100) continue;
    if (isGrounded(value, allowed)) continue;
    const start = Math.max(0, match.index - 30);
    const end = Math.min(text.length, match.index + raw.length + 30);
    warnings.push({
      token: raw,
      context: text.slice(start, end).trim(),
    });
  }
  return warnings;
}
