/**
 * Procedural POI + prop icons for Station Omega.
 * Map tiles come from Texturelabs via `npm run assets:textures` (world-aligned sheets).
 * POIs 48×48; props 32×32.
 * Run: npm run assets:icons
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const poisDir = join(root, 'public/assets/pois');
const propsDir = join(root, 'public/assets/props');
mkdirSync(poisDir, { recursive: true });
mkdirSync(propsDir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePng(path, width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const png = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
}

function solid(w, h, r, g, b, a = 255) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}

function setPixel(buf, w, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= w) return;
  const h = buf.length / (w * 4);
  if (y >= h) return;
  const i = (y * w + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function getPixel(buf, w, x, y) {
  const i = (y * w + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
}

function fillRect(buf, w, x0, y0, x1, y1, r, g, b, a = 255) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) setPixel(buf, w, x, y, r, g, b, a);
  }
}

function blendPixel(buf, w, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= w) return;
  const h = buf.length / (w * 4);
  if (y >= h) return;
  const [or, og, ob, oa] = getPixel(buf, w, x, y);
  const t = a / 255;
  setPixel(
    buf,
    w,
    x,
    y,
    Math.round(or * (1 - t) + r * t),
    Math.round(og * (1 - t) + g * t),
    Math.round(ob * (1 - t) + b * t),
    Math.max(oa, a),
  );
}

/** Deterministic value noise in [-1, 1]. */
function hash2(x, y, seed) {
  let n = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return ((n >>> 0) % 2001) / 1000 - 1;
}

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, seed, octaves = 3) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x * freq, y * freq, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function clamp(v) {
  return Math.max(0, Math.min(255, v));
}

function rivet(buf, w, x, y, light = true) {
  const rim = light ? [110, 100, 85] : [70, 64, 55];
  const core = light ? [160, 145, 120] : [90, 82, 70];
  const hole = [28, 26, 22];
  fillRect(buf, w, x - 1, y - 1, x + 1, y + 1, rim[0], rim[1], rim[2]);
  setPixel(buf, w, x, y, core[0], core[1], core[2]);
  setPixel(buf, w, x, y - 1, hole[0], hole[1], hole[2]);
}

// --- POIs 48x48 ---
const P = 48;
function consoleChassis() {
  const buf = solid(P, P, 0, 0, 0, 0);
  fillRect(buf, P, 2, 2, P - 3, P - 3, 42, 40, 36, 250);
  for (let y = 3; y <= P - 4; y += 1) {
    for (let x = 3; x <= P - 4; x += 1) {
      const n = fbm(x / 6, y / 6, 101, 3);
      const d = Math.round(n * 8);
      setPixel(buf, P, x, y, clamp(52 + d), clamp(48 + d), clamp(42 + Math.round(d * 0.8)));
    }
  }
  fillRect(buf, P, 3, 3, P - 4, 6, 100, 90, 72, 255);
  fillRect(buf, P, 3, 4, P - 4, 5, 196, 165, 116, 200);
  fillRect(buf, P, 3, P - 6, P - 4, P - 4, 28, 26, 22, 255);
  rivet(buf, P, 7, 10, false);
  rivet(buf, P, P - 8, 10, false);
  rivet(buf, P, 7, P - 9, false);
  rivet(buf, P, P - 8, P - 9, false);
  return buf;
}

function screen(buf, x0, y0, x1, y1, r, g, b) {
  fillRect(buf, P, x0, y0, x1, y1, 20, 18, 16);
  fillRect(buf, P, x0 + 1, y0 + 1, x1 - 1, y1 - 1, r, g, b);
  for (let y = y0 + 2; y < y1; y += 3) {
    for (let x = x0 + 2; x < x1; x += 1) blendPixel(buf, P, x, y, 0, 0, 0, 40);
  }
}

