import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const BUILD = join(ROOT, "build");
export const STAGING = join(ROOT, ".staging");

export const IMAGE = "itzg/minecraft-bedrock-server:latest";
export const VOLUME = "trailhead_bedrock_data";

export const config = JSON.parse(readFileSync(join(ROOT, "trailhead.config.json"), "utf8"));

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Docker runs inside Colima (open source). The VM is always started with --mount none, so the Linux
// side cannot see any Mac folders; files reach the server only through "docker cp" in deploy.mjs.
const COLIMA_FLAGS = ["--cpu", "4", "--memory", "3", "--disk", "20", "--mount", "none", "--port-forwarder", "grpc"];

function localBin(name) {
  const probe = spawnSync(name, ["--version"], { stdio: "ignore" });
  if (probe.status === 0) return name;
  const local = join(homedir(), ".local", "bin", name);
  if (existsSync(local)) return local;
  throw new Error(`${name} not found. It should be in ~/.local/bin (see doc/02-bedrock-platform.md).`);
}

export function dockerPath() {
  return localBin("docker");
}

export function vmIsRunning() {
  return spawnSync(localBin("colima"), ["status"], { stdio: "ignore" }).status === 0;
}

/** Starts the Colima VM if needed. Flags are always explicit so folder sharing can never default back on. */
export function ensureVm() {
  if (vmIsRunning()) return;
  console.log("Starting the Linux VM (Colima, no shared folders) ...");
  const result = spawnSync(localBin("colima"), ["start", ...COLIMA_FLAGS], { stdio: ["ignore", "ignore", "inherit"] });
  if (result.status !== 0) throw new Error("Colima failed to start.");
}

export function stopVm() {
  if (vmIsRunning()) spawnSync(localBin("colima"), ["stop"], { stdio: "inherit" });
}

export function docker(args, options = {}) {
  return execFileSync(dockerPath(), args, { cwd: ROOT, encoding: "utf8", ...options });
}

export function dockerInherit(args) {
  return spawnSync(dockerPath(), args, { cwd: ROOT, stdio: "inherit" }).status ?? 1;
}

export function isRunning() {
  try {
    const out = docker(["inspect", "-f", "{{.State.Running}}", config.containerName], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim() === "true";
  } catch {
    return false;
  }
}

// Runs a shell command against the server's data volume, whether or not the server is running.
// The server data is deliberately not a shared Mac folder (see docker-compose.yml).
export function inDataVolume(shellCommand) {
  if (isRunning()) return docker(["exec", config.containerName, "sh", "-c", shellCommand]);
  return docker(["run", "--rm", "--entrypoint", "sh", "-v", `${VOLUME}:/data`, IMAGE, "-c", shellCommand]);
}

export function lanAddresses() {
  const found = [];
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal && name.startsWith("en")) found.push(entry.address);
    }
  }
  return found;
}
