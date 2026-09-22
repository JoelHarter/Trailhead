// Development aid: checks block behaviors on the server without a player.
// From the server console:  scriptevent <namespace>:test_blocks      (or: npm run test:blocks)
// Results appear in the server log about 25 seconds later.
import { BlockPermutation, ItemStack, system, world } from "@minecraft/server";
import { NAMESPACE, id } from "../../core/ns.ts";
import { decayIfDetached } from "../blocks/leaves.ts";
import { growSequoia } from "../blocks/sapling.ts";

const AREA = "trailhead_block_tests";

system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id !== `${NAMESPACE}:test_blocks`) return;
  const overworld = world.getDimension("overworld");
  const X = 3000, Z = 3000, Y = 250; // high in the air, clear of terrain
  const report = (name: string, ok: boolean, detail = "") => console.warn(`[test] ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);

  overworld.runCommand(`tickingarea remove ${AREA}`);
  overworld.runCommand(`tickingarea add circle ${X} 64 ${Z} 3 ${AREA}`);
  console.warn("[test] preparing ...");

  // Freshly generated chunks take a while to become available; poll until the test area is loaded.
  let waited = 0;
  const poll = system.runInterval(() => {
    waited++;
    let ready = false;
    try {
      ready = overworld.getBlock({ x: X + 24, y: Y, z: Z }) !== undefined && overworld.getBlock({ x: X, y: Y, z: Z }) !== undefined;
    } catch {
      ready = false;
    }
    if (!ready && waited < 90) return;
    system.clearRun(poll);
    if (!ready) return console.warn("[test] FAIL  test area never loaded");
    runTests();
  }, 20);

  const runTests = () => {
    // Item tags: what makes vanilla recipes (sticks, tables, chests, charcoal ...) accept sequoia wood.
    const planksTags = new ItemStack(id("sequoia_planks")).getTags();
    const logTags = new ItemStack(id("sequoia_log")).getTags();
    report("planks carry the minecraft:planks item tag", planksTags.includes("minecraft:planks"), planksTags.join(", "));
    report("logs carry minecraft:logs and logs_that_burn", logTags.includes("minecraft:logs") && logTags.includes("minecraft:logs_that_burn"), logTags.join(", "));

    // Leaf decay. Three leaves: cut off, attached through another leaf to a log, and cut off but player-placed.
    const leaf = BlockPermutation.resolve(id("sequoia_leaves"));
    const persistent = BlockPermutation.resolve(id("sequoia_leaves"), { [id("persistent")]: true } as never);
    const log = BlockPermutation.resolve(id("sequoia_log"));
    const at = (dx: number) => ({ x: X + dx, y: Y, z: Z });
    overworld.setBlockPermutation(at(0), leaf);
    overworld.setBlockPermutation(at(10), log);
    overworld.setBlockPermutation(at(11), leaf);
    overworld.setBlockPermutation(at(12), leaf);
    overworld.setBlockPermutation(at(20), persistent);

    // Sapling growth on real ground.
    const ground = overworld.getTopmostBlock({ x: X + 24, z: Z });
    const saplingAt = ground ? { x: ground.x, y: ground.y + 1, z: ground.z } : undefined;
    if (saplingAt) {
      overworld.setBlockType(saplingAt, id("sequoia_sapling"));
      growSequoia(overworld, overworld.getBlock(saplingAt)!);
    }

    // Decay logic, called directly on each test leaf.
    const decays = (dx: number) => decayIfDetached(overworld.getBlock(at(dx))!);
    report("a leaf cut off from wood is judged detached", decays(0));
    report("leaves attached to a log (directly, and through another leaf) are kept", !decays(11) && !decays(12));
    report("a player-placed (persistent) leaf is kept even when cut off", !decays(20));

    // Wiring: does the game itself trigger the check? Five more cut-off leaves, and a mild speed-up.
    // (Never use a large random tick speed here: with a forest loaded it swamps the server.)
    for (let i = 0; i < 5; i++) overworld.setBlockPermutation({ x: X + 2 * i, y: Y + 4, z: Z }, leaf);
    overworld.runCommand("gamerule randomtickspeed 25");
    system.runTimeout(() => {
      overworld.runCommand("gamerule randomtickspeed 1");
      const type = (dx: number) => overworld.getBlock(at(dx))?.typeId;
      let gone = 0;
      for (let i = 0; i < 5; i++) {
        const spot = { x: X + 2 * i, y: Y + 4, z: Z };
        if (overworld.getBlock(spot)?.typeId === "minecraft:air") gone++;
        overworld.setBlockType(spot, "minecraft:air");
      }
      report("the game triggers decay on its own (random ticks)", gone >= 2, `${gone} of 5 cut-off leaves decayed in 25 s`);
      report("the detached test leaf is gone, the attached ones remain", type(0) === "minecraft:air" && type(11) === id("sequoia_leaves"), `${type(0)}, ${type(11)}`);

      if (saplingAt) {
        let wood = 0, top = saplingAt.y;
        for (let y = saplingAt.y; y < saplingAt.y + 130; y++) {
          const t = overworld.getBlock({ x: saplingAt.x, y, z: saplingAt.z })?.typeId;
          if (t === id("sequoia_log") || t === id("sequoia_wood")) { wood++; top = y; }
        }
        const below = overworld.getBlock({ x: saplingAt.x + 2, y: saplingAt.y - 1, z: saplingAt.z })?.typeId;
        report("a sapling grows into a tree", wood >= 3, `trunk ${wood} blocks tall at ${saplingAt.x},${saplingAt.y},${saplingAt.z}; ground nearby is ${below}`);
      } else {
        report("a sapling grows into a tree", false, "no ground found");
      }
      for (const dx of [0, 10, 11, 12, 20]) overworld.setBlockType(at(dx), "minecraft:air");
      overworld.runCommand(`tickingarea remove ${AREA}`);
      console.warn("[test] done");
    }, 20 * 25);
  };
});

// Entity checks, run by the same script event: spawn a grizzly, then drive its events and read back the results.
system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id !== `${NAMESPACE}:test_entities`) return;
  const overworld = world.getDimension("overworld");
  const report = (name: string, ok: boolean, detail = "") => console.warn(`[test] ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  const X = 3000, Z = 3000;
  overworld.runCommand(`tickingarea remove ${AREA}`);
  overworld.runCommand(`tickingarea add circle ${X} 64 ${Z} 2 ${AREA}`);
  let waited = 0;
  const poll = system.runInterval(() => {
    let ready = false;
    try {
      ready = overworld.getBlock({ x: X, y: 100, z: Z }) !== undefined;
    } catch {
      ready = false;
    }
    if (!ready && ++waited < 90) return;
    system.clearRun(poll);
    if (!ready) return console.warn("[test] FAIL  entity test area never loaded");
    const top = overworld.getTopmostBlock({ x: X, z: Z });
    if (!top) return console.warn("[test] FAIL  no ground at the entity test area");
    const at = { x: X + 0.5, y: top.y + 1, z: Z + 0.5 };
    try {
      const bear = overworld.spawnEntity(id("grizzly") as never, at);
      report("a grizzly bear spawns", bear.isValid, bear.typeId);
      report("it is in the grizzly and bear families", bear.getComponent("type_family")?.hasTypeFamily("grizzly") === true && bear.getComponent("type_family")?.hasTypeFamily("bear") === true);
      report("it has 30 health", bear.getComponent("health")?.currentValue === 30, String(bear.getComponent("health")?.currentValue));
      report("an adult spawns untamed and not a cub", !bear.getComponent("is_baby") && !bear.getComponent("is_tamed"));
      bear.triggerEvent("trailhead:intruder_near");
      system.runTimeout(() => {
        report("the warning event makes it rear up (standing property)", bear.getProperty(id("standing")) === true);
        bear.triggerEvent("trailhead:intruders_gone");
        bear.triggerEvent("minecraft:on_tame");
        system.runTimeout(() => {
          report("after taming it is tamed, sittable, and dyeable", !!bear.getComponent("is_tamed") && !!bear.getComponent("minecraft:is_dyeable"), `color ${bear.getComponent("color")?.value}`);
          const cub = overworld.spawnEntity(id("grizzly") as never, at, { spawnEvent: "minecraft:entity_born" } as never);
          system.runTimeout(() => {
            report("entity_born gives a cub", !!cub.getComponent("is_baby"));
            bear.remove();
            cub.remove();
            overworld.runCommand(`tickingarea remove ${AREA}`);
            console.warn("[test] done");
          }, 10);
        }, 10);
      }, 10);
    } catch (error) {
      report("entity test threw", false, String(error));
    }
  }, 20);
});
