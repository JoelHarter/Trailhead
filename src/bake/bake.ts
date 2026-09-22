// Bakes sequoia trees into .mcstructure files plus the feature JSON that places them.
// Bedrock cannot run code during world generation, so the tree algorithm runs here instead and the
// game places the results. See doc/04-worldgen-design.md.
//
// Everything written here is a build output (under build/BP); nothing is hand-edited.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AgeParams, DEFAULT_AGE_PARAMS, MAX_TRUE_RADIUS, MIN_TRUE_RADIUS, growProbability } from "../core/fields/age.ts";
import { ageMolang, sizeClassMolang } from "../core/fields/ageMolang.ts";
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
  writeAgeDrivenDecoration(namespace, behaviorPackDir, age);
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

/**
 * Everything else in the grove that the Java mod tied to forest age, written against the same Molang field:
 * - soil: young (age <= 0.20) keeps grass, middle (to 0.50) coarse dirt, old podzol, per column
 * - dandelions only in young areas (age <= 0.20)
 * - understory spruce: 10 attempts per chunk; an attempt grows with chance 1 - 2/3 age, and is a giant
 *   with chance 1/2 age, so spruce thin out and skew large as the forest ages
 */
function writeAgeDrivenDecoration(namespace: string, behaviorPackDir: string, ageParams: AgeParams) {
  const featuresDir = join(behaviorPackDir, "features");
  const rulesDir = join(behaviorPackDir, "feature_rules");
  const age = ageMolang(ageParams, "v.originx", "v.originz");
  const grove = [{ test: "has_biome_tag", operator: "==", value: `${namespace}_sequoia_grove` }];
  const scatter = (id: string, body: Record<string, unknown>) =>
    writeJson(join(featuresDir, `${id}.json`), { format_version: FEATURE_FORMAT, "minecraft:scatter_feature": { description: { identifier: `${namespace}:${id}` }, coordinate_eval_order: "xzy", ...body } });
  const rule = (id: string, places: string, pass: string, distribution: Record<string, unknown>) =>
    writeJson(join(rulesDir, `${id}.json`), { format_version: FEATURE_FORMAT, "minecraft:feature_rules": {
      description: { identifier: `${namespace}:${id}`, places_feature: places },
      conditions: { placement_pass: pass, "minecraft:biome_filter": grove }, distribution } });

  // --- soil: walk every column of the chunk (16 x 16) and paint the top block by age
  for (const [name, block, low, high] of [["coarse_dirt", { name: "minecraft:dirt", states: { dirt_type: "coarse" } }, 0.2, 0.5], ["podzol", "minecraft:podzol", 0.5, 1.01]] as const) {
    writeJson(join(featuresDir, `soil_${name}_block.json`), { format_version: FEATURE_FORMAT, "minecraft:single_block_feature": {
      description: { identifier: `${namespace}:soil_${name}_block` }, places_block: block,
      enforce_placement_rules: false, enforce_survivability_rules: false,
      may_replace: ["minecraft:grass_block", "minecraft:dirt", "minecraft:podzol", { name: "minecraft:dirt", states: { dirt_type: "coarse" } }] } });
    scatter(`soil_${name}_gate`, { places_feature: `${namespace}:soil_${name}_block`,
      iterations: `(${age} > ${low} && ${age} <= ${high}) ? 1 : 0`, x: 0, z: 0, y: "q.heightmap(v.originx, v.originz) - 1" });
  }
  writeJson(join(featuresDir, "soil_column.json"), { format_version: FEATURE_FORMAT, "minecraft:aggregate_feature": {
    description: { identifier: `${namespace}:soil_column` }, early_out: "first_success",
    features: [`${namespace}:soil_podzol_gate`, `${namespace}:soil_coarse_dirt_gate`] } });
  scatter("soil_row", { places_feature: `${namespace}:soil_column`, iterations: 16, x: 0, y: 0,
    z: { distribution: "fixed_grid", extent: [0, 15], step_size: 1, grid_offset: 0 } });
  scatter("soil_chunk", { places_feature: `${namespace}:soil_row`, iterations: 16, y: 0, z: 0,
    x: { distribution: "fixed_grid", extent: [0, 15], step_size: 1, grid_offset: 0 } });
  rule("grove_soil", `${namespace}:soil_chunk`, "before_surface_pass", { iterations: 1, coordinate_eval_order: "xzy", x: 0, y: 0, z: 0 });

  // --- dandelions: the existing patch, gated on young forest at the patch's origin
  scatter("dandelion_young_gate", { places_feature: `${namespace}:dandelion_patch`, iterations: `(${age} <= 0.2) ? 1 : 0`, x: 0, y: 0, z: 0 });
  rule("grove_dandelion", `${namespace}:dandelion_young_gate`, "surface_pass", { iterations: 2, coordinate_eval_order: "xzy",
    x: { distribution: "uniform", extent: [0, 15] }, z: { distribution: "uniform", extent: [0, 15] }, y: "q.heightmap(v.worldx, v.worldz)" });

  // --- understory spruce by age. One roll decides "grows at all" (1 - 2/3 age) and another "giant"
  // (1/2 age); written as two gates tried in order with first_success, so the second is conditional.
  const grows = `(1 - 0.6667 * ${age})`;
  const giantShare = `(0.5 * ${age})`;
  scatter("spruce_giant_gate", { places_feature: `${namespace}:understory_giant_spruce`,
    iterations: `(math.random(0, 1) < ${grows} * ${giantShare}) ? 1 : 0`, x: 0, y: 0, z: 0 });
  scatter("spruce_normal_gate", { places_feature: `${namespace}:understory_spruce`,
    iterations: `(math.random(0, 1) < ${grows} * (1 - ${giantShare}) / (1 - ${grows} * ${giantShare})) ? 1 : 0`, x: 0, y: 0, z: 0 });
  writeJson(join(featuresDir, "spruce_attempt.json"), { format_version: FEATURE_FORMAT, "minecraft:aggregate_feature": {
    description: { identifier: `${namespace}:spruce_attempt` }, early_out: "first_success",
    features: [`${namespace}:spruce_giant_gate`, `${namespace}:spruce_normal_gate`] } });
  rule("grove_spruce", `${namespace}:spruce_attempt`, "surface_pass", { iterations: 10, coordinate_eval_order: "xzy",
    x: { distribution: "uniform", extent: [0, 15] }, z: { distribution: "uniform", extent: [0, 15] }, y: "q.heightmap(v.worldx, v.worldz)" });
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}
