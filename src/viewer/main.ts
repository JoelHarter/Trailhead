// Browser viewer for the tree generator. Runs the same core code the game and the baker use.
// Built and opened by "npm run view".
// @ts-nocheck  (three.js is loaded from a CDN at runtime, so there are no local types for it)
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DEFAULT_AGE_PARAMS, ageAt, growProbability, trueRadiusAt } from "../core/fields/age.ts";
import { Rng, seedFromPosition } from "../core/rng.ts";
import { DEFAULT_SEQUOIA_PARAMS, generateSequoia, maxCrownRadius } from "../core/trees/sequoia.ts";

const $ = (id: string) => document.getElementById(id)!;

// ---------------------------------------------------------------------------------------------
// Slider definitions: [key, label, min, max, step, hint]
// ---------------------------------------------------------------------------------------------
const TREE_GROUPS = [
  ["Height", [
    ["heightPerRadius", "Height per radius", 10, 40, 0.5, "height = this × trunk radius"],
    ["stallHeight", "Stall height", 40, 140, 1, "growth levels off here"],
    ["maxHeight", "Height cap", 40, 160, 1, "absolute maximum (Hyperion: 116)"],
    ["sigmaHeight", "Height randomness", 0, 0.4, 0.01, "varies with the seed"],
  ]],
  ["Trunk and roots", [
    ["taperExponent", "Taper", 0.05, 1, 0.01, "low = column, 1 = cone"],
    ["maxFlareRadius", "Root flare size", 0, 8, 0.1, "extra base radius on the biggest tree"],
    ["flareDecay", "Flare height", 0.02, 0.6, 0.01, "how far up the trunk the flare reaches"],
    ["rootNoiseAmount", "Buttress depth", 0, 1, 0.01, "0 = smooth skirt, 1 = deep grooves"],
    ["rootNoiseCutoff", "Buttress clamp", 0.2, 2.2, 0.05, ""],
    ["sigmaFlare", "Flare randomness", 0, 0.4, 0.01, "try seed 5; seed 1 happens to roll almost zero"],
  ]],
  ["Crown shape", [
    ["canopyFactor", "Crown width", 0.08, 0.35, 0.002, "overall reach of the branches"],
    ["crownWidthYoung", "Young crown width", 0.3, 1.2, 0.01, "× crown width for the smallest trees; low = lean"],
    ["branchStartYoung", "Crown starts at (young)", 0.05, 0.8, 0.01, "fraction of height, smallest trees"],
    ["branchStartOld", "Crown starts at (old)", 0.05, 0.8, 0.01, "fraction of height, largest trees"],
    ["branchEnd", "Last branch at", 0.6, 1, 0.01, "fraction of height"],
    ["crownShapeYoung", "Profile (young)", 0.3, 1.5, 0.01, "1 = straight spire, 0.5 = rounded dome"],
    ["crownShapeOld", "Profile (old)", 0.3, 1.5, 0.01, "redwood ≈ 0.8, giant sequoia ≈ 0.5"],
    ["crownBaseTuck", "Underside tuck", 0, 0.8, 0.01, "pulls in the lowest branches; 0 = flat bottom"],
  ]],
  ["Branch placement", [
    ["coverageBottomYoung", "Fullness at crown base (young)", 0.1, 1.5, 0.01, "share of the crown's shell that is leafy"],
    ["coverageBottomOld", "Fullness at crown base (old)", 0.1, 1.5, 0.01, "low = open, see-through lower crown"],
    ["coverageTop", "Fullness at top", 0.5, 2.5, 0.01, "above 1, clumps merge into a solid mass"],
    ["coverageCurve", "Fill-in curve", 0.3, 4, 0.05, "higher = stays open longer, then fills fast"],
    ["branchRise", "Small-branch slope", -0.3, 0.6, 0.01, ""],
    ["branchAngleJitter", "Angle randomness", 0, 1.5, 0.05, "wobble on the golden-angle spacing"],
    ["minBranchWood", "Wood starts at branch length", 0.5, 6, 0.1, "shorter branches are foliage only (keeps small trees twig-free)"],
    ["woodSpacing", "Min gap between wooden branches", 0, 4, 0.05, "raise if upper branches fuse into solid wood"],
  ]],
  ["Branch shape (elbow)", [
    ["elbowLength", "Full elbow at length", 2, 16, 0.5, "branches this long droop then sweep up; half this = straight"],
    ["elbowDroop", "Inner slope", -0.5, 0.5, 0.01, "negative = droops before the elbow"],
    ["elbowRise", "Outer slope", 0, 2, 0.05, "upward sweep after the elbow"],
  ]],
  ["Branch thickness", [
    ["limbThickStartLength", "Start at branch length", 0, 12, 0.1, "shorter branches are one block thick"],
    ["limbThickness", "Radius per extra block", 0, 1.5, 0.01, "0 = every branch one block thick; 0.5 radius = one block"],
    ["limbThickUntil", "Fades out by", 0.05, 1, 0.01, "fraction of the way up the crown where thickness reaches nothing"],
    ["limbTaperEnd", "Cone length", 0.1, 1, 0.01, "fraction of the branch over which it tapers to one block"],
  ]],
  ["Sub-branches", [
    ["subBranchStartLength", "Start at branch length", 0, 12, 0.1, "shorter branches have none"],
    ["subBranchRate", "More per extra block", 0, 2, 0.05, "0 = no sub-branches anywhere"],
    ["subBranchCountJitter", "Count randomness", 0, 1, 0.05, "0.5 = from half to one and a half times as many"],
    ["subBranchLength", "Sub-branch length", 0.1, 1.2, 0.01, "× what remains of the main branch; above ~0.7 it starts to look forked"],
    ["subBranchClump", "Sub-branch clump size", 0.3, 1, 0.01, "× the clump at the main tip"],
    ["subBranchAngle", "Sub-branch angle", 10, 110, 1, "degrees away from the branch; 90 = straight out sideways"],
    ["subBranchAngleJitter", "Angle randomness", 0, 60, 1, "± degrees, chosen separately for each sub-branch"],
  ]],
  ["Trunk foliage", [
    ["trunkFoliageMaxTrunkRadius", "Grows where trunk is thinner than", 0, 3, 0.05, "small trees: whole crown; giants: just the tip; 0 = off"],
    ["trunkFoliageFill", "Reach", 0, 1.5, 0.01, "× the crown outline at that height"],
    ["trunkFoliageRoughness", "Rough edges", 0, 0.8, 0.01, "chance a surface block is left out"],
  ]],
  ["Foliage clumps", [
    ["clumpWidthFactor", "Clump size", 0.1, 0.8, 0.01, "half-width = this × branch length"],
    ["clumpWidthMin", "Smallest clump", 1, 4, 0.1, ""],
    ["clumpWidthMax", "Largest clump", 2, 8, 0.1, ""],
    ["clumpLengthRatio", "Length ÷ width", 0.3, 1.5, 0.01, "1 = round from above"],
    ["clumpHeightRatio", "Height ÷ width", 0.2, 1.2, 0.01, "low = flat sprays, high = balls"],
    ["clumpSizeJitter", "Size randomness", 0, 0.6, 0.01, ""],
    ["clumpNibble", "Rough edges", 0, 0.9, 0.01, "chance a surface block is left out, for big clumps"],
    ["clumpNibbleStartWidth", "Roughness starts at clump size", 0.5, 5, 0.1, "smaller clumps stay smooth (they are nearly all surface)"],
    ["clumpNibbleFullWidth", "Full roughness at clump size", 1, 6, 0.1, ""],
    ["leafReach", "Leaf reach from wood", 2, 8, 1, "steps through connected leaves; vanilla uses 6"],
  ]],
];
const FOREST_GROUP = ["Forest age map", [
  ["groveSpacing", "Grove scale", 40, 600, 5, "blocks between neighboring hills of age: the size of a grove of similar age"],
  ["groveWeight", "Grove strength", 0, 1, 0.01, ""],
  ["detailSpacing", "Detail scale", 15, 250, 1, "medium features inside a grove"],
  ["detailWeight", "Detail strength", 0, 1, 0.01, ""],
  ["treeSpacing", "Tree-to-tree scale", 4, 60, 1, "fine variation, so neighbors differ in size"],
  ["treeWeight", "Tree-to-tree strength", 0, 1, 0.01, ""],
  ["contrast", "Contrast", 0, 12, 0.1, "0 = gentle gradients, high = distinct young and ancient areas"],
  ["kDensity", "Density", 0.01, 0.5, 0.005, "chance per attempt = this ÷ radius^1.5"],
  ["offsetX", "World offset x", -20000, 20000, 100, "each world shows a different part of the same endless map"],
  ["offsetZ", "World offset z", -20000, 20000, 100, ""],
]];

