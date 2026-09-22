// The forest "age" field: a smooth map over the world that decides how big sequoias are and how densely
// they grow. Age 0 is the youngest forest, 1 the most ancient.
//
// The Java mod summed sin(x)*cos(z) products, which makes an axis-aligned, repeating grid: on a map it
// looks like tartan. This version layers smooth noise at three scales, which reads like a topographic
// map: broad hills of age (groves of similar age), medium detail, and fine tree-to-tree variety.
// In the game the same recipe is written in Molang with q.noise; here a look-alike noise stands in.
import { noise2 } from "./noise.ts";

export const K_DENSITY = 0.245;
export const MIN_TRUE_RADIUS = 0.5;
export const MAX_TRUE_RADIUS = 3.85;
/** The noise's hills are about this many input units apart (measured), so spacing / this = the divisor. */
export const HILL_SPACING_UNITS = 1.4;

export interface AgeParams {
  /** Distance between neighboring hills of age, in blocks, for each layer; and each layer's weight. */
  groveSpacing: number;
  groveWeight: number;
  detailSpacing: number;
  detailWeight: number;
  treeSpacing: number;
  treeWeight: number;
  /** Contrast: 0 = a gentle gradient, high = distinct young and ancient areas with sharp edges. */
  contrast: number;
  /** Shifts the whole map, so each world can show a different part of it. Set per world at build time. */
  offsetX: number;
  offsetZ: number;
  /** Density law p = kDensity / radius^1.5. Higher = denser forest everywhere. */
  kDensity: number;
}

export const DEFAULT_AGE_PARAMS: Readonly<AgeParams> = {
  groveSpacing: 230,
  groveWeight: 0.51,
  detailSpacing: 86,
  detailWeight: 0.25,
  treeSpacing: 14,
  treeWeight: 0.73,
  contrast: 3,
  offsetX: 0,
  offsetZ: 0,
  kDensity: K_DENSITY,
};

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/** Logistic contrast curve on 0..1, renormalized so 0 stays 0 and 1 stays 1. */
export function applyContrast(age: number, strength: number): number {
  if (strength <= 0) return age;
  const sigmoid = (t: number) => 1 / (1 + Math.exp(-strength * t));
  const low = sigmoid(-0.5);
  const high = sigmoid(0.5);
  return clamp((sigmoid(age - 0.5) - low) / (high - low), 0, 1);
}

/** The field's layers as [spacing in blocks, weight, input shift]; shifted inputs give unrelated layers. */
export function ageLayers(params: AgeParams): [spacing: number, weight: number, shift: number][] {
  return [
    [params.groveSpacing, params.groveWeight, 0],
    [params.detailSpacing, params.detailWeight, 50.5],
    [params.treeSpacing, params.treeWeight, 91.7],
  ];
}

/** Forest age in 0..1 at a world position. */
export function ageAt(x: number, z: number, params: AgeParams = DEFAULT_AGE_PARAMS): number {
  const layers = ageLayers(params);
  let sum = 0;
  let total = 0;
  let power = 0;
  for (const [spacing, weight, shift] of layers) {
    if (weight <= 0) continue;
    const divisor = Math.max(1, spacing) / HILL_SPACING_UNITS;
    sum += weight * noise2((x + params.offsetX) / divisor + shift, (z + params.offsetZ) / divisor + shift);
    total += weight;
    power += weight * weight;
  }
  if (total === 0) return 0.5;
  // A sum of layers bunches toward the middle; dividing by the root of the summed squares restores the
  // spread a single layer has, so ancient and young extremes stay as common whatever the weights.
  const field = clamp(sum / Math.sqrt(power), -1, 1);
  return applyContrast((field + 1) / 2, params.contrast);
}

/** True trunk radius (without root flare) of a sequoia growing at this position. */
export function trueRadiusAt(x: number, z: number, params: AgeParams = DEFAULT_AGE_PARAMS): number {
  return MIN_TRUE_RADIUS + (MAX_TRUE_RADIUS - MIN_TRUE_RADIUS) * ageAt(x, z, params);
}

/** Chance that one placement attempt actually grows a tree: big trees suppress their neighbors. */
export function growProbability(trueRadius: number, kDensity: number = K_DENSITY): number {
  return Math.min(1, kDensity / Math.pow(trueRadius, 1.5));
}
