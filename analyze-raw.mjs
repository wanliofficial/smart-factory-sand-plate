import fs from 'node:fs';
const buf = fs.readFileSync(new URL('./world-shots/render.raw', import.meta.url));
const floats = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
const W = 640, H = 400;
console.log('floats:', floats.length, 'pixels:', W * H, 'channels/pix:', floats.length / (W * H));

// Per-channel stats
for (const [ci, name] of [[0, 'R'], [1, 'G'], [2, 'B']]) {
  let mn = Infinity, mx = -Infinity, sum = 0, over = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = floats[(y * W + x) * 4 + ci];
    n++;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
    sum += v;
    if (v > 1) over++;
  }
  console.log(`${name}: min=${mn.toFixed(3)} max=${mx.toFixed(3)} mean=${(sum / n).toFixed(2)} over1=${(over / n * 100).toFixed(1)}%`);
}

// Downsampled RGB grid (16x10), each cell = avg rgb
const gw = 16, gh = 10;
for (let gy = 0; gy < gh; gy++) {
  let line = '';
  for (let gx = 0; gx < gw; gx++) {
    let r = 0, g = 0, b = 0, cnt = 0;
    for (let y = Math.floor(gy * H / gh); y < Math.floor((gy + 1) * H / gh); y += 2) {
      for (let x = Math.floor(gx * W / gw); x < Math.floor((gx + 1) * W / gw); x += 2) {
        const i = (y * W + x) * 4;
        r += floats[i]; g += floats[i + 1]; b += floats[i + 2]; cnt++;
      }
    }
    r /= cnt; g /= cnt; b /= cnt;
    const lum = (r + g + b) / 3;
    line += lum < 0.01 ? '  .   '
      : lum < 0.1 ? ` ${lum.toFixed(2)}  `
      : lum < 1 ? ` ${lum.toFixed(1)}  `
      : `${lum.toFixed(0).padStart(3)}! `;
  }
  console.log(line);
}

// Value histogram (over RGB channels of all pixels)
const buckets = [0, 0.01, 0.05, 0.2, 0.5, 1, 2, 5, 10, 50, 200, 1000, 10000];
const counts = new Array(buckets.length - 1).fill(0);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  for (let ci = 0; ci < 3; ci++) {
    const v = floats[(y * W + x) * 4 + ci];
    for (let bi = 0; bi < buckets.length - 1; bi++) {
      if (v >= buckets[bi] && v < buckets[bi + 1]) { counts[bi]++; break; }
    }
  }
}
let hist = '';
for (let bi = 0; bi < buckets.length - 1; bi++) {
  hist += `[${buckets[bi]}..${buckets[bi + 1]}): ${counts[bi]}\n`;
}
console.log('--- channel-value histogram ---\n' + hist);
