// Using an axe on a sequoia log or wood block strips it, keeping the direction of its grain.
import { type BlockCustomComponent, BlockPermutation, EquipmentSlot, GameMode, ItemStack } from "@minecraft/server";

export const strippableComponent: BlockCustomComponent = {
  onPlayerInteract({ block, player, dimension }, { params }) {
    const into = (params as { into?: string }).into;
    const equipment = player?.getComponent("equippable");
    const axe = equipment?.getEquipment(EquipmentSlot.Mainhand);
    if (!into || !player || !equipment || !axe?.hasTag("minecraft:is_axe")) return;

    const face = block.permutation.getState("minecraft:block_face" as never);
    block.setPermutation(BlockPermutation.resolve(into, { "minecraft:block_face": face } as never));
    dimension.playSound("use.wood", block.center());

    if (player.getGameMode() === GameMode.Creative) return;
    const durability = axe.getComponent("durability");
    if (!durability) return;
    if (durability.damage + 1 >= durability.maxDurability) {
      equipment.setEquipment(EquipmentSlot.Mainhand, undefined);
      player.playSound("random.break");
    } else {
      durability.damage += 1;
      equipment.setEquipment(EquipmentSlot.Mainhand, axe as ItemStack);
    }
  },
};
