import assert from "node:assert/strict";
import { test } from "node:test";
import { ageAt, applySCurve, growProbability, trueRadiusAt } from "../src/core/fields/age.ts";
import { Rng } from "../src/core/rng.ts";
import { DEFAULT_SEQUOIA_PARAMS, MAX_TRUE_RADIUS, generateSequoia, line6 } from "../src/core/trees/sequoia.ts";

const RADII = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, MAX_TRUE_RADIUS];
const SEEDS = [1, 2, 3, 4, 5, 6];

function forEachTree(check: (tree: ReturnType<typeof generateSequoia>, label: string) => void) {
  for (const trueRadius of RADII) {
    for (const seed of SEEDS) {
      check(generateSequoia({ trueRadius, rng: new Rng(seed) }), `radius ${trueRadius}, seed ${seed}`);
    }
  }
}

test("same seed grows the same tree", () => {
  const a = generateSequoia({ trueRadius: 2.2, rng: new Rng(42) });
  const b = generateSequoia({ trueRadius: 2.2, rng: new Rng(42) });
  assert.deepEqual(a.logs.toArray(), b.logs.toArray());
  assert.deepEqual(a.leaves.toArray(), b.leaves.toArray());
});

test("different seeds grow different trees", () => {
  const a = generateSequoia({ trueRadius: 2.2, rng: new Rng(1) });
  const b = generateSequoia({ trueRadius: 2.2, rng: new Rng(2) });
  assert.notDeepEqual(a.leaves.toArray(), b.leaves.toArray());
});

test("every tree fits Bedrock's 48 x 48 limit for structures placed by features", () => {
  forEachTree((tree, label) => {
    const width = tree.max[0] - tree.min[0] + 1;
    const depth = tree.max[2] - tree.min[2] + 1;
    assert.ok(width <= 48 && depth <= 48, `${label}: ${width} x ${depth}`);
  });
});

test("height follows the radius and respects the cap", () => {
  forEachTree((tree, label) => {
    assert.ok(tree.height >= 3 && tree.height <= 117, `${label}: height ${tree.height}`);
    assert.equal(tree.max[1] >= tree.height - 1, true, `${label}: crown reaches the top`);
  });
  const giant = generateSequoia({ trueRadius: MAX_TRUE_RADIUS, rng: new Rng(7) });
  assert.ok(giant.height > 70, `a giant should be tall, got ${giant.height}`);
});

test("every leaf is attached to wood through shared faces, within leafReach steps", () => {
  const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
  forEachTree((tree, label) => {
    // Independent re-check: flood outward from the wood through face-adjacent leaves.
    const reached = new Set<string>();
    let frontier: number[][] = [];
    for (const [x, y, z] of tree.leaves) {
      assert.ok(!tree.logs.has(x, y, z), `${label}: leaf inside log at ${x},${y},${z}`);
      if (FACES.some(([dx, dy, dz]) => tree.logs.has(x + dx, y + dy, z + dz))) {
        reached.add(`${x},${y},${z}`);
        frontier.push([x, y, z]);
      }
    }
    for (let step = 2; step <= DEFAULT_SEQUOIA_PARAMS.leafReach; step++) {
      const next: number[][] = [];
      for (const [x, y, z] of frontier) {
        for (const [dx, dy, dz] of FACES) {
          const n = [x! + dx, y! + dy, z! + dz] as [number, number, number];
          if (tree.leaves.has(...n) && !reached.has(n.join())) {
            reached.add(n.join());
            next.push(n);
          }
        }
      }
      frontier = next;
    }
    assert.equal(reached.size, tree.leaves.size, `${label}: ${tree.leaves.size - reached.size} dangling or floating leaves`);
  });
});

// Root-flare blocks may touch the trunk only along an edge or corner (the Java mod does the same, and
// it looks attached in-game), so this allows diagonal contact. Branch lines are strictly face-connected,
// which the line6 test checks.
test("all wood is one connected piece (no floating branches)", () => {
  forEachTree((tree, label) => {
    const start = [0, 0, 0] as const;
    assert.ok(tree.logs.has(...start), `${label}: trunk center exists`);
    const seen = new Set<string>([start.join()]);
    const queue: [number, number, number][] = [[...start]];
    while (queue.length > 0) {
      const [x, y, z] = queue.pop()!;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const next: [number, number, number] = [x + dx, y + dy, z + dz];
            if (tree.logs.has(...next) && !seen.has(next.join())) {
              seen.add(next.join());
              queue.push(next);
            }
          }
        }
      }
    }
    assert.equal(seen.size, tree.logs.size, `${label}: ${tree.logs.size - seen.size} disconnected logs`);
  });
});

