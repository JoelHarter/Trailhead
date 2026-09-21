// Copies build/BP and build/RP into the dev server's data volume and enables them on the dev world.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUILD, STAGING, config, docker, ensureVm, inDataVolume, readJson } from "./lib.mjs";

if (!existsSync(join(BUILD, "BP", "manifest.json"))) {
  throw new Error("Nothing to deploy. Run the build first.");
}

// Stage a folder tree that mirrors the server's /data layout.
rmSync(STAGING, { recursive: true, force: true });
const worldDir = join(STAGING, "worlds", config.levelName);
mkdirSync(worldDir, { recursive: true });

function stage(kind, packsDir, folderName, worldFile) {
  const source = join(BUILD, kind);
  cpSync(source, join(STAGING, packsDir, folderName), { recursive: true });
  const { header } = readJson(join(source, "manifest.json"));
  writeFileSync(
    join(worldDir, worldFile),
    JSON.stringify([{ pack_id: header.uuid, version: header.version }], null, 2) + "\n",
  );
}

stage("BP", "behavior_packs", config.behaviorPackFolder, "world_behavior_packs.json");
stage("RP", "resource_packs", config.resourcePackFolder, "world_resource_packs.json");

ensureVm();

// Make sure the container exists (created but not necessarily running), so there is something to copy into.
docker(["compose", "up", "--no-start"], { stdio: ["ignore", "ignore", "inherit"] });

// Remove the previous copies so deleted files do not linger, then copy the staged tree in.
inDataVolume(
  `rm -rf /data/behavior_packs/${config.behaviorPackFolder} /data/resource_packs/${config.resourcePackFolder}`,
);
docker(["cp", `${STAGING}/.`, `${config.containerName}:/data/`]);

console.log(`Deployed to server world "${config.levelName}"`);
