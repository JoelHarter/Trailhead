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

const baked = bakeSequoias({ namespace: config.namespace, behaviorPackDir: join(BUILD, "BP") });

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
