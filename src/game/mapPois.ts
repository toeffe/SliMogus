import { vec2, type Vector2 } from '@sim/vector2';
import type { SabotagePanel } from './sabotage';
import type { TaskStation } from './tasks';
import type { Vent } from './vents';

/** Pixel center of a walkable tile (tileSize 32). */
function tilePx(tx: number, ty: number): Vector2 {
  return vec2((tx + 0.5) * 32, (ty + 0.5) * 32);
}

export interface MapPois {
  readonly taskStations: readonly TaskStation[];
  readonly vents: readonly Vent[];
  readonly lightsPanel: SabotagePanel;
  readonly reactorPanelA: SabotagePanel;
  readonly reactorPanelB: SabotagePanel;
}

export interface MapOption {
  readonly id: string;
  readonly name: string;
}

/** Lobby-selectable maps (order shown in the host picker). */
export const PLAYABLE_MAPS: readonly MapOption[] = [
  { id: 'omega', name: 'Station Omega' },
  { id: 'helix', name: 'Station Helix' },
];

const OMEGA_POIS: MapPois = {
  taskStations: [
    {
      id: 'wiring-cafe',
      name: 'Fix Wiring (Cafeteria)',
      position: tilePx(8, 2),
      durationTicks: 180,
      minigame: 'wires',
    },
    {
      id: 'scan-med',
      name: 'Medbay Scan',
      position: tilePx(24, 2),
      durationTicks: 240,
      minigame: 'download',
    },
    {
      id: 'engine-upper',
      name: 'Start Engine',
      position: tilePx(34, 2),
      durationTicks: 150,
      minigame: 'gauge',
    },
    {
      id: 'fuel-upper',
      name: 'Fuel Engines',
      position: tilePx(38, 8),
      durationTicks: 200,
      minigame: 'gauge',
    },
    {
      id: 'trash-storage',
      name: 'Empty Trash',
      position: tilePx(21, 22),
      durationTicks: 120,
      minigame: 'download',
    },
    {
      id: 'wiring-elec',
      name: 'Fix Wiring (Electrical)',
      position: tilePx(2, 17),
      durationTicks: 180,
      minigame: 'wires',
    },
    {
      id: 'calibrate-storage',
      name: 'Calibrate Distributor',
      position: tilePx(20, 14),
      durationTicks: 210,
      minigame: 'gauge',
    },
  ],
  vents: [
    { id: 'vent-cafe', position: tilePx(12, 9), linkedId: 'vent-med' },
    { id: 'vent-med', position: tilePx(25, 6), linkedId: 'vent-cafe' },
    { id: 'vent-elec', position: tilePx(10, 18), linkedId: 'vent-reactor' },
    { id: 'vent-reactor', position: tilePx(35, 23), linkedId: 'vent-elec' },
  ],
  lightsPanel: { id: 'lights', position: tilePx(5, 15) },
  reactorPanelA: { id: 'reactor-a', position: tilePx(30, 16) },
  reactorPanelB: { id: 'reactor-b', position: tilePx(39, 22) },
};

/** Same station/vent ids as Omega — positions retargeted to Helix room walls. */
const HELIX_POIS: MapPois = {
  taskStations: [
    {
      id: 'wiring-cafe',
      name: 'Fix Wiring (Cafeteria)',
      position: tilePx(16, 3),
      durationTicks: 180,
      minigame: 'wires',
    },
    {
      id: 'scan-med',
      name: 'Medbay Scan',
      position: tilePx(30, 2),
      durationTicks: 240,
      minigame: 'download',
    },
    {
      id: 'engine-upper',
      name: 'Start Engine',
      position: tilePx(37, 10),
      durationTicks: 150,
      minigame: 'gauge',
    },
    {
      id: 'fuel-upper',
      name: 'Fuel Engines',
      position: tilePx(40, 15),
      durationTicks: 200,
      minigame: 'gauge',
    },
    {
      id: 'trash-storage',
      name: 'Empty Trash',
      position: tilePx(20, 22),
      durationTicks: 120,
      minigame: 'download',
    },
    {
      id: 'wiring-elec',
      name: 'Fix Wiring (Electrical)',
      position: tilePx(2, 6),
      durationTicks: 180,
      minigame: 'wires',
    },
    {
      id: 'calibrate-storage',
      name: 'Calibrate Distributor',
      position: tilePx(24, 14), // N wall, east of cafe spur
      durationTicks: 210,
      minigame: 'gauge',
    },
  ],
  vents: [
    { id: 'vent-cafe', position: tilePx(20, 10), linkedId: 'vent-med' },
    { id: 'vent-med', position: tilePx(32, 6), linkedId: 'vent-cafe' },
    { id: 'vent-elec', position: tilePx(6, 8), linkedId: 'vent-reactor' },
    { id: 'vent-reactor', position: tilePx(34, 24), linkedId: 'vent-elec' },
  ],
  lightsPanel: { id: 'lights', position: tilePx(4, 3) },
  reactorPanelA: { id: 'reactor-a', position: tilePx(30, 19) },
  reactorPanelB: { id: 'reactor-b', position: tilePx(39, 22) },
};

const POIS_BY_MAP: Record<string, MapPois> = {
  omega: OMEGA_POIS,
  skeld: OMEGA_POIS,
  helix: HELIX_POIS,
};

export function getMapPois(mapId: string): MapPois {
  return POIS_BY_MAP[mapId] ?? OMEGA_POIS;
}

export function resolveMapId(mapId: string): string {
  if (mapId === 'skeld') return 'omega';
  return POIS_BY_MAP[mapId] ? mapId : 'omega';
}
