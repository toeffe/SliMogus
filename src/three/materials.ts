import {
  CanvasTexture,
  ClampToEdgeWrapping,
  MeshStandardMaterial,
  SRGBColorSpace,
  NoColorSpace,
  TextureLoader,
  RepeatWrapping,
  Vector2,
  type Texture,
  type MeshStandardMaterialParameters,
} from 'three';

export interface StationMaterials {
  floor: MeshStandardMaterial;
  floorAlt: MeshStandardMaterial;
  wall: MeshStandardMaterial;
  doorFrame: MeshStandardMaterial;
  hull: MeshStandardMaterial;
  hullWindow: MeshStandardMaterial;
  trim: MeshStandardMaterial;
  panel: MeshStandardMaterial;
  pipe: MeshStandardMaterial;
  grate: MeshStandardMaterial;
  hazard: MeshStandardMaterial;
  ceiling: MeshStandardMaterial;
  emissiveCyan: MeshStandardMaterial;
  /** CC0 sci-fi UI screens (rubberduck / OpenGameArt). */
  screenConsole: MeshStandardMaterial;
  screenMed: MeshStandardMaterial;
  screenReactor: MeshStandardMaterial;
  screenPower: MeshStandardMaterial;
  /** Mattress top (single cross, clamp). */
  medBed: MeshStandardMaterial;
  /** Bed frame / rails (metal pack). */
  medFrame: MeshStandardMaterial;
  /** Sci-fi panel metal (ambientCG) — general industrial props. */
  propMetal: MeshStandardMaterial;
  propBrushed: MeshStandardMaterial;
  /** Painted chassis reserved for task terminals (not shared with room kit). */
  terminalHousing: MeshStandardMaterial;
  propCrate: MeshStandardMaterial;
  reactorEnergy: MeshStandardMaterial;
  dispose: () => void;
}

async function loadPackPbr(
  colorPath: string,
  normalPath: string,
  roughPath: string,
  metalPath: string | null,
  params: MeshStandardMaterialParameters,
  worldUvScale: number,
): Promise<{ mat: MeshStandardMaterial; maps: Texture[] }> {
  const [map, normalMap, roughnessMap, metalnessMap] = await Promise.all([
    loadColor(colorPath),
    loadData(normalPath),
    loadData(roughPath),
    metalPath ? loadData(metalPath) : Promise.resolve(null),
  ]);
  const mat = new MeshStandardMaterial({
    map,
    normalMap,
    roughnessMap,
    ...(metalnessMap ? { metalnessMap } : {}),
    metalness: metalnessMap ? 1 : (params.metalness ?? 0.6),
    roughness: 1,
    envMapIntensity: 0,
    ...params,
  });
  mat.normalScale = new Vector2(1.1, 1.1);
  enableWorldAlignedUv(mat, worldUvScale);
  const maps = [map, normalMap, roughnessMap];
  if (metalnessMap) maps.push(metalnessMap);
  return { mat, maps };
}

async function loadColor(path: string): Promise<Texture> {
  const texture = await new TextureLoader().loadAsync(path);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

async function loadData(path: string): Promise<Texture> {
  const texture = await new TextureLoader().loadAsync(path);
  texture.colorSpace = NoColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Axis-projected world UVs (cheap triplanar).
 * Floors use XZ; walls use XY/ZY so height tiles correctly.
 * Pure XZ on walls smears one texture row into vertical pinstripes.
 */
function enableWorldAlignedUv(material: MeshStandardMaterial, scale: number): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.worldUvScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float worldUvScale;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#if defined( USE_MAP ) || defined( USE_NORMALMAP ) || defined( USE_ROUGHNESSMAP ) || defined( USE_AOMAP ) || defined( USE_METALNESSMAP )
  {
    vec4 worldPosUv = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      worldPosUv = instanceMatrix * worldPosUv;
    #endif
    worldPosUv = modelMatrix * worldPosUv;
    vec3 worldN = objectNormal;
    #ifdef USE_INSTANCING
      worldN = mat3( instanceMatrix ) * worldN;
    #endif
    worldN = normalize( mat3( modelMatrix ) * worldN );
    vec3 an = abs( worldN );
    vec2 triUv;
    if ( an.y >= an.x && an.y >= an.z ) {
      triUv = worldPosUv.xz;
    } else if ( an.x >= an.z ) {
      triUv = worldPosUv.zy;
    } else {
      triUv = worldPosUv.xy;
    }
    triUv *= worldUvScale;
    #ifdef USE_MAP
      vMapUv = triUv;
    #endif
    #ifdef USE_NORMALMAP
      vNormalMapUv = triUv;
    #endif
    #ifdef USE_ROUGHNESSMAP
      vRoughnessMapUv = triUv;
    #endif
    #ifdef USE_AOMAP
      vAoMapUv = triUv;
    #endif
    #ifdef USE_METALNESSMAP
      vMetalnessMapUv = triUv;
    #endif
  }
#endif`,
      );
  };
  material.customProgramCacheKey = () => `worldUvTri:${scale}`;
}

