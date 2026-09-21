// Giant sequoia generator. A pure function: given a trunk radius and a random source it returns
// block positions relative to the trunk base (0, 0, 0), where y = 0 is the first layer above ground.
//
// Ported from SequoiaTrunkPlacer.java in the Java mod, which is the authoritative spec
// (it evolved past the original Julia prototype). Real-tree reference points: General Sherman has a
// true diameter of 7.7 m and 11.1 m including root flare; Hyperion is 116.22 m tall.
//
// Not ported here, because they depend on the surrounding world rather than on the tree:
// bee nests, the moss carpet ring, and podzol conversion.
import type { Rng } from "../rng.ts";
import { VoxelSet, pack } from "../voxels.ts";

export const MAX_TRUE_RADIUS = 3.85;

export const MIN_TRUE_RADIUS = 0.5;

/** Every tunable number in the algorithm. The tree viewer exposes these as sliders. */
export interface SequoiaParams {
  // --- Height
  /** Tree height = heightPerRadius x true radius, until it stalls. */
  heightPerRadius: number;
  /** Height at which growth stalls, before random variation. */
  stallHeight: number;
  /** Absolute height cap (Hyperion: 116.22 m). */
  maxHeight: number;
  /** Random height variation (standard deviation, as a fraction). */
  sigmaHeight: number;

  // --- Trunk and roots
  /** Root flare radius of the largest tree. Smaller trees scale down in proportion. */
  maxFlareRadius: number;
  /** Random flare variation (standard deviation, as a fraction). May exceed the nominal size by up to 50%. */
  sigmaFlare: number;
  /** How strongly the angular noise carves the flare into separate buttress roots (0 = smooth skirt). */
  rootNoiseAmount: number;
  /** Clamp on the raw root noise. */
  rootNoiseCutoff: number;
  /** Trunk taper: radius shrinks as (1 - y/H)^taperExponent. Lower = more columnar. */
  taperExponent: number;
  /** Flare fades as exp(-(y/H) / flareDecay). Higher = flare reaches further up the trunk. */
  flareDecay: number;

  // --- Crown shape. "Young" applies to the smallest trees, "old" to the largest; sizes between blend.
  /** Overall crown width: widest radius = canopyFactor x sqrt(H x crown depth). */
  canopyFactor: number;
  /** Young trees are leaner: their crown width is multiplied by this (the largest trees by 1). */
  crownWidthYoung: number;
  /** Fraction of the height where the crown begins (below is bare trunk). */
  branchStartYoung: number;
  branchStartOld: number;
  /** Fraction of the height where the last branch sits. */
  branchEnd: number;
  /** Crown profile exponent: 1 = straight-sided spire, 0.5 = rounded dome. */
  crownShapeYoung: number;
  crownShapeOld: number;
  /** How much the lowest branches are pulled in, rounding the underside of the crown (0 = flat bottom). */
  crownBaseTuck: number;

  // --- Branch placement: branches are spaced so foliage covers a target share of the crown's shell.
  /** Share of the shell that is leafy at the bottom of the crown: young trees are dense cones, ancients open. */
  coverageBottomYoung: number;
  coverageBottomOld: number;
  /** Share at the top. Above 1, clumps overlap into a solid mass. */
  coverageTop: number;
  /** How the share rises in between: 1 = steadily, higher = stays open longer, then fills quickly. */
  coverageCurve: number;
  /** Upward slope of short, straight branches. */
  branchRise: number;
  /** Random wobble added to the golden-angle spacing, in radians. */
  branchAngleJitter: number;
  /** A branch gets wood only if it would stick out at least this far past the trunk. Keeps tiny trees twig-free. */
  minBranchWood: number;
  /** Minimum vertical gap between wooden branches. Raise it if dense upper branches fuse into solid wood. */
  woodSpacing: number;

