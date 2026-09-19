import { createCrystalResonance } from '../src/crystal/main.js'

const canvas = document.getElementById('cr-canvas')
const loader = document.getElementById('cr-loader')
const cursor = document.getElementById('cr-cursor')
const resValue = document.getElementById('cr-res-value')
const resBar = document.getElementById('cr-res-bar')
const ripplesEl = document.getElementById('cr-ripples')
const perfEl = document.getElementById('cr-perf')

let cursorShown = false
window.addEventListener(
  'pointermove',
  (e) => {
    cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
    if (!cursorShown) {
      cursorShown = true
      cursor.style.opacity = '1'
    }
  },
  { passive: true },
)

const world = createCrystalResonance({
  canvas,
  onReady: () => {
    loader?.classList.add('is-hidden')
    setTimeout(() => loader?.remove(), 1000)
  },
  onStats: (s) => {
    const pct = Math.round(s.resonance * 100)
    if (resValue) resValue.textContent = `${pct}%`
    if (resBar) resBar.style.width = `${Math.max(2, pct)}%`
    if (ripplesEl) ripplesEl.textContent = String(s.ripples)
    if (perfEl) perfEl.textContent = `${s.cells} / ${s.fps}`
  },
})

window.addEventListener('beforeunload', () => world.dispose())