test("the root cone goes below ground and narrows to nothing", () => {
  const giant = generateSequoia({ trueRadius: MAX_TRUE_RADIUS, rng: new Rng(3) });
  assert.ok(giant.min[1] <= -3, `roots reach y=${giant.min[1]}`);
  const countAt = (y: number) => giant.logs.toArray().filter((p) => p[1] === y).length;
  assert.equal(countAt(-1), countAt(0), "first root layer copies the ground layer");
  assert.ok(countAt(giant.min[1]) < countAt(-1), "deepest layer is smaller");
});

test("line6 is face-connected and hits both ends", () => {
  const points = line6(0, 10, 0, 7, 12, -5);
  assert.deepEqual(points[0], [0, 10, 0]);
  assert.deepEqual(points.at(-1), [7, 12, -5]);
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1]!, points[i]!];
    assert.equal(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]), 1);
  }
});

test("age field stays in range and matches the Java formulas", () => {
  for (let x = -2000; x <= 2000; x += 137) {
    for (let z = -2000; z <= 2000; z += 149) {
      const age = ageAt(x, z);
      assert.ok(age >= 0.05 && age <= 1, `age ${age} at ${x},${z}`);
      const radius = trueRadiusAt(x, z);
      assert.ok(radius >= 0.5 && radius <= MAX_TRUE_RADIUS);
    }
  }
  assert.ok(Math.abs(applySCurve(0.5) - 0.5) < 1e-9, "S-curve is centered");
  assert.equal(applySCurve(1), 1);
  assert.ok(Math.abs(growProbability(0.5) - 0.08 / Math.pow(0.5, 1.5)) < 1e-12);
  assert.ok(growProbability(MAX_TRUE_RADIUS) < 0.011, "giants are rare");
});

test("tiny trees have foliage but no wooden branches; giants have thick limbs", () => {
  for (const seed of SEEDS) {
    const tiny = generateSequoia({ trueRadius: 0.5, rng: new Rng(seed) });
    // Without branches, all wood is within the trunk's own footprint (radius 0.5 plus a little flare).
    for (const [x, , z] of tiny.logs) assert.ok(Math.abs(x) <= 2 && Math.abs(z) <= 2, `seed ${seed}: branch wood at ${x},${z}`);
    assert.ok(tiny.leaves.size > 20, `seed ${seed}: tiny tree has foliage`);
  }
  const giant = generateSequoia({ trueRadius: MAX_TRUE_RADIUS, rng: new Rng(2) });
  const farWood = giant.logs.toArray().filter(([x, y, z]) => y > 10 && Math.hypot(x, z) > 6);
  assert.ok(farWood.length > 50, `giant has long limbs (${farWood.length} logs beyond 6 blocks)`);
  assert.ok(giant.leaves.size > giant.logs.size * 0.25, `giant has a real crown: ${giant.leaves.size} leaves, ${giant.logs.size} logs`);

  const thin = generateSequoia({ trueRadius: MAX_TRUE_RADIUS, rng: new Rng(2), params: { limbThickness: 0 } });
  assert.ok(giant.logs.size > thin.logs.size + 10, "thick limbs add wood on a giant");
  // Radius 2 sits right at the threshold (it may gain a block or two); 1.5 is clearly below it.
  const small = generateSequoia({ trueRadius: 1.5, rng: new Rng(2) });
  const smallThin = generateSequoia({ trueRadius: 1.5, rng: new Rng(2), params: { limbThickness: 0 } });
  assert.equal(small.logs.size, smallThin.logs.size, "small trees never get limbs thicker than one block");
});