  // --- Branch character. Each of these grows smoothly with the branch's own size (the length that
  // sticks out past the trunk) and simply stops showing below a natural threshold. They are independent.
  /** Elbow: a branch this long has the full droop-then-sweep-up shape; at half this length it is straight. */
  elbowLength: number;
  /** Slope of the inner two-thirds of a fully elbowed branch (negative = droops). */
  elbowDroop: number;
  /** Slope of the outer third, after the elbow. */
  elbowRise: number;
  /** Thickness: branches shorter than this are a single block thick (radius 0.5)... */
  limbThickStartLength: number;
  /** ...then the radius grows by this much per block of extra length. */
  limbThickness: number;
  /** Thickness also fades with height, reaching nothing at this fraction of the way up the crown. */
  limbThickUntil: number;
  /** Fraction of a thick limb's length over which it tapers, as a cone, down to a single block. */
  limbTaperEnd: number;
  /** Sub-branches: none on branches shorter than this... */
  subBranchStartLength: number;
  /** ...then this many more per block of extra length. */
  subBranchRate: number;
  /**
   * Sub-branch length as a fraction of what remains of the main branch beyond the point where it leaves.
   * Laterals are therefore longest near the trunk and shortest near the tip, like a feather, and none
   * can outreach the main branch. Below about 0.7 the main branch clearly dominates; near 1 it looks forked.
   */
  subBranchLength: number;
  /** Size of a sub-branch's foliage clump relative to the clump at the main tip. */
  subBranchClump: number;
  /** How far sub-branches angle away from the branch, in degrees... */
  subBranchAngle: number;
  /** ...give or take this many degrees, chosen at random for each one. */
  subBranchAngleJitter: number;
  /** Random variation in how many sub-branches a branch gets (0.5 = anywhere from half to one and a half times). */
  subBranchCountJitter: number;

  // --- Trunk foliage: the trunk's own greenery, standing for twigs too fine to be blocks. It grows
  // wherever the trunk is thin (young wood). On a small tree that is the whole crown, so it is the main
  // source of greenery; on a giant only the last few blocks, where it blends into the branch clumps.
  /** Trunk foliage grows where the trunk's radius is below this. */
  trunkFoliageMaxTrunkRadius: number;
  /** How far it reaches, as a fraction of the crown outline at that height. */
  trunkFoliageFill: number;
  /** Chance that a block on its surface is left out. */
  trunkFoliageRoughness: number;

  // --- Foliage clumps
  /** Clump half-width across the branch = clumpWidthFactor x branch length, within [min, max]. */
  clumpWidthFactor: number;
  clumpWidthMin: number;
  clumpWidthMax: number;
  /** Clump half-length along the branch, relative to its half-width. */
  clumpLengthRatio: number;
  /** Clump height above the branch, relative to its half-width. The underside is half as deep. */
  clumpHeightRatio: number;
  /** Random size variation between clumps (fraction). */
  clumpSizeJitter: number;
  /**
   * Roughening: chance that a block near a clump's surface is left out. It depends on the clump's size,
   * because a small clump is nearly all surface and roughening would delete it: none below
   * clumpNibbleStartWidth, rising to the full amount at clumpNibbleFullWidth.
   */
  clumpNibble: number;
  clumpNibbleStartWidth: number;
  clumpNibbleFullWidth: number;
  /** Leaves must be within this many face-to-face steps of a log, through other leaves (vanilla uses 6). */
  leafReach: number;
}

export const DEFAULT_SEQUOIA_PARAMS: Readonly<SequoiaParams> = {
  heightPerRadius: 24.0,
  stallHeight: 101.0,
  maxHeight: 116.22,
  sigmaHeight: 0.1,

  maxFlareRadius: 3.5,
  sigmaFlare: 0.1,
  rootNoiseAmount: 0.8,
  rootNoiseCutoff: 1.8,
  taperExponent: 0.35,
  flareDecay: 0.2,

  canopyFactor: 0.1767767, // = 1 / sqrt(32)
  crownWidthYoung: 0.65,
  branchStartYoung: 0.3,
  branchStartOld: 0.45,
  branchEnd: 0.97,
  crownShapeYoung: 0.85,
  crownShapeOld: 0.5,
  crownBaseTuck: 0.25,

  coverageBottomYoung: 0.9,
  coverageBottomOld: 0.33,
  coverageTop: 1.3,
  coverageCurve: 1.3,
  branchRise: 0.12,
  branchAngleJitter: 0.3,
  minBranchWood: 2.0,
  woodSpacing: 0.4,

  elbowLength: 7,
  elbowDroop: -0.32,
  elbowRise: 0.6,
  limbThickStartLength: 4.5,
  limbThickness: 0.5,
  limbThickUntil: 0.74,
  limbTaperEnd: 0.76,
  subBranchStartLength: 4,
  subBranchRate: 0.5,
  subBranchLength: 0.65,
  subBranchClump: 0.65,
  subBranchAngle: 75,
  subBranchAngleJitter: 20,
  subBranchCountJitter: 0.5,

  trunkFoliageMaxTrunkRadius: 1.1,
  trunkFoliageFill: 1.0,
  trunkFoliageRoughness: 0.2,

  clumpWidthFactor: 0.41,
  clumpWidthMin: 1.6,
  clumpWidthMax: 4.5,
  clumpLengthRatio: 0.8,
  clumpHeightRatio: 0.6,
  clumpSizeJitter: 0.25,
  clumpNibble: 0.77,
  clumpNibbleStartWidth: 1.8,
  clumpNibbleFullWidth: 3.5,
  leafReach: 6,
};

