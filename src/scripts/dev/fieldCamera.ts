// Development aid, paired with tools/dev/field-camera.mjs: reads back the planes of wool that the field
// camera's worldgen rules painted, one text row per line of blocks, so the Mac can rebuild the image.
import { system, world } from "@minecraft/server";
import { NAMESPACE, id } from "../../core/ns.ts";

const WOOL = ["white", "light_gray", "gray", "black", "brown", "red", "orange", "yellow", "lime", "green", "cyan", "light_blue", "blue", "purple", "magenta", "pink"];
const LEVEL = new Map(WOOL.map((color, k) => [`minecraft:${color}_wool`, k.toString(16)]));
const CHUNKS = 10; // a 10 x 10 chunk square is the most one ticking area may cover
const AREA = "trailhead_field_camera";

system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id !== `${NAMESPACE}:field_camera`) return;
  const parts = event.message.trim().split(/\s+/);
  const planes = Number(parts[0]);
  const baseY = Number(parts[1]);
  const overworld = world.getDimension("overworld");
  const size = CHUNKS * 16;
  // "grove" centers the window on the nearest Sequoia Grove; otherwise it starts at the world origin.
  let ox = 0, oz = 0;
  if (parts[2] === "grove") {
    const found = overworld.calculateClosestBiomeFromSeed({ x: 0, y: 64, z: 0 }, id("sequoia_grove"));
    if (found) {
      ox = Math.floor(found.x / 16) * 16 - size / 2;
      oz = Math.floor(found.z / 16) * 16 - size / 2;
    }
  }
  console.warn(`[field] origin ${ox} ${oz}`);
  overworld.runCommand(`tickingarea remove ${AREA}`);
  overworld.runCommand(`tickingarea add ${ox} 0 ${oz} ${ox + size - 1} 0 ${oz + size - 1} ${AREA}`);
  console.warn(`[field] seed ${(world as unknown as { seed?: string }).seed ?? "unknown"}`);

  let waited = 0;
  const poll = system.runInterval(() => {
    waited++;
    let ready = false;
    try {
      ready = [0, size - 1].every((x) => [0, size - 1].every((z) => overworld.getBlock({ x: ox + x, y: baseY, z: oz + z }) !== undefined));
    } catch {
      ready = false;
    }
    if (!ready && waited < 120) return;
    system.clearRun(poll);
    if (!ready) return console.warn("[field] done (area never loaded)");
    system.runTimeout(() => system.runJob(read()), 100); // a little longer, so late chunks finish decorating
  }, 20);

  function* read(): Generator<void, void, void> {
    for (let plane = 0; plane < planes; plane++) {
      for (let z = 0; z < size; z++) {
        let row = "";
        for (let x = 0; x < size; x++) {
          row += LEVEL.get(overworld.getBlock({ x: ox + x, y: baseY + 2 * plane, z: oz + z })?.typeId ?? "") ?? ".";
        }
        console.warn(`[field] ${plane} ${z} 0 ${row}`);
        if (z % 4 === 3) yield;
      }
    }
    overworld.runCommand(`tickingarea remove ${AREA}`);
    console.warn("[field] done");
  }
});
