import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { runOneTimeQuizScrub } from '../lib/bootstrap'

/** 啟動時僅做一次性維護；不再詢問／下載開源字典 */
export function AppBootstrap({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void (async () => {
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