const treeParams = { ...DEFAULT_SEQUOIA_PARAMS };
const ageParams = { ...DEFAULT_AGE_PARAMS };
const STORAGE_KEY = "trailhead-viewer-params-v7"; // bump when parameters change meaning

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  for (const [target, values] of [[treeParams, saved.tree], [ageParams, saved.age]]) {
    for (const key of Object.keys(values ?? {})) if (key in target) target[key] = values[key];
  }
} catch {}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tree: treeParams, age: ageParams }));
  } catch {}
}

const format = (value: number, step: number) => (step >= 1 ? String(value) : value.toFixed(step < 0.01 ? 3 : 2));
const sliderRefreshers: (() => void)[] = [];

function buildGroup(container: HTMLElement, [title, specs], target, defaults, onChange: () => void, open: boolean) {
  const details = document.createElement("details");
  details.open = open;
  const summary = document.createElement("summary");
  details.appendChild(summary);
  const refreshSummary = () => {
    const changed = specs.filter(([key]) => target[key] !== defaults[key]).length;
    summary.textContent = changed ? `${title} · ${changed} changed` : title;
  };

  for (const [key, label, min, max, step, hint] of specs) {
    const row = document.createElement("div");
    row.className = "param";
    row.innerHTML =
      `<div class="paramHead"><span class="paramLabel">${label}</span>` +
      `<span><span class="paramValue"></span> <button class="reset" title="Reset this slider to the value in the code">↺ reset</button></span></div>` +
      `<input type="range" min="${min}" max="${max}" step="${step}">` +
      (hint ? `<div class="hint">${hint}</div>` : "");
    const input = row.querySelector("input") as HTMLInputElement;
    const valueText = row.querySelector(".paramValue")!;
    const reset = row.querySelector(".reset") as HTMLButtonElement;
    const refresh = () => {
      input.value = String(target[key]);
      const changed = target[key] !== defaults[key];
      valueText.textContent = format(target[key], step) + (changed ? `  (was ${format(defaults[key], step)})` : "");
      row.classList.toggle("changed", changed);
      reset.disabled = !changed;
      refreshSummary();
    };
    input.addEventListener("input", () => {
      target[key] = Number(input.value);
      refresh();
      save();
      onChange();
    });
    reset.addEventListener("click", () => {
      target[key] = defaults[key];
      refresh();
      save();
      onChange();
    });
    sliderRefreshers.push(refresh);
    refresh();
    details.appendChild(row);
  }
  container.appendChild(details);
}

