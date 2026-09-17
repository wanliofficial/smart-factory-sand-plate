import * as THREE from 'three'
import { C, CLOTH } from './palette.js'

/* ================================================================== *
 * 材质 / 几何 缓存
 * ================================================================== */
const matCache = new Map()
const geoCache = new Map()

export function std(color, o = {}) {
  const key = [
    color,
    o.roughness ?? 0.78,
    o.metalness ?? 0.05,
    o.opacity ?? 1,
    o.emissive ?? 0,
    o.emissiveIntensity ?? 1,
    o.side ?? 0,
    o.transparent ? 1 : 0,
    o.flatShading ? 1 : 0
  ].join('|')
  if (matCache.has(key)) return matCache.get(key)
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: o.roughness ?? 0.78,
    metalness: o.metalness ?? 0.05,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    side: o.side ?? THREE.FrontSide,
    flatShading: !!o.flatShading
  })
  matCache.set(key, m)
  return m
}

function geo(key, factory) {
  if (!geoCache.has(key)) geoCache.set(key, factory())
  return geoCache.get(key)
}

function shade(mesh, o) {
  mesh.castShadow = o.castShadow !== false
  mesh.receiveShadow = o.receiveShadow !== false
  return mesh
}

/* ================================================================== *
 * 基础形体
 * ================================================================== */
export function box(w, h, d, color, o = {}) {
  const g = geo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d))
  return shade(new THREE.Mesh(g, std(color, o)), o)
}

export function cyl(rt, rb, h, color, seg = 18, o = {}) {
  const g = geo(`c${rt}_${rb}_${h}_${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg))
  return shade(new THREE.Mesh(g, std(color, o)), o)
}

export function sph(r, color, o = {}) {
  const w = o.widthSeg ?? 18
  const ht = o.heightSeg ?? 14
  const g = geo(`s${r}_${w}_${ht}`, () => new THREE.SphereGeometry(r, w, ht))
  return shade(new THREE.Mesh(g, std(color, o)), o)
}

export function cap(r, len, color, o = {}) {
  const g = geo(`k${r}_${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 14))
  return shade(new THREE.Mesh(g, std(color, o)), o)
}

export function tubeX(len, r, color, o = {}) {
  const m = cyl(r, r, len, color, 16, o)
  m.rotation.z = Math.PI / 2
  return m
}

export function tubeZ(len, r, color, o = {}) {
  const m = cyl(r, r, len, color, 16, o)
  m.rotation.x = Math.PI / 2
  return m
}

/** 车轮：轴向沿 Z，可直接绕 z 自转 */
export function wheel(r = 0.075, w = 0.06, color = C.tire) {
  const g = geo(`wh${r}_${w}`, () => {
    const gg = new THREE.CylinderGeometry(r, r, w, 14)
    gg.rotateX(Math.PI / 2)
    return gg
  })
  const m = new THREE.Mesh(g, std(color, { roughness: 0.85 }))
  m.castShadow = true
  return m
}

/* ================================================================== *
 * 厂房建筑
 * ================================================================== */

/** 锯齿形采光屋面（经典汽车厂房屋面） */
export function sawtoothRoof(w, d, th, color, teeth = 5, o = {}) {
  const shape = new THREE.Shape()
  const tw = w / teeth
  shape.moveTo(-w / 2, 0)
  for (let i = 0; i < teeth; i++) {
    const x0 = -w / 2 + i * tw
    shape.lineTo(x0 + tw, th)
    shape.lineTo(x0 + tw, 0)
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false })
  g.translate(0, 0, -d / 2)
  const m = new THREE.Mesh(g, std(color, { roughness: 0.84, ...o }))
  return shade(m, o)
}

/**
 * 汽车工厂车间：白墙 + 彩色腰线 + 锯齿采光屋面 + 卷帘卸货门 + 屋顶设备
 */
