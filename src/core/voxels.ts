// A set of integer block positions, stored as packed numbers for speed.
// Coordinates must stay within [-512, 511], far more than any single tree needs.
const OFFSET = 512;
const BITS = 10;
const MASK = (1 << BITS) - 1;

export type Position = readonly [x: number, y: number, z: number];

export function pack(x: number, y: number, z: number): number {
  return (x + OFFSET) | ((z + OFFSET) << BITS) | ((y + OFFSET) << (2 * BITS));
}

export function unpack(key: number): [x: number, y: number, z: number] {
  return [(key & MASK) - OFFSET, ((key >> (2 * BITS)) & MASK) - OFFSET, ((key >> BITS) & MASK) - OFFSET];
}

export class VoxelSet {
  private readonly keys = new Set<number>();

  get size(): number {
    return this.keys.size;
  }

  add(x: number, y: number, z: number): void {
    this.keys.add(pack(x, y, z));
  }

  has(x: number, y: number, z: number): boolean {
    return this.keys.has(pack(x, y, z));
  }

  delete(x: number, y: number, z: number): void {
    this.keys.delete(pack(x, y, z));
  }

  /** True if any member lies within the given taxicab (Manhattan) distance of the position. */
  hasWithinTaxicab(x: number, y: number, z: number, distance: number): boolean {
    for (let dx = -distance; dx <= distance; dx++) {
      const restAfterX = distance - Math.abs(dx);
      for (let dy = -restAfterX; dy <= restAfterX; dy++) {
        const restAfterY = restAfterX - Math.abs(dy);
        for (let dz = -restAfterY; dz <= restAfterY; dz++) {
          if (this.keys.has(pack(x + dx, y + dy, z + dz))) return true;
        }
      }
    }
    return false;
  }

  *[Symbol.iterator](): IterableIterator<[x: number, y: number, z: number]> {
    for (const key of this.keys) yield unpack(key);
  }

  toArray(): [x: number, y: number, z: number][] {
    return [...this];
  }
}
