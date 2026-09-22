// Builds the tree viewer into build/viewer/index.html and opens it in the browser.
// The page runs the real generator from src/core, so what you see is what the game will get.
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUILD, ROOT } from "./lib.mjs";

const result = await build({
  entryPoints: [join(ROOT, "src", "viewer", "main.ts")],
  bundle: true,
  format: "esm",
  target: "es2022",
  external: ["three", "three/addons/*"],
  write: false,
  logLevel: "warning",
});

const THREE_VERSION = "0.170.0";
const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Trailhead tree viewer</title>
<style>
  html, body { margin: 0; height: 100%; font: 13px/1.45 -apple-system, system-ui, sans-serif; color: #1d2a1d; }
  body { display: flex; }
  #view { flex: 1; min-width: 0; }
  .panel { width: 310px; padding: 14px; box-sizing: border-box; background: #f3f1ea; overflow-y: auto; }
  .panel + .panel, #view + .panel { border-left: 1px solid #d8d4c6; }
  h1 { font-size: 15px; margin: 0 0 10px; }
  h2 { font-size: 13px; margin: 18px 0 4px; }
  label { display: block; margin-top: 12px; font-weight: 600; }
  input[type=range] { width: 100%; margin: 2px 0 0; }
  #stats { margin-top: 12px; padding: 10px; background: #fff; border-radius: 6px; }
  .bad { color: #b3261e; }
  canvas { width: 100%; image-rendering: pixelated; border-radius: 6px; margin-top: 6px; display: block; }
  #ageMap { cursor: crosshair; }
  small, .hint { color: #5a665a; font-size: 11.5px; }
  details { margin-top: 8px; background: #fff; border-radius: 6px; padding: 6px 10px; }
  summary { cursor: pointer; font-weight: 600; padding: 2px 0; }
  .param { margin: 10px 0 12px; }
  .paramHead { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
  .paramValue { font-variant-numeric: tabular-nums; color: #44523f; }
  .param.changed .paramLabel, .param.changed .paramValue { color: #9a4b00; font-weight: 600; }
  button { font: inherit; border: 1px solid #b9b49f; background: #fff; border-radius: 5px; padding: 3px 8px; cursor: pointer; }
  button.reset { padding: 0 6px; font-size: 11px; }
  button:disabled { opacity: 0.35; cursor: default; }
  .buttons { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
</style>
<div class="panel">
  <h1>Giant sequoia generator</h1>
  <label>True trunk radius: <span id="radiusValue"></span></label>
  <input id="radius" type="range" min="0.5" max="3.85" step="0.05" value="3.85">
  <label>Seed: <span id="seedValue"></span></label>
  <input id="seed" type="range" min="1" max="200" step="1" value="1">
  <label><input id="leaves" type="checkbox" checked> Show leaves</label>
  <div id="stats"></div>
  <h2>Algorithm constants</h2>
  <small>Orange = changed from the value in the code. Your settings are remembered in this browser.
  Moving a slider changes only this preview, not the game.</small>
  <div id="params"></div>
  <div class="buttons">
    <button id="resetAll">Reset everything</button>
    <button id="copyChanges">Copy my changes</button>
  </div>
  <small id="copyStatus">"Copy my changes" puts a list of what you changed on the clipboard, ready to
  paste to Claude so it can be made permanent in the code.</small>
</div>
<div id="view"></div>
<div class="panel">
  <h1>Forest layout</h1>
  <div id="forestParams"></div>
  <h2>Forest sample, seen from above</h2>
  <canvas id="forest" width="384" height="384"></canvas>
  <small id="forestCaption"></small>
  <h2>Age map</h2>
  <canvas id="ageMap" width="288" height="288"></canvas>
  <small id="ageMapCaption"></small>
  <p><small>In the 3D view: drag to orbit, scroll to zoom, right-drag to pan. The blue box is a player
  for scale; the translucent slab is the ground, with the root cone visible beneath it.</small></p>
</div>
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/"
} }
</script>
<script type="module">
${result.outputFiles[0].text}
</script>
</html>
`;

const outDir = join(BUILD, "viewer");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "index.html");
writeFileSync(outFile, html);
console.log(`Viewer written to ${outFile}`);
if (!process.argv.includes("--no-open")) spawn("open", [outFile], { stdio: "ignore", detached: true }).unref();
