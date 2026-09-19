/**
 * 纠缠之隙：量子跃迁观测台 · 自检（不依赖 WebGL / 浏览器）
 *
 *   node scripts/check-quantum.mjs
 *
 * 校验内容：
 *   1. 内联模块语法（node --check）
 *   2. GLSL：uniforms 声明与 SHADER_SPECS 严格一致；fragment 的 varying 必须是 vertex 的子集且类型一致
 *   3. HUD：JS 引用的 DOM id 与 gsap 选择器在 HTML 中都存在
 *   4. 依赖：importmap 覆盖所有裸导入；CDN 版本与工程依赖一致
 *   5. 站点接入：vite.config 入口 + SiteNav + crystal / gears 内联导航
 *   6. 纯逻辑数值验证：光子色相单调偏冷、能级迟滞、能量累积、震颤映射、
 *      贝尔不等式（量子态收敛到 2√2、局域隐变量模型不超过 2）
 */

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')

const log = (...a) => console.log(...a)
let fail = 0
const ok = (cond, msg, extra = '') => {
  log(`${cond ? 'PASS' : 'FAIL'}  ${msg}${extra ? '  -> ' + extra : ''}`)
  if (!cond) fail++
}

const html = read('quantum/index.html')

/* ---------------------------------------------------------------- 1. 语法 */
const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/)
ok(!!scriptMatch, '内联 module 脚本存在')
const code = scriptMatch ? scriptMatch[1] : ''
ok(!html.includes('src="/src/'), '页面为单文件（无外部 JS 引用）')

const tmpCode = null
try {
  execFileSync(process.execPath, ['--input-type=module', '--check'], { input: code, stdio: 'pipe' })
  ok(true, '内联模块语法通过 node --check')
} catch (err) {
  ok(false, '内联模块语法通过 node --check', String(err.stderr || err.message).slice(0, 300))
}

