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
 * `data/track-confidence-lookup.json` is explicitly a derived
 * convenience file (their `_meta.sourceOfTruth` says tracks.json is
 * authoritative) — this module only reads it, never writes it, and
 * never edits anything under data/.
 * -----------------------------------------------------------------------
 */

import trackConfidenceLookup from '../../data/track-confidence-lookup.json' with { type: 'json' };
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

  return facts;
}
