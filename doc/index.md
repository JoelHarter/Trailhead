# Trailhead — Bedrock add-on planning

**Trailhead** is a Minecraft Bedrock add-on inspired by the wild places of North America: its biomes,
trees, and animals, starting with the giant sequoia groves of the Sierra Nevada. A trailhead is where
the path into the backcountry begins, and this is meant to keep growing from here: more biomes,
creatures, and mechanics over time.

These are the planning documents for its first chapter: bringing the Sequoia mod (Fabric / Java 1.21.1,
at `/Users/joel/sequoia-mod`) to Minecraft **Bedrock Edition**, so it can be played across devices with
family. "Trailhead" is a working title and may change; see the note on naming in
[05-roadmap.md](05-roadmap.md).

No code exists yet. These documents record what was learned before starting and the plan that follows.
Platform facts were verified in September 2026 (Bedrock 26.50); Bedrock changes quickly, so re-check
anything version-sensitive before relying on it.

## The short version

- Bedrock mods are **add-ons**: a behavior pack and a resource pack made of JSON, plus
  TypeScript/JavaScript for logic. It is a rewrite. The math carries over; the Java code does not.
- Everything the port needs is **stable** on current Bedrock, including custom biomes. No experimental
  toggles, so it can run on a Realm and reach consoles.
- Bedrock cannot run custom code during world generation. The plan is to **run the tree algorithm
  offline and bake trees into structure files**, placed by JSON worldgen rules that evaluate the
  age/density field in Molang. The largest tree (~39 wide) fits Bedrock's 48 × 48 limit. Saplings run
  the real algorithm live in script. Both share one TypeScript implementation.
- Difficulty inverts relative to Java: **mobs get easier** (taming, collars, swooping are stock
  components), **building blocks get harder** (stairs, doors, fences have no vanilla parent to inherit).
- There is no Bedrock for macOS. Develop on the Mac against a **Dockerized Bedrock server**, with
  Joel's Pixel 6 as the test client. The tree math and baker need no game at all.
- Everyone plays on consoles (Switch, Xbox, Switch), so the finished add-on is hosted on a **Realm**,
  uploaded from the phone. The family is invited only once it is solid: the plan has a walkable-forest
  checkpoint for Joel and a separate, hardened **family release**.
- Trailhead is one add-on with one namespace (`trailhead:`), organized by kind of content. Biomes are
  linked to creatures and features through tags, so later biomes can share them.

## Documents

The running checklist of what is left, feature by feature, is in [../ToDo.md](../ToDo.md).

1. [What the Java mod contains](01-java-mod-inventory.md) — the feature inventory being ported.
2. [How Bedrock modding works](02-bedrock-platform.md) — add-ons vs. Fabric, developing from a Mac,
   tooling, and how the family gets to play it.
3. [Porting map](03-porting-map.md) — each feature's Bedrock approach and effort.
4. [World generation design](04-worldgen-design.md) — the baked-tree approach, the biome, and what
   still needs in-game testing.
5. [Roadmap and open questions](05-roadmap.md) — milestones, repository layout, and decisions needed.
6. [The sequoia tree](06-tree-design.md) — how the crown is built now, and why it departs from the Java mod.
7. [How to play](07-how-to-play.md) — for players: installing the add-on, consoles, and Realms.
