import {
  AnimationMixer,
  Box3,
  Color,
  Group,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Material,
  type Object3D,
  type SkinnedMesh,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CHARACTER_ROSTER, DEFAULT_CHARACTER_ID, getCharacterDef } from './characterRoster';
import { attachHeldFlashlight, type FlashlightProp } from './flashlightProp';
import { PLAYER_HEIGHT } from './worldScale';

export interface PlayerMesh {
  readonly root: Group;
  readonly body: Mesh;
  setColor: (color: number) => void;
  setGhost: (ghost: boolean) => void;
  setFlashlightVisible: (visible: boolean) => void;
  /** World-space lens position + beam direction after the latest `update`. */
  getFlashlightWorldPose: (outPos: Vector3, outDir: Vector3) => boolean;
  update: (dtSec: number, speedPx: number) => void;
  dispose: () => void;
}

/** Clothing-ish material names across Quaternius Ultimate characters. */
const TINT_MATERIAL_NAMES = new Set([
  'Shirt',
  'Pants',
  'Dress',
  'LightJacket',
  'Jacket',
  'Suit',
  'Coat',
  'Robe',
  'Armor',
  'Clothes',
  'Clothing',
  'Skirt',
  'Top',
  'Bottom',
  'Uniform',
  'Outfit',
  'Main',
  'Black',
  'Grey',
  'Belt',
]);

interface VariantTemplate {
  scene: Object3D;
  clips: AnimationClip[];
}

const templates = new Map<string, VariantTemplate>();

function clipBySuffix(clips: AnimationClip[], suffix: string): AnimationClip | undefined {
  return clips.find((c) => c.name.endsWith(suffix) || c.name.includes(`|${suffix}`));
}

const _boundSize = new Vector3();
const _bonePos = new Vector3();

function isFiniteBox(box: Box3): boolean {
  return (
    Number.isFinite(box.min.x) &&
    Number.isFinite(box.min.y) &&
    Number.isFinite(box.min.z) &&
    Number.isFinite(box.max.x) &&
    Number.isFinite(box.max.y) &&
    Number.isFinite(box.max.z)
  );
}

/**
 * Quaternius ninja (and rare other packs) poison `Box3.setFromObject` with NaN
 * on one skinned part — that made `scale` NaN and the whole character vanish.
 */
function computeCharacterBounds(scene: Object3D): Box3 {
  scene.updateMatrixWorld(true);
  const whole = new Box3().setFromObject(scene);
  if (isFiniteBox(whole) && !whole.isEmpty()) return whole;

  const box = new Box3();
  scene.traverse((obj) => {
    const skinned = obj as SkinnedMesh;
    if (skinned.isSkinnedMesh) {
      const part = new Box3().setFromObject(skinned);
      if (isFiniteBox(part) && !part.isEmpty()) {
        box.union(part);
        return;
      }
      const skeleton = skinned.skeleton;
      if (!skeleton) return;
      for (const bone of skeleton.bones) {
        bone.getWorldPosition(_bonePos);
        if (
          Number.isFinite(_bonePos.x) &&
          Number.isFinite(_bonePos.y) &&
          Number.isFinite(_bonePos.z)
        ) {
          box.expandByPoint(_bonePos);
        }
      }
      return;
    }
    const mesh = obj as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    mesh.geometry.computeBoundingBox();
    const geo = mesh.geometry.boundingBox;
    if (!geo || geo.isEmpty() || !isFiniteBox(geo)) return;
    box.union(geo.clone().applyMatrix4(mesh.matrixWorld));
  });
  return box;
}

function normalizeTemplate(scene: Object3D): void {
  const box = computeCharacterBounds(scene);
  const size = box.getSize(_boundSize);
  const height = Number.isFinite(size.y) && size.y > 1e-4 ? size.y : 3.16;
  const scale = PLAYER_HEIGHT / height;
  if (!Number.isFinite(scale) || scale <= 0) return;
  scene.scale.setScalar(scale);
  const minY = Number.isFinite(box.min.y) ? box.min.y : 0;
  scene.position.y = -minY * scale;
}

