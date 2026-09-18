// ============================================================
// Data Simulation — 生成模拟数据（节点、连接、粒子）
// 数据与渲染分离，可替换为真实 IoT 数据源
// ============================================================

// ============ 节点类型 ============
export const NODE_TYPE = {
  SMART_CITY: 0,
  SMART_FACTORY: 1,
  INDUSTRIAL_PARK: 2,
  DATA_CENTER: 3,
  WIND_FARM: 4,
  SOLAR_FARM: 5,
  LOGISTICS_CENTER: 6,
  AI_CORE: 7,
  IOT_GATEWAY: 8,
  SENSOR: 9,
  ENERGY_GRID: 10,
  VEHICLE: 11,
}

export const NODE_TYPE_NAMES = {
  0: 'smart_city',
  1: 'smart_factory',
  2: 'industrial_park',
  3: 'data_center',
  4: 'wind_farm',
  5: 'solar_farm',
  6: 'logistics_center',
  7: 'ai_core',
  8: 'iot_gateway',
  9: 'sensor',
  10: 'energy_grid',
  11: 'vehicle',
}

// ============ 确定性伪随机 ============
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ============ 经纬度 → 球面坐标 (y 向上, r=1) ============
function latLngToSphere(lat, lng) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return [
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ]
}

// ============ 主要节点（城市、工厂、数据中心等） ============
const MAJOR_NODE_DEFS = [
  // 智慧城市
  { type: NODE_TYPE.SMART_CITY, name: '北京 Beijing', lat: 39.9, lng: 116.4, size: 1.15 },
  { type: NODE_TYPE.SMART_CITY, name: '上海 Shanghai', lat: 31.2, lng: 121.5, size: 1.25 },
  { type: NODE_TYPE.SMART_CITY, name: '深圳 Shenzhen', lat: 22.5, lng: 114.1, size: 1.1 },
  { type: NODE_TYPE.SMART_CITY, name: '东京 Tokyo', lat: 35.7, lng: 139.7, size: 1.2 },
  { type: NODE_TYPE.SMART_CITY, name: '首尔 Seoul', lat: 37.6, lng: 127.0, size: 1.0 },
  { type: NODE_TYPE.SMART_CITY, name: '新加坡 Singapore', lat: 1.35, lng: 103.8, size: 1.0 },
  { type: NODE_TYPE.SMART_CITY, name: '纽约 New York', lat: 40.7, lng: -74.0, size: 1.3 },
  { type: NODE_TYPE.SMART_CITY, name: '洛杉矶 Los Angeles', lat: 34.1, lng: -118.2, size: 1.1 },
  { type: NODE_TYPE.SMART_CITY, name: '伦敦 London', lat: 51.5, lng: -0.1, size: 1.1 },
  { type: NODE_TYPE.SMART_CITY, name: '柏林 Berlin', lat: 52.5, lng: 13.4, size: 1.0 },
  { type: NODE_TYPE.SMART_CITY, name: '巴黎 Paris', lat: 48.9, lng: 2.3, size: 1.0 },
  { type: NODE_TYPE.SMART_CITY, name: '迪拜 Dubai', lat: 25.2, lng: 55.3, size: 1.0 },
  { type: NODE_TYPE.SMART_CITY, name: '悉尼 Sydney', lat: -33.9, lng: 151.2, size: 0.9 },
  { type: NODE_TYPE.SMART_CITY, name: '孟买 Mumbai', lat: 19.1, lng: 72.9, size: 1.0 },
  { type: NODE_TYPE.SMART_CITY, name: '圣保罗 São Paulo', lat: -23.5, lng: -46.6, size: 1.1 },
  { type: NODE_TYPE.SMART_CITY, name: '莫斯科 Moscow', lat: 55.8, lng: 37.6, size: 1.0 },
  { type: NODE_TYPE.SMART_CITY, name: '开罗 Cairo', lat: 30.0, lng: 31.2, size: 0.95 },

  // 智能工厂 / 工业园区
  { type: NODE_TYPE.SMART_FACTORY, name: '苏州工厂 Suzhou Factory', lat: 31.3, lng: 120.6, size: 0.85 },
  { type: NODE_TYPE.SMART_FACTORY, name: '广州工厂 Guangzhou Factory', lat: 23.1, lng: 113.3, size: 0.85 },
  { type: NODE_TYPE.SMART_FACTORY, name: '慕尼黑工厂 Munich Factory', lat: 48.1, lng: 11.6, size: 0.85 },
  { type: NODE_TYPE.SMART_FACTORY, name: '底特律工厂 Detroit Factory', lat: 42.3, lng: -83.0, size: 0.8 },
  { type: NODE_TYPE.SMART_FACTORY, name: '横滨工厂 Yokohama Factory', lat: 35.4, lng: 139.6, size: 0.8 },
  { type: NODE_TYPE.INDUSTRIAL_PARK, name: '长三角工业带 Yangtze Delta', lat: 31.8, lng: 120.0, size: 1.05 },
  { type: NODE_TYPE.INDUSTRIAL_PARK, name: '珠三角工业带 Pearl Delta', lat: 22.8, lng: 113.5, size: 0.95 },
  { type: NODE_TYPE.INDUSTRIAL_PARK, name: '鲁尔工业区 Ruhr District', lat: 51.5, lng: 7.0, size: 0.9 },

  // 数据中心
  { type: NODE_TYPE.DATA_CENTER, name: '张家口数据中心 Zhangjiakou DC', lat: 40.8, lng: 114.9, size: 0.85 },
  { type: NODE_TYPE.DATA_CENTER, name: '贵安数据中心 Guian DC', lat: 26.4, lng: 106.6, size: 0.85 },
  { type: NODE_TYPE.DATA_CENTER, name: '弗吉尼亚数据中心 Virginia DC', lat: 38.9, lng: -77.4, size: 0.95 },
  { type: NODE_TYPE.DATA_CENTER, name: '都柏林数据中心 Dublin DC', lat: 53.3, lng: -6.3, size: 0.8 },
  { type: NODE_TYPE.DATA_CENTER, name: '新加坡数据中心 Singapore DC', lat: 1.3, lng: 103.8, size: 0.8 },
  { type: NODE_TYPE.DATA_CENTER, name: '法兰克福数据中心 Frankfurt DC', lat: 50.1, lng: 8.7, size: 0.85 },

  // 能源
  { type: NODE_TYPE.WIND_FARM, name: '甘肃风电场 Gansu Wind', lat: 40.0, lng: 95.0, size: 0.85 },
  { type: NODE_TYPE.WIND_FARM, name: '北海风电场 North Sea Wind', lat: 55.0, lng: 5.0, size: 0.9 },
  { type: NODE_TYPE.WIND_FARM, name: '德州风电场 Texas Wind', lat: 32.0, lng: -102.0, size: 0.8 },
  { type: NODE_TYPE.WIND_FARM, name: '新疆风电场 Xinjiang Wind', lat: 43.8, lng: 87.6, size: 0.85 },
  { type: NODE_TYPE.SOLAR_FARM, name: '青海光伏电站 Qinghai Solar', lat: 36.6, lng: 101.8, size: 0.85 },
  { type: NODE_TYPE.SOLAR_FARM, name: '撒哈拉光伏 Sahara Solar', lat: 23.0, lng: 5.0, size: 0.95 },
  { type: NODE_TYPE.SOLAR_FARM, name: '加州光伏 California Solar', lat: 35.0, lng: -118.0, size: 0.8 },
  { type: NODE_TYPE.ENERGY_GRID, name: '国家电网 State Grid', lat: 35.0, lng: 105.0, size: 1.0 },
  { type: NODE_TYPE.ENERGY_GRID, name: '欧洲电网 European Grid', lat: 50.0, lng: 10.0, size: 0.95 },

  // 物流
  { type: NODE_TYPE.LOGISTICS_CENTER, name: '上海港 Shanghai Port', lat: 31.2, lng: 121.8, size: 0.85 },
  { type: NODE_TYPE.LOGISTICS_CENTER, name: '鹿特丹港 Rotterdam Port', lat: 51.9, lng: 4.5, size: 0.85 },
  { type: NODE_TYPE.LOGISTICS_CENTER, name: '洛杉矶港 LA Port', lat: 33.7, lng: -118.2, size: 0.8 },
  { type: NODE_TYPE.LOGISTICS_CENTER, name: '新加坡港 Singapore Port', lat: 1.28, lng: 103.85, size: 0.8 },
  { type: NODE_TYPE.LOGISTICS_CENTER, name: '宁波舟山港 Ningbo-Zhoushan', lat: 29.9, lng: 122.1, size: 0.85 },
]

