import { system, world } from "@minecraft/server";
import { NAMESPACE, id } from "../core/ns.ts";
import { leavesComponent } from "./blocks/leaves.ts";
import { saplingComponent } from "./blocks/sapling.ts";
import { strippableComponent } from "./blocks/strippable.ts";
import "./dev/blockTests.ts";
import "./dev/fieldCamera.ts";
import "./dev/worldgenProbe.ts";

// Custom block behaviors. The names match the "ns:..." components in the block files.
system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
  blockComponentRegistry.registerCustomComponent(id("leaves"), leavesComponent);
  blockComponentRegistry.registerCustomComponent(id("sapling"), saplingComponent);
  blockComponentRegistry.registerCustomComponent(id("strippable"), strippableComponent);
});

// Shows up in the server log, proving the script module loaded.
console.warn(`[Trailhead] scripts loaded (namespace "${NAMESPACE}", built ${__BUILD_TIME__})`);

world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  const player = event.player;
  system.run(() => {
    player.sendMessage(`§2Trailhead§r is loaded. Built ${__BUILD_TIME__}.`);
    player.sendMessage(`Try: /give @s ${id("sequoia_planks")} 64`);
  });
});
