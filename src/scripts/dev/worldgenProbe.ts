// Development aid: checks world generation without a player or a screen.
// From the server console:  scriptevent <namespace>:probe [x z]
// It force-loads a 9 x 9 chunk area (which makes the game generate it), counts this add-on's
// tree blocks there, and prints a summary to the server log. Use "npm run probe".
import { BlockPermutation, BlockVolume, system, world } from "@minecraft/server";
import { NAMESPACE, id } from "../../core/ns.ts";

const AREA_NAME = "trailhead_probe";
const RADIUS_CHUNKS = 4;
const WAIT_TICKS = 20 * 20;

system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id !== `${NAMESPACE}:probe`) return;
  const overworld = world.getDimension("overworld");
  const [xText, zText] = event.message.trim().split(/\s+/);
  let centerX = Number(xText) || 1000;
  let centerZ = Number(zText) || 1000;
  // "grove" (or any biome id) as the argument: go to the nearest one, worked out from the world seed.
  if (xText && Number.isNaN(Number(xText))) {
    const wanted = xText === "grove" ? id("sequoia_grove") : xText;
    let found;
    try {
      found = overworld.calculateClosestBiomeFromSeed({ x: 0, y: 64, z: 0 }, wanted);
    } catch (error) {
      console.warn(`[probe] biome search failed: ${error}`);
    }
    if (!found) return console.warn(`[probe] no ${wanted} found near 0,0 (default search range)`);
    centerX = Math.round(found.x);
    centerZ = Math.round(found.z);
    console.warn(`[probe] nearest ${wanted} is at ${centerX}, ${centerZ}`);
  }

  overworld.runCommand(`tickingarea remove ${AREA_NAME}`);
  overworld.runCommand(`tickingarea add circle ${centerX} 64 ${centerZ} ${RADIUS_CHUNKS} ${AREA_NAME}`);
  console.warn(`[probe] loading ${2 * RADIUS_CHUNKS + 1}x${2 * RADIUS_CHUNKS + 1} chunks around ${centerX},${centerZ} ...`);

  system.runTimeout(() => {
    const chunkX0 = Math.floor(centerX / 16) - RADIUS_CHUNKS;
    const chunkZ0 = Math.floor(centerZ / 16) - RADIUS_CHUNKS;
    let logs = 0, leaves = 0, chunksWithLogs = 0, chunksScanned = 0, highestLog = -Infinity;
    const samples: string[] = [];

    for (let cx = chunkX0; cx <= chunkX0 + 2 * RADIUS_CHUNKS; cx++) {
      for (let cz = chunkZ0; cz <= chunkZ0 + 2 * RADIUS_CHUNKS; cz++) {
        const volume = new BlockVolume({ x: cx * 16, y: -64, z: cz * 16 }, { x: cx * 16 + 15, y: 319, z: cz * 16 + 15 });
        try {
          const found = overworld.getBlocks(volume, { includeTypes: [id("sequoia_log"), id("sequoia_wood")] }, false);
          const count = found.getCapacity();
          leaves += overworld.getBlocks(volume, { includeTypes: [id("sequoia_leaves")] }, false).getCapacity();
          chunksScanned++;
          if (count > 0) {
            logs += count;
            chunksWithLogs++;
            const box = { min: found.getMin(), max: found.getMax() };
            highestLog = Math.max(highestLog, box.max.y);
            if (samples.length < 6) {
              samples.push(`chunk ${cx},${cz}: ${count} logs, x ${box.min.x}..${box.max.x}, y ${box.min.y}..${box.max.y}, z ${box.min.z}..${box.max.z}`);
            }
          }
        } catch {
          // Chunk not loaded (the ticking area is a circle, so corners are skipped).
        }
      }
    }

    // Biomes of the scanned chunks, and (to learn what a custom biome inherits through its tags) counts
    // of vanilla taiga decoration.
    const biomes = new Map<string, number>();
    for (let cx = chunkX0; cx <= chunkX0 + 2 * RADIUS_CHUNKS; cx++) {
      for (let cz = chunkZ0; cz <= chunkZ0 + 2 * RADIUS_CHUNKS; cz++) {
        try {
          const top = overworld.getTopmostBlock({ x: cx * 16 + 8, z: cz * 16 + 8 });
          if (!top) continue;
          const biome = overworld.getBiome(top.location).id;
          biomes.set(biome, (biomes.get(biome) ?? 0) + 1);
        } catch {
          // unloaded
        }
      }
    }
    console.warn(`[probe]   biomes (chunks): ${[...biomes].map(([k, v]) => `${k} ${v}`).join(", ")}`);
    const vanilla = ["minecraft:spruce_log", "minecraft:fern", "minecraft:large_fern", "minecraft:sweet_berry_bush",
      "minecraft:mossy_cobblestone", "minecraft:podzol", "minecraft:coarse_dirt", "minecraft:brown_mushroom",
      "minecraft:red_mushroom", "minecraft:deadbush", "minecraft:short_grass", "minecraft:dandelion",
      "minecraft:azure_bluet", "minecraft:lily_of_the_valley", "minecraft:moss_carpet"];
    const tallies: string[] = [];
    for (const type of vanilla) {
      let n = 0;
      for (let cx = chunkX0; cx <= chunkX0 + 2 * RADIUS_CHUNKS; cx++) {
        for (let cz = chunkZ0; cz <= chunkZ0 + 2 * RADIUS_CHUNKS; cz++) {
          try {
            n += overworld.getBlocks(new BlockVolume({ x: cx * 16, y: 40, z: cz * 16 }, { x: cx * 16 + 15, y: 200, z: cz * 16 + 15 }), { includeTypes: [type] }, false).getCapacity();
          } catch {
            // unloaded or unknown block id
          }
        }
      }
      tallies.push(`${type.replace("minecraft:", "")} ${n}`);
    }
    console.warn(`[probe]   vanilla blocks: ${tallies.join(", ")}`);

    // Grain directions. A log lying along x should have wood next to it along x, whatever rotation the
    // tree was placed with. If the game rotated the tree but not the blocks' direction state, about half
    // of the sideways logs would instead have their neighbors along the other horizontal axis.
    const isWood = (x: number, y: number, z: number) => {
      const type = overworld.getBlock({ x, y, z })?.typeId;
      return type === id("sequoia_log") || type === id("sequoia_wood");
    };
    const grain: string[] = [];
    for (const kind of ["sequoia_log", "sequoia_wood"]) {
      for (const [face, along] of [["up", "y"], ["east", "x"], ["north", "z"]] as const) {
        let count = 0, aligned = 0, crossed = 0, sampled = 0;
        for (let cx = chunkX0; cx <= chunkX0 + 2 * RADIUS_CHUNKS; cx++) {
          for (let cz = chunkZ0; cz <= chunkZ0 + 2 * RADIUS_CHUNKS; cz++) {
            const volume = new BlockVolume({ x: cx * 16, y: -64, z: cz * 16 }, { x: cx * 16 + 15, y: 319, z: cz * 16 + 15 });
            try {
              const found = overworld.getBlocks(
                volume,
                { includePermutations: [BlockPermutation.resolve(id(kind), { "minecraft:block_face": face })] },
                false,
              );
              count += found.getCapacity();
              if (along === "y" || sampled >= 400) continue;
              for (const { x, y, z } of found.getBlockLocationIterator()) {
                if (sampled++ >= 400) break;
                const onX = isWood(x + 1, y, z) || isWood(x - 1, y, z);
                const onZ = isWood(x, y, z + 1) || isWood(x, y, z - 1);
                if (along === "x" ? onX : onZ) aligned++;
                else if (along === "x" ? onZ : onX) crossed++;
              }
            } catch {
              // unloaded corner chunk
            }
          }
        }
        grain.push(`${kind} ${along}-grain: ${count}` + (along === "y" ? "" : ` (of ${Math.min(sampled, 400)} sampled: ${aligned} continue along ${along}, ${crossed} only across)`));
      }
    }
    for (const line of grain) console.warn(`[probe]   ${line}`);

    console.warn(`[probe] scanned ${chunksScanned} chunks: ${logs} logs, ${leaves} leaves, ${chunksWithLogs} chunks contain logs, highest log y=${highestLog}`);
    for (const sample of samples) console.warn(`[probe]   ${sample}`);
    overworld.runCommand(`tickingarea remove ${AREA_NAME}`);
  }, WAIT_TICKS);
});