const EARTH_RADIUS = 1.0

// ============ 生成主节点数据 ============
export function generateMajorNodes() {
  const rand = mulberry32(2024)
  return MAJOR_NODE_DEFS.map((def, i) => {
    const pos = latLngToSphere(def.lat, def.lng)
    const status = rand() > 0.08 ? 1.0 : (rand() > 0.5 ? 0.5 : 0.0) // online / warning / offline
    return {
      id: `major_${i.toString().padStart(3, '0')}`,
      type: def.type,
      name: def.name,
      position: pos.map(v => v * EARTH_RADIUS * 1.01),
      size: def.size,
      status,
      pulsePhase: rand() * Math.PI * 2,
      pulseSpeed: 0.8 + rand() * 1.5,
      latLng: [def.lat, def.lng],
      metrics: generateMetrics(def.type, rand),
      connections: [],
    }
  })
}

function generateMetrics(type, rand) {
  switch (type) {
    case NODE_TYPE.SMART_CITY:
      return {
        population: Math.floor(5e6 + rand() * 2e7),
        energy: 800 + rand() * 1200,
        traffic_flow: Math.floor(1e6 + rand() * 5e6),
        air_quality: 30 + rand() * 80,
        smart_devices: Math.floor(5e5 + rand() * 2e6),
      }
    case NODE_TYPE.SMART_FACTORY:
      return {
        output: 1000 + rand() * 3000,
        efficiency: 75 + rand() * 20,
        energy: 500 + rand() * 1500,
        machines_online: Math.floor(80 + rand() * 200),
        uptime: 3600 * 24 * (20 + rand() * 100),
      }
    case NODE_TYPE.DATA_CENTER:
      return {
        servers: Math.floor(1e4 + rand() * 1e5),
        power: 10 + rand() * 50,
        pue: 1.1 + rand() * 0.4,
        throughput: 100 + rand() * 500,
        latency: 5 + rand() * 20,
      }
    case NODE_TYPE.WIND_FARM:
      return {
        turbines: Math.floor(50 + rand() * 300),
        capacity: 100 + rand() * 500,
        output: 50 + rand() * 300,
        wind_speed: 5 + rand() * 15,
        efficiency: 30 + rand() * 40,
      }
    case NODE_TYPE.SOLAR_FARM:
      return {
        panels: Math.floor(1e4 + rand() * 5e5),
        capacity: 50 + rand() * 500,
        output: 20 + rand() * 300,
        irradiance: 500 + rand() * 700,
        efficiency: 18 + rand() * 8,
      }
    case NODE_TYPE.ENERGY_GRID:
      return {
        capacity: 10000 + rand() * 50000,
        load: 5000 + rand() * 30000,
        frequency: 49.5 + rand() * 1.0,
        voltage: 220 + rand() * 10,
        renewable_ratio: 20 + rand() * 50,
      }
    case NODE_TYPE.LOGISTICS_CENTER:
      return {
        throughput: Math.floor(1e4 + rand() * 1e5),
        containers: Math.floor(5e3 + rand() * 5e4),
        vessels_today: Math.floor(10 + rand() * 100),
        efficiency: 70 + rand() * 25,
        vehicles: Math.floor(100 + rand() * 1000),
      }
    default:
      return { status: 'active' }
  }
}

