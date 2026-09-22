# 05 — Roadmap, decisions, and open questions

## Decisions made (2026-09-21)

| Topic | Decision |
|---|---|
| **Test client** | Joel's Pixel 6 running Minecraft for Android, connecting to a Bedrock server in Docker on the Mac. It is a development instrument, not where anyone plays. |
| **Where people play** | Joel: Switch. Brother: Xbox. Nephew: Switch. All consoles, in different households, so the game is hosted on a **Realm**. |
| **Quality bar** | The family is invited to *play*, not to debug. Nothing ships to them until it is solid. Features may be simple, but they must work. |
| **Wood set** | All 15 blocks must exist and function for the first family release. They need to be good enough, not perfect: correct in the common case, rough edges acceptable. |
| **Scope** | A growing collection inspired by North America's wild places: sequoia grove first, more biomes, creatures, and mechanics later, some shared between biomes. |
| **Name** | **Trailhead** (working title, chosen 2026-09-21; the project folder was previously `NorthAmerica`). Namespace `trailhead:`. |
| **Reference** | The Java `SequoiaTrunkPlacer` was the starting spec. Since 2026-09-21 the tree is developed here and the crown has been redesigned (see [06](06-tree-design.md)); the Java mod is no longer followed. |

### What the scope decision means for organization

- **One add-on** (one behavior pack + one resource pack) for all of Trailhead, not a pack per biome.
  One thing to install and update, and shared content has an obvious home.
- **One namespace, `trailhead:`**, for everything: `trailhead:sequoia_log`, `trailhead:grizzly`,
  `trailhead:sequoia_grove`.
- **The namespace is the one part of the name that becomes permanent.** The folder and display name can
  change at any time, but every block and mob is saved into a world under its namespaced ID, so
  renaming after the family has a real world would break that world's sequoia blocks and bears. Test worlds are
  disposable, so this only has to be final before the first family release. To keep a rename cheap
  until then, the namespace is defined in one place in the build, never typed by hand across files.
- **Organize by kind of thing, not by biome.** Bedrock's pack folders already work this way
  (`entities/`, `blocks/`, `features/`), and a grizzly does not belong to the sequoia grove any more
  than a wolf belongs to the taiga.
- **Connect content to biomes through tags, never by naming biomes.** The bear's spawn rule targets a
  tag such as `trailhead:grizzly_habitat`; the grove biome carries that tag. A future Rocky Mountain biome
  gets bears by adding the tag, with no change to the bear. Same for features (`trailhead:has_giant_sequoias`).
- In code, `src/core/` is organized by domain (`trees/sequoia`, `fields/`), so a second tree species or
  a second noise field slots in beside the first.

## Open questions

1. **Whose Realm, and who uploads?** Brother and nephew have Realms; Joel does not. Custom packs cannot
   be added from a console, and as far as we know only the Realm's owner can replace its world. Two
   ways through:
   - *Joel gets his own Realm* when the add-on is ready (a few dollars a month; the cheaper tier for
     the owner plus two players is enough). He uploads and updates from the Pixel 6 whenever he likes.
     **Recommended**: the person making the mod controls deployment, and nobody else has to do anything.
   - *Use a family member's Realm.* The owner would sign into Minecraft on a phone or PC with their
     Microsoft account and upload each new version. Workable, but every update needs their help, and it
     occupies a world slot on their Realm.

   No decision is needed until the first family release is close.
2. **New world.** The grove only generates in new chunks, and a world using it cannot cleanly drop the
   add-on. Assume a fresh world made for this, unless there is an existing family world that matters.

## Two finish lines

The earlier draft treated "a forest to walk through" as the first playable. Given the quality bar,
there are really two targets:

- **Walkable forest (Joel only, on the phone).** The earliest moment the core idea can be seen and
  judged in-game. End of M3.
- **Family release 1 (on the Realm, on consoles).** Everything in the sequoia grove working well enough
  that a session is fun from the first minute. End of M8.

## Milestones

