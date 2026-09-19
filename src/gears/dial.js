import gsap from 'gsap'

const TAU = Math.PI * 2
const MAX_OMEGA = 11.5 // 拨轮最大角速度 rad/s

function buildSvg() {
  const ticks = []
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU
    const major = i % 6 === 0
    const r1 = major ? 78 : 83
    const r2 = 92
    const x1 = Math.cos(a) * r1
    const y1 = Math.sin(a) * r1
    const x2 = Math.cos(a) * r2
    const y2 = Math.sin(a) * r2
    ticks.push(
      `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${
        major ? '#ffcf8a' : '#a5763c'
      }" stroke-width="${major ? 2.4 : 1.2}" opacity="${major ? 0.95 : 0.6}" />`
    )
  }

  const knobs = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU
    const cx = Math.cos(a) * 68
    const cy = Math.sin(a) * 68
    knobs.push(`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="9.5" fill="url(#gaKnob)" stroke="#3a2a16" stroke-width="1.4" />`)
    knobs.push(`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="3" fill="#2a1c0e" opacity="0.75" />`)
  }

  const spokes = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.26
    const x1 = Math.cos(a) * 20
    const y1 = Math.sin(a) * 20
    const x2 = Math.cos(a) * 66
    const y2 = Math.sin(a) * 66
    spokes.push(
      `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="url(#gaBrass)" stroke-width="7" stroke-linecap="round" opacity="0.92" />`
    )
  }

  return `
  <svg class="ga-dial-svg" viewBox="-100 -100 200 200" aria-label="倒转拨轮">
    <defs>
      <linearGradient id="gaBrass" x1="0" y1="-1" x2="0" y2="1">
        <stop offset="0%" stop-color="#f7d79a" />
        <stop offset="45%" stop-color="#c08c46" />
        <stop offset="100%" stop-color="#6d4d22" />
      </linearGradient>
      <linearGradient id="gaKnob" x1="0" y1="-1" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffe0ab" />
        <stop offset="55%" stop-color="#c8934a" />
        <stop offset="100%" stop-color="#5c3f1c" />
      </linearGradient>
      <radialGradient id="gaHub" cx="0.35" cy="0.3" r="0.85">
        <stop offset="0%" stop-color="#5a3c1c" />
        <stop offset="60%" stop-color="#2a1c0e" />
        <stop offset="100%" stop-color="#150d06" />
      </radialGradient>
      <filter id="gaGlow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="3.4" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>

    <circle r="96" fill="rgba(14,9,5,0.72)" stroke="#6b4d24" stroke-width="2" />
    <circle r="88" fill="none" stroke="#3a2a16" stroke-width="1" opacity="0.8" />
    <circle id="ga-gauge-arc" r="96" fill="none" stroke="#ff9d3c" stroke-width="5"
      stroke-linecap="round" stroke-dasharray="0 9999" transform="rotate(-90)" filter="url(#gaGlow)" opacity="0.95" />
    <g>${ticks.join('')}</g>

    <g id="ga-rotor">
      <circle r="74" fill="none" stroke="url(#gaBrass)" stroke-width="3" opacity="0.75" />
      ${spokes.join('')}
      ${knobs.join('')}
      <circle r="30" fill="url(#gaHub)" stroke="#8a6531" stroke-width="2" />
      <circle r="22" fill="none" stroke="#c9974c" stroke-width="1" opacity="0.55" />
      <g id="ga-arrow" opacity="0.95">
        <path d="M -14 -6 L -4 0 L -14 6 Z" fill="#ffb45c" />
        <path d="M 14 -6 L 4 0 L 14 6 Z" fill="#ffb45c" />
      </g>
    </g>

    <g id="ga-hub-button" class="ga-hub-button" role="button" tabindex="0" aria-label="倒转">
      <circle r="29" fill="transparent" />
      <text class="ga-hub-text" x="0" y="-2" text-anchor="middle">倒转</text>
      <text class="ga-hub-sub" x="0" y="12" text-anchor="middle">REWIND</text>
    </g>

    <path d="M -10 -99 L 10 -99 L 0 -86 Z" fill="#ffd79a" opacity="0.95" />
  </svg>`
}

/**
 * 图形化「倒转」拨轮
 *
 * 拖动时把指针的角位移实时写进拨轮角度，同时用 GSAP 对瞬时角速度做
 * Easing 阻尼（power2.out 逼近 + power3.out 惯性衰减），
 * 这个被阻尼过的数值（drive.omega）即为驱动 3D 齿轮组的唯一输入。
 */
