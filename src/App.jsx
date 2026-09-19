import { useEffect, useState } from 'react'
import Home from './components/Home.jsx'
import Sandbox from './components/Sandbox.jsx'
import EverythingConnected from './components/EverythingConnected.jsx'

/** hash 路由：#/ 导航首页 · #/sandbox 汽车工厂沙盘 · #/connected 万物联动 */
const ROUTES = {
  '#/sandbox': Sandbox,
  '#/connected': EverythingConnected
}

const readHash = () => window.location.hash || '#/'

export default function App() {
  const [hash, setHash] = useState(readHash)

  useEffect(() => {
    const onChange = () => setHash(readHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const Page = ROUTES[hash]
  return Page ? <Page /> : <Home />
}
