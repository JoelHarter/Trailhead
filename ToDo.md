# Trailhead — to do

Open work. What the add-on is and how it is built is in `doc/` (start at `doc/index.md`); the tree's
design is `doc/06-tree-design.md`. Much of this list comes from a line-by-line audit of the Java
prototype (`/Users/joel/sequoia-mod`) on 2026-09-21, so the rules and numbers quoted from Java are what
its code does. *Italics* mark where Java's docs promised something its code never delivered, or where
the code has a bug: those need a decision about what we want, not a faithful copy.

Each open item carries two marks, importance first, then difficulty.

## Legend

**Importance**

| | |
|---|---|
| ✅ | done |
| 🟦 | optional — not yet decided whether it's wanted at all |
| ⬜ | nice — a little better in some way |
| 🟨 | useful — the result would be noticeably better with it |
| 🟧 | important — a main feature |
| 🟥 | critical — a defining feature, or blocking other important work |

**Difficulty**

| | |
|---|---|
| 🍰 | quick and easy |
| 🚲 | standard work |
| 🌶️ | real design or real care |
| 💀 | a project of its own |
| 📦 | a parent task: no rating of its own, done when its subtasks are |

## Waiting on a decision

Each of these is Joel's call. The item itself is further down, under the heading named.

| decision | the choice | where |
|---|---|---|
| mossy boulders in the grove | gone with the `mega` tag; Java had none; real Sierra groves do sit among granite | Grove biome |
| monsters on the big limbs | skeletons spawn in the crowns (today); bug or feature | Trees |
| what a grizzly drops | *Java: nothing, by omission* | Grizzly |
| where eagles spawn | *Java's docs say the canopy; its code spawns them on the ground* | Eagle |
| eagles and cats | cats are prey, and also scare eagles off, a rule inherited from the phantom | Eagle |
| bears and the mob griefing rule | Java's raiding ignores it | Grizzly |
| where bears spawn | Java only young forest by accident; ours spawn on grass, podzol, dirt, coarse dirt, moss, so anywhere in the grove | Grizzly |
| wood sounds | generic wood (today), or acacia as Java used | Blocks and items |
| grove size and rarity | replaces half the taiga family (today, generous for development) | Grove biome |
| whose Realm hosts the family world | Joel's own (recommended), or a family member's | Project |

## Forest layout

- 🟧 💀 Age falling to zero at the grove's borders, water and other biomes included (Joel, 2026-09-22).
  Hard: Molang cannot ask how far the biome's edge is, and terrain height sampled 24 blocks away reads 0
  about half the time (ungenerated neighbors), so water cannot be sensed at a distance either. The
  camera's mask of a real grove shows two kinds of border: smooth arcs, which are the contour of the
  game's replacement noise, and jagged ones, which are vanilla biome borders. If the replacement noise
  can be reproduced in Molang, "how far below the threshold" is a field that is zero on the smooth
  borders and peaks in each grove's core; the jagged borders would still be invisible. Not yet tried
- 🟦 🌶️ Tie age partly to terrain (Molang can read ground height): real giants favor sheltered basins
  over ridges

## Grove biome

- 🟧 🍰 Tune how much of the taiga family the grove replaces, and the size of groves (`amount`,
  `noise_frequency_scale`), before release
- 🟨 🍰 Check the client side on a device: sky `#78A7FF`, fog `#C0D8FF`, water `#3F76E4`, water fog
  `#050533`, grass `#49874B`, foliage `#346E42`. The server cannot see the resource pack
- 🟦 🚲 Mossy cobblestone boulders: they came with the `mega` tag, which is gone now (waiting on a decision; if wanted, a feature of our own)
- 🟨 🍰 Vanilla oak trees may be generating inside groves through the `forest` biome tag (oak logs were counted near groves; not yet confirmed inside them). If so, drop the tag or accept them
- 🟨 🍰 Salmon: the `water_animal` spawns in the grove's rivers were never checked

## Trees

