import * as THREE from 'three'

/** 齿轮模数：整组齿轮统一模数才能真正咬合 */
export const MODULE = 0.09

export function pitchRadius(teeth, m = MODULE) {
  return (m * teeth) / 2
}

const TAU = Math.PI * 2

/**
 * 生成渐开线近似的直齿圆柱齿轮几何：
 * - 齿顶圆 rTip = r + 0.92m，齿根圆 rRoot = r - 1.02m
 * - 轮齿中心严格位于本地角度 0, 2π/N, 4π/N ...（咬合相位计算依赖这一点）
 * - 中心轴孔 + 大轮减重孔（Path 挖洞后挤出）
 */
export function makeGearGeometry({
  teeth = 18,
  module: m = MODULE,
  thickness = 0.2,
  lighten = true,
  holeCount = 6,
  hubRatio = 0.32,
} = {}) {
  const r = pitchRadius(teeth, m)
  const rTip = r + m * 0.92
  const rRoot = Math.max(r - m * 1.02, m * 1.9)
  const step = TAU / teeth
  const tipHalf = step * 0.155
  const rootHalf = step * 0.295

  const shape = new THREE.Shape()
  let first = true
  const lineTo = (a, rad) => {
    const x = Math.cos(a) * rad
    const y = Math.sin(a) * rad
    if (first) {
      shape.moveTo(x, y)
      first = false
    } else {
      shape.lineTo(x, y)
    }
  }

  for (let i = 0; i < teeth; i++) {
    const c = i * step
    lineTo(c - rootHalf, rRoot)
    lineTo(c - tipHalf, rTip)
    lineTo(c + tipHalf, rTip)
    lineTo(c + rootHalf, rRoot)
    const a0 = c + rootHalf
    const a1 = (i + 1) * step - rootHalf
    for (let s = 1; s < 2; s++) lineTo(a0 + (a1 - a0) * (s / 2), rRoot)
  }
  shape.closePath()

  // 中心轴孔
  const hubR = Math.max(m * 1.05, Math.min(r * hubRatio, rRoot - m * 0.9))
  const hub = new THREE.Path()
  hub.absarc(0, 0, hubR, 0, TAU, true)
  shape.holes.push(hub)

  // 减重孔（仅大轮）
  if (lighten && r > 0.62) {
    const ringR = r * 0.56
    const holeR = r * 0.16
    if (ringR - holeR > hubR + m * 0.55 && ringR + holeR < rRoot - m * 0.8) {
      for (let i = 0; i < holeCount; i++) {
        const a = (i / holeCount) * TAU + Math.PI / holeCount
        const p = new THREE.Path()
        p.absarc(Math.cos(a) * ringR, Math.sin(a) * ringR, holeR, 0, TAU, true)
        shape.holes.push(p)
      }
    }
  }

  const bevel = Math.min(m * 0.18, 0.014)
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(thickness - bevel * 2, 0.02),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 6,
  })
  geo.translate(0, 0, -thickness / 2)
  geo.userData = { radius: r, tipRadius: rTip, rootRadius: rRoot, teeth }
  return geo
}

/**
 * 齿轮系（咬合链）
 *
 * 咬合相位公式：设父轮 P、子轮 C，两轮连心线方位角 β，齿数 Np / Nc，
 * 轮齿中心位于本地角 2πk/N，则「父轮齿顶正对连心线 + 子轮齿槽正对连心线」的
 * 充要条件为：
 *     Np·(β − θp) + Nc·(β + π − θc) ≡ π  (mod 2π)
 * 由此解出子轮初始相位 θc，并在转动时保证 ωc = −(Np/Nc)·ωp，
 * 该不变量在任意转角下恒成立 —— 齿与齿永远精确咬合，不会穿模。
 */
