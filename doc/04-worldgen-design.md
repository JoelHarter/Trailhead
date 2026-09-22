# 04 — World generation design

How to get the sequoia grove and its algorithmic trees into Bedrock. This is the part of the port
where Bedrock differs most from Java, so it gets its own document. Platform facts here were checked
against Microsoft's creator docs and the Bedrock Wiki in September 2026; items marked **(test)** could
not be confirmed from documentation and need an in-game experiment.

## Spike result (2026-09-21): the approach works

Tested on Bedrock Dedicated Server 1.26.51.1 with a throwaway feature rule placing a largest-class
sequoia in every Overworld chunk at 1-in-3 odds, checked headlessly with `npm run probe` (a script
force-loads 81 fresh chunks and counts the add-on's blocks).

- **Tall structures place fine.** Trunks ran from y=58 to y=162, over 100 blocks, with the root cone
  below ground. No vertical limit was hit.
- **Chunk borders are not a problem.** Branches and leaves spill into neighboring chunks. The
  leaf-to-log ratio in the world (0.226) matches the baked files (0.244) within what edge effects of
  the scanned area explain, so nothing substantial is being clipped.
- **It is fast.** 81 chunks containing about 20 giants generated in under 20 seconds on the emulated
  server, with no errors or warnings.
- **Placement is reliable.** About 20 trees in 69 chunks at 1-in-3 odds: nearly every attempt placed.
  Empty `constraints` means no intersection checks at all, which suits a dense forest.
- **Real footprints are smaller than estimated:** the largest trees are about 28 x 27, well under the
  48 x 48 limit (the earlier 39 estimate overcounted the leaf pads).
- **Baking is cheap:** all 40 structures (10 size classes x 4 variants) generate in about 150 ms and
  total 7.7 MB uncompressed.

Still to verify, on the phone: that trees look right (rotation, void cells leaving terrain intact,
trunk centered where expected). Still to build: the age-field gating in Molang, which replaces the
throwaway rule.

## What `q.noise` is (measured 2026-09-22)

Molang's `q.noise(x, z)` is the one noise function available to world generation, and Mojang does not
document what it computes. It was measured with the **field camera** (`tools/dev/field-camera.mjs`),
which paints any Molang expression as planes of 16 wool colors during world generation, reads the
blocks back by script, and rebuilds the image on the Mac (`tools/dev/field_camera_analyze.py`). The
camera's self-test, a plain ramp, comes back exact.

- **Smooth, and the same in every direction.** The mean change per block is equal along x and z
  (0.859 against 0.864 bands). Contours close around hills and hollows: a topographic look.
- **Feature size:** the sign changes about 1.42 times per input unit, so neighboring hills are about
  **1.4 input units** apart. `q.noise(x/64, z/64)` gives hills roughly 90 blocks apart.
- **Range and spread:** values fill −1 to 1, almost **evenly** (standard deviation 0.45; perfectly even
  would be 0.58), not bunched near zero the way classic Perlin noise is. So `(n + 1) / 2` already spreads
  ages across the whole range without a contrast curve.
- **It is simplex noise.** Not classic Perlin: at whole-number inputs it is not zero, it is static. A
  textbook 2D simplex implementation (`src/core/fields/noise.ts`) reproduces its value histogram within
  a few percent and its feature size exactly (1.41 sign changes per unit against 1.42). Only the game's
  permutation table is unknown, so a look-alike shows the character of a field but not a world's map.
- **Ignores the world seed.** Two worlds with different seeds gave 100% identical planes. Every world
  gets the same map, as with the Java mod's sine field.
- **Does not repeat** at 256 units (a shifted copy matched 8% of blocks, which is chance).
- **An offset gives an independent field:** `q.noise(x/s + 50.5, z/s + 50.5)` matched the original in
  9% of blocks, chance again. That is how to get several unrelated layers.
- **Layers add as expected:** Molang arithmetic on several `q.noise` calls works inside feature rules.
  A sum of two or three layers becomes bell-shaped (sd 0.34, then 0.30), so a layered field needs
  rescaling or a contrast curve to reach the extremes as often as a single layer does.

Also measured: `q.heightmap(x, z)` works at the column being decorated, reads 0 about half the time 24
blocks away (neighboring chunks not yet generated), and reads 0 at any fixed faraway point. So terrain
cannot serve as a hash of the world seed, and nothing else in Molang depends on the seed either: a
per-world shift of the age map has to be baked into the pack when the world is made.

Consequence for the viewer: TypeScript cannot call the game's noise, so the viewer would use a
look-alike with the same statistics. It shows the character of a forest, not the actual map of a world.

## The forest age map (built 2026-09-22)

Recipe, in `src/core/fields/age.ts`: three layers of simplex noise (groves, detail, tree-to-tree), each
with a hill spacing in blocks and a weight; the weighted sum divided by the root of the summed squared
weights, so the spread stays that of a single layer whatever the weights; mapped to 0..1; then a
logistic contrast curve. `src/core/fields/ageMolang.ts` writes the identical recipe as a Molang
expression from the same parameters, with `q.noise` in place of the look-alike, and a test evaluates
that Molang as code against the TypeScript at 400 positions.

Placement, in `src/bake/bake.ts`: Bedrock has no feature that chooses by condition, so each of the ten
size classes gets a scatter that makes as many attempts per chunk as that class would grow under the
density law (32 × `K / radius^1.5`, as iterations plus a chance), at random spots, feeding a gate
scatter whose `iterations` is `(class here == mine and ground above water level) ? 1 : 0`. Statistically
this is the Java scheme (attempt, read the age, size the tree, roll to grow), with the field evaluated
about 40 times per chunk instead of 320. The gate's `y` is `q.heightmap(...) - 8` with every outer
level at `y: 0`, which works whether nested `y` is relative or absolute.

The rest of the grove that depends on age (soil, dandelions, understory spruce) is written by the same
baker against the same expression; see `writeAgeDrivenDecoration`. The soil walks all 256 columns of a
chunk with two nested fixed-grid scatters (x, then z), and the giant/ordinary spruce choice is two gates
tried in order under an `aggregate_feature` with `early_out: first_success`, since Molang temporaries
cannot carry one random roll across features.

**Offset limit.** With map offsets around 18,000 blocks, every age-gated rule stopped placing anything,
on two worlds, while the field camera still showed a sensible class map (with the raw noise's spread
shrunk from 0.49 to 0.35). Offsets of a few thousand work. The cause is not understood; `world:reset`
keeps offsets within ±4000.

The per-world offset lives in `trailhead.config.json` (`worldOffset`), re-rolled by `npm run world:reset`.

Verified with the field camera inside a real grove: the in-game class map shows all ten classes and the
same character as the viewer, and wood appears only in the grove's chunks.

## The constraint

On Java, the mod registers a `TrunkPlacer` and Minecraft calls our code while it generates each chunk.
Bedrock has no equivalent. World generation is driven only by JSON, and the Script API has no
chunk-generation event (Mojang has said scripts in chunk generation would be too slow). Bedrock's JSON
`tree_feature` offers fixed trunk styles and cannot express a tapered round trunk with a root flare.

So the algorithm cannot run during world generation. It has to run **before** (offline, baking its
output into files) or **after** (in a script, once the chunk exists).

## Decision: bake trees offline, place them with JSON features

Run the tree algorithm on the development machine, save each result as a `.mcstructure` file, and let
Bedrock's stable worldgen JSON place them:

```
tree algorithm (TypeScript, runs in Node)
        │  bake: N size classes × M random variants
        ▼
structures/sequoia/c07_v3.mcstructure ...     (in the behavior pack)
        ▲
        │ placed by
feature rule → scatter (32 tries/chunk) → per-size-class gate in Molang → weighted random variant
```

Why this works for this particular algorithm:

- **It is a pure function.** Given a radius and random numbers it emits block positions; it barely
  reads the world. That is exactly what can be precomputed.
- **The trees fit.** Structures placed as features are limited to 48 × 48 blocks horizontally. The
  largest sequoia is about 39 × 125 × 39. Vertical limit for features: **(test)**, the structure-block
  limit is 64 × 255 × 64.
- **The age field survives.** Feature JSON accepts Molang with world coordinates, `math.sin`, and
  `math.cos`. `A(x,z)` is three sin·cos products and a logistic curve, which Molang can evaluate
  directly (note Molang trig takes **degrees**: `sin(x·0.01)` becomes `math.sin(v.worldx * 0.573)`).
  The groves-and-clearings look, big trees suppressing neighbors, and the density law
  `p = 0.08 / rt^1.5` can all be reproduced at generation time.
- **Trees exist the moment the chunk does.** No pop-in, no script load, works at any render distance.

What is lost: radius becomes quantized into size classes instead of continuous, and each class has a
finite number of shapes. With ~10 classes × ~6 variants × 4 random rotations, that is 240 distinct
appearances, and no two neighbors will usually match. This is a fair trade.

### Details to get right

- **No conditional feature exists** in Bedrock. The workaround is one nested scatter per size class
  whose `iterations` is a Molang expression like `(t.a > 0.6 && t.a <= 0.7) ? 1 : 0`, each pointing at
  a `weighted_random_feature` of that class's variants. Whether a temp variable can be shared across
  the nested scatters or the field must be recomputed in each: **(test)**.
- **Randomness.** Whether `math.random` in worldgen is seed-deterministic is unknown **(test)**. It only
  matters if the same seed must give the same forest for everyone; on a shared world it does not.
- **Void, not air.** Baked structures must leave empty cells as structure void (index −1 in the
  `.mcstructure` palette), otherwise each tree would carve an air box out of hills and neighbors.
- **Roots and slopes.** The root cone below ground is what lets a 14-wide trunk sit on a hillside.
  Bake it into the structure and place the structure origin below the heightmap by the root depth.
- **Rotation.** Use `facing_direction: random` with `rotate_around_center: true` (format 1.26.20+), or
  large structures rotate around a corner and drift.
- **Intersection rules.** The default constraints reject a placement when it touches non-air blocks;
  in a dense forest canopies overlap. Use a permissive allowlist (leaves, logs, plants) or
  `only_check_intersection_for_motion_blocking_blocks` (1.26.30).
- **Pack size.** `.mcstructure` is uncompressed; a giant tree is on the order of 1 MB raw but mostly
  void, so it zips very small. Watch the total, since consoles download the pack on join.
- **Performance** of placing 100-block-tall structures during generation is undocumented **(test)**.
  This is the first thing to prototype.

## Sapling growth: run the real algorithm in script

A planted sapling is the one place the algorithm can run live. A custom sapling block with an
`onRandomTick` custom component calls the same TypeScript tree code used by the baker, with the exact
continuous radius from `A(x,z)`, and places blocks in slices across ticks using `system.runJob` so the
game never stalls. Podzol conversion and the moss ring happen here too, as in Java.

Because the baker and the sapling share one module, there is a single implementation of the math. The
Node-side baker doubles as its test harness: tree output can be compared against the Java mod or the
Julia prototype block-for-block, without launching Minecraft.

## Alternative kept in reserve: marker block + script

A JSON feature could place an invisible marker block, and a script could replace each marker with a
freshly computed tree when the chunk starts ticking. This keeps the continuous radius and unlimited
variety. The drawbacks are serious for 100-block trees: chunks only tick within simulation distance,
which is shorter than render distance, so players would watch a bare hillside sprout giants as they
approach; and a forest is thousands of blocks of script work per tree. Worth a quick experiment only
if baked trees turn out to look repetitive.

## The biome

**Built 2026-09-21**, modeled on Mojang's own `mega_taiga.biome.json` (old growth pine taiga; the vanilla
biome files are in Mojang's `bedrock-samples` repository and are the best reference for the format).
Findings from doing it:

- `minecraft:replace_biomes` targets need the namespace (`minecraft:taiga`, not `taiga` as Microsoft's
  example shows).
- **The vanilla `taiga` and `mega` tags were dropped on 2026-09-22** so that spruce, soil, and ground cover could follow the age field; what they provided is rebuilt in the pack (ground cover features, spawn rules for wolf, fox, rabbit). The boulders were not rebuilt.
- **A custom biome inherits vanilla decoration through its tags.** With `taiga` and `mega` the grove
  received, from the game engine, giant and ordinary spruces, ferns, large ferns, grass, dead bushes,
  mushrooms, mossy cobblestone boulders, and (from the biome file's own surface settings) the podzol
  and coarse dirt floor. Vanilla's wolf, fox, and rabbit spawn rules key on `taiga` too. Vanilla
  decoration is not data-driven, so it cannot be edited, only opted into or out of by tag.
- Biome tags cannot contain `:`. Ours are written `ns_...` in pack files and become `trailhead_...`.
- Headless checking: `npm run probe grove` finds the nearest grove from the world seed
  (`calculateClosestBiomeFromSeed`), generates it, and counts biomes, our blocks, and vanilla decoration.
  The server's console does not accept `locate`.
- A `scatter_chance` of 100 in 100 is rejected (the denominator must be larger); leave it out instead.
- The client side (sky, fog, water, grass, and foliage colors) cannot be checked from the server.

The original plan, for reference:

Custom biomes became stable in 1.21.110. A new biome enters the Overworld by taking a share of existing
biomes through `minecraft:replace_biomes` (targets, an amount from 0 to 1, and a noise frequency).
There is no direct equivalent of Java's climate-slot injection, and terrain shape cannot be changed.

- Replace a fraction of the taiga family (taiga, old growth pine/spruce taiga), which matches the Java
  climate slot (cool, moist, inland) closely. The amount and noise scale control grove size; tune by eye.
- `minecraft:surface_builder` gives a podzol top layer; a feature adds the coarse dirt and moss patches.
- `minecraft:climate` for temperature/downfall, custom tags so feature rules and spawn rules can target
  the biome with `has_biome_tag`.
- Sky, fog, water, and foliage colors live in the resource pack (`biomes_client.json` and fog
  definitions), not in the biome file.
- Ground cover (ferns, grass, berries, flowers, mushrooms, spruce understory) maps onto stock feature
  types and can mostly reference vanilla features.

One warning: removing the add-on from a world later leaves those chunks falling back to ocean biome.
A world that uses the grove is committed to it.

## Deferred

- **Bee nests.** Bake an empty nest into a few variants, or place via a small script pass. Decide later.
- **Moss carpet ring** around giants depends on real ground height; do it as a separate small feature
  near large trunks or accept it only on sapling-grown trees.
