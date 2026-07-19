import {
  CylinderGeometry,
  Euler,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';

export interface FlashlightProp {
  readonly root: Group;
  setLit: (on: boolean) => void;
  /** Keep grip in the hand bone while aiming along the character forward. */
  syncPose?: () => void;
  dispose: () => void;
}

export interface FlashlightPropOptions {
  /** Skip scene fog so an FPS viewmodel stays readable. */
  fog?: boolean;
  /** Slightly brighter body so the grip reads without an env map. */
  viewmodel?: boolean;
}

/**
 * Small procedural Maglite-style torch. Local +Z is the beam direction
 * (matches Quaternius forward after the scene yaw offset).
 */
export function createFlashlightProp(options: FlashlightPropOptions = {}): FlashlightProp {
  const root = new Group();
  root.name = 'flashlightProp';
  const fog = options.fog !== false;
  const viewmodel = options.viewmodel === true;

  const bodyMat = new MeshStandardMaterial({
    color: viewmodel ? 0x3a4550 : 0x2a3038,
    metalness: viewmodel ? 0.35 : 0.75,
    roughness: viewmodel ? 0.45 : 0.35,
    emissive: viewmodel ? 0x1a2430 : 0x000000,
    emissiveIntensity: viewmodel ? 0.35 : 0,
    envMapIntensity: 0,
    fog,
  });
  const ringMat = new MeshStandardMaterial({
    color: 0x6a7280,
    metalness: viewmodel ? 0.4 : 0.85,
    roughness: 0.35,
    emissive: viewmodel ? 0x222830 : 0x000000,
    emissiveIntensity: viewmodel ? 0.2 : 0,
    envMapIntensity: 0,
    fog,
  });
  const lensMat = new MeshStandardMaterial({
    color: 0xe8f4ff,
    emissive: 0xa0d0ff,
    emissiveIntensity: viewmodel ? 2.2 : 1.4,
    metalness: 0.1,
    roughness: 0.25,
    envMapIntensity: 0,
    fog,
  });

  // Handle along local Z (beam axis): grip behind, head/lens at +Z tip.
  const grip = new Mesh(new CylinderGeometry(0.028, 0.032, 0.22, 10), bodyMat);
  grip.rotation.x = Math.PI / 2;
  grip.position.z = -0.02;
  root.add(grip);

  const head = new Mesh(new CylinderGeometry(0.045, 0.038, 0.07, 12), ringMat);
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.12;
  root.add(head);

  const lens = new Mesh(new SphereGeometry(0.038, 12, 8), lensMat);
  lens.scale.set(1, 1, 0.45);
  lens.position.z = 0.16;
  root.add(lens);

  return {
    root,
    setLit: (on) => {
      lensMat.emissiveIntensity = on ? (viewmodel ? 2.2 : 1.4) : 0.05;
      lens.visible = true;
    },
    dispose: () => {
      grip.geometry.dispose();
      head.geometry.dispose();
      lens.geometry.dispose();
      bodyMat.dispose();
      ringMat.dispose();
      lensMat.dispose();
    },
  };
}

/**
 * GLTFLoader sanitizes `Fist.R` → `FistR`. Match both raw and sanitized names.
 */
export function findRightHandBone(root: Object3D): Object3D | null {
  const preferred = [
    'FistR',
    'Fist.R',
    'HandR',
    'Hand.R',
    'RightHand',
    'mixamorigRightHand',
    'mixamorig:RightHand',
  ];
  for (const name of preferred) {
    const hit = root.getObjectByName(name);
    if (hit) return hit;
  }

  let found: Object3D | null = null;
  root.traverse((obj) => {
    if (found) return;
    const n = obj.name.replace(/[\s_.]/g, '').toLowerCase();
    if (n === 'fistr' || n === 'handr' || n === 'righthand') found = obj;
  });
  return found;
}

/**
 * Third-person hold: parented to the right fist bone (scaled to meters),
 * re-aimed each frame along the character root forward.
 */
export function attachHeldFlashlight(characterRoot: Group): FlashlightProp {
  const prop = createFlashlightProp();
  const hand = findRightHandBone(characterRoot);

  if (!hand) {
    // Last resort: lower-right of torso (not shoulder).
    prop.root.position.set(0.22, 0.72, 0.2);
    prop.root.rotation.x = -0.15;
    characterRoot.add(prop.root);
    return prop;
  }

  const mount = new Group();
  mount.name = 'flashlightMount';
  hand.add(mount);
  mount.add(prop.root);

  // Grip in the palm (meters after inverse bone scale).
  prop.root.position.set(0.02, 0.04, 0.05);

  const parentWorldQuat = new Quaternion();
  const desiredWorldQuat = new Quaternion();
  const tilt = new Quaternion().setFromEuler(new Euler(-0.35, 0.2, 0.15));
  const worldScale = new Vector3();

  const syncPose = (): void => {
    const parent = mount.parent;
    if (!parent) return;
    parent.updateWorldMatrix(true, false);
    parent.getWorldScale(worldScale);
    const inv = 1 / Math.max(Math.abs(worldScale.x), 1e-5);
    mount.scale.setScalar(inv);

    characterRoot.getWorldQuaternion(desiredWorldQuat);
    desiredWorldQuat.multiply(tilt);
    parent.getWorldQuaternion(parentWorldQuat);
    prop.root.quaternion.copy(parentWorldQuat.invert().multiply(desiredWorldQuat));
  };

  const baseDispose = prop.dispose;
  return {
    root: prop.root,
    setLit: prop.setLit,
    syncPose,
    dispose: () => {
      mount.removeFromParent();
      baseDispose();
    },
  };
}
