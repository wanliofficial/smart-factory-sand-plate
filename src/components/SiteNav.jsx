const NAV_ITEMS = [
  {
    id: 'world',
    zh: '万物联动',
    en: 'DIGITAL TWIN WORLD',
    icon: '◈',
  },
  {
    id: 'park',
    zh: '万里科技园',
    en: 'SMART PLANT SANDBOX',
    icon: '▣',
  },
  {
    id: 'energy',
    zh: '数智能源管理平台',
    en: 'ENERGY MANAGEMENT',
    icon: '⚡',
  },
  {
    id: 'crystal',
    zh: '晶体共振矩阵',
    en: 'CRYSTAL RESONANCE',
    icon: '❖',
  },
  {
    id: 'gears',
    zh: '逆时空齿轮轴',
    en: 'GEAR AXIS',
    icon: '⧗',
  },
  {
    id: 'quantum',
    zh: '纠缠之隙',
    en: 'QUANTUM OBSERVATORY',
    icon: '❋',
  },
  {
    id: 'city',
    zh: '万象织网',
    en: 'POINT CLOUD CITY',
    icon: '⬡',
  },
  {
    id: 'aiot',
    zh: 'AIoT 联动世界',
    en: 'AIOT CONNECTED WORLD',
    icon: '▦',
  },
]

const SUB_ROUTES = ['park', 'energy', 'crystal', 'gears', 'quantum', 'city', 'aiot']

export default function SiteNav() {
  const path = window.location.pathname.replace(/index\.html$/, '')
  const inSubRoute = SUB_ROUTES.some((r) => path.includes(`/${r}`))
  // 子目录页面（/park/、/energy/ …）需要回退一级才能到站点根
  const base = inSubRoute ? '../' : './'

  const currentId =
    NAV_ITEMS.find((item) => {
      if (item.id === 'world') return !inSubRoute
      return path.endsWith(`/${item.id}/`)
    })?.id ?? 'world'

  return (
    <nav className="ec-sitenav">
      <ul className="ec-sitenav-list">
        {NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <a
              className={`ec-sitenav-item${item.id === currentId ? ' is-active' : ''}`}
              href={item.id === 'world' ? `${base}index.html` : `${base}${item.id}/index.html`}
              aria-current={item.id === currentId ? 'page' : undefined}
            >
              <span className="ec-sitenav-icon">{item.icon}</span>
              <span className="ec-sitenav-text">
                <span className="ec-sitenav-zh">{item.zh}</span>
                <span className="ec-sitenav-en">{item.en}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
