import { describe, expect, it } from 'vitest';
import { PIXELS_PER_TILE, WORLD_SCALE, pxToWorldX, pxToWorldZ } from './worldScale';

describe('worldScale', () => {
  it('maps one tile (32px) to one world unit on X', () => {
    expect(PIXELS_PER_TILE).toBe(32);
    expect(WORLD_SCALE).toBeCloseTo(1 / 32);
    expect(pxToWorldX(32)).toBeCloseTo(1);
    expect(pxToWorldX(0)).toBeCloseTo(0);
  });

  it('maps sim +Y (down) to Three +Z', () => {
    expect(pxToWorldZ(32)).toBeCloseTo(1);
    expect(pxToWorldZ(64)).toBeCloseTo(2);
  });
});
