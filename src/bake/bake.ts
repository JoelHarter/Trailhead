// Bakes sequoia trees into .mcstructure files plus the feature JSON that places them.
// Bedrock cannot run code during world generation, so the tree algorithm runs here instead and the
// game places the results. See doc/04-worldgen-design.md.
//
// Everything written here is a build output (under build/BP); nothing is hand-edited.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_TRUE_RADIUS, MIN_TRUE_RADIUS, growProbability } from "../core/fields/age.ts";
import { Rng, seedFromPosition } from "../core/rng.ts";
import { generateSequoia } from "../core/trees/sequoia.ts";
import { StructureBuilder } from "./mcstructure.ts";

export const SIZE_CLASSES = 10;
export const VARIANTS_PER_CLASS = 4;
/** Every structure keeps this many layers below ground level for the root cone. */
export const ROOT_DEPTH = 8;

const FEATURE_FORMAT = "1.13.0";

export interface BakeOptions {
  namespace: string;
  behaviorPackDir: string;
}

export interface BakedClass {
  index: number;
  minRadius: number;
  maxRadius: number;
  feature: string;
}

/** Radius range covered by a size class. Classes split [MIN, MAX] evenly. */
export function classRadiusRange(index: number): [min: number, max: number] {
  const step = (MAX_TRUE_RADIUS - MIN_TRUE_RADIUS) / SIZE_CLASSES;
  return [MIN_TRUE_RADIUS + step * index, MIN_TRUE_RADIUS + step * (index + 1)];
}

export function bakeSequoias({ namespace, behaviorPackDir }: BakeOptions): { classes: BakedClass[]; bytes: number } {
  const structuresDir = join(behaviorPackDir, "structures", namespace, "sequoia");
  const featuresDir = join(behaviorPackDir, "features");
  mkdirSync(structuresDir, { recursive: true });
  mkdirSync(featuresDir, { recursive: true });

  // Log and wood blocks take their grain direction from the "minecraft:block_face" state, which the
  // block files turn into a rotation: up = vertical, east = along x, north = along z.
  const FACE_FOR_AXIS = { x: "east", y: "up", z: "north" } as const;
  const woodBlock = (kind: "sequoia_log" | "sequoia_wood", axis: "x" | "y" | "z") => ({
    name: `${namespace}:${kind}`,
    states: { "minecraft:block_face": FACE_FOR_AXIS[axis] },
  });
  const leaves = { name: `${namespace}:sequoia_leaves` };
  const classes: BakedClass[] = [];
  let bytes = 0;

  for (let c = 0; c < SIZE_CLASSES; c++) {
    const [minRadius, maxRadius] = classRadiusRange(c);
    const classId = `sequoia_c${String(c).padStart(2, "0")}`;
    const variantFeatures: string[] = [];

    for (let v = 0; v < VARIANTS_PER_CLASS; v++) {
      // Spread the variants across the class's radius range so a class is not all one size.
      const trueRadius = minRadius + ((v + 0.5) / VARIANTS_PER_CLASS) * (maxRadius - minRadius);
      const tree = generateSequoia({ trueRadius, rng: new Rng(seedFromPosition(c, v, 0x5e90)) });
      if (tree.min[1] < -ROOT_DEPTH) throw new Error(`${classId} v${v}: roots deeper than ROOT_DEPTH`);

      // Square footprint centered on the trunk, so rotation and placement stay centered on it.
      const half = Math.max(-tree.min[0], tree.max[0], -tree.min[2], tree.max[2]);
      const side = 2 * half + 1;
      if (side > 48) throw new Error(`${classId} v${v}: footprint ${side} exceeds Bedrock's 48-block limit`);

      const builder = new StructureBuilder(side, tree.max[1] + ROOT_DEPTH + 1, side);
      for (const [x, y, z] of tree.leaves) builder.set(x + half, y + ROOT_DEPTH, z + half, leaves);
      for (const [x, y, z] of tree.logs) {
        const kind = tree.barkCapped.has(x, y, z) ? "sequoia_wood" : "sequoia_log";
        builder.set(x + half, y + ROOT_DEPTH, z + half, woodBlock(kind, tree.axisOf(x, y, z)));
      }

      const variantId = `${classId}_v${v}`;
      const data = builder.encode();
      bytes += data.length;
      writeFileSync(join(structuresDir, `${variantId}.mcstructure`), data);

      writeJson(join(featuresDir, `${variantId}.json`), {
        format_version: FEATURE_FORMAT,
        "minecraft:structure_template_feature": {
          description: { identifier: `${namespace}:${variantId}` },
          structure_name: `${namespace}:sequoia/${variantId}`,
          adjustment_radius: 0,
          facing_direction: "random",
          constraints: {},
        },
      });
      variantFeatures.push(`${namespace}:${variantId}`);
    }

    writeJson(join(featuresDir, `${classId}.json`), {
      format_version: FEATURE_FORMAT,
      "minecraft:weighted_random_feature": {
        description: { identifier: `${namespace}:${classId}` },
        features: variantFeatures.map((feature) => [feature, 1]),
      },
    });
    classes.push({ index: c, minRadius, maxRadius, feature: `${namespace}:${classId}` });
  }

  writeForestRule(namespace, behaviorPackDir, classes);
  return { classes, bytes };
}

/** Attempts per chunk in the Java mod; with the density law this sets how many trees a chunk gets. */
const ATTEMPTS_PER_CHUNK = 32;

/**
 * INTERIM forest layout, until the age field is reworked and wired in: every chunk of a biome tagged
 * "<namespace>_has_giant_sequoias" gets a mix of all size classes, each as common as the density law
 * p = K / radius^1.5 makes it (many small trees, few giants), but with no spatial pattern: sizes are
 * shuffled together instead of forming groves of similar age.
 */
function writeForestRule(namespace: string, behaviorPackDir: string, classes: BakedClass[]) {
  const chance = classes.map((c) => growProbability((c.minRadius + c.maxRadius) / 2));
  const treesPerChunk = (ATTEMPTS_PER_CHUNK * chance.reduce((a, b) => a + b, 0)) / classes.length;
  const iterations = Math.ceil(treesPerChunk);

  writeJson(join(behaviorPackDir, "features", "sequoia_any_size.json"), {
    format_version: FEATURE_FORMAT,
    "minecraft:weighted_random_feature": {
      description: { identifier: `${namespace}:sequoia_any_size` },
      features: classes.map((c, i) => [c.feature, Math.max(1, Math.round(chance[i]! * 1000))]),
    },
  });

  const rulesDir = join(behaviorPackDir, "feature_rules");
  mkdirSync(rulesDir, { recursive: true });
  writeJson(join(rulesDir, "sequoia_forest.json"), {
    format_version: FEATURE_FORMAT,
    "minecraft:feature_rules": {
      description: { identifier: `${namespace}:sequoia_forest`, places_feature: `${namespace}:sequoia_any_size` },
      conditions: {
        placement_pass: "surface_pass",
        "minecraft:biome_filter": [{ test: "has_biome_tag", operator: "==", value: `${namespace}_has_giant_sequoias` }],
      },
      distribution: {
        iterations,
        scatter_chance: { numerator: Math.round((treesPerChunk / iterations) * 100), denominator: 100 },
        coordinate_eval_order: "xzy",
        x: { distribution: "uniform", extent: [0, 15] },
        z: { distribution: "uniform", extent: [0, 15] },
        y: `q.heightmap(v.worldx, v.worldz) - ${ROOT_DEPTH}`,
      },
    },
  });
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}
