import fs from 'node:fs';
const buf = fs.readFileSync(new URL('./world-shots/render.raw', import.meta.url));
const floats = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
const W = 640, H = 400;

// find bright regions; classify by dominant color
// cyan-ish (AI core): B,R vs G — AI core color ~ (0,0.85,1); earth particles blue (0.2,0.6,1)
function bboxOf(pred, label) {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, n = 0, sumL = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const r = floats[i], g = floats[i + 1], b = floats[i + 2];
    if (pred(r, g, b)) {
      n++; sumL += (r + g + b) / 3;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (!n) { console.log(`${label}: none`); return; }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  console.log(`${label}: n=${n} bbox x[${minX},${maxX}] y[${minY},${maxY}] center=(${cx},${cy}) ndc=(${((cx / W) * 2 - 1).toFixed(3)},${(1 - (cy / H) * 2).toFixed(3)}) halfW=${((maxX - minX) / 2 / W * 2).toFixed(3)}ndc halfH=${((maxY - minY) / 2 / H * 2).toFixed(3)}ndc meanLum=${(sumL / n).toFixed(2)}`);
}

bboxOf((r, g, b) => (r + g + b) / 3 > 5, 'very bright (>5)');
bboxOf((r, g, b) => (r + g + b) / 3 > 1, 'bright (>1)');
bboxOf((r, g, b) => (r + g + b) / 3 > 0.3, 'mid (>0.3)');
// AI core particles color (0,0.9,1): G high relative to R
bboxOf((r, g, b) => b > 1 && g > 2 * r && g > 0.7 * b, 'cyan-ish (AI core)');
// earth particle color (0.2,0.6,1): B >> G > R
bboxOf((r, g, b) => b > 1 && b > 1.5 * g && g > 2 * r, 'blue-ish (atmosphere)');

// radial profile through image center
console.log('--- horizontal profile at cy=200 (every 20px, mean lum of 10 rows) ---');
let line = '';
for (let x = 0; x < W; x += 20) {
  let s = 0, c = 0;
  for (let y = 195; y < 205; y++) { const i = (y * W + x) * 4; s += (floats[i] + floats[i + 1] + floats[i + 2]) / 3; c++; }
  line += (s / c).toFixed(1) + ' ';
}
console.log(line);
console.log('--- vertical profile at cx=320 (every 20px) ---');
line = '';
for (let y = 0; y < H; y += 20) {
  let s = 0, c = 0;
  for (let x = 315; x < 325; x++) { const i = (y * W + x) * 4; s += (floats[i] + floats[i + 1] + floats[i + 2]) / 3; c++; }
  line += (s / c).toFixed(1) + ' ';
}
console.log(line);
