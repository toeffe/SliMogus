import { Scene as ThreeScene, Vector3, type Object3D } from 'three';
import { createMatchDriver, type MatchDriver, type MatchDriverOptions } from '@game/matchDriver';
import type { ViewSnapshot } from '@game/viewSnapshot';
import { hasLineOfSight, type TileMap } from '@sim/tilemap';
import { createThreeRenderer, type ThreeRenderer } from './renderer';
import { createStationMaterials } from './materials';
import { buildStationMesh } from './stationMesh';
import {
  createPlayerMesh,
  createBodyMarker,
  preloadPlayerModel,
  type PlayerMesh,
} from './playerMesh';
import { createPoiMarkers } from './poiMarkers';
import { CameraRig } from './cameraRig';
import { setupLighting } from './lighting';
import { VisionFog } from './visionFog';
import { Flashlight } from './flashlight';
import { createFlashlightBlind } from './flashlightBlind';
import { PlayerFlashlights } from './playerFlashlights';
import { applySpaceSkybox } from './skybox';
import { createHtmlMinimap } from './htmlMinimap';
import { createNameTagLayer } from './nameTags';
import { createAirlockRegistry } from './airlockDoors';
import { pxToWorldX, pxToWorldZ } from './worldScale';

/** App-facing match scene API used by `bootstrapApp`. */
export type SimulationScene = MatchDriver & {
  render: () => void;
  /** One-shot spawn camera / mesh sync before the match loop starts. */
  primeView: () => void;
  /** Hide minimap / look chrome until the match barrier clears. */
  setChromeVisible: (visible: boolean) => void;
};

export type NetworkedSimulationOptions = MatchDriverOptions & {
  container: HTMLElement;
  tileMap: TileMap;
};

/**
 * Three.js station view + match driver. App calls `update` then `render`.
 */
