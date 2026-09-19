import * as THREE from 'three'
import gsap from 'gsap'
import './gears.css'
import { createStage } from './three/stage.js'
import { buildHourglass, glassRadius } from './three/hourglass.js'
import { Sparks } from './three/sparks.js'
import { SandFlow } from './three/sand.js'
import { Dust } from './three/dust.js'
import { createDial } from './dial.js'
import { createHud, fadeHint } from './hud.js'

const MASTER_GAIN = 1.35 // 拨轮 → 主轴的传动比
const SAND_RATE = 0.028 // 每弧度主轴转角消耗的沙量

const app = document.getElementById('app')
const canvas = document.getElementById('ga-canvas')
const boot = document.getElementById('ga-boot')
const flash = document.getElementById('ga-flash')

let stage
try {
  stage = createStage(canvas)
} catch (err) {
  console.error(err)
  if (boot) {
    boot.classList.add('is-error')
    boot.innerHTML = `<p>WebGL 初始化失败</p><p class="ga-boot-sub">${String(err?.message ?? err)}</p>`
  }
  throw err
}

const { scene, materials } = stage

/* ---------------- 装配 ---------------- */
const hourglass = buildHourglass({ materials })
scene.add(hourglass.root)

const sparks = new Sparks()
scene.add(sparks.object3d)

const sand = new SandFlow({ glassRadius, z: 0.45 })
scene.add(sand.object3d)

const dust = new Dust({ radius: 13, height: 10 })
scene.add(dust.object3d)

/* ---------------- 状态 ---------------- */
const state = {
  theta: 0, // 主轴转角
  omega: 0, // 主轴角速度（由拨轮阻尼值驱动）
  fill: 1, // 上舱余沙
  time: 0,
}

const impact = new THREE.Vector3()

/* ---------------- 拨轮 ---------------- */
const dialEl = document.getElementById('ga-dial')

function rewindFx() {
  // 屏幕冲击 + 镜头抖动 + 冷色倒流闪光
  if (flash) {
    gsap.killTweensOf(flash)
    gsap.fromTo(flash, { opacity: 0.85 }, { opacity: 0, duration: 1.1, ease: 'power2.out' })
  }
  document.body.classList.add('is-rewinding')
  gsap.delayedCall(1.4, () => document.body.classList.remove('is-rewinding'))
  gsap.killTweensOf(stage.shake)
  gsap.fromTo(
    stage.shake,
    { x: 0.09, y: -0.06 },
    { x: 0, y: 0, duration: 1.5, ease: 'elastic.out(1.6, 0.35)' }
  )
}

const dial = createDial(dialEl, {
  onRewind: rewindFx,
  onDriveStart: () => {
    fadeHint()
    stage.resetIdle()
  },
})

/* ---------------- HUD ---------------- */
const updateHud = createHud()
const meshCount = hourglass.front.gears.length + hourglass.back.gears.length
const contactCount = hourglass.contacts.length

/* ---------------- 主循环（GSAP ticker 驱动） ---------------- */
const clock = new THREE.Clock()

function tick() {
  const dt = Math.min(clock.getDelta(), 1 / 20)
  state.time += dt

  // ★ 阻尼值 → 3D 齿轮组转角：拨轮 Easing 后的角速度实时积分
  state.omega = dial.getOmega()
  state.theta += state.omega * MASTER_GAIN * dt

  // 时序随转动流动：正转排沙，反转回流
  const flowing = Math.abs(state.omega) > 0.05 && state.fill > 0 && state.fill < 1
  state.fill = THREE.MathUtils.clamp(state.fill - state.omega * SAND_RATE * dt, 0, 1)

  const pileTop = -3.12 + SandFlow.pileHeight(state.fill)
  impact.set(0, pileTop + 0.02, 0.45)

  hourglass.update(state.theta, state.omega, dt, { sparks, impact, sandFlowing: flowing })
  sand.update(state.fill, state.time)
  sparks.update(dt)
  dust.update(dt, state.time)
  dial.update(dt)
  updateHud({
    omega: state.omega,
    damping: dial.state.damping,
    fill: state.fill,
    meshCount,
    contactCount,
    dt,
    time: state.time,
  })

  stage.render(dt)
}

gsap.ticker.add(tick)
gsap.ticker.lagSmoothing(500, 33)

/* ---------------- 键盘 ---------------- */
window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  const k = e.key.toLowerCase()
  if (k === 'arrowleft' || k === 'a') dial.nudge(-1)
  if (k === 'arrowright' || k === 'd') dial.nudge(1)
  if (k === ' ') {
    e.preventDefault()
    dial.rewind()
  }
  fadeHint()
  stage.resetIdle()
})

/* ---------------- 启动 ---------------- */
requestAnimationFrame(() => {
  boot?.classList.add('is-done')
  dial.bootSpin()
  gsap.delayedCall(9, fadeHint)
  window.__gearAxis = { state, dial, hourglass, stage }
})