// ---------------------------------------------------------------------------------------------
// 3D tree
// ---------------------------------------------------------------------------------------------
const radiusInput = $("radius") as HTMLInputElement;
const seedInput = $("seed") as HTMLInputElement;
const leavesInput = $("leaves") as HTMLInputElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc4e8);
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
$("view").appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x556644, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(60, 120, 40);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.BoxGeometry(80, 1, 80),
  new THREE.MeshLambertMaterial({ color: 0x5b4a2f, transparent: true, opacity: 0.55 }),
);
ground.position.set(0, -0.5, 0); // top surface at y = 0, so roots show beneath it
scene.add(ground);

// A player for scale.
const player = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), new THREE.MeshLambertMaterial({ color: 0x2277dd }));
player.position.set(10, 0.9, 0);
scene.add(player);

const box = new THREE.BoxGeometry(1, 1, 1);
const logMaterial = new THREE.MeshLambertMaterial({ color: 0x7a3a1c });
const leafMaterial = new THREE.MeshLambertMaterial({ color: 0x2f6b2a });
let meshes = [];

function instanced(positions: number[][], material) {
  const mesh = new THREE.InstancedMesh(box, material, positions.length);
  const matrix = new THREE.Matrix4();
  positions.forEach(([x, y, z], i) => {
    matrix.setPosition(x + 0.5, y + 0.5, z + 0.5);
    mesh.setMatrixAt(i, matrix);
  });
  return mesh;
}

let framedHeight = 0;
function regenerateTree() {
  const trueRadius = Number(radiusInput.value);
  const seed = Number(seedInput.value);
  const started = performance.now();
  const tree = generateSequoia({ trueRadius, rng: new Rng(seed), params: treeParams });
  const elapsed = performance.now() - started;

  for (const mesh of meshes) {
    scene.remove(mesh);
    mesh.dispose();
  }
  meshes = [instanced(tree.logs.toArray(), logMaterial)];
  if (leavesInput.checked) meshes.push(instanced(tree.leaves.toArray(), leafMaterial));
  for (const mesh of meshes) scene.add(mesh);

  const width = tree.max[0] - tree.min[0] + 1;
  const depth = tree.max[2] - tree.min[2] + 1;
  const tooWide = Math.max(width, depth) > 48;
  $("radiusValue").textContent = trueRadius.toFixed(2);
  $("seedValue").textContent = String(seed);
  $("stats").innerHTML =
    `height <b>${tree.height}</b> blocks · roots to y=${tree.min[1]}<br>` +
    `footprint <b class="${tooWide ? "bad" : ""}">${width} × ${depth}</b> (Bedrock limit 48 × 48)` +
    (tooWide ? `<br><b class="bad">Too wide: the game could not place this tree.</b>` : "") +
    `<br>${tree.logs.size.toLocaleString()} logs · ${tree.leaves.size.toLocaleString()} leaves<br>` +
    `chance per attempt ${(growProbability(trueRadius, ageParams.kDensity) * 100).toFixed(1)}% · ${elapsed.toFixed(0)} ms`;

  if (Math.abs(tree.height - framedHeight) > 0.25 * Math.max(framedHeight, 1)) {
    framedHeight = tree.height;
    controls.target.set(0, tree.height * 0.5, 0);
    camera.position.set(tree.height * 0.9, tree.height * 0.6, tree.height * 0.9);
  }
}

