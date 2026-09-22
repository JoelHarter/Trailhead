// 2D simplex noise (after Stefan Gustavson's public-domain implementation), used as a stand-in for the
// game's q.noise, which TypeScript cannot call. Measured with the field camera (doc/04-worldgen-design.md),
// q.noise is smooth, direction-free, spans -1..1 almost evenly (sd about 0.45), has hills about 1.4 input
// units apart, and ignores the world seed. Plain simplex noise matches all of that almost exactly (the
// same value histogram, and 1.41 sign changes per unit against the game's 1.42), so q.noise is evidently
// simplex noise too. The game's permutation table is unknown, though, so this shows the character of a
// field faithfully but never the actual map of a world.
const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const PERM = new Uint8Array(512);
{
  const p = Array.from({ length: 256 }, (_, i) => i);
  let state = 0x9e3779b9;
  for (let i = 255; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [p[i], p[j]] = [p[j]!, p[i]!];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]!;
}
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const SPREAD = 0.96; // plain simplex is already within a few percent of q.noise's measured spread

/** Look-alike of Molang's q.noise(x, z): roughly -1..1, hills about 1.4 units apart. */
export function noise2(x: number, z: number): number {
  const s = (x + z) * F2;
  const i = Math.floor(x + s), j = Math.floor(z + s);
  const t = (i + j) * G2;
  const x0 = x - (i - t), z0 = z - (j - t);
  const i1 = x0 > z0 ? 1 : 0, j1 = 1 - i1;
  const corners = [[x0, z0, 0, 0], [x0 - i1 + G2, z0 - j1 + G2, i1, j1], [x0 - 1 + 2 * G2, z0 - 1 + 2 * G2, 1, 1]] as const;
  let sum = 0;
  for (const [cx, cz, di, dj] of corners) {
    const falloff = 0.5 - cx * cx - cz * cz;
    if (falloff <= 0) continue;
    const g = GRAD[PERM[((i + di) & 255) + PERM[(j + dj) & 255]!]! & 7]!;
    sum += falloff ** 4 * (g[0] * cx + g[1] * cz);
  }
  return Math.max(-1, Math.min(1, 70 * sum * SPREAD));
}
