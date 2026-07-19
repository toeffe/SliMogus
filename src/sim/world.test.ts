import { describe, expect, it } from 'vitest';
import { createEntity } from './entity';
import { INPUT_VERSION, type PlayerInput } from './input';
import { PROTOTYPE_MAP } from './tilemap';
import { vec2 } from './vector2';
import { World } from './world';

// PROTOTYPE_MAP used by the ghost-collision test below.

function moveInput(playerId: number, moveX: number, moveY: number): PlayerInput {
  return {
    version: INPUT_VERSION,
    seq: 0,
    playerId,
    moveX,
    moveY,
    buttons: 0,
    targetId: -1,
    lookYaw: 0,
    flashlightOn: 1,
  };
}

describe('World', () => {
  it('moves an entity in the direction of its input, scaled by dt', () => {
    const world = new World();
    world.addEntity(createEntity(1, vec2(0, 0)));

    world.step([moveInput(1, 1, 0)], 1000);

    const entity = world.getEntity(1);
    expect(entity?.position.x).toBeCloseTo(120);
    expect(entity?.position.y).toBeCloseTo(0);
  });

  it('stops (does not coast) when no new input arrives for a tick', () => {
    const world = new World();
    world.addEntity(createEntity(2, vec2(0, 0)));

    world.step([moveInput(2, 0, 1)], 500);
    const afterFirst = world.getEntity(2)!.position.y;
    world.step([], 500);

    const entity = world.getEntity(2);
    expect(entity?.position.y).toBeCloseTo(afterFirst);
    expect(entity?.velocity.y).toBe(0);
  });

  it('lists entities in ascending id order regardless of insertion order', () => {
    const world = new World();
    world.addEntity(createEntity(5, vec2(0, 0)));
    world.addEntity(createEntity(1, vec2(0, 0)));
    world.addEntity(createEntity(3, vec2(0, 0)));

    expect(world.listEntities().map((e) => e.id)).toEqual([1, 3, 5]);
  });

  it('updates entities independently by matching input playerId to entity id', () => {
    const world = new World();
    world.addEntity(createEntity(1, vec2(0, 0)));
    world.addEntity(createEntity(2, vec2(0, 0)));

    world.step([moveInput(1, 1, 0), moveInput(2, -1, 0)], 1000);

    expect(world.getEntity(1)?.position.x).toBeCloseTo(120);
    expect(world.getEntity(2)?.position.x).toBeCloseTo(-120);
  });

  it('lets entities with ignoresCollision fly through walls on a tilemap', () => {
    const world = new World(PROTOTYPE_MAP);
    // Outside the map entirely — a solid-collision entity would be clamped; a ghost isn't.
    const ghost = createEntity(1, vec2(-50, -50));
    ghost.ignoresCollision = true;
    world.addEntity(ghost);

    world.step([moveInput(1, -1, 0)], 1000);

    expect(ghost.position.x).toBeCloseTo(-170);
  });
});