// ============ 生成大量传感器节点（球面分布） ============
export function generateSensorNodes(count = 2000) {
  const nodes = []
  const rand = mulberry32(42)

  for (let i = 0; i < count; i++) {
    // 斐波那契球面分布
    const phi = Math.acos(1 - 2 * (i + 0.5) / count)
    const theta = Math.PI * (1 + Math.sqrt(5)) * i
    const x = -Math.sin(phi) * Math.cos(theta) * EARTH_RADIUS * 1.005
    const y = Math.cos(phi) * EARTH_RADIUS * 1.005
    const z = Math.sin(phi) * Math.sin(theta) * EARTH_RADIUS * 1.005

    const r = rand()
    const type = r < 0.65 ? NODE_TYPE.SENSOR : r < 0.85 ? NODE_TYPE.IOT_GATEWAY : NODE_TYPE.VEHICLE

    nodes.push({
      id: `sensor_${i.toString().padStart(5, '0')}`,
      type,
      position: [x, y, z],
      status: rand() > 0.05 ? 1.0 : 0.0,
      pulsePhase: rand() * Math.PI * 2,
      pulseSpeed: 0.5 + rand() * 2.5,
      size: 0.3 + rand() * 0.4,
    })
  }
  return nodes
}

// ============ 生成连接 ============
function dist3(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function generateConnections(majorNodes) {
  const conns = []
  const rand = mulberry32(12345)

  const cities = majorNodes.filter(n => n.type === NODE_TYPE.SMART_CITY)
  const factories = majorNodes.filter(n => n.type === NODE_TYPE.SMART_FACTORY || n.type === NODE_TYPE.INDUSTRIAL_PARK)
  const dcs = majorNodes.filter(n => n.type === NODE_TYPE.DATA_CENTER)
  const energy = majorNodes.filter(n =>
    n.type === NODE_TYPE.WIND_FARM || n.type === NODE_TYPE.SOLAR_FARM || n.type === NODE_TYPE.ENERGY_GRID
  )
  const logistics = majorNodes.filter(n => n.type === NODE_TYPE.LOGISTICS_CENTER)

  // 城市 → 数据中心
  cities.forEach(city => {
    const sorted = [...dcs].sort((a, b) => dist3(city.position, a.position) - dist3(city.position, b.position))
    const n = 3 + Math.floor(rand() * 2)
    for (let i = 0; i < Math.min(n, sorted.length); i++) {
      conns.push(makeConn(city, sorted[i], 0, rand))
      city.connections.push(sorted[i].name)
      sorted[i].connections.push(city.name)
    }
  })

  // 工厂 → 最近 2 个城市
  factories.forEach(fac => {
    const sorted = [...cities].sort((a, b) => dist3(fac.position, a.position) - dist3(fac.position, b.position))
    for (let i = 0; i < Math.min(2, sorted.length); i++) {
      conns.push(makeConn(fac, sorted[i], 1, rand))
      fac.connections.push(sorted[i].name)
      sorted[i].connections.push(fac.name)
    }
  })

  // 数据中心骨干网（密集）
  for (let i = 0; i < dcs.length; i++) {
    for (let j = i + 1; j < dcs.length; j++) {
      if (rand() > 0.15) continue
      conns.push(makeConn(dcs[i], dcs[j], 2, rand))
    }
  }

  // 能源 ↔ 城市
  energy.forEach(e => {
    const nearby = [...cities].map(c => ({ c, d: dist3(e.position, c.position) }))
      .sort((a, b) => a.d - b.d).slice(0, 3)
    nearby.forEach(({ c }) => {
      if (rand() > 0.3) {
        conns.push(makeConn(e, c, 3, rand))
        e.connections.push(c.name)
        c.connections.push(e.name)
      }
    })
  })

  // 能源内部
  for (let i = 0; i < energy.length; i++) {
    for (let j = i + 1; j < energy.length; j++) {
      const d = dist3(energy[i].position, energy[j].position)
      if (d < 0.9 && rand() > 0.3) {
        conns.push(makeConn(energy[i], energy[j], 3, rand))
      }
    }
  }

  // 物流 ↔ 城市/工厂
  logistics.forEach(l => {
    const nearby = [...cities, ...factories]
      .map(n => ({ n, d: dist3(l.position, n.position) }))
      .sort((a, b) => a.d - b.d).slice(0, 4)
    nearby.forEach(({ n }) => {
      if (rand() > 0.25) {
        conns.push(makeConn(l, n, 4, rand))
        l.connections.push(n.name)
        n.connections.push(l.name)
      }
    })
  })

  return conns
}

// 传感器 → 最近主节点（汇聚型）
export function generateSensorConnections(sensorNodes, majorNodes, count = 300) {
  const conns = []
  const rand = mulberry32(98765)
  const shuffled = [...sensorNodes].sort(() => rand() - 0.5)
  const picks = shuffled.slice(0, count)
  for (const s of picks) {
    let nearest = null, nd = Infinity
    for (const m of majorNodes) {
      const d = dist3(s.position, m.position)
      if (d < nd) { nd = d; nearest = m }
    }
    if (nearest) conns.push(makeConn(s, nearest, 0, rand))
  }
  return conns
}

function makeConn(a, b, type, rand) {
  return {
    id: `conn_${a.id}_${b.id}`,
    fromId: a.id,
    toId: b.id,
    fromPos: a.position,
    toPos: b.position,
    type,
    bandwidth: 10 + rand() * 500,
    traffic: 0.2 + rand() * 0.8,
  }
}

// ============ 生成初始粒子数据 ============
// 粒子类型：0 大气粒子, 1 数据流粒子, 2 AI Core 粒子, 3 背景星尘
export const PARTICLE_TYPE = {
  ATMOSPHERE: 0,
  DATA_FLOW: 1,
  AI_CORE: 2,
  BACKGROUND: 3,
}

export function generateParticles(totalCount = 50000, majorNodes, connections) {
  const particles = []
  const rand = mulberry32(777)

  // 30% 大气粒子（围绕地球）
  const atmoCount = Math.floor(totalCount * 0.30)
  for (let i = 0; i < atmoCount; i++) {
    const u = rand()
    const v = rand()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    const r = EARTH_RADIUS * (1.02 + rand() * 0.08)
    const x = -r * Math.sin(phi) * Math.cos(theta)
    const y = r * Math.cos(phi)
    const z = r * Math.sin(phi) * Math.sin(theta)

    particles.push({
      position: [x, y, z],
      velocity: [0, 0, 0],
      color: [0.2, 0.6, 1.0],
      energy: rand() * 0.5 + 0.1,
      size: 1.0 + rand() * 2.0,
      seed: rand(),
      type: PARTICLE_TYPE.ATMOSPHERE,
    })
  }

  // 40% 数据流粒子（沿着连接运动）
  const flowCount = Math.floor(totalCount * 0.40)
  for (let i = 0; i < flowCount; i++) {
    const conn = connections[Math.floor(rand() * connections.length)]
    const t = rand()
    const from = conn.fromPos
    const to = conn.toPos
    // 球面弧线上的点
    const p = slerp(from, to, t)
    // 稍微抬离球面
    const np = normalize3(p)
    const r = EARTH_RADIUS * (1.015 + rand() * 0.01)

    particles.push({
      position: [np[0] * r, np[1] * r, np[2] * r],
      velocity: [0, 0, 0],
      color: connColor(conn.type),
      energy: rand() * 0.5 + 0.3,
      size: 1.5 + rand() * 2.0,
      seed: rand(),
      type: PARTICLE_TYPE.DATA_FLOW,
      connIndex: connections.indexOf(conn),
      progress: t,
      speed: 0.05 + rand() * 0.15,
    })
  }

  // 15% AI Core 粒子
  const aiCount = Math.floor(totalCount * 0.15)
  const aiCenter = [0, 2.2, 0]
  for (let i = 0; i < aiCount; i++) {
    const u = rand()
    const v = rand()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    const r = 0.1 + rand() * 0.5
    const x = aiCenter[0] + r * Math.sin(phi) * Math.cos(theta)
    const y = aiCenter[1] + r * Math.cos(phi)
    const z = aiCenter[2] + r * Math.sin(phi) * Math.sin(theta)

    particles.push({
      position: [x, y, z],
      velocity: [0, 0, 0],
      color: [0.0, 0.9, 1.0],
      energy: rand() * 0.6 + 0.2,
      size: 1.5 + rand() * 2.5,
      seed: rand(),
      type: PARTICLE_TYPE.AI_CORE,
    })
  }

  // 15% 背景星尘
  const bgCount = totalCount - atmoCount - flowCount - aiCount
  for (let i = 0; i < bgCount; i++) {
    const u = rand()
    const v = rand()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    const r = 5.0 + rand() * 5.0
    const x = r * Math.sin(phi) * Math.cos(theta)
    const y = r * Math.cos(phi)
    const z = r * Math.sin(phi) * Math.sin(theta)

    particles.push({
      position: [x, y, z],
      velocity: [0, 0, 0],
      color: [0.8, 0.9, 1.0],
      energy: rand() * 0.3 + 0.05,
      size: 0.5 + rand() * 1.5,
      seed: rand(),
      type: PARTICLE_TYPE.BACKGROUND,
    })
  }

  return particles
}

function normalize3(v) {
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
  return [v[0] / l, v[1] / l, v[2] / l]
}

function slerp(a, b, t) {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  const theta = Math.acos(dot) * t
  const sinTheta = Math.sin(theta)
  const sinTotal = Math.sin(Math.acos(dot)) || 1
  const s0 = Math.sin((1 - t) * Math.acos(dot)) / sinTotal
  const s1 = sinTheta / sinTotal
  return [a[0] * s0 + b[0] * s1, a[1] * s0 + b[1] * s1, a[2] * s0 + b[2] * s1]
}

function connColor(type) {
  switch (type) {
    case 0: return [0.3, 0.7, 1.0] // data (city→dc)
    case 1: return [1.0, 0.6, 0.2] // industrial
    case 2: return [0.6, 0.4, 1.0] // backbone
    case 3: return [1.0, 0.9, 0.3] // energy
    case 4: return [0.4, 0.8, 1.0] // logistics
    default: return [0.5, 0.8, 1.0]
  }
}
