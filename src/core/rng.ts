// Small seeded random number generator (mulberry32) so that trees are reproducible:
// the same seed always grows the same tree, in Node and in the game alike.
export class Rng {
  private state: number;
  private spareGaussian: number | null = null;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  nextFloat(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [0, bound). */
  nextInt(bound: number): number {
    return Math.floor(this.nextFloat() * bound);
  }

  /** Standard normal, mean 0 and standard deviation 1 (Box-Muller). */
  nextGaussian(): number {
    if (this.spareGaussian !== null) {
      const spare = this.spareGaussian;
      this.spareGaussian = null;
      return spare;
    }
    let u = 0;
    while (u === 0) u = this.nextFloat();
    const v = this.nextFloat();
    const radius = Math.sqrt(-2 * Math.log(u));
    this.spareGaussian = radius * Math.sin(2 * Math.PI * v);
    return radius * Math.cos(2 * Math.PI * v);
  }
}

/** Mixes world coordinates and a salt into a 32-bit seed. */
export function seedFromPosition(x: number, z: number, salt = 0): number {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
