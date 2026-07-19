import {
  AmbientLight,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  BoxGeometry,
  Scene,
} from 'three';
import { isSolidAtTile, type TileMap } from '@sim/tilemap';
import { WALL_HEIGHT } from './worldScale';

export interface StationLighting {
  setPowered: (on: boolean) => void;
  dispose: () => void;
}

/** Readable FPS halls; flashlight still carries dark corners. No bloom. */
export function setupLighting(scene: Scene, tileMap: TileMap): StationLighting {
  const hemi = new HemisphereLight(0x6a8498, 0x080c12, 0.75);
  scene.add(hemi);

  const key = new DirectionalLight(0xb8c8d8, 1.0);
  key.position.set(tileMap.width * 0.35, 22, tileMap.height * 0.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 70;
  key.shadow.camera.left = -30;
  key.shadow.camera.right = 30;
  key.shadow.camera.top = 30;
  key.shadow.camera.bottom = -30;
  key.shadow.bias = -0.0003;
  scene.add(key);

  const fill = new AmbientLight(0x3a4a58, 0.55);
  scene.add(fill);

  const stripRoot = new Group();
  stripRoot.name = 'ceilingLights';
  scene.add(stripRoot);

  const coolStripMat = new MeshStandardMaterial({
    color: 0xc0d4e8,
    emissive: 0x5080a0,
    emissiveIntensity: 1.2,
    metalness: 0.3,
    roughness: 0.4,
    envMapIntensity: 0,
  });
  const warmStripMat = new MeshStandardMaterial({
    color: 0xffe0b8,
    emissive: 0xc08040,
    emissiveIntensity: 1.1,
    metalness: 0.25,
    roughness: 0.45,
    envMapIntensity: 0,
  });
  const stripGeo = new BoxGeometry(1.6, 0.05, 0.18);
  const cafeStripGeo = new BoxGeometry(2.4, 0.05, 0.22);

  const practicals: PointLight[] = [];
  const stripMeshes: Mesh[] = [];
  const roomStripMats: MeshStandardMaterial[] = [];

  /** Practical tint from room role / minimap color. */
  const roomLightTint = (roomId: string, fallback: number): number => {
    switch (roomId) {
      case 'cafeteria':
        return 0xffd0a0; // warm cafe
      case 'medbay':
        return 0xa8e8e0; // cool clinical
      case 'upper-engine':
        return 0xffc090; // warm machinery
      case 'electrical':
        return 0xb8e060; // toxic green
      case 'storage':
        return 0xd0c0a0; // dusty warm
      case 'reactor':
        return 0xff7060; // deep red warning
      default:
        return fallback;
    }
  };

  for (const room of tileMap.rooms) {
    const cx = (room.x0 + room.x1 + 1) / 2;
    const cz = (room.y0 + room.y1 + 1) / 2;
    const tint = roomLightTint(room.id, 0xb8d0e8);
    const light = new PointLight(tint, room.id === 'cafeteria' ? 4.2 : 3.6, 18, 1.5);
    light.position.set(cx, WALL_HEIGHT - 0.25, cz);
    light.castShadow = false;
    scene.add(light);
    practicals.push(light);

    const stripMat = new MeshStandardMaterial({
      color: tint,
      emissive: tint,
      emissiveIntensity: 1.15,
      metalness: 0.28,
      roughness: 0.42,
      envMapIntensity: 0,
    });
    roomStripMats.push(stripMat);
    const geo = room.id === 'cafeteria' ? cafeStripGeo : stripGeo;
    const strip = new Mesh(geo, stripMat);
    strip.position.set(cx, WALL_HEIGHT - 0.1, cz);
    stripRoot.add(strip);
    stripMeshes.push(strip);
  }

  // Corridor / doorframe: emissive strips only. Dozens of PointLights forced
  // shader recompiles and multi-second freezes on match start.
  for (let ty = 2; ty < tileMap.height; ty += 5) {
    for (let tx = 2; tx < tileMap.width; tx += 5) {
      if (isSolidAtTile(tileMap, tx, ty)) continue;
      const inRoom = tileMap.rooms.some(
        (r) => tx >= r.x0 && tx <= r.x1 && ty >= r.y0 && ty <= r.y1,
      );
      if (inRoom) continue;
      const x = tx + 0.5;
      const z = ty + 0.5;
      const strip = new Mesh(stripGeo, coolStripMat);
      strip.position.set(x, WALL_HEIGHT - 0.12, z);
      strip.scale.set(0.65, 1, 0.65);
      stripRoot.add(strip);
      stripMeshes.push(strip);
    }
  }

  for (let ty = 1; ty < tileMap.height - 1; ty += 1) {
    for (let tx = 1; tx < tileMap.width - 1; tx += 1) {
      if (tileMap.tiles[ty * tileMap.width + tx] !== 'doorFrame') continue;
      if ((tx + ty * 3) % 4 !== 0) continue;
      const x = tx + 0.5;
      const z = ty + 0.5;
      const strip = new Mesh(stripGeo, warmStripMat);
      strip.position.set(x, WALL_HEIGHT - 0.08, z);
      strip.scale.set(0.5, 1, 0.7);
      stripRoot.add(strip);
      stripMeshes.push(strip);
    }
  }

  let powered = true;
  const applyPower = (): void => {
    for (const light of practicals) {
      light.intensity = powered ? light.userData.baseIntensity : 0.012;
      light.visible = powered;
    }
    coolStripMat.emissiveIntensity = powered ? 1.2 : 0.015;
    warmStripMat.emissiveIntensity = powered ? 1.1 : 0.015;
    for (const mat of roomStripMats) mat.emissiveIntensity = powered ? 1.15 : 0.015;
    for (const mesh of stripMeshes) mesh.visible = powered;
    key.intensity = powered ? 1.0 : 0.03;
    hemi.intensity = powered ? 0.75 : 0.03;
    fill.intensity = powered ? 0.55 : 0.02;
  };

  for (const light of practicals) {
    light.userData.baseIntensity = light.intensity;
  }

  return {
    setPowered: (on) => {
      powered = on;
      applyPower();
    },
    dispose: () => {
      scene.remove(hemi, key, fill, stripRoot, ...practicals);
      hemi.dispose();
      key.dispose();
      fill.dispose();
      stripGeo.dispose();
      cafeStripGeo.dispose();
      coolStripMat.dispose();
      warmStripMat.dispose();
      for (const mat of roomStripMats) mat.dispose();
      for (const p of practicals) p.dispose();
    },
  };
}