/**
 * Preload character GLBs. Prefer passing the match roster so we don't parse
 * all 12 packs on every start (main-thread hitch).
 */
export async function preloadPlayerModel(characterIds?: readonly string[]): Promise<void> {
  const wanted = new Set(
    (characterIds?.length ? characterIds : CHARACTER_ROSTER.map((d) => d.id)).map(
      (id) => getCharacterDef(id).id,
    ),
  );
  wanted.add(DEFAULT_CHARACTER_ID);

  const missing = [...wanted].filter((id) => !templates.has(id));
  if (missing.length === 0) return;

  const loader = new GLTFLoader();
  // Parallel fetch + parse; yield between commits so the tab stays responsive.
  await Promise.all(
    missing.map(async (id) => {
      const def = getCharacterDef(id);
      const gltf = await loader.loadAsync(def.url);
      normalizeTemplate(gltf.scene);
      templates.set(def.id, { scene: gltf.scene, clips: gltf.animations });
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    }),
  );
}

function requireTemplate(characterId: string): VariantTemplate {
  const id = getCharacterDef(characterId).id;
  const template = templates.get(id) ?? templates.get(DEFAULT_CHARACTER_ID);
  if (!template) throw new Error('preloadPlayerModel() must finish first');
  return template;
}

function cloneMaterialsUnique(root: Object3D): Material[] {
  const cloned: Material[] = [];
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => {
        const c = m.clone();
        cloned.push(c);
        return c;
      });
    } else if (mesh.material) {
      mesh.material = mesh.material.clone();
      cloned.push(mesh.material);
    }
  });
  return cloned;
}

function findTintTargets(root: Object3D): MeshStandardMaterial[] {
  const targets: MeshStandardMaterial[] = [];
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!(mat instanceof MeshStandardMaterial)) continue;
      if (TINT_MATERIAL_NAMES.has(mat.name)) targets.push(mat);
    }
  });
  // Fallback: tint first non-skin/hair/eye material so lobby color still reads.
  if (targets.length === 0) {
    root.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!(mat instanceof MeshStandardMaterial)) continue;
        const n = mat.name.toLowerCase();
        if (/skin|hair|eye|brow|tooth|mouth|face/.test(n)) continue;
        targets.push(mat);
      }
    });
  }
  return targets;
}

function findPrimaryBody(root: Object3D): Mesh {
  let body: Mesh | null = null;
  root.traverse((obj) => {
    const mesh = obj as SkinnedMesh;
    if (mesh.isSkinnedMesh && !body) body = mesh;
  });
  if (!body) {
    root.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.isMesh && !body) body = mesh;
    });
  }
  if (!body) throw new Error('player mesh has no body');
  return body;
}

function applyLobbyTint(mats: MeshStandardMaterial[], colorHex: number): void {
  const lobby = new Color(colorHex);
  for (const mat of mats) {
    mat.color.copy(lobby).lerp(new Color(0xffffff), 0.25);
  }
}

type Locomotion = 'idle' | 'walk';

/**
 * Quaternius Ultimate crewmate. Character chosen in lobby via `characterId`.
 * Pack has Idle/Walk (no Run) — Walk plays faster when sprinting.
 */