### M0 — Toolchain (small) — *done except the phone check*
Status 2026-09-21: Node.js 24 and Colima (Docker runtime, no shared folders) installed; project scaffolded (see the
[README](../README.md) for commands); Bedrock server 1.26.51.1 runs in Docker, loads the behavior pack,
and runs the script with no content errors; script hot-reload and world reset work. One custom block
exists (`trailhead:sequoia_planks`, using the Java mod's texture).

**Remaining:** connect the Pixel 6 and confirm in-game that the welcome message appears and the planks
block shows its texture and name. That verifies the resource pack, which the server cannot check.

Java is irrelevant to this project; the Java mod already has what it needs (Java 21 via Homebrew,
referenced from its `gradle.properties`).

### M1 — Worldgen spike — *passed 2026-09-21*
Result: baked 100-block trees place correctly, quickly, and across chunk borders during world
generation. Details in [04](04-worldgen-design.md). The marker-block fallback is not needed. The
questions below are kept for the record; the Molang age-field gating is the one still open and moves
into M3.

#### Original plan
Before porting anything real, crudely generate one very large structure (~39 × 125 × 39) and test:
- Does a structure that tall place as a feature at all? Any vertical limit?
- Generation speed with several per chunk. Chunk-border artifacts?
- Intersection constraints with overlapping canopies; void cells leaving terrain intact.
- A Molang `sin`/`cos` field gating `iterations` by world position, and selecting among size classes.

If this fails, fall back to the marker-block approach in [04](04-worldgen-design.md) before investing
in the baker.

### M2 — Tree core in TypeScript — *done 2026-09-21*
`src/core/` holds the age field, a seeded RNG, and a faithful port of the Java `SequoiaTrunkPlacer`
as a pure function. Nine tests (`npm test`) cover determinism, the 48 x 48 limit, leaf attachment,
wood connectivity, the root cone, and the age-field formulas. `npm run view` opens an interactive 3D
viewer with radius and seed sliders. Not ported yet: bee nests, moss ring, podzol (world-dependent).

One finding: about a third of trees have a root-flare block touching the trunk only diagonally. The
Java mod does the same and it looks attached in-game, so it was left as is.

#### Original plan
Port the Java `SequoiaTrunkPlacer` to a pure module: inputs `(radius, seeded RNG)`, output block list.
Seeded RNG with Gaussian sampling. Unit tests on invariants (6-connected branches, no leaf beyond
taxicab distance 4 of a log, size envelope under 48 × 48). A viewer on the Mac, in the spirit of the
GLMakie plot, so trees can be tuned without the game.

### M3 — Baker and forest (large) → *walkable forest* — *started*
Done so far: the `.mcstructure` writer, the baker (runs inside `npm run build`), log, wood (all-bark),
and leaves blocks, the redesigned crown ([06](06-tree-design.md)), and a throwaway feature rule that puts giants everywhere. Next: replace that rule with the
age-field rules (size class chosen by `A(x,z)` in Molang, density law), restrict to a biome tag, then
the Switch frame-rate check. Leaves currently render every inner face (`alpha_test` on a plain cube),
which is the first thing to optimize if the Switch struggles.

#### Original plan
`.mcstructure` writer (little-endian NBT, void for empty cells, root cone below origin). Bake size
classes × variants. Feature rules with the age field, density law, and rotation. Log and leaves
blocks. Forest placed into vanilla taiga via a biome tag for now.

**Early Switch check:** host this world from the Pixel 6 and join from the Switch over the local
network (no Realm needed). The Switch is the weakest device in the family, and forests of 100-block
trees with dense leaves are demanding. If frame rate is a problem, it is far better to learn that here,
while leaf density and tree counts are still cheap to change.

### M4 — The grove biome (medium)
Custom biome with partial replacement of the taiga family, podzol surface, ground cover, client-side
colors and fog, spawn rules through habitat tags. Tune replacement amount and noise scale by flying.

### M5 — Grizzly bear, in layers (medium)
1. Wild neutral bear with the vanilla model, hunting, cubs.
2. Taming, sitting, follow/defend, healing, breeding.
3. Warning stance with food bypass and cub protection.
4. Collar and sitting pose (Blockbench).
5. Berry eating, then hive harvesting and chest raiding (script).

Log climbing is **not** in release 1. It has no clean Bedrock implementation, and a bear that glitches
up trees is worse for a family session than one that stays on the ground. Revisit afterward.

### M6 — Eagle (medium)
Phantom-based flight retargeted to small prey, sounds, dive scream. Mostly tuning.

### M7 — Sapling and the full wood set (large) — *started 2026-09-21*
Done: Sequoia Log, Wood, Stripped Log, Stripped Wood, Planks, Leaves (with decay, persistence, and
drops), and Sapling (grows by random tick or bone meal, using the shared generator; for now always the
smallest tree, true radius 0.4 to 0.5, varied by ordinary chance and not by the age field; podzol
under grown trees). Axe stripping. Recipes: planks from all four wood blocks, wood
from logs (both plain and stripped). Items carry the vanilla tags (`minecraft:planks`, `minecraft:logs`,
`minecraft:logs_that_burn`, `minecraft:sapling`) and fuel values, so vanilla recipes (sticks, crafting
table, chests, tools, charcoal) accept sequoia wood. Verified headlessly with `npm run test:blocks`;
stripping, crafting, shears, and bone meal still need a hands-on check on the phone.

Remaining, each needing its block built before its recipe can exist: slab, stairs, fence, fence gate,
door, trapdoor, button, pressure plate (then sign, hanging sign, boat, chest boat if wanted). Textures
exist for door and trapdoor; others use the planks texture. Joel plans something more interesting for
the sapling later; the current one is a recolored spruce sapling.

#### Original plan
Sapling growth using the M2 module. Stripping, recipes, loot, tags. Then every building block, simplest
first so each teaches something for the next: slab, trapdoor, button, pressure plate, fence, stairs,
fence gate, door. "Good enough" for each means: places in the right orientation, has the right
collision, opens/activates, drops itself, and is craftable. Acceptable to skip at first: waterlogging,
double-slab merging, villagers and mobs using the doors, exotic stair corner shapes.

### M8 — Release hardening (medium) → *family release 1*
The milestone that exists because of the quality bar.
- Survival play-through from a fresh world on the Realm: find a grove, chop a tree, craft the wood
  set, tame a bear. Fix whatever breaks the fun.
- Test on the actual consoles: Switch frame rate in the densest grove, pack download on join, Xbox.
- Check multiplayer-specific behavior: two players near the same bear, a sapling growing while another
  player stands in the way, chunk loading with players far apart.
- Confirm the Switch's game version matches the Realm's (Switch updates can lag by days).
- A short "what's in the mod" note for brother and nephew: how to find a grove, what bears like.

### Parked experiments
Things to try when there is a spare hour. None of them changes how the project is built.
- **BlueStacks Air as an on-Mac game window** (30–60 minutes). Install, sign into Google Play, install
  Minecraft, add the dev server by the Mac's LAN IP. If it runs acceptably next to the server on 8 GB,
  it replaces glancing at the phone for everyday testing. Details in [02](02-bedrock-platform.md).
- **Re-check mcpelauncher's Apple Silicon mode** once its startup crashes on 1.26.45+ are fixed.

### After release 1
Bear log climbing, bee nests in trees, moss rings, leaf decay if it is missed, boats and signs, and the
next biome.

## Proposed repository layout

```
Trailhead/
  doc/                     these documents
  packs/
    BP/                    behavior pack: entities/, blocks/, items/, biomes/, features/, feature_rules/,
                           spawn_rules/, recipes/, loot_tables/, structures/ (generated), scripts/ (built)
    RP/                    resource pack: textures/, models/, animations/, render_controllers/, sounds/
  src/
    core/                  pure TypeScript, no Minecraft imports
      fields/              age/density fields
      trees/sequoia/       the tree algorithm
      rng.ts
    scripts/               in-game Script API code (sapling, stripping, bear raiding), imports core/
    bake/                  Node CLI: core/ → .mcstructure files and generated feature JSON
    viewer/                look at generated trees on the Mac
  test/                    unit tests for core/ and the NBT writer
  tools/                   dev server (Docker compose), world reset, deploy
```

The key boundary is `src/core/`: one implementation of the math, used offline by the baker and in-game
by the sapling. Generated files (baked structures, the per-size-class feature JSON) are build outputs,
not hand-edited.