- 🟧 🌶️ Bee nests: 5% of trees, 12–17 blocks up (the tree must be that tall, the nest at least 6 above
  the ground); hung under a log of the lowest branch if that is low enough, otherwise on the trunk's
  side; 2–3 bees inside; leaves cleared in a 5-block corridor in front so bees can fly. *In Java,
  sapling-grown trees never got nests, and nests near chunk borders were silently lost*
- 🟨 🚲 Moss carpet ring around big trees (radius ≥ 1.5): 40% of columns in a band from radius + 0.5 to
  radius + 3
- 🟨 🌶️ Charred wood and fire scars (Joel, 2026-09-21). Vanilla has a Block of Coal but no charcoal
  block, so make our own charred sequoia wood, and generate burnt-out sections on big trees: the
  blackened, often hollowed cavities at the base of real giants (fire scars, catfaces, goose pens),
  seen in nearly every photo of old redwoods
- 🟨 🌶️ Fire behavior (Joel, 2026-09-21): real sequoias resist fire. It should damage a sequoia to a
  degree but never burn it down, perhaps turning some logs to charred wood so a burnt tree ends up with
  the scars above. Today they burn like any wood. More thought when we get to it
- 🟨 🌶️ Joel's better idea for exposed log ends; the all-bark caps are the interim fix
- 🟨 🌶️ Joel's more interesting sapling. Today a sapling always grows the smallest tree. (Java: size
  from the age field at that spot, and the growth roll applied too, so about a 1% chance per attempt
  at an ancient spot)
- 🟧 🌶️ Leaf rendering cost on the Switch: every inner face of every leaf is drawn today. Leaf loading
  was visibly slow in the first play-test on the phone
- 🟦 🚲 Monsters spawning on limbs and in crowns (waiting on a decision)
- 🟦 🌶️ Reiterated limbs on the oldest giants: a big limb's tip turning up into a small trunk of its own
- 🟦 🌶️ "Mega sequoia" from four saplings: Java has an unused placeholder for it
- ⬜ 🍰 Dirt placed under the trunk base, as Java does

## Blocks and items

- 🟨 🍰 Confirm on the phone that the stale textures are gone (stripped log was magenta and black, the
  sapling had no menu icon): every build now carries a new pack version, so the phone should fetch the
  current resource pack, the grove's colors included
- 🟧 📦 The rest of the wood family. All 8 exist in Java; recipe yields in brackets. Textures exist for
  the door and trapdoor; the rest use planks. Each should also be flammable and usable as fuel (*Java
  registered neither*). "Good enough" for the first family release: places the right way round, right
  collision, opens or activates, drops itself, craftable
  - 🟧 🚲 Slab (6 from 3 planks). *Java drops 1 even from a double slab*
  - 🟧 🚲 Trapdoor (2 from 6 planks). *Java modeled only closed-at-bottom*
  - 🟧 🚲 Button (1 from 1 plank), pressed for 30 ticks. *Java: one orientation, never looks pressed*
  - 🟧 🚲 Pressure plate (1 from 2 planks). *Java: never looks pressed*
  - 🟧 🚲 Fence (3 from 4 planks + 2 sticks). *Java forgot the fences tag, so its fences do not connect*
  - 🟧 🌶️ Stairs (4 from 6 planks). *Java modeled straight stairs only, no corners*
  - 🟧 🌶️ Fence gate (1 from 4 sticks + 2 planks). *Java had no lowered in-wall form*
  - 🟧 🌶️ Door (3 from 6 planks), drops from the lower half only. *Java modeled 8 of 32 states: no right
    hinge, never visibly opens*
- 🟦 📦 Planned in Java but never built; the item textures exist and are ours to use
  - 🟦 🌶️ Sign
  - 🟦 🌶️ Hanging sign
  - 🟦 💀 Boat
  - 🟦 💀 Boat with chest
