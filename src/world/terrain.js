import * as THREE from 'three';
import { ISLAND_ZONES } from '../config.js';

export const WATER_LEVEL = 0.0;

// Координаты ключевых объектов и головоломок
export const FOREST_LEDGE = { x: -42, z: -4, radius: 5.8, topY: 6.8, baseY: 3.1 };
export const LAKE_CENTER = { x: 36, z: 8, radius: 14.5 };
export const LAKE_ISLET = { x: 36, z: 8, radius: 4.5 };
export const RUINS_CHASM = { minX: -26, maxX: -10, minZ: -41, maxZ: -34.5 };
export const OBS_SUMMIT = { x: 18, z: -42, radius: 10.5, y: 11.4 };

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function dist2D(x1, z1, x2, z2) {
  return Math.hypot(x1 - x2, z1 - z2);
}

// Базовая детерминированная высота земли на всём острове
export function baseTerrainHeight(x, z) {
  const r = Math.hypot(x, z);

  // Внешнее затухание острова в море (без резких краёв в пустоту)
  const islandMask = 1 - smoothstep(46, 82, r);
  let h = -3.8 + islandMask * 6.0;

  // Лёгкие естественные холмы и волны рельефа
  h += Math.sin(x * 0.065) * Math.cos(z * 0.065) * 0.75 * islandMask;
  h += Math.sin(x * 0.14 + 1.2) * Math.sin(z * 0.12 - 0.5) * 0.35 * islandMask;

  // 1. Деревня у причала (выровненная поляна у южного берега)
  const dVillage = dist2D(x, z, 0, 38);
  const wVillage = 1 - smoothstep(10, 22, dVillage);
  h = THREE.MathUtils.lerp(h, 1.85, wVillage);

  // Мыс маяка
  const dLighthouse = dist2D(x, z, -14, 48);
  const wLighthouse = 1 - smoothstep(4.5, 11, dLighthouse);
  h = THREE.MathUtils.lerp(h, 3.2, wLighthouse);

  // 2. Шепчущий лес (мягкая возвышенность на западе)
  const dForest = dist2D(x, z, -34, 4);
  const wForest = 1 - smoothstep(12, 26, dForest);
  h = THREE.MathUtils.lerp(h, 3.15 + Math.sin(x * 0.18) * 0.25, wForest * 0.8);

  // 3. Зеркальное озеро (впадина ниже уровня воды + центральный островок)
  const dLake = dist2D(x, z, LAKE_CENTER.x, LAKE_CENTER.z);
  const lakePit = 1 - smoothstep(LAKE_CENTER.radius - 4.5, LAKE_CENTER.radius + 3.5, dLake);
  h = THREE.MathUtils.lerp(h, -1.35, lakePit);

  const dIslet = dist2D(x, z, LAKE_ISLET.x, LAKE_ISLET.z);
  const wIslet = 1 - smoothstep(2.6, LAKE_ISLET.radius + 1.4, dIslet);
  h = THREE.MathUtils.lerp(h, 1.55, wIslet);

  // 4. Старые руины (ровное каменное плато на северо-западе)
  const dRuins = dist2D(x, z, -18, -34);
  const wRuins = 1 - smoothstep(12, 23, dRuins);
  h = THREE.MathUtils.lerp(h, 5.2, wRuins);

  // Провал в руинах между основной площадкой и святилищем (закрывается световым мостом)
  if (
    x > RUINS_CHASM.minX &&
    x < RUINS_CHASM.maxX &&
    z > RUINS_CHASM.minZ &&
    z < RUINS_CHASM.maxZ
  ) {
    const cx = smoothstep(RUINS_CHASM.minX, RUINS_CHASM.minX + 1.8, x) *
      (1 - smoothstep(RUINS_CHASM.maxX - 1.8, RUINS_CHASM.maxX, x));
    const cz = smoothstep(RUINS_CHASM.minZ, RUINS_CHASM.minZ + 1.4, z) *
      (1 - smoothstep(RUINS_CHASM.maxZ - 1.4, RUINS_CHASM.maxZ, z));
    h -= cx * cz * 4.2;
  }

  // 5. Горная обсерватория (высокая вершина на северо-востоке + пологий серпантин от центра)
  const dObs = dist2D(x, z, OBS_SUMMIT.x, OBS_SUMMIT.z);
  const wObs = 1 - smoothstep(OBS_SUMMIT.radius - 2, 26, dObs);
  h = THREE.MathUtils.lerp(h, OBS_SUMMIT.y, wObs);

  // Пологая тропа-подъём от центра (6, -12) к вершине (18, -32)
  const tPath = THREE.MathUtils.clamp(((-12 - z) / 22), 0, 1);
  const pathCenterX = THREE.MathUtils.lerp(5, 16, tPath);
  const pathCenterZ = THREE.MathUtils.lerp(-12, -33, tPath);
  const distToPath = dist2D(x, z, pathCenterX, pathCenterZ);
  if (z < -10 && z > -35 && distToPath < 5.5) {
    const pathWeight = 1 - smoothstep(2.2, 5.5, distToPath);
    const targetPathY = THREE.MathUtils.lerp(3.2, OBS_SUMMIT.y - 0.3, tPath);
    h = THREE.MathUtils.lerp(h, targetPathY, pathWeight * 0.9);
  }

  // Пляжный пирс на суше плавно подходит к краю воды
  if (Math.abs(x) < 3.6 && z > 46 && z < 56) {
    h = Math.max(h, 0.9);
  }

  return h;
}

