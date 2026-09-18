// Headless smoke test: run the real createWorld() pipeline on Dawn (vgpu/node),
// then read back the final swapchain frame and write it as a PNG.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err?.message || err);
  if (err?.cause) console.error('  cause:', err.cause?.message || err.cause);
});

// --- minimal DOM stubs ---
import zlib from 'node:zlib';
import fs from 'node:fs';

globalThis.window = {
  devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {},
};
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

let gpuDevice = null;
let swapTex = null;
const canvas = {
  width: 1280,
  height: 800,
  style: {},
  addEventListener() {}, removeEventListener() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
  getContext(kind) {
    if (kind !== 'webgpu') return null;
    return {
      canvas: this,
      configure(cfg) {
        gpuDevice = cfg.device;
        swapTex = cfg.device.createTexture({
          size: [canvas.width, canvas.height],
          format: cfg.format,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
        });
      },
      getCurrentTexture: () => swapTex,
      get configuration() { return { format: 'bgra8unorm' }; },
      unconfigure() {},
    };
  },
};

const { createWorld } = await import('./src/world/world.js');

let statCount = 0;
let lastStats = null;
const world = await createWorld({
  canvas,
  onStats: (s) => { statCount++; lastStats = s; },
  onSelectNode: () => {},
});
console.log('createWorld resolved');

await new Promise((r) => setTimeout(r, 8000));
console.log(`stats updates: ${statCount}, last:`, JSON.stringify(lastStats));

async function captureSwap() {
  const w = swapTex.width, h = swapTex.height;
  const bpr = Math.ceil((w * 4) / 256) * 256;
  const staging = gpuDevice.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = gpuDevice.createCommandEncoder();
  enc.copyTextureToBuffer(
    { buffer: staging, bytesPerRow: bpr, rowsPerImage: h },
    { texture: swapTex },
    [w, h]
  );
  gpuDevice.queue.submit([enc.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const data = new Uint8Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  return { w, h, data, bpr };
}

function writePng(file) {
  const { w, h, data, bpr } = frame;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const s = y * bpr + x * 4;
      raw[o++] = data[s + 2]; // R (source BGRA)
      raw[o++] = data[s + 1]; // G
      raw[o++] = data[s + 0]; // B
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
  const zlibMod = zlib;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibMod.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
  console.log('PNG saved:', file, `${w}x${h}`);
}

if (swapTex && gpuDevice) {
  var frame = await captureSwap();
  await writePng('/tmp/world-shots/render.png');
} else {
  console.log('no frame captured (swapTex missing)');
}
world.dispose?.();
console.log('SMOKE DONE');
process.exit(0);
