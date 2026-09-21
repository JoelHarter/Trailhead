// The forest "age" field: a smooth 2D map over the world that decides how big sequoias are
// and how densely they grow. Ported from SequoiaTrunkPlacer.java (getAgeHeatmap and friends).

export const S_CURVE_STRENGTH = 3.5;
export const K_DENSITY = 0.08;
export const MIN_TRUE_RADIUS = 0.5;
export const MAX_TRUE_RADIUS = 3.85;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/** Logistic contrast curve, renormalized so 0 maps to 0 and 1 maps to 1; result clamped to [0.05, 1]. */
export function applySCurve(age: number, strength: number = S_CURVE_STRENGTH): number {
  if (strength <= 0) return age;
  const sigmoid = (t: number) => 1 / (1 + Math.exp(-strength * t));
  const low = sigmoid(-0.5);
  const high = sigmoid(0.5);
  return clamp((sigmoid(age - 0.5) - low) / (high - low), 0.05, 1);
}

export interface AgeParams {
  /** Contrast of the S-curve: 0 = none; higher pushes the forest toward "all young" or "all ancient". */
  sCurveStrength: number;
  /** Density law p = kDensity / radius^1.5. Higher = denser forest everywhere. */
  kDensity: number;
  /** Weights of the three waves (~628, ~251, ~78 block wavelengths). */
  macroAmplitude: number;
  midAmplitude: number;
  microAmplitude: number;
}

export const DEFAULT_AGE_PARAMS: Readonly<AgeParams> = {
  sCurveStrength: S_CURVE_STRENGTH,
  kDensity: K_DENSITY,
  macroAmplitude: 0.35,
  midAmplitude: 0.15,
  microAmplitude: 0.12,
};

/** Age before the contrast curve: three overlapping sin*cos waves (~628, ~251, ~78 block wavelengths). */
export function rawAge(x: number, z: number, params: AgeParams = DEFAULT_AGE_PARAMS): number {
  const macro = Math.sin(x * 0.01) * Math.cos(z * 0.01);
  const mid = Math.sin((x + 150) * 0.025 + 1.2) * Math.cos((z - 90) * 0.025 + 0.8);
  const micro = Math.sin(x * 0.08 + 0.5) * Math.cos(z * 0.08 - 0.7);
  return clamp(
    0.5 + params.macroAmplitude * macro + params.midAmplitude * mid + params.microAmplitude * micro,
    0.05,
    1,
  );
}

/** Forest age A(x, z) in [0.05, 1]. */
export function ageAt(x: number, z: number, params: AgeParams = DEFAULT_AGE_PARAMS): number {
  return applySCurve(rawAge(x, z, params), params.sCurveStrength);
}

/** True trunk radius (without root flare) of a sequoia growing at this position. */
export function trueRadiusAt(x: number, z: number, params: AgeParams = DEFAULT_AGE_PARAMS): number {
  return MIN_TRUE_RADIUS + (MAX_TRUE_RADIUS - MIN_TRUE_RADIUS) * ageAt(x, z, params);
}

/** Chance that one placement attempt actually grows a tree: big trees suppress their neighbors. */
export function growProbability(trueRadius: number, kDensity: number = K_DENSITY): number {
  return Math.min(1, kDensity / Math.pow(trueRadius, 1.5));
}