export function workshop(opts = {}) {
  const {
    w = 5.6,
    d = 3.3,
    h = 1.25,
    teeth = 5,
    toothH = 0.34,
    wall = C.wallWhite,
    roofC = C.roof,
    trim = C.wallGray,
    accent = C.blue,
    doorCount = 3,
    doorSide = 1, // +1 → 面向 +z，-1 → 面向 -z
    penthouse = true,
    pentSide = 1, // 屋顶控制室所在的 ±x 端
    stacks = 0,
    vents = 2
  } = opts

  const g = new THREE.Group()
  const winMat = std(C.glassPane, {
    roughness: 0.2,
    metalness: 0.5,
    emissive: 0x0d2436,
    emissiveIntensity: 1
  })

  // 主体
  const body = box(w, h, d, wall, { roughness: 0.88 })
  body.position.y = h / 2
  g.add(body)

  const plinth = box(w + 0.12, 0.14, d + 0.12, C.concrete, { roughness: 0.94 })
  plinth.position.y = 0.07
  g.add(plinth)

  // 彩色腰线 + 檐口
  const band = box(w + 0.14, 0.16, d + 0.14, accent, { roughness: 0.55, metalness: 0.15 })
  band.position.y = h - 0.22
  g.add(band)

  const cornice = box(w + 0.18, 0.08, d + 0.18, trim, { roughness: 0.86 })
  cornice.position.y = h - 0.02
  g.add(cornice)

  // —— 屋顶总成（聚焦车间时整体掀开，露出内部产线）——
  const roofGroup = new THREE.Group()
  g.add(roofGroup)

  // 锯齿采光屋面
  const roof = sawtoothRoof(w + 0.22, d + 0.22, toothH, roofC, teeth)
  roof.position.y = h + 0.04
  roofGroup.add(roof)

  // 每个锯齿的竖向采光窗
  const tw = (w + 0.22) / teeth
  for (let i = 0; i < teeth; i++) {
    const pane = new THREE.Mesh(
      geo(`sk${toothH}_${d}`, () => new THREE.BoxGeometry(0.06, toothH * 0.74, d + 0.02)),
      winMat
    )
    pane.position.set(-(w + 0.22) / 2 + tw * (i + 1) - 0.05, h + toothH * 0.44, 0)
    pane.castShadow = false
    roofGroup.add(pane)
  }

  // 长向窗带（非卸货面）
  for (const sz of [1, -1]) {
    if (sz === doorSide) continue
    const strip = new THREE.Mesh(
      geo(`ws${w}_${h}`, () => new THREE.BoxGeometry(w - 0.7, h * 0.3, 0.06)),
      winMat
    )
    strip.position.set(0, h * 0.56, (sz * d) / 2 + sz * 0.03)
    strip.castShadow = false
    g.add(strip)
  }
  // 山墙窗带
  for (const sx of [1, -1]) {
    const strip = new THREE.Mesh(
      geo(`we${d}_${h}`, () => new THREE.BoxGeometry(0.06, h * 0.3, d - 0.6)),
      winMat
    )
    strip.position.set((sx * w) / 2 + sx * 0.03, h * 0.56, 0)
    strip.castShadow = false
    g.add(strip)
  }

  // 卷帘卸货门 + 雨棚
  const doorMat = std(C.dockDoor, { roughness: 0.6, metalness: 0.28 })
  const n = Math.max(1, doorCount)
  const dh = 0.8
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / (n + 1)) * (i + 1)
    const dw = Math.min(0.86, (w / (n + 1)) * 0.64)
    const zf = (doorSide * d) / 2 + doorSide * 0.04
    const door = new THREE.Mesh(geo(`dr${dw}_${dh}`, () => new THREE.BoxGeometry(dw, dh, 0.08)), doorMat)
    door.position.set(x, 0.06 + dh / 2, zf)
    g.add(door)
    const pane = new THREE.Mesh(geo(`dw${dw}`, () => new THREE.BoxGeometry(dw * 0.7, 0.1, 0.03)), winMat)
    pane.position.set(x, 0.06 + dh - 0.13, zf + doorSide * 0.04)
    pane.castShadow = false
    g.add(pane)
    const hood = box(dw + 0.34, 0.06, 0.42, accent, { roughness: 0.5, metalness: 0.2 })
    hood.position.set(x, 0.06 + dh + 0.05, (doorSide * d) / 2 + doorSide * 0.24)
    g.add(hood)
  }

  // 屋顶控制室 / 办公夹层
  if (penthouse) {
    const pw = w * 0.3
    const px = pentSide * (w / 2 - pw / 2 - 0.25)
    const ph = 0.42
    const pod = box(pw, ph, d * 0.78, wall, { roughness: 0.88 })
    pod.position.set(px, h + toothH + ph / 2 + 0.04, 0)
    roofGroup.add(pod)
    const cap2 = box(pw + 0.14, 0.08, d * 0.78 + 0.14, trim, { roughness: 0.86 })
    cap2.position.set(px, h + toothH + ph + 0.08, 0)
    roofGroup.add(cap2)
    for (const sz of [1, -1]) {
      const strip = new THREE.Mesh(
        geo(`pw${pw}_${ph}`, () => new THREE.BoxGeometry(pw * 0.7, 0.16, 0.05)),
        winMat
      )
      strip.position.set(px, h + toothH + ph * 0.55, (sz * d * 0.78) / 2 + sz * 0.03)
      strip.castShadow = false
      roofGroup.add(strip)
    }
  }

  // 屋顶通风口
  const ventGeo = geo('rv', () => new THREE.CylinderGeometry(0.08, 0.09, 0.18, 12))
  const ventMat = std(C.steel, { roughness: 0.5, metalness: 0.45 })
  for (let i = 0; i < vents; i++) {
    const v = new THREE.Mesh(ventGeo, ventMat)
    v.position.set(-w / 2 + 0.8 + (i * (w - 1.6)) / Math.max(1, vents - 1), h + toothH + 0.1, -d * 0.3)
    v.castShadow = false
    roofGroup.add(v)
  }

  // 排气管 / 烟囱（喷漆、压膜车间）
  for (let i = 0; i < stacks; i++) {
    const hh = 1.05 + i * 0.16
    const st = cyl(0.11, 0.14, hh, C.wallGray, 14, { roughness: 0.9 })
    st.position.set(-w / 2 + 1.0 + i * 1.5, h + hh / 2, d * 0.42)
    roofGroup.add(st)
    const cp = cyl(0.15, 0.13, 0.1, C.steel, 14, { roughness: 0.5, metalness: 0.4 })
    cp.position.set(st.position.x, h + hh + 0.05, d * 0.42)
    roofGroup.add(cp)
  }

  g.userData.roof = roofGroup
  return g
}

