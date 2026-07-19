# TODOS

Phase checklist tracking [plan.md](./plan.md). Working one phase at a time; each phase is built, then tested, then confirmed before moving on.

## Phase 0 — Foundation & Tooling

- [x] Vite + TypeScript (strict) + PixiJS v8 scaffold, path aliases
- [x] App bootstrap: Pixi canvas, placeholder scene, FPS/debug overlay, logger
- [x] ESLint + Prettier + Vitest + Husky/lint-staged
- [x] PWA manifest + basic service worker, public asset dirs
- [x] GitHub Pages deploy workflow + `vite.config.ts` base
- [x] README + TODOS
- [x] Test gate passed and confirmed (dev, build, preview, lint, test all green)

## Phase 1 — Deterministic Simulation Engine

- [x] Fixed timestep loop (render-decoupled `GameLoop` from Phase 0, now driving the real sim)
- [x] Seeded PRNG (`Random` wrapping `seedrandom`), deterministic `Vector2` math (doubles, fixed op order)
- [x] Entity model + strict ascending-id update order (`World`/`Entity`, no generic ECS)
- [x] Input serialization (flat, versioned `PlayerInput` + `encodeInput`/`decodeInput`)
- [x] State hashing for desync detection (`hashWorldState`, FNV-1a, rounded floats)
- [x] Snapshot / replay system + replay tester (Vitest multi-client determinism test)
- [x] Tick buffer + host tie-breaker authority (`TickBuffer`)
- [x] Late join / resync protocol (`resyncFromSnapshot`)
- [x] Test gate passed and confirmed (typecheck, lint, format, 51 tests, build all green)

## Phase 2 — Networking & Connectivity

- [x] WebRTC signaling UI (manual copy/paste), `RTCPeerConnection` + `RTCDataChannel` management with perfect negotiation
- [x] Reliable + unreliable channels, typed/versioned JSON protocol (binary `PlayerInput` on the unreliable channel), `lz-string`-compressed signaling blobs
- [x] Full-mesh host-relay bootstrap (host relays new-peer signaling so every pair connects directly), `NetworkBridge` wiring `PeerMesh` into the Phase 1 `TickBuffer`/`Simulation`, `INPUT_DELAY_TICKS` lockstep delay, state-hash desync detection
- [x] Lobby system (room code, player list, ready states, host migration), signaling wizard + lobby UI wired into `App.ts`'s `start`/`lobby`/`game` state machine
- [x] Test gate passed and confirmed (typecheck, lint, format, tests, build all green; live 3-browser Playwright connectivity check confirms identical state hashes over real WebRTC)

## Phase 3 — Game World & Rendering

- [x] Deterministic tilemap (`sim/tilemap.ts`, one hand-authored prototype map) + axis-separated circle-vs-tilemap collision (`sim/collision.ts`), wired into `World`/`Simulation`; multi-instance determinism test extended to cover wall collisions
- [x] Camera (follow + edge-clamped/centered), `worldLayers` container hierarchy, generic `ObjectPool`
- [x] Procedural tile rendering (`tilemapRenderer.ts`) and pooled bean-shaped player visuals with name tags + walk bob/tilt (`playerView.ts`)
- [x] Toggleable vision-radius mask (`visionMask.ts`, enabled by default) and fixed-corner minimap (`minimap.ts`)
- [x] Test gate passed and confirmed (typecheck, lint, format, tests, build all green; live 3-browser Playwright connectivity check confirms identical state hashes with collision-affected motion over real WebRTC)

## Phase 4 — Core Gameplay Mechanics

- [x] Real keyboard input (`KeyboardController`), `PlayerInput` v2 (+`targetId`/button bits), reliable `actionInput` duplicate for discrete actions, lobby settings UI for `impostorCount`/`taskCount`
- [x] New `@game` module: `GameState` composing `Simulation` with roles/tasks/kills/bodies/meetings/sabotages/vents/win conditions (composed hash/snapshot)
- [x] Deterministic role assignment + role-reveal overlay; hold-`E` stub tasks with task HUD (fake tasks for impostors)
- [x] Killing (cooldown/range), ghosts (`ignoresCollision` + hidden-from-living rendering), bodies + report
- [x] Meetings (emergency/report), discussion/voting timers, plurality tally/tie rule, ejection, `meetingScreen.ts`
- [x] Lights + Reactor sabotages (vision-mask wiring, dual-panel fix, timeout win), sabotage HUD
- [x] Vent travel, all 4 win conditions, victory screen with full role reveal
- [x] Test gate passed and confirmed (typecheck, lint, format, 214 tests, build all green; live 3-browser Playwright check exercises real WASD + sabotage + meeting/vote + kill with identical state hashes)

## Phase 5 — Polish, UX & Accessibility (core polish slice — current)

- [x] Settings persistence (`localStorage`: display name, mute, volume, seenTutorial) + lobby settings panel
- [x] In-game HUD (role badge, kill cooldown, contextual E/R/Q prompts)
- [x] Help overlay (`?`/`H`) + first-run tutorial via `seenTutorial`
- [x] Procedural Web Audio SFX + kill flash (mute/volume honored)
- [x] Lobby UX cleanup + victory “Back to lobby” / “Play again” → wizard
- [x] Test gate passed (typecheck, lint, format, tests, build; live 3-browser Playwright connectivity check still green — polish does not change sim hashes)
- [ ] Out of scope / deferred (Phase 5b or later): mobile virtual joystick, cosmetics/hats, text chat, pause/spectate, full visual rebrand

## UX pass — Station Omega, textures, clearer HUD, PeerJS lobby

- [x] PeerJS 5-character room codes (tetris_game join model); copy/paste SDP invites removed
- [x] Station Omega named-room tilemap + re-authored tasks/vents/sabotage POIs
- [x] Real PNG tiles/POI icons under `public/assets/`; textured renderer + props markers + room-tinted minimap
- [x] Telling HUD (room, phase, crew task bar, alive counts, richer prompts, sabotage panel status, ghost status)
- [x] Test gate + live 3-browser PeerJS code-join connectivity check

## Phase 6 — Edge Cases, Robustness & Anti-Frustration

- [ ] Desync recovery, disconnect/reconnect, host migration, anti-cheat basics

## Phase 7 — Testing & QA

- [ ] Unit/integration tests, manual device matrix, load testing, security review

## Phase 8 — Deployment, Documentation & Release

- [x] GitHub Pages workflow + custom domain (`slimogus.toeffe.uk`), Vite `base: '/'`
- [x] README / credits pointers polished for Three.js + PeerJS
- [ ] Production build optimization, versioning, fuller legal pass

## Phase 9 — Post-Launch

- [ ] Bug bash, additional maps/roles, progression, community feedback