async function makePbr(
  role: string,
  params: MeshStandardMaterialParameters,
  worldUvScale: number,
  normalStrength = 1.15,
): Promise<{ mat: MeshStandardMaterial; maps: Texture[] }> {
  const [map, normalMap, roughnessMap, aoMap, metalnessMap] = await Promise.all([
    loadColor(`assets/tiles/${role}-sheet.png`),
    loadData(`assets/tiles/${role}-normal.png`),
    loadData(`assets/tiles/${role}-rough.png`),
    loadData(`assets/tiles/${role}-ao.png`),
    loadData(`assets/tiles/${role}-metal.png`),
  ]);
  const mat = new MeshStandardMaterial({
    map,
    normalMap,
    roughnessMap,
    aoMap,
    metalnessMap,
    metalness: 1,
    roughness: 1,
    aoMapIntensity: 0.85,
    envMapIntensity: 0,
    ...params,
  });
  mat.normalScale = new Vector2(normalStrength, normalStrength);
  enableWorldAlignedUv(mat, worldUvScale);
  return { mat, maps: [map, normalMap, roughnessMap, aoMap, metalnessMap] };
}

function solidMat(params: MeshStandardMaterialParameters): MeshStandardMaterial {
  return new MeshStandardMaterial({
    metalness: 0.25,
    roughness: 0.65,
    envMapIntensity: 0,
    ...params,
  });
}

function makeHazardTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  // Isotropic 45° chevrons — anisotropic repeat was shearing these into "crooked" bands.
  ctx.fillStyle = '#121418';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#c4a020';
  const stripe = 16;
  for (let i = -64; i < 128; i += stripe) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + stripe / 2, 0);
    ctx.lineTo(i + stripe / 2 + 64, 64);
    ctx.lineTo(i + 64, 64);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.needsUpdate = true;
  return tex;
}

async function makeScreenMat(
  path: string,
  tint: number,
  emissive: number,
  intensity: number,
): Promise<{ mat: MeshStandardMaterial; map: Texture }> {
  const map = await loadColor(path);
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  map.repeat.set(1, 1);
  const mat = solidMat({
    map,
    emissiveMap: map,
    color: tint,
    emissive,
    emissiveIntensity: intensity,
    metalness: 0.15,
    roughness: 0.35,
    envMapIntensity: 0,
  });
  return { mat, map };
}

function cloneMapped(
  source: MeshStandardMaterial,
  color: number,
  metalness: number,
  roughness: number,
  worldUvScale: number,
): MeshStandardMaterial {
  const mat = source.clone();
  mat.color.setHex(color);
  mat.metalness = metalness;
  mat.roughness = roughness;
  mat.envMapIntensity = 0;
  mat.map = source.map;
  mat.normalMap = source.normalMap;
  mat.roughnessMap = source.roughnessMap;
  mat.aoMap = source.aoMap;
  mat.metalnessMap = source.metalnessMap;
  mat.normalScale = source.normalScale.clone();
  enableWorldAlignedUv(mat, worldUvScale);
  return mat;
}

