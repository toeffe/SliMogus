import { BackSide, BoxGeometry, Mesh, MeshBasicMaterial, TextureLoader, type Scene } from 'three';

const FACE_ORDER = [
  'assets/env/px.png',
  'assets/env/nx.png',
  'assets/env/py.png',
  'assets/env/ny.png',
  'assets/env/pz.png',
  'assets/env/nz.png',
] as const;

/**
 * Visual starfield sky for hull windows.
 * No starfield IBL — metals only respond to scene lights (avoids specular fireflies).
 */
export async function applySpaceSkybox(scene: Scene): Promise<() => void> {
  scene.environment = null;

  const loader = new TextureLoader();
  const maps = await Promise.all(FACE_ORDER.map((path) => loader.loadAsync(path)));
  const materials = maps.map(
    (map) =>
      new MeshBasicMaterial({
        map,
        side: BackSide,
        fog: false,
        depthWrite: false,
      }),
  );
  const sky = new Mesh(new BoxGeometry(180, 180, 180), materials);
  sky.name = 'skybox';
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);
  scene.background = null;

  return () => {
    scene.remove(sky);
    sky.geometry.dispose();
    for (const mat of materials) {
      mat.map?.dispose();
      mat.dispose();
    }
    scene.environment = null;
  };
}
