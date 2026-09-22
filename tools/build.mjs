// Builds packs/ + src/ into build/BP and build/RP.
//  - copies pack files, replacing the "ns:" placeholder with the configured namespace
//  - bundles src/scripts/main.ts into build/BP/scripts/main.js
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { bakeSequoias } from "../src/bake/bake.ts";
import { BUILD, ROOT, config } from "./lib.mjs";

const TEXT_EXTENSIONS = new Set([".json", ".lang", ".mcfunction", ".material"]);
const NS_PLACEHOLDER = /\bns:/g;
const NS_TAG_PLACEHOLDER = /"ns_/g; // biome tags cannot contain ":", so they are written "ns_..."

function copyPack(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    if (entry === ".DS_Store") continue;
    const source = join(from, entry);
    const target = join(to, entry);
    if (statSync(source).isDirectory()) {
      copyPack(source, target);
    } else if (TEXT_EXTENSIONS.has(extname(entry))) {
      const text = readFileSync(source, "utf8")
        .replace(NS_PLACEHOLDER, `${config.namespace}:`)
        .replace(NS_TAG_PLACEHOLDER, `"${config.namespace}_`);
      if (extname(entry) === ".json") {
        try {
          JSON.parse(text);
        } catch (error) {
          throw new Error(`Invalid JSON in ${source}: ${error.message}`);
        }
      }
      writeFileSync(target, text);
    } else {
      cpSync(source, target);
    }
  }
}

const started = Date.now();
for (const pack of ["BP", "RP"]) rmSync(join(BUILD, pack), { recursive: true, force: true });
copyPack(join(ROOT, "packs", "BP"), join(BUILD, "BP"));
copyPack(join(ROOT, "packs", "RP"), join(BUILD, "RP"));

const baked = bakeSequoias({
  namespace: config.namespace,
  behaviorPackDir: join(BUILD, "BP"),
  worldOffset: config.worldOffset,
});

// A new version number on every build. Devices keep a copy of a pack under its version, so without
// this a phone that has seen version 0.1.0 never downloads the textures and colors added since.
// Each part must stay small (a 22-million patch number made the server ignore the pack), so the version
// is 0.<days since 2026-01-01>.<two-second ticks into the day>: always increasing, never above 43,200.
const sinceEpoch = Date.now() - Date.UTC(2026, 0, 1);
const buildDay = Math.floor(sinceEpoch / 86400000);
const buildTick = Math.floor((sinceEpoch % 86400000) / 2000);
for (const pack of ["BP", "RP"]) {
  const file = join(BUILD, pack, "manifest.json");
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  const stamp = (version) => [version[0], buildDay, buildTick];
  manifest.header.version = stamp(manifest.header.version);
  for (const module of manifest.modules) module.version = stamp(module.version);
  for (const dependency of manifest.dependencies ?? []) if (dependency.uuid) dependency.version = stamp(dependency.version);
  writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
}

await build({
  entryPoints: [join(ROOT, "src", "scripts", "main.ts")],
  outfile: join(BUILD, "BP", "scripts", "main.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  external: ["@minecraft/*"],
  define: {
    __NAMESPACE__: JSON.stringify(config.namespace),
    __BUILD_TIME__: JSON.stringify(new Date().toLocaleTimeString("en-US", { hour12: false })),
  },
  logLevel: "warning",
});

const structureCount = baked.classes.length;
console.log(
  `Built packs with namespace "${config.namespace}" in ${Date.now() - started} ms ` +
    `(${structureCount} sequoia size classes baked, ${(baked.bytes / 1048576).toFixed(1)} MB of structures)`,
);
