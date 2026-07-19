import { describe, expect, it } from 'vitest';
import { accumulateSteps } from './loop';

describe('accumulateSteps', () => {
  it('does not step when the delta is under one step', () => {
    const result = accumulateSteps(0, 5, 16.6667);
    expect(result.steps).toBe(0);
    expect(result.accumulator).toBeCloseTo(5);
  });

  it('produces exactly one step per stepMs of delta', () => {
    const result = accumulateSteps(0, 50, 10);
    expect(result.steps).toBe(5);
    expect(result.accumulator).toBeCloseTo(0);
  });

  it('carries leftover time across calls', () => {
    const first = accumulateSteps(0, 25, 10);
    expect(first).toEqual({ steps: 2, accumulator: 5 });

    const second = accumulateSteps(first.accumulator, 25, 10);
    expect(second).toEqual({ steps: 3, accumulator: 0 });
  });

  it('caps steps at maxSteps to avoid a spiral of death', () => {
    const result = accumulateSteps(0, 1000, 10, 5);
    expect(result.steps).toBe(5);
    expect(result.accumulator).toBeCloseTo(950);
  });
});
