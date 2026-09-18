const TYPE_LABELS = {
  smart_city: { label: '智慧城市', en: 'Smart City', icon: '🏙' },
  smart_factory: { label: '智能工厂', en: 'Smart Factory', icon: '🏭' },
  industrial_park: { label: '工业园区', en: 'Industrial Park', icon: '⚙' },
  data_center: { label: '数据中心', en: 'Data Center', icon: '▦' },
  wind_farm: { label: '风力发电场', en: 'Wind Farm', icon: '↯' },
  solar_farm: { label: '光伏电站', en: 'Solar Farm', icon: '☀' },
  logistics_center: { label: '物流中心', en: 'Logistics Center', icon: '⛟' },
  ai_core: { label: 'AI 智能核心', en: 'Intelligence Core', icon: '◈' },
  iot_gateway: { label: 'IoT 网关', en: 'IoT Gateway', icon: '◉' },
  sensor: { label: '传感器节点', en: 'Sensor Node', icon: '◌' },
  energy_grid: { label: '能源网络', en: 'Energy Grid', icon: '⚡' },
  vehicle: { label: '自动驾驶车辆', en: 'Autonomous Vehicle', icon: '🚗' },
}

export default function InfoPanel({ node, onClose }) {
  if (!node) return null

  const typeInfo = TYPE_LABELS[node.type] || { label: node.type, en: node.type, icon: '●' }

  const metrics = node.metrics || {}
  const metricEntries = Object.entries(metrics)

  return (
    <div className="ec-info-panel">
      <div className="ec-info-header">
        <div className="ec-info-icon">{typeInfo.icon}</div>
        <div className="ec-info-titles">
          <div className="ec-info-name">{node.name || typeInfo.label}</div>
          <div className="ec-info-type">{typeInfo.en}</div>
        </div>
        <button className="ec-info-close" onClick={onClose}>✕</button>
      </div>

      <div className="ec-info-status">
        <span className={`ec-status-dot ec-status-${node.status || 'online'}`} />
        <span className="ec-status-text">
          {node.status === 'online' ? '在线运行 Online' :
           node.status === 'warning' ? '告警 Warning' :
           node.status === 'offline' ? '离线 Offline' : '运行中 Active'}
        </span>
      </div>

      <div className="ec-info-section">
        <div className="ec-section-title">实时指标 / Real-time Metrics</div>
        <div className="ec-metrics-grid">
          {metricEntries.length > 0 ? metricEntries.map(([key, value]) => (
            <div key={key} className="ec-metric-item">
              <div className="ec-metric-label">{formatMetricKey(key)}</div>
              <div className="ec-metric-value">
                {typeof value === 'number' ? formatMetricValue(key, value) : String(value)}
              </div>
            </div>
          )) : (
            <div className="ec-metric-empty">暂无指标数据</div>
          )}
        </div>
      </div>

      <div className="ec-info-section">
        <div className="ec-section-title">网络连接 / Connections</div>
        <div className="ec-connections-list">
          {(node.connections || []).slice(0, 6).map((conn, i) => (
            <div key={i} className="ec-connection-item">
              <span className="ec-conn-arrow">→</span>
              <span className="ec-conn-target">{conn}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ec-info-id">ID: {node.id}</div>
    </div>
  )
}

function formatMetricKey(key) {
  const map = {
    temperature: '温度 Temperature',
    humidity: '湿度 Humidity',
    pressure: '压力 Pressure',
    energy: '能耗 Energy',
    power: '功率 Power',
    throughput: '吞吐量 Throughput',
    latency: '延迟 Latency',
    uptime: '运行时长 Uptime',
    cpu: 'CPU 使用率',
    memory: '内存使用率',
    network: '网络流量 Network',
    co2: 'CO₂ 浓度',
    pm25: 'PM2.5',
    speed: '速度 Speed',
    status: '状态 Status',
    output: '产量 Output',
    efficiency: '效率 Efficiency',
    load: '负载 Load',
    requests: '请求数 Requests',
    connections: '连接数 Connections',
  }
  return map[key] || key
}

function formatMetricValue(key, value) {
  const units = {
    temperature: '°C',
    humidity: '%',
    pressure: 'kPa',
    energy: 'kWh',
    power: 'MW',
    throughput: 'GB/s',
    latency: 'ms',
    cpu: '%',
    memory: '%',
    network: 'Gbps',
    co2: 'ppm',
    pm25: 'μg/m³',
    speed: 'km/h',
    efficiency: '%',
    load: '%',
  }
  const unit = units[key] || ''
  if (key === 'uptime') return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`
  return `${value.toFixed(value < 10 ? 2 : 0)} ${unit}`.trim()
}
