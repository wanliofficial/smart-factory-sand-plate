import * as THREE from 'three'
import { GearTrain, MODULE, pitchRadius } from './gear.js'
import { rod, ring, boltRing, cone, makePawl, makePalletFork, ChainDrive } from './parts.js'

/** 沙漏玻璃剖面：[高度 y, 半径 r]，上下对称 */
const PROFILE = [
  [0.0, 0.88],
  [0.18, 0.92],
  [0.42, 1.04],
  [0.66, 1.26],
  [0.95, 1.55],
  [1.3, 1.76],
  [1.7, 1.84],
  [2.1, 1.8],
  [2.45, 1.62],
  [2.75, 1.32],
  [3.0, 1.05],
  [3.18, 0.88],
  [3.3, 0.84],
]

export const HOURGLASS = {
  top: 3.3,
  bottom: -3.3,
  maxRadius: 1.84,
  profile: PROFILE,
}

/** 玻璃内腔在高度 y 处的半径 */
export function glassRadius(y) {
  const ay = Math.min(Math.abs(y), PROFILE[PROFILE.length - 1][0])
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [y0, r0] = PROFILE[i]
    const [y1, r1] = PROFILE[i + 1]
    if (ay >= y0 && ay <= y1) {
      const t = (ay - y0) / (y1 - y0)
      return r0 + (r1 - r0) * t
    }
  }
  return PROFILE[PROFILE.length - 1][1]
}

function latheProfile() {
  const pts = []
  const last = PROFILE.length - 1
  for (let i = last; i >= 1; i--) pts.push(new THREE.Vector2(PROFILE[i][1], -PROFILE[i][0]))
  for (let i = 0; i < PROFILE.length; i++) pts.push(new THREE.Vector2(PROFILE[i][1], PROFILE[i][0]))
  return pts
}

/** 前层齿轮系（z = 0），自顶轮向下逐级咬合 */
const FRONT_SPEC = [
  { id: 'U', teeth: 24, pos: [0, 2.05], mat: 'brass', thickness: 0.24, holeCount: 6 },
  { id: 'V', teeth: 12, parent: 'U', bearing: -80, mat: 'brassAged', thickness: 0.2 },
  { id: 'W', teeth: 9, parent: 'V', bearing: -95, mat: 'steel', thickness: 0.19, lighten: false },
  { id: 'X', teeth: 22, parent: 'W', bearing: -80, mat: 'brass', thickness: 0.24, holeCount: 5 },
  { id: 'Y', teeth: 8, parent: 'X', bearing: 175, mat: 'copper', thickness: 0.18, lighten: false },
]

/** 后层齿轮系（z = -0.62），独立咬合链，制造纵深 */
const BACK_SPEC = [
  { id: 'BA', teeth: 22, pos: [-0.05, 2.05], mat: 'brassAged', thickness: 0.22, holeCount: 6 },
  { id: 'BB', teeth: 12, parent: 'BA', bearing: -88, mat: 'copper', thickness: 0.19 },
  { id: 'BC', teeth: 14, parent: 'BB', bearing: -95, mat: 'brass', thickness: 0.21, holeCount: 5 },
  { id: 'BD', teeth: 18, parent: 'BC', bearing: -75, mat: 'brassAged', thickness: 0.22, holeCount: 5 },
]

const SHAFT_RATIO = 2.35
const CHAIN_RATIO = 1.55

