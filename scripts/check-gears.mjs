/**
 * 逆时空齿轮轴 · 逻辑自检（不依赖 WebGL / 浏览器）
 *
 *   node scripts/check-gears.mjs
 *
 * 校验内容：
 *   1. 齿轮几何 / 模数统一
 *   2. 咬合不变量：任意转角下 Np(β−θp) + Nc(β+π−θc) ≡ π (mod 2π)
 *   3. 装配拟合：所有齿轮的齿顶圆不穿出沙漏玻璃内壁，非啮合齿轮不互相穿模
 *   4. 传动比：相邻齿轮角速度比 = −齿数反比
 *   5. 沙流可逆：填充度往返后位置完全一致，且按 u 排序后位置连续无跳变
 *   6. 主循环 300 帧：无异常、无 NaN
 */

/* ---- 极简 DOM 垫片：模块里用 canvas 生成程序化贴图 ---- */
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
globalThis.window = { devicePixelRatio: 1, innerWidth: 1440, innerHeight: 900 }
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => fakeCtx() }),
}

const THREE = await import('three')
const { MODULE, pitchRadius } = await import('../src/gears/three/gear.js')
const { GearTrain, makeGearGeometry } = await import('../src/gears/three/gear.js')
const { buildHourglass, glassRadius, HOURGLASS } = await import('../src/gears/three/hourglass.js')
const { createMaterials } = await import('../src/gears/three/materials.js')
const { SandFlow } = await import('../src/gears/three/sand.js')
const { Sparks } = await import('../src/gears/three/sparks.js')

const log = (...a) => console.log(...a)
let fail = 0
const ok = (cond, msg, extra = '') => {
  log(`${cond ? 'PASS' : 'FAIL'}  ${msg}${extra ? '  -> ' + extra : ''}`)
  if (!cond) fail++
}
const TAU = Math.PI * 2
const wrapPi = (v) => {
  let x = v % TAU
  if (x > Math.PI) x -= TAU
  if (x < -Math.PI) x += TAU
  return x
}

/* ---------------- 1. 齿轮几何 ---------------- */
log('\n[1] 齿轮几何')
const g24 = makeGearGeometry({ teeth: 24, thickness: 0.24 })
const g9 = makeGearGeometry({ teeth: 9, thickness: 0.19, lighten: false })
ok(g24.attributes.position.count > 500, '24 齿齿轮几何构建成功', `${g24.attributes.position.count} verts`)
ok(g9.attributes.position.count > 200, '9 齿小齿轮几何构建成功', `${g9.attributes.position.count} verts`)
ok(
  Math.abs(g24.userData.tipRadius - (pitchRadius(24) + MODULE * 0.92)) < 1e-9,
  '齿顶圆 = 节圆 + 0.92m',
  g24.userData.tipRadius.toFixed(4)
)

/* ---------------- 2~4. 装配 ---------------- */
log('\n[2] 机械沙漏装配与咬合')
const materials = createMaterials()
const hg = buildHourglass({ materials })
const layers = [
  { name: '前层', train: hg.front, z: 0 },
  { name: '后层', train: hg.back, z: -0.62 },
]

let gearTotal = 0
for (const layer of layers) {
  const { train, z, name } = layer
  gearTotal += train.gears.length

  // 2. 咬合不变量（多个转角下抽样）
  let worst = 0
  for (const item of train.gears) {
    if (!item.id) continue
  }
  const specPairs = []
  for (const g of train.gears) specPairs.push(g)
  for (let i = 0; i < train.gears.length; i++) {
    const child = train.gears[i]
    const parent = train.gears.find((p) => {
      const d = Math.hypot(child.pos.x - p.pos.x, child.pos.y - p.pos.y)
      return Math.abs(d - (p.radius + child.radius)) < 1e-6 && p !== child
    })
    if (!parent) continue
    const beta = Math.atan2(child.pos.y - parent.pos.y, child.pos.x - parent.pos.x)
    for (const theta of [0, 0.37, 1.9, -2.4, 12.5, -77.3]) {
      const tp = parent.phase + parent.ratio * theta
      const tc = child.phase + child.ratio * theta
      const f = parent.teeth * (beta - tp) + child.teeth * (beta + Math.PI - tc)
      worst = Math.max(worst, Math.abs(wrapPi(f - Math.PI)))
    }
    // 4. 传动比
    const expect = -(parent.teeth / child.teeth)
    if (Math.abs(child.ratio / parent.ratio - expect) > 1e-9) {
      ok(false, `${name} ${parent.id}→${child.id} 传动比`, `${(child.ratio / parent.ratio).toFixed(4)}`)
    }
  }
  ok(worst < 1e-6, `${name} 咬合相位不变量成立（任意转角）`, `最大偏差 ${worst.toExponential(2)}`)

  // 3a. 齿顶圆不穿出玻璃内壁
  let worstOut = 0
  let worstGear = ''
  for (const g of train.gears) {
    const rTip = g.radius + MODULE * 0.92
    for (let a = 0; a < TAU; a += 0.05) {
      const px = g.pos.x + Math.cos(a) * rTip
      const py = g.pos.y + Math.sin(a) * rTip
      if (Math.abs(py) > HOURGLASS.top - 0.02) continue
      const d = Math.hypot(px, z)
      const out = d - glassRadius(py)
      if (out > worstOut) {
        worstOut = out
        worstGear = g.id
      }
    }
  }
  ok(worstOut < 0.08, `${name} 齿轮均在玻璃腔内`, `最大越界 ${worstOut.toFixed(3)} (${worstGear || '—'})`)

  // 3b. 非啮合齿轮互不穿模
  let worstHit = 0
  let hitPair = ''
  for (let i = 0; i < train.gears.length; i++) {
    for (let j = i + 1; j < train.gears.length; j++) {
      const a = train.gears[i]
      const b = train.gears[j]
      const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y)
      const meshing = Math.abs(d - (a.radius + b.radius)) < 1e-6
      if (meshing) continue
      const hit = a.radius + b.radius - d
      if (hit > worstHit) {
        worstHit = hit
        hitPair = `${a.id}/${b.id}`
      }
    }
  }
  ok(worstHit < 0.02, `${name} 非啮合齿轮无穿模`, `最大侵入 ${worstHit.toFixed(3)} (${hitPair || '—'})`)
}
ok(gearTotal >= 9, '齿轮总数足够构成复杂联动', `${gearTotal} 个齿轮`)
ok(hg.contacts.length >= 7, '啮合触点数量', `${hg.contacts.length} 处`)

