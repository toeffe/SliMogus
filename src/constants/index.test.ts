import { describe, expect, it } from 'vitest';
import { APP_NAME, APP_VERSION, FIXED_TIMESTEP_MS, TARGET_FPS } from './index';

describe('constants', () => {
  it('exposes app metadata sourced from package.json', () => {
    expect(APP_NAME).toBe('SliMogus');
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('derives the fixed timestep from the target tick rate', () => {
    expect(FIXED_TIMESTEP_MS).toBeCloseTo(1000 / TARGET_FPS, 5);
  });
});
