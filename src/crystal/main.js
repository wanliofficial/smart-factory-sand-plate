import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/* ============================================================
   晶体共振矩阵 · Crystal Resonance Matrix
   极简主义克莱因蓝科技风 / MeshPhysicalMaterial 玻璃质感
   交互：鼠标 3D 位移向量驱动光影重算 + 点击激发水波纹共振
   ============================================================ */

const KLEIN = 0x002fa7
const KLEIN_LIT = 0x2b5cff
const NEON = 0x35f0ff

const RIPPLE_DURATION = 2.0 // 波纹完整周期：扩散 → 收拢复原（秒）
const RIPPLE_SPEED = 7.4 // 波前扩散速度（单位/秒）
const RIPPLE_SIGMA = 0.95 // 波包宽度
const MAX_RIPPLES = 3

const RING_LAYERS = [
  { count: 58, radius: 3.52, y: 0.0, spread: 0.58, size: [0.26, 0.52], tilt: 0.12 },
  { count: 42, radius: 2.62, y: 0.58, spread: 0.44, size: [0.2, 0.4], tilt: -0.24 },
  { count: 34, radius: 4.28, y: -0.52, spread: 0.66, size: [0.22, 0.46], tilt: 0.32 },
]

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt))
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3)

/** 波纹包络：p ∈ [0,1]，p→1 时严格归零，保证 2 秒内平滑收拢复原 */
export function rippleEnvelope(p) {
  if (p <= 0) return 1
  if (p >= 1) return 0
  return Math.exp(-2.3 * p) * Math.pow(1 - p, 1.35)
}

/** 波前半径：随时间线性向外推进 */
export function rippleFront(t) {
  return t * RIPPLE_SPEED
}

/** 生成晶体方块簇：三层同心轨道 + 随机卫星碎晶 */
export function buildCrystalCells(layers = RING_LAYERS) {
  const cells = []
  for (const layer of layers) {
    for (let i = 0; i < layer.count; i++) {
      const a = (i / layer.count) * Math.PI * 2 + Math.random() * 0.06
      const r = layer.radius + (Math.random() - 0.5) * layer.spread
      const base = new THREE.Vector3(
        Math.cos(a) * r,
        layer.y + (Math.random() - 0.5) * 0.5,
        Math.sin(a) * r + (Math.random() - 0.5) * layer.spread * 0.7,
      )
      const w = layer.size[0] + Math.random() * (layer.size[1] - layer.size[0])
      const h = layer.size[0] + Math.random() * (layer.size[1] - layer.size[0])
      const d = layer.size[0] + Math.random() * (layer.size[1] - layer.size[0])
      const quat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          Math.random() * Math.PI + layer.tilt,
          Math.random() * Math.PI,
          Math.random() * Math.PI * 0.5,
        ),
      )
      cells.push({
        base,
        dir: new THREE.Vector3(base.x, 0, base.z).normalize(),
        scale: new THREE.Vector3(w, h * (0.7 + Math.random() * 0.9), d),
        quat,
        axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        spin: (Math.random() - 0.5) * 0.55,
        bobSpeed: 0.35 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
      })

      // 卫星碎晶：让方块彼此"簇拥"
      if (Math.random() < 0.55) {
        const sat = base
          .clone()
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * 0.62,
              (Math.random() - 0.5) * 0.52,
              (Math.random() - 0.5) * 0.62,
            ),
          )
        cells.push({
          base: sat,
          dir: new THREE.Vector3(sat.x, 0, sat.z).normalize(),
          scale: new THREE.Vector3(w * 0.42, h * 0.42, d * 0.42),
          quat: new THREE.Quaternion().setFromEuler(
            new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
          ),
          axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
          spin: (Math.random() - 0.5) * 0.9,
          bobSpeed: 0.5 + Math.random() * 0.6,
          phase: Math.random() * Math.PI * 2,
        })
      }
    }
  }
  return cells
}

const _dummy = new THREE.Object3D()
const _q = new THREE.Quaternion()

/**
 * 逐帧写入实例矩阵：基础漂浮 → 叠加各条波纹的径向推挤 / 起伏 / 缩放 / 自旋
 * ripples: [{ local: Vector3, t: number, env: number, front: number }]
 */
