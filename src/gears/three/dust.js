import * as THREE from 'three'
import { createPointsMaterial, makePoints } from './points.js'

const COUNT = 260

/** 废土浮尘：缓慢上浮的暖色尘埃，营造落日氛围中的空气感 */
export class Dust {
  constructor({ radius = 12, height = 9 }) {
    this.material = createPointsMaterial({ sizeScale: 220, softness: 0.2 })
    this.points = makePoints(COUNT, this.material)
    const g = this.points.geometry
    this.pos = g.attributes.position.array
    this.col = g.attributes.aColor.array
    this.size = g.attributes.aSize.array
    this.alpha = g.attributes.aAlpha.array
    this.speed = new Float32Array(COUNT)
    this.phase = new Float32Array(COUNT)
    this.radius = radius
    this.height = height

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * radius
      this.pos[i3] = Math.cos(a) * r
      this.pos[i3 + 1] = -height * 0.5 + Math.random() * height
      this.pos[i3 + 2] = Math.sin(a) * r * 0.7
      this.speed[i] = 0.06 + Math.random() * 0.22
      this.phase[i] = Math.random() * Math.PI * 2
      this.size[i] = 0.008 + Math.random() * 0.016
      const warm = 0.5 + Math.random() * 0.5
      this.col[i3] = 1.0 * warm
      this.col[i3 + 1] = 0.62 * warm
      this.col[i3 + 2] = 0.3 * warm
      this.alpha[i] = 0.16 + Math.random() * 0.24
    }
  }

  get object3d() {
    return this.points
  }

  update(dt, time) {
    const pos = this.pos
    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3
      pos[i3 + 1] += this.speed[i] * dt
      pos[i3] += Math.sin(time * 0.25 + this.phase[i]) * 0.06 * dt
      if (pos[i3 + 1] > this.height * 0.5) pos[i3 + 1] = -this.height * 0.5
    }
    this.points.geometry.attributes.position.needsUpdate = true
  }

  dispose() {
    this.points.geometry.dispose()
    this.material.dispose()
  }
}
