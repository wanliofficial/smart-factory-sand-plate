import * as THREE from 'three'
import { createPointsMaterial, makePoints } from './points.js'

const COUNT = 2000
const TAU = Math.PI * 2

const FLOOR = -3.12 // 下舱底面
const PILE_MAX_H = 1.16 // 沙堆最高
const PILE_BASE_R = 0.72 // 沙堆底半径
const NECK_UP = 0.66 // 上舱出沙口
const SURF_MAX = 2.52 // 上舱满沙高度
const STREAM_W = 0.055 // 流沙中的粒子占比（决定流的粗细）

/**
 * 可逆沙流
 *
 * 每颗沙粒固定一个身份值 u∈[0,1]，全局填充度 F（上舱余量）随时间变化：
 *   A = u − F  （A<0 在上舱 / 0≤A<w 在流束中 / A≥w 已堆积在下舱）
 * 位置是 (F, u) 的纯函数 —— 因此 F 增大（时间倒流）时沙粒沿原路径
 * 逆向回流，完全可逆，不存在粒子状态的不可逆损耗。
 */
export class SandFlow {
  constructor({ glassRadius, z = 0.45 }) {
    this.glassRadius = glassRadius
    this.z = z
    this.material = createPointsMaterial({ sizeScale: 300, softness: 0.5 })
    this.points = makePoints(COUNT, this.material)
    const g = this.points.geometry
    this.pos = g.attributes.position.array
    this.col = g.attributes.aColor.array
    this.size = g.attributes.aSize.array
    this.alpha = g.attributes.aAlpha.array

    this.u = new Float32Array(COUNT)
    this.randR = new Float32Array(COUNT) // 径向 0..1（已开方）
    this.randA = new Float32Array(COUNT) // 方位角
    this.jitter = new Float32Array(COUNT)

    for (let i = 0; i < COUNT; i++) {
      this.u[i] = i / COUNT + Math.random() * (1 / COUNT)
      this.randR[i] = Math.sqrt(Math.random())
      this.randA[i] = Math.random() * TAU
      this.jitter[i] = Math.random() * TAU
      this.size[i] = 0.014 + Math.random() * 0.012
      this.alpha[i] = 1
    }
  }

  get object3d() {
    return this.points
  }

  static pileHeight(fill) {
    return PILE_MAX_H * Math.pow(1 - fill, 0.62)
  }

  static surfaceY(fill) {
    return NECK_UP + (SURF_MAX - NECK_UP) * Math.pow(fill, 0.66)
  }

  /** fill: 上舱余量 0..1 */
  update(fill, time) {
    const pileH = SandFlow.pileHeight(fill)
    const pileTop = FLOOR + pileH
    const surf = SandFlow.surfaceY(fill)
    const streamTop = NECK_UP
    const streamBottom = pileTop + 0.02
    const pos = this.pos
    const col = this.col
    const alpha = this.alpha

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3
      const u = this.u[i]
      const a = u - fill // 年龄：<0 未落，0..w 流束，>w 已堆积
      let x
      let y
      let hot = 0

      let zz
      if (a < 0) {
        // 上舱沙堆：越接近 u=F 的越靠下（即将流出）
        const t = Math.min(1, -a / Math.max(fill, 1e-4))
        y = NECK_UP + t * (surf - NECK_UP)
        const rr = this.glassRadius(y) * 0.88 * this.randR[i]
        x = Math.cos(this.randA[i]) * rr
        zz = this.z + Math.sin(this.randA[i]) * rr * 0.7
        y += Math.sin(time * 1.7 + this.jitter[i]) * 0.006
        hot = 0
      } else if (a < STREAM_W) {
        // 流束：自上舱出口螺旋坠向下舱沙堆表面
        const s = a / STREAM_W
        const ease = s * s * 0.35 + s * 0.65
        y = streamTop + (streamBottom - streamTop) * ease
        const taper = 0.32 * (1 - s * 0.72)
        const ang = this.randA[i] + s * 2.4
        const rr = taper * (0.35 + this.randR[i] * 0.65)
        x = Math.cos(ang) * rr
        zz = this.z + Math.sin(ang) * rr * 0.5
        hot = 1 - s * 0.35
      } else {
        // 下舱沙堆：a 越大埋得越深
        const k = Math.min(1, (a - STREAM_W) / (1 - STREAM_W))
        const dy = pileH * (1 - k)
        y = FLOOR + dy
        const rr = PILE_BASE_R * Math.sqrt(Math.max(0, 1 - dy / PILE_MAX_H)) * this.randR[i]
        x = Math.cos(this.randA[i]) * rr
        zz = this.z + Math.sin(this.randA[i]) * rr * 0.62
        y += Math.sin(time * 1.4 + this.jitter[i]) * 0.005
        hot = 0
      }

      // 收束进玻璃内腔：沙面整体前移，避免出现穿出罩体的沙粒
      const lim = this.glassRadius(y) * 0.94
      const d = Math.hypot(x, zz)
      if (d > lim && d > 1e-5) {
        const s = lim / d
        x *= s
        zz *= s
      }
      pos[i3] = x
      pos[i3 + 1] = y
      pos[i3 + 2] = zz

      if (hot > 0) {
        const flicker = 0.72 + 0.28 * Math.sin(time * 22 + this.jitter[i])
        col[i3] = 1.0 * flicker
        col[i3 + 1] = (0.55 + hot * 0.28) * flicker
        col[i3 + 2] = (0.2 + hot * 0.2) * flicker
        alpha[i] = 0.95
      } else {
        const warm = 0.62 + 0.38 * this.randR[i]
        col[i3] = 0.85 * warm
        col[i3 + 1] = 0.44 * warm
        col[i3 + 2] = 0.16 * warm
        alpha[i] = 0.85
      }
    }

    const g = this.points.geometry
    g.attributes.position.needsUpdate = true
    g.attributes.aColor.needsUpdate = true
    g.attributes.aSize.needsUpdate = true
    g.attributes.aAlpha.needsUpdate = true
  }

  dispose() {
    this.points.geometry.dispose()
    this.material.dispose()
  }
}

export const SAND_CONSTANTS = { FLOOR, PILE_MAX_H, PILE_BASE_R, NECK_UP, SURF_MAX }