export function updateCrystalMatrices(crystals, cells, ripples, elapsed, resonance) {
  const pulse = 1 + resonance * 0.05
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    const bob = Math.sin(elapsed * c.bobSpeed + c.phase)
    let px = c.base.x + Math.cos(elapsed * c.bobSpeed * 0.8 + c.phase) * 0.055
    let py = c.base.y + bob * 0.075
    let pz = c.base.z + Math.sin(elapsed * c.bobSpeed * 0.7 + c.phase * 1.3) * 0.055
    let sx = c.scale.x * pulse
    let sy = c.scale.y * pulse
    let sz = c.scale.z * pulse
    let extraSpin = resonance * 0.6

    for (let j = 0; j < ripples.length; j++) {
      const r = ripples[j]
      const dx = px - r.local.x
      const dy = py - r.local.y
      const dz = pz - r.local.z
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d < 1e-4) continue
      const k = d - r.front
      const g = Math.exp(-(k * k) / (2 * RIPPLE_SIGMA * RIPPLE_SIGMA))
      if (g < 0.004) continue
      const a = g * r.env
      // 近场抑制：波源处位移随距离线性收敛，避免点击瞬间爆开
      const near = Math.min(d, 1.0) / 1.0
      const push = (a * 0.95 * near) / d
      px += dx * push
      py += dy * push
      pz += dz * push
      py += Math.sin(d * 3.1 - r.t * 8.4) * a * 0.3 // 水面式起伏
      const s = 1 + a * 0.5
      sx *= s
      sy *= s
      sz *= s
      extraSpin += a * 2.6
    }

    _dummy.position.set(px, py, pz)
    _dummy.scale.set(sx, sy, sz)
    _q.setFromAxisAngle(c.axis, c.spin * elapsed + extraSpin)
    _dummy.quaternion.copy(c.quat).multiply(_q)
    _dummy.updateMatrix()
    crystals.setMatrixAt(i, _dummy.matrix)
  }
  crystals.instanceMatrix.needsUpdate = true
}

/* ---------- 背景：暗夜蓝渐变穹顶 ---------- */
function createBackdrop() {
  const geo = new THREE.SphereGeometry(70, 48, 32)
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uDeep: { value: new THREE.Color(0x01030a) },
      uMid: { value: new THREE.Color(0x06183a) },
      uKlein: { value: new THREE.Color(KLEIN).multiplyScalar(0.55) },
      uPulse: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uDeep;
      uniform vec3 uMid;
      uniform vec3 uKlein;
      uniform float uPulse;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uDeep, uMid, pow(h, 0.85));

        // 中心区域的克莱因蓝辉光（朝向 -Z 的视锥中心）
        float d = distance(vDir, vec3(0.0, 0.06, -1.0));
        float glow = exp(-d * d * 2.6);
        col += uKlein * glow * (0.55 + uPulse * 0.9);

        // 地平线冷光带
        col += vec3(0.02, 0.08, 0.20) * exp(-abs(vDir.y) * 7.0) * 0.7;

        // 抖动，消除渐变色带
        col += (hash(gl_FragCoord.xy) - 0.5) * 0.012;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  return mesh
}

/* ---------- 环境：程序化 PMREM（玻璃折射/反射的来源） ---------- */
function createEnvironment(renderer) {
  const envScene = new THREE.Scene()
  const unit = new THREE.BoxGeometry(1, 1, 1)

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(34, 34, 34),
    new THREE.MeshBasicMaterial({ color: 0x02091a, side: THREE.BackSide }),
  )
  envScene.add(shell)

  const panel = (color, pos, scale) => {
    const m = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }))
    m.position.set(pos[0], pos[1], pos[2])
    m.scale.set(scale[0], scale[1], scale[2])
    envScene.add(m)
    return m
  }

  panel(0xa8d4ff, [0, 10.5, 0], [20, 0.2, 20]) // 顶部柔光板
  panel(0xffffff, [0, 7.2, -7.5], [12, 0.3, 0.25]) // 后方长灯条
  panel(KLEIN_LIT, [-9.5, 1.2, 1.5], [0.3, 11, 14]) // 左墙：克莱因蓝
  panel(NEON, [9.5, -0.6, 1.0], [0.3, 9, 11]) // 右墙：霓虹青
  panel(0x081f4d, [0, -10, 0], [22, 0.2, 22]) // 地面
  panel(0xffffff, [-4.2, 4.6, 7.0], [0.22, 6.5, 0.22]) // 斜向高光条 A
  panel(0x9beaff, [4.8, -3.4, 7.0], [0.18, 5.0, 0.18]) // 斜向高光条 B
  panel(0x4f8bff, [0, -1.0, 9.5], [7, 3.5, 0.2]) // 正面补光

  const pmrem = new THREE.PMREMGenerator(renderer)
  const rt = pmrem.fromScene(envScene, 0.035, 0.1, 120)
  pmrem.dispose()

  envScene.traverse((o) => {
    if (o.isMesh && o.geometry !== unit) o.geometry.dispose()
    if (o.isMesh) o.material.dispose()
  })

  return rt.texture
}

