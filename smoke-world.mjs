// Headless smoke test: run the real createWorld() pipeline on Dawn (vgpu/node),
// then read back the composite scene texture via the debugCapture hook and write it as a PNG.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err?.message || err);
  if (err?.cause) console.error('  cause:', err.cause?.message || err.cause);
});

// --- minimal DOM stubs ---
import zlib from 'node:zlib';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

globalThis.window = {
  devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {},
};
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 33);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

const SMOKE_W = Number(process.env.SMOKE_W || 640);
const SMOKE_H = Number(process.env.SMOKE_H || 400);
const canvas = {
  width: SMOKE_W,
  height: SMOKE_H,
  style: {},
  addEventListener() {}, removeEventListener() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: SMOKE_W, height: SMOKE_H }),
  getContext(kind) {
    if (kind !== 'webgpu') return null;
    return {
      canvas: this,
      swapTex: null,
      configure(cfg) {
        this.swapTex = cfg.device.createTexture({
          size: [canvas.width, canvas.height],
          format: cfg.format,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
        });
      },
      getCurrentTexture() { return this.swapTex; },
      get configuration() { return { format: 'bgra8unorm' }; },
      unconfigure() {},
    };
  },
};

const { createWorld } = await import('./src/world/world.js');

let statCount = 0;
let lastStats = null;
let world = null;

function acesFilm(x) {
  const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  const v = (x * (a * x + b)) / (x * (c * x + d) + e);
  return Math.max(0, Math.min(1, v));
}

function to8(v) {
  // ACES tonemap + gamma, matching post.wgsl
  const t = Math.pow(acesFilm(v), 1 / 2.2);
  return Math.round(t * 255);
}

function writeFloatsPng(file, floats, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      raw[o++] = to8(floats[i]);
      raw[o++] = to8(floats[i + 1]);
      raw[o++] = to8(floats[i + 2]);
      raw[o++] = 255;
    }
  }
  const crcTable = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const td = Buffer.concat([Buffer.from(type), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
  console.log('PNG saved:', file, `${w}x${h}`);
}

const outDir = new URL('./world-shots/', import.meta.url);
fs.mkdirSync(outDir, { recursive: true });
await new Promise((resolve) => {
  const timeout = setTimeout(() => { console.log('TIMEOUT: no debugCapture within 150s'); resolve(null); }, 150000);
  createWorld({
    canvas,
    onStats: (s) => { statCount++; lastStats = s; },
    onSelectNode: () => {},
    debugCapture: ({ floats, size }) => {
      clearTimeout(timeout);
      console.log('debugCapture fired, size:', size, 'floats:', floats.length);
      const rawBuf = Buffer.alloc(floats.length * 4);
      for (let i = 0; i < floats.length; i++) rawBuf.writeFloatLE(floats[i], i * 4);
      fs.writeFileSync(fileURLToPath(new URL('render.raw', outDir)), rawBuf);
      // float statistics (rgb channels only)
      let nz = 0, n = 0, sum = 0, maxV = 0, nan = 0;
      for (let i = 0; i < floats.length; i += 4) {
        const r = floats[i], g = floats[i + 1], b = floats[i + 2];
        n++;
        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) { nan++; continue; }
        const lum = (r + g + b) / 3;
        if (lum > 0.001) nz++;
        sum += lum;
        if (lum > maxV) maxV = lum;
      }
      console.log(`float stats: nonzero=${(nz / n * 100).toFixed(1)}% nan=${nan} mean=${(sum / n).toFixed(4)} max=${maxV.toFixed(3)}`);
      // ascii luminance grid (downsampled)
      const gw = 24, gh = 10;
      let grid = '';
      for (let gy = 0; gy < gh; gy++) {
        for (let gx = 0; gx < gw; gx++) {
          let acc = 0, cnt = 0;
          for (let y = Math.floor(gy * size[1] / gh); y < Math.floor((gy + 1) * size[1] / gh); y += 4) {
            for (let x = Math.floor(gx * size[0] / gw); x < Math.floor((gx + 1) * size[0] / gw); x += 4) {
              const i = (y * size[0] + x) * 4;
              acc += (floats[i] + floats[i + 1] + floats[i + 2]) / 3;
              cnt++;
            }
          }
          const m = acc / cnt;
          const c = m < 0.01 ? '.' : m < 0.05 ? ':' : m < 0.2 ? '+' : m < 1 ? '#' : '@';
          grid += c;
        }
        grid += '\n';
      }
      console.log('--- luminance grid (24x10) ---\n' + grid);
      writeFloatsPng(fileURLToPath(new URL('render.png', outDir)), floats, size[0], size[1]);
      resolve();
    },
  }).then((w) => { world = w; console.log('createWorld resolved'); });
});
console.log(`stats updates: ${statCount}, last:`, JSON.stringify(lastStats));
process.exit(0);
