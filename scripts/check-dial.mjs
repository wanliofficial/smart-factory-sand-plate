/**
 * 逆时空齿轮轴 · 拨轮阻尼驱动链路单测
 *
 *   node scripts/check-dial.mjs
 *
 * 用极简 DOM 桩模拟「按下 → 拖动 → 松手 → 倒转」全过程，验证：
 *   1. 拖动跟手（拨轮角位移 1:1）
 *   2. GSAP Easing 后的阻尼值（drive.omega）随拖动出现，方向正确
 *   3. 松手后按惯性衰减归零
 *   4. 「倒转」时间线把阻尼值推到负向极速再回落
 */
const handlers = {}
const makeEl = () => {
  const el = {
    innerHTML: '',
    attrs: {},
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(k, v) {
      this.attrs[k] = v
    },
    addEventListener(type, fn) {
      ;(handlers[type] ||= []).push(fn)
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
    querySelector: () => makeEl(),
  }
  return el
}
globalThis.window = globalThis.window ?? {}
const container = makeEl()

const { createDial } = await import('../src/gears/dial.js')

let rewound = 0
const dial = createDial(container, { onRewind: () => rewound++ })

let fail = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}${extra ? '  -> ' + extra : ''}`)
  if (!cond) fail++
}
const fire = (type, e) => (handlers[type] || []).forEach((f) => f(e))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
// 模拟渲染帧：拨轮阻尼系数在每帧 update 中计算
const frames = async (n, msPerFrame = 16) => {
  for (let i = 0; i < n; i++) {
    dial.update(msPerFrame / 1000)
    await wait(msPerFrame)
  }
}

const CENTER = { x: 100, y: 100 } // 容器中心（rect 200×200，左上角在原点）
const at = (angleDeg, r = 90) => ({
  pointerId: 1,
  clientX: CENTER.x + Math.cos((angleDeg * Math.PI) / 180) * r,
  clientY: CENTER.y + Math.sin((angleDeg * Math.PI) / 180) * r,
  preventDefault() {},
})

console.log('\n[1] 拖动跟手 + 阻尼值生成')
fire('pointerdown', at(0))
let lastAngle = 0
for (const deg of [10, 20, 30, 40]) {
  fire('pointermove', at(deg))
  await wait(35)
}
lastAngle = dial.state.angle
ok(Math.abs(lastAngle - (40 * Math.PI) / 180) < 0.02, '拨轮 1:1 跟手（40° 拖动）', `${((lastAngle * 180) / Math.PI).toFixed(2)}°`)

await frames(8)
const driveWhileDrag = dial.getOmega()
ok(driveWhileDrag > 0.3, '拖动产生正向阻尼值（顺时针）', driveWhileDrag.toFixed(3))
ok(dial.state.damping > 0, '阻尼系数已上报 HUD', dial.state.damping.toFixed(3))

console.log('\n[2] 松手惯性衰减')
fire('pointerup', { pointerId: 1 })
await frames(60)
const afterRelease = dial.getOmega()
ok(afterRelease < driveWhileDrag, '松手后阻尼值开始衰减', `${driveWhileDrag.toFixed(3)} → ${afterRelease.toFixed(3)}`)
ok(afterRelease >= 0, '惯性与拖动同向（不会反向抽动）')

console.log('\n[3] 反向拖动')
fire('pointerdown', at(40))
for (const deg of [30, 20, 10, 0]) {
  fire('pointermove', at(deg))
  await wait(35)
}
await frames(8)
const reverseDrag = dial.getOmega()
ok(reverseDrag < -0.3, '反向拖动产生负向阻尼值（逆时针）', reverseDrag.toFixed(3))
fire('pointerup', { pointerId: 1 })

console.log('\n[4] 倒转时间线')
await frames(80)
dial.rewind()
await frames(38)
const rewindPeak = dial.getOmega()
ok(rewound === 1, '倒转回调已触发')
ok(rewindPeak < -4, '倒转把阻尼值推到负向极速', rewindPeak.toFixed(2))
await frames(170)
ok(Math.abs(dial.getOmega()) < 0.4, '倒转结束后回到静止', dial.getOmega().toFixed(3))

console.log('\n[5] 拨轮角度积分（松手后继续转动）')
const a0 = dial.state.angle
dial.update(1 / 60)
dial.update(1 / 60)
ok(Number.isFinite(dial.state.angle), '拨轮角度数值有效')
ok(Math.abs(dial.state.angle - a0) < 0.05, '静止时不产生虚假转动', (dial.state.angle - a0).toFixed(4))

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : fail + ' CHECK(S) FAILED'}`)
process.exit(fail === 0 ? 0 : 1)
