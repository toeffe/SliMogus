import { Vector3, type Camera, type SpotLight } from 'three';
import type { ViewSnapshot } from '@game/viewSnapshot';

/** Cosine of spotlight half-angle — beam must be aimed near the viewer. */
const BEAM_DOT_MIN = 0.68;
/** Viewer must look roughly toward the emitter. */
const LOOK_DOT_MIN = 0.3;
const MAX_DIST = 15;
const FULL_DIST = 4;
/** Mild boost so a direct stare reads clearly without a full white-out. */
const INTENSITY_GAIN = 1.25;

/** Pixel-space LOS from viewer to emitter (walls + closed airlocks). */
export type BlindLineOfSight = (fromX: number, fromY: number, toX: number, toY: number) => boolean;

export interface FlashlightBlindHandle {
  update: (
    camera: Camera,
    snapshot: ViewSnapshot,
    remoteLights: ReadonlyMap<number, SpotLight>,
    hasLos: BlindLineOfSight,
  ) => void;
  dispose: () => void;
}

/**
 * Screen wash + radial lens flare when staring into another player's beam.
 */
export function createFlashlightBlind(container: HTMLElement): FlashlightBlindHandle {
  const root = document.createElement('div');
  root.className = 'flashlight-blind';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="flashlight-blind__wash"></div>
    <div class="flashlight-blind__flare"></div>
    <div class="flashlight-blind__streak flashlight-blind__streak--a"></div>
    <div class="flashlight-blind__streak flashlight-blind__streak--b"></div>
  `;
  container.appendChild(root);

  const wash = root.querySelector('.flashlight-blind__wash') as HTMLElement;
  const flare = root.querySelector('.flashlight-blind__flare') as HTMLElement;
  const streakA = root.querySelector('.flashlight-blind__streak--a') as HTMLElement;
  const streakB = root.querySelector('.flashlight-blind__streak--b') as HTMLElement;

  const camPos = new Vector3();
  const camDir = new Vector3();
  const lightPos = new Vector3();
  const toCam = new Vector3();
  const toLight = new Vector3();
  const lightDir = new Vector3();
  const ndc = new Vector3();

  let smooth = 0;

  return {
    update(camera, snapshot, remoteLights, hasLos) {
      if (snapshot.localIsGhost) {
        smooth = 0;
        apply(0, 50, 50);
        return;
      }

      camera.getWorldPosition(camPos);
      camera.getWorldDirection(camDir);

      let best = 0;
      let bestX = 50;
      let bestY = 50;

      for (const entity of snapshot.entities) {
        if (entity.id === snapshot.localPlayerId) continue;
        if (!entity.alive || !entity.flashlightOn) continue;
        if (!hasLos(snapshot.localX, snapshot.localY, entity.x, entity.y)) continue;
        const spot = remoteLights.get(entity.id);
        if (!spot?.visible) continue;

        lightPos.copy(spot.position);
        lightDir.subVectors(spot.target.position, spot.position).normalize();
        toCam.subVectors(camPos, lightPos);
        const dist = toCam.length();
        if (dist < 0.4 || dist > MAX_DIST) continue;
        toCam.multiplyScalar(1 / dist);

        const beamDot = lightDir.dot(toCam);
        if (beamDot < BEAM_DOT_MIN) continue;

        toLight.subVectors(lightPos, camPos).normalize();
        const lookDot = camDir.dot(toLight);
        if (lookDot < LOOK_DOT_MIN) continue;

        const distFactor =
          1 - Math.min(1, Math.max(0, (dist - FULL_DIST) / (MAX_DIST - FULL_DIST)));
        const beamFactor = (beamDot - BEAM_DOT_MIN) / (1 - BEAM_DOT_MIN);
        const lookFactor = (lookDot - LOOK_DOT_MIN) / (1 - LOOK_DOT_MIN);
        const raw = beamFactor * lookFactor * distFactor;
        const intensity = Math.min(1, Math.pow(raw, 0.85) * INTENSITY_GAIN);
        if (intensity <= best) continue;

        best = intensity;
        ndc.copy(lightPos).project(camera);
        bestX = (ndc.x + 1) * 0.5 * 100;
        bestY = (1 - ndc.y) * 0.5 * 100;
      }

      // Ease so it blooms in/out instead of flickering on tick edges.
      const target = best;
      smooth += (target - smooth) * (target > smooth ? 0.4 : 0.16);
      if (smooth < 0.01) smooth = 0;
      apply(smooth, bestX, bestY);
    },

    dispose() {
      root.remove();
    },
  };

  function apply(intensity: number, xPct: number, yPct: number): void {
    const on = intensity > 0.02;
    root.classList.toggle('flashlight-blind--active', on);
    root.style.setProperty('--blind', intensity.toFixed(3));
    root.style.setProperty('--flare-x', `${xPct.toFixed(1)}%`);
    root.style.setProperty('--flare-y', `${yPct.toFixed(1)}%`);
    wash.style.opacity = String(Math.min(1, intensity * 0.85));
    flare.style.opacity = String(Math.min(1, intensity * 1.2));
    streakA.style.opacity = String(intensity * 0.7);
    streakB.style.opacity = String(intensity * 0.55);
  }
}
