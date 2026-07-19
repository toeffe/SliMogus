import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { getMapPois } from '@game/mapPois';
import type { TaskMinigameId } from '@game/tasks';
import type { Role } from '@game/roles';
import { isSolidAtTile, worldToTile, type TileMap } from '@sim/tilemap';
import { PIXELS_PER_TILE, pxToWorldX, pxToWorldZ } from './worldScale';
import type { StationMaterials } from './materials';

export interface PoiMarkers {
  readonly root: Group;
  setLocalRole: (role: Role | undefined) => void;
  update: (timeSec: number) => void;
  dispose: () => void;
}

type ConsoleVariant = TaskMinigameId | 'lights' | 'reactor';

/** Wall-mounted industrial terminals (Dead Space–style). */
export function createPoiMarkers(tileMap: TileMap, materials: StationMaterials): PoiMarkers {
  const root = new Group();
  root.name = 'pois';
  const ventMeshes: Mesh[] = [];
  const mats: MeshStandardMaterial[] = [];
  const geos: Array<{ dispose: () => void }> = [];

  const trackMat = (m: MeshStandardMaterial) => {
    mats.push(m);
    return m;
  };
  const trackGeo = <T extends { dispose: () => void }>(g: T) => {
    geos.push(g);
    return g;
  };

  // Painted chassis is terminal-only — room kitbash uses other maps.
  const housing = trackMat(materials.terminalHousing.clone());
  housing.color.setHex(0x2a323c);
  const bezelMat = trackMat(materials.terminalHousing.clone());
  bezelMat.color.setHex(0x4a5560);
  const screenMat = materials.screenConsole;
  const medScreenMat = materials.screenMed;
  const powerScreenMat = materials.screenPower;
  const reactorScreenMat = materials.screenReactor;
  const conduitMat = trackMat(
    new MeshStandardMaterial({ color: 0x4a3a28, metalness: 0.85, roughness: 0.35 }),
  );
  const ledGreen = trackMat(
    new MeshStandardMaterial({
      color: 0x57e389,
      emissive: 0x2ecc71,
      emissiveIntensity: 1.15,
    }),
  );
  const ledAmber = trackMat(
    new MeshStandardMaterial({
      color: 0xe8c060,
      emissive: 0xc4a020,
      emissiveIntensity: 1.2,
    }),
  );
  const ledRed = trackMat(
    new MeshStandardMaterial({
      color: 0xe05050,
      emissive: 0xa01010,
      emissiveIntensity: 1.25,
    }),
  );
  const hazardStripeMat = trackMat(
    new MeshStandardMaterial({
      map: materials.hazard.map,
      color: 0xffffff,
      metalness: 0.4,
      roughness: 0.55,
      emissive: 0xc09000,
      emissiveIntensity: 0.55,
    }),
  );
  const powerLabelMat = trackMat(
    new MeshStandardMaterial({
      color: 0x102018,
      metalness: 0.2,
      roughness: 0.4,
      emissive: 0x40ffe0,
      emissiveIntensity: 1.6,
    }),
  );
  const ventMat = trackMat(
    new MeshStandardMaterial({ color: 0x1a1e24, metalness: 0.88, roughness: 0.28 }),
  );
  const portMat = trackMat(
    new MeshStandardMaterial({ color: 0xc04040, metalness: 0.45, roughness: 0.4 }),
  );

  const housingGeo = trackGeo(new BoxGeometry(0.7, 1.15, 0.28));
  const powerHousingGeo = trackGeo(new BoxGeometry(0.95, 1.45, 0.38));
  const screenGeo = trackGeo(new BoxGeometry(0.52, 0.38, 0.04));
  const powerScreenGeo = trackGeo(new BoxGeometry(0.72, 0.52, 0.05));
  const ledGeo = trackGeo(new BoxGeometry(0.45, 0.05, 0.03));
  const portGeo = trackGeo(new CylinderGeometry(0.04, 0.04, 0.1, 8));
  const conduitGeo = trackGeo(new CylinderGeometry(0.05, 0.05, 0.55, 8));
  const ventGeo = trackGeo(new CylinderGeometry(0.4, 0.4, 0.1, 14));
  const grateGeo = trackGeo(new BoxGeometry(0.55, 0.02, 0.07));

  const facingYaw = (px: number, py: number): number => {
    const tx = worldToTile(px, PIXELS_PER_TILE);
    const ty = worldToTile(py, PIXELS_PER_TILE);
    // Screen faces +local Z into the room; conduit/back is -local Z into the wall.
    const dirs: Array<{ dx: number; dy: number; yaw: number }> = [
      { dx: 0, dy: -1, yaw: 0 },
      { dx: 0, dy: 1, yaw: Math.PI },
      { dx: -1, dy: 0, yaw: Math.PI / 2 },
      { dx: 1, dy: 0, yaw: -Math.PI / 2 },
    ];
    for (const d of dirs) {
      if (isSolidAtTile(tileMap, tx + d.dx, ty + d.dy)) return d.yaw;
    }
    return 0;
  };

  const placeConsole = (px: number, py: number, variant: ConsoleVariant): void => {
    const group = new Group();
    const yaw = facingYaw(px, py);
    const tx = worldToTile(px, PIXELS_PER_TILE);
    const ty = worldToTile(py, PIXELS_PER_TILE);
    const wallN = isSolidAtTile(tileMap, tx, ty - 1);
    const wallS = isSolidAtTile(tileMap, tx, ty + 1);
    const wallW = isSolidAtTile(tileMap, tx - 1, ty);
    const wallE = isSolidAtTile(tileMap, tx + 1, ty);
    // Nudge housing toward the wall face (~35cm).
    let wx = pxToWorldX(px);
    let wz = pxToWorldZ(py);
    const snap = 0.35;
    if (wallN) wz -= snap;
    else if (wallS) wz += snap;
    else if (wallW) wx -= snap;
    else if (wallE) wx += snap;
    group.position.set(wx, 0, wz);
    group.rotation.y = yaw;

    if (variant === 'lights') {
      // Distinct POWER restore console — larger bezel, cyan screen, hazard plate.
      const body = new Mesh(powerHousingGeo, housing);
      body.position.set(0, 0.85, -0.06);
      body.castShadow = true;
      group.add(body);

      const bezel = new Mesh(trackGeo(new BoxGeometry(0.82, 0.68, 0.14)), bezelMat);
      bezel.position.set(0, 1.1, 0.16);
      bezel.rotation.x = -0.18;
      bezel.castShadow = true;
      group.add(bezel);

      const screen = new Mesh(powerScreenGeo, powerScreenMat);
      screen.position.set(0, 1.12, 0.24);
      screen.rotation.x = -0.18;
      group.add(screen);

      const hazardPlate = new Mesh(trackGeo(new BoxGeometry(0.88, 0.55, 0.08)), hazardStripeMat);
      hazardPlate.position.set(0, 0.42, 0.14);
      group.add(hazardPlate);
      for (let i = 0; i < 4; i += 1) {
        const stripe = new Mesh(trackGeo(new BoxGeometry(0.12, 0.52, 0.03)), ledAmber);
        stripe.position.set(-0.3 + i * 0.2, 0.42, 0.19);
        stripe.rotation.z = 0.55;
        group.add(stripe);
      }

      const labelBar = new Mesh(trackGeo(new BoxGeometry(0.7, 0.14, 0.04)), powerLabelMat);
      labelBar.position.set(0, 1.48, 0.2);
      group.add(labelBar);
      // Floating glyph blocks spelling a readable POWER cue at console scale.
      const glyph = trackGeo(new BoxGeometry(0.1, 0.12, 0.03));
      for (let i = 0; i < 5; i += 1) {
        const ch = new Mesh(glyph, powerLabelMat);
        ch.position.set(-0.24 + i * 0.12, 1.62, 0.22);
        group.add(ch);
      }

      const conduit = new Mesh(conduitGeo, conduitMat);
      conduit.rotation.x = Math.PI / 2;
      conduit.position.set(0.28, 0.6, -0.32);
      group.add(conduit);

      root.add(group);
      return;
    }

    const body = new Mesh(housingGeo, housing);
    body.position.set(0, 0.7, -0.05);
    body.castShadow = true;
    group.add(body);

    const bezel = new Mesh(trackGeo(new BoxGeometry(0.58, 0.48, 0.1)), bezelMat);
    bezel.position.set(0, 0.95, 0.12);
    bezel.rotation.x = -0.2;
    bezel.castShadow = true;
    group.add(bezel);

    const screenMatForVariant =
      variant === 'reactor' ? reactorScreenMat : variant === 'download' ? medScreenMat : screenMat;
    const screen = new Mesh(screenGeo, screenMatForVariant);
    screen.position.set(0, 0.96, 0.18);
    screen.rotation.x = -0.2;
    group.add(screen);

    const led = variant === 'reactor' ? ledRed : variant === 'gauge' ? ledAmber : ledGreen;
    const strip = new Mesh(ledGeo, led);
    strip.position.set(0, 1.22, 0.14);
    strip.rotation.x = -0.2;
    group.add(strip);

    // Cable conduit into the wall behind.
    const conduit = new Mesh(conduitGeo, conduitMat);
    conduit.rotation.x = Math.PI / 2;
    conduit.position.set(0.22, 0.55, -0.28);
    group.add(conduit);

    if (variant === 'wires') {
      for (let i = 0; i < 3; i += 1) {
        const port = new Mesh(portGeo, portMat);
        port.rotation.x = Math.PI / 2;
        port.position.set(-0.16 + i * 0.16, 0.42, 0.12);
        group.add(port);
      }
    }

    root.add(group);
  };

  const mapPois = getMapPois(tileMap.id);
  for (const station of mapPois.taskStations) {
    placeConsole(station.position.x, station.position.y, station.minigame);
  }
  placeConsole(mapPois.lightsPanel.position.x, mapPois.lightsPanel.position.y, 'lights');
  placeConsole(mapPois.reactorPanelA.position.x, mapPois.reactorPanelA.position.y, 'reactor');
  placeConsole(mapPois.reactorPanelB.position.x, mapPois.reactorPanelB.position.y, 'reactor');

  for (const vent of mapPois.vents) {
    const group = new Group();
    group.position.set(pxToWorldX(vent.position.x), 0, pxToWorldZ(vent.position.y));
    const mesh = new Mesh(ventGeo, ventMat);
    mesh.position.y = 0.05;
    mesh.visible = false;
    ventMeshes.push(mesh);
    group.add(mesh);
    for (let i = -1; i <= 1; i += 1) {
      const grate = new Mesh(grateGeo, bezelMat);
      grate.position.set(0, 0.11, i * 0.12);
      grate.visible = false;
      ventMeshes.push(grate);
      group.add(grate);
    }
    root.add(group);
  }

  return {
    root,
    setLocalRole: (role) => {
      const show = role === 'impostor';
      for (const mesh of ventMeshes) mesh.visible = show;
    },
    update: (timeSec) => {
      const pulse = 0.55 + 0.45 * Math.sin(timeSec * 4.0);
      powerScreenMat.emissiveIntensity = 1.6 + pulse * 1.4;
      powerLabelMat.emissiveIntensity = 1.0 + pulse * 1.0;
      hazardStripeMat.emissiveIntensity = 0.35 + pulse * 0.45;
      ledRed.emissiveIntensity = 0.9 + pulse * 0.6;
    },
    dispose: () => {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
