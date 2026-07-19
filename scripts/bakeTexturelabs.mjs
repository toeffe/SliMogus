/**
 * Download Texturelabs metal sources (gitignored) and bake cool-steel
 * PBR sheets (albedo + normal + roughness + AO + metalness) into public/assets/tiles/.
 *
 * License: https://texturelabs.org/terms/
 * Run: npm run assets:textures
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'assets/source/texturelabs');
const tilesDir = join(root, 'public/assets/tiles');
mkdirSync(sourceDir, { recursive: true });
mkdirSync(tilesDir, { recursive: true });

/** Cool steel / panel sources — avoid rusty brown concrete for primary floors. */
const SOURCES = {
  floor: {
    file: 'Texturelabs_Metal_280S.jpg',
    url: 'https://texturelabs.org/wp-content/uploads/Texturelabs_Metal_280S.jpg',
    page: 'https://texturelabs.org/textures/metal_280/',
  },
  floorAlt: {
    file: 'Texturelabs_Metal_145S.jpg',
    url: 'https://texturelabs.org/wp-content/uploads/Texturelabs_Metal_145S.jpg',
    page: 'https://texturelabs.org/textures/metal_145/',
  },
  wall: {
    file: 'Texturelabs_Metal_278S.jpg',
    url: 'https://texturelabs.org/wp-content/uploads/Texturelabs_Metal_278S.jpg',
    page: 'https://texturelabs.org/textures/metal_278/',
  },
  doorFrame: {
    file: 'Texturelabs_Metal_280S.jpg',
    url: 'https://texturelabs.org/wp-content/uploads/Texturelabs_Metal_280S.jpg',
    page: 'https://texturelabs.org/textures/metal_280/',
  },
};

const SHEET = 1024;
/** Floor panel cell size (~8×8). */
const FRAME = 128;
/** Wall bulkhead cell — larger plates read as Dead Space hull panels, not grit wallpaper. */
const WALL_FRAME = 256;

