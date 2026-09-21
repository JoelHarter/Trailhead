// Sequoia sapling: grows into a full tree using the same generator that bakes the forest.
// Deliberately simple for now (Joel has plans for something more interesting later).
import { type Block, type BlockCustomComponent, type Dimension, EquipmentSlot, GameMode } from "@minecraft/server";
import { Rng } from "../../core/rng.ts";
import { generateSequoia } from "../../core/trees/sequoia.ts";
import { placeTree } from "../trees/placeTree.ts";

const GROW_CHANCE_PER_RANDOM_TICK = 1 / 7; // vanilla saplings advance on about 1 random tick in 7
const BONE_MEAL_SUCCESS = 0.45; // as vanilla
const MIN_LIGHT = 9;

// For now a sapling always grows the smallest kind of tree, varied only by ordinary chance (like any
// vanilla sapling), not by where it stands: no forest age field here.
const SAPLING_TREE_RADIUS = { min: 0.4, max: 0.5 };

export function growSequoia(dimension: Dimension, block: Block): void {
  const trueRadius = SAPLING_TREE_RADIUS.min + Math.random() * (SAPLING_TREE_RADIUS.max - SAPLING_TREE_RADIUS.min);
  const tree = generateSequoia({ trueRadius, rng: new Rng(Math.floor(Math.random() * 0xffffffff)) });
  placeTree(dimension, block.location, tree);
}

function hasLight(block: Block): boolean {
  try {
    return (block.above()?.getLightLevel() ?? 15) >= MIN_LIGHT;
  } catch {
    return true;
  }
}

export const saplingComponent: BlockCustomComponent = {
  onRandomTick({ block, dimension }) {
    if (Math.random() < GROW_CHANCE_PER_RANDOM_TICK && hasLight(block)) growSequoia(dimension, block);
  },

  onPlayerInteract({ block, player, dimension }) {
    const equipment = player?.getComponent("equippable");
    const held = equipment?.getEquipment(EquipmentSlot.Mainhand);
    if (!player || !equipment || held?.typeId !== "minecraft:bone_meal") return;

    if (player.getGameMode() !== GameMode.Creative) {
      if (held.amount > 1) {
        held.amount -= 1;
        equipment.setEquipment(EquipmentSlot.Mainhand, held);
      } else {
        equipment.setEquipment(EquipmentSlot.Mainhand, undefined);
      }
    }
    dimension.spawnParticle("minecraft:crop_growth_emitter", block.center());
    dimension.playSound("item.bone_meal.use", block.center());
    if (Math.random() < BONE_MEAL_SUCCESS) growSequoia(dimension, block);
  },
};
