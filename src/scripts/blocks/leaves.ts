// Sequoia leaves: decay when cut off from wood, and never decay when a player placed them.
//
// The decay rule is the one the tree generator guarantees (doc/06-tree-design.md): a leaf is attached
// if wood can be reached by stepping through shared block faces, leaf to leaf, within LEAF_REACH steps.
// Every naturally generated leaf satisfies this, so trees never shed on their own; leaves fall only
// after the wood that held them is removed. LEAF_REACH must never be smaller than the generator's.
import { type Block, type BlockCustomComponent, system } from "@minecraft/server";
import { id } from "../../core/ns.ts";
import { DEFAULT_SEQUOIA_PARAMS } from "../../core/trees/sequoia.ts";
import { isWood } from "./wood.ts";

const LEAF_REACH = Math.max(6, Math.round(DEFAULT_SEQUOIA_PARAMS.leafReach));
const LEAVES = id("sequoia_leaves");
const PERSISTENT = id("persistent");
const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;

/** Breadth-first search outward through leaves. Usually ends within a step or two, at the nearest log. */
function isAttached(start: Block): boolean {
  const seen = new Set<string>([`${start.x},${start.y},${start.z}`]);
  let frontier: Block[] = [start];
  for (let step = 1; step <= LEAF_REACH; step++) {
    const next: Block[] = [];
    for (const block of frontier) {
      for (const [dx, dy, dz] of FACES) {
        let neighbor: Block | undefined;
        try {
          neighbor = block.offset({ x: dx, y: dy, z: dz });
        } catch {
          return true; // outside the world's height range
        }
        if (!neighbor || !neighbor.isValid) return true; // unloaded chunk: assume attached, never shed at the edge
        if (isWood(neighbor)) return true;
        if (neighbor.typeId !== LEAVES) continue;
        const key = `${neighbor.x},${neighbor.y},${neighbor.z}`;
        if (!seen.has(key)) {
          seen.add(key);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return false;
}

export const leavesComponent: BlockCustomComponent = {
  // Leaves a player places are marked persistent, like vanilla, so builds made of leaves stay put.
  beforeOnPlayerPlace(event) {
    event.permutationToPlace = event.permutationToPlace.withState(PERSISTENT as never, true as never);
  },

  onRandomTick({ block }) {
    decayIfDetached(block);
  },
};

/** Removes the leaf, with its drops, if it is not persistent and no longer attached to wood. */
export function decayIfDetached(block: Block): boolean {
  if (block.typeId !== LEAVES) return false;
  if (block.permutation.getState(PERSISTENT as never) === true) return false;
  if (isAttached(block)) return false;
  const dimension = block.dimension;
  const { x, y, z } = block.location;
  {
    system.run(() => {
      // Same drops as breaking by hand without shears: the block's own loot table.
      try {
        dimension.runCommand(`loot spawn ${x} ${y} ${z} loot "blocks/sequoia_leaves"`);
      } catch {
        // drops are a nicety; the leaf still goes
      }
      dimension.setBlockType({ x, y, z }, "minecraft:air");
    });
  }
  return true;
}
