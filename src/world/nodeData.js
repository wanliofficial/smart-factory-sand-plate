// ============================================================
// IoT Node Data — 节点模拟数据生成
// 数据与渲染分离，未来可替换为 MQTT / WebSocket 真实数据源
// ============================================================

// 节点类型定义
export const NODE_TYPES = {
  SMART_CITY: 'smart_city',
  SMART_FACTORY: 'smart_factory',
  INDUSTRIAL_PARK: 'industrial_park',
  DATA_CENTER: 'data_center',
  WIND_FARM: 'wind_farm',
  SOLAR_FARM: 'solar_farm',
  LOGISTICS_CENTER: 'logistics_center',
  AI_CORE: 'ai_core',
  IOT_GATEWAY: 'iot_gateway',
  SENSOR: 'sensor',
  ENERGY_GRID: 'energy_grid',
  VEHICLE: 'vehicle',
}

// 确定性伪随机
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 球面经纬度转 3D 坐标（y 向上）
function latLngToSphere(lat, lng, radius) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  const x = -radius * Math.sin(phi) * Math.cos(theta)
  const y = radius * Math.cos(phi)
  const z = radius * Math.sin(phi) * Math.sin(theta)
  return [x, y, z]
}

// 主要城市 / 节点位置（经纬度）
const MAJOR_NODES = [
  // 智慧城市
  { type: NODE_TYPES.SMART_CITY, name: '北京 Beijing', lat: 39.9, lng: 116.4, size: 1.2 },
  { type: NODE_TYPES.SMART_CITY, name: '上海 Shanghai', lat: 31.2, lng: 121.5, size: 1.3 },
  { type: NODE_TYPES.SMART_CITY, name: '深圳 Shenzhen', lat: 22.5, lng: 114.1, size: 1.1 },
  { type: NODE_TYPES.SMART_CITY, name: '东京 Tokyo', lat: 35.7, lng: 139.7, size: 1.2 },
  { type: NODE_TYPES.SMART_CITY, name: '首尔 Seoul', lat: 37.6, lng: 127.0, size: 1.0 },
  { type: NODE_TYPES.SMART_CITY, name: '新加坡 Singapore', lat: 1.35, lng: 103.8, size: 1.0 },
  { type: NODE_TYPES.SMART_CITY, name: '纽约 New York', lat: 40.7, lng: -74.0, size: 1.3 },
  { type: NODE_TYPES.SMART_CITY, name: '洛杉矶 LA', lat: 34.1, lng: -118.2, size: 1.1 },
  { type: NODE_TYPES.SMART_CITY, name: '伦敦 London', lat: 51.5, lng: -0.1, size: 1.1 },
  { type: NODE_TYPES.SMART_CITY, name: '柏林 Berlin', lat: 52.5, lng: 13.4, size: 1.0 },
  { type: NODE_TYPES.SMART_CITY, name: '巴黎 Paris', lat: 48.9, lng: 2.3, size: 1.0 },
  { type: NODE_TYPES.SMART_CITY, name: '迪拜 Dubai', lat: 25.2, lng: 55.3, size: 1.0 },
  { type: NODE_TYPES.SMART_CITY, name: '悉尼 Sydney', lat: -33.9, lng: 151.2, size: 0.9 },
  { type: NODE_TYPES.SMART_CITY, name: '孟买 Mumbai', lat: 19.1, lng: 72.9, size: 1.0 },
  { type: NODE_TYPES.SMART_CITY, name: '圣保罗 São Paulo', lat: -23.5, lng: -46.6, size: 1.1 },

  // 智能工厂 / 工业园区
  { type: NODE_TYPES.SMART_FACTORY, name: '苏州工厂 Suzhou Factory', lat: 31.3, lng: 120.6, size: 0.9 },
  { type: NODE_TYPES.SMART_FACTORY, name: '广州工厂 Guangzhou Factory', lat: 23.1, lng: 113.3, size: 0.9 },
  { type: NODE_TYPES.SMART_FACTORY, name: '慕尼黑工厂 Munich Factory', lat: 48.1, lng: 11.6, size: 0.9 },
  { type: NODE_TYPES.SMART_FACTORY, name: '底特律工厂 Detroit Factory', lat: 42.3, lng: -83.0, size: 0.8 },
  { type: NODE_TYPES.SMART_FACTORY, name: '横滨工厂 Yokohama Factory', lat: 35.4, lng: 139.6, size: 0.85 },
  { type: NODE_TYPES.INDUSTRIAL_PARK, name: '长三角工业带 Yangtze Delta', lat: 31.8, lng: 120.0, size: 1.1 },
  { type: NODE_TYPES.INDUSTRIAL_PARK, name: '珠三角工业带 Pearl Delta', lat: 22.8, lng: 113.5, size: 1.0 },
  { type: NODE_TYPES.INDUSTRIAL_PARK, name: '鲁尔工业区 Ruhr', lat: 51.5, lng: 7.0, size: 0.95 },

  // 数据中心
  { type: NODE_TYPES.DATA_CENTER, name: '张家口数据中心 Zhangjiakou DC', lat: 40.8, lng: 114.9, size: 0.9 },
  { type: NODE_TYPES.DATA_CENTER, name: '贵安数据中心 Gui\'an DC', lat: 26.4, lng: 106.6, size: 0.9 },
  { type: NODE_TYPES.DATA_CENTER, name: '弗吉尼亚数据中心 Virginia DC', lat: 38.9, lng: -77.4, size: 1.0 },
  { type: NODE_TYPES.DATA_CENTER, name: '都柏林数据中心 Dublin DC', lat: 53.3, lng: -6.3, size: 0.85 },
  { type: NODE_TYPES.DATA_CENTER, name: '新加坡数据中心 Singapore DC', lat: 1.3, lng: 103.8, size: 0.85 },

  // 能源
  { type: NODE_TYPES.WIND_FARM, name: '甘肃风电场 Gansu Wind', lat: 40.0, lng: 95.0, size: 0.9 },
  { type: NODE_TYPES.WIND_FARM, name: '北海风电场 North Sea Wind', lat: 55.0, lng: 5.0, size: 0.95 },
  { type: NODE_TYPES.WIND_FARM, name: '德州风电场 Texas Wind', lat: 32.0, lng: -102.0, size: 0.85 },
  { type: NODE_TYPES.SOLAR_FARM, name: '青海光伏电站 Qinghai Solar', lat: 36.6, lng: 101.8, size: 0.9 },
  { type: NODE_TYPES.SOLAR_FARM, name: '撒哈拉光伏 Sahara Solar', lat: 23.0, lng: 5.0, size: 1.0 },
  { type: NODE_TYPES.SOLAR_FARM, name: '加州光伏 California Solar', lat: 35.0, lng: -118.0, size: 0.85 },
  { type: NODE_TYPES.ENERGY_GRID, name: '国家电网 State Grid', lat: 35.0, lng: 105.0, size: 1.1 },
  { type: NODE_TYPES.ENERGY_GRID, name: '欧洲电网 European Grid', lat: 50.0, lng: 10.0, size: 1.0 },

  // 物流
  { type: NODE_TYPES.LOGISTICS_CENTER, name: '上海港 Shanghai Port', lat: 31.2, lng: 121.8, size: 0.9 },
  { type: NODE_TYPES.LOGISTICS_CENTER, name: '鹿特丹港 Rotterdam Port', lat: 51.9, lng: 4.5, size: 0.9 },
  { type: NODE_TYPES.LOGISTICS_CENTER, name: '洛杉矶港 LA Port', lat: 33.7, lng: -118.2, size: 0.85 },
  { type: NODE_TYPES.LOGISTICS_CENTER, name: '新加坡港 Singapore Port', lat: 1.28, lng: 103.85, size: 0.85 },
]

