import { createRoot } from 'react-dom/client'

// 先引站点级样式（含胶囊导航 .ec-sitenav 与基础重置），再引沙盘 HUD 样式覆盖全局底色
import '../styles.css'
import './styles.css'

import SiteNav from '../components/SiteNav.jsx'
import Sandbox from '../components/Sandbox.jsx'

function Park() {
  return (
    <div className="app">
      <SiteNav />
      <Sandbox />
    </div>
  )
}

createRoot(document.getElementById('root')).render(<Park />)
