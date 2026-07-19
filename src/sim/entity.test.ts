import { describe, expect, it } from 'vitest';
import { createEntity } from './entity';
import { vec2 } from './vector2';

describe('createEntity', () => {
  it('starts at rest with the given id, position, and default radius', () => {
    const entity = createEntity(7, vec2(10, 20));
    expect(entity).toEqual({
      id: 7,
      position: vec2(10, 20),
      velocity: vec2(0, 0),
      radius: 16,
      facingYaw: 0,
      flashlightOn: 1,
    });
  });

  it('accepts a custom radius', () => {
    const entity = createEntity(1, vec2(0, 0), 32);
    expect(entity.radius).toBe(32);
  });
});
