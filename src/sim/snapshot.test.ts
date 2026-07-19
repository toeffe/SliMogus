import { describe, expect, it } from 'vitest';
import { createEntity } from './entity';
import { createSnapshot, restoreWorldFromSnapshot } from './snapshot';
import { vec2 } from './vector2';
import { World } from './world';

describe('snapshot round-trip', () => {
  it('restores an identical world (entities, positions, velocities, radii, facing)', () => {
    const world = new World();
    const entity = createEntity(1, vec2(10, 20), 24);
    entity.velocity = vec2(3, -4);
    entity.facingYaw = 1.5;
    world.addEntity(entity);
    world.addEntity(createEntity(2, vec2(-1, -2)));

    const snapshot = createSnapshot(world, 42);
    expect(snapshot.tick).toBe(42);
    expect(snapshot.entities[0]?.facingYaw).toBe(1.5);

    const restored = restoreWorldFromSnapshot(snapshot);
    expect(restored.listEntities()).toEqual(world.listEntities());
  });

  it('produces a deep copy, not a reference to the live entities', () => {
    const world = new World();
    world.addEntity(createEntity(1, vec2(0, 0)));

    const snapshot = createSnapshot(world, 0);
    const entity = world.getEntity(1);
    if (entity) entity.position = vec2(999, 999);

    expect(snapshot.entities[0]?.position).toEqual({ x: 0, y: 0 });
  });
});
