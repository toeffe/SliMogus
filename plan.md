This is the full blueprint for building a production-ready (as much as possible for a static P2P game) browser Among Us clone using Cursor.

> **Note:** Early phases assumed PixiJS. The live renderer is **Three.js** (`src/three`, alias `@render`). Treat Pixi mentions below as historical.

---

### **Phase 0: Foundation & Tooling (1–2 days)**

- Repository initialization on GitHub
- Vite + TypeScript + PixiJS v8 setup
- ESLint + Prettier + Vitest + Husky (pre-commit)
- `tsconfig.json` (strict, composite, paths)
- Folder structure (core, net, game, pixi, ui, utils, types, constants)
- GitHub Pages deployment workflow + `vite.config.ts` (base, plugins)
- PWA manifest + service worker basics
- Asset pipeline (sprites, sounds, JSON maps)
- Basic logging / debug overlay system
- Cursor-optimized README + TODOS

**Milestone**: `npm run dev` shows Pixi canvas with FPS + debug info.

---

### **Phase 1: Deterministic Simulation Engine (4–6 days)** — *Most Critical*

- Fixed timestep loop (decoupled from render)
- Seeded PRNG (`seedrandom`)
- Deterministic math (Vector2, fixed-point or high-precision floats)
- Entity Component lite system (or plain classes with strict update order)
- Input serialization / deserialization (flat, versioned)
- State hashing (deep, fast) for desync detection
- Snapshot / replay system
- Simulation replay tester (Vitest)
- Tick buffer + authority resolution (host has tie-breaker)
- Late join / resync protocol

**Milestone**: 100% identical simulation across multiple simulated clients.

---

### **Phase 2: Networking & Connectivity (5–8 days)**

**WebRTC Stack**
- Manual signaling UI (multi-step copy/paste wizard + QR code bonus)
- RTCPeerConnection + DataChannel management
- Perfect negotiation + ICE candidate handling
- Two channels: reliable (events) + unreliable (inputs)
- Message protocol (typed, versioned, compressed with LZ-String)
- Full-mesh + host-relay fallback
- Ping, latency, clock sync
- Connection quality monitoring + fallback messages
- Reconnection logic (with session recovery)

**Lobby System**
- Room code generation
- Player list, ready system, settings (impostor count, map, timers, etc.)
- Host migration (if host leaves)

**Milestone**: 3+ real browsers connected, inputs synchronized.

---

### **Phase 3: Game World & Rendering (4–6 days)**

- Tilemap system (JSON + Pixi)
- Collision (grid + precise)
- Player visuals (colored beans, animations, name tags, hats)
- Camera (follow + minimap)
- Lighting / vision (for sabotages)
- Object pooling
- Layer management (background, players, UI, effects)

---

### **Phase 4: Core Gameplay Mechanics (8–12 days)**

**Roles & Start**
- Role assignment (deterministic from seed)
- Spawn locations

**Tasks**
- Task definitions (data-driven)
- Visual tasks (observable)
- Task progress sync
- Fake tasks for impostors

**Sabotages**
- Multiple types with timers and fixes
- Critical sabotage win condition

**Killing**
- Cooldown, range, animation, body creation
- Kill confirmation

**Meetings**
- Full meeting UI (Pixi + HTML hybrid)
- Discussion timer
- Voting (anonymous / visible, tie rules)
- Ejection animation + role reveal (end only)

**Win Conditions**
- Task completion
- Impostor majority kill
- Sabotage timeout

**Ghost Mode**
- Flying, limited interaction

**Vents**
- Hidden network, animation, cooldown

---

### **Phase 5: Polish, UX & Accessibility (5–7 days)**

- Full UI/UX (lobby, in-game HUD, meeting, victory, settings)
- Tutorial / help screen
- Sound effects (Web Audio)
- Visual feedback (kill flash, sabotage alerts)
- Mobile controls (virtual joystick + touch)
- Keyboard shortcuts
- Settings persistence (localStorage)
- Cosmetic system (colors, hats)
- Text chat (optional, moderated)
- Pause / spectate

---

### **Phase 6: Edge Cases, Robustness & Anti-Frustration (4–6 days)**

- Desync detection & auto-recovery
- Player disconnect / reconnect
- Host migration
- Packet loss / high latency handling
- Duplicate message protection
- Input validation / anti-cheat basics (even without server)
- Browser compatibility (Chrome, Firefox, Safari, mobile)
- Performance optimization (culling, throttling)
- Error boundaries & graceful degradation
- Rate limiting on messages

---

### **Phase 7: Testing & Quality Assurance (4–6 days)**

- Unit tests (determinism, serialization)
- Integration tests (simulation + network)
- Manual multi-device test matrix
- Load testing (simulated clients)
- Accessibility audit
- Performance profiling
- Security review (input sanitization, message validation)

---

### **Phase 8: Deployment, Documentation & Release**

- Production build optimization
- GitHub Pages deployment
- Detailed README (how to play, limitations, troubleshooting)
- Credits / legal (original game inspiration)
- Analytics (optional, privacy-first)
- Versioning & update notes

---

### **Phase 9: Post-Launch (Ongoing)**

- Bug bash & hotfixes
- Additional maps
- More roles (Engineer, Scientist, etc.)
- Season / progression (cosmetics)
- Community features (feedback form)
- Performance improvements

---

### **What This Plan Explicitly Covers (Everything)**

- **Technical** — Every major system, subsystem, and integration point.
- **Game Design** — All core Among Us loops + necessary simplifications.
- **Networking** — Signaling, transport, synchronization, recovery.
- **User Experience** — From first load to victory screen.
- **Development Process** — Tooling, testing, Cursor workflow.
- **Edge Cases** — Disconnects, desyncs, mobile, different browsers.
- **Non-Functional** — Performance, accessibility, deployability.

**Known Inherent Limitations** (due to your constraints — no backend):
- No easy global matchmaking.
- NAT traversal issues for some users.
- Scalability limited (~8–12 players max).
- No server-side anti-cheat (client-side validation only).
- Manual signaling is clunky (but necessary).

This plan is now **as complete as reasonably possible** for a solo developer using Cursor.

---

**Next Action?**

Would you like me to:
1. Start generating the **Phase 0 complete file structure + key files** right now?
2. Create a detailed **Cursor prompt guide** for each phase?
3. Expand any specific phase into micro-tasks?

Just say the word and we’ll begin building. This is everything.