const EARTH_RADIUS = 1.0

// 生成主节点数据
export function generateMajorNodes() {
  return MAJOR_NODES.map((node, index) => {
    const [x, y, z] = latLngToSphere(node.lat, node.lng, EARTH_RADIUS * 1.01)
    return {
      id: `node_${index.toString().padStart(4, '0')}`,
      type: node.type,
      name: node.name,
      position: [x, y, z],
      latLng: [node.lat, node.lng],
      size: node.size,
      status: Math.random() > 0.1 ? 'online' : (Math.random() > 0.5 ? 'warning' : 'offline'),
      metrics: generateMetricsForType(node.type),
      connections: [],
    }
  })
}

// 为不同类型节点生成指标
function generateMetricsForType(type) {
  const rand = Math.random()
  switch (type) {
    case NODE_TYPES.SMART_CITY:
      return {
        population: Math.floor(5000000 + rand * 20000000),
        energy: 800 + rand * 1200,
        traffic_flow: Math.floor(1000000 + rand * 5000000),
        air_quality: 30 + rand * 80,
        smart_devices: Math.floor(500000 + rand * 2000000),
      }
    case NODE_TYPES.SMART_FACTORY:
      return {
        output: 1000 + rand * 3000,
        efficiency: 75 + rand * 20,
        energy: 500 + rand * 1500,
        machines_online: Math.floor(80 + rand * 200),
        uptime: 3600 * 24 * (20 + rand * 100),
      }
    case NODE_TYPES.DATA_CENTER:
      return {
        servers: Math.floor(10000 + rand * 100000),
        power: 10 + rand * 50,
        pue: 1.1 + rand * 0.4,
        throughput: 100 + rand * 500,
        latency: 5 + rand * 20,
      }
    case NODE_TYPES.WIND_FARM:
      return {
        turbines: Math.floor(50 + rand * 300),
        capacity: 100 + rand * 500,
        output: 50 + rand * 300,
        wind_speed: 5 + rand * 15,
        efficiency: 30 + rand * 40,
      }
    case NODE_TYPES.SOLAR_FARM:
      return {
        panels: Math.floor(10000 + rand * 500000),
        capacity: 50 + rand * 500,
        output: 20 + rand * 300,
        irradiance: 500 + rand * 700,
        efficiency: 18 + rand * 8,
      }
    case NODE_TYPES.ENERGY_GRID:
      return {
        capacity: 10000 + rand * 50000,
        load: 5000 + rand * 30000,
        frequency: 49.5 + rand * 1.0,
        voltage: 220 + rand * 10,
        renewable_ratio: 20 + rand * 50,
      }
    case NODE_TYPES.LOGISTICS_CENTER:
      return {
        throughput: Math.floor(10000 + rand * 100000),
        containers: Math.floor(5000 + rand * 50000),
        vessels_today: Math.floor(10 + rand * 100),
        efficiency: 70 + rand * 25,
        vehicles: Math.floor(100 + rand * 1000),
      }
    default:
      return { temperature: 20 + rand * 10, status: 'active' }
  }
}