export function buildHourglass({ materials }) {
  const root = new THREE.Group()
  const boneRoot = new THREE.Bone() // 骨骼根节点
  root.add(boneRoot)

  /* ---------------- 玻璃罩 ---------------- */
  const shell = new THREE.Mesh(new THREE.LatheGeometry(latheProfile(), 84), materials.glass)
  shell.renderOrder = 4
  root.add(shell)

  // 黄铜经线肋条（机械感玻璃）
  const ribGroup = new THREE.Group()
  const ribMat = materials.glassRib
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    const pts = []
    const last = PROFILE.length - 1
    for (let i = last; i >= 1; i--) {
      pts.push(new THREE.Vector3(Math.cos(a) * PROFILE[i][1], -PROFILE[i][0], Math.sin(a) * PROFILE[i][1]))
    }
    for (let i = 0; i < PROFILE.length; i++) {
      pts.push(new THREE.Vector3(Math.cos(a) * PROFILE[i][1], PROFILE[i][0], Math.sin(a) * PROFILE[i][1]))
    }
    const curve = new THREE.CatmullRomCurve3(pts)
    const rib = new THREE.Mesh(new THREE.TubeGeometry(curve, 90, 0.022, 5, false), ribMat)
    ribGroup.add(rib)
  }
  root.add(ribGroup)

  /* ---------------- 黄铜框架 ---------------- */
  const frame = new THREE.Group()
  root.add(frame)

  for (const dir of [1, -1]) {
    const y = dir * 3.3
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(2.32, 2.32, 0.2, 40), dir > 0 ? materials.brassAged : materials.brassDark)
    plate.position.y = y + dir * 0.12
    plate.castShadow = true
    plate.receiveShadow = true
    frame.add(plate)

    const rim = ring(2.32, 0.085, materials.brass, 48)
    rim.rotation.x = Math.PI / 2
    rim.position.y = y
    frame.add(rim)

    const bolts = boltRing(12, 2.05, materials.brass, 0.055, y + dir * 0.24)
    frame.add(bolts)

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.86, 0.24, 26), materials.brassAged)
    collar.position.y = y - dir * 0.14
    collar.castShadow = true
    frame.add(collar)
  }

  // 四根立柱 + 箍环
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    const x = Math.cos(a) * 2.12
    const z = Math.sin(a) * 2.12
    frame.add(rod(new THREE.Vector3(x, -3.28, z), new THREE.Vector3(x, 3.28, z), 0.072, materials.brassAged, 8))
    for (const y of [-3.2, -1.62, 1.62, 3.2]) {
      const c = ring(0.115, 0.045, materials.brass, 12)
      c.rotation.x = Math.PI / 2
      c.position.set(x, y, z)
      frame.add(c)
    }
  }

  // 腰部镂空护圈（6 根立筋 + 上下箍）
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const x = Math.cos(a) * 0.95
    const z = Math.sin(a) * 0.95
    frame.add(rod(new THREE.Vector3(x, -0.34, z), new THREE.Vector3(x, 0.34, z), 0.042, materials.brassAged, 6))
  }
  for (const y of [-0.34, 0.34]) {
    const c = ring(0.95, 0.06, materials.brass, 36)
    c.rotation.x = Math.PI / 2
    c.position.y = y
    frame.add(c)
  }

  // 底座与机脚
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.62, 2.5, 0.3, 40), materials.brassDark)
  base.position.y = -3.62
  base.castShadow = true
  base.receiveShadow = true
  frame.add(base)
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    const foot = cone(0.16, 0.22, 0.34, materials.brassAged, 12)
    foot.position.set(Math.cos(a) * 2.1, -3.9, Math.sin(a) * 2.1)
    frame.add(foot)
  }

  // 顶部吊环
  const hook = ring(0.28, 0.055, materials.brass, 24)
  hook.position.y = 3.62
  frame.add(hook)
  frame.add(rod(new THREE.Vector3(0, 3.42, 0), new THREE.Vector3(0, 3.62, 0), 0.07, materials.brassAged, 8))

  /* ---------------- 中央蜗杆主轴（骨骼：boneShaft） ---------------- */
  const boneShaft = new THREE.Bone()
  boneShaft.position.set(0, 0, -0.34)
  boneRoot.add(boneShaft)

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6.0, 16), materials.steel)
  shaft.castShadow = true
  boneShaft.add(shaft)

  // 螺旋蜗杆螺纹
  const helixPts = []
  for (let i = 0; i <= 420; i++) {
    const t = i / 420
    const a = t * Math.PI * 2 * 9
    const y = -2.85 + t * 5.7
    helixPts.push(new THREE.Vector3(Math.cos(a) * 0.145, y, Math.sin(a) * 0.145))
  }
  const helix = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helixPts), 760, 0.032, 5, false),
    materials.brass
  )
  helix.castShadow = true
  boneShaft.add(helix)

  for (const y of [-2.95, -0.9, 0.9, 2.95]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 14), materials.brassAged)
    c.position.y = y
    c.castShadow = true
    boneShaft.add(c)
  }
  for (const y of [-3.08, 3.08]) {
    const finial = cone(0.05, 0.16, 0.22, materials.brass, 14)
    finial.position.y = y
    boneShaft.add(finial)
  }

  /* ---------------- 双层齿轮系 ---------------- */
  const front = new GearTrain({ spec: FRONT_SPEC, module: MODULE, z: 0, materials })
  const back = new GearTrain({ spec: BACK_SPEC, module: MODULE, z: -0.62, materials })
  boneRoot.add(front.bone)
  boneRoot.add(back.bone)

  /* ---------------- 棘爪（随棘轮逐齿抬升—跌落） ---------------- */
  const pawls = []

  const pawlSpecs = [
    { gear: 'U', dist: 1.75, bearing: 200, arm: 0.62, layer: front },
    { gear: 'X', dist: 1.6, bearing: 150, arm: 0.56, layer: front },
  ]
  for (const s of pawlSpecs) {
    const g = s.layer.gear(s.gear)
    const a = THREE.MathUtils.degToRad(s.bearing)
    const pivot = new THREE.Vector3(g.pos.x + Math.cos(a) * s.dist, g.pos.y + Math.sin(a) * s.dist, 0)
    const target = new THREE.Vector3(g.pos.x, g.pos.y, 0)
    const p = makePawl({ pivot, target, material: materials.steel, materials, armLength: s.arm })
    boneRoot.add(p.bone)
    pawls.push({ ...p, gear: s.gear, teeth: g.teeth, layer: s.layer })
  }

  /* ---------------- 擒纵叉（一次一齿摆动） ---------------- */
  const w = front.gear('W')
  const forkPivot = new THREE.Vector3(w.pos.x + Math.cos(0.96) * 1.02, w.pos.y + Math.sin(0.96) * 1.02, 0)
  const fork = makePalletFork({ pivot: forkPivot, materials, armLength: 0.6, spread: 0.24 })
  fork.rotation.z = Math.atan2(w.pos.y - forkPivot.y, w.pos.x - forkPivot.x)
  const forkBase = fork.rotation.z
  boneRoot.add(fork)

  /* ---------------- 外置链传动 ---------------- */
  const chain = new ChainDrive({
    top: { x: 2.42, y: 3.02 },
    bottom: { x: 2.42, y: -3.02 },
    radius: 0.42,
    z: 0.72,
    links: 44,
    materials,
    ratio: CHAIN_RATIO,
  })
  boneRoot.add(chain.group)
  // 链轮支架
  for (const y of [3.02, -3.02]) {
    frame.add(rod(new THREE.Vector3(2.0, y, 0.72), new THREE.Vector3(2.42, y, 0.72), 0.05, materials.brassAged, 6))
  }

  /* ---------------- 内部余晖灯 ---------------- */
  const coreLight = new THREE.PointLight(0xff8a3a, 6.5, 9, 2)
  coreLight.position.set(0, 0, 0)
  root.add(coreLight)

  const sparkLight = new THREE.PointLight(0xffc46a, 0, 5.5, 2)
  sparkLight.position.set(0, 0, 0.3)
  root.add(sparkLight)

  // 上舱发光刻度环
  const dialRing = ring(1.42, 0.03, materials.ember, 64)
  dialRing.rotation.x = Math.PI / 2
  dialRing.position.y = 2.05
  boneRoot.add(dialRing)

  /* ---------------- 更新 ---------------- */
  const tangent = new THREE.Vector3()

  function contacts() {
    return [...front.contacts, ...back.contacts]
  }

  function update(theta, omega, dt, ctx = {}) {
    front.update(theta)
    back.update(theta)
    boneShaft.rotation.y = theta * SHAFT_RATIO
    chain.update(theta, dt)
    dialRing.rotation.z = theta * 0.6

    // 棘爪：锯齿抬升 + 快速跌落
    for (const p of pawls) {
      const g = p.layer.gear(p.gear)
      const ang = g.phase + g.ratio * theta
      const frac = ((ang * p.teeth) / (Math.PI * 2) % 1 + 1) % 1
      const lift = frac < 0.86 ? frac / 0.86 : (1 - frac) / 0.14
      p.bone.rotation.z = p.baseRotation + 0.30 * (1 - lift)
    }

    // 擒纵叉：与擒纵轮齿同步摆动
    const wAng = w.phase + w.ratio * theta
    fork.rotation.z = forkBase + 0.34 * Math.sin(wAng * w.teeth)

    // 火花发射（按啮合线速度）
    const sparks = ctx.sparks
    if (sparks) {
      const absOmega = Math.abs(omega)
      if (absOmega > 0.12) {
        for (const c of contacts()) {
          const parentOmega = omega * c.parentRatio // 父轮角速度（带符号）
          const surfaceSpeed = Math.abs(parentOmega) * c.parentRadius
          const rate = Math.min(surfaceSpeed * 26, 90)
          const amount = rate * dt
          // 啮合切向：v = ω × r，即连心线方向逆时针转 90°，随父轮转向取号
          const p = c.point
          const dirx = -(p.y - c.center.y)
          const diry = p.x - c.center.x
          const len = Math.hypot(dirx, diry) || 1
          const sign = Math.sign(parentOmega) || 1
          tangent.set((dirx / len) * sign, (diry / len) * sign, 0)
          sparks.emit(p, tangent, Math.min(surfaceSpeed * 0.55, 5.5), amount)
        }
        // 沙流冲击点火花
        if (ctx.impact) {
          const impactRate = Math.min(absOmega * 3.2, 26) * dt
          tangent.set(0.2, 1, 0).normalize()
          sparks.emit(ctx.impact, tangent, 1.2 + absOmega * 0.1, impactRate * (ctx.sandFlowing ? 1 : 0.35))
        }
      }
    }

    // 火花灯随啮合强度闪烁
    const glow = Math.min(Math.abs(omega) / 10, 1)
    sparkLight.intensity = glow * 9 * (0.75 + Math.random() * 0.25)
    coreLight.intensity = 4.5 + glow * 3.5
  }

  return {
    root,
    boneRoot,
    boneShaft,
    front,
    back,
    chain,
    update,
    contacts: contacts(),
    mainContact: front.contacts[0]?.point ?? new THREE.Vector3(),
  }
}

export { MODULE, pitchRadius }
