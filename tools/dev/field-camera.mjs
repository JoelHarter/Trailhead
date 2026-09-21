// Field camera: shows what a Molang expression evaluates to during world generation.
// It paints each test expression as a plane of 16 wool colors high in the air (one color per value
// band), has a script read the blocks back, and saves the result for analysis.
//
//   node tools/dev/field-camera.mjs <spec.json> <outDir>
//
// spec.json: { "planes": [ { "name": "A", "expr": "q.noise(X/16, Z/16)", "lo": -1, "hi": 1 }, ... ] }
//   X and Z stand for the world x and z of the column; lo..hi is the range spread across the 16 bands.
// This resets the dev world (twice over: before, with the camera rules; and you should reset after).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUILD, ROOT, config, docker } from "../lib.mjs";

const [specPath, outDir = "field-camera-out"] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const ns = config.namespace;
const WOOL = ["white", "light_gray", "gray", "black", "brown", "red", "orange", "yellow", "lime", "green", "cyan", "light_blue", "blue", "purple", "magenta", "pink"];
const BASE_Y = 240;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = (args) => execFileSync("node", args, { cwd: ROOT, stdio: "inherit" });

run(["tools/build.mjs"]);
const features = join(BUILD, "BP", "features");
const rules = join(BUILD, "BP", "feature_rules");
const write = (dir, name, body) => writeFileSync(join(dir, `${name}.json`), JSON.stringify(body, null, 1));
const F = "1.13.0";

WOOL.forEach((color, k) =>
  write(features, `fieldcam_block_${k}`, { format_version: F, "minecraft:single_block_feature": {
    description: { identifier: `${ns}:fieldcam_block_${k}` }, places_block: `minecraft:${color}_wool`,
    enforce_placement_rules: false, enforce_survivability_rules: false, may_replace: ["minecraft:air"] } }));

spec.planes.forEach((plane, p) => {
  const value = plane.expr.replaceAll("X", "v.originx").replaceAll("Z", "v.originz");
  const band = `math.clamp(math.floor(((${value}) - (${plane.lo})) / (${plane.hi - plane.lo}) * 16), 0, 15)`;
  WOOL.forEach((_, k) =>
    write(features, `fieldcam_${p}_${k}`, { format_version: F, "minecraft:scatter_feature": {
      description: { identifier: `${ns}:fieldcam_${p}_${k}` }, places_feature: `${ns}:fieldcam_block_${k}`,
      iterations: `(${band} == ${k}) ? 1 : 0`, coordinate_eval_order: "xzy", x: 0, z: 0, y: 0 } }));
  write(features, `fieldcam_${p}`, { format_version: F, "minecraft:aggregate_feature": {
    description: { identifier: `${ns}:fieldcam_${p}` }, early_out: "none",
    features: WOOL.map((_, k) => `${ns}:fieldcam_${p}_${k}`) } });
  // One rule per x column; each walks z with a fixed grid. (Two fixed grids in one rule might only walk the diagonal.)
  for (let x = 0; x < 16; x++) {
    write(rules, `fieldcam_${p}_x${x}`, { format_version: F, "minecraft:feature_rules": {
      description: { identifier: `${ns}:fieldcam_${p}_x${x}`, places_feature: `${ns}:fieldcam_${p}` },
      conditions: { placement_pass: "final_pass", "minecraft:biome_filter": [{ test: "has_biome_tag", operator: "==", value: "overworld" }] },
      distribution: { iterations: 16, coordinate_eval_order: "xzy", x, y: BASE_Y + 2 * p,
        z: { distribution: "fixed_grid", extent: [0, 15], step_size: 1, grid_offset: 0 } } } });
  }
});

run(["tools/server.mjs", "reset-world"]);
run(["tools/deploy.mjs"]);
run(["tools/server.mjs", "start"]);
console.log("Waiting for the server to boot ...");
await sleep(50000);
const errors = docker(["logs", "--since", "70s", config.containerName]).split("\n").filter((l) => /ERROR/.test(l) && /fieldcam|Molang|molang|Feature/.test(l));
if (errors.length) console.log("Content errors:\n" + errors.slice(0, 8).join("\n"));

// Only read log lines written from now on: the container's log still holds earlier captures.
const since = new Date().toISOString();
docker(["exec", config.containerName, "send-command", `scriptevent ${ns}:field_camera ${spec.planes.length} ${BASE_Y}`]);
console.log("Camera running ...");
let log = "";
for (let i = 0; i < 40; i++) {
  await sleep(10000);
  log = docker(["logs", "--since", since, config.containerName], { maxBuffer: 1 << 28 });
  if (log.includes("[field] done")) break;
}
mkdirSync(outDir, { recursive: true });
const rows = log.split("\n").map((l) => l.match(/\[field\] (\d+) (-?\d+) (-?\d+) (\S+)/)).filter(Boolean)
  .map((m) => ({ plane: Number(m[1]), z: Number(m[2]), x0: Number(m[3]), row: m[4] }));
const seedLine = log.split("\n").find((l) => l.includes("[field] seed"));
writeFileSync(join(outDir, "capture.json"), JSON.stringify({ spec, seed: seedLine?.split("seed ")[1] ?? null, rows }));
console.log(`Captured ${rows.length} rows -> ${join(outDir, "capture.json")}${log.includes("[field] done") ? "" : "  (INCOMPLETE)"}`);
