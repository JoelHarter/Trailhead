import type { Block } from "@minecraft/server";
import { id } from "../../core/ns.ts";

const SEQUOIA_WOOD = new Set(
  ["sequoia_log", "sequoia_wood", "stripped_sequoia_log", "stripped_sequoia_wood"].map(id),
);

/** True for anything leaves can hang from: our wood, and vanilla logs (which carry the "log" tag). */
export function isWood(block: Block | undefined): boolean {
  if (!block) return false;
  return SEQUOIA_WOOD.has(block.typeId) || block.hasTag("log");
}
