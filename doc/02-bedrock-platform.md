# 02 — How Bedrock modding works, and how to develop it from a Mac

Platform facts were checked in September 2026 against Microsoft's creator docs, the Bedrock Wiki,
npm, and Mojang's sample repositories. Current game release: **26.50** (hotfix 26.51).

## Add-ons versus Fabric mods

A Java mod is compiled code loaded into the game; it can subclass and patch anything. Bedrock has no
such mechanism. The supported route is an **add-on**, which is two folders of data:

| Pack | Contains | Runs where |
|---|---|---|
| **Behavior pack** | Entities, blocks, items, recipes, loot, spawn rules, biomes, features, structures, and **scripts** | Server / world host |
| **Resource pack** | Textures, models (geometry), animations, render controllers, sounds, language files, biome colors | Each player's client |

Almost everything is **JSON**. Mobs are not classes with goal lists; they are JSON files listing
components (`minecraft:tameable`, `minecraft:behavior.follow_owner`, ...) with "component groups" that
are swapped in and out by events. Where JSON cannot express something, the **Script API** fills in:
JavaScript (we would write TypeScript) using the `@minecraft/server` module. Scripts can read and set
blocks, access inventories, react to events, and attach custom logic to blocks and items ("custom
components"). Scripts cannot add AI goals, cannot hook world generation, and cannot touch rendering.

Consequences for this port:

- The Java code is reference material, not a starting point. The **math carries over**; the
  block/entity/registry code does not.
- Things that were free on Java by subclassing (`StairsBlock`, `PolarBearEntity`) must be rebuilt from
  components. Things that were hard on Java (taming, dyeable collars, swooping flight) are stock
  components on Bedrock.
- The big advantage: add-ons work on **every Bedrock platform including consoles**, and joining
  players download the packs automatically.

Versions to target: `@minecraft/server` **2.10.0** and `@minecraft/server-ui` 2.2.0 (both stable),
manifest `min_engine_version [1, 26, 50]`. Use **stable APIs only**: beta APIs do not run on Realms, and
everything this project needs (custom biomes, features, custom components, structure manager, block
inventories) is stable.

## Developing from a Mac

There is no Bedrock client for macOS, so editing happens on the Mac and the game runs elsewhere.

**Recommended loop: Bedrock Dedicated Server in Docker + any real client.**

Docker here runs only the game's **server** half (world simulation, no graphics) in the background on
the Mac. Nothing Minecraft-related appears on the Mac's screen; the game is seen on the phone.

The Docker runtime is **Colima** (open source, built on Lima and Apple's Virtualization framework),
installed without admin rights and started with `--mount none` so the Linux VM cannot see any Mac
files. OrbStack was tried first and removed the same day: it is closed source, installs an admin-level
helper, and prompted for access to the Documents folder, which Joel was not comfortable with. Docker
Desktop was rejected as closed source too and heavy for this Mac's 8 GB of RAM. The isolation details
and how they were verified are in the [README](../README.md). Day-to-day use is wrapped in project
scripts, so no Docker knowledge is needed.

- The `itzg/minecraft-bedrock-server` image has a native arm64 build for Apple Silicon (it bundles an
  x64 emulator internally; do not force `--platform linux/amd64`, which has an open connection bug).
- The build copies the two packs into the server's data with `docker cp`. The world's
  `world_behavior_packs.json` / `world_resource_packs.json` enable them.
- **Server data lives in a Docker volume, not a shared Mac folder.** This started as a workaround (a
  shared folder made OrbStack hang while the server unpacked itself) and became the design: with no
  shared folders at all, the VM has nothing of the Mac's to see.
- **Transport must be set to `raknet`.** Bedrock 1.26.5x servers default to `transport=nethernet`, which
  listens on TCP 19132 plus UDP 7551 for discovery. Behind Docker the phone cannot reach that. With
  `TRANSPORT: "raknet"` the server speaks the classic UDP 19132 protocol, confirmed by pinging it through
  the Mac's Wi-Fi address. Colima needs `--port-forwarder grpc` for UDP (its default forwards TCP only).
- **Warning to expect, and a risk to watch.** With `raknet` the server prints a loud "TRANSPORT TYPE
  ERROR ... NetherNet is the only supported transport type ... Players will not be able to connect" on
  every start. As of 1.26.51 this is not true in practice: the Pixel connects fine over `raknet`
  (confirmed 2026-09-21). But it signals that Mojang intends to drop `raknet`. If the phone stops
  connecting after a game update, this is the first suspect; the fix would be switching to `nethernet`
  and forwarding what it needs (it listened on TCP 19132 and UDP 7551 when last checked), which has not
  been worked out yet.
- **Homebrew cannot install formulae on this Mac** without compiling from source (no prebuilt packages
  for macOS 14), so Node.js, Colima, Lima, and the Docker CLI were installed from official release
  binaries into `~/.local`.
- A real client connects by IP on UDP 19132. For this project that is **Joel's Pixel 6** (Minecraft for
  Android) on the same Wi-Fi as the Mac. (Consoles cannot add a custom server by IP, so a console
  cannot be the test client.)
- The VS Code **Minecraft Bedrock Debugger** can attach to the server from macOS for breakpoints in
  TypeScript. Content errors go to the server log.
- `/reload` hot-reloads scripts only. JSON changes (entities, blocks, features) and resource pack
  changes need a server restart or rejoin. World generation changes need fresh chunks, so worldgen
  testing means a throwaway world each time; script that.

Why this should not repeat the earlier "Bedrock on the Mac was unusably slow" experience: that was
the game **client** (3D rendering) running under emulation. Here the Mac runs only the headless
**server**, which does no rendering and is light; the rendering happens on a device built for it.

About the Nintendo Switch: it is a fine device for *playing* the finished add-on (through a Realm or a
friend's hosted world), but a poor *development* client. It cannot connect to a server by IP without a
DNS-redirect workaround (BedrockConnect), it cannot import packs, and it receives game updates later
than other platforms, which can leave it briefly unable to join a newer server. A phone or tablet is
the best test client: Minecraft for iOS/Android is a one-time purchase of a few dollars, separate from
the Switch license, signed into the same Microsoft account.

Fallbacks: AirDrop a `.mcaddon` to an iPad and open it in Minecraft (works, slow to iterate, stale pack
versions are a nuisance). A Windows-on-ARM VM in Parallels reportedly runs Bedrock inconsistently;
not worth relying on.

### Could the game client run on the Mac itself?

Researched September 2026 (web research only; nothing was run on this Mac). There is no official macOS
Bedrock client, announced or shipped. The unofficial routes:

| Route | Status | Verdict |
|---|---|---|
| **BlueStacks Air** (Android emulator, native on Apple Silicon, free) | Installs Minecraft from Google Play using the licence already bought for the Pixel. Guides claim it runs smoothly; no reports for 8 GB machines. Joining by IP is unconfirmed but expected to work: use the Mac's LAN IP, not `localhost` | **Worth a 30–60 minute trial** as an on-screen second client. Risk: memory pressure next to the server on 8 GB |
| **mcpelauncher** (runs the Android build natively, Google Play login) | Actively maintained, but on Apple Silicon game versions 1.26.45 and later crash at startup (open issues as of mid-September 2026). Its default x86 game mode runs under Rosetta and is slow; the arm64 mode is labelled experimental | Not usable now: a client must match the server's version. Re-check later; it has the best file access of any option |
| Windows 11 ARM VM (Parallels) | Works on 16 GB machines; needs Parallels (~$100/yr), a Windows licence, and the Windows edition of Minecraft | Not realistic on 8 GB |
| CrossOver / Whisky / Game Porting Toolkit | No credible reports of the current Windows build running on macOS | Skip |
| iOS app on Mac | Not offered on the Mac App Store; sideloading needs a decrypted app file (licensing grey area) | Skip |
| Android Studio emulator | Graphics problems, heavy on RAM | Skip |
| Minecraft Education (native Mac app) | Script API support unconfirmed, no dedicated-server join, needs a school licence | Skip |

History: Joel's earlier "unusably slow" attempt at Bedrock on this Mac was mcpelauncher, most likely in
its default x86 mode under Rosetta. That result says nothing about BlueStacks Air, which runs ARM code
natively.

Conclusion: the server-on-Mac plus Pixel loop stays the primary plan because it is the only one
certain to work on the current game version. An on-Mac client would be a convenience on top of it, not
a replacement, and either kind of client connects to the same server, so trying one costs nothing in
project structure.

**Much of the work needs no game at all.** The tree algorithm, the structure baker, and their tests run
in Node on the Mac. That is where the hardest part of this project gets built and verified.

## Tooling

- **TypeScript + Node** for scripts and the offline baker.
- **Build: a small custom Node script** (`tools/build.mjs`, using esbuild), chosen when scaffolding over
  Regolith and Mojang's `ts-starter`. The build only has to copy two folders, substitute the namespace
  placeholder, and bundle one TypeScript entry point, and a script that short is easier to understand
  and debug than a framework. Regolith remains an option if the pipeline grows filters.
- **Blockbench** (runs on Mac) for entity models and animations, and for block geometry.
- **Minecraft Creator Tools** CLI (`@minecraft/creator-tools`) for validating packs.
- **bridge.** (web editor) is optional; helpful for JSON autocompletion.

## Playing together

Scripts run only on the host, and clients receive packs automatically when they join, so nobody but
the host ever installs anything.

| Setup | Works for consoles | Cost | Notes |
|---|---|---|---|
| **Realm** | Yes | Subscription | Always on. Packs cannot be added in the Realm UI: apply them to a world on a Windows/iOS/Android device, then upload that world. Repeat per update. |
| **One player hosts**, others join via Friends | Yes | Free | Host device must be Windows/mobile (to install the add-on) and online whenever anyone plays. |
| **Self-hosted dedicated server** | No (no "add server" on consoles; DNS workarounds are fragile) | Free | Only if nobody is on a console. |

**For this family** (Switch, Xbox, Switch, in different households) the answer is a **Realm**. The
Pixel 6 has a second job beyond testing: it is the device that uploads the world, with the add-on
applied, to the Realm. Whose Realm to use is discussed in [05-roadmap.md](05-roadmap.md).

A free middle step for testing on a console before any Realm is involved: host the world from the
Pixel 6 and join from the Switch over the home network.