- ⬜ 🍰 Composting for leaves and sapling (vanilla wood types have it; Java did not)
- ⬜ 🍰 Flower pot support for the sapling (vanilla saplings have it; Java did not)
- 🟦 🍰 Wood sounds (waiting on a decision)
- 🟨 🍰 Hands-on check on the phone of what the headless tests cannot reach: stripping with an axe,
  crafting planks and then a crafting table, shears on leaves, bone meal on a sapling

## Grizzly

Built on the vanilla polar bear (its geometry, animations, attributes, and sounds) with the wolf's taming
components. Entity `trailhead:grizzly`, display name "Grizzly". Spawns through the
`trailhead_grizzly_habitat` biome tag. What is done is under Done; what remains:

- 🟨 🍰 Hands-on check on the phone: the rear-up, the sitting pose, the collar layer and its dye tint
  (the material `entity_alphatest_change_color` is an educated guess), spawn egg colors, sounds
- 🟨 🚲 The polar bear's warning growl during the rear-up (Java played none; vanilla has
  `mob.polarbear.warning`, mapped as `mob.warning` in our sounds, not yet triggered)
- 🟨 🚲 Pacifying by "any food": Bedrock filters have no food category, so the sensor lists about 30
  foods by name; extend the list if a food is missing
- 🟨 🚲 Water bite: on land the polar bear's stomp attack; in water Java used a quick bite with a
  fox-bite sound and no rearing. Not done: the bear attacks the same way in water
