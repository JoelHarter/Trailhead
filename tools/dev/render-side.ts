// Dev aid: renders side views of generated trees to a PNG (no dependencies), so tree shapes can be
// checked without a browser.   node tools/dev/render-side.ts out.png [seed] [key=value ...]
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { Rng } from "../../src/core/rng.ts";
import { generateSequoia } from "../../src/core/trees/sequoia.ts";

const [out = "side.png", seedText = "2", ...overrides] = process.argv.slice(2);
const params = Object.fromEntries(overrides.map((pair) => pair.split("=")).map(([k, v]) => [k, Number(v)]));
// "small=1" renders only young trees, larger, to check their shape.
const radii = params.small ? [0.5, 0.75, 1, 1.25, 1.5, 2] : [0.5, 1, 1.5, 2.5, 3.2, 3.85];
const trees = radii.map((trueRadius) => generateSequoia({ trueRadius, rng: new Rng(Number(seedText)), params }));

// "top=1" renders a top-down view of the largest tree's lower crown instead (shows limb structure).
if (params.top) {
  const tree = trees[trees.length - 1]!;
  const yLow = 0.45 * tree.height - 9, yHigh = 0.45 * tree.height + (params.slab ?? 5);
  const S = 9, size = Math.max(tree.max[0] - tree.min[0], tree.max[2] - tree.min[2]) + 5;
  const Wt = size * S, px = new Uint8Array(Wt * Wt * 3).fill(235);
  const best = new Map<string, { y: number; leaf: boolean }>();
  const consider = (x: number, y: number, z: number, leaf: boolean) => {
    if (y < yLow || y > yHigh) return;
    const key = `${x},${z}`; const seen = best.get(key);
    // Wood wins over leaves so the limb skeleton stays visible.
    if (!seen || (seen.leaf && !leaf) || (seen.leaf === leaf && y > seen.y)) best.set(key, { y, leaf });
  };
  for (const [x, y, z] of tree.leaves) consider(x, y, z, true);
  for (const [x, y, z] of tree.logs) consider(x, y, z, false);
  for (const [key, { y, leaf }] of best) {
    const [x, z] = key.split(",").map(Number) as [number, number];
    const shade = 0.6 + 0.4 * ((y - yLow) / (yHigh - yLow));
    const color = leaf ? [150, 205, 140] : [122, 58, 28];
    for (let dy = 0; dy < S - 1; dy++) for (let dx = 0; dx < S - 1; dx++) {
      const i = (((z - tree.min[2] + 2) * S + dy) * Wt + (x - tree.min[0] + 2) * S + dx) * 3;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(color[c]! * (leaf ? 1 : shade));
    }
  }
  writePng(out, Wt, Wt, px);
  console.log(`top view of r=${tree.trueRadius}, y ${yLow.toFixed(0)}..${yHigh.toFixed(0)}: wrote ${out}`);
  process.exit(0);
}

const SCALE = params.small ? 6 : 3, GAP = 6;
const widths = trees.map((t) => t.max[0] - t.min[0] + 1);
const top = Math.max(...trees.map((t) => t.max[1])), bottom = Math.min(...trees.map((t) => t.min[1]));
const W = (widths.reduce((a, b) => a + b, 0) + GAP * (trees.length + 1)) * SCALE, H = (top - bottom + 1 + 4) * SCALE;
const pixels = new Uint8Array(W * H * 3).fill(0);
for (let i = 0; i < W * H; i++) { pixels[i * 3] = 159; pixels[i * 3 + 1] = 196; pixels[i * 3 + 2] = 232; }
const groundRow = (top + 2) * SCALE;
for (let y = groundRow; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; pixels[i] = 110; pixels[i + 1] = 92; pixels[i + 2] = 60; }

let offset = GAP;
trees.forEach((tree, index) => {
  // Project along z: nearest block (largest z) wins; shade by depth.
  const depth = new Map<string, { z: number; leaf: boolean }>();
  const put = (x: number, y: number, z: number, leaf: boolean) => {
    const key = `${x},${y}`; const seen = depth.get(key);
    if (!seen || z > seen.z) depth.set(key, { z, leaf });
  };
  for (const [x, y, z] of tree.logs) put(x, y, z, false);
  for (const [x, y, z] of tree.leaves) put(x, y, z, true);
  const zMin = tree.min[2], zSpan = Math.max(1, tree.max[2] - tree.min[2]);
  for (const [key, { z, leaf }] of depth) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    const shade = 0.55 + 0.45 * ((z - zMin) / zSpan);
    const color = leaf ? [47, 125, 42] : [122, 58, 28];
    const px = (offset + x - tree.min[0]) * SCALE, py = (top + 2 - 1 - y) * SCALE;
    for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) {
      const i = ((py + dy) * W + px + dx) * 3;
      if (i >= 0 && i + 2 < pixels.length) for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(color[c]! * shade * (y < 0 ? 0.6 : 1));
    }
  }
  offset += widths[index]! + GAP;
  console.log(`r=${tree.trueRadius} H=${tree.height} logs=${tree.logs.size} leaves=${tree.leaves.size} footprint=${widths[index]}x${tree.max[2] - tree.min[2] + 1}`);
});

writePng(out, W, H, pixels);
console.log(`wrote ${out} (${W}x${H})`);

function writePng(file: string, width: number, heightPx: number, rgb: Uint8Array) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (data: Uint8Array) => { let c = 0xffffffff; for (const b of data) c = crcTable[(c ^ b) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Uint8Array) => {
    const body = new Uint8Array(4 + data.length); body.set(new TextEncoder().encode(type)); body.set(data, 4);
    const outChunk = new Uint8Array(12 + data.length); const view = new DataView(outChunk.buffer);
    view.setUint32(0, data.length); outChunk.set(body, 4); view.setUint32(8 + data.length, crc(body)); return outChunk;
  };
  const raw = new Uint8Array((width * 3 + 1) * heightPx);
  for (let y = 0; y < heightPx; y++) raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  const header = new Uint8Array(13); const hv = new DataView(header.buffer); hv.setUint32(0, width); hv.setUint32(4, heightPx); header[8] = 8; header[9] = 2;
  writeFileSync(file, Buffer.concat([Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array(0))]));
}
