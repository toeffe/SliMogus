import { describe, expect, it } from 'vitest';
import { ZERO, add, length, lerp, normalize, scale, sub, vec2 } from './vector2';

describe('Vector2', () => {
  it('adds and subtracts component-wise', () => {
    expect(add(vec2(1, 2), vec2(3, 4))).toEqual(vec2(4, 6));
    expect(sub(vec2(5, 5), vec2(2, 1))).toEqual(vec2(3, 4));
  });

  it('scales both components', () => {
    expect(scale(vec2(2, -3), 2)).toEqual(vec2(4, -6));
  });

  it('computes length via the Pythagorean theorem', () => {
    expect(length(vec2(3, 4))).toBe(5);
  });

  it('normalizes to a unit vector', () => {
    const normalized = normalize(vec2(3, 4));
    expect(normalized.x).toBeCloseTo(0.6);
    expect(normalized.y).toBeCloseTo(0.8);
    expect(length(normalized)).toBeCloseTo(1);
  });

  it('returns ZERO when normalizing the zero vector instead of dividing by zero', () => {
    expect(normalize(ZERO)).toEqual(ZERO);
  });

  it('lerps linearly between two points', () => {
    expect(lerp(vec2(0, 0), vec2(10, 20), 0.5)).toEqual(vec2(5, 10));
    expect(lerp(vec2(0, 0), vec2(10, 20), 0)).toEqual(vec2(0, 0));
    expect(lerp(vec2(0, 0), vec2(10, 20), 1)).toEqual(vec2(10, 20));
  });
});
