import { describe, expect, it } from 'vitest';
import {
  INPUT_VERSION,
  PlayerInputButton,
  decodeInput,
  encodeInput,
  type PlayerInput,
} from './input';

describe('input encode/decode', () => {
  const sample: PlayerInput = {
    version: INPUT_VERSION,
    seq: 42,
    playerId: 3,
    moveX: -0.5,
    moveY: 1,
    buttons: PlayerInputButton.KILL | PlayerInputButton.REPORT,
    targetId: 7,
    lookYaw: 1.25,
    flashlightOn: 1,
  };

  it('round-trips a PlayerInput through the flat buffer format', () => {
    const encoded = encodeInput(sample);
    expect(encoded).toBeInstanceOf(Float32Array);
    expect(encoded).toHaveLength(9);
    expect(decodeInput(encoded)).toEqual(sample);
  });

  it('round-trips a "no target" input', () => {
    const noTarget: PlayerInput = { ...sample, buttons: 0, targetId: -1 };
    expect(decodeInput(encodeInput(noTarget))).toEqual(noTarget);
  });

  it('rejects buffers of the wrong length', () => {
    expect(() => decodeInput(new Float32Array([1, 2, 3]))).toThrow(/expected 9 floats/i);
  });

  it('rejects an unsupported input version', () => {
    const encoded = encodeInput({ ...sample, version: 99 });
    expect(() => decodeInput(encoded)).toThrow(/unsupported input version/i);
  });

  it('round-trips TASK_COMPLETE with a station-index targetId', () => {
    const taskComplete: PlayerInput = {
      ...sample,
      buttons: PlayerInputButton.TASK_COMPLETE,
      targetId: 3,
    };
    expect(decodeInput(encodeInput(taskComplete))).toEqual(taskComplete);
  });
});
