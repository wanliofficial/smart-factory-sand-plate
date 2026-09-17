import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { C, CLOTH } from './palette.js'
import * as B from './builders.js'

/* ================================================================== *
 * 园区总平面规格（单位：米级沙盘单位）
 *   z+ 为厂前区（大门 / 广场 / 停车场），z- 为厂区纵深
 *   4 列 × 2 排 共 8 栋建筑，路网把园区分成左右两侧
 * ================================================================== */
export const SPEC = {
  W: 36.6,
  D: 20.4,
  X0: -18.3,
  X1: 18.3,
  Z0: -6.8,
  Z1: 13.6,
  BASE_W: 38.8,
  BASE_D: 22.6,
  COL_X: [-13.1, -4.7, 4.7, 13.1],
  ROW_Z: [5.95, -3.15],
  SHOP_W: 5.6,
  SHOP_D: 3.3,
  /** 纵向道路（南北向）：左右两侧环路 + 车间之间的分隔道路 + 中央主干道 */
  ROAD_V: [
    { c: -17.3, w: 2.0, z0: -6.8, z1: 11.0 },
    { c: -8.9, w: 2.0, z0: -6.8, z1: 11.0 },
    { c: 0.0, w: 3.0, z0: -6.8, z1: 13.6 },
    { c: 8.9, w: 2.0, z0: -6.8, z1: 11.0 },
    { c: 17.3, w: 2.0, z0: -6.8, z1: 11.0 }
  ],
  /** 横向道路（东西向） */
  ROAD_H: [
    { c: -5.8, w: 2.0, name: '背侧道路' },
    { c: 1.4, w: 3.0, name: '中央横向主路' },
    { c: 9.8, w: 2.4, name: '厂前道路' }
  ]
}

/* ------------------------------------------------------------------ *
 * 8 栋建筑：7 个车间 + 1 栋写字楼
 * ------------------------------------------------------------------ */
const BUILDINGS = [
  {
    id: 'stamp',
    name: '压膜车间',
    en: 'STAMPING',
    col: 0,
    row: 0,
    accent: C.blue,
    teeth: 5,
    doors: 3,
    stacks: 2,
    desc: '车身覆盖件冲压成型：开卷落料、多工位压机连线与模具存放'
  },
  {
    id: 'weld',
    name: '焊接车间',
    en: 'BODY SHOP',
    col: 1,
    row: 0,
    accent: C.red,
    teeth: 5,
    doors: 3,
    desc: '白车身总成点焊 / 激光焊，机器人焊装线与在线视觉检测'
  },
  {
    id: 'paint',
    name: '喷漆车间',
    en: 'PAINT SHOP',
    col: 2,
    row: 0,
    accent: C.teal,
    teeth: 6,
    doors: 2,
    stacks: 3,
    desc: '前处理、电泳、面漆与烘干工艺，恒温恒湿洁净车间'
  },
  {
    id: 'office',
    name: '办公楼',
    en: 'OFFICE / HQ',
    col: 3,
    row: 0,
    kind: 'office',
    accent: C.blueDeep,
    desc: '行政办公、研发设计与生产调度中枢，员工通勤集散点'
  },
  {
    id: 'material',
    name: '物料车间',
    en: 'MATERIAL',
    col: 0,
    row: 1,
    accent: C.steelDeep,
    teeth: 4,
    doors: 3,
    desc: '零部件集配、线边仓储与厂内物流配送中心'
  },
  {
    id: 'seat',
    name: '座椅车间',
    en: 'SEAT SHOP',
    col: 1,
    row: 1,
    accent: C.blueDeep,
    teeth: 4,
    doors: 2,
    desc: '座椅骨架装配、发泡与总成检测，按序直供总装线'
  },
  {
    id: 'engine',
    name: '发动机车间',
    en: 'ENGINE SHOP',
    col: 2,
    row: 1,
    accent: C.redDeep,
    teeth: 4,
    doors: 2,
    desc: '动力总成装配、冷试与出厂性能检测'
  },
  {
    id: 'assembly',
    name: '组装车间',
    en: 'ASSEMBLY',
    col: 3,
    row: 1,
    accent: C.yellow,
    teeth: 6,
    doors: 4,
    desc: '整车总装线：内饰装配、底盘合装、动力总成合装与下线检测'
  }
]

/* ================================================================== *
 * 程序化贴图
 * ================================================================== */
function makeCanvas(size = 256) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