// 生成大量 IoT 传感器节点（在全球表面分布）
export function generateSensorNodes(count = 2000) {
  const rand = mulberry32(42)
  const nodes = []

  for (let i = 0; i < count; i++) {
    // 斐波那契球面分布
    const phi = Math.acos(1 - 2 * (i + 0.5) / count)
    const theta = Math.PI * (1 + Math.sqrt(5)) * i

    const x = -EARTH_RADIUS * Math.sin(phi) * Math.cos(theta) * 1.005
    const y = EARTH_RADIUS * Math.cos(phi) * 1.005
    const z = EARTH_RADIUS * Math.sin(phi) * Math.sin(theta) * 1.005

    const types = [NODE_TYPES.SENSOR, NODE_TYPES.IOT_GATEWAY, NODE_TYPES.VEHICLE]
    const typeWeights = [0.7, 0.2, 0.1]
    let r = rand()
    let type = types[0]
    for (let j = 0; j < typeWeights.length; j++) {
      if (r < typeWeights[j]) { type = types[j]; break }
      r -= typeWeights[j]
    }

    nodes.push({
      id: `sensor_${i.toString().padStart(6, '0')}`,
      type,
      position: [x, y, z],
      status: rand() > 0.05 ? 'online' : 'offline',
      pulsePhase: rand() * Math.PI * 2,
      pulseSpeed: 0.5 + rand() * 2,
    })
  }
  return nodes
}

