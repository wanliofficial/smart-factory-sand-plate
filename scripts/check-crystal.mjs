/**
 * 晶体共振矩阵 · 逻辑自检
 *
 * 不依赖 WebGL / 浏览器：在 Node 里直接 import 场景模块，
 * 校验 three API 可用性、晶体排布、波纹包络与实例矩阵的收敛行为。
 *
 *   node scripts/check-crystal.mjs
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import {
  buildCrystalCells,
  updateCrystalMatrices,
  rippleEnvelope,
  rippleFront,
} from '../src/crystal/main.js'

const log = (...a) => console.log(...a)
let fail = 0
const ok = (cond, msg, extra = '') => {
  log(`${cond ? 'PASS' : 'FAIL'}  ${msg}${extra ? '  -> ' + extra : ''}`)
  if (!cond) fail++
}

/* 1. three API 可用性 */
ok(typeof THREE.PMREMGenerator === 'function', 'PMREMGenerator 存在')
ok(typeof THREE.ACESFilmicToneMapping === 'number', 'ACESFilmicToneMapping 存在')
ok(typeof UnrealBloomPass === 'function', 'UnrealBloomPass 可导入')
ok(typeof OutputPass === 'function', 'OutputPass 可导入')
const rb = new RoundedBoxGeometry(1, 1, 1, 2, 0.085)
ok(rb.attributes.position.count > 0, 'RoundedBoxGeometry 构建成功', rb.attributes.position.count + ' verts')

const mat = new THREE.MeshPhysicalMaterial({
  transmission: 1,
  thickness: 1.45,
  ior: 1.72,
  clearcoat: 1,
  iridescence: 0.45,
  iridescenceIOR: 1.5,
  iridescenceThicknessRange: [120, 520],
  attenuationColor: new THREE.Color(0x0b39c9),
  attenuationDistance: 2.4,
  specularIntensity: 1,
})
ok(mat.transmission === 1 && mat.ior === 1.72, 'MeshPhysicalMaterial 玻璃参数生效')
ok(mat.iridescence === 0.45 && mat.clearcoat === 1, '虹彩 / 清漆参数生效')

/* 2. 晶体簇 */
const cells = buildCrystalCells()
ok(cells.length > 120 && cells.length < 320, '晶体数量合理', String(cells.length))
let rMin = Infinity
let rMax = 0
for (const c of cells) {
  const r = Math.hypot(c.base.x, c.base.z)
  rMin = Math.min(rMin, r)
  rMax = Math.max(rMax, r)
}
ok(rMin > 1.8 && rMax < 5.2, '环半径范围合理', `${rMin.toFixed(2)} ~ ${rMax.toFixed(2)}`)
ok(cells.every((c) => c.scale.x > 0 && c.scale.y > 0 && c.scale.z > 0), '所有晶体尺寸为正')

/* 3. 波纹包络：2 秒内收敛归零 */
ok(Math.abs(rippleEnvelope(0) - 1) < 1e-9, '包络 t=0 为 1')
ok(rippleEnvelope(0.999) < 0.001, '包络 2s 末趋近 0', rippleEnvelope(0.999).toExponential(2))
ok(rippleEnvelope(0.5) < rippleEnvelope(0.2), '包络随时间衰减')
ok(rippleFront(2) > 12, '波前 2s 覆盖超环直径', rippleFront(2).toFixed(1))

/* 4. 实例矩阵：点击后位移 → 收拢复原 */
const mesh = new THREE.InstancedMesh(rb, mat, cells.length)
const origin = new THREE.Vector3(2.4, 0.6, 0)
const snapshot = (t) => {
  const ripple = [{ local: origin.clone(), t, env: rippleEnvelope(t / 2), front: rippleFront(t) }]
  updateCrystalMatrices(mesh, cells, ripple, 0, 0)
  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  let maxD = 0
  let sumD = 0
  let maxScale = 0
  for (let i = 0; i < cells.length; i++) {
    mesh.getMatrixAt(i, m)
    pos.setFromMatrixPosition(m)
    scl.setFromMatrixScale(m)
    maxScale = Math.max(maxScale, scl.x / cells[i].scale.x)
    const base = new THREE.Vector3(
      cells[i].base.x + Math.cos(cells[i].phase) * 0.055,
      cells[i].base.y + Math.sin(cells[i].phase) * 0.075,
      cells[i].base.z + Math.sin(cells[i].phase * 1.3) * 0.055,
    )
    const d = pos.distanceTo(base)
    maxD = Math.max(maxD, d)
    sumD += d
  }
  return { maxD, avgD: sumD / cells.length, maxScale }
}

const s0 = snapshot(0.02)
const s05 = snapshot(0.5)
const s1 = snapshot(1.0)
const sEnd = snapshot(1.999)

ok(s0.maxD < 0.7, '点击瞬间起始冲击可控', s0.maxD.toFixed(3))
ok(s05.maxD > 0.25 && s05.maxD < 2.0, '0.5s 时波峰位移明显', s05.maxD.toFixed(3))
ok(s1.maxD > 0.05, '1.0s 时波仍在传播', s1.maxD.toFixed(3))
ok(sEnd.maxD < 0.02, '2s 末完全收拢复原', sEnd.maxD.toFixed(4))
ok(
  sEnd.maxScale < 1.01 && s05.maxScale > 1.05,
  '缩放脉冲随波纹出现并复原',
  `${s05.maxScale.toFixed(2)} -> ${sEnd.maxScale.toFixed(3)}`,
)

/* 5. 无波纹时保持静止基准（仅漂浮） */
updateCrystalMatrices(mesh, cells, [], 0, 0)
const m0 = new THREE.Matrix4()
mesh.getMatrixAt(0, m0)
const p0 = new THREE.Vector3().setFromMatrixPosition(m0)
updateCrystalMatrices(mesh, cells, [], 0, 0)
mesh.getMatrixAt(0, m0)
const p1 = new THREE.Vector3().setFromMatrixPosition(m0)
ok(p0.distanceTo(p1) < 1e-6, '无波纹时同一时刻矩阵稳定')

log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : fail + ' CHECK(S) FAILED'}`)
process.exit(fail === 0 ? 0 : 1)