/** 程序化玻璃幕墙贴图：玻璃分格 + 明暗变化 + 顶部天光反射 */
function makeCurtainTexture() {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const g = cv.getContext('2d')
  g.fillStyle = '#23405a'
  g.fillRect(0, 0, S, S)
  let seed = 99
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const cw = S / 4
  const ch = S / 8
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 8; j++) {
      const v = Math.floor((rnd() - 0.5) * 30)
      g.fillStyle = `rgb(${38 + v},${68 + v},${96 + v})`
      g.fillRect(i * cw, j * ch, cw, ch)
      if (rnd() > 0.72) {
        g.fillStyle = 'rgba(190,222,248,0.28)'
        g.fillRect(i * cw, j * ch, cw, ch)
      }
    }
  }
  // 竖向天光渐变（上亮下暗，模拟天空反射）
  const grad = g.createLinearGradient(0, 0, 0, S)
  grad.addColorStop(0, 'rgba(210,232,250,0.30)')
  grad.addColorStop(0.55, 'rgba(210,232,250,0.04)')
  grad.addColorStop(1, 'rgba(8,18,28,0.22)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  // 龙骨分格线
  g.strokeStyle = 'rgba(168,180,192,0.95)'
  g.lineWidth = 3
  for (let i = 0; i <= 4; i++) {
    g.beginPath()
    g.moveTo(i * cw, 0)
    g.lineTo(i * cw, S)
    g.stroke()
  }
  for (let j = 0; j <= 8; j++) {
    g.beginPath()
    g.moveTo(0, j * ch)
    g.lineTo(S, j * ch)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** 文字标牌（Canvas 贴图自发光面板） */
export function textPanel(text, opts = {}) {
  const { w = 2, h = 0.5, bg = '#123a5c', fg = '#ffffff', glow = false, fontSize = 84 } = opts
  const cv = document.createElement('canvas')
  cv.width = 512
  cv.height = Math.max(64, Math.round((512 * h) / w))
  const g = cv.getContext('2d')
  if (bg) {
    g.fillStyle = bg
    g.fillRect(0, 0, cv.width, cv.height)
  }
  let fs = fontSize
  const setFont = () => {
    g.font = `600 ${fs}px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif`
  }
  setFont()
  const maxW = cv.width * 0.88
  const tw = g.measureText(text).width
  if (tw > maxW) {
    fs = Math.max(20, Math.floor((fs * maxW) / tw))
    setFont()
  }
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  if (glow) {
    g.shadowColor = fg
    g.shadowBlur = 16
  }
  g.fillStyle = fg
  g.fillText(text, cv.width / 2, cv.height / 2 + fs * 0.05)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  const mat = new THREE.MeshBasicMaterial({ map: t, transparent: !bg, toneMapped: false })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  m.castShadow = false
  return m
}

/**
 * 现代化写字楼：全玻璃幕墙塔楼（首层到顶层等截面）+ 入口雨棚 + 顶层发光标识
 */
export function officeTower(opts = {}) {
  const {
    w = 5.6,
    d = 3.3,
    floors = 6,
    fh = 0.46,
    wall = C.wallWhite,
    trim = C.wallGray,
    accent = C.blue,
    name = '万物联动'
  } = opts

  const g = new THREE.Group()
  const H = floors * fh
  const lobbyH = 0.62
  const totalH = H + lobbyH

  const curtainTex = makeCurtainTexture()
  const curtainMat = (rx, ry) => {
    const t = curtainTex.clone()
    t.needsUpdate = true
    t.repeat.set(rx, ry)
    return new THREE.MeshStandardMaterial({
      map: t,
      roughness: 0.09,
      metalness: 0.85,
      envMapIntensity: 1.6,
      emissive: 0x0a1c2b,
      emissiveIntensity: 0.55
    })
  }

  // 混凝土基座
  const plinth = box(w + 0.14, 0.14, d + 0.14, C.concrete, { roughness: 0.94 })
  plinth.position.y = 0.07
  g.add(plinth)

  // 核心筒（比幕墙略小一圈，给玻璃留出厚度）
  const core = box(w - 0.12, totalH, d - 0.12, 0x2b3947, { roughness: 0.55, metalness: 0.2 })
  core.position.y = totalH / 2 + 0.1
  g.add(core)

  // 四面落地玻璃幕墙（首层到顶层连续、等截面，反射环境光影）
  const matZ = curtainMat(Math.max(3, Math.round(w / 0.72)), floors + 2)
  for (const sz of [1, -1]) {
    const gl = new THREE.Mesh(new THREE.BoxGeometry(w, totalH, 0.05), matZ)
    gl.position.set(0, totalH / 2 + 0.1, (sz * d) / 2 + sz * 0.026)
    gl.castShadow = false
    g.add(gl)
  }
  const matX = curtainMat(Math.max(2, Math.round(d / 0.72)), floors + 2)
  for (const sx of [1, -1]) {
    const gl = new THREE.Mesh(new THREE.BoxGeometry(0.05, totalH, d), matX)
    gl.position.set((sx * w) / 2 + sx * 0.026, totalH / 2 + 0.1, 0)
    gl.castShadow = false
    g.add(gl)
  }

  // 层间金属装饰线 + 转角铝梃
  const slabGeo = geo(`ofS${w}_${d}`, () => new THREE.BoxGeometry(w + 0.07, 0.04, d + 0.07))
  const slabMat = std(0xaebac6, { roughness: 0.35, metalness: 0.65 })
  for (let f = 1; f <= floors; f++) {
    const s = new THREE.Mesh(slabGeo, slabMat)
    s.position.y = lobbyH + f * fh + 0.08
    s.castShadow = false
    g.add(s)
  }
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const mull = box(0.09, totalH + 0.06, 0.09, accent, { roughness: 0.3, metalness: 0.6 })
      mull.position.set((sx * w) / 2, totalH / 2 + 0.1, (sz * d) / 2)
      mull.castShadow = false
      g.add(mull)
    }
  }

  // 大堂入口（+z 面）：台阶 + 通高雨棚 + 玻璃门
  const step = box(2.8, 0.06, 0.7, C.concrete, { roughness: 0.9 })
  step.position.set(0, 0.03, d / 2 + 0.4)
  g.add(step)
  const canopy = box(3.0, 0.09, 1.15, 0xdfe6ec, { roughness: 0.4, metalness: 0.4 })
  canopy.position.set(0, lobbyH + 0.16, d / 2 + 0.62)
  g.add(canopy)
  const canopyEdge = box(3.1, 0.1, 0.12, accent, { roughness: 0.35, metalness: 0.5 })
  canopyEdge.position.set(0, lobbyH + 0.12, d / 2 + 1.16)
  g.add(canopyEdge)
  for (const sx of [1, -1]) {
    const col = cyl(0.045, 0.05, lobbyH + 0.12, C.steel, 10, { roughness: 0.35, metalness: 0.6 })
    col.position.set(sx * 1.3, (lobbyH + 0.12) / 2, d / 2 + 1.1)
    g.add(col)
  }
  const doorMat = std(C.glassDark, { roughness: 0.12, metalness: 0.6 })
  const door = new THREE.Mesh(geo('odM', () => new THREE.BoxGeometry(1.7, lobbyH * 0.8, 0.07)), doorMat)
  door.position.set(0, lobbyH * 0.4 + 0.08, d / 2 + 0.05)
  g.add(door)
  for (const sx of [1, -1]) {
    const jamb = box(0.1, lobbyH * 0.84, 0.12, trim, { roughness: 0.5, metalness: 0.4 })
    jamb.position.set(sx * 0.9, lobbyH * 0.42 + 0.08, d / 2 + 0.05)
    g.add(jamb)
  }

  // 次入口（-z 面，员工通道）
  const door2 = new THREE.Mesh(geo('odM2', () => new THREE.BoxGeometry(0.9, lobbyH * 0.72, 0.07)), doorMat)
  door2.position.set(0.9, lobbyH * 0.36 + 0.08, -d / 2 - 0.05)
  g.add(door2)
  const canopy2 = box(1.4, 0.07, 0.62, 0xdfe6ec, { roughness: 0.45, metalness: 0.4 })
  canopy2.position.set(0.9, lobbyH + 0.1, -d / 2 - 0.36)
  g.add(canopy2)

  // 顶部：女儿墙 + 机房 + 冷却机组 + 桅杆信标 + 发光标识
  const top = totalH + 0.1
  const par = box(w + 0.14, 0.24, d + 0.14, trim, { roughness: 0.6, metalness: 0.3 })
  par.position.y = top + 0.12
  g.add(par)

  const ph = box(w * 0.34, 0.36, d * 0.56, wall, { roughness: 0.8 })
  ph.position.set(-w * 0.22, top + 0.42, 0)
  g.add(ph)
  for (let i = 0; i < 2; i++) {
    const ct = cyl(0.11, 0.12, 0.24, C.steel, 12, { roughness: 0.45, metalness: 0.5 })
    ct.position.set(w * 0.3, top + 0.36, -d * 0.22 + i * d * 0.44)
    g.add(ct)
  }
  const mast = cyl(0.022, 0.028, 0.85, C.steelDeep, 8, { roughness: 0.45, metalness: 0.55 })
  mast.position.set(-w * 0.4, top + 0.66, -d * 0.3)
  g.add(mast)
  const beacon = cyl(0.045, 0.045, 0.08, C.red, 10, {
    emissive: C.red,
    emissiveIntensity: 1.4,
    roughness: 0.4
  })
  beacon.position.set(-w * 0.4, top + 1.09, -d * 0.3)
  g.add(beacon)

  // 顶层发光标识「万物联动」
  const sign = textPanel(name, { w: 2.7, h: 0.56, bg: '#0c2033', fg: '#7fe6ff', glow: true, fontSize: 96 })
  sign.position.set(0.35, top + 0.52, d / 2 - 0.1)
  g.add(sign)
  for (const sx of [-0.75, 1.45]) {
    const post = box(0.06, 0.34, 0.06, C.steelDeep, { roughness: 0.45, metalness: 0.5 })
    post.position.set(sx, top + 0.24, d / 2 - 0.1)
    g.add(post)
  }

  return g
}

