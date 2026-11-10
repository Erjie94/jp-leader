import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { useModel } from '../context/ModelContext'

export function Layout() {
  const { t } = useTranslation()
  const model = useModel()
  const location = useLocation()
  const [online, setOnline] = useState(navigator.onLine)
  const isOnboarding = location.pathname === '/welcome'

  const modelLabel =
    model.status === 'ready'
      ? t('settings.modelReady')
      : model.status === 'loading'
        ? t('settings.progress', { p: model.progress })
        : model.status === 'unavailable'
          ? t('common.offline')
          : t('settings.modelIdle')

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const links = [
    ['/', 'nav.home', '1'],
    ['/kana', 'nav.kana', 'あ'],
    ['/vocab', 'nav.vocab', '語'],
    ['/phrase', 'nav.phrase', '句'],
    ['/reading', 'nav.reading', '読'],
    ['/review', 'nav.review', '復'],
    ['/settings', 'nav.settings', '設'],
  ] as const

  if (isOnboarding) {
    return (
      <div className="app-shell">
        <Outlet />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <div className="brand-name">{t('brand')}</div>
          <div className="brand-sub">{t('brandSub')}</div>
        </NavLink>
        <nav className="nav" aria-label="main">
          {links.map(([to, key, mark]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              <span className="nav-mark" aria-hidden>{mark}</span>
              {t(key)}
            </NavLink>
          ))}
        </nav>
        <div className="status-pill">
          {online ? t('common.online') : t('common.offline')} · AI {modelLabel}
        </div>
      </header>
      <Outlet />
    </div>
  )
}
