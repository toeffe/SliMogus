import { SpotLight, Vector3, type Scene } from 'three';
import type { ViewEntity, ViewSnapshot } from '@game/viewSnapshot';
import { pxToWorldX, pxToWorldZ } from './worldScale';

const DIST_NORMAL = 22;
const DIST_LIGHTS_OUT = 12;
const INTENSITY_NORMAL = 8.0;
const INTENSITY_LIGHTS_OUT = 9.0;
const ANGLE_NORMAL = Math.PI / 6;
const ANGLE_LIGHTS_OUT = Math.PI / 7;
const PENUMBRA = 0.25;
const DECAY = 0.75;
/** Fallback when the held prop pose isn't available yet. */
const HAND_Y = 0.85;
const HAND_FORWARD = 0.28;
const HAND_RIGHT = 0.22;
const AIM_DIST = 12;

export type FlashlightPoseLookup = (playerId: number, outPos: Vector3, outDir: Vector3) => boolean;

/**
 * SpotLights for remote living players, aimed from networked `facingYaw`
 * (or the held prop pose when provided). Local beam stays on the FPS `Flashlight`.
 */
export class PlayerFlashlights {
  private readonly lights = new Map<number, SpotLight>();
  private readonly aimScratch = new Vector3();
  private readonly posePos = new Vector3();
  private readonly poseDir = new Vector3();
  private lightsOut = false;

  constructor(private readonly scene: Scene) {}

  /** Living remote players' spotlights (for lens-flare / blind). */
  getLights(): ReadonlyMap<number, SpotLight> {
    return this.lights;
  }

  setLightsOut(active: boolean): void {
    this.lightsOut = active;
    for (const spot of this.lights.values()) {
      this.applyMode(spot);
    }
  }

  sync(snapshot: ViewSnapshot, poseOf?: FlashlightPoseLookup): void {
    const seen = new Set<number>();
    for (const entity of snapshot.entities) {
      if (entity.id === snapshot.localPlayerId) continue;
      if (!entity.alive) {
        this.remove(entity.id);
        continue;
      }
      if (!entity.flashlightOn) {
        this.remove(entity.id);
        continue;
      }
      seen.add(entity.id);
      const spot = this.ensure(entity.id);
      this.place(spot, entity, poseOf);
    }
    for (const id of this.lights.keys()) {
      if (!seen.has(id)) this.remove(id);
    }
  }

  dispose(): void {
    for (const id of [...this.lights.keys()]) this.remove(id);
  }

  private ensure(playerId: number): SpotLight {
    let spot = this.lights.get(playerId);
    if (spot) return spot;
    spot = new SpotLight(0xe8f0ff, INTENSITY_NORMAL, DIST_NORMAL, ANGLE_NORMAL, PENUMBRA, DECAY);
    spot.castShadow = false;
    this.applyMode(spot);
    this.scene.add(spot);
    this.scene.add(spot.target);
    this.lights.set(playerId, spot);
    return spot;
  }

  private place(spot: SpotLight, entity: ViewEntity, poseOf?: FlashlightPoseLookup): void {
    if (poseOf?.(entity.id, this.posePos, this.poseDir)) {
      spot.position.copy(this.posePos);
      this.aimScratch.copy(this.posePos).addScaledVector(this.poseDir, AIM_DIST);
      spot.target.position.copy(this.aimScratch);
      spot.target.updateMatrixWorld();
      spot.visible = true;
      return;
    }

    const yaw = entity.facingYaw;
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const baseX = pxToWorldX(entity.x);
    const baseZ = pxToWorldZ(entity.y);
    const x = baseX + rightX * HAND_RIGHT + fwdX * HAND_FORWARD;
    const z = baseZ + rightZ * HAND_RIGHT + fwdZ * HAND_FORWARD;
    spot.position.set(x, HAND_Y, z);
    this.aimScratch.set(x + fwdX * AIM_DIST, HAND_Y, z + fwdZ * AIM_DIST);
    spot.target.position.copy(this.aimScratch);
    spot.target.updateMatrixWorld();
    spot.visible = true;
  }

  private applyMode(spot: SpotLight): void {
    spot.distance = this.lightsOut ? DIST_LIGHTS_OUT : DIST_NORMAL;
    spot.intensity = this.lightsOut ? INTENSITY_LIGHTS_OUT : INTENSITY_NORMAL;
    spot.angle = this.lightsOut ? ANGLE_LIGHTS_OUT : ANGLE_NORMAL;
  }

  private remove(playerId: number): void {
    const spot = this.lights.get(playerId);
    if (!spot) return;
    this.scene.remove(spot);
    this.scene.remove(spot.target);
    spot.dispose();
    this.lights.delete(playerId);
  }
}
