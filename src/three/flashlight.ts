import { SpotLight, Vector3, type Camera, type Scene } from 'three';
import { createFlashlightProp, type FlashlightProp } from './flashlightProp';

const DIST_NORMAL = 22;
const DIST_LIGHTS_OUT = 12;
const INTENSITY_NORMAL = 8.0;
const INTENSITY_LIGHTS_OUT = 9.0;
const ANGLE_NORMAL = Math.PI / 6;
const ANGLE_LIGHTS_OUT = Math.PI / 7;
const PENUMBRA = 0.25;
const DECAY = 0.75;
/** Higher = snappier follow; low teens feel like a handheld lag behind the camera. */
const LIGHT_FOLLOW = 9;
const AIM_FOLLOW = 7;

/**
 * Local FPS flashlight: SpotLight from the camera + a right-hand viewmodel torch.
 * Beam lags slightly behind look/movement so it reads as held, not eye-locked.
 */
export class Flashlight {
  private readonly spot: SpotLight;
  private readonly dir = new Vector3();
  private readonly targetPos = new Vector3();
  private readonly targetAim = new Vector3();
  private readonly smoothedPos = new Vector3();
  private readonly aimPoint = new Vector3();
  private readonly viewmodel: FlashlightProp;
  private enabled = true;
  private lagReady = false;

  constructor(private readonly scene: Scene) {
    this.spot = new SpotLight(
      0xe8f0ff,
      INTENSITY_NORMAL,
      DIST_NORMAL,
      ANGLE_NORMAL,
      PENUMBRA,
      DECAY,
    );
    this.spot.castShadow = false;
    scene.add(this.spot);
    scene.add(this.spot.target);

    this.viewmodel = createFlashlightProp({ fog: false, viewmodel: true });
    // Prominent right-hand grip in view space (camera looks down −Z).
    this.viewmodel.root.position.set(0.32, -0.3, -0.48);
    this.viewmodel.root.rotation.set(0.25, Math.PI + 0.1, 0.4);
    this.viewmodel.root.scale.setScalar(1.15);
    this.viewmodel.root.traverse((obj) => {
      const mesh = obj as { isMesh?: boolean; renderOrder?: number; frustumCulled?: boolean };
      if (mesh.isMesh) {
        mesh.renderOrder = 10;
        mesh.frustumCulled = false;
      }
    });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.spot.visible = enabled;
    this.viewmodel.root.visible = enabled;
    this.viewmodel.setLit(enabled);
    if (!enabled) this.lagReady = false;
  }

  setLightsOut(active: boolean): void {
    this.spot.distance = active ? DIST_LIGHTS_OUT : DIST_NORMAL;
    this.spot.intensity = active ? INTENSITY_LIGHTS_OUT : INTENSITY_NORMAL;
    this.spot.angle = active ? ANGLE_LIGHTS_OUT : ANGLE_NORMAL;
  }

  /** Sync light origin/aim to the FPS camera and keep the viewmodel parented. */
  syncFromCamera(camera: Camera, dtSec = 1 / 60): void {
    if (this.viewmodel.root.parent !== camera) {
      camera.add(this.viewmodel.root);
    }
    // Keep the prop parented even when off so the next toggle is instant.
    if (!this.enabled) return;

    camera.getWorldPosition(this.targetPos);
    camera.getWorldDirection(this.dir);
    // Emit from the hand viewmodel instead of eye center.
    this.targetPos.addScaledVector(this.dir, 0.2);
    this.targetPos.x += this.dir.z * 0.18;
    this.targetPos.z += -this.dir.x * 0.18;
    this.targetPos.y -= 0.18;
    this.targetAim.copy(this.targetPos).addScaledVector(this.dir, 12);

    const dt = Math.max(0, Math.min(dtSec, 0.05));
    if (!this.lagReady) {
      this.smoothedPos.copy(this.targetPos);
      this.aimPoint.copy(this.targetAim);
      this.lagReady = true;
    } else {
      const posAlpha = 1 - Math.exp(-LIGHT_FOLLOW * dt);
      const aimAlpha = 1 - Math.exp(-AIM_FOLLOW * dt);
      this.smoothedPos.lerp(this.targetPos, posAlpha);
      this.aimPoint.lerp(this.targetAim, aimAlpha);
    }

    this.spot.position.copy(this.smoothedPos);
    this.spot.target.position.copy(this.aimPoint);
    this.spot.target.updateMatrixWorld();
  }

  /** Aim point ahead of the camera (lagged). */
  getAim(): Vector3 | null {
    if (!this.enabled) return null;
    return this.aimPoint;
  }

  dispose(): void {
    this.viewmodel.root.removeFromParent();
    this.viewmodel.dispose();
    this.scene.remove(this.spot);
    this.scene.remove(this.spot.target);
    this.spot.dispose();
  }
}
