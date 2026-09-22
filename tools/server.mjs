// Controls the dev Bedrock server: start | stop | restart | reload | probe | logs | status | reset-world | vm-stop
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, config, docker, dockerInherit, ensureVm, inDataVolume, isRunning, lanAddresses, stopVm, vmIsRunning } from "./lib.mjs";

const command = process.argv[2];
const name = config.containerName;

// Commands that need Docker start the VM on demand; "status" and "vm-stop" must not.
if (["start", "restart", "reset-world"].includes(command)) ensureVm();
else if (!["status", "vm-stop"].includes(command) && !vmIsRunning()) {
  console.error("The Linux VM is not running. Use: npm run dev   (or npm run server:start)");
  process.exit(1);
}

function printConnectInfo() {
  const addresses = lanAddresses();
  console.log("\nOn the phone: Play > Servers > Add Server");
  console.log(`  Address: ${addresses.length ? addresses.join("  or  ") : "(this Mac's Wi-Fi IP address)"}`);
  console.log("  Port:    19132");
  console.log('Watch the server log with "npm run server:logs" (Ctrl+C to stop watching).\n');
}

function start() {
  const status = dockerInherit(["compose", "up", "-d"]);
  if (status === 0) printConnectInfo();
  return status;
}

function stop() {
  return dockerInherit(["compose", "stop"]);
}

switch (command) {
  case "start":
    process.exit(start());
  case "stop":
    process.exit(stop());
  case "restart":
    // Recreating (rather than restarting) also applies any docker-compose.yml changes.
    // World and packs are safe: they live in the data volume, not in the container.
    if (dockerInherit(["compose", "up", "-d", "--force-recreate"]) === 0) printConnectInfo();
    break;
  case "reload":
    // Reloads scripts only. JSON and resource changes need "npm run dev" (restart).
    if (!isRunning()) {
      console.error("Server is not running. Use: npm run server:start");
      process.exit(1);
    }
    docker(["exec", name, "send-command", "reload"]);
    console.log("Sent /reload (scripts only).");
    break;
  case "probe": {
    // Headless worldgen check: see src/scripts/dev/worldgenProbe.ts. Optional args: x z
    if (!isRunning()) {
      console.error("Server is not running. Use: npm run dev");
      process.exit(1);
    }
    const where = process.argv.slice(3).join(" ");
    docker(["exec", name, "send-command", `scriptevent ${config.namespace}:probe ${where}`.trim()]);
    console.log("Probe started; results appear in the server log in about 25 seconds (npm run server:logs).");
    break;
  }
  case "test-entities":
    docker(["exec", name, "send-command", `scriptevent ${config.namespace}:test_entities`]);
    console.log("Entity tests started; results appear in the server log in about 30 seconds.");
    break;
  case "test-blocks":
    // Headless block behavior checks: see src/scripts/dev/blockTests.ts.
    docker(["exec", name, "send-command", `scriptevent ${config.namespace}:test_blocks`]);
    console.log("Block tests started; results appear in the server log in about 25 seconds (npm run server:logs).");
    break;
  case "logs":
    process.exit(dockerInherit(["logs", "-f", "--tail", "200", name]));
  case "status": {
    const vm = vmIsRunning();
    const server = vm && isRunning();
    console.log(`Linux VM: ${vm ? "running" : "stopped"}.  Minecraft server: ${server ? "running" : "stopped"}.`);
    if (server) printConnectInfo();
    break;
  }
  case "vm-stop":
    // Stops the Minecraft server and the Linux VM, freeing about 3 GB of memory.
    if (vmIsRunning() && isRunning()) stop();
    stopVm();
    console.log("Linux VM stopped.");
    break;
  case "reset-world": {
    // Deletes the dev world so new world generation can be tested. "npm run dev" re-enables the packs.
    if (isRunning()) stop();
    inDataVolume(`rm -rf "/data/worlds/${config.levelName}"`);
    // A new world shows a new part of the forest age map. Molang cannot read the world seed, so the
    // shift is chosen here and built into the pack (see doc/04-worldgen-design.md).
    // Kept within a few thousand blocks: with offsets around 18,000 the age-gated rules stopped placing
    // anything at all (2026-09-22), for reasons not understood; q.noise also loses spread far from 0.
    const roll = () => Math.round((Math.random() * 2 - 1) * 40) * 100;
    config.worldOffset = { x: roll(), z: roll() };
    writeFileSync(join(ROOT, "trailhead.config.json"), JSON.stringify(config, null, 2) + "\n");
    console.log(`New forest map offset: ${config.worldOffset.x}, ${config.worldOffset.z}`);
    console.log(`Deleted world "${config.levelName}". Run "npm run dev" to deploy packs and start fresh.`);
    break;
  }
  default:
    console.error("Usage: node tools/server.mjs start|stop|restart|reload|logs|status|reset-world");
    process.exit(1);
}
