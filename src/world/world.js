// ============================================================
// World System — 主世界系统
// 使用 vGPU (WebGPU) 驱动的沉浸式 3D AIoT 数字世界
// ============================================================

import {
  generateMajorNodes,
  generateSensorNodes,
  generateConnections,
  generateSensorConnections,
  generateParticles,
  NODE_TYPE_NAMES,
} from './dataSim.js'

import worldWgsl from './shaders/world.wgsl';
import particlesWgsl from './shaders/particles.wgsl';
import nodesWgsl from './shaders/nodes.wgsl';
import connectionsWgsl from './shaders/connections.wgsl';
import brightWgsl from './shaders/bright.wgsl';
import blurWgsl from './shaders/blur.wgsl';
import postWgsl from './shaders/post.wgsl';
import particlesSimWgsl from './shaders/particlesSim.wgsl';

// 结构体大小（每个 16 f32 = 64 字节，16 字节对齐）
const FLOATS_PER_ITEM = 16
const BYTES_PER_ITEM = 64

export async function createWorld({ canvas, onStats, onSelectNode, debugCapture }) {
  const vgpu = await import('vgpu')
  const { init, surface, effect, draw, target, frameLoop, clock, sampler, bundle } = vgpu

  const gpu = await init({
    requiredLimits: {
      maxStorageBuffersInVertexStage: 3,
      maxStorageBuffersPerShaderStage: 4,
      maxStorageBufferBindingSize: 64 * 1024 * 1024,
    },
  })

  const device = gpu.gpu // 原生 GPUDevice
  const wrap = gpu.device.wrapBuffer.bind(gpu.device)

  const canvasSurface = surface(gpu, canvas, { dpr: [1, 1.6] })
  const baseSize = canvasSurface.size

  // ============ 生成数据 ============
  const majorNodes = generateMajorNodes()
  const sensorNodes = generateSensorNodes(5000)
  const mainConns = generateConnections(majorNodes)
  const sensorConns = generateSensorConnections(sensorNodes, majorNodes, 500)
  const connections = [...mainConns, ...sensorConns]
  const particles = generateParticles(50000, majorNodes, connections)
  const totalNodeCount = majorNodes.length + sensorNodes.length

  // ============ 创建 GPU buffers ============

  // 节点 buffer
  const nodeBuffer = device.createBuffer({
    size: totalNodeCount * BYTES_PER_ITEM,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  })
  {
    const arr = new Float32Array(nodeBuffer.getMappedRange())
    writeNodes(arr, majorNodes, 0)
    writeNodes(arr, sensorNodes, majorNodes.length)
    nodeBuffer.unmap()
  }
  const nodeBufferWrapped = wrap(nodeBuffer)

  // 连接 buffer
  const connBuffer = device.createBuffer({
    size: connections.length * BYTES_PER_ITEM,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  })
  {
    const arr = new Float32Array(connBuffer.getMappedRange())
    for (let i = 0; i < connections.length; i++) {
      const c = connections[i]
      const o = i * FLOATS_PER_ITEM
      arr[o + 0] = c.fromPos[0]
      arr[o + 1] = c.fromPos[1]
      arr[o + 2] = c.fromPos[2]
      arr[o + 3] = c.type
      arr[o + 4] = c.toPos[0]
      arr[o + 5] = c.toPos[1]
      arr[o + 6] = c.toPos[2]
      arr[o + 7] = c.traffic
      arr[o + 8] = Math.random() * 10
      arr[o + 9] = 0.3 + Math.random() * 0.9
    }
    connBuffer.unmap()
  }
  const connBufferWrapped = wrap(connBuffer)

  // 粒子 buffer (16 floats per particle)
  // 0-2 pos, 3 pad, 4-6 vel, 7 pad, 8-10 color, 11 energy, 12 size, 13 seed, 14 type, 15 pad
  const particleBuffer = device.createBuffer({
    size: particles.length * BYTES_PER_ITEM,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  })
  {
    const arr = new Float32Array(particleBuffer.getMappedRange())
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      const o = i * FLOATS_PER_ITEM
      arr[o + 0] = p.position[0]
      arr[o + 1] = p.position[1]
      arr[o + 2] = p.position[2]
      // 3 pad
      arr[o + 4] = p.velocity[0]
      arr[o + 5] = p.velocity[1]
      arr[o + 6] = p.velocity[2]
      // 7 pad
      arr[o + 8] = p.color[0]
      arr[o + 9] = p.color[1]
      arr[o + 10] = p.color[2]
      arr[o + 11] = p.energy
      arr[o + 12] = p.size
      arr[o + 13] = p.seed
      arr[o + 14] = p.type
      // 15 pad
    }
    particleBuffer.unmap()
  }
  const particleBufferWrapped = wrap(particleBuffer)

  // 粒子模拟 uniform
  const simUniformBuffer = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  // ============ 相机状态 ============
  const cam = {
    rotY: 0.3,
    rotX: -0.2,
    zoom: 4.5,
    autoRot: 0.03,
    targetRotY: 0.3,
    targetRotX: -0.2,
    targetZoom: 4.5,
    autoRotDelay: 0,
  }

  // ============ 渲染目标 ============
  const SCENE_FORMAT = 'rgba16float'
  const CLEAR = [0, 0, 0, 1]

  let size = [...baseSize]
  let sceneTarget = makeSceneTarget()
  let compositeTarget = makeCompositeTarget()
  let bloom0 = makeBloomTarget()
  let bloom1 = makeBloomTarget()

  function makeSceneTarget() {
    return target(gpu, { size, format: SCENE_FORMAT, msaa: !gpu.device.isCompatibilityMode })
  }
  function makeCompositeTarget() {
    return target(gpu, { size, format: SCENE_FORMAT })
  }
  function makeBloomTarget() {
    const bs = [Math.max(1, size[0] >> 1), Math.max(1, size[1] >> 1)]
    return target(gpu, { size: bs, format: SCENE_FORMAT })
  }

  // ============ 效果 / 着色器 ============
  const samp = sampler(gpu, { minFilter: 'linear', magFilter: 'linear' })
  const additiveBlend = {
    color: { src: 'src-alpha', dst: 'one' },
    alpha: { src: 'one', dst: 'one' },
  }

  const aspect = size[0] / size[1]
  const ro = getCameraOrigin()
  const camU = {
    ro,
    time: 0,
    aspect,
    resolution: [size[0], size[1]],
    _pad: [0, 0],
  }

  const worldEffect = effect(gpu, worldWgsl, { set: { cam: camU } })

  const particleDraw = draw(gpu, {
    shader: particlesWgsl,
    vertices: 6,
    instances: particles.length,
    blend: additiveBlend,
    set: { cam: camU, particles: particleBufferWrapped },
  })

  const nodeDraw = draw(gpu, {
    shader: nodesWgsl,
    vertices: 6,
    instances: totalNodeCount,
    blend: additiveBlend,
    set: { cam: camU, nodes: nodeBufferWrapped },
  })

  const CONN_SEG = 12
  const connDraw = draw(gpu, {
    shader: connectionsWgsl,
    vertices: (CONN_SEG + 1) * 2,
    instances: connections.length,
    blend: additiveBlend,
    set: { cam: camU, connections: connBufferWrapped },
  })

  const brightEffect = effect(gpu, brightWgsl, {
    set: { samp, params: { threshold: 0.5, softKnee: 0.5, _pad: [0, 0] } },
  })

  const blurH = effect(gpu, blurWgsl, {
    set: { samp, blur: { texelSize: [1 / bloom0.size[0], 1 / bloom0.size[1]], direction: [1, 0], radius: 2.0, _pad: 0 } },
  })
  const blurV = effect(gpu, blurWgsl, {
    set: { samp, blur: { texelSize: [1 / bloom0.size[0], 1 / bloom0.size[1]], direction: [0, 1], radius: 2.0, _pad: 0 } },
  })

  const postEffect = effect(gpu, postWgsl, {
    set: { samp, bloom: bloom0, params: { time: 0, aspect, bloomIntensity: 1.6, _pad: 0 } },
  })

  function updateTextureBindings() {
    brightEffect.set({ src: compositeTarget })
    blurH.set({ src: bloom0 })
    blurV.set({ src: bloom1 })
    postEffect.set({ src: compositeTarget, bloom: bloom0 })
  }
  updateTextureBindings()

  // ============ 粒子模拟 compute pipeline ============
  // Vite WGSL 插件导出的是 { version, wgsl } 模块对象；原生 createShaderModule 需要纯字符串
  const simCode = typeof particlesSimWgsl === 'string' ? particlesSimWgsl : particlesSimWgsl.wgsl
  const simModule = device.createShaderModule({ code: simCode })
  const simPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: simModule, entryPoint: 'main' },
  })
  let simBindGroup = device.createBindGroup({
    layout: simPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuffer } },
      { binding: 1, resource: { buffer: simUniformBuffer } },
    ],
  })

  // ============ 预编译 ============
  async function prewarm() {
    await Promise.all([
      worldEffect.compile(sceneTarget),
      particleDraw.compile(sceneTarget),
      nodeDraw.compile(sceneTarget),
      connDraw.compile(sceneTarget),
      brightEffect.compile(bloom0),
      blurH.compile(bloom1),
      blurV.compile(bloom0),
      postEffect.compile({ colors: [canvasSurface.format] }),
    ])
  }

  // ============ 渲染 bundle ============
  const sampleCount = gpu.device.isCompatibilityMode ? 1 : 4
  const sceneBundle = bundle(
    gpu,
    { target: { colors: [SCENE_FORMAT], sampleCount } },
    (pass) => {
      pass.draw(worldEffect)
      pass.draw(particleDraw)
      pass.draw(connDraw)
      pass.draw(nodeDraw)
    },
  )

  // ============ 节点选中 ============
  let selectedIndex = -1

  function setSelectedNode(idx) {
    selectedIndex = idx
    const count = majorNodes.length
    const temp = new Float32Array(count * FLOATS_PER_ITEM)
    for (let i = 0; i < count; i++) {
      const n = majorNodes[i]
      const o = i * FLOATS_PER_ITEM
      temp[o + 0] = n.position[0]
      temp[o + 1] = n.position[1]
      temp[o + 2] = n.position[2]
      temp[o + 3] = n.type
      temp[o + 4] = n.size
      temp[o + 5] = n.status
      temp[o + 6] = n.pulsePhase
      temp[o + 7] = n.pulseSpeed
      temp[o + 8] = i === idx ? 1.0 : 0.0 // selected
      temp[o + 9] = 0.0 // hover
    }
    device.queue.writeBuffer(nodeBuffer, 0, temp)
  }

  // ============ 输入 ============
  const input = setupInput({
    canvas,
    cam,
    onActivity: () => { cam.autoRotDelay = 180 },
    onClick: (ndc) => {
      const idx = pickNode(ndc)
      if (idx >= 0) {
        setSelectedNode(idx)
        const n = majorNodes[idx]
        onSelectNode?.({
          id: n.id,
          type: NODE_TYPE_NAMES[n.type],
          name: n.name,
          status: n.status === 1 ? 'online' : n.status === 0.5 ? 'warning' : 'offline',
          metrics: n.metrics,
          connections: n.connections,
        })
      } else {
        setSelectedNode(-1)
        onSelectNode?.(null)
      }
    },
  })

  function pickNode(ndc) {
    const ro = getCameraOrigin()
    const forward = v3norm(v3neg(ro))
    const right = v3norm(v3cross(forward, [0, 1, 0]))
    const up = v3cross(right, forward)
    const focal = size[1] * 0.6

    let bestScore = 0.05
    let bestIdx = -1

    for (let i = 0; i < majorNodes.length; i++) {
      const n = majorNodes[i]
      const rel = v3sub(n.position, ro)
      const depth = v3dot(rel, forward)
      if (depth <= 0.1) continue

      const sx = v3dot(rel, right) * focal / depth / (size[0] / 2)
      const sy = v3dot(rel, up) * focal / depth / (size[1] / 2)

      const d = Math.hypot(ndc[0] - sx, ndc[1] - sy)
      const hitR = 0.03 + n.size * 0.015
      if (d < hitR && d < bestScore) {
        bestScore = d
        bestIdx = i
      }
    }
    return bestIdx
  }

  function getCameraOrigin() {
    const t = performance.now() / 1000
    const yaw = cam.rotY + t * cam.autoRot * (cam.autoRotDelay <= 0 ? 1 : 0)
    const pitch = cam.rotX
    const cy = Math.cos(yaw), sy = Math.sin(yaw)
    const cp = Math.cos(pitch), sp = Math.sin(pitch)
    return [cam.zoom * cp * sy, cam.zoom * sp, cam.zoom * cp * cy]
  }

  function getCameraRay(ndc) {
    const aspect = size[0] / size[1]
    const fov = 1.2
    const rd = v3norm([ndc[0] * aspect * fov, ndc[1] * fov, -1.0])

    const t = performance.now() / 1000
    const yaw = cam.rotY + t * cam.autoRot * (cam.autoRotDelay <= 0 ? 1 : 0)
    const pitch = cam.rotX

    const cp = Math.cos(-pitch), sp = Math.sin(-pitch)
    const y1 = cp * rd[1] - sp * rd[2]
    const z1 = sp * rd[1] + cp * rd[2]
    const cy = Math.cos(-yaw), sy = Math.sin(-yaw)
    const x2 = cy * rd[0] + sy * z1
    const z2 = -sy * rd[0] + cy * z1
    return [x2, y1, z2]
  }

  // ============ 响应式 ============
  let resizeRaf = 0
  let pendingSize = null
  let lastDpr = window.devicePixelRatio || 1

  function scheduleResize(w, h) {
    pendingSize = [w, h]
    if (!resizeRaf) resizeRaf = requestAnimationFrame(applyResize)
  }

  function applyResize() {
    resizeRaf = 0
    if (!pendingSize) return
    const [w, h] = pendingSize
    pendingSize = null
    if (w <= 0 || h <= 0) return

    const dpr = Math.min(1.6, Math.max(1, window.devicePixelRatio || 1))
    size = [Math.max(1, Math.round(w * dpr)), Math.max(1, Math.round(h * dpr))]

    sceneTarget.destroy()
    compositeTarget.destroy()
    bloom0.destroy()
    bloom1.destroy()
    sceneTarget = makeSceneTarget()
    compositeTarget = makeCompositeTarget()
    bloom0 = makeBloomTarget()
    bloom1 = makeBloomTarget()
    updateTextureBindings()

    const a = size[0] / size[1]
    const u = { ro: getCameraOrigin(), time: 0, aspect: a, resolution: [size[0], size[1]], _pad: [0, 0] }
    worldEffect.set({ cam: u })
    particleDraw.set({ cam: u })
    nodeDraw.set({ cam: u })
    connDraw.set({ cam: u })
  }

  const obs = new ResizeObserver((entries) => {
    const r = entries[0].contentRect
    scheduleResize(r.width, r.height)
  })
  obs.observe(canvas)
  window.addEventListener('resize', () => {
    if (window.devicePixelRatio === lastDpr) return
    lastDpr = window.devicePixelRatio
    const r = canvas.getBoundingClientRect()
    scheduleResize(r.width, r.height)
  })
  const rect = canvas.getBoundingClientRect()
  if (rect.width > 0) scheduleResize(rect.width, rect.height)

  // ============ 预编译并启动 ============
  await prewarm()

  const gpuClock = clock(gpu)
  let disposed = false
  let debugFrame = 0
  let debugCaptureState = 'idle' // 'idle' | 'paused' | 'capturing'
  let debugReadFrame = -1
  let fpsFrames = 0
  let fpsLast = 0
  let currentFps = 60

  frameLoop(gpu, (frame) => {
    if (disposed) return
    const t = gpuClock.time
    const dt = Math.min(gpuClock.deltaTime, 0.033)

    // FPS
    fpsFrames++
    if (t - fpsLast >= 0.5) {
      currentFps = fpsFrames / (t - fpsLast)
      fpsFrames = 0
      fpsLast = t
      onStats?.({
        fps: currentFps,
        particles: particles.length,
        nodes: totalNodeCount,
        connections: connections.length,
      })
    }

    // 相机平滑
    cam.rotY += (cam.targetRotY - cam.rotY) * 0.1
    cam.rotX += (cam.targetRotX - cam.rotX) * 0.1
    cam.zoom += (cam.targetZoom - cam.zoom) * 0.1
    if (cam.autoRotDelay > 0) cam.autoRotDelay--

    const ro = getCameraOrigin()
    const aspect = size[0] / size[1]
    const u = { ro, time: t, aspect, resolution: [size[0], size[1]], _pad: [0, 0] }

    worldEffect.set({ cam: u })
    particleDraw.set({ cam: u })
    nodeDraw.set({ cam: u })
    connDraw.set({ cam: u })
    postEffect.set({ params: { time: t, aspect, bloomIntensity: 1.6, _pad: 0 } })

    // 粒子模拟 uniform
    const simArr = new Float32Array(16)
    simArr[0] = t
    simArr[1] = dt
    simArr[2] = 1.0
    simArr[3] = 2.2
    device.queue.writeBuffer(simUniformBuffer, 0, simArr)

    // Compute pass
    {
      const enc = device.createCommandEncoder()
      const pass = enc.beginComputePass()
      pass.setPipeline(simPipeline)
      pass.setBindGroup(0, simBindGroup)
      pass.dispatchWorkgroups(Math.ceil(particles.length / 128))
      pass.end()
      device.queue.submit([enc.finish()])
    }

    // 场景（MSAA bundle）
    frame.pass({ target: sceneTarget, clear: CLEAR }, (p) => {
      p.bundles(sceneBundle)
    })

    // Composite (非 MSAA，用于后处理)
    const smokeLayer = globalThis.process?.env?.SMOKE_LAYER || ''
    frame.pass({ target: compositeTarget, clear: CLEAR }, (p) => {
      if (!smokeLayer || smokeLayer === 'world') p.draw(worldEffect)
      if (!smokeLayer || smokeLayer === 'particles') p.draw(particleDraw)
      if (!smokeLayer || smokeLayer === 'conns') p.draw(connDraw)
      if (!smokeLayer || smokeLayer === 'nodes') p.draw(nodeDraw)
    })

    // Bright pass
    frame.pass({ target: bloom0, clear: CLEAR }, (p) => p.draw(brightEffect))

    // 双重模糊（大半径 bloom）
    const bsize = bloom0.size
    const texel = [1 / bsize[0], 1 / bsize[1]]
    blurH.set({ blur: { texelSize: texel, direction: [1, 0], radius: 3.0, _pad: 0 } })
    blurV.set({ blur: { texelSize: texel, direction: [0, 1], radius: 3.0, _pad: 0 } })
    frame.pass({ target: bloom1, clear: CLEAR }, (p) => p.draw(blurH))
    frame.pass({ target: bloom0, clear: CLEAR }, (p) => p.draw(blurV))

    blurH.set({ blur: { texelSize: texel, direction: [1, 0], radius: 6.0, _pad: 0 } })
    blurV.set({ blur: { texelSize: texel, direction: [0, 1], radius: 6.0, _pad: 0 } })
    frame.pass({ target: bloom1, clear: [0, 0, 0, 0] }, (p) => p.draw(blurH))
    frame.pass({ target: bloom0, clear: [0, 0, 0, 0] }, (p) => p.draw(blurV))

    // Post → 屏幕
    frame.pass({ target: canvasSurface, clear: CLEAR }, (p) => p.draw(postEffect))

    // 调试取帧：D3D12/Vulkan 下 GPU 队列持续满载时 mapAsync 永不完成，因此先提交几个
    // 空帧让队列排空，再从帧回调内提交读回（回调外提交会挂起）。复制已入队，之后恢复
    // 渲染也不影响捕获结果（FIFO 保证复制读的是暂停前的合成结果）。
    if (debugCapture) {
      if (debugFrame === 2 && debugCaptureState === 'idle') {
        debugCaptureState = 'paused'
        debugReadFrame = debugFrame + 3
      }
      if (debugCaptureState === 'paused' && debugFrame >= debugReadFrame) {
        debugCaptureState = 'capturing'
        compositeTarget.color
          .readFloats({ mipLevel: 0, region: 'all' })
          .then((floats) => {
            debugCaptureState = 'idle'
            if (!disposed) debugCapture({ floats, size: [...size] })
          })
          .catch((e) => console.error('[debugCapture] read failed:', e?.message || e))
      }
      if (debugCaptureState === 'paused') {
        debugFrame++
        return
      }
    }
    debugFrame++
  })

  function dispose() {
    disposed = true
    obs.disconnect()
    input.dispose()
    gpu.dispose()
  }

  return { dispose }
}