- 🟨 🌶️ Raiding (untamed only): chests, trapped chests, barrels within 16 blocks that hold food (eats 4,
  half a second apart; barrels open and close; chest lids cannot be animated on Bedrock); beehives and
  nests within 24 blocks with honey (empties it, drinking sound, bees within 12 blocks attack); crops
  and small mushrooms broken with drops. Needs `behavior.move_to_block` plus script for inventories
  and hive state. Berry bushes are done (fox's `raid_garden`)
- 🟦 🍰 Drops (waiting on a decision; today nothing)
- 🟦 🍰 Whether cubs should warn and attack (in Java they do; here the sensors are on every wild bear,
  cubs included, as in Java)
- 🟦 🍰 Bears and the mob griefing rule (waiting on a decision)
- 🟦 💀 Climbs logs (Java: rises 0.22 per tick when facing a log with headroom, body tilted back 65°).
  No clean way on Bedrock; held back from the first release

## Eagle

Java builds it on the phantom: same model with the eagle texture, same circling and swooping. Health
20, attack 10, 5 XP. Hitbox 1.1 × 0.5. Spawn egg `#4A2E14` / `#D4AF37`. Spawns through the
`trailhead_eagle_habitat` tag (Java: weight 8, 1–2).

- 🟧 🚲 Entity, model, texture, attributes, spawn egg, name
- 🟧 🌶️ Flight and hunting: never targets players; hunts fish of any kind, rabbits, cats. Phantom
  flight assumes player targets, so expect tuning
- 🟧 🍰 Does not burn in daylight, never despawns, stays in Peaceful
- 🟨 🚲 Sounds, all 5 files: long scream flying and short cry on the ground as the ambient call; cry
  when hurt; cry + scream on death; a dive scream when descending faster than 0.15 per tick with a
  target: louder (1.5), slight pitch variation, at most once per 3 seconds
- 🟨 🍰 Remove what is left of the phantom: wing flap and swoop sounds, the bite sound on a hit, and
  **purple mycelium particles from the wing tips**
- 🟨 🍰 Drops 1–2 feathers, more with Looting. *Java drops them twice by accident, 2–4 in all; its docs say 1–3*
- 🟦 🚲 Where they spawn (waiting on a decision)
- 🟦 🍰 Cats as prey and as a deterrent (waiting on a decision)

## Polish

- 🟨 🍰 Names for the two mobs and their spawn eggs (*Java's language file has only the blocks*)
- ⬜ 🍰 Subtitles for the four eagle sounds
- 🟨 🍰 Spawn egg icons, and a pack icon (*Java's points at a file that does not exist*)
- 🟦 🍰 The Java source says "Suggestion 1" above the moss ring, implying a list of ecological ideas of
  which only the first was built. If Joel remembers the others, they belong here

## Project

- 🟧 📦 Release hardening for the first family session (M8 in `doc/05-roadmap.md`)
  - 🟧 🚲 Survival play-through on the Realm: find a grove, chop a tree, craft the wood set, tame a bear
  - 🟧 🚲 On the real consoles: Switch frame rate in the densest grove, pack download on join, Xbox
  - 🟨 🚲 Multiplayer-only behavior: two players near one bear, a sapling growing where someone stands,
    players far apart
  - 🟨 🍰 Leaf decay cost on the Realm and the Switch
  - ⬜ 🍰 A short note for brother and nephew: how to find a grove, what bears like
- 🟨 🌶️ The server warns that the classic network transport (`raknet`) will be dropped. The phone
  connects through it today; if that stops after a game update, see `doc/02-bedrock-platform.md`
- ⬜ 🚲 BlueStacks Air as an on-Mac game window (parked, 30–60 minutes to try)
- ⬜ 🍰 Re-check mcpelauncher's Apple Silicon mode once its startup crashes on 1.26.45+ are fixed
- 🟦 🍰 Whose Realm (waiting on a decision)
- 🟦 🍰 The name: Trailhead is a working title. The namespace must be final before the first family world

## Done

Kept for the record; the docs have the detail.

- ✅ Grizzly, first release (2026-09-22): `trailhead:grizzly` on the polar bear's model, sounds,
  health 30, speed 0.25, attack 6, with a 1.4 × 1.4 hitbox. Wild: territorial warning (an intruder
  within 6 blocks makes it rear up on a smoothed property-driven animation and freeze facing them;
  within 2 it attacks; intruders are players and cows, mooshrooms, horses, donkeys, mules, camels;
  a player holding food is ignored, unless a cub is within 18 × 8 × 18); polar-bear anger and stomp
  attack; hunts rabbit, sheep, pig, goat, llama, chicken, fox, and fish out of water; eats sweet
  berries; tempted by raw fish; immune to berry bushes. Taming with honey bottle, honeycomb, sweet or
  glow berries at 1 in 3; then sittable with a sitting pose, follows the owner beyond 4 blocks and
  teleports beyond 12, defends the owner and attacks what the owner attacks, never warns, hunts, or
  forages; dyeable red collar drawn as a tinted second layer; healed by raw fish (4); breeds with honey
  when tamed; cubs of tamed parents are born tamed. Cubs are half size, follow a parent, panic, and grow
  up in 20 minutes (fish speeds it). Natural spawns with Java's cub odds (75% none, 8% one, 12% two,
  5% three). Spawn egg. Verified headlessly (`npm run test:entities`): spawn, families, health, the
  warning property, taming, cubs
- ✅ Age-driven grove (2026-09-22): soil by forest age (grass, coarse dirt, podzol at Java's thresholds),
  dandelions only in young forest, understory spruce thinning and skewing giant with age (10 attempts
  a chunk, Java's chances), all written by the baker against the same Molang age field. The vanilla
  `taiga` and `mega` tags are gone (they brought uniform spruces, boulders, and the animals), replaced
  by our own ferns, large ferns, grass, mushrooms, dead bushes, and wolf, fox, rabbit spawn rules
- ✅ `.mcaddon` export (`npm run addon`) and a player's guide for consoles and Realms (`doc/07-how-to-play.md`)
- ✅ The forest follows an age map (2026-09-22). The Java sum of `sin·cos` products looked like tartan;
  the new field layers simplex noise at three scales, tuned by Joel in the viewer (groves 230 blocks
  apart at weight 0.51, detail at 86, strong tree-to-tree variation at 14 with weight 0.73, contrast 3,
  density 0.245). One set of parameters drives the viewer and writes the Molang for the game, and a
  test runs that Molang against the TypeScript. Each size class makes as many attempts per chunk as it
  would grow (32 × `K / radius^1.5`) and places a tree only where the field calls for that class, on
  dry land: the Java scheme, arranged so the field is evaluated about 40 times a chunk instead of 320.
  Checked in-game with the field camera: all ten classes appear, in the pattern the viewer shows
- ✅ A different map in every world (2026-09-22): `npm run world:reset` rolls a new offset for the age
  map and the build bakes it into the pack. Molang cannot reach the world seed (tested)
- ✅ `q.noise` identified as plain 2D simplex noise (2026-09-22), ignoring the world seed
- ✅ A new pack version on every build (2026-09-22), `0.<day>.<time>`, so devices fetch the current
  resource pack. Each part must stay small: a patch number of 22 million made the server ignore the pack
- ✅ Field camera (2026-09-22, `tools/dev/field-camera.mjs`): paints any Molang expression as planes of
  wool during world generation, reads them back by script, and rebuilds the image on the Mac. Its ramp
  self-test is exact. Used to measure `q.noise`
- ✅ Sequoia Grove biome (2026-09-21): `trailhead:sequoia_grove`, modeled on Mojang's own old growth pine
  taiga, replacing half of the taiga family. Sequoias generate only there. Through the tags `taiga` and
  `mega` it inherits vanilla's spruces, ferns, grass, dead bushes, mushrooms, and boulders from the game
  engine, and vanilla's wolf, fox, and rabbit spawn rules. Added: azure bluets, lily of the valley,
  dandelions (Java's rates), moss carpet on about 5% of the ground, sweet berry patches, Java's colors.
  Carries `trailhead_has_giant_sequoias`, `trailhead_grizzly_habitat`, `trailhead_eagle_habitat` for later
- ✅ Leaf decay (2026-09-21), by the rule the generator guarantees, so trees never shed on their own;
  player-placed leaves persist; drops: sapling 2.5% (Joel's choice, the jungle rate; Java 5%), 1–2
  sticks 2%, the block with shears. *Java's leaves never decayed, whatever its docs say*
- ✅ Sapling (2026-09-21): recolored spruce sapling; grows by random tick or bone meal with the shared
  generator; podzol under grown trees
- ✅ Wood (2026-09-21): log, wood, stripped log, stripped wood, planks; axe stripping; Java's
  flammability values; vanilla item tags and fuel values, so vanilla recipes accept them; planks from
  all four wood blocks, wood from logs, plain and stripped. *Java had planks from logs only*
- ✅ Log grain and bark caps (2026-09-21): trunk upright, branches along their run, exposed ends placed
  as all-bark Sequoia Wood; the game turns the grain with the tree when it rotates a structure
- ✅ The crown, redesigned beyond Java (2026-09-21, `doc/06-tree-design.md`): a fractal tree drawn at
  one-block resolution. Branches placed by foliage coverage with no cap; clumps; elbows, sub-branches,
  and cone-thick limbs, each a smooth function of the branch's own length; trunk foliage, so young trees
  are lean poles with pointed cones; every leaf face-connected to wood within 6 steps. Tuned by Joel in
  the viewer
- ✅ Tree viewer (2026-09-21, `npm run view`): the real generator in the browser, a slider for every
  constant, per-slider reset, "Copy my changes", a forest sample from above
- ✅ Baked trees at world generation (2026-09-21): the algorithm runs at build time, 10 size classes × 4
  variants as structures; verified that 100-block trees place quickly and across chunk borders
- ✅ Tree algorithm ported to TypeScript (2026-09-21) as a pure function, with tests
- ✅ Toolchain (2026-09-21): Node, Colima with no shared folders, headless Bedrock server, build and
  deploy scripts, script hot-reload, headless checks (`npm run probe`, `npm run test:blocks`); the
  Pixel 6 connects
- ✅ Java audit (2026-09-21): every feature, plan, and bug of the prototype, which this list is built from