/* ---------- 星尘粒子贴图 ---------- */
function createSpriteTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.28, 'rgba(170,232,255,0.62)')
  g.addColorStop(1, 'rgba(90,180,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createCrystalResonance({ canvas, onStats, onReady }) {
  /* ---------------- 渲染器 ---------------- */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08
  renderer.outputColorSpace = THREE.SRGBColorSpace
  if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = 0.6

  const scene = new THREE.Scene()
  const envMap = createEnvironment(renderer)
  scene.environment = envMap

  const backdrop = createBackdrop()
  scene.add(backdrop)

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200)
  camera.position.set(0, 0, 9.2)

  /* ---------------- 灯光：随鼠标位移向量实时重算 ---------------- */
  scene.add(new THREE.HemisphereLight(0x2a55ff, 0x010409, 0.5))

  const keyLight = new THREE.DirectionalLight(0xe6f4ff, 3.1)
  keyLight.position.set(2.5, 4.0, 6.5)
  scene.add(keyLight)

  const rimNeon = new THREE.PointLight(NEON, 55, 34, 2)
  rimNeon.position.set(-4, 2, -3.5)
  scene.add(rimNeon)

  const rimKlein = new THREE.PointLight(KLEIN_LIT, 42, 34, 2)
  rimKlein.position.set(3.4, -2.6, 3.8)
  scene.add(rimKlein)

  const coreLight = new THREE.PointLight(0x74a4ff, 16, 14, 2)
  scene.add(coreLight)

  /* ---------------- 层级 ---------------- */
  const tiltGroup = new THREE.Group() // 鼠标 3D 坐标驱动的倾斜
  const spinGroup = new THREE.Group() // 持续缓慢自转 + 波纹震荡
  tiltGroup.add(spinGroup)
  scene.add(tiltGroup)

  /* ---------------- 晶体材质 ---------------- */
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xbcd9ff),
    metalness: 0,
    roughness: 0.045,
    transmission: 1,
    thickness: 1.45,
    ior: 1.72,
    attenuationColor: new THREE.Color(0x0b39c9),
    attenuationDistance: 2.4,
    clearcoat: 1,
    clearcoatRoughness: 0.055,
    iridescence: 0.45,
    iridescenceIOR: 1.5,
    iridescenceThicknessRange: [120, 520],
    specularIntensity: 1,
    envMapIntensity: 1.4,
    transparent: true,
    side: THREE.FrontSide,
  })

  /* ---------------- 晶体方块簇：环形排布 ---------------- */
  const cells = buildCrystalCells()
  const crystalGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.085)
  const crystals = new THREE.InstancedMesh(crystalGeo, glassMaterial, cells.length)
  crystals.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  crystals.frustumCulled = false
  spinGroup.add(crystals)

  /* ---------------- 中心能量核 ---------------- */
  const coreGroup = new THREE.Group()
  spinGroup.add(coreGroup)

  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.075, 24, 180), glassMaterial)
  coreGroup.add(coreRing)

  const coreHalo = new THREE.Mesh(
    new THREE.TorusGeometry(1.18, 0.2, 16, 180),
    new THREE.MeshBasicMaterial({
      color: NEON,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  coreGroup.add(coreHalo)

  const coreGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), glassMaterial)
  coreGroup.add(coreGem)

  const coreSpark = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 24, 24),
    new THREE.MeshBasicMaterial({
      color: 0xbde9ff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  coreGroup.add(coreSpark)

  /* ---------------- 星尘 ---------------- */
  const DUST_COUNT = 1400
  const dustPos = new Float32Array(DUST_COUNT * 3)
  for (let i = 0; i < DUST_COUNT; i++) {
    const r = 7 + Math.random() * 13
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    dustPos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    dustPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.65
    dustPos[i * 3 + 2] = r * Math.cos(phi)
  }
  const dustGeo = new THREE.BufferGeometry()
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  const sprite = createSpriteTexture()
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      size: 0.085,
      map: sprite,
      color: 0x8fd4ff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }),
  )
  scene.add(dust)

  /* ---------------- 后处理：霓虹高光泛光 ---------------- */
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.62,
    0.62,
    0.68,
  )
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  /* ---------------- 指针状态 ---------------- */
  const ndc = new THREE.Vector2()
  const raycaster = new THREE.Raycaster()
  const zPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  const hitWorld = new THREE.Vector3(0, 0, 0)
  const hitPrev = new THREE.Vector3(0, 0, 0)
  const hitSmooth = new THREE.Vector3(0, 0, 0)
  const pointerVel = new THREE.Vector3()
  let resonance = 0
  let pointerActive = false

  const ripples = []
  let waveEnergy = 0

  /* ---------------- 交互事件 ---------------- */
  const isUI = (el) => el instanceof Element && !!el.closest('a, button, input, .cr-nav, .cr-panel')

  const updateNdc = (clientX, clientY) => {
    camera.updateMatrixWorld()
    ndc.x = (clientX / window.innerWidth) * 2 - 1
    ndc.y = -(clientY / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(ndc, camera)
    raycaster.ray.intersectPlane(zPlane, hitWorld)
  }

  const onPointerMove = (e) => {
    if (!pointerActive) {
      pointerActive = true
      hitPrev.copy(hitWorld)
    }
    updateNdc(e.clientX, e.clientY)
  }

  let press = null
  const onPointerDown = (e) => {
    if (isUI(e.target)) return
    press = { x: e.clientX, y: e.clientY, t: performance.now() }
  }
  const onPointerUp = (e) => {
    if (!press || isUI(e.target)) {
      press = null
      return
    }
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y)
    const held = performance.now() - press.t
    press = null
    if (moved > 8 || held > 700) return // 拖拽 / 长按不触发
    triggerRipple(e.clientX, e.clientY)
  }

  function triggerRipple(clientX, clientY) {
    updateNdc(clientX, clientY)
    const origin = hitWorld.clone()
    if (ripples.length >= MAX_RIPPLES) ripples.shift()
    ripples.push({ origin, local: new THREE.Vector3(), t: 0, env: 1, front: 0 })
  }

  let pixelRatioCap = 2
  const onResize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap))
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    bloom.setSize(w, h)
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('resize', onResize)
  updateNdc(window.innerWidth / 2, window.innerHeight / 2)

  /* ---------------- 主循环 ---------------- */
  let raf = 0
  const clock = new THREE.Clock()
  let elapsed = 0
  let intro = 0
  let fpsAcc = 0
  let fpsFrames = 0
  let statTimer = 0
  let ready = false
  let lowStreak = 0
  let degraded = false

  const stats = { fps: 0, resonance: 0, ripples: 0, cells: cells.length }

  function frame() {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(clock.getDelta(), 0.05)
    elapsed += dt
    intro = Math.min(1, intro + dt / 1.6)
    const introEase = easeOutCubic(intro)

    /* --- 指针位移向量：速度决定共振强度 --- */
    pointerVel.copy(hitWorld).sub(hitPrev)
    hitPrev.copy(hitWorld)
    const speed = dt > 0 ? pointerVel.length() / dt : 0
    const targetResonance = clamp(speed / 5.5, 0, 1)
    resonance = damp(resonance, targetResonance, targetResonance > resonance ? 9 : 2.2, dt)

    /* --- 平滑后的鼠标 3D 空间坐标 --- */
    hitSmooth.x = damp(hitSmooth.x, hitWorld.x, 4.5, dt)
    hitSmooth.y = damp(hitSmooth.y, hitWorld.y, 4.5, dt)
    const nx = clamp(hitSmooth.x / 4.6, -1, 1)
    const ny = clamp(hitSmooth.y / 3.0, -1, 1)

    /* --- 环体倾斜与视差摆动 --- */
    tiltGroup.rotation.x = damp(tiltGroup.rotation.x, -ny * 0.3, 5, dt)
    tiltGroup.rotation.y = damp(tiltGroup.rotation.y, nx * 0.44, 5, dt)
    tiltGroup.rotation.z = damp(tiltGroup.rotation.z, nx * ny * 0.1, 4, dt)
    spinGroup.rotation.y += dt * (0.075 + resonance * 0.35)
    spinGroup.rotation.x = Math.sin(elapsed * 0.24) * 0.05

    /* --- 相机视差 --- */
    const camZ = 9.2 + (1 - introEase) * 6.5
    camera.position.x = damp(camera.position.x, nx * 0.85, 3.4, dt)
    camera.position.y = damp(camera.position.y, ny * 0.6, 3.4, dt)
    camera.position.z = damp(camera.position.z, camZ, 3.4, dt)
    camera.lookAt(0, 0, 0)

    /* --- 灯光跟随指针位移：触发实时光影重算 --- */
    keyLight.position.set(hitSmooth.x * 1.15 + 2.0, hitSmooth.y * 1.15 + 3.4, 6.8)
    rimNeon.position.set(-hitSmooth.x * 1.25 - 3.6, -hitSmooth.y * 1.05 + 1.8, -3.4)
    rimKlein.position.set(hitSmooth.x * 0.7 + 3.2, -hitSmooth.y * 0.85 - 2.4, 4.0)

    /* --- 波纹推进 --- */
    tiltGroup.updateMatrixWorld(true) // 保证 worldToLocal 用当前朝向换算波源
    waveEnergy = 0
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i]
      r.t += dt
      const p = r.t / RIPPLE_DURATION
      if (p >= 1) {
        ripples.splice(i, 1) // 2 秒后完全复原并移除
        continue
      }
      r.env = rippleEnvelope(p)
      r.front = rippleFront(r.t)
      waveEnergy += r.env
      // 世界坐标 → 旋转中的局部坐标，保证波源与点击位置始终对齐
      r.local.copy(r.origin)
      spinGroup.worldToLocal(r.local)
    }

    /* --- 实例矩阵 --- */
    updateCrystalMatrices(crystals, cells, ripples, elapsed, resonance)

    /* --- 中心能量核 --- */
    coreGroup.rotation.y -= dt * 0.22
    coreGroup.rotation.z = Math.sin(elapsed * 0.3) * 0.12
    coreGem.rotation.x += dt * 0.35
    coreGem.rotation.y += dt * 0.28
    coreGem.scale.setScalar(1 + waveEnergy * 0.22 + resonance * 0.08)
    coreSpark.scale.setScalar(0.9 + waveEnergy * 0.9 + resonance * 0.25)
    coreHalo.material.opacity = 0.12 + waveEnergy * 0.3 + resonance * 0.1
    coreRing.rotation.z += dt * 0.1

    /* --- 光强与泛光随共振呼吸 --- */
    keyLight.intensity = 3.0 + resonance * 1.9 + waveEnergy * 0.8
    rimNeon.intensity = 52 + resonance * 55 + waveEnergy * 45
    rimKlein.intensity = 40 + resonance * 40 + waveEnergy * 35
    coreLight.intensity = 14 + waveEnergy * 52 + resonance * 14
    bloom.strength = 0.52 + resonance * 0.42 + waveEnergy * 0.34
    renderer.toneMappingExposure = 1.05 + resonance * 0.12 + waveEnergy * 0.1
    backdrop.material.uniforms.uPulse.value = waveEnergy * 0.8 + resonance * 0.25

    /* --- 星尘：反向视差 --- */
    dust.rotation.y += dt * 0.012
    dust.position.x = -nx * 0.55
    dust.position.y = -ny * 0.4

    /* --- 入场 --- */
    tiltGroup.scale.setScalar(0.62 + 0.38 * introEase)

    composer.render()

    /* --- 统计 --- */
    fpsAcc += dt
    fpsFrames++
    statTimer += dt
    if (statTimer > 0.35) {
      stats.fps = Math.round(fpsFrames / fpsAcc)
      stats.resonance = resonance
      stats.ripples = ripples.length
      fpsAcc = 0
      fpsFrames = 0
      statTimer = 0
      onStats?.(stats)

      // 自适应降级：持续低帧则关闭泛光并降采样，只执行一次
      if (!degraded && elapsed > 4) {
        lowStreak = stats.fps < 34 ? lowStreak + 1 : 0
        if (lowStreak >= 3) {
          degraded = true
          bloom.enabled = false
          pixelRatioCap = 1
          onResize()
        }
      }
    }

    if (!ready && intro > 0.35) {
      ready = true
      onReady?.()
    }
  }

  frame()

  /* ---------------- 清理 ---------------- */
  function dispose() {
    cancelAnimationFrame(raf)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('resize', onResize)
    crystalGeo.dispose()
    glassMaterial.dispose()
    coreRing.geometry.dispose()
    coreHalo.geometry.dispose()
    coreHalo.material.dispose()
    coreGem.geometry.dispose()
    coreSpark.geometry.dispose()
    coreSpark.material.dispose()
    backdrop.geometry.dispose()
    backdrop.material.dispose()
    dustGeo.dispose()
    dust.material.dispose()
    sprite.dispose()
    envMap.dispose()
    composer.dispose()
    renderer.dispose()
  }

  return { dispose, triggerRipple, stats }
}