export async function createStationMaterials(): Promise<StationMaterials> {
  // Safe metalness scalars + maps kept (wet bake already ≥ ~0.48 roughness).
  const floorPack = await makePbr(
    'floor',
    { color: 0xb8c0c8, metalness: 0.4, envMapIntensity: 0 },
    0.5,
    1.3,
  );
  const floorAltPack = await makePbr(
    'floorAlt',
    { color: 0xa8b0b8, metalness: 0.38, envMapIntensity: 0 },
    0.5,
    1.25,
  );
  // Larger world scale → fewer, chunkier bulkhead panels (Dead Space read).
  const wallPack = await makePbr(
    'wall',
    { color: 0x8a929a, metalness: 0.32, envMapIntensity: 0 },
    0.28,
    1.55,
  );
  const doorPack = await makePbr(
    'doorFrame',
    {
      color: 0xb09a70,
      metalness: 0.45,
      emissive: 0x1a1408,
      emissiveIntensity: 0.12,
      envMapIntensity: 0,
    },
    0.5,
    1.25,
  );

  const hull = cloneMapped(wallPack.mat, 0x2e363e, 0.4, 1, 0.22);
  hull.roughness = 1;

  const hullWindow = solidMat({
    color: 0x4a90c8,
    metalness: 0.15,
    roughness: 0.12,
    emissive: 0x1a5080,
    emissiveIntensity: 0.85,
    transparent: true,
    opacity: 0.8,
  });

  const trim = cloneMapped(wallPack.mat, 0x2a3038, 0.4, 1, 0.4);
  const panel = cloneMapped(wallPack.mat, 0x3a4450, 0.32, 1, 0.32);
  const ceiling = cloneMapped(floorPack.mat, 0x262c34, 0.28, 1, 0.35);
  const pipeMap = await loadColor('assets/props/pipeV.png');
  pipeMap.repeat.set(2, 2);
  const pipe = solidMat({
    map: pipeMap,
    color: 0xc8b090,
    metalness: 0.45,
    roughness: 0.5,
  });
  const grateMap = await loadColor('assets/props/grate.png');
  grateMap.repeat.set(2, 2);
  const grate = solidMat({
    map: grateMap,
    color: 0x889099,
    metalness: 0.55,
    roughness: 0.45,
  });
  const hazardMap = makeHazardTexture();
  const hazard = solidMat({
    map: hazardMap,
    color: 0xffffff,
    metalness: 0.35,
    roughness: 0.55,
    emissive: 0x2a1c00,
    emissiveIntensity: 0.18,
  });
  const emissiveCyan = solidMat({
    color: 0x40c8e0,
    metalness: 0.2,
    roughness: 0.3,
    emissive: 0x20a0c0,
    emissiveIntensity: 1.8,
    envMapIntensity: 0,
  });

  const [
    screenConsolePack,
    screenMedPack,
    screenReactorPack,
    screenPowerPack,
    propMetalPack,
    propBrushedPack,
    terminalHousingPack,
    propCratePack,
    reactorEnergyPack,
    medPadMap,
  ] = await Promise.all([
    makeScreenMat('assets/ui/screen-console.png', 0xa0c8e0, 0x2080a0, 1.35),
    makeScreenMat('assets/ui/screen-med.png', 0xb0e8e0, 0x30a090, 1.45),
    makeScreenMat('assets/ui/screen-reactor.png', 0xffa080, 0xe04020, 1.7),
    makeScreenMat('assets/ui/screen-power.png', 0xe8ffff, 0xa0f0ff, 2.2),
    loadPackPbr(
      'assets/props/metal/panel-color.jpg',
      'assets/props/metal/panel-normal.jpg',
      'assets/props/metal/panel-rough.jpg',
      'assets/props/metal/panel-metal.jpg',
      { color: 0xffffff },
      0.55,
    ),
    loadPackPbr(
      'assets/props/metal/brushed-color.jpg',
      'assets/props/metal/brushed-normal.jpg',
      'assets/props/metal/brushed-rough.jpg',
      null,
      { color: 0xffffff, metalness: 0.85 },
      0.7,
    ),
    loadPackPbr(
      'assets/props/metal/painted-color.jpg',
      'assets/props/metal/painted-normal.jpg',
      'assets/props/metal/painted-rough.jpg',
      null,
      { color: 0xffffff, metalness: 0.7 },
      0.65,
    ),
    loadPackPbr(
      'assets/props/crate/cardboard-color.jpg',
      'assets/props/crate/cardboard-normal.jpg',
      'assets/props/crate/cardboard-rough.jpg',
      null,
      { color: 0xffffff, metalness: 0.05 },
      0.9,
    ),
    loadPackPbr(
      'assets/props/reactor/energy-color.jpg',
      'assets/props/reactor/energy-normal.jpg',
      'assets/props/reactor/energy-rough.jpg',
      null,
      {
        color: 0xff8060,
        metalness: 0.2,
        emissive: 0xe04020,
        emissiveIntensity: 1.6,
      },
      0.45,
    ),
    loadColor('assets/props/med/pad.png'),
  ]);

  medPadMap.wrapS = ClampToEdgeWrapping;
  medPadMap.wrapT = ClampToEdgeWrapping;
  medPadMap.repeat.set(1, 1);
  const medBed = solidMat({
    map: medPadMap,
    color: 0xffffff,
    metalness: 0.08,
    roughness: 0.78,
    envMapIntensity: 0,
  });
  const medFrame = propBrushedPack.mat.clone();
  medFrame.color.setHex(0xd0d8dc);
  enableWorldAlignedUv(medFrame, 0.85);

  const terminalHousing = terminalHousingPack.mat;
  terminalHousing.color.setHex(0x3a4550);

  if (reactorEnergyPack.mat.map) {
    reactorEnergyPack.mat.emissiveMap = reactorEnergyPack.mat.map;
  }
  reactorEnergyPack.mat.emissiveIntensity = 1.8;

  const allMaps = [
    ...floorPack.maps,
    ...floorAltPack.maps,
    ...wallPack.maps,
    ...doorPack.maps,
    ...propMetalPack.maps,
    ...propBrushedPack.maps,
    ...terminalHousingPack.maps,
    ...propCratePack.maps,
    ...reactorEnergyPack.maps,
    screenConsolePack.map,
    screenMedPack.map,
    screenReactorPack.map,
    screenPowerPack.map,
    medPadMap,
    pipeMap,
    grateMap,
  ];
  const extras = [
    trim,
    panel,
    pipe,
    grate,
    ceiling,
    hazard,
    emissiveCyan,
    hullWindow,
    screenConsolePack.mat,
    screenMedPack.mat,
    screenReactorPack.mat,
    screenPowerPack.mat,
    medBed,
    medFrame,
    propMetalPack.mat,
    propBrushedPack.mat,
    terminalHousing,
    propCratePack.mat,
    reactorEnergyPack.mat,
  ];

  return {
    floor: floorPack.mat,
    floorAlt: floorAltPack.mat,
    wall: wallPack.mat,
    doorFrame: doorPack.mat,
    hull,
    hullWindow,
    trim,
    panel,
    pipe,
    grate,
    hazard,
    ceiling,
    emissiveCyan,
    screenConsole: screenConsolePack.mat,
    screenMed: screenMedPack.mat,
    screenReactor: screenReactorPack.mat,
    screenPower: screenPowerPack.mat,
    medBed,
    medFrame,
    propMetal: propMetalPack.mat,
    propBrushed: propBrushedPack.mat,
    terminalHousing,
    propCrate: propCratePack.mat,
    reactorEnergy: reactorEnergyPack.mat,
    dispose: () => {
      floorPack.mat.dispose();
      floorAltPack.mat.dispose();
      wallPack.mat.dispose();
      doorPack.mat.dispose();
      hull.dispose();
      for (const m of extras) m.dispose();
      for (const t of allMaps) t.dispose();
      hazardMap.dispose();
    },
  };
}
