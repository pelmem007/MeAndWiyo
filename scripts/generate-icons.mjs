import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Чистый генератор PNG-иконок для PWA без внешних зависимостей.
// Рисует закатное небо, силуэт острова с маяком и два тёплых огонька.
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function blendPixel(buf, width, height, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= width || y >= height || a <= 0) return;
  const idx = (y * width + x) * 4;
  const alpha = Math.min(1, Math.max(0, a));
  const inv = 1 - alpha;
  buf[idx] = Math.round(buf[idx] * inv + r * alpha);
  buf[idx + 1] = Math.round(buf[idx + 1] * inv + g * alpha);
  buf[idx + 2] = Math.round(buf[idx + 2] * inv + b * alpha);
  buf[idx + 3] = 255;
}

function drawIcon(size, maskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  const padScale = maskable ? 0.72 : 0.92;

  for (let y = 0; y < size; y++) {
    const v = y / (size - 1);
    // Градиент неба: от тёмно-индиго сверху к тёплому закатно-персиковому у горизонта
    let r, g, b;
    if (v < 0.62) {
      const t = v / 0.62;
      r = lerp(24, 178, t * t);
      g = lerp(30, 88, t * t);
      b = lerp(74, 126, t);
    } else {
      const t = (v - 0.62) / 0.38;
      r = lerp(244, 29, Math.min(1, t * 1.4));
      g = lerp(146, 56, Math.min(1, t * 1.4));
      b = lerp(96, 102, Math.min(1, t * 1.3));
    }
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      buf[idx] = Math.round(r);
      buf[idx + 1] = Math.round(g);
      buf[idx + 2] = Math.round(b);
      buf[idx + 3] = 255;
    }
  }

  // Звёздочки в верхней части неба
  const stars = [
    [0.2, 0.16, 1.4],
    [0.35, 0.11, 1.0],
    [0.72, 0.14, 1.5],
    [0.82, 0.24, 1.1],
    [0.16, 0.29, 1.0],
    [0.62, 0.21, 1.2],
  ];
  for (const [sx, sy, sr] of stars) {
    const cx = sx * size;
    const cy = sy * size;
    const rad = (sr * size) / 128;
    for (let y = Math.floor(cy - rad * 2); y <= Math.ceil(cy + rad * 2); y++) {
      for (let x = Math.floor(cx - rad * 2); x <= Math.ceil(cx + rad * 2); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < rad * 1.5) {
          blendPixel(buf, size, size, x, y, 255, 246, 214, Math.max(0, 1 - d / (rad * 1.5)));
        }
      }
    }
  }

  // Вода внизу и солнечная дорожка
  const horizonY = Math.round(size * 0.64);
  for (let y = horizonY; y < size; y++) {
    const t = (y - horizonY) / (size - horizonY);
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(x / size - 0.5);
      const shimmer = Math.exp(-dx * 10) * (1 - t * 0.6);
      const wave = 0.5 + 0.5 * Math.sin(y * 0.35 + x * 0.1);
      const r = lerp(34, 245, shimmer * (0.4 + 0.4 * wave));
      const g = lerp(64, 168, shimmer * (0.4 + 0.4 * wave));
      const b = lerp(114, 118, shimmer * 0.6);
      blendPixel(buf, size, size, x, y, r, g, b, 0.92);
    }
  }

  // Силуэт холма-острова и маяка в центре (учитываем отступ для maskable)
  const cx = size * 0.5;
  const baseY = size * (0.64 + (1 - padScale) * 0.05);
  const unit = size * padScale;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - cx) / unit;
      const ny = (y - baseY) / unit;

      // Холм острова
      if (ny >= -0.06 && ny <= 0.12 && Math.abs(nx) < 0.34) {
        const hillTop = -0.06 + (nx * nx) * 1.1;
        if (ny >= hillTop) {
          blendPixel(buf, size, size, x, y, 28, 36, 58, 1);
        }
      }

      // Башня маяка
      if (ny >= -0.32 && ny <= -0.03) {
        const halfW = lerp(0.034, 0.062, (ny + 0.32) / 0.29);
        if (Math.abs(nx) <= halfW) {
          const isStripe = Math.floor((ny + 0.32) * 14) % 2 === 0;
          if (isStripe) {
            blendPixel(buf, size, size, x, y, 248, 242, 232, 1);
          } else {
            blendPixel(buf, size, size, x, y, 224, 108, 86, 1);
          }
        }
      }

      // Крыша маяка
      if (ny >= -0.40 && ny < -0.32) {
        const halfW = lerp(0.004, 0.052, (ny + 0.40) / 0.08);
        if (Math.abs(nx) <= halfW) {
          blendPixel(buf, size, size, x, y, 36, 46, 72, 1);
        }
      }
    }
  }

  // Свечение фонаря маяка и два светлячка рядом (символ двух друзей)
  const glows = [
    [0.5, (baseY - unit * 0.31) / size, 0.14 * padScale, [255, 226, 130]],
    [0.5 - 0.14 * padScale, (baseY - unit * 0.12) / size, 0.055 * padScale, [255, 200, 110]],
    [0.5 + 0.15 * padScale, (baseY - unit * 0.15) / size, 0.055 * padScale, [145, 232, 255]],
  ];

  for (const [gx, gy, gr, col] of glows) {
    const px = gx * size;
    const py = gy * size;
    const rad = gr * size;
    for (let y = Math.floor(py - rad); y <= Math.ceil(py + rad); y++) {
      for (let x = Math.floor(px - rad); x <= Math.ceil(px + rad); x++) {
        const d = Math.hypot(x - px, y - py);
        if (d < rad) {
          const falloff = Math.pow(1 - d / rad, 2.1);
          blendPixel(buf, size, size, x, y, col[0], col[1], col[2], falloff);
        }
      }
    }
  }

  return encodePNG(size, size, buf);
}

const publicDir = path.resolve(process.cwd(), 'public');
fs.mkdirSync(publicDir, { recursive: true });

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), drawIcon(192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), drawIcon(512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), drawIcon(512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), drawIcon(180, false));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#181e4a"/>
      <stop offset="58%" stop-color="#b2587e"/>
      <stop offset="100%" stop-color="#f49260"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffe89e" stop-opacity="1"/>
      <stop offset="100%" stop-color="#ffe89e" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#sky)"/>
  <circle cx="110" cy="96" r="5" fill="#fff6d6"/>
  <circle cx="385" cy="84" r="6" fill="#fff6d6"/>
  <circle cx="420" cy="145" r="4" fill="#fff6d6"/>
  <rect x="0" y="330" width="512" height="182" fill="#224072"/>
  <path d="M90 345 Q256 265 422 345 L422 375 L90 375 Z" fill="#1c243a"/>
  <polygon points="238,165 274,165 288,315 224,315" fill="#f8f2e8"/>
  <polygon points="234,210 278,210 282,245 230,245" fill="#e06c56"/>
  <polygon points="256,122 284,165 228,165" fill="#242e48"/>
  <circle cx="256" cy="166" r="58" fill="url(#glow)"/>
  <circle cx="170" cy="260" r="14" fill="#ffc86e"/>
  <circle cx="342" cy="248" r="14" fill="#91e8ff"/>
</svg>
`;
fs.writeFileSync(path.join(publicDir, 'icon.svg'), svg, 'utf8');
console.log('Иконки PWA успешно сгенерированы в папке public/.');
