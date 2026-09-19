/**
 * 逆时空齿轮轴 · 离线构图预览
 *
 * 环境无 WebGL / 无浏览器时，用 three 的数学把装配体线框投影成 PNG，
 * 人工核对构图、齿轮布局、沙堆形态与沙漏轮廓是否协调。
 *
 *   node scripts/preview-gears.mjs [输出路径]
 */
import zlib from 'node:zlib'
import fs from 'node:fs'

/* ---- DOM 垫片 ---- */
function fakeCtx() {
  const grad = { addColorStop() {} }
  return {
    fillStyle: '',
    fillRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    createRadialGradient: () => grad,
    createLinearGradient: () => grad,
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
  }
}
globalThis.window = { devicePixelRatio: 1, innerWidth: 1440, innerHeight: 810 }
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => fakeCtx() }),
}

const THREE = await import('three')
const { buildHourglass, HOURGLASS } = await import('../src/gears/three/hourglass.js')
const { createMaterials } = await import('../src/gears/three/materials.js')
const { SandFlow } = await import('../src/gears/three/sand.js')

const W = 1440
const H = 810
const buf = new Uint8Array(W * H * 3)
// 背景：落日渐变
for (let y = 0; y < H; y++) {
  const t = y / H
  const r = Math.round(28 + 60 * Math.sin(Math.PI * Math.min(1, t * 1.1)))
  const g = Math.round(14 + 26 * Math.sin(Math.PI * Math.min(1, t * 1.1)))
  const b = Math.round(12 + 10 * t)
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3
    buf[i] = r
    buf[i + 1] = g
    buf[i + 2] = b
  }
}

const px = (x, y, c, a = 1) => {
  x = Math.round(x)
  y = Math.round(y)
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = (y * W + x) * 3
  buf[i] = Math.min(255, buf[i] * (1 - a) + c[0] * a)
  buf[i + 1] = Math.min(255, buf[i + 1] * (1 - a) + c[1] * a)
  buf[i + 2] = Math.min(255, buf[i + 2] * (1 - a) + c[2] * a)
}
const line = (x0, y0, x1, y1, c, a = 1) => {
  let dx = Math.abs(x1 - x0)
  let dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let guard = 0
  while (guard++ < 4000) {
    px(x0, y0, c, a)
    if (Math.abs(x0 - x1) < 1 && Math.abs(y0 - y1) < 1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x0 += sx
    }
    if (e2 < dx) {
      err += dx
      y0 += sy
    }
  }
}

/* ---- 相机（与 stage.js 一致） ---- */
const target = new THREE.Vector3(0, -1.55, 0)
const azimuth = 0.1
const polar = Math.PI / 2 - 0.05
const dist = 16
const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 200)
camera.position.set(
  target.x + dist * Math.sin(polar) * Math.sin(azimuth),
  target.y + dist * Math.cos(polar),
  target.z + dist * Math.sin(polar) * Math.cos(azimuth)
)
camera.lookAt(target)
camera.updateMatrixWorld(true)
camera.updateProjectionMatrix()
const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)

const v = new THREE.Vector3()
const project = (x, y, z) => {
  v.set(x, y, z).applyMatrix4(vp)
  return [(v.x * 0.5 + 0.5) * W, (1 - (v.y * 0.5 + 0.5)) * H, v.z]
}

/* ---- 场景 ---- */
const materials = createMaterials()
const hg = buildHourglass({ materials })
const sand = new SandFlow({ glassRadius: (y) => hg.front.gears[0] && glassR(y), z: 0.45 })
function glassR(y) {
  // 复用 hourglass 内部剖面
  const P = HOURGLASS.profile
  const ay = Math.min(Math.abs(y), P[P.length - 1][0])
  for (let i = 0; i < P.length - 1; i++) {
    if (ay >= P[i][0] && ay <= P[i + 1][0]) {
      const t = (ay - P[i][0]) / (P[i + 1][0] - P[i][0])
      return P[i][1] + (P[i + 1][1] - P[i][1]) * t
    }
  }
  return P[P.length - 1][1]
}
sand.glassRadius = glassR
const theta = 0.6
hg.update(theta, 0, 0.016, {})
sand.update(0.45, 0)

// 1. 玻璃轮廓（子午线）
const outline = [190, 150, 120]
for (let k = 0; k < 24; k++) {
  const a = (k / 24) * Math.PI * 2
  let prev = null
  const P = HOURGLASS.profile
  for (let i = P.length - 1; i >= 0; i--) {
    const p = project(Math.cos(a) * P[i][1], -P[i][0], Math.sin(a) * P[i][1])
    if (prev) line(prev[0], prev[1], p[0], p[1], outline, 0.22)
    prev = p
  }
  for (let i = 0; i < P.length; i++) {
    const p = project(Math.cos(a) * P[i][1], P[i][0], Math.sin(a) * P[i][1])
    if (prev) line(prev[0], prev[1], p[0], p[1], outline, 0.22)
    prev = p
  }
}

// 2. 结构线框
hg.root.updateMatrixWorld(true)
const brass = [230, 178, 96]
const steel = [120, 126, 140]
const warm = [255, 150, 70]
hg.root.traverse((o) => {
  if (!o.isMesh) return
  const geo = o.geometry
  const pos = geo.attributes.position
  if (!pos) return
  const isGlass = o.material === materials.glass
  if (isGlass) return
  const col = o.material === materials.steel || o.material === materials.steelDark ? steel : brass
  const idx = geo.index
  const count = idx ? idx.count : pos.count
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const step = 3
  for (let i = 0; i < count; i += step) {
    const i0 = idx ? idx.getX(i) : i
    const i1 = idx ? idx.getX(Math.min(i + 1, count - 1)) : Math.min(i + 1, count - 1)
    a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld)
    b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld)
    const pa = project(a.x, a.y, a.z)
    const pb = project(b.x, b.y, b.z)
    if (pa[2] > 1 || pb[2] > 1) continue
    line(pa[0], pa[1], pb[0], pb[1], col, 0.5)
  }
})

// 3. 沙粒
const sp = sand.points.geometry.attributes.position.array
for (let i = 0; i < sp.length; i += 3) {
  const p = project(sp[i], sp[i + 1], sp[i + 2])
  if (p[2] > 1) continue
  px(p[0], p[1], warm, 0.55)
}

// 4. 啮合触点
const cp = [120, 240, 255]
for (const c of hg.contacts) {
  const p = project(c.point.x, c.point.y, c.point.z)
  for (let r = 0; r < 4; r++) {
    px(p[0] + r, p[1], cp, 0.9)
    px(p[0] - r, p[1], cp, 0.9)
    px(p[0], p[1] + r, cp, 0.9)
    px(p[0], p[1] - r, cp, 0.9)
  }
}

/* ---- PNG 输出 ---- */
function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8
ihdr[9] = 2
const raw = Buffer.alloc(H * (W * 3 + 1))
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0
  Buffer.from(buf.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])
const out = process.argv[2] ?? '/tmp/gears-preview.png'
fs.writeFileSync(out, png)
console.log('saved', out, `${W}x${H}`)
