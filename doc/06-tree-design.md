# 06 — The sequoia tree: design beyond the Java mod

From 2026-09-21 the tree is developed here, not ported. The trunk, root flare, and root cone still
follow the Java mod. The crown was redesigned, because the Java crown (inherited by the first port)
looked wrong in ways that traced to specific causes.

The tree is an archetype standing for both giant sequoias and coast redwoods.

## The governing idea: a fractal tree, drawn at one-block resolution

A real tree branches at every scale: trunk, limbs, branches, twigs, needles. A block is 1 m, so only
the parts of that hierarchy that are thick enough can be drawn as wood. **Everything finer is still
there; it is represented by foliage.** Each level of the hierarchy crosses into visibility at its own
size, smoothly, and independently of the others:

| Level | Drawn as wood when | Otherwise |
|---|---|---|
| Trunk | always | |
| Branch | it extends 2+ blocks past the trunk | foliage against the trunk (trunk foliage, twig clumps) |
| Branch thickness beyond one block | the branch is longer than 4.5 blocks, low in the crown | one block thick |
| Branch's own branches (laterals) | the branch is longer than 4 blocks | part of the branch's foliage clump |
| Twigs and needles | never | leaves |

So a small tree is a trunk and foliage, because none of its branches are big enough to draw; a
mid-sized tree gains wooden branches; a large one gains laterals and thick limbs; and at every size the
finest visible level ends in foliage that stands for all the levels below it. This is why features are
written as smooth functions of a part's own size with a natural threshold, never as switches tied to
tree size, and why they are independent of each other. New features should follow the same rule.

## What was wrong with the Java crown

- **Single leaf blocks above and below every pad.** Each pad was an ellipsoid with a vertical radius of
  exactly 1, so its top and bottom layers collapsed to one block: a flat disc with a pip on each side.
- **Sparse below, then an abrupt solid cap.** Branch lengths were spaced evenly and heights derived
  from them, which packs branches only about 2.6 times closer at the top than the bottom. Roughly 4% of
  the crown's outer ring was leafy at the bottom and 18% near the top; then the cap began at 92% of the
  height at 100%.
- **Too few leaves overall:** about 900 leaves to 3,800 logs on a giant.

## The crown now

All numbers are parameters in `DEFAULT_SEQUOIA_PARAMS` (`src/core/trees/sequoia.ts`) and sliders in the
viewer (`npm run view`). "Young" values apply to the smallest trees, "old" to the largest, blended by
trunk radius.

- **Envelope.** Branch reach at each height follows a profile from straight spire (young, exponent
  0.85) to rounded dome (old, 0.5), with the lowest branches tucked in so the underside is rounded.
  Coast redwoods sit nearer the spire end, giant sequoias nearer the dome.
- **Crown start varies with size.** Young trees carry foliage from 30% of their height; ancients have a
  bare column to 45%.
- **Young trees are lean.** Their crown width is multiplied by 0.65 (blending to 1 for the largest), which
  with the spire profile gives the narrow pointed cone of a real young sequoia or redwood: in a forest,
  shade kills their lower branches, leaving a pole topped by a cone.
- **Trunk foliage** (Joel's idea). The trunk carries its own sleeve of leaves wherever it is thinner
  than 1.1 blocks in radius: thin stem is young wood, and its foliage stands for all the twigs too fine
  to be blocks. The sleeve follows the crown outline and always wraps the actual trunk blocks. One rule
  covers every size: on a tree up to about 25 blocks tall it is the entire crown; at 36 blocks the top
  40%; at 48 the top 19%; on a giant only the last 3%, where it blends into the branch clumps. Inside
  that zone the separate foliage-only twig clumps are not placed. Young trees end in a 2-block vertical
  spike of leaves (the leader), which fades with age as the top rounds off.
- **Branches are placed by coverage, and there is no cap.** Moving up the crown, branch spacing is
  chosen so foliage covers a target share of the crown's shell, rising from open at the base (0.9 for
  young trees, which are dense cones; 0.33 for ancients) to 1.3 at the top. Clumps shrink with branch
  length, so meeting the target takes ever more branches: they crowd together until the clumps merge
  into a solid mass. The solid top is where that process ends, so there is no seam.
