import { describe, expect, it } from 'vitest';
import { vec2 } from '@sim/vector2';
import { findNearestVent, getVent, VENTS } from './vents';

describe('vents', () => {
  it('links each vent to a real partner', () => {
    for (const vent of VENTS) {
      const linked = getVent(vent.linkedId);
      expect(linked).toBeDefined();
      expect(linked?.linkedId).toBe(vent.id);
    }
  });

  it('finds the nearest vent within range', () => {
    const vent = VENTS[0];
    expect(findNearestVent(vec2(vent.position.x + 5, vent.position.y))).toBe(vent);
    expect(findNearestVent(vec2(-9999, -9999))).toBeUndefined();
  });
});