/* ---------------- 5. 沙流可逆 / 连续 ---------------- */
log('\n[3] 可逆沙流')
const sand = new SandFlow({ glassRadius, z: 0.45 })
const arr = () => Float32Array.from(sand.points.geometry.attributes.position.array)
sand.update(0.62, 0)
const before = arr()
sand.update(0.25, 0)
sand.update(0.62, 0)
const after = arr()
let maxDrift = 0
for (let i = 0; i < before.length; i++) maxDrift = Math.max(maxDrift, Math.abs(before[i] - after[i]))
ok(maxDrift < 1e-5, '沙流完全可逆（正流→倒流→同态）', `最大漂移 ${maxDrift.toExponential(2)}`)

// 高度必须随 u 单调下降（上舱→流束→沙堆），且相邻沙粒无断层
const idx = Array.from({ length: sand.u.length }, (_, i) => i).sort((a, b) => sand.u[a] - sand.u[b])
const p = sand.points.geometry.attributes.position.array
let maxStep = 0
let monotonic = true
for (let k = 1; k < idx.length; k++) {
  const ya = p[idx[k - 1] * 3 + 1]
  const yb = p[idx[k] * 3 + 1]
  if (yb - ya > 0.02) monotonic = false
  maxStep = Math.max(maxStep, Math.abs(yb - ya))
}
ok(monotonic, '沙粒高度沿 u 单调递降（上舱→流束→沙堆）')
ok(maxStep < 0.25, '沙粒分布沿 u 连续（无瞬移断层）', `最大落差 ${maxStep.toFixed(3)}`)

// 沙粒不得穿出玻璃
let sandOut = 0
for (let i = 0; i < sand.u.length; i++) {
  const i3 = i * 3
  const y = p[i3 + 1]
  const d = Math.hypot(p[i3], p[i3 + 2])
  sandOut = Math.max(sandOut, d - glassRadius(y))
}
ok(sandOut < 0.02, '沙粒位于玻璃腔内部', `最大越界 ${sandOut.toFixed(3)}`)

/* ---------------- 6. 主循环 ---------------- */
log('\n[4] 主循环')
const sparks = new Sparks()
let theta = 0
let err = null
try {
  for (let f = 0; f < 300; f++) {
    const omega = Math.sin(f * 0.07) * 9
    theta += omega * (1 / 60)
    const impact = new THREE.Vector3(0, -2.4, 0.45)
    hg.update(theta, omega, 1 / 60, { sparks, impact, sandFlowing: true })
    sand.update(Math.max(0, Math.min(1, 0.5 + Math.sin(f * 0.01) * 0.5)), f / 60)
    sparks.update(1 / 60)
  }
} catch (e) {
  err = e
}
ok(!err, '300 帧更新无异常', err ? String(err.message) : '')

const sp = sparks.points.geometry.attributes.position.array
let nan = 0
for (let i = 0; i < sp.length; i++) if (!Number.isFinite(sp[i])) nan++
ok(nan === 0, '火花粒子坐标无 NaN')

const gearRot = hg.front.gears[0].bone.rotation.z
ok(Number.isFinite(gearRot) && Math.abs(gearRot) > 0.1, '主齿轮转角已随驱动更新', gearRot.toFixed(3))
ok(
  Math.abs(hg.boneShaft.rotation.y - theta * 2.35) < 1e-9,
  '中央蜗杆轴按传动比联动',
  hg.boneShaft.rotation.y.toFixed(2)
)

log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : fail + ' CHECK(S) FAILED'}`)
process.exit(fail === 0 ? 0 : 1)
