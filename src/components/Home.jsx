const PAGES = [
  {
    hash: '#/sandbox',
    title: '汽车工厂 · 三维数字沙盘',
    en: 'SMART PLANT SANDBOX',
    desc: '7 大车间 + 玻璃幕墙办公楼，车流人流实时运转。点击车间掀顶观看机械臂加工与 AGV 出入库作业。',
    tags: ['WebGL', 'three.js', '交互沙盘'],
    accent: '#3a8dff',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M4 40h40" />
        <path d="M8 40V22l8 5v-5l8 5v-5l8 5v13" />
        <path d="M10 22V12h6v7" />
        <path d="M36 40V16h6v24" />
        <path d="M38 16l3-6 3 6" />
      </svg>
    )
  },
  {
    hash: '#/connected',
    title: '万物联动 · Everything Connected',
    en: 'EVERYTHING CONNECTED',
    desc: 'GPU 驱动的沉浸式 AIoT 数字世界：万级粒子实时演算、设备节点互联成网，点击节点查看实时数据。',
    tags: ['WebGPU', 'WGSL', 'GPU 粒子'],
    accent: '#00e0ff',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <circle cx="24" cy="24" r="4" />
        <circle cx="10" cy="10" r="3" />
        <circle cx="38" cy="10" r="3" />
        <circle cx="10" cy="38" r="3" />
        <circle cx="38" cy="38" r="3" />
        <path d="M13 13l8 8M35 13l-8 8M13 35l8-8M35 35l-8-8" />
        <circle cx="24" cy="24" r="11" strokeDasharray="3 4" />
      </svg>
    )
  }
]

export default function Home() {
  return (
    <div className="home">
      <div className="home__grid" />
      <div className="home__glow home__glow--a" />
      <div className="home__glow home__glow--b" />

      <header className="home__brand">
        <div className="home__logo">万</div>
        <div>
          <h1 className="home__title">万里科技园 · 数字孪生平台</h1>
          <p className="home__subtitle">WANLI TECH PARK · DIGITAL TWIN PORTAL</p>
        </div>
      </header>

      <main className="home__cards">
        {PAGES.map((p) => (
          <a key={p.hash} className="home-card" href={p.hash} style={{ '--card-accent': p.accent }}>
            <span className="home-card__icon">{p.icon}</span>
            <h2 className="home-card__title">{p.title}</h2>
            <p className="home-card__en">{p.en}</p>
            <p className="home-card__desc">{p.desc}</p>
            <div className="home-card__tags">
              {p.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <span className="home-card__enter">
              进入场景
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 8h11M9 3l5 5-5 5" />
              </svg>
            </span>
          </a>
        ))}
      </main>

      <footer className="home__footer">
        <span>选择任一入口进入三维场景</span>
        <span className="home__footer-sep" />
        <span>支持 hash 直达：#/sandbox · #/connected</span>
      </footer>
    </div>
  )
}