export async function createSimulationScene(
  options: NetworkedSimulationOptions,
): Promise<SimulationScene> {
  const { container, tileMap, ...driverOptions } = options;
  const driver = createMatchDriver({ ...driverOptions, tileMap });

  const three = await createThreeRenderer(container);
  const scene = new ThreeScene();
  const disposeSkybox = await applySpaceSkybox(scene);

  const materials = await createStationMaterials();
  const characterIds = driverOptions.players.map((p) => p.characterId);
  await preloadPlayerModel(characterIds);
  const station = buildStationMesh(tileMap, materials);
  scene.add(station);
  const airlocks = createAirlockRegistry(station);

  const lights = setupLighting(scene, tileMap);
  const vision = new VisionFog(scene);
  const flashlight = new Flashlight(scene);
  const remoteFlashlights = new PlayerFlashlights(scene);
  const flashlightBlind = createFlashlightBlind(container);
  const pois = createPoiMarkers(tileMap, materials);
  scene.add(pois.root);
  pois.setLocalRole(driver.getLocalRole());

  const viewW = container.clientWidth || window.innerWidth;
  const viewH = container.clientHeight || window.innerHeight;
  const cameraRig = new CameraRig(viewW / viewH);
  const nametags = createNameTagLayer(container);
  const minimap = createHtmlMinimap(container, tileMap);

  const players = new Map<number, PlayerMesh>();
  const nameTagById = new Map<number, ReturnType<typeof nametags.acquire>>();
  const bodyObjects: Object3D[] = [];
  let snapped = false;
  const tagNdc = new Vector3();

  const canvas = three.renderer.domElement;
  canvas.style.cursor = 'none';

  const crosshair = document.createElement('div');
  crosshair.className = 'fps-crosshair';
  crosshair.setAttribute('aria-hidden', 'true');
  const crosshairDot = document.createElement('span');
  crosshairDot.className = 'fps-crosshair__dot';
  crosshair.appendChild(crosshairDot);
  container.appendChild(crosshair);

  const unfocused = document.createElement('div');
  unfocused.className = 'fps-unfocused';
  unfocused.hidden = true;
  unfocused.setAttribute('aria-hidden', 'true');
  unfocused.innerHTML = '<p class="fps-unfocused__label">Click to resume</p>';
  container.appendChild(unfocused);

  /** True while a task/UI overlay needs a free mouse cursor. */
  let pointerLookSuspended = false;

  const hasBlockingOverlay = (): boolean =>
    Boolean(
      container.querySelector('.role-reveal') ||
      container.querySelector('.match-gate') ||
      container.querySelector('.help-overlay:not([hidden])') ||
      container.querySelector('.meeting:not([hidden])') ||
      container.querySelector('.victory:not([hidden])') ||
      container.querySelector('.task-minigame:not([hidden])') ||
      container.querySelector('.settings-panel'),
    );

  const syncPointerLockUi = (): void => {
    const locked = document.pointerLockElement === canvas;
    // Role reveal / help / meeting already own the screen — never stack "Click to resume".
    const showTapOut = !pointerLookSuspended && !locked && !hasBlockingOverlay();
    unfocused.hidden = !showTapOut;
    if (pointerLookSuspended || !locked) {
      crosshair.hidden = true;
      canvas.style.cursor = 'default';
      return;
    }
    crosshair.hidden = false;
    canvas.style.cursor = 'none';
  };

  const tryRequestPointerLock = (): void => {
    if (pointerLookSuspended) return;
    if (document.pointerLockElement === canvas) return;
    // Denied (and throws) when the tab/devtools owns focus — don't reject the click handler.
    if (!document.hasFocus()) {
      syncPointerLockUi();
      return;
    }
    const lock = canvas.requestPointerLock();
    if (lock && typeof (lock as Promise<void>).catch === 'function') {
      void (lock as Promise<void>).catch(() => {
        syncPointerLockUi();
      });
    }
  };

  const setPointerLookSuspended = (suspended: boolean): void => {
    pointerLookSuspended = suspended;
    if (suspended) {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      syncPointerLockUi();
      return;
    }
    // May require a gesture in some browsers; onPointerDown re-locks if needed.
    tryRequestPointerLock();
    syncPointerLockUi();
  };

  const onPointerDown = (): void => {
    tryRequestPointerLock();
  };
  const onMouseMove = (ev: MouseEvent): void => {
    if (pointerLookSuspended || document.pointerLockElement !== canvas) return;
    cameraRig.addLookDelta(ev.movementX, ev.movementY);
  };
  const onPointerLockChange = (): void => {
    syncPointerLockUi();
  };
  /** Free the cursor so the player can leave the game UI temporarily; click canvas to re-lock. */
  const onEscapeUnlock = (event: KeyboardEvent): void => {
    if (event.code !== 'Escape' && event.key !== 'Escape') return;
    if (event.repeat) return;
    // Task/meeting overlays own Escape while the look cursor is suspended.
    if (pointerLookSuspended) return;
    if (document.pointerLockElement !== canvas) return;
    event.preventDefault();
    document.exitPointerLock();
  };
  const onOverlayChanged = (): void => {
    syncPointerLockUi();
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  window.addEventListener('keydown', onEscapeUnlock);
  window.addEventListener('slimogus:overlay-changed', onOverlayChanged);
  syncPointerLockUi();

  const onResize = (): void => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    three.setSize(w, h);
    cameraRig.setAspect(w / h);
    nametags.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  const syncPlayers = (snapshot: ViewSnapshot, dtSec: number): void => {
    const seen = new Set<number>();
    const camera = cameraRig.camera;
    for (const entity of snapshot.entities) {
      seen.add(entity.id);
      let mesh = players.get(entity.id);
      if (!mesh) {
        mesh = createPlayerMesh(entity.color, entity.name, entity.characterId);
        players.set(entity.id, mesh);
        scene.add(mesh.root);
        const tag = nametags.acquire(entity.name);
        tag.position.y = 1.7;
        mesh.root.add(tag);
        nameTagById.set(entity.id, tag);
      }
      mesh.setColor(entity.color);
      mesh.setGhost(!entity.alive);
      const speed = Math.hypot(entity.vx, entity.vy);
      mesh.update(dtSec, speed);
      const isLocal = entity.id === snapshot.localPlayerId;
      // FPS: hide local body while alive; ghosts can see themselves.
      const showLocal = !entity.alive || snapshot.localIsGhost;
      const visibleToOthers = snapshot.localIsGhost || entity.alive;
      mesh.root.visible = isLocal ? showLocal : visibleToOthers;
      // Local living body is hidden — torch is the FPS viewmodel instead.
      mesh.setFlashlightVisible(
        entity.alive && entity.flashlightOn && !(isLocal && !snapshot.localIsGhost),
      );
      mesh.root.position.set(pxToWorldX(entity.x), 0, pxToWorldZ(entity.y));
      // Quaternius rest pose faces +Z; camera yaw 0 looks −Z — offset so body matches look.
      const lookYaw = isLocal ? cameraRig.getYaw() : entity.facingYaw;
      mesh.root.rotation.y = lookYaw + Math.PI;

      const tag = nameTagById.get(entity.id);
      if (tag) {
        if (isLocal) {
          tag.visible = showLocal;
        } else if (!visibleToOthers) {
          tag.visible = false;
        } else if (snapshot.localIsGhost) {
          // Ghosts see names through walls.
          tag.visible = true;
        } else {
          // Only when on-screen and clear tilemap LOS (not through walls).
          tagNdc.set(pxToWorldX(entity.x), 1.4, pxToWorldZ(entity.y)).project(camera);
          const onScreen =
            tagNdc.z > 0 &&
            tagNdc.z < 1 &&
            tagNdc.x > -1.15 &&
            tagNdc.x < 1.15 &&
            tagNdc.y > -1.15 &&
            tagNdc.y < 1.15;
          tag.visible =
            onScreen && hasVisualLos(snapshot.localX, snapshot.localY, entity.x, entity.y);
        }
      }
    }
    for (const [id, mesh] of players) {
      if (seen.has(id)) continue;
      const tag = nameTagById.get(id);
      if (tag) {
        nametags.release(tag);
        nameTagById.delete(id);
      }
      scene.remove(mesh.root);
      mesh.dispose();
      players.delete(id);
    }
  };

  const syncBodies = (snapshot: ViewSnapshot): void => {
    for (const obj of bodyObjects) {
      const dispose = obj.userData.dispose as (() => void) | undefined;
      dispose?.();
      scene.remove(obj);
    }
    bodyObjects.length = 0;
    for (const body of snapshot.bodies) {
      const marker = createBodyMarker(body.color, body.characterId);
      marker.position.set(pxToWorldX(body.x), 0, pxToWorldZ(body.y));
      scene.add(marker);
      bodyObjects.push(marker);
    }
  };

  /** Walls via tilemap + shut airlock leaves (doorFrame tiles alone stay open). */
  const hasVisualLos = (x0: number, y0: number, x1: number, y1: number): boolean => {
    if (!hasLineOfSight(tileMap, x0, y0, x1, y1)) return false;
    return !airlocks.blocksSight(pxToWorldX(x0), pxToWorldZ(y0), pxToWorldX(x1), pxToWorldZ(y1));
  };

  const applyPresentation = (snapshot: ViewSnapshot, dtSec: number): void => {
    // Drive door open amount before nametag / flare LOS samples it.
    airlocks.update(snapshot, dtSec);

    lights.setPowered(!snapshot.lightsOut);
    vision.setEnabled(!snapshot.localIsGhost);
    vision.setLightsOut(snapshot.lightsOut);
    const localFlash =
      snapshot.entities.find((e) => e.id === snapshot.localPlayerId)?.flashlightOn ?? true;
    flashlight.setEnabled(!snapshot.localIsGhost && localFlash);
    flashlight.setLightsOut(snapshot.lightsOut);
    remoteFlashlights.setLightsOut(snapshot.lightsOut);

    syncPlayers(snapshot, dtSec);
    syncBodies(snapshot);
    remoteFlashlights.sync(snapshot, (playerId, outPos, outDir) => {
      const mesh = players.get(playerId);
      if (!mesh) return false;
      return mesh.getFlashlightWorldPose(outPos, outDir);
    });

    if (!snapped) {
      cameraRig.snap(snapshot.localX, snapshot.localY);
      snapped = true;
    } else {
      cameraRig.follow(snapshot.localX, snapshot.localY);
    }
    flashlight.syncFromCamera(cameraRig.camera, dtSec);
    flashlightBlind.update(cameraRig.camera, snapshot, remoteFlashlights.getLights(), hasVisualLos);
    minimap.update(snapshot);
    const details = station.userData.stationDetails as { update: (t: number) => void } | undefined;
    details?.update(performance.now() * 0.001);
    pois.update(performance.now() * 0.001);
  };

  const update = (dtMs: number, tick: number): void => {
    driver.setFacingYaw(cameraRig.getYaw());
    driver.update(dtMs, tick);
    // Spawn state is valid even before the first sim step (simTick still -1).
    applyPresentation(driver.getViewSnapshot(), dtMs / 1000);
  };

  const render = (): void => {
    three.renderer.render(scene, cameraRig.camera);
    nametags.render(scene, cameraRig.camera);
  };

  /** Place camera / players from spawn state and paint one frame (pre-match gate). */
  const primeView = (): void => {
    applyPresentation(driver.getViewSnapshot(), 0);
    render();
  };

  const setChromeVisible = (visible: boolean): void => {
    const mapEl = container.querySelector<HTMLElement>('.three-minimap');
    if (mapEl) mapEl.hidden = !visible;
    if (!visible) {
      crosshair.hidden = true;
      unfocused.hidden = true;
    } else {
      syncPointerLockUi();
    }
  };

  setChromeVisible(false);

  return {
    ...driver,
    setMovementLocked: (locked: boolean) => {
      driver.setMovementLocked(locked);
      setPointerLookSuspended(locked);
    },
    setChromeVisible,
    primeView,
    update,
    render,
    destroy: () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onEscapeUnlock);
      window.removeEventListener('slimogus:overlay-changed', onOverlayChanged);
      canvas.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      crosshair.remove();
      unfocused.remove();
      flashlightBlind.dispose();
      driver.destroy();
      minimap.destroy();
      nametags.destroy();
      vision.dispose();
      flashlight.dispose();
      remoteFlashlights.dispose();
      lights.dispose();
      disposeSkybox();
      pois.dispose();
      materials.dispose();
      for (const mesh of players.values()) mesh.dispose();
      three.destroy();
    },
  };
}

export type { ThreeRenderer };