export class GearTrain {
  constructor({ spec = [], module: m = MODULE, z = 0, materials, castShadow = true, receiveShadow = true }) {
    this.group = new THREE.Group()
    this.bone = new THREE.Bone() // 骨骼节点：整层的父骨
    this.bone.position.z = z
    this.group.add(this.bone)
    this.gears = []
    this.contacts = []

    const byId = new Map()

    for (const item of spec) {
      const teeth = item.teeth
      const r = pitchRadius(teeth, m)
      const thickness = item.thickness ?? 0.2
      let pos
      let ratio
      let phase
      let contact = null
      let contactCenter = null
      let contactParentRatio = 1

      if (!item.parent) {
        pos = new THREE.Vector2(item.pos[0], item.pos[1])
        ratio = item.ratio ?? 1
        phase = item.phase ?? 0
      } else {
        const p = byId.get(item.parent)
        if (!p) throw new Error(`齿轮系：找不到父轮 ${item.parent}`)
        const beta = THREE.MathUtils.degToRad(item.bearing ?? 90)
        const d = p.radius + r
        pos = new THREE.Vector2(p.pos.x + Math.cos(beta) * d, p.pos.y + Math.sin(beta) * d)
        ratio = -p.ratio * (p.teeth / teeth)
        phase = beta + Math.PI - (Math.PI - p.teeth * (beta - p.phase)) / teeth
        contact = new THREE.Vector3(
          p.pos.x + Math.cos(beta) * p.radius,
          p.pos.y + Math.sin(beta) * p.radius,
          z + thickness * 0.5
        )
        contactCenter = new THREE.Vector3(p.pos.x, p.pos.y, contact.z)
        contactParentRatio = p.ratio
      }

      const geo = makeGearGeometry({
        teeth,
        module: m,
        thickness,
        lighten: item.lighten ?? true,
        holeCount: item.holeCount ?? (teeth >= 20 ? 6 : 5),
        hubRatio: item.hubRatio ?? 0.32,
      })

      const matName = item.mat ?? 'brass'
      const mesh = new THREE.Mesh(geo, materials[matName] ?? materials.brass)
      mesh.castShadow = castShadow
      mesh.receiveShadow = receiveShadow

      const bone = new THREE.Bone() // 骨骼节点：单个齿轮的旋转骨
      bone.position.set(pos.x, pos.y, 0)
      bone.rotation.z = phase
      bone.add(mesh)
      this.bone.add(bone)

      // 轮毂：轴心帽 + 螺栓
      const hubR = Math.max(m * 1.05, Math.min(r * 0.32, r - m * 1.9))
      const hubCap = new THREE.Mesh(
        new THREE.CylinderGeometry(hubR * 1.02, hubR * 1.02, thickness * 1.22, 14),
        materials.steelDark
      )
      hubCap.rotation.x = Math.PI / 2
      hubCap.castShadow = castShadow
      bone.add(hubCap)

      if (r > 0.5) {
        const bolt = new THREE.Mesh(
          new THREE.CylinderGeometry(hubR * 0.42, hubR * 0.42, thickness * 1.5, 6),
          materials.brassAged
        )
        bolt.rotation.x = Math.PI / 2
        bone.add(bolt)
      }

      const gear = { id: item.id, teeth, radius: r, pos, phase, ratio, mesh, bone, thickness }
      this.gears.push(gear)
      byId.set(item.id, gear)

      if (contact) {
        const parent = byId.get(item.parent)
        this.contacts.push({
          point: contact, // 啮合点（连心线上的节点）
          center: contactCenter, // 父轮中心：用于求啮合切向
          radius: r,
          ratio,
          parentRadius: parent.radius,
          parentRatio: contactParentRatio, // 带符号：决定火花甩出方向
        })
      }
    }
  }

  /** theta：主轴转角（弧度）；所有齿轮按齿数比等比例咬合转动 */
  update(theta) {
    for (const g of this.gears) g.bone.rotation.z = g.phase + g.ratio * theta
  }

  gear(id) {
    return this.gears.find((g) => g.id === id)
  }

  /** 某齿轮当前转角（用于棘爪 / 擒纵叉联动） */
  angleOf(id, theta) {
    const g = this.gear(id)
    return g ? g.phase + g.ratio * theta : 0
  }
}
