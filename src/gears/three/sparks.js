import * as THREE from 'three'
import { createPointsMaterial, makePoints } from './points.js'

const MAX = 1200
const GRAVITY = -5.2

/**
 * 齿轮交界处的火花：从咬合点沿切向甩出，受重力与阻尼，
 * 颜色由白热 → 橙 → 暗红渐冷。发射密度与啮合线速度成正比。
 */
export class Sparks {
  constructor() {
    this.material = createPointsMaterial({ sizeScale: 260, softness: 0.32 })
    this.points = makePoints(MAX, this.material)
    this.pos = this.points.geometry.attributes.position.array
    this.col = this.points.geometry.attributes.aColor.array
    this.size = this.points.geometry.attributes.aSize.array
    this.alpha = this.points.geometry.attributes.aAlpha.array
    this.vel = new Float32Array(MAX * 3)
    this.life = new Float32Array(MAX)
    this.maxLife = new Float32Array(MAX)
    this.cursor = 0
    this.alive = 0
    this.carry = 0 // 不足 1 颗的发射余量：低速拖动时也能持续溅出零星火花
  }

  get object3d() {
    return this.points
  }

  /** contact: { point, radius, ratio, tangent }；speed: 啮合线速度（单位/秒） */
  emit(point, tangent, speed, amount) {
    this.carry += amount
    const n = Math.min(Math.floor(this.carry), 10)
    if (n <= 0) return
    this.carry -= n
    for (let i = 0; i < n; i++) {
      const idx = this.cursor
      this.cursor = (this.cursor + 1) % MAX
      const i3 = idx * 3

      const spread = 0.55
      const vx = tangent.x * speed * (0.25 + Math.random() * 0.5) + (Math.random() - 0.5) * 1.5
      const vy = tangent.y * speed * (0.25 + Math.random() * 0.5) + (Math.random() - 0.5) * 1.5 + 0.7
      const vz = (Math.random() - 0.5) * 1.2 * spread * 2

      this.pos[i3] = point.x + (Math.random() - 0.5) * 0.05
      this.pos[i3 + 1] = point.y + (Math.random() - 0.5) * 0.05
      this.pos[i3 + 2] = point.z + (Math.random() - 0.5) * 0.04

      this.vel[i3] = vx
      this.vel[i3 + 1] = vy
      this.vel[i3 + 2] = vz

      this.maxLife[idx] = 0.34 + Math.random() * 0.62
      this.life[idx] = this.maxLife[idx]
      this.size[idx] = 0.012 + Math.random() * 0.022
      this.alpha[idx] = 1
      this.col[i3] = 1
      this.col[i3 + 1] = 0.82
      this.col[i3 + 2] = 0.42
    }
  }

  update(dt) {
    const pos = this.pos
    const vel = this.vel
    let alive = 0
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0
        continue
      }
      const i3 = i * 3
      this.life[i] -= dt
      if (this.life[i] <= 0) {
        this.alpha[i] = 0
        continue
      }
      alive++
      vel[i3 + 1] += GRAVITY * dt
      const drag = Math.max(0, 1 - 2.6 * dt)
      vel[i3] *= drag
      vel[i3 + 1] *= drag
      vel[i3 + 2] *= drag
      pos[i3] += vel[i3] * dt
      pos[i3 + 1] += vel[i3 + 1] * dt
      pos[i3 + 2] += vel[i3 + 2] * dt

      const t = this.life[i] / this.maxLife[i]
      this.alpha[i] = Math.min(1, t * 1.5) * (0.35 + t * 0.65)
      // 白热 → 橙 → 暗红
      this.col[i3] = 1
      this.col[i3 + 1] = 0.22 + t * 0.66
      this.col[i3 + 2] = 0.06 + t * t * 0.42
      this.size[i] = 0.008 + t * 0.02
    }
    this.alive = alive
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
