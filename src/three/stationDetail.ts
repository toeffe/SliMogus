import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  TorusGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import { isSolidAtTile, tileIndexAt, type MapRoom, type TileMap } from '@sim/tilemap';
import { buildPurposeLayout } from '@sim/purposeLayout';
import { collectPoiClearWorld } from '@game/poiClear';
import { getMapPois } from '@game/mapPois';
import { pxToWorldX, pxToWorldZ, WALL_HEIGHT } from './worldScale';
import type { StationMaterials } from './materials';

export interface StationDetailHandle {
  update: (timeSec: number) => void;
}

type Pose = {
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
};

type Face = 'n' | 's' | 'w' | 'e';

type RoomRole =
  'corridor' | 'cafeteria' | 'medbay' | 'upper-engine' | 'electrical' | 'storage' | 'reactor';

type HeroKind = 'ceilingStrip' | 'panelBand' | 'conduitCluster' | 'gratePatch';

interface RoomBudget {
  /** 0â€“1000 chance to place a wall panel on an eligible slot. */
  panelChance: number;
  conduitChance: number;
  /** Chance a ceiling pipe run is kept after extraction. */
  pipeRunChance: number;
  tertiaryChance: number;
  grateChance: number;
  /** Place a ceiling rib every N tiles along a run axis. */
  ribStride: number;
  hero: HeroKind;
}

interface WallSlot {
  tx: number;
  ty: number;
  face: Face;
  x: number;
  z: number;
  ry: number;
  /** True when the wall face runs eastâ€“west (N/S neighbors). */
  alongX: boolean;
  role: RoomRole;
  blocked: boolean;
}

interface FloorSlot {
  tx: number;
  ty: number;
  x: number;
  z: number;
  role: RoomRole;
  kind: 'floor' | 'floorAlt' | 'doorFrame';
  wallEdges: number;
  blocked: boolean;
}

interface CeilingCell {
  tx: number;
  ty: number;
  x: number;
  z: number;
  role: RoomRole;
  nearWall: boolean;
  blocked: boolean;
}

const DETAIL_SEED = 0x5a71011;
/** Clear radius around interactables (world units â‰ˆ tiles). */
const POI_CLEAR_RADIUS = 0.85;
const PANEL_HALF_DEPTH = 0.035;
/** Distance from tile center to wall-face contact (flush, slight inset into wall). */
const WALL_CONTACT = 0.5 - PANEL_HALF_DEPTH;

const BUDGETS: Record<RoomRole, RoomBudget> = {
  corridor: {
    panelChance: 260,
    conduitChance: 100,
    pipeRunChance: 380,
    tertiaryChance: 35,
    grateChance: 70,
    ribStride: 4,
    hero: 'ceilingStrip',
  },
  cafeteria: {
    panelChance: 480,
    conduitChance: 50,
    pipeRunChance: 120,
    tertiaryChance: 110,
    grateChance: 140,
    ribStride: 5,
    hero: 'ceilingStrip',
  },
  medbay: {
    panelChance: 620,
    conduitChance: 30,
    pipeRunChance: 60,
    tertiaryChance: 30,
    grateChance: 40,
    ribStride: 6,
    hero: 'panelBand',
  },
  'upper-engine': {
    panelChance: 300,
    conduitChance: 300,
    pipeRunChance: 520,
    tertiaryChance: 160,
    grateChance: 300,
    ribStride: 3,
    hero: 'gratePatch',
  },
  electrical: {
    panelChance: 240,
    conduitChance: 640,
    pipeRunChance: 680,
    tertiaryChance: 220,
    grateChance: 240,
    ribStride: 2,
    hero: 'conduitCluster',
  },
  storage: {
    panelChance: 320,
    conduitChance: 200,
    pipeRunChance: 360,
    tertiaryChance: 140,
    grateChance: 420,
    ribStride: 4,
    hero: 'gratePatch',
  },
  reactor: {
    panelChance: 220,
    conduitChance: 620,
    pipeRunChance: 660,
    tertiaryChance: 240,
    grateChance: 260,
    ribStride: 2,
    hero: 'conduitCluster',
  },
};

function isWalkable(tileMap: TileMap, tx: number, ty: number): boolean {
  const t = tileIndexAt(tileMap, tx, ty);
  return t === 'floor' || t === 'floorAlt' || t === 'doorFrame';
}