{
  const task = consoleChassis();
  screen(task, 10, 12, 37, 30, 34, 40, 32);
  fillRect(task, P, 14, 16, 18, 20, 212, 160, 23);
  fillRect(task, P, 22, 16, 26, 20, 87, 140, 90);
  fillRect(task, P, 30, 16, 34, 20, 70, 100, 120);
  fillRect(task, P, 12, 34, 35, 38, 40, 38, 34);
  writePng(join(poisDir, 'task.png'), P, P, task);

  const vent = consoleChassis();
  fillRect(vent, P, 10, 14, 37, 33, 30, 28, 26);
  for (let x = 12; x <= 34; x += 5) {
    fillRect(vent, P, x, 15, x + 2, 32, 22, 20, 18);
  }
  writePng(join(poisDir, 'vent.png'), P, P, vent);

  const lights = consoleChassis();
  screen(lights, 12, 12, 35, 32, 50, 44, 28);
  fillRect(lights, P, 16, 16, 22, 28, 212, 160, 23);
  fillRect(lights, P, 25, 16, 31, 28, 255, 220, 140);
  writePng(join(poisDir, 'lights.png'), P, P, lights);

  const reactor = consoleChassis();
  screen(reactor, 12, 12, 35, 32, 48, 28, 24);
  fillRect(reactor, P, 20, 15, 27, 29, 179, 58, 58);
  fillRect(reactor, P, 22, 17, 25, 27, 220, 100, 50);
  writePng(join(poisDir, 'reactor.png'), P, P, reactor);

  const emergency = consoleChassis();
  fillRect(emergency, P, 18, 10, 29, 36, 40, 34, 30);
  fillRect(emergency, P, 20, 12, 27, 18, 179, 58, 58);
  fillRect(emergency, P, 20, 22, 27, 34, 179, 58, 58);
  writePng(join(poisDir, 'emergency.png'), P, P, emergency);
}

// --- props 32x32 ---
const R = 32;
{
  const grate = solid(R, R, 0, 0, 0, 0);
  fillRect(grate, R, 2, 2, 29, 29, 44, 42, 38, 220);
  for (let y = 4; y < 28; y += 3) {
    for (let x = 4; x < 28; x += 1) blendPixel(grate, R, x, y, 20, 18, 16, 180);
  }
  for (let x = 4; x < 28; x += 3) {
    for (let y = 4; y < 28; y += 1) blendPixel(grate, R, x, y, 20, 18, 16, 120);
  }
  rivet(grate, R, 4, 4, false);
  rivet(grate, R, 27, 4, false);
  rivet(grate, R, 4, 27, false);
  rivet(grate, R, 27, 27, false);
  writePng(join(propsDir, 'grate.png'), R, R, grate);

  const pipeH = solid(R, R, 0, 0, 0, 0);
  fillRect(pipeH, R, 0, 11, 31, 20, 70, 64, 55, 240);
  fillRect(pipeH, R, 0, 12, 31, 13, 110, 100, 85, 200);
  fillRect(pipeH, R, 0, 18, 31, 19, 40, 36, 30, 180);
  fillRect(pipeH, R, 6, 10, 9, 21, 90, 82, 70, 255);
  fillRect(pipeH, R, 22, 10, 25, 21, 90, 82, 70, 255);
  writePng(join(propsDir, 'pipeH.png'), R, R, pipeH);

  const pipeV = solid(R, R, 0, 0, 0, 0);
  fillRect(pipeV, R, 11, 0, 20, 31, 70, 64, 55, 240);
  fillRect(pipeV, R, 12, 0, 13, 31, 110, 100, 85, 200);
  fillRect(pipeV, R, 18, 0, 19, 31, 40, 36, 30, 180);
  fillRect(pipeV, R, 10, 6, 21, 9, 90, 82, 70, 255);
  fillRect(pipeV, R, 10, 22, 21, 25, 90, 82, 70, 255);
  writePng(join(propsDir, 'pipeV.png'), R, R, pipeV);

  const caution = solid(R, R, 0, 0, 0, 0);
  for (let y = 12; y <= 19; y += 1) {
    for (let x = 0; x < R; x += 1) {
      const band = Math.floor((x + y) / 5) % 2 === 0;
      if (band) setPixel(caution, R, x, y, 196, 160, 40, 210);
      else setPixel(caution, R, x, y, 28, 26, 22, 210);
    }
  }
  writePng(join(propsDir, 'caution.png'), R, R, caution);
}

console.warn('Wrote POIs (48) + props (32) to public/assets/');
