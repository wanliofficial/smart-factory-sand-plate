import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createSandbox } from '../three/createSandbox.js'

const ACTIONS = [
  { key: 'reset', label: '复位视角', hint: '回到初始三点透视' },
  { key: 'top', label: '俯瞰总平', hint: '正俯视园区路网与车间分区' },
  { key: 'side', label: '正视平角', hint: '贴近人眼高度看厂区' },
  { key: 'rotate', label: '自动巡览', hint: '镜头环绕园区', toggle: true },
  { key: 'traffic', label: '厂内车流', hint: '显示 / 隐藏道路上往返的车辆', toggle: true },
  { key: 'people', label: '人员走动', hint: '显示 / 隐藏办公楼进出人流', toggle: true },
  { key: 'labels', label: '空间标注', hint: '显示 / 隐藏车间标签', toggle: true }
]

export default function Sandbox() {
  const hostRef = useRef(null)
  const apiRef = useRef(null)
  const [zone, setZone] = useState(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [toggles, setToggles] = useState({ rotate: false, labels: true, traffic: true, people: true })

  useEffect(() => {
    if (!hostRef.current) return
    let api = null
    try {
      api = createSandbox(hostRef.current)
      api.onZoneChange((zi) => setZone(zi >= 0 ? api.zones[zi] : null))
      api.onAutoRotateChange((v) => setToggles((s) => (s.rotate === v ? s : { ...s, rotate: v })))
      apiRef.current = api
      setReady(true)
    } catch (e) {
      console.error(e)
      setError(e?.message || String(e))
    }
    return () => {
      api?.dispose()
      apiRef.current = null
    }
  }, [])

  const handleAction = useCallback((key) => {
    const api = apiRef.current
    if (!api) return
    if (key === 'reset') api.resetView()
    else if (key === 'top') api.topView()
    else if (key === 'side') api.sideView()
    else if (key === 'rotate') {
      setToggles((s) => {
        const next = !s.rotate
        api.setAutoRotate(next)
        return { ...s, rotate: next }
      })
    } else if (key === 'traffic') {
      setToggles((s) => {
        const next = !s.traffic
        api.setTrafficVisible(next)
        return { ...s, traffic: next }
      })
    } else if (key === 'people') {
      setToggles((s) => {
        const next = !s.people
        api.setPeopleVisible(next)
        return { ...s, people: next }
      })
    } else if (key === 'labels') {
      setToggles((s) => {
        const next = !s.labels
        api.setLabelsVisible(next)
        return { ...s, labels: next }
      })
    }
  }, [])

  return (
    <div className="stage">
      <div className="stage__canvas" ref={hostRef} />

      {!ready && !error && (
        <div className="loader">
          <div className="loader__ring" />
          <p>正在构建三维沙盘…</p>
        </div>
      )}

      {error && (
        <div className="loader loader--error">
          <p>三维场景初始化失败</p>
          <code>{error}</code>
        </div>
      )}

      {/* ------- 顶部标题 HUD ------- */}
      <header className="hud hud--top">
        <div className="brand">
          <span className="brand__mark" />
          <div>
            <h1>汽车工厂 · 数字沙盘</h1>
            <p>SMART AUTOMOTIVE PLANT DIGITAL TWIN</p>
          </div>
        </div>
        <a className="back-home back-home--light" href="#/">← 返回首页</a>
        <div className="stat">
          <span className="stat__dot" />
          <span>实时在线</span>
          <b>7</b>
          <span>大车间</span>
          <i className="stat__sep" />
          <b>1</b>
          <span>办公楼</span>
          <i className="stat__sep" />
          <b>3</b>
          <span>车在途</span>
        </div>
      </header>

      {/* ------- 左侧操作说明 ------- */}
      <aside className="hud hud--hints">
        <h2>空间交互</h2>
        <ul>
          <li>
            <kbd>左键拖拽</kbd>
            <span>环绕 / 旋转镜头</span>
          </li>
          <li>
            <kbd>滚轮</kbd>
            <span>拉近 / 推远缩放</span>
          </li>
          <li>
            <kbd>右键拖拽</kbd>
            <span>平移画面视角</span>
          </li>
          <li>
            <kbd>点击车间</kbd>
            <span>掀开屋顶看产线</span>
          </li>
        </ul>
        <p className="hints__note">压膜 → 焊接 → 喷漆 → 组装，物料 / 座椅 / 发动机三大车间按序直供总装线。</p>
      </aside>

      {/* ------- 右侧工具条 ------- */}
      <aside className="hud hud--tools">
        {ACTIONS.map((a) => {
          const on = a.toggle ? toggles[a.key] : false
          return (
            <button
              key={a.key}
              type="button"
              className={`tool ${on ? 'is-on' : ''}`}
              onClick={() => handleAction(a.key)}
              title={a.hint}
            >
              <span>{a.label}</span>
              {a.toggle && <i className="tool__sw" />}
            </button>
          )
        })}
      </aside>

      {/* ------- 底部信息卡 ------- */}
      <footer className="hud hud--info">
        {zone ? (
          <>
            <h3>{zone.name}</h3>
            <p>{zone.desc}</p>
            <button type="button" className="ghost" onClick={() => handleAction('reset')}>
              退出聚焦
            </button>
          </>
        ) : (
          <>
            <h3>园区总览</h3>
            <p>
              7 个生产车间与 1 栋办公楼沿厂区道路分左右两侧布置，道路上车流往返，办公楼门口员工持续进出。拖动鼠标浏览，
              点击任意车间可掀开屋顶，观看机械臂加工与 AGV 出入库作业。
            </p>
          </>
        )}
      </footer>
    </div>
  )
}