// ---------------------------------------------------------------------------------------------
// Age map (2 km across) and forest sample (384 blocks across, 1 pixel = 1 block)
// ---------------------------------------------------------------------------------------------
const MAP_BLOCKS_PER_PIXEL = 4;
const SIZE_CLASSES = 10; // contour lines are drawn where the tree size class changes
const SAMPLE_SIZE = 384;
const ATTEMPTS_PER_CHUNK = 32; // matches the Java mod's placed feature
let sampleCenter = [0, 0];

function drawAgeMap() {
  const canvas = $("ageMap") as HTMLCanvasElement;
  const context = canvas.getContext("2d")!;
  const size = canvas.width;
  const image = context.createImageData(size, size);
  // Heat map colors, young to ancient: blue, teal, green, yellow, red.
  const STOPS = [[0, 30, 40, 120], [0.33, 40, 150, 160], [0.55, 90, 180, 70], [0.78, 235, 200, 60], [1, 200, 50, 40]];
  const ages = new Float32Array(size * size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      ages[py * size + px] = ageAt((px - size / 2) * MAP_BLOCKS_PER_PIXEL, (py - size / 2) * MAP_BLOCKS_PER_PIXEL, ageParams);
    }
  }
  const band = (age) => Math.min(SIZE_CLASSES - 1, Math.floor(age * SIZE_CLASSES));
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const age = ages[py * size + px];
      let k = 1;
      while (k < STOPS.length - 1 && age > STOPS[k][0]) k++;
      const [a0, ...c0] = STOPS[k - 1];
      const [a1, ...c1] = STOPS[k];
      const f = (age - a0) / (a1 - a0);
      // Contour line wherever the size class changes toward the right or downward, as on a topographic map.
      const right = px + 1 < size ? ages[py * size + px + 1] : age;
      const below = py + 1 < size ? ages[(py + 1) * size + px] : age;
      const shade = band(right) !== band(age) || band(below) !== band(age) ? 0.62 : 1;
      const i = (py * size + px) * 4;
      for (let c = 0; c < 3; c++) image.data[i + c] = (c0[c] + f * (c1[c] - c0[c])) * shade;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  // Outline of the forest sample area.
  const half = SAMPLE_SIZE / 2 / MAP_BLOCKS_PER_PIXEL;
  context.strokeStyle = "#fff";
  context.lineWidth = 1.5;
  context.strokeRect(
    sampleCenter[0] / MAP_BLOCKS_PER_PIXEL + size / 2 - half,
    sampleCenter[1] / MAP_BLOCKS_PER_PIXEL + size / 2 - half,
    2 * half,
    2 * half,
  );
  $("ageMapCaption").textContent =
    `${size * MAP_BLOCKS_PER_PIXEL} blocks across. Blue = young, red = ancient; a contour line wherever the tree size class changes. Click to move the forest sample.`;
}