async function ensureSource(entry) {
  const path = join(sourceDir, entry.file);
  if (existsSync(path) && readFileSync(path).byteLength > 50_000) {
    console.warn(`cache hit ${entry.file}`);
    return path;
  }
  console.warn(`fetch ${entry.url}`);
  const res = await fetch(entry.url);
  if (!res.ok) throw new Error(`Failed to download ${entry.url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(path, buf);
  return path;
}

function luminance(buf, w, x, y) {
  const i = (y * w + x) * 3;
  return (buf[i] * 0.299 + buf[i + 1] * 0.587 + buf[i + 2] * 0.114) / 255;
}

function sampleLum(height, size, x, y) {
  const xx = Math.max(0, Math.min(size - 1, x));
  const yy = Math.max(0, Math.min(size - 1, y));
  return height[yy * size + xx];
}

/** Sobel height → tangent-space normal map (OpenGL +Y). */
function bakeNormalMap(height, size, strength = 2.4) {
  const out = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const tl = sampleLum(height, size, x - 1, y - 1);
      const t = sampleLum(height, size, x, y - 1);
      const tr = sampleLum(height, size, x + 1, y - 1);
      const l = sampleLum(height, size, x - 1, y);
      const r = sampleLum(height, size, x + 1, y);
      const bl = sampleLum(height, size, x - 1, y + 1);
      const b = sampleLum(height, size, x, y + 1);
      const br = sampleLum(height, size, x + 1, y + 1);
      const dx = strength * (tr + 2 * r + br - (tl + 2 * l + bl));
      const dy = strength * (bl + 2 * b + br - (tl + 2 * t + tr));
      let nx = -dx;
      let ny = -dy;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 3;
      out[i] = clamp((nx * 0.5 + 0.5) * 255);
      out[i + 1] = clamp((ny * 0.5 + 0.5) * 255);
      out[i + 2] = clamp((nz * 0.5 + 0.5) * 255);
    }
  }
  return out;
}

function bakeRoughnessMap(height, size, base = 0.42, variation = 0.35) {
  const out = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const h = height[y * size + x];
      // Dark grooves → rougher; bright metal → smoother.
      const rough = clamp((base + (1 - h) * variation) * 255);
      const i = (y * size + x) * 3;
      out[i] = rough;
      out[i + 1] = rough;
      out[i + 2] = rough;
    }
  }
  return out;
}

/** Crevice AO from panel grooves + luminance cavities (white = open, dark = occluded). */
function bakeAoMap(height, size, panels, frame = FRAME) {
  const out = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const h = height[y * size + x];
      let ao = 0.55 + h * 0.45;
      if (panels) {
        const gx = x % frame;
        const gy = y % frame;
        const edge = Math.min(gx, frame - 1 - gx, gy, frame - 1 - gy);
        if (edge < 4) ao *= 0.38 + edge * 0.1;
        else if (edge < 12) ao *= 0.68 + (edge - 4) * 0.03;
      }
      // Soft cavity from local height dip.
      const neigh =
        (sampleLum(height, size, x - 2, y) +
          sampleLum(height, size, x + 2, y) +
          sampleLum(height, size, x, y - 2) +
          sampleLum(height, size, x, y + 2)) /
        4;
      if (h < neigh - 0.04) ao *= 0.75;
      const v = clamp(ao * 255);
      const i = (y * size + x) * 3;
      out[i] = v;
      out[i + 1] = v;
      out[i + 2] = v;
    }
  }
  return out;
}

/** High metal on plate faces; lower on dirty seams / painted edges. */
function bakeMetalnessMap(height, size, panels, baseMetal = 0.82, frame = FRAME) {
  const out = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const h = height[y * size + x];
      let m = baseMetal * (0.75 + h * 0.35);
      if (panels) {
        const gx = x % frame;
        const gy = y % frame;
        const edge = Math.min(gx, frame - 1 - gx, gy, frame - 1 - gy);
        if (edge < 5) m *= 0.32;
      }
      const n = ((x * 374761393 + y * 668265263) >>> 0) % 1000;
      if (n < 40) m *= 0.55; // grime / paint chips
      const v = clamp(m * 255);
      const i = (y * size + x) * 3;
      out[i] = v;
      out[i + 1] = v;
      out[i + 2] = v;
    }
  }
  return out;
}

/** Sparse smooth (dark) blotches for wet / oily floor specular hotspots. */
function applyWetPatches(roughness, size, density = 0.012) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = hash2(x, y);
      if (n > density) continue;
      const radius = 8 + Math.floor(hash2(x + 17, y + 91) * 28);
      // Mild damp only — keep ≥0.55 so FPS spotlights don't sparkle.
      const soft = 0.55 + hash2(x + 3, y + 7) * 0.12;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= size || py >= size) continue;
          const d = Math.hypot(dx, dy) / radius;
          if (d > 1) continue;
          const fall = (1 - d) * (1 - d);
          const i = (py * size + px) * 3;
          const target = soft * 255;
          roughness[i] = clamp(roughness[i] * (1 - fall * 0.85) + target * fall * 0.85);
          roughness[i + 1] = roughness[i];
          roughness[i + 2] = roughness[i];
        }
      }
    }
  }
}

function hash2(x, y) {
  let h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function applyPanels(out, w, groove = 0.55, frame = FRAME) {
  for (let y = 0; y < SHEET; y += 1) {
    for (let x = 0; x < SHEET; x += frame) {
      scalePixel(out, w, x, y, groove);
      if (x + 1 < SHEET) scalePixel(out, w, x + 1, y, 1.22);
      if (x + 2 < SHEET) scalePixel(out, w, x + 2, y, 0.9);
    }
  }
  for (let x = 0; x < SHEET; x += 1) {
    for (let y = 0; y < SHEET; y += frame) {
      scalePixel(out, w, x, y, groove);
      if (y + 1 < SHEET) scalePixel(out, w, x, y + 1, 1.22);
      if (y + 2 < SHEET) scalePixel(out, w, x, y + 2, 0.9);
    }
  }
  for (let y = frame / 2; y < SHEET; y += frame) {
    for (let x = frame / 2; x < SHEET; x += frame) {
      for (const [dx, dy] of [
        [0, 0],
        [3, 0],
        [0, 3],
        [3, 3],
      ]) {
        const px = Math.min(SHEET - 1, x + dx);
        const py = Math.min(SHEET - 1, y + dy);
        scalePixel(out, w, px, py, 1.45);
        if (px + 1 < SHEET) scalePixel(out, w, px + 1, py, 0.7);
      }
    }
  }
}

/**
 * Dead Space–style bulkhead: large plates, deep seams, inset recess, rivet corners.
 * Dominates the source photo so walls read as panels, not painted grit.
 */
function applyBulkheadPanels(out, w, frame = WALL_FRAME) {
  const inset = Math.floor(frame * 0.12);
  const groove = 0.28;
  // Deep primary seams.
  applyPanels(out, w, groove, frame);
  // Widen seam darkening (3–4 px).
  for (let y = 0; y < SHEET; y += 1) {
    for (let x = 0; x < SHEET; x += frame) {
      for (let k = 0; k < 4; k += 1) {
        if (x + k < SHEET) scalePixel(out, w, x + k, y, k === 0 ? 0.55 : 0.82);
      }
    }
  }
  for (let x = 0; x < SHEET; x += 1) {
    for (let y = 0; y < SHEET; y += frame) {
      for (let k = 0; k < 4; k += 1) {
        if (y + k < SHEET) scalePixel(out, w, x, y + k, k === 0 ? 0.55 : 0.82);
      }
    }
  }
  // Inset plate recess per cell + plate-to-plate value jitter + mid-rails.
  for (let cy = 0; cy < SHEET; cy += frame) {
    for (let cx = 0; cx < SHEET; cx += frame) {
      const plateTint = 0.78 + hash2(cx, cy) * 0.32;
      const midRail = hash2(cx + 3, cy + 9) > 0.45;
      const midY = cy + Math.floor(frame * 0.5);
      for (let y = cy + inset; y < cy + frame - inset && y < SHEET; y += 1) {
        for (let x = cx + inset; x < cx + frame - inset && x < SHEET; x += 1) {
          const edge = Math.min(
            x - (cx + inset),
            cx + frame - inset - 1 - x,
            y - (cy + inset),
            cy + frame - inset - 1 - y,
          );
          let factor = edge < 8 ? 0.62 + edge * 0.04 : plateTint;
          // Vertical wear streaks (oil / scrub marks).
          if (hash2(x, cy) > 0.92) factor *= 0.82 + hash2(x, y) * 0.12;
          scalePixel(out, w, x, y, factor);
        }
      }
      if (midRail) {
        for (let x = cx + inset; x < cx + frame - inset && x < SHEET; x += 1) {
          for (let k = -2; k <= 2; k += 1) {
            const py = midY + k;
            if (py < 0 || py >= SHEET) continue;
            scalePixel(out, w, x, py, k === 0 ? 0.45 : 0.7);
          }
        }
      }
      // Rivet clusters at plate corners + mid-edge.
      const rivets = [
        [inset + 6, inset + 6],
        [frame - inset - 8, inset + 6],
        [inset + 6, frame - inset - 8],
        [frame - inset - 8, frame - inset - 8],
        [Math.floor(frame / 2), inset + 5],
        [Math.floor(frame / 2), frame - inset - 7],
      ];
      for (const [ox, oy] of rivets) {
        const px = cx + ox;
        const py = cy + oy;
        if (px < 0 || py < 0 || px >= SHEET || py >= SHEET) continue;
        scalePixel(out, w, px, py, 1.55);
        if (px + 1 < SHEET) scalePixel(out, w, px + 1, py, 0.65);
        if (py + 1 < SHEET) scalePixel(out, w, px, py + 1, 0.65);
      }
    }
  }
}

function applyMicroDetail(out, w) {
  for (let y = 0; y < SHEET; y += 1) {
    for (let x = 0; x < SHEET; x += 1) {
      const n = ((x * 374761393 + y * 668265263) >>> 0) % 1000;
      if (n < 18) scalePixel(out, w, x, y, 0.88 + (n % 7) * 0.02);
      if (n > 985) scalePixel(out, w, x, y, 1.08);
    }
  }
}

/** Darken panel corners / floor edges with procedural grime. */
function applyGrime(out, w, amount = 0.12, frame = FRAME) {
  const reach = Math.max(18, Math.floor(frame * 0.22));
  for (let y = 0; y < SHEET; y += 1) {
    for (let x = 0; x < SHEET; x += 1) {
      const gx = x % frame;
      const gy = y % frame;
      const corner = Math.min(gx, frame - 1 - gx) + Math.min(gy, frame - 1 - gy);
      if (corner > reach) continue;
      const t = (1 - corner / reach) * amount;
      const n = hash2(x, y) * 0.4 + 0.6;
      scalePixel(out, w, x, y, 1 - t * n);
    }
  }
}

/** Cool steel grade + derived PBR maps. */
async function bakeSheet(sourcePath, role, options) {
  const {
    brightness = 1,
    saturation = 0.35,
    cool = 1,
    panels = false,
    bulkhead = false,
    contrast = 1.12,
    normalStrength = 2.4,
    roughBase = 0.42,
    wetPatches = false,
    warmTint = false,
    metalBase = 0.82,
    grime = 0.1,
    microDetail = true,
    blurSource = 0,
  } = options;

  const frame = bulkhead ? WALL_FRAME : FRAME;

  const tint = warmTint
    ? { r: 145, g: 128, b: 110 }
    : { r: 105, g: 128, b: 148 };

  let pipeline = sharp(sourcePath).resize({
    width: SHEET,
    height: SHEET,
    fit: 'cover',
    position: 'centre',
  });
  // Soften source brush/noise so procedural bulkhead seams dominate on walls.
  if (blurSource > 0) pipeline = pipeline.blur(blurSource);
  pipeline = pipeline
    .modulate({ brightness, saturation })
    .recomb([
      [0.68, 0.14, 0.14],
      [0.1, 0.72, 0.18],
      [0.12, 0.22, 0.96 * cool],
    ])
    .linear(contrast, -(12 + contrast * 4))
    .tint(tint);

  const { data, info } = await pipeline.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const albedo = Buffer.from(data);
  const w = info.width;

  if (bulkhead) applyBulkheadPanels(albedo, w, frame);
  else if (panels) applyPanels(albedo, w, role === 'wall' ? 0.42 : 0.52, frame);
  if (microDetail) applyMicroDetail(albedo, w);
  applyGrime(albedo, w, grime, frame);
  softWrapEdges(albedo, SHEET);

  const height = new Float32Array(SHEET * SHEET);
  for (let y = 0; y < SHEET; y += 1) {
    for (let x = 0; x < SHEET; x += 1) {
      height[y * SHEET + x] = luminance(albedo, w, x, y);
    }
  }
  if (panels || bulkhead) {
    for (let y = 0; y < SHEET; y += 1) {
      for (let x = 0; x < SHEET; x += frame) {
        height[y * SHEET + x] *= 0.22;
        if (x + 1 < SHEET) height[y * SHEET + x + 1] *= 0.4;
        if (x + 2 < SHEET) height[y * SHEET + x + 2] *= 0.58;
        if (x + 3 < SHEET) height[y * SHEET + x + 3] *= 0.75;
      }
    }
    for (let x = 0; x < SHEET; x += 1) {
      for (let y = 0; y < SHEET; y += frame) {
        height[y * SHEET + x] *= 0.22;
        if (y + 1 < SHEET) height[(y + 1) * SHEET + x] *= 0.4;
        if (y + 2 < SHEET) height[(y + 2) * SHEET + x] *= 0.58;
        if (y + 3 < SHEET) height[(y + 3) * SHEET + x] *= 0.75;
      }
    }
  }

  const normal = bakeNormalMap(height, SHEET, normalStrength);
  const roughness = bakeRoughnessMap(height, SHEET, roughBase, 0.42);
  if (wetPatches) applyWetPatches(roughness, SHEET, role === 'floor' ? 0.014 : 0.008);
  const ao = bakeAoMap(height, SHEET, panels || bulkhead, frame);
  const metal = bakeMetalnessMap(height, SHEET, panels || bulkhead, metalBase, frame);

  const names = {
    sheet: `${role}-sheet.png`,
    normal: `${role}-normal.png`,
    rough: `${role}-rough.png`,
    ao: `${role}-ao.png`,
    metal: `${role}-metal.png`,
  };

  await Promise.all([
    sharp(albedo, { raw: { width: SHEET, height: SHEET, channels: 3 } })
      .png()
      .toFile(join(tilesDir, names.sheet)),
    sharp(normal, { raw: { width: SHEET, height: SHEET, channels: 3 } })
      .png()
      .toFile(join(tilesDir, names.normal)),
    sharp(roughness, { raw: { width: SHEET, height: SHEET, channels: 3 } })
      .png()
      .toFile(join(tilesDir, names.rough)),
    sharp(ao, { raw: { width: SHEET, height: SHEET, channels: 3 } })
      .png()
      .toFile(join(tilesDir, names.ao)),
    sharp(metal, { raw: { width: SHEET, height: SHEET, channels: 3 } })
      .png()
      .toFile(join(tilesDir, names.metal)),
  ]);

  console.warn(
    `wrote ${names.sheet}, ${names.normal}, ${names.rough}, ${names.ao}, ${names.metal}`,
  );
}

function scalePixel(buf, w, x, y, factor) {
  const i = (y * w + x) * 3;
  buf[i] = clamp(buf[i] * factor);
  buf[i + 1] = clamp(buf[i + 1] * factor);
  buf[i + 2] = clamp(buf[i + 2] * factor);
}

function softWrapEdges(buf, size) {
  const edge = 24;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < edge; x += 1) {
      const t = 0.5 * (1 - x / edge);
      blendToward(buf, size, x, y, size - edge + x, y, t);
      blendToward(buf, size, size - 1 - x, y, edge - 1 - x, y, t);
    }
  }
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < edge; y += 1) {
      const t = 0.5 * (1 - y / edge);
      blendToward(buf, size, x, y, x, size - edge + y, t);
      blendToward(buf, size, x, size - 1 - y, x, edge - 1 - y, t);
    }
  }
}

function blendToward(buf, size, x, y, ox, oy, t) {
  const i = (y * size + x) * 3;
  const j = (oy * size + ox) * 3;
  buf[i] = clamp(buf[i] * (1 - t) + buf[j] * t);
  buf[i + 1] = clamp(buf[i + 1] * (1 - t) + buf[j + 1] * t);
  buf[i + 2] = clamp(buf[i + 2] * (1 - t) + buf[j + 2] * t);
}

function clamp(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

async function main() {
  const paths = {};
  for (const [key, entry] of Object.entries(SOURCES)) {
    paths[key] = await ensureSource(entry);
  }

  await bakeSheet(paths.floor, 'floor', {
    brightness: 0.72,
    saturation: 0.18,
    cool: 1.12,
    contrast: 1.28,
    panels: true,
    normalStrength: 4.2,
    roughBase: 0.55,
    wetPatches: true,
    metalBase: 0.88,
    grime: 0.12,
  });
  await bakeSheet(paths.floorAlt, 'floorAlt', {
    brightness: 0.66,
    saturation: 0.16,
    cool: 1.14,
    contrast: 1.26,
    panels: true,
    normalStrength: 3.9,
    roughBase: 0.58,
    wetPatches: true,
    metalBase: 0.8,
    grime: 0.14,
  });
  await bakeSheet(paths.wall, 'wall', {
    brightness: 0.48,
    saturation: 0.1,
    cool: 1.05,
    contrast: 1.28,
    panels: true,
    bulkhead: true,
    blurSource: 1.6,
    microDetail: false,
    normalStrength: 5.8,
    roughBase: 0.72,
    metalBase: 0.55,
    grime: 0.32,
  });
  await bakeSheet(paths.doorFrame, 'doorFrame', {
    brightness: 0.7,
    saturation: 0.3,
    cool: 0.9,
    contrast: 1.3,
    panels: true,
    normalStrength: 3.8,
    roughBase: 0.42,
    warmTint: true,
    metalBase: 0.9,
    grime: 0.08,
  });

  const credits = Object.entries(SOURCES)
    .map(([role, entry]) => `- ${role}: ${entry.file} — ${entry.page}`)
    .join('\n');
  writeFileSync(
    join(sourceDir, 'SOURCES.md'),
    `# Texturelabs sources (do not redistribute)\n\nCool-steel PBR bake (albedo/normal/rough/ao/metal).\nTerms: https://texturelabs.org/terms/\n\n${credits}\n`,
  );
  writeFileSync(
    join(tilesDir, 'CREDITS.txt'),
    `Floor/wall PBR textures derived from Texturelabs.org (cool-steel grade).\nhttps://texturelabs.org/\n`,
  );

  console.warn('Done. Cool-steel PBR sheets written.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