export function createPlayerMesh(color: number, name: string, characterId: string): PlayerMesh {
  const template = requireTemplate(characterId);
  const root = new Group();
  root.name = name;

  const model = cloneSkinned(template.scene);
  root.add(model);

  // Skinned bind poses often have tiny/wrong bounds → one peer can vanish at some angles.
  model.traverse((obj) => {
    const skinned = obj as SkinnedMesh;
    if (skinned.isSkinnedMesh) skinned.frustumCulled = false;
  });

  const mats = cloneMaterialsUnique(model);
  const tintMats = findTintTargets(model);
  applyLobbyTint(tintMats, color);

  const body = findPrimaryBody(model);
  body.castShadow = true;

  const mixer = new AnimationMixer(model);
  const idleClip = clipBySuffix(template.clips, 'Idle') ?? template.clips[0];
  const walkClip = clipBySuffix(template.clips, 'Walk');

  const actions = new Map<Locomotion, AnimationAction>();
  if (idleClip) {
    const a = mixer.clipAction(idleClip);
    a.setLoop(LoopRepeat, Infinity);
    actions.set('idle', a);
  }
  if (walkClip) {
    const a = mixer.clipAction(walkClip);
    a.setLoop(LoopRepeat, Infinity);
    actions.set('walk', a);
  }

  let current: Locomotion | null = null;
  const fadeTo = (next: Locomotion, timeScale = 1): void => {
    const nextAction = actions.get(next) ?? actions.get('idle');
    if (!nextAction) return;
    nextAction.timeScale = timeScale;
    if (current === next) return;
    if (current) actions.get(current)?.fadeOut(0.2);
    nextAction.reset().setEffectiveTimeScale(timeScale).fadeIn(0.2).play();
    current = next;
  };
  fadeTo('idle');

  const flashlight: FlashlightProp = attachHeldFlashlight(root);
  const flashDir = new Vector3(0, 0, 1);

  return {
    root,
    body,
    setColor: (next) => {
      applyLobbyTint(tintMats, next);
    },
    setGhost: (ghost) => {
      for (const mat of mats) {
        mat.transparent = ghost;
        mat.opacity = ghost ? 0.35 : 1;
        mat.depthWrite = !ghost;
        mat.needsUpdate = true;
      }
      flashlight.root.visible = !ghost;
      flashlight.setLit(!ghost);
    },
    setFlashlightVisible: (visible) => {
      flashlight.root.visible = visible;
      flashlight.setLit(visible);
    },
    getFlashlightWorldPose: (outPos, outDir) => {
      if (!flashlight.root.visible) return false;
      flashlight.root.updateWorldMatrix(true, false);
      flashlight.root.getWorldPosition(outPos);
      flashDir.set(0, 0, 1).transformDirection(flashlight.root.matrixWorld);
      outDir.copy(flashDir);
      return true;
    },
    update: (dtSec, speedPx) => {
      const speed = Math.abs(speedPx);
      if (speed > 12) fadeTo('walk', speed > 90 ? 1.55 : 1);
      else fadeTo('idle', 1);
      mixer.update(dtSec);
      flashlight.syncPose?.();
    },
    dispose: () => {
      mixer.stopAllAction();
      flashlight.dispose();
      for (const mat of mats) mat.dispose();
    },
  };
}

/** Corpse: same character, Defeat/Death pose frozen on its side. */
export function createBodyMarker(color: number, characterId = DEFAULT_CHARACTER_ID): Object3D {
  const template = requireTemplate(characterId);
  const root = new Group();
  const model = cloneSkinned(template.scene);
  root.add(model);
  model.traverse((obj) => {
    const skinned = obj as SkinnedMesh;
    if (skinned.isSkinnedMesh) skinned.frustumCulled = false;
  });

  const mats = cloneMaterialsUnique(model);
  applyLobbyTint(findTintTargets(model), color);

  for (const mat of mats) {
    mat.transparent = true;
    mat.opacity = 0.85;
    mat.needsUpdate = true;
  }

  const mixer = new AnimationMixer(model);
  const deathClip =
    clipBySuffix(template.clips, 'Defeat') ??
    clipBySuffix(template.clips, 'Death') ??
    clipBySuffix(template.clips, 'Die');
  if (deathClip) {
    const action = mixer.clipAction(deathClip);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    mixer.update(deathClip.duration);
  }

  root.rotation.z = Math.PI / 2;
  root.position.y = 0.2;

  root.userData.dispose = () => {
    mixer.stopAllAction();
    for (const mat of mats) mat.dispose();
  };
  return root;
}
