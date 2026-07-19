export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

export function vec2(x: number, y: number): Vector2 {
  return { x, y };
}

export const ZERO: Vector2 = vec2(0, 0);

export function add(a: Vector2, b: Vector2): Vector2 {
  return vec2(a.x + b.x, a.y + b.y);
}

export function sub(a: Vector2, b: Vector2): Vector2 {
  return vec2(a.x - b.x, a.y - b.y);
}

export function scale(v: Vector2, s: number): Vector2 {
  return vec2(v.x * s, v.y * s);
}

export function length(v: Vector2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function normalize(v: Vector2): Vector2 {
  const len = length(v);
  return len === 0 ? ZERO : scale(v, 1 / len);
}

export function lerp(a: Vector2, b: Vector2, t: number): Vector2 {
  return vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
}