/* ================================================================== *
 * 车辆
 * ================================================================== */

/** 轿车 / 小型通勤车，车头朝 +x */
export function car(opts = {}) {
  const { color = C.carWhite, kind = 'car' } = opts
  const g = new THREE.Group()
  const wheels = []

  if (kind === 'car') {
    const body = box(1.08, 0.17, 0.44, color, { roughness: 0.42, metalness: 0.32 })
    body.position.y = 0.185
    g.add(body)
    const skirt = box(1.1, 0.07, 0.46, C.carDark, { roughness: 0.7 })
    skirt.position.y = 0.115
    g.add(skirt)
    const cabin = box(0.6, 0.16, 0.4, C.glassDark, { roughness: 0.16, metalness: 0.55 })
    cabin.position.set(-0.07, 0.345, 0)
    g.add(cabin)
    const roof = box(0.52, 0.035, 0.4, color, { roughness: 0.42, metalness: 0.3 })
    roof.position.set(-0.07, 0.44, 0)
    g.add(roof)
    for (const sx of [1, -1]) {
      const w1 = wheel(0.072, 0.05)
      w1.position.set(0.32 * sx, 0.072, 0.212)
      g.add(w1)
      wheels.push(w1)
      const w2 = wheel(0.072, 0.05)
      w2.position.set(0.32 * sx, 0.072, -0.212)
      g.add(w2)
      wheels.push(w2)
    }
    const lightMat = std(C.headlight, { emissive: C.headlight, emissiveIntensity: 1.5, roughness: 0.3 })
    for (const sz of [1, -1]) {
      const hl = new THREE.Mesh(geo('hl', () => new THREE.BoxGeometry(0.04, 0.06, 0.1)), lightMat)
      hl.position.set(0.54, 0.2, sz * 0.13)
      hl.castShadow = false
      g.add(hl)
      const tl = new THREE.Mesh(
        geo('tl', () => new THREE.BoxGeometry(0.04, 0.06, 0.1)),
        std(C.taillight, { emissive: C.taillight, emissiveIntensity: 1.1, roughness: 0.35 })
      )
      tl.position.set(-0.54, 0.21, sz * 0.13)
      tl.castShadow = false
      g.add(tl)
    }
  } else {
    // 厢式货车
    const cab = box(0.46, 0.36, 0.6, color, { roughness: 0.45, metalness: 0.3 })
    cab.position.set(0.66, 0.36, 0)
    g.add(cab)
    const wind = box(0.12, 0.18, 0.52, C.glassDark, { roughness: 0.16, metalness: 0.5 })
    wind.position.set(0.86, 0.44, 0)
    g.add(wind)
    const chassis = box(1.75, 0.1, 0.56, C.carDark, { roughness: 0.75 })
    chassis.position.y = 0.22
    g.add(chassis)
    const cargo = box(1.15, 0.62, 0.62, C.cargoWhite, { roughness: 0.6 })
    cargo.position.set(-0.28, 0.58, 0)
    g.add(cargo)
    const stripe = box(1.17, 0.12, 0.63, color, { roughness: 0.5, metalness: 0.2 })
    stripe.position.set(-0.28, 0.42, 0)
    g.add(stripe)
    for (const x of [0.66, -0.62, -0.24]) {
      for (const sz of [1, -1]) {
        const w1 = wheel(0.088, 0.06)
        w1.position.set(x, 0.088, sz * 0.27)
        g.add(w1)
        wheels.push(w1)
      }
    }
    const lightMat = std(C.headlight, { emissive: C.headlight, emissiveIntensity: 1.5, roughness: 0.3 })
    for (const sz of [1, -1]) {
      const hl = new THREE.Mesh(geo('hl', () => new THREE.BoxGeometry(0.04, 0.06, 0.1)), lightMat)
      hl.position.set(0.9, 0.26, sz * 0.19)
      hl.castShadow = false
      g.add(hl)
    }
  }

  g.userData.wheels = wheels
  return g
}

/** 行人：可做摆臂摆腿行走动画 */
export function person(opts = {}) {
  const {
    shirt = CLOTH.shirt[0],
    pants = CLOTH.pants[0],
    skin = C.skin,
    hair = C.hair,
    bag = false,
    scale = 1
  } = opts

  const g = new THREE.Group()
  const legMat = std(pants, { roughness: 0.88 })
  const shirtMat = std(shirt, { roughness: 0.84 })
  const skinMat = std(skin, { roughness: 0.82 })

  // 躯干（前向 +x，肩宽沿 z）
  const torso = new THREE.Mesh(geo('pT', () => new THREE.BoxGeometry(0.085, 0.16, 0.13)), shirtMat)
  torso.position.y = 0.265
  g.add(torso)

  // 头 + 发
  const head = new THREE.Mesh(geo('pH', () => new THREE.SphereGeometry(0.044, 12, 10)), skinMat)
  head.position.y = 0.378
  g.add(head)
  const hairM = new THREE.Mesh(geo('pHR', () => new THREE.SphereGeometry(0.046, 12, 10)), std(hair, { roughness: 0.9 }))
  hairM.position.y = 0.386
  hairM.scale.set(1, 0.72, 1)
  g.add(hairM)

  // 腿（枢轴在髋部）
  const legGeo = geo('pL', () => {
    const gg = new THREE.BoxGeometry(0.052, 0.19, 0.06)
    gg.translate(0, -0.095, 0)
    return gg
  })
  const legL = new THREE.Mesh(legGeo, legMat)
  legL.position.set(0, 0.19, 0.038)
  g.add(legL)
  const legR = new THREE.Mesh(legGeo, legMat)
  legR.position.set(0, 0.19, -0.038)
  g.add(legR)

  // 臂（枢轴在肩部）
  const armGeo = geo('pA', () => {
    const gg = new THREE.BoxGeometry(0.042, 0.15, 0.048)
    gg.translate(0, -0.075, 0)
    return gg
  })
  const armL = new THREE.Mesh(armGeo, shirtMat)
  armL.position.set(0, 0.33, 0.075)
  g.add(armL)
  const armR = new THREE.Mesh(armGeo, shirtMat)
  armR.position.set(0, 0.33, -0.075)
  g.add(armR)

  if (bag) {
    const bg = new THREE.Mesh(geo('pB', () => new THREE.BoxGeometry(0.06, 0.09, 0.09)), std(0x2c3441, { roughness: 0.8 }))
    bg.position.set(-0.07, 0.235, 0)
    g.add(bg)
  }

  g.userData = { legL, legR, armL, armR }
  g.scale.setScalar(scale)
  return g
}

