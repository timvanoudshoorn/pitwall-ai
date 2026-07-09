/**
 * trackSchematic.ts
 * -----------------------------------------------------------------------
 * Generates a deterministic, abstract closed-loop SVG path per track id —
 * NOT a real layout. Until the data teammate supplies actual corner-by-
 * corner geometry, this gives Car Class & Track Select a distinct tactile
 * shape per track (so selection feels like picking a circuit, not a
 * dropdown row) without claiming positional accuracy. Seeded by track id
 * + corner count so the same track always renders the same shape and
 * circuits with more corners look visibly more complex.
 * -----------------------------------------------------------------------
 */

function seededRandom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function trackSchematicPath(trackId: string, corners: number, size = 100): string {
  const rand = seededRandom(trackId);
  const points = Math.max(8, Math.min(corners, 20));
  const cx = size / 2;
  const cy = size / 2;
  const baseR = size * 0.36;

  const coords: [number, number][] = [];
  for (let i = 0; i < points; i += 1) {
    const angle = (i / points) * Math.PI * 2;
    const jitter = 0.65 + rand() * 0.55;
    const r = baseR * jitter;
    coords.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }

  const [start, ...rest] = coords;
  let d = `M ${start[0].toFixed(1)} ${start[1].toFixed(1)}`;
  for (const [x, y] of rest) {
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  d += ' Z';
  return d;
}
