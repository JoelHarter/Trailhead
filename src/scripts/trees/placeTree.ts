// Builds a generated tree in the world, a slice at a time so the game never stalls.
import { BlockPermutation, type Dimension, type Vector3, system } from "@minecraft/server";
import { id } from "../../core/ns.ts";
import type { SequoiaTree } from "../../core/trees/sequoia.ts";

const FACE_FOR_AXIS = { x: "east", y: "up", z: "north" } as const;
const BLOCKS_PER_TICK = 150;

// Things a growing tree may push aside. Anything else (stone, builds, other trees' wood) is left alone.
const SOFT = new Set([
  "minecraft:air", "minecraft:short_grass", "minecraft:tall_grass", "minecraft:fern", "minecraft:large_fern",
  "minecraft:snow_layer", "minecraft:vine", "minecraft:deadbush", "minecraft:dandelion", "minecraft:poppy",
  "minecraft:moss_carpet", "minecraft:sweet_berry_bush", "minecraft:brown_mushroom", "minecraft:red_mushroom",
]);
const GROUND_TO_PODZOL = new Set(["minecraft:grass_block", "minecraft:dirt", "minecraft:coarse_dirt", "minecraft:moss_block"]);

export function placeTree(dimension: Dimension, base: Vector3, tree: SequoiaTree): void {
  const leavesId = id("sequoia_leaves");
  const saplingId = id("sequoia_sapling");
  const { min: minY, max: maxY } = dimension.heightRange;
  const leafBlock = BlockPermutation.resolve(leavesId);
  const woodBlocks = new Map<string, BlockPermutation>();
  const woodBlock = (capped: boolean, axis: "x" | "y" | "z") => {
    const key = `${capped}${axis}`;
    let permutation = woodBlocks.get(key);
    if (!permutation) {
      permutation = BlockPermutation.resolve(id(capped ? "sequoia_wood" : "sequoia_log"), {
        "minecraft:block_face": FACE_FOR_AXIS[axis],
      } as never);
      woodBlocks.set(key, permutation);
    }
    return permutation;
  };

  function* build(): Generator<void, void, void> {
    let placed = 0;
    const put = (dx: number, dy: number, dz: number, permutation: BlockPermutation, overLeaves: boolean) => {
      const location = { x: base.x + dx, y: base.y + dy, z: base.z + dz };
      if (location.y < minY || location.y >= maxY) return;
      const block = dimension.getBlock(location);
      if (!block) return; // unloaded chunk
      const current = block.typeId;
      const clear = SOFT.has(current) || current === saplingId || (overLeaves && current === leavesId) ||
        (dy < 0 && GROUND_TO_PODZOL.has(current)) || (dy < 0 && current === "minecraft:podzol");
      if (clear) block.setPermutation(permutation);
    };

    // Wood first, from the ground up, so it looks like growth and leaves always have something to hang on.
    const logs = tree.logs.toArray().sort((a, b) => a[1] - b[1]);
    for (const [x, y, z] of logs) {
      put(x, y, z, woodBlock(tree.barkCapped.has(x, y, z), tree.axisOf(x, y, z)), true);
      if (++placed % BLOCKS_PER_TICK === 0) yield;
    }
    for (const [x, y, z] of tree.leaves) {
      put(x, y, z, leafBlock, false);
      if (++placed % BLOCKS_PER_TICK === 0) yield;
    }

    // A grown sequoia turns the ground around it to podzol, as in the Java mod.
    const radius = Math.round(tree.trueRadius + 2);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > radius * radius) continue;
        for (let dy = 1; dy >= -3; dy--) {
          const block = dimension.getBlock({ x: base.x + dx, y: base.y + dy, z: base.z + dz });
          if (block && GROUND_TO_PODZOL.has(block.typeId)) {
            block.setType("minecraft:podzol");
            break;
          }
        }
      }
      yield;
    }
  }

  system.runJob(build());
}
