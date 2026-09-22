// Packages the built packs as dist/Trailhead.mcaddon: a zip holding the behavior and resource packs,
// which Minecraft on Windows, iOS, or Android imports when opened. Run "npm run build" first (this does).
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { BUILD, ROOT, config } from "./lib.mjs";

execFileSync("node", [join(ROOT, "tools", "build.mjs")], { stdio: "inherit" });
const dist = join(ROOT, "dist");
mkdirSync(dist, { recursive: true });
const out = join(dist, "Trailhead.mcaddon");
rmSync(out, { force: true });
// The two folders inside the zip are named as the packs are installed; the game reads the manifests.
execFileSync("zip", ["-q", "-r", "-X", out, "BP", "RP"], { cwd: BUILD });
console.log(`Wrote ${out} (namespace "${config.namespace}", world map offset ${JSON.stringify(config.worldOffset ?? { x: 0, z: 0 })})`);
console.log("Send it to a Windows, iOS, or Android device and open it; Minecraft imports both packs.");
