import fs from 'node:fs';
const buf = fs.readFileSync(new URL('./world-shots/render.raw', import.meta.url));
const floats = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
const W = 640, H = 400;
const gw = 40, gh = 25;
for (let gy = 0; gy < gh; gy++) {
  let line = '';
  for (let gx = 0; gx < gw; gx++) {
    let r = 0, g = 0, b = 0, cnt = 0;
    for (let y = Math.floor(gy * H / gh); y < Math.floor((gy + 1) * H / gh); y++) {
      for (let x = Math.floor(gx * W / gw); x < Math.floor((gx + 1) * W / gw); x++) {
        const i = (y * W + x) * 4;
        r += floats[i]; g += floats[i + 1]; b += floats[i + 2]; cnt++;
      }
    }
    const lum = (r + g + b) / 3 / cnt;
    const c = lum < 0.01 ? '.'
      : lum < 0.05 ? ':'
      : lum < 0.2 ? '+'
      : lum < 1 ? '#'
      : '@';
    line += c;
  }
  console.log(line);
}