- **Foliage clumps** replace flat pads: ellipsoids wide across the branch, domed above and shallower
  below, with random size, a nudged center, and a roughened surface. Roughening depends on the clump's own
  size, not the tree's: none below a width of 1.8, rising to 77% of surface blocks left out at 3.5 and
  above. Big clumps get a loose, feathery outline; small ones stay whole, because a small clump is nearly
  all surface and roughening would delete it.
- **Foliage-only clumps fit inside the crown outline.** A clump on a wooden branch is centered at the
  branch tip and extends past it. A foliage-only clump has no wood to carry it outward, so it shrinks to
  the reach at its height and sits inside the outline, which is what lets cones come to a point. Its
  width never drops below 1.3, the smallest clump that still wraps a one-block trunk; and the spacing
  rule counts narrow clumps as thinner than their nominal height, since their top and bottom layers
  shrink to the trunk's own block.
- **Branch character grows smoothly with branch size.** Three features each depend on the branch's own
  length (the part that sticks out past the trunk), fade in continuously, and simply stop showing below
  a natural threshold. They are independent: none is a condition for another.
  - *Wood.* A branch shorter than 2 blocks is foliage held close to the trunk. This is what keeps small
    trees free of wooden branches: a real sapling's twigs are far thinner than a 1 m block.
  - *Elbow.* Long branches leave the trunk drooping (slope -0.32), then sweep upward two-thirds of the
    way out. The elbow is full at a length of 7 and fades to a straight branch at half that.
  - *Sub-branches.* Smaller branches leaving the main one along its length, feather-like; the main
    branch keeps its identity to the tip. This is how these conifers actually grow: one clear axis
    with laterals at every level, not forking into equals the way oaks do. None are expected below a
    length of 4, then 0.5 more per extra block, so a giant's longest limbs carry about 2. The actual
    count varies from half to one and a half times the expectation; because the variation is
    proportional, short branches that expect none still get none. A lateral's length is 0.65 of what
    remains of the main branch beyond the point where it leaves, so laterals are longest near the trunk,
    shortest at the tip, and can never outreach the main branch (an earlier version made them a
    fraction of the whole limb, and at large values they rivalled it and read as forks). Each leaves
    from the inner 70% of the branch (never right at the tip, where it would merge with the tip's
    clump) at 75 degrees give or take 20, mostly on alternating sides, lies fairly flat, and ends in a clump
    0.65 the size of the one at the main tip. Sub-branches are always a single connected line of blocks
    and are never thickened.
  - *Thickness.* Radius = 0.5 (one block) + 0.5 per block of length beyond 4.5, fading with height to
    nothing 74% of the way up the crown, and tapering as a cone to one block over the first 76% of the
    limb. Small trees' branches never reach the starting length, so they stay one block thick; a
    giant's lowest limbs have a radius of about 1.6 where they leave the trunk (to scale: the largest
    real sequoia limbs are about 2 m across).

  **How thick branches are drawn.** The connected block path (`line6`) is always the skeleton; it
  guarantees a branch is never broken or joined only at a corner. Thickness is added as a union on
  top: every block whose center lies inside a tapering cone around the branch's true, real-valued
  centerline. An earlier version stamped a ball of blocks around each path block instead, and on a
  whole-block grid a ball only changes shape at radius 1 (plus-shaped) and 1.41 (3 x 3), so a smooth
  parameter produced two hard steps. The real centerline passes blocks at varying sub-block offsets, so
  the cone's block set grows gradually with its radius. The cone is skipped when its radius is 0.5 or
  less, since the skeleton already covers a single block.
