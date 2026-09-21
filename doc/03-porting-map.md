# 03 — Porting map: each Java feature on Bedrock

For every feature in [01-java-mod-inventory.md](01-java-mod-inventory.md): how it is built on Bedrock
and how hard it is. Effort is relative: **S** = an evening, **M** = a few sessions, **L** = a real
sub-project. Capabilities were checked against the 1.26.50 vanilla samples and the stable Script API
(2.10.0).

The pattern to notice: the effort ranking **inverts** compared to Java. The mobs get easier, the
"boring" building blocks get much harder, and the tree math moves into a different place.

## World generation

Covered in depth in [04-worldgen-design.md](04-worldgen-design.md).

| Feature | Bedrock approach | Effort |
|---|---|---|
| Tree algorithm | Port to TypeScript as a pure module (no Minecraft imports) | M |
| Trees at worldgen | Bake variants to `.mcstructure` offline; place via feature rule with the age field in Molang | L |
| Sapling growth | Custom block + `onRandomTick` + the same TS module, placed across ticks | M |
| Biome | Custom biome with `replace_biomes` over the taiga family; podzol surface builder; client colors in RP | M |
| Ground cover | Stock feature types, mostly reusing vanilla features | S |
| Bee nests, moss ring | Deferred | — |

## Mobs

| Feature | Bedrock approach | Effort |
|---|---|---|
| Bear: model and texture | Reference vanilla `geometry.polarbear` with the existing texture. Sitting pose and collar need custom bones/animation in Blockbench | S–M |
| Bear: tame, sit, follow, defend, heal, breed, cubs | Pure JSON; the vanilla wolf file has every component | S |
| Bear: dyeable collar | `is_dyeable` + `color` components; collar as a separate tinted layer in the render controller | M |
| Bear: hunting prey | `nearest_attackable_target` with family filters, in the wild component group only | S |
| Bear: warning stance | `entity_sensor` at 6 and 2 blocks, `has_equipment` filter for the food bypass, events swapping component groups, own rear-up animation driven by an entity property | M |
| Bear: cub protection | Sensor for nearby baby of the same family overriding the pacified state | S–M |
| Bear: eats berries/crops | Fox's `behavior.raid_garden` with a block list | S |
| Bear: raids chests, harvests hives | `behavior.move_to_block` to reach it (JSON), then script: `BlockInventoryComponent` to eat food, set `honey_level` to 0. The chest lid cannot be animated from script; play the sound only | M |
| Bear: climbs logs | **Hard.** Bedrock's climb navigation cannot be limited to logs. Script workaround (detect adjacent log, apply impulse) will look rough. Stretch goal | L |
| Bear: bite in water | Different attack in a water component group via `in_water` filter | S |
| Eagle: flight and swoop | Phantom's `movement.glide`, `circle_around_anchor`, `swoop_attack`; omit `burns_in_daylight`; retarget to small animals. Expect tuning, phantom AI assumes player targets | M |
| Eagle: model | Vanilla `geometry.phantom` by reference; copy the phantom's `pre_animation` variables | S |
| Eagle: sounds, dive scream | `sound_definitions.json`; scream from an animation controller state or a script velocity check. The five OGG files carry over as-is | S |
| Spawning | Spawn rules with `has_biome_tag` on the grove's tag | S |

## Blocks and items

Bedrock has **no vanilla-parent inheritance** for blocks. Each shape needs its own geometry,
permutations for every state, collision boxes, and often script. Block traits and redstone
components that became stable through 2025–26 make all of these possible; they are just laborious.

| Block | Bedrock approach | Effort |
|---|---|---|
| Planks | Plain block | S |
| Logs, wood, stripped variants | `placement_position` trait + rotation permutations | S |
| Stripping | Custom component `onPlayerInteract`, check axe tag, swap block | S |
| Leaves | Plain block with foliage tint. **Decay is not built in**; `onRandomTick` search for a log tag nearby. Worldgen leaves simply never decay unless we add this, which removes the Java "persistent leaves" problem | S (no decay) / M |
| Sapling | Cross-model block, placement filter, growth script (see worldgen) | M |
| Slab | Vertical-half trait; double-slab merging needs script | M |
| Trapdoor, button, pressure plate | Wiki patterns exist; `redstone_producer` + tick/step events | M each |
| Fence | `connection` trait | M |
| Stairs | Many permutations and collision shapes (corner states) | L |
| Fence gate, door | Multi-block trait, open state, mob pathing through doors | L each |
| Recipes, loot, tags | Standard JSON. Tagging the items `minecraft:planks` / `minecraft:logs` makes vanilla recipes accept them | S |
| Flammability | `minecraft:flammable` component | S |
| Boat, signs | Were never implemented on Java; skip | — |

**Reusable assets.** Everything in the Java mod is free to reuse. The ten block textures, three entity
textures (bear, collar, eagle), five item textures (boat, chest boat, door, sign, hanging sign), and
five eagle OGG sounds carry over unchanged; Bedrock uses the same PNG and OGG formats. The Java
`models/` and `blockstates/` JSON do not carry over: Bedrock block geometry and permutations are a
different format and are rebuilt.

## What this suggests

1. **The whole wood set ships in the first family release, at a "good enough" bar.** Logs, planks, leaves
   and sapling come early because the forest needs them. Stairs through doors cost the most and deliver
   the least novelty, so they come late, simplest first, each to a defined minimum (orientation,
   collision, activation, drops, recipe) with the fiddly vanilla edge cases deferred. See M7 in
   [05-roadmap.md](05-roadmap.md).
2. **The bear is mostly cheap.** Everything except log climbing and chest raiding is JSON, and a tame
   bear with a warning stance is already most of the fun. Log climbing is held back from the first
   release: a janky climb is worse in a family session than no climb.
3. **The risk is concentrated in worldgen**, specifically in whether large baked structures place
   cleanly and quickly. Prototype that first.