test("thick limbs stay low in the crown", () => {
  const thick = generateSequoia({ trueRadius: MAX_TRUE_RADIUS, rng: new Rng(4) });
  const thin = generateSequoia({ trueRadius: MAX_TRUE_RADIUS, rng: new Rng(4), params: { limbThickness: 0 } });
  const extra = thick.logs.toArray().filter(([x, y, z]) => !thin.logs.has(x, y, z));
  assert.ok(extra.length > 0, "giant has some thick limbs");
  const crownBase = 0.45 * thick.height;
  const limit = crownBase + DEFAULT_SEQUOIA_PARAMS.limbThickUntil * (thick.height - crownBase) + 6; // + a little for the limbs' upward sweep
  for (const [, y] of extra) assert.ok(y <= limit, `thickened wood at y=${y}, above ${limit.toFixed(0)}`);
});

test("sub-branching and thickness are independent", () => {
  const grow = (trueRadius: number, params: object) => generateSequoia({ trueRadius, rng: new Rng(3), params });
  const same = (a: ReturnType<typeof grow>, b: ReturnType<typeof grow>) =>
    a.logs.size === b.logs.size && a.logs.toArray().every(([x, y, z]) => b.logs.has(x, y, z));

  // Thickness without sub-branches: on a giant with sub-branches off, thickness still changes the wood.
  assert.ok(
    !same(grow(MAX_TRUE_RADIUS, { subBranchRate: 0 }), grow(MAX_TRUE_RADIUS, { subBranchRate: 0, limbThickness: 0 })),
    "thick limbs appear with sub-branches off",
  );
  // Sub-branches without thickness: with thickness switched off, a giant still sub-branches.
  assert.ok(
    !same(grow(MAX_TRUE_RADIUS, { limbThickness: 0 }), grow(MAX_TRUE_RADIUS, { limbThickness: 0, subBranchRate: 0 })),
    "sub-branches appear with thickness off",
  );
});

test("limb thickness responds smoothly, not in a few fixed steps", () => {
  const woodAt = (limbThickness: number) =>
    generateSequoia({ trueRadius: MAX_TRUE_RADIUS, rng: new Rng(2), params: { limbThickness } }).logs.size;
  const counts = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map(woodAt);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i]! >= counts[i - 1]!, "more thickness never removes wood");
  assert.ok(new Set(counts).size >= 7, `expected many distinct sizes, got ${[...new Set(counts)].length}: ${counts}`);
});

test("sub-branches are never thickened: thickness only adds wood near the main limbs", () => {
  // With sub-branches off, thickness adds exactly the same blocks as with them on, minus nothing:
  // if sub-branches were being thickened, switching them on would add thick wood of their own.
  const grow = (params: object) => generateSequoia({ trueRadius: MAX_TRUE_RADIUS, rng: new Rng(5), params });
  const extraWith = grow({ subBranchCountJitter: 0 }).logs.size - grow({ subBranchCountJitter: 0, limbThickness: 0 }).logs.size;
  const extraWithout =
    grow({ subBranchCountJitter: 0, subBranchLength: 0.01 }).logs.size -
    grow({ subBranchCountJitter: 0, subBranchLength: 0.01, limbThickness: 0 }).logs.size;
  assert.ok(extraWith <= extraWithout, `thickness added ${extraWith} logs with sub-branches vs ${extraWithout} with stubs`);
});

test("log grain: trunk is vertical, branches run along their direction, exposed ends are bark-capped", () => {
  const tree = generateSequoia({ trueRadius: MAX_TRUE_RADIUS, rng: new Rng(6) });
  const STEP = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } as const;
  let sideways = 0;
  for (const [x, y, z] of tree.logs) {
    const axis = tree.axisOf(x, y, z);
    if (y < 0.3 * tree.height) assert.equal(axis, "y", `trunk log at ${x},${y},${z} should be vertical`);
    if (axis !== "y") sideways++;
    // The rule itself: capped exactly when the next block along the grain, either way, is not wood.
    const [dx, dy, dz] = STEP[axis];
    const exposed = !tree.logs.has(x + dx, y + dy, z + dz) || !tree.logs.has(x - dx, y - dy, z - dz);
    assert.equal(tree.barkCapped.has(x, y, z), exposed, `cap mismatch at ${x},${y},${z}`);
  }
  assert.ok(sideways > 100, `a giant has many sideways branch logs (${sideways})`);
  assert.ok(tree.barkCapped.has(0, tree.height - 1, 0), "the top of the trunk is capped");
});
