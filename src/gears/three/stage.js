import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { createMaterials, makeSunsetEnvTexture } from './materials.js'

/** 天幕：垂直渐变的落日穹顶（着色器球，内表面） */
function makeSky() {
  const geo = new THREE.SphereGeometry(60, 32, 24)
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(-0.45, 0.1, 0.88).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 zenith = vec3(0.035, 0.028, 0.062);
        vec3 upper  = vec3(0.16, 0.075, 0.11);
        vec3 mid    = vec3(0.52, 0.19, 0.11);
        vec3 horizon= vec3(1.25, 0.55, 0.20);
        vec3 low    = vec3(0.10, 0.05, 0.045);
        vec3 col = mix(low, horizon, smoothstep(0.30, 0.50, h));
        col = mix(col, mid, smoothstep(0.50, 0.62, h));
        col = mix(col, upper, smoothstep(0.62, 0.80, h));
        col = mix(col, zenith, smoothstep(0.80, 1.0, h));
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        col += vec3(1.6, 0.9, 0.45) * pow(sd, 220.0) * 2.2;      // 日轮
        col += vec3(1.0, 0.5, 0.18) * pow(sd, 7.0) * 0.55;       // 余晖
        col += vec3(0.9, 0.42, 0.14) * pow(sd, 2.0) * 0.16;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  return mesh
}

/** 地面：带径向渐隐的暗色金属圆盘 */
function makeGround() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(canvas)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x241a15,
    metalness: 0.55,
    roughness: 0.82,
    alphaMap: tex,
    transparent: true,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(26, 64), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = -3.94
  mesh.receiveShadow = true
  return mesh
}

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.85))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x2a1712, 0.016)

  // 环境反射（PMREM）
  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()
  const envTex = makeSunsetEnvTexture()
  const envRT = pmrem.fromEquirectangular(envTex)
  scene.environment = envRT.texture
  scene.environmentIntensity = 1.0
  envTex.dispose()
  pmrem.dispose()

  scene.add(makeSky())

  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 200)
  camera.position.set(1.1, 0.35, 16)

  /* ---------------- 落日余晖光组 ---------------- */
  const key = new THREE.DirectionalLight(0xffb066, 3.1)
  key.position.set(-5.2, 4.4, 6.2)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.near = 1
  key.shadow.camera.far = 30
  key.shadow.camera.left = -7
  key.shadow.camera.right = 7
  key.shadow.camera.top = 8
  key.shadow.camera.bottom = -8
  key.shadow.bias = -0.0012
  key.shadow.normalBias = 0.02
  scene.add(key)

  const rim = new THREE.DirectionalLight(0xff5a24, 1.5)
  rim.position.set(6.4, -1.2, -5.0)
  scene.add(rim)

  const fill = new THREE.HemisphereLight(0x8a5a34, 0x140c08, 0.55)
  scene.add(fill)

  const bounce = new THREE.PointLight(0xff8a3c, 3.2, 22, 2)
  bounce.position.set(0, -3.2, 3.4)
  scene.add(bounce)

  scene.add(makeGround())

  /* ---------------- 相机控制 ---------------- */
  // 视觉中心下移：整机在画面中抬升，给底部拨轮留出构图空间
  const target = new THREE.Vector3(0, -1.55, 0)
  const orbit = { azimuth: 0.1, polar: Math.PI / 2 - 0.05, dist: 16 }
  const goal = { ...orbit }
  const shake = { x: 0, y: 0 }
  let idle = 0

  function applyCamera(dt) {
    idle += dt
    // 空闲时缓慢自动巡游
    const drift = Math.min(idle, 4) * 0.25
    const az = goal.azimuth + Math.sin(idle * 0.14) * 0.05 * drift
    orbit.azimuth += (az - orbit.azimuth) * Math.min(1, dt * 4.5)
    orbit.polar += (goal.polar - orbit.polar) * Math.min(1, dt * 4.5)
    orbit.dist += (goal.dist - orbit.dist) * Math.min(1, dt * 4.5)

    const sp = Math.sin(orbit.polar)
    camera.position.set(
      target.x + orbit.dist * sp * Math.sin(orbit.azimuth) + shake.x,
      target.y + orbit.dist * Math.cos(orbit.polar) + shake.y,
      target.z + orbit.dist * sp * Math.cos(orbit.azimuth)
    )
    camera.lookAt(target)
  }

  let dragging = false
  let lastX = 0
  let lastY = 0

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    idle = 0
    canvas.setPointerCapture?.(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    goal.azimuth -= dx * 0.0055
    goal.polar = THREE.MathUtils.clamp(goal.polar - dy * 0.004, 0.55, Math.PI - 0.55)
    idle = 0
  })
  const endDrag = (e) => {
    dragging = false
    canvas.releasePointerCapture?.(e.pointerId)
  }
  canvas.addEventListener('pointerup', endDrag)
  canvas.addEventListener('pointercancel', endDrag)
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      goal.dist = THREE.MathUtils.clamp(goal.dist + e.deltaY * 0.006, 9, 26)
      idle = 0
    },
    { passive: false }
  )

  /* ---------------- 后期：泛光 ---------------- */
  let composer = null
  try {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.62,
      0.72,
      0.68
    )
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
    composer.setSize(window.innerWidth, window.innerHeight)
  } catch (err) {
    console.warn('[逆时空齿轮轴] 后期链路不可用，回退直接渲染', err)
    composer = null
  }

  function resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
    composer?.setSize(w, h)
  }
  window.addEventListener('resize', resize)

  function render(dt) {
    applyCamera(dt)
    if (composer) composer.render(dt)
    else renderer.render(scene, camera)
  }

  const materials = createMaterials()

  return {
    renderer,
    scene,
    camera,
    materials,
    render,
    resize,
    shake,
    resetIdle: () => {
      idle = 0
    },
  }
}
