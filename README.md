# SliMogus

Browser-based, peer-to-peer social deduction party game (Among Us–style). Host a room, share a 5-character code, complete tasks or sabotage — all lockstep over WebRTC.

**Play:** [slimogus.toeffe.uk](https://slimogus.toeffe.uk)

Built with **Vite**, **TypeScript**, **Three.js**, and **PeerJS** (same room-code join model as [tetris_game](https://github.com/toeffe/tetris_game)).

## Play locally

```bash
npm ci
npm run dev
```

Requirements: Node.js 22+, npm 10+.

| Command                   | Description                             |
| ------------------------- | --------------------------------------- |
| `npm run dev`             | Dev server                              |
| `npm run build`           | Type-check + production build → `dist/` |
| `npm run preview`         | Preview the production build            |
| `npm test`                | Vitest once                             |
| `npm run lint` / `format` | ESLint / Prettier                       |

## How it works

1. **Host** creates a room → gets a short PeerJS room code.
2. **Friends** join with that code (full mesh; host bootstraps peer links).
3. Lobby: name, character, match settings (host), ready up → start.
4. Match runs as a **deterministic lockstep** sim; each client renders the same world in first person (Three.js).

High-level layout:

| Path            | Role                                                    |
| --------------- | ------------------------------------------------------- |
| `src/app`       | App state machine (wizard → lobby → match)              |
| `src/sim`       | Deterministic world, inputs, hashing, snapshots         |
| `src/game`      | Roles, tasks, kills, meetings, sabotages, wins          |
| `src/net`       | PeerJS mesh, lobby events, input bridge                 |
| `src/three`     | Station, characters, FPS camera, lights, HUD world bits |
| `src/ui`        | Lobby, meeting, help, audio settings, overlays          |
| `public/assets` | Textures, characters (GLB), skybox, UI art              |

Path aliases (`@core`, `@game`, `@net`, `@render` → `src/three`, `@sim`, `@ui`, …) are defined in `vite.config.ts` / `tsconfig.app.json`.

Roadmap history: [plan.md](./plan.md) · checklist: [TODOS.md](./TODOS.md).

## Controls (in-match)

| Key           | Action                     |
| ------------- | -------------------------- |
| WASD / arrows | Move                       |
| Mouse         | Look (click to capture)    |
| E             | Task / vent / fix sabotage |
| R             | Report body                |
| Q             | Kill (impostor)            |
| F             | Toggle flashlight          |
| M             | Emergency meeting          |
| 1 / 2         | Sabotage lights / reactor  |
| ? / H         | Help                       |

## Deployment

Pushes to `main` run [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml): lint → test → build → GitHub Pages.

- Production `base` is `/` (custom domain root).
- Domain: `slimogus.toeffe.uk` (`CNAME` / `public/CNAME`).
- Enable **Pages → GitHub Actions** on the repo and point DNS at GitHub Pages.

## Known limitations

- Lobby uses the **public PeerJS broker** (not self-hosted matchmaking).
- Some NATs fail without a TURN relay.
- Practical soft cap ~8–12 players.
- No server anti-cheat — clients are authoritative for their own inputs.
- Desync recovery / reconnect polish is still evolving (see TODOS Phase 6+).

## Credits

Third-party art and pack licenses live next to the assets:

- [`public/assets/characters/CREDITS.txt`](./public/assets/characters/CREDITS.txt) — Quaternius (CC0)
- [`public/assets/tiles/CREDITS.txt`](./public/assets/tiles/CREDITS.txt), [`props`](./public/assets/props/CREDITS.txt), [`env`](./public/assets/env/CREDITS.txt), [`ui`](./public/assets/ui/CREDITS.txt)

Texturelabs source files under `assets/source/` are **not** redistributed (see `.gitignore`).