/** Deterministic 0..999 from tile/face/salt â€” not Math.random. */
function detailHash(tx: number, ty: number, salt: number): number {
  let h = (DETAIL_SEED ^ (tx * 73856093) ^ (ty * 19349663) ^ (salt * 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) % 1000;
}

function chance(tx: number, ty: number, salt: number, threshold: number): boolean {
  return detailHash(tx, ty, salt) < threshold;
}

function roomAt(tileMap: TileMap, tx: number, ty: number): MapRoom | undefined {
  for (const room of tileMap.rooms) {
    if (tx >= room.x0 && tx <= room.x1 && ty >= room.y0 && ty <= room.y1) return room;
  }
  return undefined;
}

function roleAt(tileMap: TileMap, tx: number, ty: number): RoomRole {
  const room = roomAt(tileMap, tx, ty);
  if (!room) return 'corridor';
  if (room.id === 'cafeteria') return 'cafeteria';
  if (room.id === 'medbay') return 'medbay';
  if (room.id === 'upper-engine') return 'upper-engine';
  if (room.id === 'electrical') return 'electrical';
  if (room.id === 'storage') return 'storage';
  if (room.id === 'reactor') return 'reactor';
  return 'corridor';
}

function collectPoiWorld(tileMap: TileMap): Array<{ x: number; z: number }> {
  const points: Array<{ x: number; z: number }> = [];
  const pois = getMapPois(tileMap.id);
  for (const station of pois.taskStations) {
    points.push({ x: pxToWorldX(station.position.x), z: pxToWorldZ(station.position.y) });
  }
  for (const panel of [pois.lightsPanel, pois.reactorPanelA, pois.reactorPanelB]) {
    points.push({ x: pxToWorldX(panel.position.x), z: pxToWorldZ(panel.position.y) });
  }
  for (const vent of pois.vents) {
    points.push({ x: pxToWorldX(vent.position.x), z: pxToWorldZ(vent.position.y) });
  }
  // Also clear doorFrame tiles themselves.
  for (let ty = 0; ty < tileMap.height; ty += 1) {
    for (let tx = 0; tx < tileMap.width; tx += 1) {
      if (tileIndexAt(tileMap, tx, ty) !== 'doorFrame') continue;
      points.push({ x: tx + 0.5, z: ty + 0.5 });
    }
  }
  return points;
}

function nearPoi(x: number, z: number, pois: Array<{ x: number; z: number }>): boolean {
  const r2 = POI_CLEAR_RADIUS * POI_CLEAR_RADIUS;
  for (const p of pois) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}

function wallContact(
  tx: number,
  ty: number,
  face: Face,
): {
  x: number;
  z: number;
  ry: number;
  alongX: boolean;
} {
  const cx = tx + 0.5;
  const cz = ty + 0.5;
  if (face === 'n') return { x: cx, z: cz - WALL_CONTACT, ry: 0, alongX: true };
  if (face === 's') return { x: cx, z: cz + WALL_CONTACT, ry: 0, alongX: true };
  if (face === 'w') return { x: cx - WALL_CONTACT, z: cz, ry: Math.PI / 2, alongX: false };
  return { x: cx + WALL_CONTACT, z: cz, ry: Math.PI / 2, alongX: false };
}

function extractSlots(
  tileMap: TileMap,
  pois: Array<{ x: number; z: number }>,
): { walls: WallSlot[]; floors: FloorSlot[]; ceilings: CeilingCell[] } {
  const walls: WallSlot[] = [];
  const floors: FloorSlot[] = [];
  const ceilings: CeilingCell[] = [];

  const faces: Array<{ face: Face; dx: number; dy: number }> = [
    { face: 'n', dx: 0, dy: -1 },
    { face: 's', dx: 0, dy: 1 },
    { face: 'w', dx: -1, dy: 0 },
    { face: 'e', dx: 1, dy: 0 },
  ];

  for (let ty = 0; ty < tileMap.height; ty += 1) {
    for (let tx = 0; tx < tileMap.width; tx += 1) {
      if (!isWalkable(tileMap, tx, ty)) continue;
      const kind = tileIndexAt(tileMap, tx, ty)!;
      const role = roleAt(tileMap, tx, ty);
      const x = tx + 0.5;
      const z = ty + 0.5;
      const blocked = kind === 'doorFrame' || nearPoi(x, z, pois);

      let wallEdges = 0;
      let nearWall = false;
      for (const { face, dx, dy } of faces) {
        if (!isSolidAtTile(tileMap, tx + dx, ty + dy)) continue;
        wallEdges += 1;
        nearWall = true;
        const contact = wallContact(tx, ty, face);
        walls.push({
          tx,
          ty,
          face,
          x: contact.x,
          z: contact.z,
          ry: contact.ry,
          alongX: contact.alongX,
          role,
          blocked: blocked || nearPoi(contact.x, contact.z, pois),
        });
      }

      floors.push({
        tx,
        ty,
        x,
        z,
        role,
        kind: kind === 'floorAlt' ? 'floorAlt' : kind === 'doorFrame' ? 'doorFrame' : 'floor',
        wallEdges,
        blocked,
      });

      ceilings.push({ tx, ty, x, z, role, nearWall, blocked });
    }
  }

  return { walls, floors, ceilings };
}

/**
 * Merge consecutive ceiling cells into axis-aligned runs for continuous pipes/ribs.
 * `axis` 'x' = run eastâ€“west (vary tx, fixed ty); 'z' = northâ€“south.
 */
function buildRuns(
  cells: CeilingCell[],
  axis: 'x' | 'z',
  predicate: (c: CeilingCell) => boolean,
): Array<{ x0: number; z0: number; length: number; role: RoomRole }> {
  const byKey = new Map<string, CeilingCell>();
  for (const c of cells) {
    if (!predicate(c)) continue;
    byKey.set(`${c.tx},${c.ty}`, c);
  }

  const visited = new Set<string>();
  const runs: Array<{ x0: number; z0: number; length: number; role: RoomRole }> = [];

  const keys = [...byKey.keys()].sort();
  for (const key of keys) {
    if (visited.has(key)) continue;
    const start = byKey.get(key)!;
    let tx = start.tx;
    let ty = start.ty;

    // Walk backward to run start.
    if (axis === 'x') {
      while (byKey.has(`${tx - 1},${ty}`) && !visited.has(`${tx - 1},${ty}`)) tx -= 1;
    } else {
      while (byKey.has(`${tx},${ty - 1}`) && !visited.has(`${tx},${ty - 1}`)) ty -= 1;
    }

    let length = 0;
    let role = start.role;
    const x0 = tx + 0.5;
    const z0 = ty + 0.5;
    for (;;) {
      const k = `${tx},${ty}`;
      const cell = byKey.get(k);
      if (!cell || visited.has(k)) break;
      visited.add(k);
      length += 1;
      if (cell.role !== 'corridor') role = cell.role;
      if (axis === 'x') tx += 1;
      else ty += 1;
    }
    if (length > 0) runs.push({ x0, z0, length, role });
  }
  return runs;
}

function addInstances(
  root: Group,
  geo: BufferGeometry,
  material: Material,
  poses: Pose[],
  castShadow = true,
): void {
  if (poses.length === 0) return;
  const mesh = new InstancedMesh(geo, material, poses.length);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  const dummy = new Object3D();
  for (let i = 0; i < poses.length; i += 1) {
    const p = poses[i]!;
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0);
    dummy.scale.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);
}

