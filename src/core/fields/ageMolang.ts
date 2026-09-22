// Writes the forest age field as a Molang expression, from the same parameters and the same recipe as
// ageAt() in age.ts, so the viewer and the game cannot drift apart. In the game q.noise plays the part
// that noise2() plays here (measured to be the same kind of noise; see doc/04-worldgen-design.md).
import { type AgeParams, HILL_SPACING_UNITS, ageLayers } from "./age.ts";

const n = (value: number) => Number(value.toFixed(6)).toString();

/** Age in 0..1 at the Molang position (x, z), e.g. ("v.originx", "v.originz"). */
export function ageMolang(params: AgeParams, x: string, z: string): string {
  const layers = ageLayers(params).filter(([, weight]) => weight > 0);
  if (layers.length === 0) return "0.5";
  const norm = Math.sqrt(layers.reduce((sum, [, weight]) => sum + weight * weight, 0));
  const terms = layers.map(([spacing, weight, shift]) => {
    const divisor = Math.max(1, spacing) / HILL_SPACING_UNITS;
    return `${n(weight / norm)}*q.noise((${x}+${n(params.offsetX)})/${n(divisor)}+${n(shift)},(${z}+${n(params.offsetZ)})/${n(divisor)}+${n(shift)})`;
  });
  const linear = `((math.clamp(${terms.join("+")},-1,1)+1)/2)`;
  if (params.contrast <= 0) return linear;
  const sigmoid = (t: number) => 1 / (1 + Math.exp(-params.contrast * t));
  const low = sigmoid(-0.5);
  const high = sigmoid(0.5);
  return `math.clamp((1/(1+math.exp(-${n(params.contrast)}*(${linear}-0.5)))-${n(low)})/${n(high - low)},0,1)`;
}

/** Index of the size class (0 .. classes-1) at the Molang position. */
export function sizeClassMolang(params: AgeParams, classes: number, x: string, z: string): string {
  return `math.clamp(math.floor(${ageMolang(params, x, z)}*${classes}),0,${classes - 1})`;
}
