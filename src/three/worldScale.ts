/** Sim uses pixel coords (tileSize 32). Three world uses 1 unit = 1 tile. */
export const PIXELS_PER_TILE = 32;
export const WORLD_SCALE = 1 / PIXELS_PER_TILE;
export const WALL_HEIGHT = 3.2;
export const PLAYER_HEIGHT = 1.35;

export function pxToWorldX(px: number): number {
  return px * WORLD_SCALE;
}

/**
 * Sim +Y is down on screen; map it to Three +Z.
 * Paired with a +Z chase camera so W/S and A/D both match the screen
 * (negating Z forced the camera onto −Z, which mirrored left/right).
 */
export function pxToWorldZ(py: number): number {
  return py * WORLD_SCALE;
}
