import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { runOneTimeQuizScrub } from '../lib/bootstrap'
import { ensureLibraryLoaded } from '../lib/library-store'

/** 啟動時載入檔案題庫並做一次性維護 */
export function AppBootstrap({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void (async () => {
      await ensureLibraryLoaded()
      await runOneTimeQuizScrub()
      setReady(true)
    })()
  }, [])

  if (!ready) {
    return (
      <div className="onboard-wrap">
        <div className="panel onboard-card">
          <p className="muted">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
