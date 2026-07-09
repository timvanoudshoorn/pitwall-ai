/**
 * trackReferenceFacts.ts
 * -----------------------------------------------------------------------
 * Joins data/track-confidence-lookup.json (owned by the `data` teammate)
 * into ReferenceFact entries, so a track's pit-loss and safety-car
 * figures carry their confidence tag into the prompt even if sim's own
 * output shape doesn't (yet) preserve one — see AILOG.md "Grounding
 * correction from data teammate" and the follow-up reconciliation
 * thread with sim.
 *
 * Also joins data/track-lap-reference.json's `overtakingDifficulty` field
 * (added 2026-07-10 at this module's request — see AILOG.md) to replace
 * what was previously a hand-written, unsourced "Monaco is hard to
 * overtake on" fact in mockFixtures.ts with a real sourced/confidence-
 * tagged fact for every circuit in the file.
 *
 * Both files are explicitly derived convenience files (their `_meta`
 * says the fuller per-track files are authoritative) — this module only
 * reads them, never writes, and never edits anything under data/.
 * -----------------------------------------------------------------------
 */

import trackConfidenceLookup from '../../data/track-confidence-lookup.json' with { type: 'json' };
import trackLapReference from '../../data/track-lap-reference.json' with { type: 'json' };
import type { ReferenceFact } from './types.ts';

interface TrackConfidenceEntry {
  pitLossSeconds: number | null;
  pitLossConfidence: 'confirmed' | 'reasonable_estimate' | 'placeholder';
  pitLossBasis: string;
  safetyCarTier: string;
  safetyCarConfidence: 'confirmed' | 'reasonable_estimate' | 'placeholder';
  safetyCarBasis: string;
  safetyCarSource?: string;
  lidarScanned: boolean;
  reverseLayoutAvailable: boolean;
}

type TrackConfidenceLookup = Record<string, TrackConfidenceEntry>;

const TRACKS: TrackConfidenceLookup = trackConfidenceLookup.tracks as TrackConfidenceLookup;

interface OvertakingDifficultyField {
  tier: 'low' | 'low_medium' | 'medium' | 'medium_high' | 'high' | 'very_high' | 'unknown';
  confidence: 'confirmed' | 'reasonable_estimate' | 'placeholder';
  basis: string;
}

interface LapReferenceCircuit {
  id: string;
  overtakingDifficulty?: OvertakingDifficultyField;
}

const OVERTAKING_BY_TRACK: Record<string, OvertakingDifficultyField> = Object.fromEntries(
  (trackLapReference.circuits as LapReferenceCircuit[])
    .filter((c) => c.overtakingDifficulty)
    .map((c) => [c.id, c.overtakingDifficulty as OvertakingDifficultyField]),
);

/**
 * Build ReferenceFact entries for a track's pit-loss and safety-car
 * figures, each carrying data's actual confidence tag. Returns an empty
 * array if the trackId isn't in the lookup (fail quiet — an explanation
 * missing one optional caveat is far better than the request throwing).
 */
export function buildTrackReferenceFacts(trackId: string): ReferenceFact[] {
  const entry = TRACKS[trackId];
  if (!entry) return [];

  const facts: ReferenceFact[] = [];

  if (entry.pitLossSeconds !== null) {
    facts.push({
      topic: `${trackId}_pit_loss`,
      fact: `Pit-lane time loss at this circuit is approximately ${entry.pitLossSeconds}s. ${entry.pitLossBasis}`,
      confidence: entry.pitLossConfidence,
    });
  }

  facts.push({
    topic: `${trackId}_safety_car`,
    fact: `Historical safety-car risk at this circuit is tiered as "${entry.safetyCarTier}". ${entry.safetyCarBasis}`,
    confidence: entry.safetyCarConfidence,
    source: entry.safetyCarSource,
  });

  if (entry.lidarScanned) {
    facts.push({
      topic: `${trackId}_lidar`,
      fact: 'This circuit is LiDAR-scanned in F1 25, giving higher-confidence surface/kerb data than non-scanned circuits.',
      confidence: 'confirmed',
    });
  }

  const overtaking = OVERTAKING_BY_TRACK[trackId];
  // "unknown" (currently only Madring, no races run yet) carries no usable
  // qualitative content — skip rather than surface a fact that just says
  // "we don't know," same fail-quiet convention as the missing-entry case.
  if (overtaking && overtaking.tier !== 'unknown') {
    facts.push({
      topic: `${trackId}_overtaking_difficulty`,
      fact: `Overtaking difficulty at this circuit is tiered as "${overtaking.tier}". ${overtaking.basis}`,
      confidence: overtaking.confidence,
    });
  }

  return facts;
}
