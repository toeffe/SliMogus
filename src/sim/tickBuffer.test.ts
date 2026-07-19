import { describe, expect, it } from 'vitest';
import { INPUT_VERSION, type PlayerInput } from './input';
import { TickBuffer } from './tickBuffer';

function input(playerId: number): PlayerInput {
  return {
    version: INPUT_VERSION,
    seq: 0,
    playerId,
    moveX: 0,
    moveY: 0,
    buttons: 0,
    targetId: -1,
    lookYaw: 0,
    flashlightOn: 1,
  };
}

describe('TickBuffer', () => {
  it('resolves an empty array for a tick with no buffered input', () => {
    const buffer = new TickBuffer(1);
    expect(buffer.resolve(5)).toEqual([]);
    expect(buffer.hasTick(5)).toBe(false);
  });

  it('orders the host input first regardless of insertion order', () => {
    const buffer = new TickBuffer(2);
    buffer.add(1, input(3));
    buffer.add(1, input(1));
    buffer.add(1, input(2));

    expect(buffer.resolve(1).map((i) => i.playerId)).toEqual([2, 1, 3]);
  });

  it('orders non-host players ascending by id', () => {
    const buffer = new TickBuffer(99);
    buffer.add(1, input(5));
    buffer.add(1, input(2));
    buffer.add(1, input(8));

    expect(buffer.resolve(1).map((i) => i.playerId)).toEqual([2, 5, 8]);
  });

  it('lets a later input for the same player/tick overwrite the earlier one', () => {
    const buffer = new TickBuffer(1);
    buffer.add(1, { ...input(1), moveX: 0.1 });
    buffer.add(1, { ...input(1), moveX: 0.9 });

    expect(buffer.resolve(1)).toHaveLength(1);
    expect(buffer.resolve(1)[0]?.moveX).toBe(0.9);
  });

  it('clearUpTo drops only ticks at or below the given tick', () => {
    const buffer = new TickBuffer(1);
    buffer.add(1, input(1));
    buffer.add(2, input(1));
    buffer.add(3, input(1));

    buffer.clearUpTo(2);

    expect(buffer.hasTick(1)).toBe(false);
    expect(buffer.hasTick(2)).toBe(false);
    expect(buffer.hasTick(3)).toBe(true);
  });

  it('hasAll is true only when every expected player has input for the tick', () => {
    const buffer = new TickBuffer(0);
    buffer.add(1, input(0));
    buffer.add(1, input(1));

    expect(buffer.hasAll(1, [0, 1])).toBe(true);
    expect(buffer.hasAll(1, [0, 1, 2])).toBe(false);
    expect(buffer.hasAll(2, [0, 1])).toBe(false);
  });
});