function drawForestSample() {
  const canvas = $("forest") as HTMLCanvasElement;
  const context = canvas.getContext("2d")!;
  const x0 = Math.floor((sampleCenter[0] - SAMPLE_SIZE / 2) / 16) * 16;
  const z0 = Math.floor((sampleCenter[1] - SAMPLE_SIZE / 2) / 16) * 16;
  context.fillStyle = "#4a3d28";
  context.fillRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  const trees = [];
  for (let cx = 0; cx < SAMPLE_SIZE / 16; cx++) {
    for (let cz = 0; cz < SAMPLE_SIZE / 16; cz++) {
      const rng = new Rng(seedFromPosition(x0 / 16 + cx, z0 / 16 + cz, 77));
      for (let attempt = 0; attempt < ATTEMPTS_PER_CHUNK; attempt++) {
        const x = x0 + cx * 16 + rng.nextInt(16);
        const z = z0 + cz * 16 + rng.nextInt(16);
        const roll = rng.nextFloat();
        const radius = trueRadiusAt(x, z, ageParams);
        if (roll >= growProbability(radius, ageParams.kDensity)) continue;
        const height = Math.min(Math.min(radius * treeParams.heightPerRadius, treeParams.stallHeight), treeParams.maxHeight);
        const canopy = maxCrownRadius(height, radius, treeParams);
        trees.push({ x: x - x0, z: z - z0, radius, canopy });
      }
    }
  }
  trees.sort((a, b) => a.radius - b.radius); // big trees drawn on top
  for (const tree of trees) {
    const t = (tree.radius - 0.5) / 3.35;
    context.fillStyle = `rgba(${40 + 30 * t}, ${150 - 60 * t}, ${50}, 0.75)`;
    context.beginPath();
    context.arc(tree.x, tree.z, Math.max(1, tree.canopy), 0, 2 * Math.PI);
    context.fill();
  }
  context.fillStyle = "#2a1208";
  for (const tree of trees) {
    context.beginPath();
    context.arc(tree.x, tree.z, Math.max(0.6, tree.radius), 0, 2 * Math.PI);
    context.fill();
  }
  const perChunk = trees.length / (SAMPLE_SIZE / 16) ** 2;
  const giants = trees.filter((tree) => tree.radius >= 3).length;
  $("forestCaption").textContent =
    `${SAMPLE_SIZE} × ${SAMPLE_SIZE} blocks around ${sampleCenter[0]}, ${sampleCenter[1]} · ${trees.length} trees ` +
    `(${perChunk.toFixed(2)} per chunk, ${giants} with radius ≥ 3). Circles are canopies, dark dots are trunks.`;
}

function redrawForest() {
  drawAgeMap();
  drawForestSample();
}

($("ageMap") as HTMLCanvasElement).addEventListener("click", (event) => {
  const canvas = event.currentTarget as HTMLCanvasElement;
  const bounds = canvas.getBoundingClientRect();
  const scale = canvas.width / bounds.width;
  sampleCenter = [
    Math.round(((event.clientX - bounds.left) * scale - canvas.width / 2) * MAP_BLOCKS_PER_PIXEL),
    Math.round(((event.clientY - bounds.top) * scale - canvas.height / 2) * MAP_BLOCKS_PER_PIXEL),
  ];
  redrawForest();
});

// ---------------------------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------------------------
function onTreeParamChange() {
  regenerateTree();
  drawForestSample(); // canopy sizes depend on tree parameters
}

const paramsContainer = $("params");
TREE_GROUPS.forEach((group, index) =>
  buildGroup(paramsContainer, group, treeParams, DEFAULT_SEQUOIA_PARAMS, onTreeParamChange, index === 0),
);
buildGroup($("forestParams"), FOREST_GROUP, ageParams, DEFAULT_AGE_PARAMS, () => {
  redrawForest();
  regenerateTree();
}, true);

$("resetAll").addEventListener("click", () => {
  Object.assign(treeParams, DEFAULT_SEQUOIA_PARAMS);
  Object.assign(ageParams, DEFAULT_AGE_PARAMS);
  save();
  sliderRefreshers.forEach((refresh) => refresh());
  regenerateTree();
  redrawForest();
});

$("copyChanges").addEventListener("click", async () => {
  const lines = [];
  for (const [target, defaults, name] of [[treeParams, DEFAULT_SEQUOIA_PARAMS, "tree"], [ageParams, DEFAULT_AGE_PARAMS, "forest"]]) {
    for (const key of Object.keys(defaults)) {
      if (target[key] !== defaults[key]) lines.push(`${name}.${key}: ${defaults[key]} -> ${target[key]}`);
    }
  }
  const text = lines.length ? lines.join("\n") : "(no changes from the values in the code)";
  try {
    await navigator.clipboard.writeText(text);
    $("copyStatus").textContent = lines.length ? `Copied ${lines.length} change(s).` : "Nothing changed yet.";
  } catch {
    $("copyStatus").textContent = text;
  }
});

function resize() {
  const view = $("view");
  renderer.setSize(view.clientWidth, view.clientHeight);
  camera.aspect = view.clientWidth / view.clientHeight;
  camera.updateProjectionMatrix();
}

for (const input of [radiusInput, seedInput, leavesInput]) input.addEventListener("input", regenerateTree);
window.addEventListener("resize", resize);
resize();
regenerateTree();
redrawForest();
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
