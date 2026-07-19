import { FogExp2, type Scene } from 'three';

const FOG_NORMAL = 0.013;
const FOG_LIGHTS_OUT = 0.058;
const FOG_COLOR = 0x0a1218;

/**
 * Distance fog for station atmosphere. Flashlight is separate (`Flashlight`).
 */
export class VisionFog {
  private readonly fog: FogExp2;

  constructor(private readonly scene: Scene) {
    this.fog = new FogExp2(FOG_COLOR, FOG_NORMAL);
    scene.fog = this.fog;
  }

  setEnabled(enabled: boolean): void {
    this.scene.fog = enabled ? this.fog : null;
  }

  setLightsOut(active: boolean): void {
    this.fog.density = active ? FOG_LIGHTS_OUT : FOG_NORMAL;
  }

  dispose(): void {
    this.scene.fog = null;
  }
}
