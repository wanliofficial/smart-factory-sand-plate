import * as THREE from 'three'

/**
 * 程序化做旧噪声贴图：大块污渍 + 细颗粒，用作 roughnessMap，
 * 让黄铜表面呈现废土做旧的斑驳感（无需外部贴图资源）。
 */
export function makeNoiseTexture(size = 256, opts = {}) {
  const { blotches = 30, contrast = 0.5, base = 156, repeat = 3 } = opts
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = `rgb(${base},${base},${base})`
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < blotches; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = 10 + Math.random() * 52
    const v = Math.random() < 0.5 ? 46 : 232
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(${v},${v},${v},0.45)`)
    g.addColorStop(1, `rgba(${v},${v},${v},0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // 细颗粒
  const img = ctx.getImageData(0, 0, size, size)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * contrast
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  return tex
}

/**
 * 落日余晖环境贴图：等距圆柱投影的渐变天幕 + 低角度太阳，
 * 经 PMREM 处理后作为金属反射环境，是黄铜质感的关键。
 */
export function makeSunsetEnvTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')

  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0.0, '#0b0912')
  g.addColorStop(0.32, '#2b1430')
  g.addColorStop(0.48, '#6d2c22')
  g.addColorStop(0.6, '#c85c22')
  g.addColorStop(0.68, '#ffb056')
  g.addColorStop(0.72, '#5a2a18')
  g.addColorStop(1.0, '#140d0a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 512, 256)

  // 低角度落日 + 大范围余晖
  const sun = ctx.createRadialGradient(150, 172, 0, 150, 172, 120)
  sun.addColorStop(0, '#fff3cf')
  sun.addColorStop(0.18, 'rgba(255, 190, 110, 0.85)')
  sun.addColorStop(0.55, 'rgba(255, 120, 48, 0.28)')
  sun.addColorStop(1, 'rgba(255, 90, 30, 0)')
  ctx.fillStyle = sun
  ctx.fillRect(0, 0, 512, 256)

  const tex = new THREE.CanvasTexture(canvas)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createMaterials() {
  const rough = makeNoiseTexture(256, { contrast: 0.52, base: 150, repeat: 3 })
  const roughFine = makeNoiseTexture(256, { contrast: 0.4, base: 170, repeat: 6 })

  const brass = new THREE.MeshStandardMaterial({
    color: 0xc08c46,
    metalness: 0.96,
    roughness: 0.38,
    roughnessMap: rough,
    envMapIntensity: 1.35,
  })

  const brassAged = new THREE.MeshStandardMaterial({
    color: 0x8b6730,
    metalness: 0.92,
    roughness: 0.62,
    roughnessMap: rough,
    envMapIntensity: 1.0,
  })

  const brassDark = new THREE.MeshStandardMaterial({
    color: 0x5c4526,
    metalness: 0.88,
    roughness: 0.72,
    roughnessMap: roughFine,
    envMapIntensity: 0.85,
  })

  const steel = new THREE.MeshStandardMaterial({
    color: 0x35302a,
    metalness: 0.9,
    roughness: 0.5,
    roughnessMap: roughFine,
    envMapIntensity: 0.9,
  })

  const steelDark = new THREE.MeshStandardMaterial({
    color: 0x1d1a17,
    metalness: 0.78,
    roughness: 0.66,
    roughnessMap: roughFine,
    envMapIntensity: 0.7,
  })

  const copper = new THREE.MeshStandardMaterial({
    color: 0xa2542b,
    metalness: 0.94,
    roughness: 0.44,
    roughnessMap: rough,
    envMapIntensity: 1.2,
  })

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffd9ab,
    metalness: 0,
    roughness: 0.06,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.8,
  })

  const ember = new THREE.MeshStandardMaterial({
    color: 0x2b1105,
    emissive: new THREE.Color(0xff7a2a),
    emissiveIntensity: 2.4,
    metalness: 0.4,
    roughness: 0.5,
  })

  const glassRib = new THREE.MeshStandardMaterial({
    color: 0xb9863f,
    metalness: 0.9,
    roughness: 0.42,
    transparent: true,
    opacity: 0.5,
    envMapIntensity: 1.1,
  })

  return { rough, roughFine, brass, brassAged, brassDark, steel, steelDark, copper, glass, ember, glassRib }
}