- **Log grain and bark caps.** Every log records which way its grain runs: up for the trunk and roots,
  and for each stretch of branch the direction it mostly travels (x, z, or occasionally up). A log
  shows growth rings on the two faces at the ends of its grain, so wherever the next block along the
  grain, in either direction, is not wood, that face would be visible: at branch tips, at bends, at the
  trunk's top, and on every ledge where the tapering trunk steps inward (leaves count as exposing,
  since they are see-through). Those logs are placed as **Sequoia Wood**, the all-bark block, with the
  same grain, as vanilla trees do. On a giant this is roughly 1 block in 12.

  Both blocks take their grain from the `minecraft:block_face` state (up = vertical, east = along x,
  north = along z), which the placement trait also sets when a player places one. Verified in-game:
  Bedrock rotates this state together with the structure, so randomly rotated trees keep their bark
  running along their branches (of 800 sideways logs sampled, 799 continued along their own grain).

  Side effect: chopping a tree yields a mix of Sequoia Logs and Sequoia Wood. Joel has a better idea
  for exposed ends planned for later; this is the interim fix.

- **Leaves can never vanish on their own, and none dangle.** Two separate guarantees:
  1. Sequoia leaves are a custom block, and custom blocks have no built-in decay. Nothing removes them
     unless a script of ours does.
  2. After all foliage is generated (including the roughening of clump edges), the generator keeps only
     leaves reachable from wood by stepping through shared block faces, leaf to leaf, within 6 steps
     (`leafReach`). Anything hanging on by an edge or a corner, or floating, is trimmed. A test repeats
     this flood fill independently on every tree size.

  **Leaf decay is implemented** (`src/scripts/blocks/leaves.ts`) with exactly this rule and the same
  limit, read from the generator's own `leafReach` so the two cannot drift apart. On a random tick a
  leaf searches outward through face-adjacent leaves for wood (sequoia wood of any kind, or any vanilla
  log); if none is found within reach it drops its loot and disappears. So chopping a trunk clears its
  crown over time, as with vanilla trees. Leaves placed by a player are marked persistent and never
  decay. Unloaded chunks count as "attached", so trees never shed at the edge of the loaded world.
  Drops: sapling 2.5% (the jungle rate; most vanilla trees are 5%), 1-2 sticks 2%, the leaf block itself
  with shears. Headless checks: `npm run test:blocks`.

  Cost note: the search usually ends within a step or two, and at normal random tick speed a loaded
  forest costs about a dozen searches per game tick. Do not raise `randomtickspeed` far with a forest
  loaded: at 400 it stalled the dev server. Measure on the Realm and Switch during release hardening.

  This is exactly vanilla's leaf-decay rule (distance along a path of connected leaves), and a leaf
  within 6 steps is also within straight taxicab distance 6. So a future leaf-decay script may use
  either rule with a limit of at least `leafReach` and naturally generated leaves will never shed. (An
  earlier version checked only straight distance to a log, which let edge-connected leaves through and
  would have been unsafe under a path-based decay rule.)
- **Root flare randomness** can now exceed the nominal flare by up to 50%. Before, the largest trees sat
  at the clamp, so randomness could only ever shrink their flare.

Decided against: hollow foliage masses (a player chopping into the crown would find the void).

Values above are Joel's tuning of 2026-09-21. Result on a giant: about 1,900 leaves to 3,900 logs, footprint about 28 x 28. Leaf rendering cost on
the Switch is still to be measured.

## How to tune

`npm run view`, move sliders, then "Copy my changes" and hand the list over to be made the new
defaults. `node tools/dev/render-side.ts out.png [seed] [param=value ...]` renders six sizes side by
side to a PNG, which is how shapes are checked without a browser. Adding `top=1` (and optionally
`slab=13`) renders a top-down slice through the largest tree's lowest limbs instead, which is the
view that shows limb structure.

`small=1` renders only young trees, larger.