// Итоговая высота поверхности с учётом платформ, мостов, пирса и лесного уступа
export function groundHeightAt(x, z, worldState = null) {
  let h = baseTerrainHeight(x, z);

  // Деревянный пирс у деревни
  if (Math.abs(x) <= 2.2 && z >= 51 && z <= 68) {
    h = Math.max(h, 0.92);
  }

  // Лесной высокий уступ (запрыгнуть можно только с помощью друга или по верёвке)
  const dLedge = dist2D(x, z, FOREST_LEDGE.x, FOREST_LEDGE.z);
  if (dLedge <= FOREST_LEDGE.radius) {
    h = Math.max(h, FOREST_LEDGE.topY);
  }

  // Поднятый мост на Зеркальном озере
  if (worldState?.lakeBridgeOpen) {
    if (x >= 21.5 && x <= 33.5 && Math.abs(z - 8) <= 1.85) {
      h = Math.max(h, 0.85);
    }
  }

  // Световой мост в Старых руинах
  if (worldState?.ruinsBridgeOpen) {
    if (x >= -20.5 && x <= -15.5 && z >= RUINS_CHASM.minZ - 0.5 && z <= RUINS_CHASM.maxZ + 0.5) {
      h = Math.max(h, 5.25);
    }
  }

  return h;
}

export function getZoneAt(x, z) {
  let best = ISLAND_ZONES[0].id;
  let bestScore = Infinity;
  for (const zone of ISLAND_ZONES) {
    const d = dist2D(x, z, zone.x, zone.z) / zone.radius;
    if (d < bestScore) {
      bestScore = d;
      best = zone.id;
    }
  }
  return best;
}

// Генерируем 3-ступенчатый toon градиент (DataTexture) для мягкого аниме-шейдинга
export function createToonGradientTexture(steps = 4) {
  const data = new Uint8Array(steps);
  if (steps === 3) {
    data[0] = 95;
    data[1] = 178;
    data[2] = 255;
  } else {
    data[0] = 88;
    data[1] = 148;
    data[2] = 210;
    data[3] = 255;
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// Процедурная текстура мягкой круглой тени под ногами персонажей и пропов
export function createContactShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(18, 22, 42, 0.52)');
  grad.addColorStop(0.6, 'rgba(18, 22, 42, 0.22)');
  grad.addColorStop(1, 'rgba(18, 22, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Процедурная текстура свечения для светлячков и звёздных частиц
export function createGlowSpriteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.35, 'rgba(255, 240, 180, 0.75)');
  grad.addColorStop(1, 'rgba(255, 220, 120, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Процедурная текстура дерева для домиков, пирса и скамеек
export function createWoodTexture(maxAnisotropy = 4) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#9b6b49';
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 32) {
    ctx.fillStyle = y % 64 === 0 ? '#a87450' : '#916241';
    ctx.fillRect(0, y, 256, 30);
    ctx.fillStyle = '#6c4429';
    ctx.fillRect(0, y + 30, 256, 2);

    ctx.strokeStyle = 'rgba(72, 40, 20, 0.25)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const sy = y + 6 + i * 6;
      ctx.moveTo(0, sy);
      ctx.bezierCurveTo(85, sy + 2, 170, sy - 2, 256, sy);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

// Процедурная текстура древнего камня для руин и обсерватории
export function createStoneTexture(maxAnisotropy = 4) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#939cb0';
  ctx.fillRect(0, 0, 256, 256);

  const tones = ['#858ea3', '#9ea7ba', '#7b8499', '#a6afbf'];
  for (let row = 0; row < 4; row++) {
    const y = row * 64;
    const offset = (row % 2) * 48;
    for (let col = -1; col < 4; col++) {
      const x = col * 96 + offset;
      ctx.fillStyle = tones[(row * 3 + col + 4) % tones.length];
      ctx.fillRect(x + 2, y + 2, 92, 60);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}
