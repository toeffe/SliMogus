import { getMapPois } from './mapPois';

/** Tile-space centers (1 unit = 1 tile) kept clear of furniture — matches 3D POI mounts. */
export function collectPoiClearWorld(
  tileSize = 32,
  mapId = 'omega',
): Array<{ x: number; z: number }> {
  const points: Array<{ x: number; z: number }> = [];
  const addPx = (px: number, py: number): void => {
    points.push({ x: px / tileSize, z: py / tileSize });
  };
  const pois = getMapPois(mapId);
  for (const station of pois.taskStations) addPx(station.position.x, station.position.y);
  for (const panel of [pois.lightsPanel, pois.reactorPanelA, pois.reactorPanelB]) {
    addPx(panel.position.x, panel.position.y);
  }
  for (const vent of pois.vents) addPx(vent.position.x, vent.position.y);
  return points;
}