/* ================================================================== *
 * 厂区配套
 * ================================================================== */

/** 路灯（带发光灯头，可呼吸闪烁） */
export function lightPole(opts = {}) {
  const { h = 1.5, arm = 0.28, color = C.steel, lampColor = C.cyan } = opts
  const g = new THREE.Group()
  const base = cyl(0.07, 0.09, 0.08, C.concrete, 12, { roughness: 0.9 })
  base.position.y = 0.04
  g.add(base)
  const pole = cyl(0.028, 0.038, h, color, 10, { roughness: 0.45, metalness: 0.45 })
  pole.position.y = h / 2
  g.add(pole)
  const armM = box(arm, 0.04, 0.05, color, { roughness: 0.45, metalness: 0.45 })
  armM.position.set(arm / 2, h - 0.02, 0)
  g.add(armM)

  const bulbMat = new THREE.MeshStandardMaterial({
    color: lampColor,
    emissive: lampColor,
    emissiveIntensity: 1.8,
    roughness: 0.3,
    metalness: 0
  })
  const bulb = new THREE.Mesh(geo('bulb2', () => new THREE.BoxGeometry(0.14, 0.03, 0.09)), bulbMat)
  bulb.position.set(arm, h - 0.05, 0)
  bulb.castShadow = false
  g.add(bulb)
  g.userData.bulb = bulb
  return g
}

/** 门卫室（带可升降道闸） */
export function gateBooth(opts = {}) {
  const { w = 1.0, h = 0.72, d = 0.8, accent = C.blue, side = 1 } = opts
  const g = new THREE.Group()
  const body = box(w, h, d, C.wallWhite, { roughness: 0.85 })
  body.position.y = h / 2
  g.add(body)
  const roof = box(w + 0.16, 0.1, d + 0.16, accent, { roughness: 0.55, metalness: 0.2 })
  roof.position.y = h + 0.05
  g.add(roof)
  const winMat = std(C.glassDark, { roughness: 0.15, metalness: 0.5, emissive: 0x0c2030, emissiveIntensity: 1 })
  for (const sz of [1, -1]) {
    const win = new THREE.Mesh(geo(`gb${w}`, () => new THREE.BoxGeometry(w - 0.22, h * 0.5, 0.05)), winMat)
    win.position.set(0, h * 0.62, (sz * d) / 2 + sz * 0.03)
    win.castShadow = false
    g.add(win)
  }
  for (const sx of [1, -1]) {
    const win = new THREE.Mesh(geo(`gbe${d}`, () => new THREE.BoxGeometry(0.05, h * 0.5, d - 0.22)), winMat)
    win.position.set((sx * w) / 2 + sx * 0.03, h * 0.62, 0)
    win.castShadow = false
    g.add(win)
  }
  // 道闸：整体上移到大门外侧（+z 方向 0.62），避免横杆与门楼立柱穿插
  const mast = cyl(0.05, 0.06, 0.9, C.steel, 10, { roughness: 0.5, metalness: 0.4 })
  mast.position.set(-side * (w / 2 + 0.26), 0.45, 0.62)
  g.add(mast)
  const arm = new THREE.Group()
  arm.position.set(-side * (w / 2 + 0.26), 0.78, 0.62)
  const bar = box(1.5, 0.06, 0.07, C.wallWhite, { roughness: 0.6 })
  bar.position.x = -side * 0.75
  arm.add(bar)
  for (let i = 0; i < 3; i++) {
    const st = new THREE.Mesh(geo('gbS', () => new THREE.BoxGeometry(0.2, 0.065, 0.075)), std(C.red, { roughness: 0.6 }))
    st.position.set(-side * (0.25 + i * 0.5), 0, 0)
    arm.add(st)
  }
  arm.rotation.z = -side * 1.15
  g.add(arm)
  g.userData.barrier = arm
  g.userData.barrierClosed = 0
  return g
}

/** 大门门楼：立柱 + 横梁 + 双面发光名牌 */
export function gateArch(opts = {}) {
  const { span = 6.4, h = 2.2, accent = C.blue, name = '万里科技园' } = opts
  const g = new THREE.Group()
  for (const sx of [1, -1]) {
    const col = box(0.34, h, 0.34, C.wallWhite, { roughness: 0.8 })
    col.position.set((sx * span) / 2, h / 2, 0)
    g.add(col)
    const trimB = box(0.42, 0.12, 0.42, accent, { roughness: 0.55, metalness: 0.2 })
    trimB.position.set((sx * span) / 2, h - 0.06, 0)
    g.add(trimB)
  }
  const beam = box(span + 0.34, 0.28, 0.34, C.wallWhite, { roughness: 0.8 })
  beam.position.y = h + 0.14
  g.add(beam)
  const beamTrim = box(span + 0.34, 0.09, 0.4, accent, { roughness: 0.55, metalness: 0.2 })
  beamTrim.position.y = h + 0.31
  g.add(beamTrim)

  // 园区名牌（前后双面）
  for (const sz of [1, -1]) {
    const sign = box(4.2, 0.66, 0.08, C.blueDeep, { roughness: 0.45, metalness: 0.3 })
    sign.position.set(0, h + 0.05, sz * 0.24)
    g.add(sign)
    const face = textPanel(name, { w: 3.9, h: 0.5, bg: null, fg: '#ffffff', glow: true, fontSize: 92 })
    face.position.set(0, h + 0.05, sz * 0.24 + sz * 0.045)
    if (sz < 0) face.rotation.y = Math.PI
    g.add(face)
  }
  return g
}

/** 旗杆 */
export function flagPole(h = 1.8, color = C.red) {
  const g = new THREE.Group()
  const base = cyl(0.09, 0.11, 0.14, C.concrete, 14, { roughness: 0.85 })
  base.position.y = 0.07
  g.add(base)
  const pole = cyl(0.018, 0.022, h, C.steel, 10, { roughness: 0.35, metalness: 0.6 })
  pole.position.y = h / 2
  g.add(pole)
  const flag = box(0.42, 0.26, 0.015, color, { roughness: 0.7 })
  flag.position.set(0.22, h - 0.2, 0)
  g.add(flag)
  g.userData.flag = flag
  return g
}

