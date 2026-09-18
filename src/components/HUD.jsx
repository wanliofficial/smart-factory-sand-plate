export default function HUD({ stats }) {
  return (
    <>
      <div className="ec-hud-top-left">
        <div className="ec-logo">
          <span className="ec-logo-mark">◈</span>
          <div className="ec-logo-text">
            <div className="ec-logo-title">万物联动</div>
            <div className="ec-logo-sub">EVERYTHING CONNECTED</div>
          </div>
        </div>
        <div className="ec-tagline">AIoT Digital Twin · Neural Network World</div>
      </div>

      <div className="ec-hud-top-right">
        <div className="ec-stat-card">
          <div className="ec-stat-label">FPS</div>
          <div className="ec-stat-value ec-fps">{stats.fps.toFixed(0)}</div>
        </div>
        <div className="ec-stat-card">
          <div className="ec-stat-label">粒子 Particles</div>
          <div className="ec-stat-value">{stats.particles.toLocaleString()}</div>
        </div>
        <div className="ec-stat-card">
          <div className="ec-stat-label">节点 Nodes</div>
          <div className="ec-stat-value">{stats.nodes.toLocaleString()}</div>
        </div>
        <div className="ec-stat-card">
          <div className="ec-stat-label">连接 Connections</div>
          <div className="ec-stat-value">{stats.connections.toLocaleString()}</div>
        </div>
      </div>

      <div className="ec-hud-bottom-left">
        <div className="ec-core-concepts">
          <div className="ec-concept">
            <span className="ec-concept-num">01</span>
            <span className="ec-concept-text">万物感知</span>
          </div>
          <div className="ec-concept">
            <span className="ec-concept-num">02</span>
            <span className="ec-concept-text">万物互联</span>
          </div>
          <div className="ec-concept">
            <span className="ec-concept-num">03</span>
            <span className="ec-concept-text">数据流动</span>
          </div>
          <div className="ec-concept">
            <span className="ec-concept-num">04</span>
            <span className="ec-concept-text">智能涌现</span>
          </div>
          <div className="ec-concept">
            <span className="ec-concept-num">05</span>
            <span className="ec-concept-text">万物协同</span>
          </div>
        </div>
      </div>

      <div className="ec-hud-bottom-right">
        <div className="ec-controls-hint">
          <div><span className="ec-key">拖拽</span> 旋转视角</div>
          <div><span className="ec-key">滚轮</span> 缩放</div>
          <div><span className="ec-key">点击</span> 查看节点</div>
        </div>
      </div>
    </>
  )
}
