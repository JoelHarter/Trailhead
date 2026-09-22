// Bakes sequoia trees into .mcstructure files plus the feature JSON that places them.
// Bedrock cannot run code during world generation, so the tree algorithm runs here instead and the
// game places the results. See doc/04-worldgen-design.md.
//
// Everything written here is a build output (under build/BP); nothing is hand-edited.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AgeParams, DEFAULT_AGE_PARAMS, MAX_TRUE_RADIUS, MIN_TRUE_RADIUS, growProbability } from "../core/fields/age.ts";
import { sizeClassMolang } from "../core/fields/ageMolang.ts";
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
  /** Shifts the forest age map, so each world shows a different part of it. */
  worldOffset?: { x: number; z: number };
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

export function bakeSequoias({ namespace, behaviorPackDir, worldOffset }: BakeOptions): { classes: BakedClass[]; bytes: number } {
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

  const age: AgeParams = { ...DEFAULT_AGE_PARAMS, offsetX: worldOffset?.x ?? 0, offsetZ: worldOffset?.z ?? 0 };
  writeForestRule(namespace, behaviorPackDir, classes, age);
  return { classes, bytes };
}

/** Attempts per chunk, as in the Java mod; with the density law this sets how many trees a chunk gets. */
const ATTEMPTS_PER_CHUNK = 32;
/** Trees are not placed where the ground is at or below this height: sea level, which is also river level. */
const WATER_LEVEL = 63;

/**
 * The forest: which size of tree grows where, decided by the age field during world generation.
 *
 * The Java mod made 32 attempts per chunk; each attempt read the age at its spot, which set the tree's
 * size, and then grew with probability p = K / radius^1.5. This does the same thing, arranged to suit
 * Bedrock, which has no "choose a feature by a condition": for each size class, the chunk makes as many
 * attempts as that class would grow (32 x p), at random spots, and an attempt places a tree of that
 * class only if the age field at its spot calls for that class. The field is evaluated about 40 times
 * per chunk this way instead of 320.
 */
function writeForestRule(namespace: string, behaviorPackDir: string, classes: BakedClass[], age: AgeParams) {
  const featuresDir = join(behaviorPackDir, "features");
  const classAt = sizeClassMolang(age, classes.length, "v.originx", "v.originz");
  const attemptFeatures: string[] = [];

  for (const c of classes) {
    const id = `sequoia_class_${String(c.index).padStart(2, "0")}`;
    const expected = ATTEMPTS_PER_CHUNK * growProbability((c.minRadius + c.maxRadius) / 2, age.kDensity);
    const iterations = Math.ceil(expected);

    // The gate: at the attempt's own spot, is this the class the field calls for, and is it dry land?
    writeJson(join(featuresDir, `${id}_gate.json`), {
      format_version: FEATURE_FORMAT,
      "minecraft:scatter_feature": {
        description: { identifier: `${namespace}:${id}_gate` },
        places_feature: c.feature,
        iterations: `(${classAt} == ${c.index} && q.heightmap(v.originx, v.originz) > ${WATER_LEVEL}) ? 1 : 0`,
        coordinate_eval_order: "xzy",
        x: 0,
        z: 0,
        y: `q.heightmap(v.originx, v.originz) - ${ROOT_DEPTH}`,
      },
    });
    // The attempts: random spots in the chunk.
    const attempts: Record<string, unknown> = {
      description: { identifier: `${namespace}:${id}_attempts` },
      places_feature: `${namespace}:${id}_gate`,
      iterations,
      coordinate_eval_order: "xzy",
      x: { distribution: "uniform", extent: [0, 15] },
      z: { distribution: "uniform", extent: [0, 15] },
      y: 0,
    };
    const percent = Math.round((expected / iterations) * 100);
    if (percent < 100) attempts.scatter_chance = { numerator: percent, denominator: 100 };
    writeJson(join(featuresDir, `${id}_attempts.json`), { format_version: FEATURE_FORMAT, "minecraft:scatter_feature": attempts });
    attemptFeatures.push(`${namespace}:${id}_attempts`);
  }

  writeJson(join(featuresDir, "sequoia_forest.json"), {
    format_version: FEATURE_FORMAT,
    "minecraft:aggregate_feature": {
      description: { identifier: `${namespace}:sequoia_forest` },
      early_out: "none",
      features: attemptFeatures,
    },
  });

  const rulesDir = join(behaviorPackDir, "feature_rules");
  mkdirSync(rulesDir, { recursive: true });
  writeJson(join(rulesDir, "sequoia_forest.json"), {
    format_version: FEATURE_FORMAT,
    "minecraft:feature_rules": {
      description: { identifier: `${namespace}:sequoia_forest`, places_feature: `${namespace}:sequoia_forest` },
      conditions: {
        placement_pass: "surface_pass",
        "minecraft:biome_filter": [{ test: "has_biome_tag", operator: "==", value: `${namespace}_has_giant_sequoias` }],
      },
      distribution: { iterations: 1, coordinate_eval_order: "xzy", x: 0, z: 0, y: 0 },
    },
  });
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}
