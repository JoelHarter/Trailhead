# Trailhead

A Minecraft Bedrock add-on inspired by the wild places of North America, starting with the giant
sequoia groves. Planning and design documents are in [doc/](doc/index.md).

## How development works

The Mac runs a headless Bedrock **server** (nothing appears on screen). The game itself is seen on a
phone that connects to that server over Wi-Fi.

The server runs inside a small Linux virtual machine managed by **Colima** (open source). The commands
below start it automatically when needed. It is started with folder sharing turned off, so nothing
inside it can see any files on the Mac; see "Privacy and isolation" below.

All commands are run from this folder.

| Command | What it does | When |
|---|---|---|
| `npm run dev` | Build, copy packs to the server, restart the server | After changing anything. Always works. ~15 s |
| `npm run reload` | Build, copy, hot-reload scripts only | After changing only TypeScript in `src/`. ~2 s |
| `npm run server:logs` | Watch the server log (Ctrl+C to stop watching) | To see errors and script output |
| `npm run server:stop` | Stop the Minecraft server | |
| `npm run vm:stop` | Stop the server **and** the Linux VM | When done for the day (frees about 3 GB of memory) |
| `npm run server:start` | Start it again | |
| `npm run server:status` | Are the VM and server running? Shows the address for the phone | |
| `npm run world:reset` | Delete the dev world | To test world generation on fresh terrain |
| `npm run check` | Typecheck the TypeScript | Before committing |
| `npm test` | Run the tree algorithm's tests (no game needed) | After changing `src/core/` |
| `npm run view` | Open the 3D tree viewer in the browser, with radius and seed sliders | To look at and tune trees |
| `npm run test:blocks` | Check leaf decay, item tags, and sapling growth on the server; results in the server log | After changing block scripts |
| `npm run addon` | Package the add-on as `dist/Trailhead.mcaddon` for a phone, PC, or Realm | Before sharing it |
| `npm run probe` | Generate fresh terrain on the server and count tree blocks; results in the server log | To check world generation without the phone |

After `npm run dev` or a world reset, leave and rejoin the server on the phone to see changes.

## Connecting the phone

1. Phone on the same Wi-Fi as the Mac.
2. Minecraft > Play > Servers > scroll to the bottom > **Add Server**.
3. Name: anything. Address: the one printed by `npm run server:status`. Port: `19132`.
4. Join. The phone downloads the resource pack automatically.

The Mac's address can change when the router reassigns it. If the phone cannot connect, run
`npm run server:status` and update the address in the phone's server entry.

## Layout

```
packs/BP/        behavior pack sources (blocks, entities, features, ...)
packs/RP/        resource pack sources (textures, models, sounds, names)
src/core/        pure TypeScript: math and algorithms, no Minecraft imports
src/scripts/     in-game scripts (entry point: main.ts)
src/bake/        turns generated trees into .mcstructure files and feature JSON during the build
src/viewer/      the browser tree viewer
test/            tests for src/core
tools/           build, deploy, and server control
build/           generated; never edit
doc/             planning and design documents
```

## The namespace rule

The add-on's namespace is set once, in `trailhead.config.json`. Everywhere else:

- pack files write the placeholder `ns:`, as in `"identifier": "ns:sequoia_planks"`; the build
  substitutes the real namespace;
- scripts use `id("sequoia_planks")` from `src/core/ns.ts`.

Never type the real namespace by hand. This keeps renaming the project a one-line change, which matters
until the first world the family plays in; after that the namespace is saved inside the world and must
not change.

## Notes

- The server's files (world, packs) live in a Docker volume named `trailhead_bedrock_data` inside the
  Linux VM, not in a Mac folder. The tools copy packs in with `docker cp`.
- Starting the server accepts the Minecraft End User License Agreement (`EULA: "TRUE"` in
  `docker-compose.yml`), which the server requires in order to run.
- The server always downloads the latest Bedrock release, which keeps it matched to the phone. If the
  phone refuses to connect after a game update, run `npm run server:restart`, and update Minecraft on
  the phone.
- The server uses the classic `raknet` network transport (set in `docker-compose.yml`). Bedrock 1.26.5x
  defaults to a newer one that the phone's Add Server screen cannot reach through Docker.
- On a network you do not trust (a cafe, a hotel), stop the server: anyone on the same Wi-Fi can join
  the dev world, and every player there is an operator.

## Privacy and isolation

Decided 2026-09-21, after first trying OrbStack (closed source, installed an admin-level helper, asked
for access to the Documents folder) and removing it completely.

- **Colima, Lima, the Docker CLI, and Docker Compose** are installed in `~/.local` from their official
  release downloads, checksums verified where published. Nothing needed an administrator password, and
  nothing is installed system-wide. Colima and Lima are open source and send no telemetry.
- The VM is always started with `--mount none` (see `tools/lib.mjs`). Verified: inside the VM `/Users`
  does not exist, and a container deliberately asked to mount the home folder received an empty
  directory. The only Mac files that ever enter the VM are the built packs, pushed by `docker cp`.
- The one container that runs is `itzg/minecraft-bedrock-server`, a widely used open-source image that
  downloads Mojang's official server.
- To remove everything: `colima delete`, then delete `~/.colima`, `~/.docker`, `~/.local/opt/lima`, and
  the `colima`, `limactl`, `lima`, and `docker` files in `~/.local/bin`.