function makeTileTexture({ size = 512, cells = 8, base = '#c9d0d8', gap = '#b9c0ca', jitter = 10 } = {}) {
  const cv = makeCanvas(size)
  const g = cv.getContext('2d')
  g.fillStyle = gap
  g.fillRect(0, 0, size, size)
  const cs = size / cells
  let seed = 20260916
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const rgb = base.replace('#', '').match(/.{2}/g).map((h) => parseInt(h, 16))
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const d = Math.floor((rnd() - 0.5) * jitter)
      const col = rgb.map((v) => Math.max(0, Math.min(255, v + d)))
      g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`
      g.fillRect(i * cs + 1.5, j * cs + 1.5, cs - 3, cs - 3)
    }
  }
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** 真实感沥青路面：底色斑驳 + 粗细骨料 + 裂缝 + 车辙磨损 + 边线 / 中心虚线 */
function makeRoadTexture(axis = 'z') {
  const S = 512
  const cv = makeCanvas(S)
  const g = cv.getContext('2d')
  // 基底：深灰沥青
  g.fillStyle = '#484d54'
  g.fillRect(0, 0, S, S)
  let seed = 4242
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  // 大块色差（新旧补丁、养护痕迹）
  for (let i = 0; i < 26; i++) {
    const v = 56 + Math.floor(rnd() * 32)
    g.fillStyle = `rgba(${v},${v + 3},${v + 7},${0.14 + rnd() * 0.2})`
    const w = 40 + rnd() * 130
    g.save()
    g.translate(rnd() * S, rnd() * S)
    g.rotate(rnd() * Math.PI)
    g.fillRect(-w / 2, -w / 4, w, w / 2)
    g.restore()
  }
  // 粗骨料亮点
  for (let i = 0; i < 900; i++) {
    const v = 110 + Math.floor(rnd() * 90)
    g.fillStyle = `rgba(${v},${v + 4},${v + 8},${0.3 + rnd() * 0.4})`
    g.fillRect(rnd() * S, rnd() * S, 1.6, 1.6)
  }
  // 细颗粒
  for (let i = 0; i < 5200; i++) {
    const v = 50 + Math.floor(rnd() * 80)
    g.fillStyle = `rgba(${v},${v + 4},${v + 8},${0.22 + rnd() * 0.45})`
    g.fillRect(rnd() * S, rnd() * S, 1.2, 1.2)
  }
  // 裂缝
  g.strokeStyle = 'rgba(26,28,32,0.55)'
  g.lineWidth = 1.1
  for (let i = 0; i < 7; i++) {
    g.beginPath()
    let x = rnd() * S
    let y = rnd() * S
    g.moveTo(x, y)
    for (let k = 0; k < 5; k++) {
      x += (rnd() - 0.5) * 60
      y += (rnd() - 0.5) * 60
      g.lineTo(x, y)
    }
    g.stroke()
  }
  // 车辙磨损暗带（沿道路方向两条）
  g.fillStyle = 'rgba(22,24,28,0.16)'
  if (axis === 'z') {
    g.fillRect(S * 0.22, 0, S * 0.17, S)
    g.fillRect(S * 0.61, 0, S * 0.17, S)
  } else {
    g.fillRect(0, S * 0.22, S, S * 0.17)
    g.fillRect(0, S * 0.61, S, S * 0.17)
  }
  // 边线（实线）+ 中心线（虚线）
  g.fillStyle = 'rgba(233,236,240,0.9)'
  if (axis === 'z') {
    g.fillRect(8, 0, 5, S)
    g.fillRect(S - 13, 0, 5, S)
    for (let y = 0; y < S; y += 86) g.fillRect(S / 2 - 2.5, y + 10, 5, 48)
  } else {
    g.fillRect(0, 8, S, 5)
    g.fillRect(0, S - 13, S, 5)
    for (let x = 0; x < S; x += 86) g.fillRect(x + 10, S / 2 - 2.5, 48, 5)
  }
  const map = new THREE.CanvasTexture(cv)
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8

  // 凹凸贴图（纯颗粒，不带标线，让沥青有起伏感）
  const B = 256
  const bc = makeCanvas(B)
  const bg = bc.getContext('2d')
  bg.fillStyle = '#808080'
  bg.fillRect(0, 0, B, B)
  for (let i = 0; i < 3200; i++) {
    const v = 96 + Math.floor(rnd() * 88)
    bg.fillStyle = `rgb(${v},${v},${v})`
    bg.fillRect(rnd() * B, rnd() * B, 1.5, 1.5)
  }
  const bump = new THREE.CanvasTexture(bc)
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping
  bump.anisotropy = 8

  return { map, bump }
}

/** 斑马线（barAxis 为条纹长边方向），底色与新沥青一致 */
function makeZebraTexture(barAxis = 'z') {
  const S = 128
  const cv = makeCanvas(S)
  const g = cv.getContext('2d')
  g.fillStyle = '#484d54'
  g.fillRect(0, 0, S, S)
  g.fillStyle = '#f2f5f8'
  if (barAxis === 'z') g.fillRect(0, 0, S * 0.52, S)
  else g.fillRect(0, 0, S, S * 0.52)
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** 停车位划线 */
function makeLotTexture() {
  const S = 128
  const cv = makeCanvas(S)
  const g = cv.getContext('2d')
  g.fillStyle = '#c8ced6'
  g.fillRect(0, 0, S, S)
  g.fillStyle = '#f2f5f8'
  g.fillRect(0, 0, 3, S)
  g.fillRect(0, 0, S, 3)
  g.fillRect(0, S - 3, S, 3)
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** 地面工艺流向箭头 */
function makeArrowTexture() {
  const W = 128
  const H = 64
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')
  g.clearRect(0, 0, W, H)
  g.fillStyle = 'rgba(243,195,24,0.92)'
  g.beginPath()
  g.moveTo(12, 22)
  g.lineTo(74, 22)
  g.lineTo(74, 6)
  g.lineTo(118, 32)
  g.lineTo(74, 58)
  g.lineTo(74, 42)
  g.lineTo(12, 42)
  g.closePath()
  g.fill()
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/* ================================================================== *
 * 路径工具：环形往返（直行 + 端部掉头）
 * ================================================================== */
function loopZ(xOut, xBack, zTop, zBot, segs = 10) {
  const pts = []
  const r = (xOut - xBack) / 2
  const cx = (xOut + xBack) / 2
  pts.push(new THREE.Vector3(xOut, 0, zTop))
  pts.push(new THREE.Vector3(xOut, 0, zBot))
  for (let i = 1; i < segs; i++) {
    const a = Math.PI * (i / segs)
    pts.push(new THREE.Vector3(cx + r * Math.cos(a), 0, zBot - r * Math.sin(a)))
  }
  pts.push(new THREE.Vector3(xBack, 0, zBot))
  pts.push(new THREE.Vector3(xBack, 0, zTop))
  for (let i = 1; i < segs; i++) {
    const a = Math.PI * (i / segs)
    pts.push(new THREE.Vector3(cx - r * Math.cos(a), 0, zTop + r * Math.sin(a)))
  }
  return pts
}

function loopX(xLeft, xRight, zOut, zBack, segs = 10) {
  const pts = []
  const r = (zOut - zBack) / 2
  const cz = (zOut + zBack) / 2
  pts.push(new THREE.Vector3(xLeft, 0, zOut))
  pts.push(new THREE.Vector3(xRight, 0, zOut))
  for (let i = 1; i < segs; i++) {
    const a = Math.PI * (i / segs)
    pts.push(new THREE.Vector3(xRight + r * Math.sin(a), 0, cz + r * Math.cos(a)))
  }
  pts.push(new THREE.Vector3(xRight, 0, zBack))
  pts.push(new THREE.Vector3(xLeft, 0, zBack))
  for (let i = 1; i < segs; i++) {
    const a = Math.PI * (i / segs)
    pts.push(new THREE.Vector3(xLeft - r * Math.sin(a), 0, cz - r * Math.cos(a)))
  }
  return pts
}

function compilePath(list) {
  const pts = list.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], 0, p[1])))
  const cum = [0]
  let total = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    total += Math.hypot(b.x - a.x, b.z - a.z)
    cum.push(total)
  }
  return { pts, cum, total }
}

function samplePath(p, s) {
  const len = p.total
  s = ((s % len) + len) % len
  let i = 0
  while (i < p.pts.length - 1 && p.cum[i + 1] <= s) i++
  const a = p.pts[i]
  const b = p.pts[(i + 1) % p.pts.length]
  const segLen = p.cum[i + 1] - p.cum[i] || 1e-6
  const k = (s - p.cum[i]) / segLen
  return {
    x: a.x + (b.x - a.x) * k,
    z: a.z + (b.z - a.z) * k,
    dx: (b.x - a.x) / segLen,
    dz: (b.z - a.z) / segLen
  }
}

/* ================================================================== *
 * 主入口
 * ================================================================== */
export function createSandbox(container) {
  const animators = []
  const clock = new THREE.Clock()
  let onZoneChange = null
  let onAutoRotateChange = null

  /* ---------------- 渲染器 ---------------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.touchAction = 'none'
  container.appendChild(renderer.domElement)

  const labelRenderer = new CSS2DRenderer()
  Object.assign(labelRenderer.domElement.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    pointerEvents: 'none'
  })
  container.appendChild(labelRenderer.domElement)

  /* ---------------- 场景 ---------------- */
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xdde6f0)
  scene.fog = new THREE.Fog(0xdde6f0, 62, 148)

  const pmrem = new THREE.PMREMGenerator(renderer)
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.06)
  scene.environment = envRT.texture
  scene.environmentIntensity = 0.4
  pmrem.dispose()

  /* ---------------- 相机 ---------------- */
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500)
  const VIEWS = {
    hero: { pos: [4.5, 27.0, 32.5], target: [0, 0.9, 3.0] },
    top: { pos: [0.01, 44, 3.6], target: [0, 0.2, 3.4] },
    side: { pos: [0.6, 7.6, 33.0], target: [0, 1.6, 2.0] },
    close: { pos: [18.0, 7.6, 17.6], target: [13.1, 1.6, 5.0] }
  }
  const qs = new URLSearchParams(typeof location !== 'undefined' ? location.search : '')
  const preset = VIEWS[qs.get('view')] || VIEWS.hero
  const num = (s, fallback) => {
    if (!s) return fallback
    const v = s.split(',').map(Number)
    return v.length === 3 && v.every((n) => Number.isFinite(n)) ? v : fallback
  }
  const HOME = { pos: num(qs.get('cam'), preset.pos), target: num(qs.get('target'), preset.target) }
  camera.position.set(...HOME.pos)
  camera.lookAt(...HOME.target)

  /* ---------------- 控制器：缩放 + 拖拽 ---------------- */
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(...HOME.target)
  controls.enableDamping = true
  controls.dampingFactor = 0.075
  controls.rotateSpeed = 0.6
  controls.zoomSpeed = 0.95
  controls.panSpeed = 0.9
  controls.screenSpacePanning = false
  controls.minDistance = 6
  controls.maxDistance = 96
  controls.minPolarAngle = 0.1
  controls.maxPolarAngle = Math.PI * 0.487
  controls.autoRotateSpeed = 0.45
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
  controls.update()

  /* ---------------- 灯光 ---------------- */
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8d96a3, 0.44))
  scene.add(new THREE.AmbientLight(0xffffff, 0.06))

  const sun = new THREE.DirectionalLight(0xfff4e4, 1.75)
  sun.position.set(30, 40, 26)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { near: 6, far: 140, left: -27, right: 27, top: 23, bottom: -23 })
  sun.shadow.camera.updateProjectionMatrix()
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.02
  scene.add(sun)

  const fill = new THREE.DirectionalLight(0xbfd6ff, 0.28)
  fill.position.set(-28, 18, -22)
  scene.add(fill)

  const rim = new THREE.DirectionalLight(0xffffff, 0.14)
  rim.position.set(-10, 12, 34)
  scene.add(rim)

  /* ================================================================ *
   * 造型
   * ================================================================ */
  const root = new THREE.Group()
  scene.add(root)

  /* ---------------- 展台底座 + 地坪（中心对齐园区 z ∈ [-6.8, 13.6]，即 z = 3.4） ---------------- */
  const GROUND_CZ = (SPEC.Z0 + SPEC.Z1) / 2
  const plinthLo = B.box(SPEC.BASE_W, 0.22, SPEC.BASE_D, C.baseSide, { roughness: 0.6 })
  plinthLo.position.set(0, -0.44, GROUND_CZ)
  plinthLo.castShadow = false
  root.add(plinthLo)

  const plinthHi = B.box(SPEC.BASE_W - 0.7, 0.22, SPEC.BASE_D - 0.7, C.base, { roughness: 0.55 })
  plinthHi.position.set(0, -0.22, GROUND_CZ)
  plinthHi.castShadow = false
  root.add(plinthHi)

  const tileTex = makeTileTexture({ base: '#c9d0d8', gap: '#b8c0c9', cells: 8, jitter: 9 })
  tileTex.repeat.set(18, 10)
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(SPEC.W, 0.12, SPEC.D),
    new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.85, metalness: 0.03 })
  )
  floor.position.set(0, -0.06, GROUND_CZ)
  floor.receiveShadow = true
  root.add(floor)

  /* ---------------- 路网 ---------------- */
  const texRoadV = makeRoadTexture('z')
  const texRoadH = makeRoadTexture('x')

  const roadMat = (src, rx, ry) => {
    const t = src.map.clone()
    t.needsUpdate = true
    t.repeat.set(rx, ry)
    const bp = src.bump.clone()
    bp.needsUpdate = true
    bp.repeat.set(rx, ry)
    return new THREE.MeshStandardMaterial({ map: t, bumpMap: bp, bumpScale: 0.03, roughness: 0.95, metalness: 0.02 })
  }

  // 纵向道路
  SPEC.ROAD_V.forEach((r, i) => {
    const len = r.z1 - r.z0
    const zc = (r.z0 + r.z1) / 2
    const mat = roadMat(texRoadV, 1, Math.round(len / 2.6))
    const m = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.04, len), mat)
    m.position.set(r.c, 0.02, zc)
    m.receiveShadow = true
    m.castShadow = false
    m.userData.roadAxis = 'z'
    root.add(m)
  })
  // 横向道路（略高 2mm，避免与纵向道路共面闪烁）
  SPEC.ROAD_H.forEach((r) => {
    const mat = roadMat(texRoadH, Math.round(SPEC.W / 2.6), 1)
    const m = new THREE.Mesh(new THREE.BoxGeometry(SPEC.W, 0.04, r.w), mat)
    m.position.set(0, 0.035, r.c)
    m.receiveShadow = true
    m.castShadow = false
    root.add(m)
  })

  /* ---------------- 场地铺装 ---------------- */
  const pave = (w, d, x, z, h, color, o = {}) => {
    const m = B.box(w, h, d, color, { roughness: 0.94, ...o })
    m.position.set(x, h / 2, z)
    m.castShadow = false
    m.receiveShadow = true
    root.add(m)
    return m
  }

  // 车间前后的硬质作业面（卸货 / 停放）
  pave(SPEC.W, 1.4, 0, 3.6, 0.026, C.hardstand)
  pave(SPEC.W, 1.4, 0, -0.8, 0.026, C.hardstand)

  // 车间两侧人行道（左右两侧顺着道路走）
  SPEC.COL_X.forEach((cx) => {
    const x0 = cx - SPEC.SHOP_W / 2
    const x1 = cx + SPEC.SHOP_W / 2
    pave(0.4, 12.4, x0 - 0.2, 1.4, 0.06, C.sidewalk)
    pave(0.4, 12.4, x1 + 0.2, 1.4, 0.06, C.sidewalk)
  })

  // 厂前人行道（写字楼门前）
  pave(SPEC.W, 1.0, 0, 8.1, 0.06, C.sidewalk)
  // 厂前区铺装
  pave(SPEC.W, 2.6, 0, 12.3, 0.05, C.sidewalk)

  /* ---------------- 斑马线 ---------------- */
  const texZebraZ = makeZebraTexture('z')
  const texZebraX = makeZebraTexture('x')
  const zebra = (w, d, x, z, axis) => {
    const t = (axis === 'z' ? texZebraZ : texZebraX).clone()
    t.needsUpdate = true
    t.repeat.set(axis === 'z' ? Math.max(1, Math.round(w / 0.55)) : 1, axis === 'z' ? 1 : Math.max(1, Math.round(d / 0.55)))
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, transparent: true })
    )
    m.rotation.x = -Math.PI / 2
    m.position.set(x, 0.063, z)
    m.receiveShadow = true
    root.add(m)
  }
  zebra(1.7, 2.4, 13.1, 9.8, 'z') // 厂前道路 · 写字楼门前
  zebra(3.0, 1.5, 0, 11.9, 'x') // 中央主干道 · 大门
  zebra(1.2, 3.0, 10.2, 1.4, 'x') // 中央横向主路 · 东侧
  zebra(2.0, 0.8, 8.9, 8.1, 'z') // 纵向道路 · 厂前

  /* ---------------- 地面工艺流向箭头 ---------------- */
  const arrowTex = makeArrowTexture()
  const arrowMat = new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, depthWrite: false })
  const arrowGeo = new THREE.PlaneGeometry(0.78, 0.38)
  ;[
    [-12.6, 3.6],
    [-7.0, 3.6],
    [-2.6, 3.6],
    [2.6, 3.6],
    [6.6, 3.6],
    [-12.6, -0.8],
    [-7.0, -0.8],
    [-2.6, -0.8],
    [2.6, -0.8],
    [6.6, -0.8]
  ].forEach(([x, z]) => {
    const a = new THREE.Mesh(arrowGeo, arrowMat)
    a.rotation.x = -Math.PI / 2
    a.position.set(x, 0.034, z)
    a.castShadow = false
    root.add(a)
  })

  /* ---------------- 停车位划线 ---------------- */
  const texLot = makeLotTexture()
  const lotW = 11.6
  const lotD = 2.1
  const lotTex = texLot.clone()
  lotTex.needsUpdate = true
  lotTex.repeat.set(9, 1)
  const lot = new THREE.Mesh(
    new THREE.BoxGeometry(lotW, 0.04, lotD),
    new THREE.MeshStandardMaterial({ map: lotTex, roughness: 0.9 })
  )
  lot.position.set(10.8, 0.07, 12.35)
  lot.receiveShadow = true
  root.add(lot)

  /* ================================================================ *
   * 分区注册（点击聚焦）
   * ================================================================ */
  const zones = []
  const pickables = []
  const zone = (name, desc, focusPos, focusTarget, buildingId) => {
    zones.push({ name, desc, focusPos, focusTarget, buildingId })
    return zones.length - 1
  }
  const paint = (group, zi) => {
    group.traverse((o) => {
      if (o.isMesh) o.userData.zoneIndex = zi
    })
    pickables.push(group)
    return group
  }
  const cameraFor = (b) => {
    const x = SPEC.COL_X[b.col]
    const z = SPEC.ROW_Z[b.row]
    if (b.kind === 'office') return { pos: [x + 3.4, 6.8, z + 9.6], target: [x, 1.8, z] }
    const back = b.row === 1
    // 从车间大门一侧的高处俯视，掀顶后正好看到内部产线
    return { pos: [x + 3.4, 6.2, z + (back ? 6.2 : -6.2)], target: [x, 0.2, z] }
  }

  /* ================================================================ *
   * 八栋建筑
   * ================================================================ */
  const labels = []
  const buildingGroups = {}

  BUILDINGS.forEach((b) => {
    const x = SPEC.COL_X[b.col]
    const z = SPEC.ROW_Z[b.row]
    const doorSide = b.row === 0 ? -1 : 1 // 车间大门朝向中央横向主路
    const cam = cameraFor(b)
    const zi = zone(b.name, b.desc, cam.pos, cam.target, b.id)

    const g = new THREE.Group()
    let roof = null
    if (b.kind === 'office') {
      const tower = B.officeTower({ w: SPEC.SHOP_W, d: SPEC.SHOP_D, floors: 6, fh: 0.46, accent: b.accent, name: '万物联动' })
      g.add(tower)
    } else {
      const shop = B.workshop({
        w: SPEC.SHOP_W,
        d: SPEC.SHOP_D,
        h: 1.25,
        teeth: b.teeth,
        toothH: 0.34,
        accent: b.accent,
        doorCount: b.doors,
        doorSide,
        penthouse: true,
        pentSide: b.col % 2 === 0 ? 1 : -1,
        stacks: b.stacks ?? 0,
        vents: 2
      })
      g.add(shop)
      roof = shop.userData.roof || null
      // 车间内部产线：机械臂加工 + AGV 出入库（聚焦时掀顶可见）
      const interior = B.workshopInterior({
        w: SPEC.SHOP_W,
        d: SPEC.SHOP_D,
        doorSide,
        weld: b.id === 'weld',
        seed: b.col + b.row * 4 + 1
      })
      g.add(interior)
      animators.push((t, dt) => interior.userData.animate(t, dt))
      // 卸货月台
      const dock = B.loadingDock({ w: 3.6, count: Math.min(2, b.doors - 1), color: C.dockDoor, accent: b.accent })
      dock.position.set(0.9, 0.02, (doorSide * SPEC.SHOP_D) / 2 + 0.02)
      if (doorSide < 0) dock.rotation.y = Math.PI
      g.add(dock)
    }
    g.position.set(x, 0, z)
    root.add(paint(g, zi))
    buildingGroups[b.id] = { group: g, roof }

    // 空间标注
    const el = document.createElement('div')
    el.className = 'zone-label'
    el.innerHTML = `<span class="zone-label__dot"></span><span class="zone-label__text">${b.name}<i>${b.en}</i></span>`
    el.style.pointerEvents = 'auto'
    el.style.cursor = 'pointer'
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      focusZone(zi)
    })
    const obj = new CSS2DObject(el)
    // 背排标签抬高，避免与前一排标签在投影上重叠
    obj.position.set(x, b.kind === 'office' ? 4.75 : b.row === 1 ? 3.15 : 2.55, z)
    root.add(obj)
    labels.push({ el, zi })
  })

  /* ================================================================ *
   * 厂区配套：景观 / 设备 / 堆放
   * ================================================================ */
  const decor = new THREE.Group()
  root.add(decor)

  const put = (obj, x, z, ry = 0, y = 0.02, s = 1) => {
    obj.position.set(x, y, z)
    obj.rotation.y = ry
    if (s !== 1) obj.scale.setScalar(s)
    decor.add(obj)
    return obj
  }

  // —— 压膜车间：钢卷堆场 + 管廊（管廊让出横向主路，贴硬质作业面内侧）
  put(B.coilStack(6), -14.5, 3.3, 0.04)
  put(B.coilStack(5), -12.2, 3.35, -0.06)
  put(B.pipeRack({ len: 3.4, h: 1.0, pipes: 3 }), -13.1, 3.7, 0, 0.02)

  // —— 焊接车间：管廊 + 货架 + 箱区
  put(B.pipeRack({ len: 3.6, h: 1.05, pipes: 3 }), -4.7, 3.7, 0, 0.02)
  put(B.storageRack({ w: 1.7, d: 0.6, h: 1.25, levels: 3 }), -6.3, 3.6, 0, 0.02)
  put(B.crateStack({ rows: 2, cols: 3 }), -3.0, 3.6, 0, 0.02)

  // —— 喷漆车间：储罐 + 管廊
  put(B.tankSet(2, 0.26, 0.78), 3.0, 3.3, 0, 0.02)
  put(B.pipeRack({ len: 3.0, h: 1.0, pipes: 3 }), 5.6, 3.7, 0, 0.02)

  // —— 物料车间：货架 + 箱区 + 货车
  put(B.storageRack({ w: 1.8, d: 0.6, h: 1.3, levels: 3 }), -15.0, -0.75, 0, 0.02)
  put(B.crateStack({ rows: 3, cols: 3 }), -12.6, -0.8, 0, 0.02)
  ;[-14.4, -12.1].forEach((tx) => {
    const tr = B.car({ kind: 'truck', color: C.carBlue })
    put(tr, tx, -1.05, Math.PI, 0.02)
  })

  // —— 座椅车间：箱区
  put(B.crateStack({ rows: 3, cols: 2 }), -5.4, -0.8, 0, 0.02)
  put(B.storageRack({ w: 1.6, d: 0.6, h: 1.25, levels: 3 }), -3.2, -0.8, 0, 0.02)
  put(B.car({ kind: 'truck', color: C.carWhite }), -6.9, -1.05, Math.PI, 0.02)

  // —— 发动机车间：储罐 + 管廊 + 箱区
  put(B.tankSet(3, 0.22, 0.66), 3.4, -0.8, 0, 0.02)
  put(B.crateStack({ rows: 2, cols: 3 }), 6.2, -0.8, 0, 0.02)

  // —— 组装车间门前：总装线（车体沿输送线移动）
  const conv = new THREE.Group()
  const convBed = B.box(4.4, 0.1, 0.52, C.steelDeep, { roughness: 0.6, metalness: 0.35 })
  convBed.position.y = 0.3
  conv.add(convBed)
  for (let i = -1; i <= 1; i++) {
    for (const s of [1, -1]) {
      const leg = B.cyl(0.035, 0.035, 0.3, C.steel, 8, { roughness: 0.5, metalness: 0.4 })
      leg.position.set(i * 1.8, 0.15, s * 0.2)
      leg.castShadow = false
      conv.add(leg)
    }
  }
  const rail = B.box(4.4, 0.05, 0.05, C.yellow, { roughness: 0.5 })
  rail.position.set(0, 0.37, 0.24)
  conv.add(rail)
  const rail2 = rail.clone()
  rail2.position.z = -0.24
  conv.add(rail2)
  const bodies = []
  for (let i = 0; i < 4; i++) {
    const unit = new THREE.Group()
    const shell = B.box(0.86, 0.12, 0.42, i % 2 ? C.carWhite : C.carSilver, { roughness: 0.45, metalness: 0.3 })
    unit.add(shell)
    const cab = B.box(0.42, 0.14, 0.38, C.glassDark, { roughness: 0.2, metalness: 0.5 })
    cab.position.set(-0.04, 0.13, 0)
    unit.add(cab)
    unit.position.y = 0.36
    conv.add(unit)
    bodies.push(unit)
  }
  animators.push((t) => {
    const L = 4.4
    bodies.forEach((bd, i) => {
      const s = (t * 0.34 + i * (L / bodies.length)) % L
      bd.position.x = -L / 2 + s
    })
  })
  conv.position.set(13.4, 0.02, -0.78)
  decor.add(conv)

  // 下线整车停放
  ;[0, 1, 2].forEach((i) => {
    const c = B.car({ color: i === 1 ? C.carRed : C.carWhite })
    put(c, 10.9 + i * 1.35, -0.8, Math.PI / 2, 0.02)
  })

  /* ---------------- 厂前区：大门 / 广场 / 停车场 ---------------- */
  // 草坪 + 绿篱（前区西侧）
  const lawn1 = B.lawn(5.4, 2.2)
  put(lawn1, -15.2, 12.35, 0, 0)
  put(B.hedge(5.0, 0.36, 0.26), -15.2, 11.4, 0, 0.12)
  put(B.hedge(5.0, 0.36, 0.26), -15.2, 13.3, 0, 0.12)

  // 广场铺装
  const plazaTex = makeTileTexture({ base: '#d6dbe2', gap: '#c2c9d1', cells: 6, jitter: 8 })
  plazaTex.repeat.set(5, 2)
  const plaza = new THREE.Mesh(
    new THREE.BoxGeometry(7.6, 0.04, 2.4),
    new THREE.MeshStandardMaterial({ map: plazaTex, roughness: 0.85 })
  )
  plaza.position.set(-8.6, 0.07, 12.3)
  plaza.receiveShadow = true
  root.add(plaza)

  // 旗杆
  ;[-9.6, -8.9, -8.2].forEach((fx, i) => {
    const fp = B.flagPole(1.7, i === 1 ? C.red : C.blue)
    put(fp, fx, 12.3, 0, 0.09)
    if (fp.userData.flag) {
      const fl = fp.userData.flag
      animators.push((t) => {
        fl.rotation.y = Math.sin(t * 1.6 + i) * 0.24
      })
    }
  })

  // 大门门楼（「万里科技园」名牌）+ 门卫室
  put(B.gateArch({ span: 6.4, h: 2.2, accent: C.blue, name: '万里科技园' }), 0, 12.95, 0, 0.09)
  const boothL = B.gateBooth({ accent: C.blue, side: -1 })
  put(boothL, -4.6, 12.95, 0, 0.09)
  const boothR = B.gateBooth({ accent: C.blue, side: 1 })
  put(boothR, 4.6, 12.95, 0, 0.09)
  ;[boothL, boothR].forEach((bt) => {
    const arm = bt.userData.barrier
    const base = arm.rotation.z
    animators.push((t) => {
      arm.rotation.z = base + Math.sin(t * 0.6) * 0.25
    })
  })

  // 停车场内的静态停放车辆
  ;[0, 1, 2, 4].forEach((i) => {
    const c = B.car({ color: [C.carWhite, C.carSilver, C.carBlue, C.carDark][i % 4] })
    put(c, 6.6 + i * 1.25, 12.35, -Math.PI / 2, 0.09)
  })

  /* ---------------- 绿化 ---------------- */
  const treeSpots = [
    [-15.6, 12.0, 'green', 1.0],
    [-14.4, 12.7, 'pink', 0.9],
    [-12.9, 11.9, 'green', 0.95],
    [-16.4, 12.9, 'green', 0.85],
    [-20, 0, 'green', 0] // 占位，稍后过滤
  ]
  treeSpots.filter((t) => t[3] > 0).forEach(([x, z, kind, s]) => {
    put(B.tree({ h: 1.0, kind }), x, z, 0, 0.09, s)
  })

  ;[
    [-2.6, 12.9, 'green', 0.85],
    [-5.0, 13.1, 'pink', 0.8],
    [17.6, 12.9, 'green', 0.9],
    [-17.6, 8.2, 'green', 0.85],
    [17.6, -4.6, 'green', 0.8],
    [-17.6, -4.6, 'green', 0.8],
    [17.6, 8.2, 'pink', 0.85]
  ].forEach(([x, z, kind, s]) => {
    put(B.tree({ h: 1.0, kind }), x, z, 0, 0.05, s)
  })

  // 厂区围墙：金属镂空栅栏，正面对应中央主干道留出大门开口
  const fenceSeg = (len, x, z, axis) => {
    const f = B.metalFence({ len, h: 0.55, axis })
    f.position.set(x, 0.02, z)
    root.add(f)
  }
  fenceSeg(16.4, -10.1, SPEC.Z1 - 0.12, 'x')
  fenceSeg(16.4, 10.1, SPEC.Z1 - 0.12, 'x')
  fenceSeg(SPEC.W, 0, SPEC.Z0 + 0.12, 'x')
  fenceSeg(20.3, SPEC.X0 + 0.12, 3.4, 'z')
  fenceSeg(20.3, SPEC.X1 - 0.12, 3.4, 'z')

  // 厂前区绿化带（大门两侧）
  ;[
    [-13.4, 11.5],
    [-17.9, 11.5],
    [-3.3, 11.5],
    [-1.9, 11.5],
    [1.9, 11.5],
    [3.3, 11.5],
    [16.9, 11.5],
    [18.0, 11.5]
  ].forEach(([x, z], i) => {
    put(B.tree({ h: 1.0, kind: i % 2 ? 'green' : 'pink' }), x, z, 0, 0.05, 0.82)
  })

  // 车轮挡块（硬质作业面内，避开所有车道）
  ;[
    [-12.6, 3.9],
    [-2.6, 3.9],
    [6.6, 3.9],
    [-7.0, -0.4],
    [2.6, -0.4],
    [11.9, -0.4]
  ].forEach(([x, z]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.3), B.std(C.kerb, { roughness: 0.95 }))
    m.position.set(x, 0.07, z)
    m.castShadow = false
    root.add(m)
  })

  /* ---------------- 路灯（全部设在人行道 / 硬质作业面，绝不占车道） ---------------- */
  const lampSpots = [
    [-4.0, 8.35],
    [4.4, 8.35],
    [6.6, 8.35],
    [15.8, 8.35],
    [-13.2, 11.35],
    [-3.2, 11.35],
    [5.2, 11.35],
    [16.4, 11.35],
    [-11.0, 3.3],
    [2.2, 3.3],
    [11.0, 3.3],
    [-11.0, -0.8],
    [11.0, -0.8],
    [15.6, -0.8],
    [-15.6, -0.8]
  ]
  lampSpots.forEach(([x, z], i) => {
    const lp = B.lightPole({ h: 1.45, arm: 0.26 })
    put(lp, x, z, z > 8 ? Math.PI : 0, 0.07)
    animators.push((t) => {
      lp.userData.bulb.material.emissiveIntensity = 1.3 + Math.sin(t * 1.8 + i * 1.3) * 0.5
    })
  })

  /* ================================================================ *
   * 车流：3 台车在各条道路上往返行驶
   * ================================================================ */
  const trafficGroup = new THREE.Group()
  root.add(trafficGroup)

  const TRAFFIC = [
    { color: C.carWhite, speed: 2.35, start: 4, path: compilePath(loopZ(0.75, -0.75, 10.6, -5.6)) },
    { color: C.carBlue, speed: 2.05, start: 22, path: compilePath(loopX(-16.8, 16.8, 2.2, 0.6)) },
    { color: C.carRed, speed: 1.75, start: 12, path: compilePath(loopZ(9.4, 8.4, 5.2, -5.6)) }
  ]

  const cars = TRAFFIC.map((cfg) => {
    const car = B.car({ color: cfg.color })
    car.position.y = 0.055
    trafficGroup.add(car)
    return { obj: car, cfg, s: cfg.start, heading: 0 }
  })

  animators.push((t, dt) => {
    if (!trafficGroup.visible) return
    cars.forEach((c) => {
      c.s += c.cfg.speed * dt
      const p = samplePath(c.cfg.path, c.s)
      c.obj.position.x = p.x
      c.obj.position.z = p.z
      const target = Math.atan2(-p.dz, p.dx)
      let d = target - c.heading
      d = Math.atan2(Math.sin(d), Math.cos(d))
      c.heading += d * Math.min(1, dt * 7)
      c.obj.rotation.y = c.heading
      const w = c.obj.userData.wheels
      if (w) for (let i = 0; i < w.length; i++) w[i].rotation.z -= dt * c.cfg.speed * 9
    })
  })

  /* ================================================================ *
   * 人流：员工不断从办公楼进出
   * ================================================================ */
  const peopleGroup = new THREE.Group()
  root.add(peopleGroup)

  // 出入口：写字楼主入口 z = 7.6（+z 面），次入口 z = 4.3（-z 面）
  const ROUTES = [
    {
      // A · 办公楼门口 ⇄ 停车场（穿过厂前道路斑马线）
      count: 3,
      speed: 0.34,
      pts: [
        [12.70, 6.9],
        [12.70, 8.2],
        [12.70, 11.6],
        [12.70, 12.9],
        [13.45, 12.9],
        [13.45, 11.6],
        [13.45, 8.2],
        [13.45, 6.9]
      ]
    },
    {
      // B · 办公楼门口 ⇄ 大门广场
      count: 3,
      speed: 0.32,
      pts: [
        [12.70, 6.9],
        [12.70, 8.2],
        [12.70, 11.75],
        [10.0, 11.75],
        [2.4, 11.75],
        [-3.2, 11.75],
        [-3.2, 12.7],
        [-7.2, 12.7],
        [-7.2, 12.25],
        [-3.2, 12.25],
        [2.4, 12.25],
        [10.0, 12.25],
        [13.45, 12.25],
        [13.45, 11.6],
        [13.45, 8.2],
        [13.45, 6.9]
      ]
    },
    {
      // C · 办公楼 ⇄ 组装车间（沿纵向道路人行道，过中央横向主路斑马线）
      count: 2,
      speed: 0.33,
      pts: [
        [12.55, 6.9],
        [12.55, 8.15],
        [10.05, 8.15],
        [10.05, 4.0],
        [10.05, -0.5],
        [10.05, -1.15],
        [10.32, -1.15],
        [10.32, -0.5],
        [10.32, 4.0],
        [10.32, 8.15],
        [12.95, 8.15],
        [12.95, 6.9]
      ]
    },
    {
      // D · 中央主干道人行道通勤
      count: 2,
      speed: 0.3,
      pts: [
        [1.72, 8.15],
        [1.72, 3.1],
        [1.90, 3.1],
        [1.90, 8.15]
      ]
    },
    {
      // E · 背排车间之间的人行通勤
      count: 2,
      speed: 0.31,
      pts: [
        [-6.6, -0.85],
        [-2.0, -0.85],
        [-2.0, -0.5],
        [-6.6, -0.5]
      ]
    }
  ]

  let pIdx = 0
  const walkers = []
  ROUTES.forEach((r, ri) => {
    const path = compilePath(r.pts)
    for (let i = 0; i < r.count; i++) {
      const p = B.person({
        shirt: CLOTH.shirt[pIdx % CLOTH.shirt.length],
        pants: CLOTH.pants[pIdx % CLOTH.pants.length],
        bag: pIdx % 3 === 0,
        scale: 0.94 + (pIdx % 4) * 0.035
      })
      p.position.y = 0.085
      peopleGroup.add(p)
      walkers.push({ obj: p, path, s: (path.total / r.count) * i + ri * 0.7, speed: r.speed * (0.92 + (pIdx % 5) * 0.035) })
      pIdx++
    }
  })

  animators.push((t, dt) => {
    if (!peopleGroup.visible) return
    walkers.forEach((w) => {
      w.s += w.speed * dt
      const p = samplePath(w.path, w.s)
      const o = w.obj
      o.position.x = p.x
      o.position.z = p.z
      const target = Math.atan2(-p.dz, p.dx)
      let d = target - o.rotation.y
      d = Math.atan2(Math.sin(d), Math.cos(d))
      o.rotation.y += d * Math.min(1, dt * 5)
      const phase = w.s * 18
      const sw = Math.sin(phase)
      const ud = o.userData
      if (ud.legL) {
        ud.legL.rotation.z = sw * 0.52
        ud.legR.rotation.z = -sw * 0.52
        ud.armL.rotation.z = -sw * 0.42
        ud.armR.rotation.z = sw * 0.42
        o.position.y = 0.085 + Math.abs(Math.sin(phase)) * 0.012
      }
    })
  })

  /* ================================================================ *
   * 镜头飞行 / 聚焦
   * ================================================================ */
  const flight = {
    active: false,
    t: 0,
    dur: 1.1,
    p0: new THREE.Vector3(),
    p1: new THREE.Vector3(),
    t0: new THREE.Vector3(),
    t1: new THREE.Vector3()
  }

  function flyTo(pos, target, dur = 1.1) {
    flight.p0.copy(camera.position)
    flight.p1.set(pos[0], pos[1], pos[2])
    flight.t0.copy(controls.target)
    flight.t1.set(target[0], target[1], target[2])
    flight.t = 0
    flight.dur = dur
    flight.active = true
  }

  // 聚焦车间时掀开屋顶看内部产线，退出聚焦 / 切换视角时还原
  let openedRoof = null
  function restoreRoof() {
    if (openedRoof) {
      openedRoof.visible = true
      openedRoof = null
    }
  }

  function focusZone(zi) {
    const z = zones[zi]
    if (!z) return
    controls.autoRotate = false
    if (typeof onAutoRotateChange === 'function') onAutoRotateChange(false)
    restoreRoof()
    const rec = z.buildingId && buildingGroups[z.buildingId]
    if (rec && rec.roof) {
      rec.roof.visible = false
      openedRoof = rec.roof
    }
    flyTo(z.focusPos, z.focusTarget)
    if (typeof onZoneChange === 'function') onZoneChange(zi)
  }

  /* ---------------- 拾取交互 ---------------- */
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const el = renderer.domElement
  let downPos = { x: 0, y: 0 }
  let downTime = 0
  let hovered = null

  const pickAt = (clientX, clientY) => {
    const rect = el.getBoundingClientRect()
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(pickables, true)
    if (!hits.length) return null
    let o = hits[0].object
    while (o && o.userData.zoneIndex === undefined) o = o.parent
    return o || null
  }

  const onPointerDown = (e) => {
    downPos = { x: e.clientX, y: e.clientY }
    downTime = performance.now()
  }

  const onPointerUp = (e) => {
    if (e.button !== 0) return
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y)
    if (moved > 6 || performance.now() - downTime > 500) return
    const hit = pickAt(e.clientX, e.clientY)
    if (hit) focusZone(hit.userData.zoneIndex)
  }

  const onPointerMove = (e) => {
    const hit = pickAt(e.clientX, e.clientY)
    if (hit !== hovered) {
      hovered = hit
      el.style.cursor = hit ? 'pointer' : 'grab'
      const zi = hit ? hit.userData.zoneIndex : null
      labels.forEach((l) => l.el.classList.toggle('is-active', zi !== null && l.zi === zi))
    }
  }

  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointerup', onPointerUp)
  el.addEventListener('pointermove', onPointerMove)
  el.style.cursor = 'grab'

  /* ================================================================ *
   * 自适应 + 渲染循环
   * ================================================================ */
  function resize() {
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    labelRenderer.setSize(w, h)
  }
  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(container)

  const BOUND = { x: 20, z: 15, yMin: 0, yMax: 5 }

  let rafId = 0
  function tick() {
    rafId = requestAnimationFrame(tick)
    const dt = Math.min(clock.getDelta(), 0.05)
    const t = clock.elapsedTime

    if (flight.active) {
      flight.t += dt / flight.dur
      const k = Math.min(1, flight.t)
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
      camera.position.lerpVectors(flight.p0, flight.p1, e)
      controls.target.lerpVectors(flight.t0, flight.t1, e)
      if (k >= 1) flight.active = false
    }

    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -BOUND.x, BOUND.x)
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -BOUND.z, BOUND.z)
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, BOUND.yMin, BOUND.yMax)

    for (let i = 0; i < animators.length; i++) animators[i](t, dt)

    controls.update()
    renderer.render(scene, camera)
    labelRenderer.render(scene, camera)
  }
  tick()

  /* ================================================================ *
   * 对外 API
   * ================================================================ */
  return {
    zones,
    focusZone,
    onZoneChange(fn) {
      onZoneChange = fn
    },
    onAutoRotateChange(fn) {
      onAutoRotateChange = fn
    },
    resetView() {
      controls.autoRotate = false
      if (onAutoRotateChange) onAutoRotateChange(false)
      restoreRoof()
      flyTo(HOME.pos, HOME.target, 0.9)
      if (onZoneChange) onZoneChange(-1)
    },
    topView() {
      controls.autoRotate = false
      if (onAutoRotateChange) onAutoRotateChange(false)
      restoreRoof()
      flyTo(VIEWS.top.pos, VIEWS.top.target, 1.2)
    },
    sideView() {
      controls.autoRotate = false
      if (onAutoRotateChange) onAutoRotateChange(false)
      restoreRoof()
      flyTo(VIEWS.side.pos, VIEWS.side.target, 1.2)
    },
    setAutoRotate(v) {
      controls.autoRotate = !!v
    },
    setLabelsVisible(v) {
      labels.forEach((l) => (l.el.style.display = v ? '' : 'none'))
    },
    setTrafficVisible(v) {
      trafficGroup.visible = !!v
    },
    setPeopleVisible(v) {
      peopleGroup.visible = !!v
    },
    dispose() {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointermove', onPointerMove)
      controls.dispose()
      B.disposeObject(scene)
      envRT.dispose()
      renderer.dispose()
      el.parentNode && el.parentNode.removeChild(el)
      const ld = labelRenderer.domElement
      ld.parentNode && ld.parentNode.removeChild(ld)
    }
  }
}