/** 钢卷堆场（压膜车间用） */
export function coilStack(n = 4) {
  const g = new THREE.Group()
  const mat = std(C.steel, { roughness: 0.35, metalness: 0.7 })
  const r = { a: 0.14, b: 0.16 }
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 3)
    const col = i % 3
    const c = new THREE.Mesh(geo('coil', () => {
      const gg = new THREE.CylinderGeometry(r.a, r.a, 0.26, 16)
      gg.rotateZ(Math.PI / 2)
      return gg
    }), mat)
    c.position.set(row * 0.5, r.a + row * 0.02, -0.3 + col * 0.3 + row * 0.15)
    c.castShadow = true
    g.add(c)
    const hole = new THREE.Mesh(geo('coilH', () => {
      const gg = new THREE.CylinderGeometry(r.b, r.b, 0.27, 16)
      gg.rotateZ(Math.PI / 2)
      return gg
    }), std(C.steelDeep, { roughness: 0.4, metalness: 0.6 }))
    hole.position.copy(c.position)
    g.add(hole)
  }
  return g
}

/** 货箱 / 托盘堆场 */
export function crateStack(opts = {}) {
  const { w = 0.42, h = 0.3, d = 0.34, rows = 3, cols = 3, seeded = true } = opts
  const g = new THREE.Group()
  let seed = 7
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const colors = [C.yellow, C.blue, C.wallWhite, C.teal, C.redDeep]
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const k = seeded ? Math.floor(rnd() * colors.length) : 0
      const c = box(w, h, d, colors[k], { roughness: 0.85 })
      c.position.set(i * (w + 0.06) - ((rows - 1) * (w + 0.06)) / 2, h / 2, j * (d + 0.06) - ((cols - 1) * (d + 0.06)) / 2)
      if (rnd() > 0.55) {
        const c2 = box(w, h, d, colors[(k + 2) % colors.length], { roughness: 0.85 })
        c2.position.copy(c.position)
        c2.position.y = h * 1.5
        c2.rotation.y = 0.06
        g.add(c2)
      }
      g.add(c)
    }
  }
  return g
}

/** 立式储罐组 */
export function tankSet(n = 2, r = 0.26, h = 0.8) {
  const g = new THREE.Group()
  for (let i = 0; i < n; i++) {
    const x = i * (r * 2 + 0.24)
    const t = cyl(r, r, h, C.wallGray, 18, { roughness: 0.42, metalness: 0.45 })
    t.position.set(x, h / 2, 0)
    g.add(t)
    const top = sph(r, C.steel, { roughness: 0.4, metalness: 0.5, widthSeg: 18, heightSeg: 10 })
    top.position.set(x, h, 0)
    top.scale.y = 0.55
    g.add(top)
    const ring = cyl(r * 0.34, r * 0.34, h * 0.5, C.steelDeep, 12, { roughness: 0.5, metalness: 0.5 })
    ring.position.set(x, h * 0.28, r + 0.05)
    g.add(ring)
  }
  return g
}

/** 管廊 */
export function pipeRack(opts = {}) {
  const { len = 4.5, h = 1.2, pipes = 3 } = opts
  const g = new THREE.Group()
  const n = Math.max(2, Math.round(len / 1.6))
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (len / (n - 1)) * i
    const post = box(0.08, h, 0.5, C.steel, { roughness: 0.5, metalness: 0.5 })
    post.position.set(x, h / 2, 0)
    g.add(post)
  }
  for (let p = 0; p < pipes; p++) {
    const y = h - 0.1 - p * 0.22
    const pipe = tubeX(len, 0.075, p === 0 ? C.yellow : p === 1 ? C.teal : C.steel, {
      roughness: 0.4,
      metalness: 0.45
    })
    pipe.position.set(0, y, p % 2 === 0 ? -0.14 : 0.14)
    g.add(pipe)
  }
  return g
}

/** 安全护栏 */
export function railing(opts = {}) {
  const { len = 4, h = 0.5, color = C.yellow, axis = 'x' } = opts
  const g = new THREE.Group()
  const n = Math.max(2, Math.round(len / 0.8))
  const postGeo = geo(`rp${h}`, () => new THREE.CylinderGeometry(0.022, 0.022, h, 8))
  const postMat = std(color, { roughness: 0.5 })
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(postGeo, postMat)
    p.position.set(-len / 2 + (len / (n - 1)) * i, h / 2, 0)
    p.castShadow = false
    g.add(p)
  }
  for (let j = 0; j < 2; j++) {
    const bar = box(len, 0.032, 0.032, color, { roughness: 0.5 })
    bar.position.y = h - 0.04 - j * 0.22
    bar.castShadow = false
    g.add(bar)
  }
  if (axis === 'z') g.rotation.y = Math.PI / 2
  return g
}

/** 立式货架 */
export function storageRack(opts = {}) {
  const { w = 1.6, d = 0.6, h = 1.3, levels = 3, color = C.steel } = opts
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = box(0.05, h, 0.05, color, { roughness: 0.4, metalness: 0.6 })
      post.position.set((sx * w) / 2, h / 2, (sz * d) / 2)
      g.add(post)
    }
  }
  for (let i = 0; i < levels; i++) {
    const y = (h / levels) * (i + 0.5)
    const shelf = box(w, 0.04, d, color, { roughness: 0.5, metalness: 0.5 })
    shelf.position.y = y - 0.16
    g.add(shelf)
    const n = Math.max(2, Math.floor(w / 0.45))
    for (let k = 0; k < n; k++) {
      if ((i + k) % 4 === 3) continue
      const bx = box(0.32, 0.24, d * 0.72, (i + k) % 2 ? C.yellow : C.blue, { roughness: 0.78 })
      bx.position.set(-w / 2 + 0.25 + (k * (w - 0.5)) / Math.max(1, n - 1), y + 0.04, 0)
      g.add(bx)
    }
  }
  return g
}

/** 卸货月台 + 卷帘门（沿 x 排布） */
export function loadingDock(opts = {}) {
  const { w = 4.4, count = 2, color = C.dockDoor, accent = C.blue } = opts
  const g = new THREE.Group()
  const plat = box(w, 0.14, 1.0, C.concrete, { roughness: 0.92 })
  plat.position.set(0, 0.07, 0.5)
  g.add(plat)
  const lip = box(w, 0.06, 0.14, C.steelDeep, { roughness: 0.7 })
  lip.position.set(0, 0.11, 1.0)
  g.add(lip)
  for (let i = 0; i < count; i++) {
    const x = -w / 2 + (w / (count + 1)) * (i + 1)
    const door = box(0.9, 0.52, 0.06, color, { roughness: 0.6, metalness: 0.25 })
    door.position.set(x, 0.4, 0.03)
    g.add(door)
    const hood = box(1.1, 0.07, 0.34, accent, { roughness: 0.5, metalness: 0.2 })
    hood.position.set(x, 0.7, 0.18)
    g.add(hood)
  }
  return g
}

/* ================================================================== *
 * 绿化
 * ================================================================== */
