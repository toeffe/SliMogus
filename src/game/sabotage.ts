import { length, sub, type Vector2 } from '@sim/vector2';
import { getMapPois } from './mapPois';

export type SabotageType = 'lights' | 'reactor';

/** Shared cooldown after a sabotage is resolved (fixed or timed out), ~20s. */
export const SABOTAGE_COOLDOWN_TICKS = 1200;
/** Reactor meltdown countdown; if not fixed in time, impostors win (~45s). */
export const REACTOR_TIMEOUT_TICKS = 2700;
/** Hold-`E` ticks to fix lights at the electrical panel. */
export const LIGHTS_FIX_DURATION_TICKS = 180;
/** How close a crewmate must be to a sabotage panel to contribute. */
export const SABOTAGE_PANEL_RANGE_PX = 48;

export interface SabotagePanel {
  readonly id: string;
  readonly position: Vector2;
}

/** Default (Station Omega) panels. Prefer map-aware getters when map may vary. */
export const LIGHTS_PANEL: SabotagePanel = getMapPois('omega').lightsPanel;
export const REACTOR_PANEL_A: SabotagePanel = getMapPois('omega').reactorPanelA;
export const REACTOR_PANEL_B: SabotagePanel = getMapPois('omega').reactorPanelB;

export function getLightsPanel(mapId = 'omega'): SabotagePanel {
  return getMapPois(mapId).lightsPanel;
}

export function getReactorPanelA(mapId = 'omega'): SabotagePanel {
  return getMapPois(mapId).reactorPanelA;
}

export function getReactorPanelB(mapId = 'omega'): SabotagePanel {
  return getMapPois(mapId).reactorPanelB;
}

export interface SabotageState {
  active: SabotageType | null;
  /** Reactor countdown; unused while lights are active (lights have no timeout win). */
  ticksRemaining: number;
  cooldownTicks: number;
  lightsFixProgress: number;
  /** Player currently holding USE at reactor panel A/B this tick (recomputed each tick from inputs). */
  reactorPanelAHeldBy: number | null;
  reactorPanelBHeldBy: number | null;
}

export function createIdleSabotageState(): SabotageState {
  return {
    active: null,
    ticksRemaining: 0,
    cooldownTicks: 0,
    lightsFixProgress: 0,
    reactorPanelAHeldBy: null,
    reactorPanelBHeldBy: null,
  };
}

export function isPlayerNearPanel(position: Vector2, panel: SabotagePanel): boolean {
  return length(sub(position, panel.position)) <= SABOTAGE_PANEL_RANGE_PX;
}

/** Whether an impostor may start a sabotage right now. */
export function canStartSabotage(state: Readonly<SabotageState>): boolean {
  return state.active === null && state.cooldownTicks <= 0;
}

/** Starts a sabotage if none is active and the shared cooldown has expired. */
export function tryStartSabotage(state: SabotageState, type: SabotageType): boolean {
  if (!canStartSabotage(state)) return false;
  state.active = type;
  state.lightsFixProgress = 0;
  state.reactorPanelAHeldBy = null;
  state.reactorPanelBHeldBy = null;
  state.ticksRemaining = type === 'reactor' ? REACTOR_TIMEOUT_TICKS : 0;
  return true;
}

/** Clears the active sabotage and starts the shared cooldown. */
export function resolveSabotage(state: SabotageState): void {
  state.active = null;
  state.ticksRemaining = 0;
  state.lightsFixProgress = 0;
  state.reactorPanelAHeldBy = null;
  state.reactorPanelBHeldBy = null;
  state.cooldownTicks = SABOTAGE_COOLDOWN_TICKS;
}