/* ------------------------------------------------------- 2. 抽取 PURE 区 */
const pureMatch = code.match(/\/\* ==== PURE-BEGIN ==== \*\/([\s\S]*?)\/\* ==== PURE-END ==== \*\//)
ok(!!pureMatch, 'PURE 纯逻辑区标记完整')
/* 以 data URL 动态导入（追加导出清单，避免在工程目录落临时文件） */
const PURE_EXPORTS = [
  'CONFIG', 'LEVELS', 'PHOTON_SPECTRUM', 'SHADER_SPECS', 'TAU', 'MAX_LEVEL_GAP',
  'clamp', 'clamp01', 'lerp', 'degToRad', 'radToDeg', 'wrapTau', 'shortestAngleDelta',
  'resolveLevel', 'levelGap', 'hslToHex', 'photonColorFor',
  'sampleEntangledPair', 'sampleLocalPair', 'chshValue', 'estimateCorrelations',
  'accumulateEnergy', 'trembleFromSpeed', 'rippleAccumulator',
]
const PURE = await import(
  'data:text/javascript;base64,' +
    Buffer.from((pureMatch ? pureMatch[1] : '') + `\nexport { ${PURE_EXPORTS.join(', ')} }\n`).toString('base64')
)

const {
  CONFIG, LEVELS, SHADER_SPECS, MAX_LEVEL_GAP,
  resolveLevel, levelGap, photonColorFor, hslToHex,
  sampleEntangledPair, sampleLocalPair, chshValue, estimateCorrelations,
  accumulateEnergy, trembleFromSpeed, rippleAccumulator, shortestAngleDelta, wrapTau, degToRad,
} = PURE

/* ------------------------------------------------------------ 3. GLSL 校验 */
function uniformDecls(src) {
  const out = new Map()
  const re = /uniform\s+(?:lowp\s+|mediump\s+|highp\s+)?(\w+)\s+([^;]+);/g
  let m
  while ((m = re.exec(src))) for (const n of m[2].split(',')) out.set(n.trim(), m[1])
  return out
}
function varyingDecls(src) {
  const out = new Map()
  const re = /varying\s+(\w+)\s+([^;]+);/g
  let m
  while ((m = re.exec(src))) for (const n of m[2].split(',')) out.set(n.trim(), m[1])
  return out
}

const specNames = Object.keys(SHADER_SPECS)
ok(specNames.length >= 8, `着色器清单齐备（${specNames.length} 个）`, specNames.join(' / '))

for (const name of specNames) {
  const spec = SHADER_SPECS[name]
  const declared = new Map([...uniformDecls(spec.vertex), ...uniformDecls(spec.fragment)])
  const expected = new Set(spec.uniforms)

  const missing = [...expected].filter((n) => !declared.has(n))
  const extra = [...declared.keys()].filter((n) => !expected.has(n))
  ok(missing.length === 0, `[${name}] uniforms 全部在 GLSL 中声明`, missing.join(', '))
  ok(extra.length === 0, `[${name}] GLSL 未声明清单外的 uniform`, extra.join(', '))

  const vv = varyingDecls(spec.vertex)
  const vf = varyingDecls(spec.fragment)
  const badType = [...vf.keys()].filter((n) => vv.has(n) && vv.get(n) !== vf.get(n))
  const notInVertex = [...vf.keys()].filter((n) => !vv.has(n))
  ok(notInVertex.length === 0, `[${name}] fragment 的 varying 均在 vertex 中声明`, notInVertex.join(', '))
  ok(badType.length === 0, `[${name}] varying 类型两端一致`, badType.join(', '))

  ok(!spec.vertex.includes('${') && !spec.fragment.includes('${'), `[${name}] GLSL 内无模板占位符`)
  const braces = (s) => (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length
  ok(braces(spec.vertex) === 0 && braces(spec.fragment) === 0, `[${name}] GLSL 花括号配平`)
}

/* ------------------------------------------------------------- 4. HUD 校验 */
const idRefs = new Set()
for (const m of code.matchAll(/(?:byId|getElementById)\(\s*'([^']+)'\s*\)/g)) idRefs.add(m[1])
const htmlIds = new Set()
for (const m of html.matchAll(/\sid="([^"]+)"/g)) htmlIds.add(m[1])
const missingIds = [...idRefs].filter((id) => !htmlIds.has(id))
ok(idRefs.size >= 20, `JS 引用的 DOM id 数量合理（${idRefs.size} 个）`)
ok(missingIds.length === 0, 'JS 引用的 DOM id 在 HTML 中都存在', missingIds.join(', '))

const selRef = code.match(/gsap\.from\(\[([^\]]+)\]/)
const selectors = selRef ? [...selRef[1].matchAll(/'\.([\w-]+)'/g)].map((m) => m[1]) : []
ok(selectors.length > 0 && selectors.every((c) => html.includes(`class="${c}`) || html.includes(`${c}"`)), 'gsap 入场选择器在 HTML 中都有对应元素', selectors.join(', '))

/* --------------------------------------------------------- 5. 依赖 / 站点 */
const importmap = JSON.parse((html.match(/<script type="importmap">([\s\S]*?)<\/script>/) || [])[1] || '{}').imports || {}
const pkg = JSON.parse(read('package.json'))
const threeVersion = pkg.dependencies.three.replace(/^[\^~]/, '')
ok(importmap.three && importmap.three.includes(`three@${threeVersion}`), `importmap 引入 three@${threeVersion}`, importmap.three || '')
ok(!!importmap['three/addons/'], 'importmap 覆盖 three/addons/（后期处理）', importmap['three/addons/'] || '')
ok(!!importmap.gsap, 'importmap 覆盖 gsap', importmap.gsap || '')

const bareImports = new Set()
for (const m of code.matchAll(/from\s+'([^']+)'/g)) if (!m[1].startsWith('.') && !m[1].startsWith('/')) bareImports.add(m[1])
const unresolved = [...bareImports].filter((s) => !(s in importmap) && !Object.keys(importmap).some((k) => k.endsWith('/') && s.startsWith(k)))
ok(unresolved.length === 0, '所有裸导入都能被 importmap 解析', unresolved.join(', '))
ok(bareImports.has('three') && bareImports.has('gsap'), '同时使用 three 与 gsap')

const viteCfg = read('vite.config.js')
ok(/quantum:\s*resolve\(root,\s*'quantum\/index\.html'\)/.test(viteCfg), 'vite.config.js 注册 quantum 入口')
const siteNav = read('src/components/SiteNav.jsx')
ok(/id:\s*'quantum'/.test(siteNav), 'SiteNav 增加 quantum 导航项')
ok(/SUB_ROUTES\s*=\s*\[[^\]]*'quantum'/.test(siteNav), 'SUB_ROUTES 包含 quantum（回退一级路径）')
for (const p of ['crystal/index.html', 'gears/index.html']) {
  ok(read(p).includes('../quantum/index.html'), `${p} 内联导航链接到量子场景`)
}
const backLinks = ['index.html', 'park/index.html', 'energy/index.html', 'crystal/index.html', 'gears/index.html', 'city/index.html']
ok(backLinks.every((l) => html.includes(`href="../${l}"`)), '量子页面可回到其余全部场景')
ok(html.includes('aria-current="page"'), '量子页面自身导航项标记为当前页')

/* ------------------------------------------------------------ 6. 纯逻辑 */
log('\n-- 能级与光子 --')
ok(LEVELS.every((lv, i) => i === 0 || lv.need > LEVELS[i - 1].need), '能级阈值严格递增')
const gaps = LEVELS.slice(1).map((_, i) => levelGap(LEVELS, i, i + 1))
ok(Math.abs(MAX_LEVEL_GAP - Math.max(...gaps)) < 1e-9, 'MAX_LEVEL_GAP 等于最大能级差', `gaps=${gaps.map((g) => g.toFixed(2)).join('/')}`)
ok(LEVELS[LEVELS.length - 1].need < CONFIG.atom.energyMax, '最高能级可达（阈值 < 能量上限）',
  `${LEVELS[LEVELS.length - 1].need} < ${CONFIG.atom.energyMax}`)
ok(CONFIG.atom.hysteresis < Math.min(...gaps), '迟滞小于最小能级差，避免跳级抖动')

const colors = gaps.map((g) => photonColorFor(g, MAX_LEVEL_GAP))
ok(colors.every((c, i) => i === 0 || c.hue > colors[i - 1].hue), '能级差越大 → 色相越偏蓝紫',
  colors.map((c) => `${c.hue.toFixed(0)}°`).join(' < '))
ok(colors.every((c, i) => i === 0 || c.lambda < colors[i - 1].lambda), '能级差越大 → 波长越短',
  colors.map((c) => `${c.lambda}nm`).join(' > '))
ok(new Set(colors.map((c) => c.hex)).size === colors.length, '三档跃迁光子颜色互不相同', colors.map((c) => c.hex).join(' / '))
ok(colors[colors.length - 1].hue > 250, '最大能级差的光子落在蓝紫区间', colors[colors.length - 1].hex)
ok(/^#[0-9a-f]{6}$/.test(hslToHex(0, 1, 0.5)), 'HSL→HEX 输出合法颜色')

log('\n-- 能级跃迁（含迟滞）--')
ok(resolveLevel(0, 0, LEVELS, CONFIG.atom.hysteresis) === 0, '零能量停留在基态')
ok(resolveLevel(LEVELS[1].need, 0, LEVELS, CONFIG.atom.hysteresis) === 1, '达阈值即刻跃迁到 n=2')
ok(resolveLevel(LEVELS[3].need, 0, LEVELS, CONFIG.atom.hysteresis) === 3, '能量充足时可直接跃迁到 n=4')
ok(resolveLevel(LEVELS[1].need - 0.01, 1, LEVELS, CONFIG.atom.hysteresis) === 1, '阈值内回落不触发下降（迟滞生效）')
ok(resolveLevel(LEVELS[1].need - CONFIG.atom.hysteresis - 0.01, 1, LEVELS, CONFIG.atom.hysteresis) === 0, '超出迟滞才退回低能级')
let monotonic = true
let prev = 0
for (let e = 0; e <= CONFIG.atom.energyMax; e += 0.004) {
  const lv = resolveLevel(e, prev, LEVELS, CONFIG.atom.hysteresis)
  if (lv < prev) monotonic = false
  prev = lv
}
ok(monotonic, '能量单调上升时能级只升不降')

log('\n-- 能量注入旋钮 --')
const knobCfg = { ...CONFIG.knob, max: CONFIG.atom.energyMax }
const slow = accumulateEnergy(0, 0.1, 0, knobCfg)
const fast = accumulateEnergy(0, 0.1, CONFIG.knob.speedRef, knobCfg)
ok(slow > 0 && fast > slow, '拖得越快注入越多', `${slow.toFixed(3)} < ${fast.toFixed(3)}`)
ok(accumulateEnergy(0, -0.1, 2, knobCfg) === 0, '逆时针拖到底泄能且有下限')
ok(accumulateEnergy(CONFIG.atom.energyMax, 1, 0, knobCfg) === CONFIG.atom.energyMax, '注入能量有上限')
let sum = 0
for (let i = 0; i < 40; i += 1) sum = accumulateEnergy(sum, 0.05, 3, knobCfg)
ok(sum > 0.6 && sum <= CONFIG.atom.energyMax, '连续顺时针对拉可累积到高能级', sum.toFixed(3))

log('\n-- 拖拽 → 震颤 / 涟漪 --')
ok(trembleFromSpeed(0, CONFIG.entangle.trembleRef, 1) === 0, '静止时震颤为 0')
ok(trembleFromSpeed(999, CONFIG.entangle.trembleRef, 1) === 1, '极快拖动时震颤饱和到 1')
ok(trembleFromSpeed(2, CONFIG.entangle.trembleRef, 1) < trembleFromSpeed(4, CONFIG.entangle.trembleRef, 1), '震颤随速度单调增强')
ok(Math.abs(shortestAngleDelta(0, Math.PI * 1.9) + Math.PI * 0.1) < 1e-9, '跨 ±π 的角差取最短路径')
ok(Math.abs(shortestAngleDelta(0.1, 0.3) - 0.2) < 1e-9, '普通角差计算正确')
ok(Math.abs(wrapTau(-0.5) - (Math.PI * 2 - 0.5)) < 1e-9, '角度归一化到 [0, 2π)')
let acc = 0
let fired = 0
for (let i = 0; i < 100; i += 1) {
  const r = rippleAccumulator(acc, 0.1, CONFIG.entangle.rippleGap)
  acc = r.acc
  if (r.fired) fired += 1
}
ok(fired === Math.floor((100 * 0.1) / CONFIG.entangle.rippleGap), '涟漪按累计弧度定量触发', `fired=${fired}`)

log('\n-- 贝尔不等式测试 --')
const mulberry32 = (a) => () => {
  a |= 0
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const A = CONFIG.bell.settingsA.map(degToRad)
const B = CONFIG.bell.settingsB.map(degToRad)
const corrQ = estimateCorrelations(A, B, 40000, sampleEntangledPair, mulberry32(20260919))
const SQ = Math.abs(chshValue(corrQ))
ok(Math.abs(SQ - CONFIG.bell.quantumLimit) < 0.03, '量子态多次测量收敛到 2√2 ≈ 2.828', SQ.toFixed(4))
ok(Math.abs(corrQ[0] + Math.cos(A[0] - B[0])) < 0.03, 'E(a,b) 收敛到 −cos(Δ)', corrQ[0].toFixed(4))
const corrL = estimateCorrelations(A, B, 40000, sampleLocalPair, mulberry32(7))
const SL = Math.abs(chshValue(corrL))
ok(SL <= 2.02, '局域隐变量模型不违反贝尔不等式（|S| ≤ 2）', SL.toFixed(4))
ok(SQ > SL, '量子关联显著强于局域模型', `${SQ.toFixed(3)} > ${SL.toFixed(3)}`)
let sameDir = 0
const rnd = mulberry32(99)
for (let i = 0; i < 20000; i += 1) {
  const p = sampleEntangledPair(A[0], B[0], rnd)
  if (p[0] === p[1]) sameDir += 1
}
const pSameTheory = Math.sin((A[0] - B[0]) / 2) ** 2
ok(Math.abs(sameDir / 20000 - pSameTheory) < 0.02, '同向概率 P(++)+P(−−) 符合 sin²(Δ/2)', `${(sameDir / 20000).toFixed(3)} vs ${pSameTheory.toFixed(3)}`)

log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILED'}`)
process.exit(fail === 0 ? 0 : 1)