// 生成网络连接
export function generateConnections(majorNodes, sensorNodes) {
  const connections = []
  const rand = mulberry32(12345)

  // AI Core 连接所有数据中心
  const dataCenters = majorNodes.filter(n => n.type === NODE_TYPES.DATA_CENTER)
  const cities = majorNodes.filter(n => n.type === NODE_TYPES.SMART_CITY)
  const factories = majorNodes.filter(n =>
    n.type === NODE_TYPES.SMART_FACTORY || n.type === NODE_TYPES.INDUSTRIAL_PARK
  )
  const energy = majorNodes.filter(n =>
    n.type === NODE_TYPES.WIND_FARM ||
    n.type === NODE_TYPES.SOLAR_FARM ||
    n.type === NODE_TYPES.ENERGY_GRID
  )
  const logistics = majorNodes.filter(n => n.type === NODE_TYPES.LOGISTICS_CENTER)

  // 每个城市连接 2-3 个数据中心
  cities.forEach((city) => {
    const numConns = 2 + Math.floor(rand() * 2)
    const shuffled = [...dataCenters].sort(() => rand() - 0.5)
    for (let i = 0; i < Math.min(numConns, shuffled.length); i++) {
      connections.push({
        id: `conn_city_dc_${connections.length}`,
        from: city.id,
        to: shuffled[i].id,
        fromPos: city.position,
        toPos: shuffled[i].position,
        type: 'data',
        bandwidth: 10 + rand() * 100,
        traffic: 0.3 + rand() * 0.7,
      })
      city.connections.push(shuffled[i].name)
      shuffled[i].connections.push(city.name)
    }
  })

  // 每个工厂连接到最近的城市和数据中心
  factories.forEach((factory) => {
    let nearestCity = null
    let nearestDist = Infinity
    cities.forEach((city) => {
      const d = distance3D(factory.position, city.position)
      if (d < nearestDist) { nearestDist = d; nearestCity = city }
    })
    if (nearestCity) {
      connections.push({
        id: `conn_factory_city_${connections.length}`,
        from: factory.id,
        to: nearestCity.id,
        fromPos: factory.position,
        toPos: nearestCity.position,
        type: 'industrial',
        bandwidth: 5 + rand() * 50,
        traffic: 0.2 + rand() * 0.6,
      })
      factory.connections.push(nearestCity.name)
      nearestCity.connections.push(factory.name)
    }
  })

  // 能源网络内部连接
  for (let i = 0; i < energy.length; i++) {
    for (let j = i + 1; j < energy.length; j++) {
      if (rand() > 0.5) continue
      const d = distance3D(energy[i].position, energy[j].position)
      if (d < 0.8) {
        connections.push({
          id: `conn_energy_${connections.length}`,
          from: energy[i].id,
          to: energy[j].id,
          fromPos: energy[i].position,
          toPos: energy[j].position,
          type: 'energy',
          bandwidth: 10 + rand() * 100,
          traffic: 0.4 + rand() * 0.6,
        })
      }
    }
  }

  // 能源 → 城市
  energy.forEach((e) => {
    const nearbyCities = cities
      .map(c => ({ c, d: distance3D(e.position, c.position) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
    nearbyCities.forEach(({ c }) => {
      if (rand() > 0.3) {
        connections.push({
          id: `conn_energy_city_${connections.length}`,
          from: e.id,
          to: c.id,
          fromPos: e.position,
          toPos: c.position,
          type: 'energy',
          bandwidth: 20 + rand() * 80,
          traffic: 0.5 + rand() * 0.5,
        })
        e.connections.push(c.name)
        c.connections.push(e.name)
      }
    })
  })

  // 物流 ↔ 城市
  logistics.forEach((l) => {
    const nearby = [...cities, ...factories]
      .map(n => ({ n, d: distance3D(l.position, n.position) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
    nearby.forEach(({ n }) => {
      if (rand() > 0.3) {
        connections.push({
          id: `conn_logistics_${connections.length}`,
          from: l.id,
          to: n.id,
          fromPos: l.position,
          toPos: n.position,
          type: 'logistics',
          bandwidth: 5 + rand() * 30,
          traffic: 0.3 + rand() * 0.5,
        })
      }
    })
  })

  // 数据中心之间形成骨干网
  for (let i = 0; i < dataCenters.length; i++) {
    for (let j = i + 1; j < dataCenters.length; j++) {
      if (rand() > 0.35) continue
      connections.push({
        id: `conn_backbone_${connections.length}`,
        from: dataCenters[i].id,
        to: dataCenters[j].id,
        fromPos: dataCenters[i].position,
        toPos: dataCenters[j].position,
        type: 'backbone',
        bandwidth: 100 + rand() * 500,
        traffic: 0.6 + rand() * 0.4,
      })
    }
  }

  return connections
}

function distance3D(a, b) {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

// AI Core 位置（地球正上方）
export const AI_CORE_POSITION = [0, 2.2, 0]

// 粒子类型
export const PARTICLE_TYPES = {
  DATA_FLOW: 0,
  EARTH_ATMOSPHERE: 1,
  AI_CORE: 2,
  NETWORK_PULSE: 3,
  BACKGROUND_STAR: 4,
}
