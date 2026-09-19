const clamp01 = (v) => Math.max(0, Math.min(1, v))

export function createHud() {
  const $ = (id) => document.getElementById(id)
  const el = {
    rpm: $('ga-rpm'),
    damp: $('ga-damp'),
    dampBar: $('ga-damp-bar'),
    dir: $('ga-dir'),
    charge: $('ga-charge'),
    chargeBar: $('ga-charge-bar'),
    mesh: $('ga-mesh'),
    fps: $('ga-fps'),
    status: $('ga-status'),
    hint: $('ga-hint'),
  }

  let last = 0
  let fps = 60

  return function update({ omega, damping, fill, meshCount, contactCount, dt, time }) {
    fps = fps * 0.9 + (1 / Math.max(dt, 1e-4)) * 0.1
    if (time - last < 0.1) return
    last = time

    const rpm = (Math.abs(omega) * 60) / (Math.PI * 2)
    if (el.rpm) el.rpm.textContent = rpm.toFixed(1).padStart(5, '0')
    if (el.damp) el.damp.textContent = damping.toFixed(3)
    if (el.dampBar) el.dampBar.style.width = `${(clamp01(damping) * 100).toFixed(1)}%`
    if (el.charge) el.charge.textContent = `${Math.round(clamp01(fill) * 100)}%`
    if (el.chargeBar) el.chargeBar.style.width = `${(clamp01(fill) * 100).toFixed(1)}%`
    if (el.mesh) el.mesh.textContent = `${meshCount} 轮 / ${contactCount} 触点`
    if (el.fps) el.fps.textContent = Math.round(fps).toString()

    if (el.dir) {
      const v = omega > 0.12 ? '顺时针 · 时序正流' : omega < -0.12 ? '逆时针 · 时序倒流' : '停滞 · 时序锁死'
      el.dir.textContent = v
      el.dir.className = `ga-row-value ${omega > 0.12 ? 'is-fwd' : omega < -0.12 ? 'is-rev' : ''}`
    }

    if (el.status) {
      el.status.textContent =
        omega < -0.12 ? '逆转中' : omega > 0.12 ? '推进中' : fill <= 0.001 ? '沙尽 · 时序终焉' : '待机'
      el.status.classList.toggle('is-active', Math.abs(omega) > 0.12)
    }
  }
}

export function fadeHint() {
  const hint = document.getElementById('ga-hint')
  if (hint) hint.classList.add('is-hidden')
}
