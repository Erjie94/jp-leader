import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App.tsx'
import { loadSettings } from './lib/settings'

const settings = loadSettings()
document.documentElement.lang = settings.language === 'ja' ? 'ja' : 'zh-Hant'

/** Electron file:// 下 Service Worker 預快取常觸發 Cache.add 網路錯誤，改卸載既有 SW */
function disableServiceWorkerInElectron() {
  const isElectron = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)
  if (!isElectron || !('serviceWorker' in navigator)) return
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) void reg.unregister()
  })
}

disableServiceWorkerInElectron()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