export function tree(opts = {}) {
  const { h = 1, kind = 'green' } = opts
  const g = new THREE.Group()
  const trunk = cyl(0.05, 0.07, h * 0.44, C.trunk, 8, { roughness: 0.95 })
  trunk.position.y = h * 0.22
  g.add(trunk)
  const leafColor = kind === 'pink' ? C.treePink : C.treeGreen
  const blobs = [
    [0, h * 0.64, 0, 0.29],
    [0.13, h * 0.83, 0.08, 0.2],
    [-0.12, h * 0.76, -0.1, 0.19]
  ]
  for (const [x, y, z, r] of blobs) {
    const b = sph(r * h, leafColor, { roughness: 0.9, flatShading: true, widthSeg: 10, heightSeg: 8 })
    b.position.set(x, y, z)
    g.add(b)
  }
  return g
}

export function bush(r = 0.18, color = C.grassDeep) {
  const b = sph(r, color, { roughness: 0.95, flatShading: true, widthSeg: 8, heightSeg: 6 })
  b.position.y = r * 0.75
  return b
}

export function rock(r = 0.2) {
  const b = sph(r, C.stone, { roughness: 0.95, flatShading: true, widthSeg: 7, heightSeg: 5 })
  b.position.y = r * 0.5
  b.scale.set(1, 0.7, 1.2)
  return b
}

/** 草坪地块 */
export function lawn(w, d, color = C.grass) {
  const g = new THREE.Group()
  const base = box(w, 0.08, d, C.concrete, { roughness: 0.95 })
  base.position.y = 0.04
  g.add(base)
  const top = box(w - 0.12, 0.06, d - 0.12, color, { roughness: 1 })
  top.position.y = 0.09
  g.add(top)
  return g
}

/** 绿篱 */
export function hedge(len, w = 0.4, h = 0.28, axis = 'x') {
  const g = new THREE.Group()
  const b = box(axis === 'x' ? len : w, h, axis === 'x' ? w : len, C.grassDeep, { roughness: 1, flatShading: true })
  b.position.y = h / 2
  g.add(b)
  return g
}

/* ================================================================== *
 * 车间内部产线：机械臂 / AGV / 输送线
 * ================================================================== */

/** 六轴感机械臂：底座回转 + 肩 / 肘 / 腕联动，可做焊接闪光 */
export function robotArm(opts = {}) {
  const { color = C.yellow, phase = 0, speed = 1, spark = false } = opts
  const g = new THREE.Group()

  const base = cyl(0.1, 0.12, 0.08, C.steelDeep, 14, { roughness: 0.4, metalness: 0.6 })
  base.position.y = 0.04
  g.add(base)

  const turret = new THREE.Group()
  turret.position.y = 0.08
  g.add(turret)
  const tur = cyl(0.075, 0.085, 0.12, color, 14, { roughness: 0.45, metalness: 0.3 })
  tur.position.y = 0.06
  turret.add(tur)

  const shoulder = new THREE.Group()
  shoulder.position.y = 0.12
  turret.add(shoulder)
  const upperGeo = geo('raU', () => {
    const gg = new THREE.BoxGeometry(0.085, 0.34, 0.085)
    gg.translate(0, 0.17, 0)
    return gg
  })
  const upper = new THREE.Mesh(upperGeo, std(color, { roughness: 0.45, metalness: 0.3 }))
  shoulder.add(upper)

  const elbow = new THREE.Group()
  elbow.position.y = 0.34
  shoulder.add(elbow)
  const foreGeo = geo('raF', () => {
    const gg = new THREE.BoxGeometry(0.065, 0.3, 0.065)
    gg.translate(0, 0.15, 0)
    return gg
  })
  const fore = new THREE.Mesh(foreGeo, std(color, { roughness: 0.45, metalness: 0.3 }))
  elbow.add(fore)

  const wrist = new THREE.Group()
  wrist.position.y = 0.3
  elbow.add(wrist)
  const tool = box(0.05, 0.09, 0.05, C.steelDeep, { roughness: 0.35, metalness: 0.6 })
  tool.position.y = 0.045
  wrist.add(tool)

  let sparkM = null
  if (spark) {
    sparkM = new THREE.Mesh(
      geo('raS', () => new THREE.SphereGeometry(0.04, 8, 6)),
      new THREE.MeshBasicMaterial({ color: 0xcfeaff, toneMapped: false })
    )
    sparkM.position.y = 0.1
    wrist.add(sparkM)
  }

  g.userData.animate = (t) => {
    const tt = t * speed + phase
    turret.rotation.y = Math.sin(tt * 0.55) * 1.1
    shoulder.rotation.z = -0.55 + Math.sin(tt * 0.9) * 0.4
    elbow.rotation.z = 1.05 + Math.sin(tt * 1.25 + 1.2) * 0.45
    wrist.rotation.y = tt * 2.2
    if (sparkM) sparkM.visible = Math.sin(tt * 13.7) > 0.3
  }
  return g
}

/** AGV 无人搬运车（驮着料箱） */
export function agv(opts = {}) {
  const { color = C.orange } = opts
  const g = new THREE.Group()
  const body = box(0.36, 0.08, 0.24, color, { roughness: 0.4, metalness: 0.35 })
  body.position.y = 0.07
  g.add(body)
  const deck = box(0.32, 0.03, 0.2, C.dark, { roughness: 0.6 })
  deck.position.y = 0.125
  g.add(deck)
  const crate = box(0.22, 0.15, 0.16, C.cargoWhite, { roughness: 0.7 })
  crate.position.y = 0.215
  g.add(crate)
  const eye = new THREE.Mesh(
    geo('agvE', () => new THREE.BoxGeometry(0.02, 0.025, 0.1)),
    std(C.cyan, { emissive: C.cyan, emissiveIntensity: 2, roughness: 0.3 })
  )
  eye.position.set(0.185, 0.07, 0)
  eye.castShadow = false
  g.add(eye)
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const w1 = wheel(0.045, 0.04)
      w1.position.set(sx * 0.12, 0.045, sz * 0.115)
      w1.castShadow = false
      g.add(w1)
    }
  }
  return g
}

/* 矩形闭合路径（AGV 用） */
function rectPath(pts) {
  const cum = [0]
  let total = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    total += Math.hypot(b[0] - a[0], b[1] - a[1])
    cum.push(total)
  }
  return { pts, cum, total }
}
function sampleRect(p, s) {
  s = ((s % p.total) + p.total) % p.total
  let i = 0
  while (i < p.pts.length - 1 && p.cum[i + 1] <= s) i++
  const a = p.pts[i]
  const b = p.pts[(i + 1) % p.pts.length]
  const segLen = p.cum[i + 1] - p.cum[i] || 1e-6
  const k = (s - p.cum[i]) / segLen
  return {
    x: a[0] + (b[0] - a[0]) * k,
    z: a[1] + (b[1] - a[1]) * k,
    dx: (b[0] - a[0]) / segLen,
    dz: (b[1] - a[1]) / segLen
  }
}

