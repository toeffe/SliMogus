import { PerspectiveCamera, Vector3 } from 'three';
import { pxToWorldX, pxToWorldZ } from './worldScale';

const EYE_HEIGHT = 1.25;
const FOV = 70;
const PITCH_MIN = -1.35;
const PITCH_MAX = 1.35;
const LOOK_SENS = 0.0022;
/** Face +Z (into Station Omega rooms from typical north-wall spawns). */
const DEFAULT_YAW = Math.PI;

/**
 * First-person camera: pointer-lock mouse look + eye-height follow.
 * Yaw 0 looks −Z; default yaw faces +Z for readable cafeteria spawns.
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  private yaw = DEFAULT_YAW;
  private pitch = 0;
  private readonly pos = new Vector3();

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(FOV, aspect, 0.05, 200);
    this.camera.rotation.order = 'YXZ';
    this.applyLook();
  }

  getYaw(): number {
    return this.yaw;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Accumulate mouse deltas (pixels) while pointer-locked. */
  addLookDelta(dx: number, dy: number): void {
    this.yaw -= dx * LOOK_SENS;
    this.pitch -= dy * LOOK_SENS;
    this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch));
    this.applyLook();
  }

  /** Place camera at player eye height; keep current look angles. */
  follow(px: number, py: number): void {
    this.pos.set(pxToWorldX(px), EYE_HEIGHT, pxToWorldZ(py));
    this.camera.position.copy(this.pos);
    this.applyLook();
  }

  /** Snap without smoothing (first frame). */
  snap(px: number, py: number): void {
    this.follow(px, py);
  }

  private applyLook(): void {
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
  }
}
