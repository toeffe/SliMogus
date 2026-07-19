import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';
import { isSolidAtTile, tileIndexAt, type TileMap } from '@sim/tilemap';
import { WALL_HEIGHT } from './worldScale';
import type { StationMaterials } from './materials';
import { addStationDetails } from './stationDetail';

/** Walk-through axis: 'x' = E-W passage, 'z' = N-S passage. */
interface DoorOpening {
  axis: 'x' | 'z';
  /** Inclusive tile bounds of the opening aperture. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * Procedural Dead Space-style station: walls, bulkhead portals, kitbash detail.
 */
export function buildStationMesh(tileMap: TileMap, materials: StationMaterials): Group {
  const root = new Group();
  root.name = 'station';

  const floorGeo = new PlaneGeometry(1, 1);
  floorGeo.rotateX(-Math.PI / 2);
  const wallGeo = new BoxGeometry(1, WALL_HEIGHT, 1);
  const hullGeo = new BoxGeometry(1.12, WALL_HEIGHT * 1.08, 1.12);
  const windowGeo = new BoxGeometry(0.55, 0.28, 0.06);

  const floors: Array<{ x: number; z: number }> = [];
  const floorAlts: Array<{ x: number; z: number }> = [];
  const walls: Array<{ x: number; z: number }> = [];
  const hulls: Array<{ x: number; z: number }> = [];

  for (let ty = 0; ty < tileMap.height; ty += 1) {
    for (let tx = 0; tx < tileMap.width; tx += 1) {
      const kind = tileMap.tiles[ty * tileMap.width + tx] ?? 'wall';
      const x = tx + 0.5;
      const z = ty + 0.5;

      if (kind === 'floor' || kind === 'doorFrame') {
        floors.push({ x, z });
        continue;
      }
      if (kind === 'floorAlt') {
        floorAlts.push({ x, z });
        continue;
      }

      if (isExteriorHullWall(tileMap, tx, ty)) {
        hulls.push({ x, z });
        if ((tx + ty) % 5 === 0) {
          const win = new Mesh(windowGeo, materials.hullWindow);
          const outward = outwardNormal(tileMap, tx, ty);
          win.position.set(x + outward.dx * 0.56, WALL_HEIGHT * 0.55, z + outward.dz * 0.56);
          if (outward.dx !== 0) win.rotation.y = Math.PI / 2;
          root.add(win);
        }
      } else {
        walls.push({ x, z });
      }
    }
  }

  root.add(makeFloorInstances(floorGeo, materials.floor, floors));
  root.add(makeFloorInstances(floorGeo, materials.floorAlt, floorAlts));
  root.add(makeWallInstances(wallGeo, materials.wall, walls));
  root.add(makeWallInstances(hullGeo, materials.hull, hulls));

  const openings = findBulkheadOpenings(tileMap);
  for (const opening of openings) {
    addBulkhead(root, opening, materials);
  }

  const details = addStationDetails(root, tileMap, materials);
  root.userData.stationDetails = details;
  return root;
}

function makeFloorInstances(
  geo: PlaneGeometry,
  material: StationMaterials['floor'],
  cells: Array<{ x: number; z: number }>,
): InstancedMesh {
  const mesh = new InstancedMesh(geo, material, Math.max(cells.length, 1));
  mesh.receiveShadow = true;
  const dummy = new Object3D();
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i]!;
    dummy.position.set(cell.x, 0, cell.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.count = cells.length;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function makeWallInstances(
  geo: BoxGeometry,
  material: StationMaterials['wall'],
  cells: Array<{ x: number; z: number }>,
): InstancedMesh {
  const mesh = new InstancedMesh(geo, material, Math.max(cells.length, 1));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const dummy = new Object3D();
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i]!;
    dummy.position.set(cell.x, WALL_HEIGHT / 2, cell.z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.count = cells.length;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function isWalkable(tileMap: TileMap, tx: number, ty: number): boolean {
  const t = tileIndexAt(tileMap, tx, ty);
  return t === 'floor' || t === 'floorAlt' || t === 'doorFrame';
}

function isDoorStamp(tileMap: TileMap, tx: number, ty: number): boolean {
  return tileIndexAt(tileMap, tx, ty) === 'doorFrame';
}

function hasWalkableNeighbor(tileMap: TileMap, tx: number, ty: number): boolean {
  return (
    isWalkable(tileMap, tx - 1, ty) ||
    isWalkable(tileMap, tx + 1, ty) ||
    isWalkable(tileMap, tx, ty - 1) ||
    isWalkable(tileMap, tx, ty + 1)
  );
}

function isExteriorHullWall(tileMap: TileMap, tx: number, ty: number): boolean {
  if (!hasWalkableNeighbor(tileMap, tx, ty)) return false;
  const dirs = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ] as const;
  for (const [dx, dy] of dirs) {
    if (isWalkable(tileMap, tx + dx, ty + dy)) {
      const ox = tx - dx;
      const oy = ty - dy;
      if (ox < 0 || oy < 0 || ox >= tileMap.width || oy >= tileMap.height) return true;
      const behind = tileIndexAt(tileMap, ox, oy);
      if (behind === 'wall' && !hasWalkableNeighbor(tileMap, ox, oy)) return true;
    }
  }
  return false;
}

function outwardNormal(tileMap: TileMap, tx: number, ty: number): { dx: number; dz: number } {
  if (isWalkable(tileMap, tx + 1, ty)) return { dx: -1, dz: 0 };
  if (isWalkable(tileMap, tx - 1, ty)) return { dx: 1, dz: 0 };
  if (isWalkable(tileMap, tx, ty + 1)) return { dx: 0, dz: -1 };
  if (isWalkable(tileMap, tx, ty - 1)) return { dx: 0, dz: 1 };
  return { dx: 0, dz: 1 };
}

/** True if this column has solid tiles immediately N and S of the opening span. */
function hasExactFlanksNS(tileMap: TileMap, tx: number, y0: number, y1: number): boolean {
  return isSolidAtTile(tileMap, tx, y0 - 1) && isSolidAtTile(tileMap, tx, y1 + 1);
}

function hasExactFlanksEW(tileMap: TileMap, ty: number, x0: number, x1: number): boolean {
  return isSolidAtTile(tileMap, x0 - 1, ty) && isSolidAtTile(tileMap, x1 + 1, ty);
}

/**
 * Resolve stamp column/row onto the wall-flanked channel so jambs sit in real walls.
 * Dedupes both corridor ends that resolve to the same channel plane.
 */
function findBulkheadOpenings(tileMap: TileMap): DoorOpening[] {
  const visited = new Set<string>();
  const dedupe = new Set<string>();
  const openings: DoorOpening[] = [];
  const key = (tx: number, ty: number) => `${tx},${ty}`;

  for (let ty = 0; ty < tileMap.height; ty += 1) {
    for (let tx = 0; tx < tileMap.width; tx += 1) {
      if (!isDoorStamp(tileMap, tx, ty) || visited.has(key(tx, ty))) continue;

      let x1 = tx;
      while (isDoorStamp(tileMap, x1 + 1, ty)) x1 += 1;
      let y1 = ty;
      while (isDoorStamp(tileMap, tx, y1 + 1)) y1 += 1;

      const spanX = x1 - tx + 1;
      const spanY = y1 - ty + 1;

      if (spanY >= spanX) {
        for (let y = ty; y <= y1; y += 1) visited.add(key(tx, y));
        // Prefer a nearby column that actually has N+S solid wall tiles.
        let anchorX = -1;
        for (const cand of [tx, tx + 1, tx - 1, tx + 2, tx - 2]) {
          if (hasExactFlanksNS(tileMap, cand, ty, y1)) {
            anchorX = cand;
            break;
          }
        }
        if (anchorX < 0) continue;
        const dk = `x:${anchorX}:${ty}:${y1}`;
        if (dedupe.has(dk)) continue;
        dedupe.add(dk);
        openings.push({ axis: 'x', x0: anchorX, x1: anchorX, z0: ty, z1: y1 });
      } else {
        for (let x = tx; x <= x1; x += 1) visited.add(key(x, ty));
        let anchorY = -1;
        for (const cand of [ty, ty + 1, ty - 1, ty + 2, ty - 2]) {
          if (hasExactFlanksEW(tileMap, cand, tx, x1)) {
            anchorY = cand;
            break;
          }
        }
        if (anchorY < 0) continue;
        const dk = `z:${tx}:${x1}:${anchorY}`;
        if (dedupe.has(dk)) continue;
        dedupe.add(dk);
        openings.push({ axis: 'z', x0: tx, x1: x1, z0: anchorY, z1: anchorY });
      }
    }
  }

  return openings;
}

/** Slight depth bias so bulkhead faces win cleanly over adjacent wall tiles. */
function bulkheadMat(
  source: MeshStandardMaterial,
  factor: number,
  units: number,
): MeshStandardMaterial {
  const mat = source.clone();
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = factor;
  mat.polygonOffsetUnits = units;
  return mat;
}

/**
 * Heavy bulkhead collar + sliding airlock leaves (cosmetic; doorFrame stays walkable).
 */
function addBulkhead(root: Group, opening: DoorOpening, materials: StationMaterials): void {
  const depth = 1.34;
  const jambW = 0.32;
  const headerH = 0.48;
  const bite = 0.06;
  const hazardH = 0.36;
  const leafOpen = 0.95;
  const group = new Group();
  group.name = 'bulkhead';

  const frameMat = bulkheadMat(materials.doorFrame, -1, -2);
  const trimMat = bulkheadMat(materials.trim, -1, -1);
  const hazardMat = bulkheadMat(materials.hazard, -2, -4);
  const statusMat = bulkheadMat(materials.emissiveCyan, -2, -3);
  const leafMat = bulkheadMat(materials.doorFrame, -1, -3);
  const leafHazardMat = bulkheadMat(materials.hazard, -2, -5);

  /** Keep hazard chevrons at ~45° on the lintel face (UV 0..1 maps to faceW × faceH). */
  const applyHazardUv = (mat: MeshStandardMaterial, faceW: number, faceH: number): void => {
    if (!mat.map) return;
    mat.map = mat.map.clone();
    const rv = 2;
    mat.map.repeat.set(rv * (faceW / Math.max(faceH, 0.01)), rv);
    mat.map.needsUpdate = true;
  };

  if (opening.axis === 'x') {
    const zMin = opening.z0;
    const zMax = opening.z1 + 1;
    const spanZ = zMax - zMin;
    const cx = opening.x0 + 0.5;
    const cz = (zMin + zMax) / 2;
    const northJambZ = zMin + jambW / 2 - bite;
    const southJambZ = zMax - jambW / 2 + bite;
    const apertureSpan = Math.max(0.4, spanZ - jambW);
    const leafSpan = apertureSpan * 0.5;
    applyHazardUv(hazardMat, apertureSpan, hazardH);

    for (const z of [northJambZ, southJambZ]) {
      const jamb = new Mesh(new BoxGeometry(depth, WALL_HEIGHT, jambW), frameMat);
      jamb.position.set(cx, WALL_HEIGHT / 2, z);
      jamb.castShadow = true;
      jamb.renderOrder = 1;
      group.add(jamb);
    }
    for (const z of [zMin - 0.12, zMax + 0.12]) {
      const plate = new Mesh(new BoxGeometry(depth * 0.92, WALL_HEIGHT * 0.88, 0.14), trimMat);
      plate.position.set(cx, WALL_HEIGHT * 0.45, z);
      plate.renderOrder = 1;
      group.add(plate);
    }
    const header = new Mesh(new BoxGeometry(depth, headerH, spanZ - jambW * 0.5), frameMat);
    header.position.set(cx, WALL_HEIGHT - headerH / 2, cz);
    header.castShadow = true;
    header.renderOrder = 1;
    group.add(header);

    const hazard = new Mesh(new BoxGeometry(depth + 0.06, hazardH, apertureSpan), hazardMat);
    hazard.position.set(cx, WALL_HEIGHT - hazardH / 2 - 0.02, cz);
    hazard.renderOrder = 2;
    group.add(hazard);

    const status = new Mesh(
      new BoxGeometry(depth * 0.42, 0.07, Math.max(0.45, spanZ * 0.5)),
      statusMat,
    );
    status.position.set(cx, WALL_HEIGHT - headerH - 0.08, cz);
    status.renderOrder = 2;
    group.add(status);

    const leafH = WALL_HEIGHT - headerH - 0.08;
    const leafA = new Group();
    const leafB = new Group();
    const panelA = new Mesh(new BoxGeometry(0.12, leafH, leafSpan), leafMat);
    panelA.position.set(0, leafH / 2, 0);
    panelA.castShadow = true;
    leafA.add(panelA);
    const stripeA = new Mesh(new BoxGeometry(0.14, leafH * 0.85, 0.08), leafHazardMat);
    stripeA.position.set(0.01, leafH / 2, leafSpan * 0.35);
    leafA.add(stripeA);
    const panelB = new Mesh(new BoxGeometry(0.12, leafH, leafSpan), leafMat);
    panelB.position.set(0, leafH / 2, 0);
    panelB.castShadow = true;
    leafB.add(panelB);
    const stripeB = new Mesh(new BoxGeometry(0.14, leafH * 0.85, 0.08), leafHazardMat);
    stripeB.position.set(0.01, leafH / 2, -leafSpan * 0.35);
    leafB.add(stripeB);
    leafA.position.set(cx, 0.04, cz - leafSpan / 2);
    leafB.position.set(cx, 0.04, cz + leafSpan / 2);
    group.add(leafA, leafB);

    group.userData.airlock = {
      axis: 'x',
      centerX: cx,
      centerZ: cz,
      closedA: cz - leafSpan / 2,
      closedB: cz + leafSpan / 2,
      openA: cz - leafSpan / 2 - leafOpen,
      openB: cz + leafSpan / 2 + leafOpen,
      /** Full aperture along Z — used for nametag / flare occlusion when shut. */
      blockMin: cz - leafSpan,
      blockMax: cz + leafSpan,
      leafA,
      leafB,
      open: 0,
    };
  } else {
    const xMin = opening.x0;
    const xMax = opening.x1 + 1;
    const spanX = xMax - xMin;
    const cx = (xMin + xMax) / 2;
    const cz = opening.z0 + 0.5;
    const westJambX = xMin + jambW / 2 - bite;
    const eastJambX = xMax - jambW / 2 + bite;
    const apertureSpan = Math.max(0.4, spanX - jambW);
    const leafSpan = apertureSpan * 0.5;
    applyHazardUv(hazardMat, apertureSpan, hazardH);

    for (const x of [westJambX, eastJambX]) {
      const jamb = new Mesh(new BoxGeometry(jambW, WALL_HEIGHT, depth), frameMat);
      jamb.position.set(x, WALL_HEIGHT / 2, cz);
      jamb.castShadow = true;
      jamb.renderOrder = 1;
      group.add(jamb);
    }
    for (const x of [xMin - 0.12, xMax + 0.12]) {
      const plate = new Mesh(new BoxGeometry(0.14, WALL_HEIGHT * 0.88, depth * 0.92), trimMat);
      plate.position.set(x, WALL_HEIGHT * 0.45, cz);
      plate.renderOrder = 1;
      group.add(plate);
    }
    const header = new Mesh(new BoxGeometry(spanX - jambW * 0.5, headerH, depth), frameMat);
    header.position.set(cx, WALL_HEIGHT - headerH / 2, cz);
    header.castShadow = true;
    header.renderOrder = 1;
    group.add(header);

    const hazard = new Mesh(new BoxGeometry(apertureSpan, hazardH, depth + 0.06), hazardMat);
    hazard.position.set(cx, WALL_HEIGHT - hazardH / 2 - 0.02, cz);
    hazard.renderOrder = 2;
    group.add(hazard);

    const status = new Mesh(
      new BoxGeometry(Math.max(0.45, spanX * 0.5), 0.07, depth * 0.42),
      statusMat,
    );
    status.position.set(cx, WALL_HEIGHT - headerH - 0.08, cz);
    status.renderOrder = 2;
    group.add(status);

    const leafH = WALL_HEIGHT - headerH - 0.08;
    const leafA = new Group();
    const leafB = new Group();
    const panelA = new Mesh(new BoxGeometry(leafSpan, leafH, 0.12), leafMat);
    panelA.position.set(0, leafH / 2, 0);
    panelA.castShadow = true;
    leafA.add(panelA);
    const stripeA = new Mesh(new BoxGeometry(0.08, leafH * 0.85, 0.14), leafHazardMat);
    stripeA.position.set(leafSpan * 0.35, leafH / 2, 0.01);
    leafA.add(stripeA);
    const panelB = new Mesh(new BoxGeometry(leafSpan, leafH, 0.12), leafMat);
    panelB.position.set(0, leafH / 2, 0);
    panelB.castShadow = true;
    leafB.add(panelB);
    const stripeB = new Mesh(new BoxGeometry(0.08, leafH * 0.85, 0.14), leafHazardMat);
    stripeB.position.set(-leafSpan * 0.35, leafH / 2, 0.01);
    leafB.add(stripeB);
    leafA.position.set(cx - leafSpan / 2, 0.04, cz);
    leafB.position.set(cx + leafSpan / 2, 0.04, cz);
    group.add(leafA, leafB);

    group.userData.airlock = {
      axis: 'z',
      centerX: cx,
      centerZ: cz,
      closedA: cx - leafSpan / 2,
      closedB: cx + leafSpan / 2,
      openA: cx - leafSpan / 2 - leafOpen,
      openB: cx + leafSpan / 2 + leafOpen,
      /** Full aperture along X — used for nametag / flare occlusion when shut. */
      blockMin: cx - leafSpan,
      blockMax: cx + leafSpan,
      leafA,
      leafB,
      open: 0,
    };
  }

  root.add(group);
}