/**
 * 车间内部产线：输送线 + 机械臂加工 + AGV 出入库搬运 + 线边货架
 * doorSide：车间大门朝向（±z），产线布置在远离大门一侧
 */
export function workshopInterior(opts = {}) {
  const { w = 5.6, d = 3.3, doorSide = -1, weld = false, seed = 1 } = opts
  const g = new THREE.Group()
  const anims = []

  // 车间地坪
  const slab = box(w - 0.16, 0.05, d - 0.16, C.floor, { roughness: 0.9, castShadow: false })
  slab.position.y = 0.025
  g.add(slab)

  // —— 输送线（沿 x，远离大门一侧），料箱循环流动 ——
  const convZ = -doorSide * (d / 2 - 0.62)
  const L = 3.6
  const bed = box(L, 0.07, 0.46, C.steelDeep, { roughness: 0.55, metalness: 0.4, castShadow: false })
  bed.position.set(0, 0.26, convZ)
  g.add(bed)
  for (let i = -1; i <= 1; i++) {
    for (const s of [1, -1]) {
      const leg = cyl(0.03, 0.03, 0.26, C.steel, 8, { roughness: 0.5, metalness: 0.4, castShadow: false })
      leg.position.set(i * (L / 2 - 0.2), 0.13, convZ + s * 0.17)
      g.add(leg)
    }
  }
  const crates = []
  const crateCols = [C.yellow, C.blue, C.cargoWhite, C.teal]
  for (let i = 0; i < 3; i++) {
    const cr = box(0.3, 0.22, 0.3, crateCols[(i + seed) % 4], { roughness: 0.8, castShadow: false })
    cr.position.set(0, 0.41, convZ)
    g.add(cr)
    crates.push(cr)
  }
  anims.push((t) => {
    crates.forEach((cr, i) => {
      cr.position.x = -L / 2 + ((t * 0.45 + i * (L / 3)) % L)
    })
  })

  // —— 两台机械臂在输送线旁加工（焊接车间带焊花）——
  ;[-1.15, 1.15].forEach((rx, i) => {
    const rb = robotArm({ color: i ? C.orange : C.yellow, phase: i * 2.1 + seed, speed: 1 + i * 0.15, spark: weld })
    rb.position.set(rx, 0.05, convZ + doorSide * 0.55)
    rb.rotation.y = (doorSide * Math.PI) / 2
    g.add(rb)
    anims.push((t) => rb.userData.animate(t))
  })

  // —— AGV 出入库环线：大门 ↔ 输送线端部 ——
  const cart = agv({ color: C.orange })
  g.add(cart)
  const doorZ = doorSide * (d / 2 - 0.55)
  const midZ = convZ + doorSide * 0.42
  const agvPath = rectPath([
    [-1.7, doorZ],
    [1.7, doorZ],
    [1.7, midZ],
    [-1.7, midZ]
  ])
  let agvS = seed * 2.3
  let agvHeading = 0
  anims.push((t, dt) => {
    agvS += dt * 0.55
    const p = sampleRect(agvPath, agvS)
    cart.position.set(p.x, 0.05, p.z)
    const target = Math.atan2(-p.dz, p.dx)
    let dh = target - agvHeading
    dh = Math.atan2(Math.sin(dh), Math.cos(dh))
    agvHeading += dh * Math.min(1, dt * 6)
    cart.rotation.y = agvHeading
  })

  // —— 线边货架（入库暂存）——
  const rack = storageRack({ w: 1.3, d: 0.45, h: 0.85, levels: 2 })
  rack.position.set(w / 2 - 0.62, 0.05, doorSide * 0.25)
  rack.rotation.y = Math.PI / 2
  g.add(rack)

  g.userData.animate = (t, dt) => {
    for (let i = 0; i < anims.length; i++) anims[i](t, dt)
  }
  return g
}

/* ================================================================== *
 * 金属镂空栅栏围墙（竖杆 InstancedMesh + 立柱 + 上下横杆）
 * ================================================================== */
export function metalFence(opts = {}) {
  const { len = 10, h = 0.55, color = C.steelDeep, axis = 'x' } = opts
  const g = new THREE.Group()
  const mat = std(color, { roughness: 0.38, metalness: 0.65 })

  // 立柱（间距约 1.4）
  const postN = Math.max(2, Math.round(len / 1.4) + 1)
  const postGeo = geo(`fP${h}`, () => new THREE.BoxGeometry(0.07, h + 0.08, 0.07))
  for (let i = 0; i < postN; i++) {
    const p = new THREE.Mesh(postGeo, mat)
    p.position.set(-len / 2 + (len / (postN - 1)) * i, (h + 0.08) / 2, 0)
    p.castShadow = false
    g.add(p)
  }
  // 上下横杆
  for (const ry of [h - 0.04, 0.1]) {
    const rail = new THREE.Mesh(geo(`fR${len}`, () => new THREE.BoxGeometry(len, 0.045, 0.04)), mat)
    rail.position.y = ry
    rail.castShadow = false
    g.add(rail)
  }
  // 竖杆（实例化）
  const n = Math.max(4, Math.floor((len - 0.1) / 0.17))
  const picketGeo = geo(`fK${h}`, () => new THREE.BoxGeometry(0.026, h - 0.16, 0.026))
  const inst = new THREE.InstancedMesh(picketGeo, mat, n)
  const m4 = new THREE.Matrix4()
  for (let i = 0; i < n; i++) {
    m4.setPosition(-len / 2 + 0.08 + (i * (len - 0.16)) / Math.max(1, n - 1), (h - 0.16) / 2 + 0.09, 0)
    inst.setMatrixAt(i, m4)
  }
  inst.instanceMatrix.needsUpdate = true
  inst.castShadow = false
  inst.receiveShadow = true
  g.add(inst)

  if (axis === 'z') g.rotation.y = Math.PI / 2
  return g
}

/* ================================================================== *
 * 资源释放
 * ================================================================== */
export function disposeObject(root) {
  const mats = new Set()
  const geos = new Set()
  const texs = new Set()
  root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry)
    if (o.material) {
      const list = Array.isArray(o.material) ? o.material : [o.material]
      list.forEach((m) => {
        mats.add(m)
        Object.values(m).forEach((v) => {
          if (v && v.isTexture) texs.add(v)
        })
      })
    }
  })
  texs.forEach((t) => t.dispose())
  geos.forEach((g) => g.dispose())
  mats.forEach((m) => m.dispose())
  matCache.clear()
  geoCache.clear()
}
