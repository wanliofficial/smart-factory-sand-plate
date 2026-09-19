import { useEffect, useRef, useState } from 'react'
import { createWorld } from '../world/world.js'
import InfoPanel from './InfoPanel.jsx'
import HUD from './HUD.jsx'
import SiteNav from './SiteNav.jsx'

export default function EverythingConnected() {
  const canvasRef = useRef(null)
  const worldRef = useRef(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [stats, setStats] = useState({ fps: 0, particles: 0, nodes: 0, connections: 0 })
  const [webgpuSupported, setWebgpuSupported] = useState(true)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let disposed = false

    createWorld({
      canvas,
      onStats: (s) => setStats(s),
      onSelectNode: (node) => setSelectedNode(node),
    }).then((world) => {
      if (disposed) {
        world.dispose()
        return
      }
      worldRef.current = world
    }).catch((err) => {
      console.error('Failed to create world:', err)
      setWebgpuSupported(false)
    })

    return () => {
      disposed = true
      worldRef.current?.dispose()
    }
  }, [])

  return (
    <div className="ec-container">
      <canvas ref={canvasRef} className="ec-canvas" />
      <a className="back-home" href="#/">← 返回首页</a>
      <HUD stats={stats} />
      <SiteNav />
      <InfoPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
      {!webgpuSupported && (
        <div className="ec-error">
          <h2>WebGPU not supported</h2>
          <p>Your browser does not support WebGPU. Please use a modern browser like Chrome or Edge.</p>
        </div>
      )}
    </div>
  )
}
