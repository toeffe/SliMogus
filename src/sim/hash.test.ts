import { describe, expect, it } from 'vitest';
import { createEntity } from './entity';
import { hashWorldState } from './hash';
import { vec2 } from './vector2';
import { World } from './world';

function buildWorld(): World {
  const world = new World();
  world.addEntity(createEntity(1, vec2(10, 20)));
  world.addEntity(createEntity(2, vec2(-5, 3)));
  return world;
}

describe('hashWorldState', () => {
  it('is stable for identical state at the same tick', () => {
    expect(hashWorldState(buildWorld(), 5)).toBe(hashWorldState(buildWorld(), 5));
  });

  it('changes when the tick changes', () => {
    const world = buildWorld();
    expect(hashWorldState(world, 1)).not.toBe(hashWorldState(world, 2));
  });

  it('changes when an entity moves', () => {
    const world = buildWorld();
    const before = hashWorldState(world, 0);
    const entity = world.getEntity(1);
    if (entity) entity.position = vec2(entity.position.x + 1, entity.position.y);
    expect(hashWorldState(world, 0)).not.toBe(before);
  });

  it('ignores float noise below the rounding precision', () => {
    const world = buildWorld();
    const before = hashWorldState(world, 0);
    const entity = world.getEntity(1);
    if (entity) entity.position = vec2(entity.position.x + 1e-9, entity.position.y);
    expect(hashWorldState(world, 0)).toBe(before);
  });

  it('is independent of entity insertion order', () => {
    const a = new World();
    a.addEntity(createEntity(1, vec2(1, 1)));
    a.addEntity(createEntity(2, vec2(2, 2)));

    const b = new World();
    b.addEntity(createEntity(2, vec2(2, 2)));
    b.addEntity(createEntity(1, vec2(1, 1)));

    expect(hashWorldState(a, 0)).toBe(hashWorldState(b, 0));
  });
});