// ============ 工具函数 ============
function writeNodes(arr, nodes, startIdx) {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    const o = (startIdx + i) * FLOATS_PER_ITEM
    arr[o + 0] = n.position[0]
    arr[o + 1] = n.position[1]
    arr[o + 2] = n.position[2]
    arr[o + 3] = n.type
    arr[o + 4] = n.size ?? 0.5
    arr[o + 5] = n.status ?? 1.0
    arr[o + 6] = n.pulsePhase || 0
    arr[o + 7] = n.pulseSpeed || 1.0
    arr[o + 8] = 0 // selected
    arr[o + 9] = 0 // hover
    // 10-15 pad
  }
}

function setupInput({ canvas, cam, onActivity, onClick }) {
  let dragging = false
  let lastX = 0, lastY = 0
  let moved = false
  let startX = 0, startY = 0

  const onDown = (e) => {
    if (!e.isPrimary) return
    dragging = true
    moved = false
    lastX = e.clientX
    lastY = e.clientY
    startX = e.clientX
    startY = e.clientY
    canvas.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e) => {
    if (!dragging || !e.isPrimary) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    if (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3) {
      moved = true
      onActivity?.()
    }
    cam.targetRotY += dx * 0.005
    cam.targetRotX = Math.max(-1.3, Math.min(1.3, cam.targetRotX + dy * 0.005))
  }
  const onUp = (e) => {
    if (!e.isPrimary) return
    dragging = false
    canvas.releasePointerCapture?.(e.pointerId)
    if (!moved) {
      const rect = canvas.getBoundingClientRect()
      const ndc = [
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      ]
      onClick?.(ndc)
    }
  }
  const onWheel = (e) => {
    e.preventDefault()
    const f = e.deltaY > 0 ? 1.1 : 1 / 1.1
    cam.targetZoom = Math.max(1.8, Math.min(10, cam.targetZoom * f))
    onActivity?.()
  }

  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  return {
    dispose() {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('wheel', onWheel)
    },
  }
}

// 小向量工具
function v3norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
function v3neg(v) { return [-v[0], -v[1], -v[2]] }
function v3cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]] }
function v3dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2] }
function v3sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]] }
