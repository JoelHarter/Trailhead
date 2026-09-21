# 01 — What the Java mod contains

A feature-by-feature inventory of `/Users/joel/sequoia-mod` (Fabric, Minecraft Java 1.21.1), taken from
its docs and source. This is the list of things the Bedrock version has to reproduce, replace, or drop.
How each one maps onto Bedrock is covered in [03-porting-map.md](03-porting-map.md).

Total custom Java: about 2,700 lines in 13 files. Two files are most of it:
`GrizzlyBearEntity.java` (976 lines) and `SequoiaTrunkPlacer.java` (581 lines).

## Blocks and items

15 blocks, all following the vanilla wood-family pattern:

| Group | Blocks |
|---|---|
| Wood | sequoia log, stripped log, wood, stripped wood, planks |
| Nature | leaves (decay, drop saplings), sapling (grows the full algorithmic tree) |
| Crafted | stairs, slab, fence, fence gate, door, trapdoor, button, pressure plate |

Plus: recipes (10), block loot tables (15), axe stripping, flammability values, and membership in
vanilla tags (logs, planks, mineable/axe, etc.). Textures exist for boat, chest boat, sign and hanging
sign, but those were never implemented in Java either.

In Java every one of these blocks is a one-liner, because it instantiates a vanilla class
(`StairsBlock`, `DoorBlock`, ...) and inherits all behavior. Only 10 block textures are needed.

## World generation

**Biome** `sequoia_grove`: temperature 0.25, downfall 0.8, custom sky/fog/water/grass/foliage colors,
spawn list (grizzly, eagle, wolf, fox, rabbit, salmon, standard monsters). It is injected into the
Overworld's multi-noise biome table by a mixin, as a cool/moist/inland/hilly climate slot.

**Ground cover features**: podzol/coarse dirt/moss surface soil, large ferns, taiga grass, dead bushes,
mushrooms, sweet berries, azure bluets, lily of the valley, dandelion patches, spruce and mega spruce
understory.

**The sequoia tree** (`SequoiaTrunkPlacer`), the heart of the mod. Attempted 32 times per chunk; each
attempt runs:

1. **Age field.** `A(x,z)` = three sin·cos waves (wavelengths ~628, ~251, ~78 blocks), clamped, pushed
   through a logistic S-curve (k = 3.5). Deterministic in world position; does not use the world seed.
2. **Radius.** `rt = 0.5 + 3.35·A`, so trunks range from 0.5 to 3.85 blocks in radius.
3. **Growth roll.** `p = min(1, 0.08 / rt^1.5)`. With 32 attempts this yields at most about 5 small
   trees per chunk in the youngest areas, down to about 1 giant per 3 chunks in the most ancient.
4. **Height.** `H = min(24·rt, 101) · (1 + N(0, 0.1))`, capped at 116.
5. **Trunk + root flare.** Per layer, a disc of radius `rt·(1−y/H)^0.35` plus an angular 4-harmonic
   noise flare decaying as `exp(−y/(0.2H))`. Sub-block random center offset.
6. **Root cone.** Below ground, each layer keeps only logs with all 4 neighbors, until nothing is left.
7. **Branches.** `round(3.2·√H)` branches between 45% and 92% of height, golden-angle spacing, lengths
   following the canopy envelope `R(z) = 0.1768·√(H·z)`, drawn with a 6-connected 3D DDA line. Short
   branches near the top are "cut" (leaves only).
8. **Leaf pads.** A flat fan-shaped ellipsoid at each branch tip, kept only within taxicab distance 4 of
   a log (BFS dilation), so no leaf floats or decays.
9. **Crown.** Paraboloid cap of leaves from the highest branch to the top, within taxicab distance 3.
10. **Extras.** 5% chance of a bee nest at 12–17 blocks up (with a separate clearance pass), moss carpet
    ring around trees with `rt ≥ 1.5`, podzol conversion when grown from a sapling.

Size envelope of the largest tree: about 116 tall plus ~7 of root below ground; canopy radius about 15
plus leaf pads, so roughly **39 × 125 × 39 blocks**. Trunk base up to ~7 blocks radius with the flare.

Important property for porting: steps 1–9 are a **pure function** of `(x, z, random numbers)` that outputs
a set of block positions. The world is only touched to check "is this spot replaceable" and to probe
the ground for moss/podzol. Nothing in the math depends on Java or Minecraft classes.

## Mobs

Both mobs reuse a **vanilla model** with a new texture; there is no custom geometry.

**Grizzly bear** — extends the polar bear (model, attributes, attack animation). Adds:

- Territorial warning: untamed bears rear up and freeze facing anything within 6 blocks, attack inside
  2 blocks. Holding honey/fish/berries suppresses the warning. Mothers near cubs ignore that.
- Taming (honey bottle, honeycomb, sweet/glow berries), sitting, follow/defend owner, dyeable collar
  (separate collar texture layer), healing with raw fish, breeding with honey.
- Hunting: fish, rabbit, sheep, pig, goat, llama, chicken.
- Raiding: walks to chests/barrels, opens them, eats food out of the inventory; harvests honey from
  hives without breaking them; eats berries, crops, mushrooms.
- Climbs logs vertically, and steers toward trunks when its target is above it.
- Bites without rearing when in water. Wild bears spawn with 1–3 cubs.

**Eagle** — extends the phantom (model, circling and swooping flight AI). Changes: no daylight burning,
no insomnia spawning, hunts fish/rabbits/cats instead of players, 20 HP / 10 damage, 5 custom sounds
(scream on dive, short cries perched, long screams soaring), drops feathers.

## Prototype files (Julia / MATLAB)

- `sandbox/sequoia_color_*.jl` / `.m` — **texture generators**. They write `sequoia_log_top.png` (mirrored
  8×8 ring pattern: bark, sapwood, heartwood with alternating dark rings, multiplicative noise) and
  `sequoia_log.png` (diagonal 6-shade bark pattern). The output PNGs carry over unchanged; the scripts
  matter only if the textures are to be regenerated or a stripped/plank variant derived the same way.
- `src/test/SequoiaTrunkPlacer.jl` — the original tree prototype, rendered with GLMakie. It shares the
  constants and the trunk, flare, branch, DDA, and crown math with the Java, but it is an **earlier
  snapshot**:
  - draws one tree at maximum radius; no age field, density law, beehives, moss, or podzol;
  - leaves are taxicab diamonds along the outer 60% of every branch, where the Java later switched to
    a fan-shaped ellipsoid pad at each branch tip;
  - computes the root cone but never places it;
  - uses unseeded `rand`, so its output cannot be compared block-for-block.

**The Java `SequoiaTrunkPlacer` is therefore the authoritative spec** for the port. The Julia file is a
readable reference for the geometry and a precedent for the viewer the new project should have: being
able to look at a generated tree on the Mac without launching Minecraft.