export function createDial(container, { onRewind, onDriveStart } = {}) {
  container.innerHTML = buildSvg()
  const rotor = container.querySelector('#ga-rotor')
  const arc = container.querySelector('#ga-gauge-arc')
  const hubButton = container.querySelector('#ga-hub-button')

  const state = { angle: 0, damping: 0, dragging: false }
  const drive = { omega: 0 } // ← GSAP 阻尼后的角速度（rad/s）

  const ARC_LEN = TAU * 96

  let lastAngle = 0
  let lastT = 0
  let velEma = 0
  let pointerId = null

  const angleAt = (e) => {
    const r = container.getBoundingClientRect()
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2))
  }

  function onDown(e) {
    state.dragging = true
    pointerId = e.pointerId
    container.setPointerCapture?.(e.pointerId)
    container.classList.add('is-dragging')
    lastAngle = angleAt(e)
    lastT = performance.now()
    velEma = 0
    gsap.killTweensOf(drive)
    onDriveStart?.()
    e.preventDefault()
  }

  function onMove(e) {
    if (!state.dragging || e.pointerId !== pointerId) return
    const a = angleAt(e)
    let d = a - lastAngle
    while (d > Math.PI) d -= TAU
    while (d < -Math.PI) d += TAU
    lastAngle = a
    const now = performance.now()
    const dt = Math.min(Math.max((now - lastT) / 1000, 0.008), 0.1)
    lastT = now
    state.angle += d // 1:1 跟手
    velEma = velEma * 0.55 + (d / dt) * 0.45
    const target = gsap.utils.clamp(-MAX_OMEGA, MAX_OMEGA, velEma)
    gsap.to(drive, { omega: target, duration: 0.22, ease: 'power2.out', overwrite: true })
  }

  function onUp(e) {
    if (!state.dragging) return
    state.dragging = false
    container.classList.remove('is-dragging')
    container.releasePointerCapture?.(e.pointerId)
    pointerId = null
    // 飞轮惯性：速度越大衰减越久
    const decay = gsap.utils.clamp(1.1, 3.6, 1.1 + Math.abs(drive.omega) * 0.24)
    gsap.to(drive, { omega: 0, duration: decay, ease: 'power3.out', overwrite: true })
  }

  container.addEventListener('pointerdown', onDown)
  container.addEventListener('pointermove', onMove)
  container.addEventListener('pointerup', onUp)
  container.addEventListener('pointercancel', onUp)
  container.addEventListener('lostpointercapture', onUp)

  /** 倒转：GSAP 时间线冲击 —— 猛推到负向极速，再缓缓回落 */
  function rewind() {
    gsap.killTweensOf(drive)
    const tl = gsap.timeline()
    tl.to(drive, { omega: -MAX_OMEGA * 0.92, duration: 0.55, ease: 'power2.in' })
    tl.to(drive, { omega: 0, duration: 2.7, ease: 'power2.out' })
    onRewind?.()
  }

  hubButton.addEventListener('click', rewind)
  hubButton.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      rewind()
    }
  })

  /** 键盘/踏板式驱动 */
  function nudge(dir) {
    gsap.killTweensOf(drive)
    gsap.to(drive, { omega: dir * MAX_OMEGA * 0.42, duration: 0.5, ease: 'power2.out', overwrite: true })
    gsap.to(drive, { omega: 0, duration: 2.2, delay: 0.5, ease: 'power2.out' })
  }

  function update(dt) {
    if (!state.dragging) state.angle += drive.omega * dt
    rotor.setAttribute('transform', `rotate(${(state.angle * 180) / Math.PI})`)
    const norm = Math.min(Math.abs(drive.omega) / MAX_OMEGA, 1)
    state.damping = norm
    arc.setAttribute('stroke-dasharray', `${(norm * ARC_LEN).toFixed(1)} 9999`)
    arc.setAttribute('stroke', drive.omega < -0.05 ? '#5fd6ff' : '#ff9d3c')
    container.style.setProperty('--ga-drive', norm.toFixed(3))
    container.classList.toggle('is-reverse', drive.omega < -0.05)
  }

  /** 开机自检：自动转一小段，让画面一进来就是活的 */
  function bootSpin() {
    gsap.killTweensOf(drive)
    gsap.timeline()
      .to(drive, { omega: 3.1, duration: 1.4, ease: 'power2.out' })
      .to(drive, { omega: 0, duration: 3.2, ease: 'power2.out' })
  }

  return {
    state,
    drive,
    update,
    rewind,
    nudge,
    bootSpin,
    getOmega: () => drive.omega,
    MAX_OMEGA,
  }
}