/**
 * Anchored, budgeted kitbash: primary shell stays in stationMesh;
 * secondary systems (runs) + sparse tertiary clutter live here.
 */
export function addStationDetails(
  root: Group,
  tileMap: TileMap,
  materials: StationMaterials,
): StationDetailHandle {
  const pois = collectPoiWorld(tileMap);
  const { walls, floors, ceilings } = extractSlots(tileMap, pois);

  const ceilingPoses: Pose[] = [];
  const beamPoses: Pose[] = [];
  const ribPoses: Pose[] = [];
  const pipeRunPoses: Pose[] = [];
  const basePoses: Pose[] = [];
  const crownPoses: Pose[] = [];
  const panelPoses: Pose[] = [];
  const conduitPoses: Pose[] = [];
  const rivetPoses: Pose[] = [];
  const bracketPoses: Pose[] = [];
  const gratePoses: Pose[] = [];
  const hazardCorner: Pose[] = [];
  const heroPanelPoses: Pose[] = [];
  const heroStripPoses: Pose[] = [];

  // --- Pass 1: ceilings (underside planes only; sparse, not every-tile ribs) ---
  for (const c of ceilings) {
    ceilingPoses.push({ x: c.x, y: WALL_HEIGHT - 0.04, z: c.z });
  }

  // Ribs along corridor/room axes every ribStride tiles â€” continuous scaled boxes.
  const ribCandidates = ceilings.filter((c) => !c.blocked);
  for (const axis of ['x', 'z'] as const) {
    const runs = buildRuns(ribCandidates, axis, (c) => {
      const budget = BUDGETS[c.role];
      // Prefer near-wall or room-edge rhythm: corridor center gets fewer ribs.
      if (c.role === 'corridor' && !c.nearWall) {
        return chance(c.tx, c.ty, 11 + (axis === 'x' ? 1 : 2), 220);
      }
      return (axis === 'x' ? c.ty : c.tx) % budget.ribStride === 0;
    });
    for (const run of runs) {
      if (run.length < 2) continue;
      if (!chance(Math.floor(run.x0), Math.floor(run.z0), 21, 780)) continue;
      const midX = axis === 'x' ? run.x0 + (run.length - 1) * 0.5 : run.x0;
      const midZ = axis === 'z' ? run.z0 + (run.length - 1) * 0.5 : run.z0;
      if (axis === 'x') {
        ribPoses.push({
          x: midX,
          y: WALL_HEIGHT - 0.14,
          z: midZ,
          sx: run.length * 0.98,
          sy: 1,
          sz: 1,
        });
      } else {
        beamPoses.push({
          x: midX,
          y: WALL_HEIGHT - 0.14,
          z: midZ,
          sx: 1,
          sy: 1,
          sz: run.length * 0.98,
        });
      }
    }
  }

  // --- Pass 2: continuous ceiling pipe runs hugging walls ---
  const pipeCells = ceilings.filter((c) => !c.blocked && c.nearWall);
  for (const axis of ['x', 'z'] as const) {
    const runs = buildRuns(pipeCells, axis, () => true);
    for (const run of runs) {
      if (run.length < 2) continue;
      const budget = BUDGETS[run.role];
      if (!chance(Math.floor(run.x0), Math.floor(run.z0), 31, budget.pipeRunChance)) continue;

      const midX = axis === 'x' ? run.x0 + (run.length - 1) * 0.5 : run.x0;
      const midZ = axis === 'z' ? run.z0 + (run.length - 1) * 0.5 : run.z0;

      // Offset toward nearest wall: sample start cell neighbors.
      const stx = Math.floor(run.x0);
      const sty = Math.floor(run.z0);
      let ox = 0;
      let oz = 0;
      if (isSolidAtTile(tileMap, stx, sty - 1)) oz = -0.32;
      else if (isSolidAtTile(tileMap, stx, sty + 1)) oz = 0.32;
      else if (isSolidAtTile(tileMap, stx - 1, sty)) ox = -0.32;
      else if (isSolidAtTile(tileMap, stx + 1, sty)) ox = 0.32;
      else if (axis === 'x') oz = -0.28;
      else ox = -0.28;

      // Cylinder is Y-up; map local Y onto the run axis (X or Z).
      const rx = axis === 'z' ? Math.PI / 2 : 0;
      const rz = axis === 'x' ? Math.PI / 2 : 0;
      pipeRunPoses.push({
        x: midX + ox,
        y: WALL_HEIGHT - 0.3,
        z: midZ + oz,
        rx,
        rz,
        sx: 1,
        sy: run.length * 0.98,
        sz: 1,
      });

      // Rhythm break: secondary thinner pipe on dense roles.
      if (
        (run.role === 'electrical' || run.role === 'reactor' || run.role === 'upper-engine') &&
        run.length >= 3 &&
        chance(stx, sty, 33, 450)
      ) {
        pipeRunPoses.push({
          x: midX + ox * 0.55,
          y: WALL_HEIGHT - 0.42,
          z: midZ + oz * 0.55,
          rx,
          rz,
          sx: 0.65,
          sy: run.length * 0.9,
          sz: 0.65,
        });
      }
    }
  }

  // --- Pass 3: wall trim + panels (flush contact) with run gaps ---
  // Group wall slots by face-row for panel rhythm (panel â†’ blank â†’ conduit).
  const wallByLine = new Map<string, WallSlot[]>();
  for (const w of walls) {
    const lineKey = w.face === 'n' || w.face === 's' ? `${w.face}:y${w.ty}` : `${w.face}:x${w.tx}`;
    const list = wallByLine.get(lineKey) ?? [];
    list.push(w);
    wallByLine.set(lineKey, list);
  }

  for (const list of wallByLine.values()) {
    list.sort((a, b) => (a.alongX ? a.tx - b.tx : a.ty - b.ty));
    let streak = 0;
    for (const w of list) {
      if (w.blocked) {
        streak = 0;
        continue;
      }
      const budget = BUDGETS[w.role];

      // Architectural trim â€” always flush when wall present (secondary shell).
      basePoses.push({ x: w.x, y: 0.09, z: w.z, ry: w.ry });
      crownPoses.push({ x: w.x, y: WALL_HEIGHT - 0.1, z: w.z, ry: w.ry });

      streak += 1;
      // Forced gap every 4 panels to break wallpaper.
      if (streak % 4 === 0) {
        streak = 0;
        continue;
      }

      const pick = detailHash(w.tx, w.ty, 40 + w.face.charCodeAt(0));
      if (pick < budget.panelChance) {
        panelPoses.push({
          x: w.x,
          y: WALL_HEIGHT * 0.48,
          z: w.z,
          ry: w.ry,
          sx: 0.72,
          sy: 1.05,
          sz: 1,
        });
      } else if (pick < budget.panelChance + budget.conduitChance) {
        const ox = w.alongX ? 0.1 : 0;
        const oz = w.alongX ? 0 : 0.1;
        conduitPoses.push({
          x: w.x + ox,
          y: WALL_HEIGHT * 0.52,
          z: w.z + oz,
          sx: 1,
          sy: 1.55,
          sz: 1,
        });
        if (budget.conduitChance > 300 && chance(w.tx, w.ty, 44, 400)) {
          conduitPoses.push({
            x: w.x - ox * 0.4,
            y: WALL_HEIGHT * 0.58,
            z: w.z - oz * 0.4,
            sx: 0.7,
            sy: 1.35,
            sz: 0.7,
          });
        }
      }
    }
  }

  // --- Pass 4: tertiary (corners / wall-hug only; corridors nearly empty) ---
  for (const w of walls) {
    if (w.blocked) continue;
    const budget = BUDGETS[w.role];
    if (w.role === 'corridor' && budget.tertiaryChance < 50) continue;
    if (!chance(w.tx, w.ty, 50, budget.tertiaryChance)) continue;

    if (chance(w.tx, w.ty, 51, 550)) {
      rivetPoses.push({
        x: w.x,
        y: WALL_HEIGHT * 0.32,
        z: w.z,
        ry: w.ry,
        sx: 0.85,
        sy: 0.3,
        sz: 1,
      });
    } else {
      bracketPoses.push({ x: w.x, y: WALL_HEIGHT * 0.72, z: w.z, ry: w.ry });
    }
  }

  for (const f of floors) {
    if (f.blocked) continue;
    const budget = BUDGETS[f.role];

    const wantGrate =
      f.kind === 'floorAlt'
        ? chance(f.tx, f.ty, 60, Math.min(900, budget.grateChance + 400))
        : f.role !== 'corridor' && f.wallEdges >= 1 && chance(f.tx, f.ty, 61, budget.grateChance);

    if (wantGrate) {
      gratePoses.push({ x: f.x, y: 0.03, z: f.z });
    }

    // Hazard only in industrial rooms at true corners â€” never corridor carpet.
    if (
      (f.role === 'electrical' || f.role === 'reactor' || f.role === 'storage') &&
      f.wallEdges >= 2 &&
      chance(f.tx, f.ty, 62, 180)
    ) {
      hazardCorner.push({ x: f.x, y: 0.02, z: f.z, sx: 0.85, sy: 0.35, sz: 0.85 });
    }
  }

  // --- Pass 5: one hero accent per named room ---
  for (const room of tileMap.rooms) {
    const role = roleAt(tileMap, room.x0, room.y0);
    const budget = BUDGETS[role];
    const cx = (room.x0 + room.x1 + 1) / 2;
    const cz = (room.y0 + room.y1 + 1) / 2;

    if (budget.hero === 'ceilingStrip') {
      const spanX = Math.min(role === 'cafeteria' ? 7 : 4, room.x1 - room.x0 + 1);
      heroStripPoses.push({
        x: cx,
        y: WALL_HEIGHT - 0.08,
        z: cz,
        sx: spanX,
        sy: 1,
        sz: role === 'cafeteria' ? 0.75 : 0.55,
      });
    } else if (budget.hero === 'panelBand') {
      // Distinct mid-height band along the north wall of the room.
      for (let tx = room.x0; tx <= room.x1; tx += 1) {
        if (!isWalkable(tileMap, tx, room.y0)) continue;
        if (!isSolidAtTile(tileMap, tx, room.y0 - 1)) continue;
        const contact = wallContact(tx, room.y0, 'n');
        if (nearPoi(contact.x, contact.z, pois)) continue;
        heroPanelPoses.push({
          x: contact.x,
          y: WALL_HEIGHT * 0.62,
          z: contact.z,
          ry: contact.ry,
          sx: 0.9,
          sy: 0.55,
          sz: 1,
        });
      }
    } else if (budget.hero === 'conduitCluster') {
      // Cluster near room center against the nearest wall.
      const candidates = walls.filter(
        (w) =>
          !w.blocked &&
          w.role === role &&
          w.tx >= room.x0 &&
          w.tx <= room.x1 &&
          w.ty >= room.y0 &&
          w.ty <= room.y1,
      );
      candidates.sort((a, b) => {
        const da = (a.tx + 0.5 - cx) ** 2 + (a.ty + 0.5 - cz) ** 2;
        const db = (b.tx + 0.5 - cx) ** 2 + (b.ty + 0.5 - cz) ** 2;
        return da - db;
      });
      for (const w of candidates.slice(0, 3)) {
        conduitPoses.push({
          x: w.x,
          y: WALL_HEIGHT * 0.5,
          z: w.z,
          sx: 1.15,
          sy: 1.8,
          sz: 1.15,
        });
        conduitPoses.push({
          x: w.x + (w.alongX ? 0.14 : 0),
          y: WALL_HEIGHT * 0.55,
          z: w.z + (w.alongX ? 0 : 0.14),
          sx: 0.8,
          sy: 1.5,
          sz: 0.8,
        });
      }
    } else {
      // gratePatch â€” cluster near room center / south edge.
      let placed = 0;
      for (let ty = room.y1; ty >= room.y0 && placed < 5; ty -= 1) {
        for (let tx = room.x0; tx <= room.x1 && placed < 5; tx += 1) {
          if (!isWalkable(tileMap, tx, ty)) continue;
          const x = tx + 0.5;
          const z = ty + 0.5;
          if (nearPoi(x, z, pois)) continue;
          if ((tx + ty) % 2 !== 0) continue;
          gratePoses.push({ x, y: 0.03, z, sx: 1.05, sy: 1, sz: 1.05 });
          placed += 1;
        }
      }
    }
  }

  const ceilingGeo = new PlaneGeometry(1, 1);
  ceilingGeo.rotateX(Math.PI / 2);
  addInstances(root, ceilingGeo, materials.ceiling, ceilingPoses, false);
  // Beams (Nâ€“S runs) and ribs (Eâ€“W runs) share trim/pipe look but different geo axes.
  addInstances(root, new BoxGeometry(0.18, 0.12, 1), materials.trim, beamPoses, false);
  addInstances(root, new BoxGeometry(1, 0.12, 0.18), materials.trim, ribPoses, false);
  // Cylinder default height along Y; sy scales run length after rx/rz aim the axis.
  addInstances(root, new CylinderGeometry(0.05, 0.05, 1, 6), materials.pipe, pipeRunPoses, false);
  addInstances(root, new BoxGeometry(0.98, 0.18, 0.1), materials.trim, basePoses);
  addInstances(root, new BoxGeometry(0.98, 0.14, 0.1), materials.trim, crownPoses);
  addInstances(root, new BoxGeometry(0.88, 0.95, 0.07), materials.panel, panelPoses);
  addInstances(root, new BoxGeometry(0.88, 0.55, 0.08), materials.panel, heroPanelPoses);
  addInstances(root, new BoxGeometry(1, 0.06, 1), materials.trim, heroStripPoses, false);
  addInstances(root, new BoxGeometry(0.95, 0.08, 0.05), materials.trim, rivetPoses);
  addInstances(root, new CylinderGeometry(0.04, 0.04, 0.9, 6), materials.pipe, conduitPoses);
  addInstances(root, new BoxGeometry(0.18, 0.14, 0.14), materials.trim, bracketPoses);
  addInstances(root, new BoxGeometry(0.88, 0.07, 0.88), materials.grate, gratePoses, false);
  addInstances(root, new BoxGeometry(1, 0.05, 1), materials.hazard, hazardCorner, false);

  return placeRoomPurposeSets(root, tileMap, materials, walls);
}

function makeWoodTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#6e4a2e';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 1) {
    const shade = 20 + ((y * 17) % 30);
    ctx.strokeStyle = `rgb(${110 + shade},${70 + (shade >> 1)},${40})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(40, y + ((y % 7) - 3), 90, y - ((y % 5) - 2), 128, y);
    ctx.stroke();
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(1.5, 1.5);
  return tex;
}

function makeMetalTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#5a636e';
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 2) {
    ctx.fillStyle = i % 4 === 0 ? '#6a7380' : '#4a5360';
    ctx.fillRect(0, i, 64, 1);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

/**
 * Large set pieces from shared purposeLayout (same footprints as collision).
 */
function placeRoomPurposeSets(
  root: Group,
  tileMap: TileMap,
  materials: StationMaterials,
  walls: WallSlot[],
): StationDetailHandle {
  const clear = collectPoiClearWorld(tileMap.tileSize, tileMap.id);
  const { props } = buildPurposeLayout(tileMap, clear);

  const woodMap = makeWoodTexture();
  const metalMap = makeMetalTexture();

  const wood = new MeshStandardMaterial({
    map: woodMap,
    color: 0xffffff,
    metalness: 0.08,
    roughness: 0.82,
    envMapIntensity: 0,
  });
  const benchMat = new MeshStandardMaterial({
    map: woodMap,
    color: 0xb0a090,
    metalness: 0.1,
    roughness: 0.78,
    envMapIntensity: 0,
  });
  // Furniture / industrial kit uses canvas metal + wall/trim — not terminal chassis maps.
  const counterMat = new MeshStandardMaterial({
    map: metalMap,
    color: 0xc0c8d0,
    metalness: 0.55,
    roughness: 0.35,
    envMapIntensity: 0,
  });
  const medMat = materials.medBed;
  const medRailMat = materials.medFrame;
  const medBaseMat = new MeshStandardMaterial({
    map: metalMap,
    color: 0xb8c0c4,
    metalness: 0.5,
    roughness: 0.4,
    envMapIntensity: 0,
  });
  const crateMat = materials.propCrate;
  const palletMat = new MeshStandardMaterial({
    map: woodMap,
    color: 0x8a7a60,
    metalness: 0.1,
    roughness: 0.85,
    envMapIntensity: 0,
  });
  const turbineMat = new MeshStandardMaterial({
    map: metalMap,
    color: 0xd0d6dc,
    metalness: 0.78,
    roughness: 0.28,
    envMapIntensity: 0,
  });
  const finMat = new MeshStandardMaterial({
    map: metalMap,
    color: 0x9098a0,
    metalness: 0.7,
    roughness: 0.35,
    envMapIntensity: 0,
  });
  const breakerMat = new MeshStandardMaterial({
    map: metalMap,
    color: 0x808890,
    metalness: 0.6,
    roughness: 0.38,
    envMapIntensity: 0,
  });
  const warnMat = new MeshStandardMaterial({
    map: materials.hazard.map,
    color: 0xffffff,
    metalness: 0.35,
    roughness: 0.45,
    emissive: 0x801808,
    emissiveIntensity: 0.9,
    envMapIntensity: 0,
  });
  const coreMat = materials.reactorEnergy.clone();
  coreMat.emissiveIntensity = 2.4;
  const cageMat = materials.trim.clone();
  cageMat.color.setHex(0x687078);
  const signMat = new MeshStandardMaterial({
    color: 0x101820,
    metalness: 0.3,
    roughness: 0.45,
    emissive: 0x40e0c0,
    emissiveIntensity: 1.4,
    envMapIntensity: 0,
  });
  const glowMat = new MeshStandardMaterial({
    color: 0x40e0c8,
    metalness: 0.1,
    roughness: 0.4,
    emissive: 0x20a090,
    emissiveIntensity: 1.6,
    envMapIntensity: 0,
  });
  const monitorBezelMat = materials.panel;

  const tableTop: Pose[] = [];
  const tableLeg: Pose[] = [];
  const bench: Pose[] = [];
  const counter: Pose[] = [];
  const biobedBase: Pose[] = [];
  const biobedPad: Pose[] = [];
  const biobedHead: Pose[] = [];
  const biobedRail: Pose[] = [];
  const biobedGlow: Pose[] = [];
  const medMonitor: Pose[] = [];
  const medMonitorBezel: Pose[] = [];
  const ivPole: Pose[] = [];
  const exhaust: Pose[] = [];
  const engineHazard: Pose[] = [];
  const breaker: Pose[] = [];
  const fuseStrip: Pose[] = [];
  const crate: Pose[] = [];
  const pallet: Pose[] = [];
  const reactorCore: Pose[] = [];
  const reactorCage: Pose[] = [];
  const reactorRing: Pose[] = [];
  const reactorPillar: Pose[] = [];
  const reactorPillarBase: Pose[] = [];
  const reactorCable: Pose[] = [];
  const reactorHazard: Pose[] = [];
  const signPlate: Pose[] = [];
  const turbineRoots: Group[] = [];

  for (const p of props) {
    if (p.kind === 'table') {
      tableTop.push({ x: p.x, y: 0.72, z: p.z, sx: p.sx, sy: p.sy, sz: p.sz });
      for (const [ox, oz] of [
        [-0.55, -0.3],
        [0.55, -0.3],
        [-0.55, 0.3],
        [0.55, 0.3],
      ] as const) {
        tableLeg.push({ x: p.x + ox, y: 0.36, z: p.z + oz, sx: 0.1, sy: 0.72, sz: 0.1 });
      }
    } else if (p.kind === 'bench') {
      bench.push({ x: p.x, y: 0.38, z: p.z, sx: p.sx, sy: p.sy, sz: p.sz });
    } else if (p.kind === 'counter') {
      counter.push({ x: p.x, y: 0.55, z: p.z, sx: p.sx, sy: p.sy, sz: p.sz });
    } else if (p.kind === 'biobed') {
      const ry = p.ry ?? 0;
      const cos = Math.cos(ry);
      const sin = Math.sin(ry);
      const local = (lx: number, lz: number) => ({
        x: p.x + lx * cos - lz * sin,
        z: p.z + lx * sin + lz * cos,
      });
      biobedBase.push({ x: p.x, y: 0.28, z: p.z, sx: p.sx * 1.05, sy: 0.4, sz: p.sz * 1.02, ry });
      biobedPad.push({
        x: p.x,
        y: 0.5,
        z: p.z,
        sx: p.sx,
        sy: 1,
        sz: p.sz * 0.92,
        ry,
        rx: -Math.PI / 2,
      });
      const head = local(0, -p.sz * 0.42);
      biobedHead.push({
        x: head.x,
        y: 0.72,
        z: head.z,
        sx: p.sx * 0.95,
        sy: 0.55,
        sz: 0.12,
        ry,
      });
      const railL = local(-p.sx * 0.48, 0);
      const railR = local(p.sx * 0.48, 0);
      biobedRail.push({
        x: railL.x,
        y: 0.58,
        z: railL.z,
        sx: 0.06,
        sy: 0.28,
        sz: p.sz * 0.85,
        ry,
      });
      biobedRail.push({
        x: railR.x,
        y: 0.58,
        z: railR.z,
        sx: 0.06,
        sy: 0.28,
        sz: p.sz * 0.85,
        ry,
      });
      biobedGlow.push({ x: p.x, y: 0.12, z: p.z, sx: 0.7, sy: 0.06, sz: 1.35, ry });
      const iv = local(0.45, -0.55);
      ivPole.push({ x: iv.x, y: 0.85, z: iv.z, sx: 1, sy: 1.6, sz: 1 });
    } else if (p.kind === 'turbine') {
      const g = new Group();
      g.position.set(p.x, 0, p.z);
      const body = new Mesh(new CylinderGeometry(0.48, 0.55, 2.2, 14), turbineMat);
      body.position.y = 1.15;
      body.castShadow = true;
      g.add(body);
      const band = new Mesh(new CylinderGeometry(0.56, 0.56, 0.18, 14), warnMat);
      band.position.y = 1.05;
      g.add(band);
      const rotor = new Group();
      rotor.position.y = 1.4;
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * Math.PI * 2;
        const fin = new Mesh(new BoxGeometry(0.15, 1.4, 0.55), finMat);
        fin.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
        fin.rotation.y = a;
        fin.castShadow = true;
        rotor.add(fin);
      }
      g.add(rotor);
      g.userData.rotor = rotor;
      root.add(g);
      turbineRoots.push(g);
    } else if (p.kind === 'exhaust') {
      exhaust.push({
        x: p.x,
        y: 1.6,
        z: p.z,
        rz: Math.PI / 2,
        sx: p.sx,
        sy: p.sy,
        sz: p.sz,
      });
    } else if (p.kind === 'breaker') {
      const ry = p.ry ?? 0;
      breaker.push({ x: p.x, y: 0.95, z: p.z, sx: p.sx, sy: p.sy, sz: p.sz, ry });
      // Indicator strip on the room-facing face.
      fuseStrip.push({
        x: p.x + Math.sin(ry) * 0.18,
        y: 1.15,
        z: p.z + Math.cos(ry) * 0.18,
        sx: 0.65,
        sy: 0.12,
        sz: 0.08,
        ry,
      });
    } else if (p.kind === 'pallet') {
      pallet.push({ x: p.x, y: 0.05, z: p.z, sx: p.sx, sy: p.sy, sz: p.sz });
    } else if (p.kind === 'crate') {
      const stack = Math.max(1, Math.min(3, p.seed ?? 1));
      const boxH = p.sy;
      for (let i = 0; i < stack; i += 1) {
        const jitter = ((p.x * 13 + p.z * 7 + i * 3) % 5) * 0.02;
        crate.push({
          x: p.x + (i % 2 === 0 ? jitter : -jitter),
          y: 0.1 + boxH * 0.5 + i * (boxH + 0.02),
          z: p.z + (i % 2 === 0 ? -jitter : jitter),
          sx: p.sx * (1 - i * 0.04),
          sy: boxH,
          sz: p.sz * (1 - i * 0.03),
          ry: (i * 0.12 + jitter) * (i % 2 === 0 ? 1 : -1),
        });
      }
    } else if (p.kind === 'reactorCore') {
      reactorCore.push({
        x: p.x,
        y: 1.1,
        z: p.z,
        sx: p.sx * 0.75,
        sy: p.sy * 0.55,
        sz: p.sz * 0.75,
      });
      reactorCore.push({
        x: p.x,
        y: 1.85,
        z: p.z,
        sx: p.sx * 0.55,
        sy: p.sy * 0.4,
        sz: p.sz * 0.55,
      });
      reactorCage.push({
        x: p.x,
        y: 1.45,
        z: p.z,
        sx: p.sx * 1.2,
        sy: p.sy * 1.05,
        sz: p.sz * 1.2,
      });
      // Rings orbit outside the outer core shell (core sx ~1.15 → radius ~0.7).
      reactorRing.push({ x: p.x, y: 0.45, z: p.z, rx: Math.PI / 2, sx: 1.35, sy: 1.35, sz: 1 });
      reactorRing.push({ x: p.x, y: 1.45, z: p.z, rx: Math.PI / 2, sx: 1.25, sy: 1.25, sz: 1 });
      reactorRing.push({ x: p.x, y: 2.45, z: p.z, rx: Math.PI / 2, sx: 1.1, sy: 1.1, sz: 1 });
      for (let ty = 0; ty < tileMap.height; ty += 1) {
        for (let tx = 0; tx < tileMap.width; tx += 1) {
          const dist = Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.z);
          if (dist < 1.5 || dist > 2.8) continue;
          if (!isWalkable(tileMap, tx, ty)) continue;
          reactorHazard.push({
            x: tx + 0.5,
            y: 0.025,
            z: ty + 0.5,
            sx: 0.95,
            sy: 0.3,
            sz: 0.95,
          });
        }
      }
    } else if (p.kind === 'reactorPillar') {
      reactorPillar.push({
        x: p.x,
        y: 1.5,
        z: p.z,
        sx: p.sx * 1.1,
        sy: p.sy * 1.1,
        sz: p.sz * 1.1,
      });
      reactorPillarBase.push({ x: p.x, y: 0.14, z: p.z, sx: 0.85, sy: 0.22, sz: 0.85 });
      reactorPillarBase.push({ x: p.x, y: 2.75, z: p.z, sx: 0.65, sy: 0.16, sz: 0.65 });
      // Vertical conduit on the pillar only — no horizontal rods into the core.
      reactorCable.push({
        x: p.x + 0.18,
        y: 1.5,
        z: p.z,
        sx: 0.08,
        sy: 2.4,
        sz: 0.08,
      });
    }
  }

  // Med monitors + role placards (visual only — no collision).
  for (const w of walls) {
    if (w.blocked) continue;
    if (w.role === 'medbay' && chance(w.tx, w.ty, 70, 420)) {
      medMonitorBezel.push({
        x: w.x,
        y: WALL_HEIGHT * 0.58,
        z: w.z,
        ry: w.ry,
        sx: 0.78,
        sy: 0.58,
        sz: 1,
      });
      medMonitor.push({
        x: w.x,
        y: WALL_HEIGHT * 0.58,
        z: w.z,
        ry: w.ry,
        sx: 0.62,
        sy: 0.42,
        sz: 1.05,
      });
    }
    if (w.role === 'reactor' && chance(w.tx, w.ty, 90, 280)) {
      fuseStrip.push({
        x: w.x,
        y: WALL_HEIGHT * 0.7,
        z: w.z,
        ry: w.ry,
        sx: 0.5,
        sy: 0.18,
        sz: 0.08,
      });
    }
  }
  for (const room of tileMap.rooms) {
    const cx = (room.x0 + room.x1 + 1) / 2;
    const labelTx = Math.round(cx - 0.5);
    if (isWalkable(tileMap, labelTx, room.y0) && isSolidAtTile(tileMap, labelTx, room.y0 - 1)) {
      const contact = wallContact(labelTx, room.y0, 'n');
      signPlate.push({
        x: contact.x,
        y: WALL_HEIGHT * 0.88,
        z: contact.z,
        ry: contact.ry,
        sx: 1.4,
        sy: 0.35,
        sz: 1,
      });
    }
  }

  // Engine / electrical floor hazard paint (non-blocking).
  for (const room of tileMap.rooms) {
    if (room.id === 'upper-engine') {
      const midX = Math.floor((room.x0 + room.x1 + 1) / 2);
      for (let ty = room.y0 + 1; ty <= room.y1 - 1; ty += 1) {
        if (!isWalkable(tileMap, midX - 1, ty)) continue;
        engineHazard.push({
          x: midX - 0.5,
          y: 0.025,
          z: ty + 0.5,
          sx: 0.95,
          sy: 0.3,
          sz: 0.95,
        });
      }
    }
  }

  addInstances(root, new BoxGeometry(1, 1, 1), wood, tableTop);
  addInstances(root, new BoxGeometry(1, 1, 1), materials.trim, tableLeg);
  addInstances(root, new BoxGeometry(1, 1, 1), benchMat, bench);
  addInstances(root, new BoxGeometry(1, 1, 1), counterMat, counter);
  addInstances(root, new BoxGeometry(1, 1, 1), medBaseMat, biobedBase);
  addInstances(root, new PlaneGeometry(1, 1), medMat, biobedPad, false);
  addInstances(root, new BoxGeometry(1, 1, 1), medRailMat, biobedHead);
  addInstances(root, new BoxGeometry(1, 1, 1), medRailMat, biobedRail);
  addInstances(root, new BoxGeometry(1, 1, 1), glowMat, biobedGlow, false);
  addInstances(root, new BoxGeometry(0.95, 0.6, 0.1), monitorBezelMat, medMonitorBezel);
  addInstances(root, new BoxGeometry(0.9, 0.55, 0.06), materials.screenMed, medMonitor, false);
  addInstances(root, new CylinderGeometry(0.04, 0.04, 1, 8), materials.trim, ivPole);
  addInstances(root, new CylinderGeometry(0.18, 0.22, 1, 8), materials.pipe, exhaust);
  addInstances(root, new BoxGeometry(1, 0.05, 1), materials.hazard, engineHazard, false);
  addInstances(root, new BoxGeometry(1, 1, 1), breakerMat, breaker);
  addInstances(root, new BoxGeometry(1, 1, 1), glowMat, fuseStrip, false);
  addInstances(root, new BoxGeometry(1, 1, 1), crateMat, crate);
  addInstances(root, new BoxGeometry(1, 1, 1), palletMat, pallet);
  addInstances(root, new CylinderGeometry(0.5, 0.55, 1, 16), coreMat, reactorCore, false);
  addInstances(root, new CylinderGeometry(0.62, 0.66, 1, 12, 1, true), cageMat, reactorCage, false);
  addInstances(root, new TorusGeometry(1.45, 0.12, 8, 28), warnMat, reactorRing, false);
  addInstances(root, new BoxGeometry(1, 1, 1), materials.trim, reactorPillar);
  addInstances(root, new BoxGeometry(1, 1, 1), materials.panel, reactorPillarBase);
  addInstances(root, new CylinderGeometry(0.5, 0.5, 1, 8), materials.pipe, reactorCable);
  addInstances(root, new BoxGeometry(1, 0.05, 1), materials.hazard, reactorHazard, false);
  addInstances(root, new BoxGeometry(1, 1, 0.06), signMat, signPlate, false);

  return {
    update: (timeSec: number) => {
      const pulse = 0.55 + 0.45 * Math.sin(timeSec * 3.2);
      coreMat.emissiveIntensity = 1.8 + pulse * 2.2;
      warnMat.emissiveIntensity = 0.6 + pulse * 1.1;
      glowMat.emissiveIntensity = 1.2 + pulse * 1.0;
      signMat.emissiveIntensity = 1.0 + pulse * 0.8;
      for (const g of turbineRoots) {
        const rotor = g.userData.rotor as Group | undefined;
        if (rotor) rotor.rotation.y = timeSec * 2.8;
      }
    },
  };
}
