import * as THREE from 'three'

const UP = new THREE.Vector3(0, 1, 0)
const XAXIS = new THREE.Vector3(1, 0, 0)

/** 两点之间的圆柱（杆 / 立柱 / 连杆） */
export function rod(a, b, radius, material, radial = 10, open = false) {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  const geo = new THREE.CylinderGeometry(radius, radius, len, radial, 1, open)
  const mesh = new THREE.Mesh(geo, material)
  mesh.position.copy(a).addScaledVector(dir, 0.5)
  mesh.quaternion.setFromUnitVectors(UP, dir.clone().normalize())
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** 圆环（箍 / 法兰） */
export function ring(radius, tube, material, segments = 40, arc = Math.PI * 2) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, segments, arc), material)
  mesh.castShadow = true
  return mesh
}

/** 沿圆周排布的铆钉 / 螺栓阵列 */
export function boltRing(count, radius, material, size = 0.05, y = 0, axis = 'y') {
  const g = new THREE.Group()
  const geo = new THREE.CylinderGeometry(size, size * 1.1, size * 1.4, 6)
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    const b = new THREE.Mesh(geo, material)
    if (axis === 'y') {
      b.position.set(Math.cos(a) * radius, y, Math.sin(a) * radius)
    } else {
      b.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0)
      b.rotation.x = Math.PI / 2
    }
    b.castShadow = true
    g.add(b)
  }
  return g
}

/** 长方体构件（拨叉 / 摇臂 / 支架），长轴沿 X */
export function bar(len, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, h, d), material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** 圆锥 / 截头锥（锥齿轮、顶尖、漏斗） */
export function cone(rTop, rBottom, h, material, seg = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * 棘爪：支点 bone + 摆臂 + 爪尖，随棘轮转动做「抬升—跌落」的卡顿联动
 * lift: 0..1 抬升量，由齿相位驱动的锯齿函数给出
 */
export function makePawl({ pivot, target, material, materials, armLength }) {
  const bone = new THREE.Bone()
  bone.position.copy(pivot)
  const dir = new THREE.Vector3().subVectors(target, pivot)
  bone.rotation.z = Math.atan2(dir.y, dir.x)

  const arm = bar(armLength, 0.07, 0.09, material)
  arm.position.set(armLength / 2, 0, 0)
  bone.add(arm)

  const tip = bar(0.16, 0.11, 0.11, materials.brassAged)
  tip.position.set(armLength, -0.07, 0)
  tip.rotation.z = -0.5
  bone.add(tip)

  const hubMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 10), materials.steelDark)
  hubMesh.rotation.x = Math.PI / 2
  bone.add(hubMesh)

  return { bone, arm, tip, baseRotation: bone.rotation.z }
}

/**
 * 擒纵叉：双爪摆叉，摆动频率 = 擒纵轮齿数 × 轮转角（一次一齿）
 */
export function makePalletFork({ pivot, materials, armLength = 0.62, spread = 0.26 }) {
  const bone = new THREE.Bone()
  bone.position.copy(pivot)

  const shaft = bar(armLength, 0.06, 0.07, materials.brassAged)
  shaft.position.set(armLength / 2, 0, 0)
  bone.add(shaft)

  for (const s of [-1, 1]) {
    const prong = bar(0.2, 0.055, 0.075, materials.steel)
    prong.position.set(armLength, s * spread, 0)
    prong.rotation.z = s * 0.55
    bone.add(prong)
  }

  const hubMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 10), materials.steelDark)
  hubMesh.rotation.x = Math.PI / 2
  bone.add(hubMesh)

  return bone
}

/**
 * 链传动：两个等径链轮 + 闭环链节（沿路径匀速流动）
 * 路径 = 右侧直线 + 下半圆 + 左侧直线 + 上半圆
 */
export class ChainDrive {
  constructor({ top, bottom, radius = 0.42, z = 0, links = 46, materials, ratio = 1.6 }) {
    this.group = new THREE.Group()
    this.radius = radius
    this.ratio = ratio
    this.u = 0
    const c1 = new THREE.Vector2(top.x, top.y)
    const c2 = new THREE.Vector2(bottom.x, bottom.y)
    this.c1 = c1
    this.c2 = c2
    const straight = Math.max(c1.distanceTo(c2), 0.001)
    this.straight = straight
    this.arc = Math.PI * radius
    this.total = straight * 2 + this.arc * 2

    for (const c of [c1, c2]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, 0.16, 24),
        materials.brassDark
      )
      wheel.rotation.x = Math.PI / 2
      wheel.position.set(c.x, c.y, z)
      wheel.castShadow = true
      this.group.add(wheel)

      const teethGeo = new THREE.BoxGeometry(0.05, 0.05, 0.17)
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2
        const t = new THREE.Mesh(teethGeo, materials.brassAged)
        t.position.set(c.x + Math.cos(a) * radius, c.y + Math.sin(a) * radius, z)
        t.rotation.z = a
        this.group.add(t)
      }
      const hubMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 10), materials.steelDark)
      hubMesh.rotation.x = Math.PI / 2
      hubMesh.position.set(c.x, c.y, z)
      this.group.add(hubMesh)
    }

    // 链节
    const linkGeo = new THREE.BoxGeometry(0.17, 0.075, 0.13)
    this.linkGeo = linkGeo
    this.links = []
    for (let i = 0; i < links; i++) {
      const m = new THREE.Mesh(linkGeo, i % 2 === 0 ? materials.steel : materials.brassDark)
      m.castShadow = true
      this.group.add(m)
      this.links.push(m)
    }
    this.z = z
    this.update(0, 0)
  }

  pointAt(u) {
    const s = this.straight
    const a = this.arc
    let d = ((u % this.total) + this.total) % this.total
    if (d < s) {
      // 右侧下行
      const t = d / s
      return new THREE.Vector3(
        this.c1.x + this.radius,
        this.c1.y + (this.c2.y - this.c1.y) * t,
        this.z
      )
    }
    d -= s
    if (d < a) {
      const ang = -Math.PI * (d / a) // 0 → -π，绕下链轮
      return new THREE.Vector3(this.c2.x + Math.cos(ang) * this.radius, this.c2.y + Math.sin(ang) * this.radius, this.z)
    }
    d -= a
    if (d < s) {
      const t = d / s
      return new THREE.Vector3(
        this.c2.x - this.radius,
        this.c2.y + (this.c1.y - this.c2.y) * t,
        this.z
      )
    }
    d -= s
    const ang = Math.PI * (1 - Math.min(Math.max(d / a, 0), 1)) // π → 0，经顶部绕上链轮
    return new THREE.Vector3(this.c1.x + Math.cos(ang) * this.radius, this.c1.y + Math.sin(ang) * this.radius, this.z)
  }

  update(theta, dt) {
    const omega = 0
    void omega
    // u 沿路径推进：链速 = 链轮角速度 × 半径
    this.u -= (theta - (this._lastTheta ?? theta)) * this.ratio * this.radius
    this._lastTheta = theta
    void dt
    const step = this.total / this.links.length
    for (let i = 0; i < this.links.length; i++) {
      const p = this.pointAt(this.u + i * step)
      const p2 = this.pointAt(this.u + i * step + 0.01)
      const m = this.links[i]
      m.position.copy(p)
      const dir = new THREE.Vector3().subVectors(p2, p)
      if (dir.lengthSq() > 1e-8) {
        m.quaternion.setFromUnitVectors(XAXIS, dir.normalize())
      }
    }
  }
}