const ROOT_FREQUENCIES = [13, 14, 18, 19] as const;
const ROOT_AMPLITUDES = [0.9, 0.7, 0.3, 0.3] as const;
const GOLDEN_ANGLE = 2.39996;

export interface SequoiaOptions {
  /** True trunk radius in blocks, without root flare. 0.5 (sapling-sized) to 3.85 (General Sherman). */
  trueRadius: number;
  rng: Rng;
  /** Overrides for any of the algorithm's constants. Omitted values use the Java mod's. */
  params?: Partial<SequoiaParams>;
}

export type Axis = "x" | "y" | "z";

export interface SequoiaTree {
  trueRadius: number;
  height: number;
  /** Trunk, root cone (y < 0), and branch logs. */
  logs: VoxelSet;
  /** Which way each log's grain runs: up for the trunk and roots, along the branch for branches. */
  axisOf(x: number, y: number, z: number): Axis;
  /**
   * Logs whose end face (the one showing growth rings) would be visible, because the next block along
   * their axis is not wood: branch tips, bends, and the ledges where the tapering trunk steps inward.
   * These are placed as the all-bark "wood" block instead, as vanilla trees do.
   */
  barkCapped: VoxelSet;
  leaves: VoxelSet;
  /** Inclusive bounding box of all blocks. */
  min: [x: number, y: number, z: number];
  max: [x: number, y: number, z: number];
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function distance3(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 0 for the smallest tree, 1 for the largest. */
function sizeFraction(trueRadius: number): number {
  return clamp((trueRadius - MIN_TRUE_RADIUS) / (MAX_TRUE_RADIUS - MIN_TRUE_RADIUS), 0, 1);
}

/** Height at which the crown begins. Young trees carry foliage low; ancients have a long bare trunk. */
export function crownBaseY(height: number, trueRadius: number, p: SequoiaParams = DEFAULT_SEQUOIA_PARAMS): number {
  return lerp(p.branchStartYoung, p.branchStartOld, sizeFraction(trueRadius)) * height;
}

/**
 * The crown envelope: how far branches reach at a given height. Young trees are spires, ancients
 * domes, and the underside is tucked in so the crown is not a flat-bottomed cone.
 */
export function crownRadiusAt(
  y: number,
  height: number,
  trueRadius: number,
  p: SequoiaParams = DEFAULT_SEQUOIA_PARAMS,
): number {
  const base = crownBaseY(height, trueRadius, p);
  const depth = Math.max(1e-6, height - base);
  if (y >= height) return 0;
  const widest = p.canopyFactor * Math.sqrt(height * depth) * lerp(p.crownWidthYoung, 1, sizeFraction(trueRadius));
  const shape = lerp(p.crownShapeYoung, p.crownShapeOld, sizeFraction(trueRadius));
  const u = clamp((y - base) / depth, 0, 1);
  const tuck = 1 - p.crownBaseTuck * Math.pow(1 - Math.min(1, u / 0.2), 2);
  return widest * Math.pow(1 - u, shape) * tuck;
}

/** Widest reach of the crown including foliage; used for footprint estimates. */
export function maxCrownRadius(height: number, trueRadius: number, p: SequoiaParams = DEFAULT_SEQUOIA_PARAMS): number {
  let widest = 0;
  const base = crownBaseY(height, trueRadius, p);
  for (let y = base; y < height; y += 1) widest = Math.max(widest, crownRadiusAt(y, height, trueRadius, p));
  return widest + clamp(p.clumpWidthFactor * widest, p.clumpWidthMin, p.clumpWidthMax);
}

export function generateSequoia({ trueRadius: rt, rng, params }: SequoiaOptions): SequoiaTree {
  const p: SequoiaParams = { ...DEFAULT_SEQUOIA_PARAMS, ...params };

  const height = Math.round(
    clamp(Math.min(rt * p.heightPerRadius, p.stallHeight) * (1 + rng.nextGaussian() * p.sigmaHeight), 3, p.maxHeight),
  );

  // Sub-block offset of the trunk axis, so trunks are not all centered on a block.
  const axisX = rng.nextFloat() - 0.5;
  const axisZ = rng.nextFloat() - 0.5;

  // The ceiling sits above the nominal size so the largest trees can vary upward as well as downward.
  const flare = clamp(
    rt * (p.maxFlareRadius / MAX_TRUE_RADIUS) * (1 + rng.nextGaussian() * p.sigmaFlare),
    0,
    1.5 * p.maxFlareRadius,
  );
  const reach = Math.ceil(rt + flare);
  const rootPhases = ROOT_FREQUENCIES.map(() => rng.nextFloat() * 2 * Math.PI);

  const logs = new VoxelSet();
  const leaves = new VoxelSet();
  // The first part of the tree to claim a block sets its grain direction (the trunk goes first).
  const axes = new Map<number, Axis>();
  const addLog = (x: number, y: number, z: number, axis: Axis) => {
    logs.add(x, y, z);
    const key = pack(x, y, z);
    if (!axes.has(key)) axes.set(key, axis);
  };

  // --- Trunk with root flare -------------------------------------------------------------------
  // The flare depends only on the angle around the trunk, so compute it once per column.
  const columns: { dx: number; dz: number; distance: number; rootRadius: number }[] = [];
  for (let dx = -reach; dx <= reach; dx++) {
    for (let dz = -reach; dz <= reach; dz++) {
      const theta = Math.atan2(dz, dx);
      let noise = 0;
      for (let m = 0; m < ROOT_FREQUENCIES.length; m++) {
        noise += ROOT_AMPLITUDES[m]! * Math.sin(ROOT_FREQUENCIES[m]! * (rootPhases[m]! - theta));
      }
      noise = clamp(noise, -p.rootNoiseCutoff, p.rootNoiseCutoff);
      const rootRadius = (1 - (noise + p.rootNoiseCutoff) / (2 * p.rootNoiseCutoff)) * p.rootNoiseAmount * flare;
      columns.push({ dx, dz, distance: Math.hypot(dx - axisX, dz - axisZ), rootRadius });
    }
  }

  let groundLayer: [dx: number, dz: number][] = [];
  for (let y = 0; y < height; y++) {
    const relative = y / height;
    const taper = Math.pow(1 - relative, p.taperExponent);
    const flareDecay = Math.exp(-relative / p.flareDecay);
    for (const column of columns) {
      const isCenter = column.dx === 0 && column.dz === 0;
      if (isCenter || column.distance < rt * taper + column.rootRadius * flareDecay) {
        addLog(column.dx, y, column.dz, "y");
        if (y === 0) groundLayer.push([column.dx, column.dz]);
      }
    }
  }

  // --- Root cone below ground --------------------------------------------------------------------
  // y = -1 repeats the ground layer; each layer below keeps only logs with all four neighbors,
  // so the base tapers to a point and the tree can sit on uneven ground.
  for (let y = -1; groundLayer.length > 0; y--) {
    if (y < -1) {
      const previous = new Set(groundLayer.map(([dx, dz]) => `${dx},${dz}`));
      groundLayer = groundLayer.filter(
        ([dx, dz]) =>
          previous.has(`${dx + 1},${dz}`) &&
          previous.has(`${dx - 1},${dz}`) &&
          previous.has(`${dx},${dz + 1}`) &&
          previous.has(`${dx},${dz - 1}`),
      );
    }
    for (const [dx, dz] of groundLayer) addLog(dx, y, dz, "y");
  }

  // --- Crown: branches and foliage ---------------------------------------------------------------
  // Branches are placed from the crown base upward. At each height the spacing is chosen so that
  // foliage covers a target share of the crown's shell. Clumps shrink toward the top, so reaching the
  // target takes ever more branches: they crowd together until the clumps merge into a solid mass.
  // There is no separate cap; the solid crown is simply where this process ends up.
  const leafCandidates = new VoxelSet();
  const startX = Math.round(axisX);
  const startZ = Math.round(axisZ);
  const crownBase = crownBaseY(height, rt, p);
  const crownTop = Math.max(crownBase, p.branchEnd * height);
  const trunkRadiusAt = (y: number) => rt * Math.pow(Math.max(0, 1 - y / height), p.taperExponent);
  const clumpWidthFor = (length: number) => clamp(p.clumpWidthFactor * length, p.clumpWidthMin, p.clumpWidthMax);
  // Expected number of sub-branches for a branch of this length (a real number; the actual count varies).
  const subBranchesExpected = (exposedLength: number) =>
    Math.max(0, p.subBranchRate * (exposedLength - p.subBranchStartLength));
  // Foliage-only branches (all of a small tree, and the top of every tree) have no wood to carry a clump
  // out past the crown's outline, so their clumps shrink to fit the reach and sit inside it. This is
  // what lets a cone come to a point instead of ending in a wide cap.
  // The floor of 1.3 is the smallest clump that still wraps around a one-block trunk; anything narrower
  // would cover only the trunk's own block and show no leaves at all.
  const twigWidthFor = (reach: number) => Math.max(1.3, Math.min(clumpWidthFor(reach), reach + 0.4));
  const clumpRise = (width: number) => Math.max(1.2, width * p.clumpHeightRatio);
  const clumpDrop = (width: number) => Math.max(1, 0.5 * width * p.clumpHeightRatio);

  // A foliage clump: an ellipsoid that is wide across the branch, domed on top and shallower below,
  // varied in size, nudged off-center, with a roughened surface.
  const addClump = (cx: number, cy: number, cz: number, width: number, cos: number, sin: number) => {
    const across = width * (1 + (rng.nextFloat() * 2 - 1) * p.clumpSizeJitter);
    const along = Math.max(1, across * p.clumpLengthRatio);
    // Half a block is added to the vertical radii so the top and bottom layers are discs, not points.
    const up = clumpRise(across) + 0.5;
    const down = clumpDrop(across) + 0.5;
    if (across >= 2.5) {
      cx += rng.nextInt(3) - 1;
      cz += rng.nextInt(3) - 1;
    }
    const nibble =
      p.clumpNibble *
      clamp((across - p.clumpNibbleStartWidth) / Math.max(1e-6, p.clumpNibbleFullWidth - p.clumpNibbleStartWidth), 0, 1);
    const span = Math.ceil(Math.max(across, along));
    for (let dy = -Math.floor(down); dy <= Math.floor(up); dy++) {
      const vertical = dy >= 0 ? dy / up : dy / down;
      for (let dx = -span; dx <= span; dx++) {
        for (let dz = -span; dz <= span; dz++) {
          const a = (dx * cos + dz * sin) / along;
          const c = (-dx * sin + dz * cos) / across;
          const distance = a * a + c * c + vertical * vertical;
          if (distance > 1) continue;
          if (distance > 0.55 && nibble > 0 && rng.nextFloat() < nibble) continue;
          leafCandidates.add(cx + dx, cy + dy, cz + dz);
        }
      }
    }
  };

  const addWood = (x: number, y: number, z: number, axis: Axis) => {
    if (y >= 0 && y < height) addLog(x, y, z, axis);
  };
  // Grain runs along whichever direction a stretch of branch mostly travels.
  const dominantAxis = (a: readonly number[], b: readonly number[]): Axis => {
    const dx = Math.abs(b[0]! - a[0]!), dy = Math.abs(b[1]! - a[1]!), dz = Math.abs(b[2]! - a[2]!);
    return dx >= dy && dx >= dz ? "x" : dz >= dy ? "z" : "y";
  };

  // Thickness. The connected block path (line6) is the skeleton and guarantees the branch is never
  // broken. On top of it, this adds every block whose center lies inside a tapering cone around the
  // branch's true, real-valued centerline. Because that centerline passes blocks at varying offsets,
  // the result changes gradually with the radius, instead of jumping between a few fixed shapes the
  // way a ball stamped around each path block would.
  const addCone = (centerline: [number, number, number][], emergeDistance: number, baseRadius: number) => {
    let total = 0;
    for (let i = 1; i < centerline.length; i++) total += distance3(centerline[i - 1]!, centerline[i]!);
    const exposed = Math.max(1e-6, total - emergeDistance);
    const radiusAt = (along: number) => {
      const t = Math.max(0, along - emergeDistance) / exposed;
      return t < p.limbTaperEnd ? lerp(baseRadius, 0.5, t / p.limbTaperEnd) : 0.5;
    };
    let before = 0;
    for (let i = 1; i < centerline.length; i++) {
      const a = centerline[i - 1]!;
      const b = centerline[i]!;
      const length = distance3(a, b);
      if (length > 0) {
        const lo = [0, 1, 2].map((k) => Math.floor(Math.min(a[k]!, b[k]!) - baseRadius));
        const hi = [0, 1, 2].map((k) => Math.ceil(Math.max(a[k]!, b[k]!) + baseRadius));
        for (let x = lo[0]!; x <= hi[0]!; x++) {
          for (let yy = Math.max(0, lo[1]!); yy <= Math.min(height - 1, hi[1]!); yy++) {
            for (let z = lo[2]!; z <= hi[2]!; z++) {
              const t = clamp(
                ((x - a[0]) * (b[0] - a[0]) + (yy - a[1]) * (b[1] - a[1]) + (z - a[2]) * (b[2] - a[2])) / (length * length),
                0,
                1,
              );
              const radius = radiusAt(before + t * length);
              if (radius <= 0.5) continue; // a single block: the skeleton already covers it
              const dx = x - (a[0] + t * (b[0] - a[0]));
              const dy = yy - (a[1] + t * (b[1] - a[1]));
              const dz = z - (a[2] + t * (b[2] - a[2]));
              if (dx * dx + dy * dy + dz * dz <= radius * radius) addLog(x, yy, z, dominantAxis(a, b));
            }
          }
        }
      }
      before += length;
    }
  };

  // Where trunk foliage begins: the first height in the crown at which the trunk is thin enough.
  let trunkFoliageStart = Infinity;
  for (let y = Math.ceil(crownBase); y < height; y++) {
    if (trunkRadiusAt(y) < p.trunkFoliageMaxTrunkRadius) {
      trunkFoliageStart = y;
      break;
    }
  }

  let branchIndex = 0;
  let lastWoodY = -Infinity;

  const placeBranch = (y: number, reach: number, u: number, exposedLength: number) => {
    const angle = branchIndex++ * GOLDEN_ANGLE + rng.nextFloat() * p.branchAngleJitter;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const baseY = Math.round(y);
    const isTwig = exposedLength < p.minBranchWood;
    const width = isTwig ? twigWidthFor(reach) : clumpWidthFor(reach);

    // Twigs: foliage only, kept inside the crown outline and close enough to the trunk to stay attached.
    if (isTwig && y >= trunkFoliageStart) return; // the trunk's own foliage covers this height
    if (isTwig || y - lastWoodY < p.woodSpacing) {
      const out = clamp(reach - 0.6 * width, 0, trunkRadiusAt(y) + 2);
      addClump(Math.round(axisX + out * cos), baseY, Math.round(axisZ + out * sin), width, cos, sin);
      return;
    }
    lastWoodY = y;

    // Centerline. Long branches leave the trunk level or drooping, then sweep upward at an elbow;
    // the elbow fades smoothly into a straight branch as branches get shorter.
    const elbow = clamp((exposedLength - 0.5 * p.elbowLength) / (0.5 * p.elbowLength), 0, 1);
    const innerSlope = lerp(p.branchRise, p.elbowDroop, elbow);
    const outerSlope = lerp(p.branchRise, p.elbowRise, elbow);
    const path: [number, number, number][] = [];
    const pathAxes: Axis[] = [];
    const extend = (x: number, yy: number, z: number) => {
      const from = path.length > 0 ? path[path.length - 1]! : ([startX, baseY, startZ] as [number, number, number]);
      const to = [Math.round(x), Math.round(yy), Math.round(z)] as const;
      const segment = line6(from[0], from[1], from[2], to[0], to[1], to[2]);
      const added = path.length > 0 ? segment.slice(1) : segment;
      path.push(...added);
      pathAxes.push(...added.map(() => dominantAxis(from, to)));
    };
    const elbowAt = 0.65 * reach;
    const elbowY = y + innerSlope * elbowAt;
    extend(axisX + elbowAt * cos, elbowY, axisZ + elbowAt * sin);
    extend(axisX + reach * cos, elbowY + outerSlope * (reach - elbowAt), axisZ + reach * sin);

    path.forEach(([x, yy, z], i) => addWood(x, yy, z, pathAxes[i]!));

    // Where the branch leaves the trunk's surface, as an index into the block path (for sub-branches)
    // and as a distance along the true centerline (for the cone).
    const last = Math.max(1, path.length - 1);
    const trunkRadius = trunkRadiusAt(y);
    let emerges = path.findIndex(([x, , z]) => Math.hypot(x - axisX, z - axisZ) > trunkRadius);
    if (emerges < 0) emerges = 0;
    const exposed = Math.max(1, last - emerges);

    // Thickness grows with the branch's length beyond a starting length and fades with height. At a
    // radius of 0.5 or less the branch is one block thick and the cone is skipped.
    const limbRadius =
      0.5 +
      p.limbThickness *
        Math.max(0, exposedLength - p.limbThickStartLength) *
        Math.max(0, 1 - u / Math.max(1e-6, p.limbThickUntil));
    if (limbRadius > 0.5) {
      const elbowPoint: [number, number, number] = [axisX + elbowAt * cos, elbowY, axisZ + elbowAt * sin];
      const tipPoint: [number, number, number] = [
        axisX + reach * cos,
        elbowY + outerSlope * (reach - elbowAt),
        axisZ + reach * sin,
      ];
      const innerLength = distance3([axisX, y, axisZ], elbowPoint);
      const emergeDistance = innerLength * Math.min(1, trunkRadius / Math.max(1e-6, elbowAt));
      addCone([[axisX, y, axisZ], elbowPoint, tipPoint], emergeDistance, limbRadius);
    }

    const tip = path[path.length - 1]!;
    addClump(tip[0], tip[1], tip[2], width, cos, sin);

    // Sub-branches: smaller branches leaving the main one along its length. Always a single connected
    // line of blocks, never thickened. Their number, side, position, angle, and slope all vary.
    // The variation is proportional, so short branches that expect none still get none.
    const count = Math.round(
      subBranchesExpected(exposedLength) * (1 + (rng.nextFloat() * 2 - 1) * p.subBranchCountJitter),
    );
    let side = rng.nextFloat() < 0.5 ? -1 : 1;
    for (let j = 0; j < count; j++) {
      const along = 0.2 + (0.5 * (j + rng.nextFloat())) / count; // never right at the tip, where it would merge with the tip clump
      const from = path[Math.min(last, emerges + Math.floor(along * exposed))]!;
      const degrees = p.subBranchAngle + (rng.nextFloat() * 2 - 1) * p.subBranchAngleJitter;
      const subAngle = angle + side * ((clamp(degrees, 5, 130) * Math.PI) / 180);
      if (rng.nextFloat() < 0.85) side = -side; // laterals mostly alternate sides, as on a real spray
      const subSlope = 0.3 * rng.nextFloat(); // laterals lie fairly flat
      const subLength = Math.max(2, p.subBranchLength * (1 - along) * exposedLength);
      const subCos = Math.cos(subAngle);
      const subSin = Math.sin(subAngle);
      const end: [number, number, number] = [
        Math.round(from[0] + subLength * subCos),
        Math.round(from[1] + subSlope * subLength),
        Math.round(from[2] + subLength * subSin),
      ];
      const subAxis = dominantAxis(from, end);
      for (const [x, yy, z] of line6(from[0], from[1], from[2], end[0], end[1], end[2])) addWood(x, yy, z, subAxis);
      addClump(end[0], end[1], end[2], Math.max(p.clumpWidthMin, p.subBranchClump * width), subCos, subSin);
    }
  };

  const STEP = 0.25;
  const coverageBottom = lerp(p.coverageBottomYoung, p.coverageBottomOld, sizeFraction(rt));
  let owed = 0.5 + 0.5 * rng.nextFloat(); // so the first branch sits near the crown base
  for (let y = crownBase; y <= crownTop; y += STEP) {
    const reach = crownRadiusAt(y, height, rt, p);
    const u = crownTop > crownBase ? (y - crownBase) / (crownTop - crownBase) : 1;
    const exposedLength = Math.max(0, reach - trunkRadiusAt(y));

    const width = exposedLength < p.minBranchWood ? twigWidthFor(reach) : clumpWidthFor(reach);
    const clumpsPerBranch =
      exposedLength >= p.minBranchWood ? 1 + 0.8 * subBranchesExpected(exposedLength) : 1;
    // Narrow clumps are effectively thinner than their nominal height: their top and bottom layers
    // shrink to the trunk's own block and show no leaves.
    const layerThickness = (clumpRise(width) + clumpDrop(width) + 1) * clamp((width - 0.8) / 1.2, 0.3, 1);
    const shareOfRing = Math.min(1, (clumpsPerBranch * width) / (Math.PI * Math.max(reach, 0.5)));
    const target = lerp(coverageBottom, p.coverageTop, Math.pow(u, p.coverageCurve));

    owed += (target / (layerThickness * shareOfRing)) * STEP;
    for (let burst = 0; owed >= 1 && burst < 3; burst++) {
      owed -= 1;
      placeBranch(y, reach, u, exposedLength);
    }
  }

  // Trunk foliage: a sleeve of leaves around the thin part of the trunk, following the crown outline.
  // It always wraps the actual trunk blocks (which sit slightly off the trunk's sub-block axis), so the
  // pole never shows through on one side, and roughening never removes the blocks against the trunk.
  for (let y = trunkFoliageStart; y < height; y++) {
    const sleeve = Math.max(1, crownRadiusAt(y, height, rt, p) * p.trunkFoliageFill + 0.6);
    const span = Math.ceil(sleeve) + 1;
    for (let dx = -span; dx <= span; dx++) {
      for (let dz = -span; dz <= span; dz++) {
        const againstTrunk =
          Math.abs(dx) + Math.abs(dz) <= 3 &&
          (logs.has(dx + 1, y, dz) || logs.has(dx - 1, y, dz) || logs.has(dx, y, dz + 1) || logs.has(dx, y, dz - 1));
        const distance = Math.hypot(dx - axisX, dz - axisZ);
        if (!againstTrunk) {
          if (distance > sleeve) continue;
          if (distance > sleeve - 0.8 && rng.nextFloat() < p.trunkFoliageRoughness) continue;
        }
        leafCandidates.add(dx, y, dz);
      }
    }
  }

  // The tip. Young trees end in a vertical spike of leaves (the leader); with age the top rounds off
  // into a cap instead.
  const age = sizeFraction(rt);
  addClump(startX, height - 1, startZ, lerp(1.3, p.clumpWidthMin + 0.5, age), 1, 0);
  const spike = Math.round(lerp(2, 0, age));
  for (let i = 0; i <= spike; i++) leafCandidates.add(startX, height + i, startZ);

  // Keep only leaves that are attached: reachable from wood by stepping through shared block faces,
  // leaf to leaf, within leafReach steps. Roughened clump edges can leave blocks hanging on by an edge
  // or a corner, or floating; those are trimmed here. This is also exactly how vanilla decides whether
  // leaves decay, so a decay rule of either kind (path or straight distance) will never shed these trees.
  const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
  const leafReach = Math.round(p.leafReach);
  let frontier: [number, number, number][] = [];
  for (const [x, y, z] of leafCandidates) {
    if (logs.has(x, y, z)) continue;
    if (FACES.some(([dx, dy, dz]) => logs.has(x + dx, y + dy, z + dz))) {
      leaves.add(x, y, z);
      frontier.push([x, y, z]);
    }
  }
  for (let step = 2; step <= leafReach && frontier.length > 0; step++) {
    const next: [number, number, number][] = [];
    for (const [x, y, z] of frontier) {
      for (const [dx, dy, dz] of FACES) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (leafCandidates.has(nx, ny, nz) && !leaves.has(nx, ny, nz) && !logs.has(nx, ny, nz)) {
          leaves.add(nx, ny, nz);
          next.push([nx, ny, nz]);
        }
      }
    }
    frontier = next;
  }

  // --- Bounds ----------------------------------------------------------------------------------------
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const set of [logs, leaves]) {
    for (const position of set) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis]!, position[axis]!);
        max[axis] = Math.max(max[axis]!, position[axis]!);
      }
    }
  }

  // Bark caps: a log shows its rings on the two faces at the ends of its axis. Wherever the neighbor
  // there is not wood, that face would be visible (leaves count: they are see-through).
  const STEP_ALONG: Record<Axis, [number, number, number]> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const axisOf = (x: number, y: number, z: number): Axis => axes.get(pack(x, y, z)) ?? "y";
  const barkCapped = new VoxelSet();
  for (const [x, y, z] of logs) {
    const [dx, dy, dz] = STEP_ALONG[axisOf(x, y, z)];
    if (!logs.has(x + dx, y + dy, z + dz) || !logs.has(x - dx, y - dy, z - dz)) barkCapped.add(x, y, z);
  }

  return { trueRadius: rt, height, logs, leaves, min, max, axisOf, barkCapped };
}

/**
 * 6-connected 3D line: every step moves along exactly one axis, so consecutive blocks always share
 * a face and branches never have diagonal gaps.
 */
export function line6(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): [number, number, number][] {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const dz = Math.abs(z1 - z0);
  const sx = x1 >= x0 ? 1 : -1;
  const sy = y1 >= y0 ? 1 : -1;
  const sz = z1 >= z0 ? 1 : -1;

  const points: [number, number, number][] = [[x0, y0, z0]];
  let x = x0, y = y0, z = z0;
  let rx = 0, ry = 0, rz = 0;
  for (let step = 0; step < dx + dy + dz; step++) {
    const tx = dx > 0 ? (rx + 0.5) / dx : 1e9;
    const ty = dy > 0 ? (ry + 0.5) / dy : 1e9;
    const tz = dz > 0 ? (rz + 0.5) / dz : 1e9;
    if (tx <= ty && tx <= tz) {
      x += sx;
      rx += 1;
    } else if (ty <= tx && ty <= tz) {
      y += sy;
      ry += 1;
    } else {
      z += sz;
      rz += 1;
    }
    points.push([x, y, z]);
  }
  return points;
}
