import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSettings } from '../context/SettingsContext'
import { bankStats } from '../lib/quiz-bank'
import { countDueReviews, getPracticeStats } from '../lib/db'

export function Home() {
  const { t } = useTranslation()
  const { settings } = useSettings()
  const [stats, setStats] = useState<{
    total: number
    correct: number
    accuracy: number
    byModule: Record<string, number>
  } | null>(null)
  const [banks, setBanks] = useState({ vocab: 0, phrase: 0 })
  const [due, setDue] = useState(0)

  useEffect(() => {
    void (async () => {
      setStats(await getPracticeStats(7))
      setBanks(await bankStats())
      setDue(await countDueReviews())
    })()
  }, [])

  const path = [
    {
      step: 1,
      to: '/kana',
      title: t('nav.kana'),
      desc: t('home.features.kana'),
      cta: t('home.startNow'),
      recommend: true,
    },
    {
      step: 2,
      to: '/vocab',
      title: t('nav.vocab'),
      desc: t('home.features.vocab'),
      cta: t('home.startNow'),
    },
    {
      step: 3,
      to: '/phrase',
      title: t('nav.phrase'),
      desc: t('home.features.phrase'),
      cta: t('home.startNow'),
    },
  ]

  return (
    <div className="stack">
      <section className="hero hero-compact">
        <div>
          <h1>{t('brand')}</h1>
          <p>{t('tagline')}</p>
          <p className="hero-meta">
            {t(`settings.${settings.language === 'ja' ? 'ja' : 'zhTW'}`)}
          </p>
          <div className="btn-row">
            <Link className="btn btn-accent" to="/kana">
              {t('home.recommended')}
            </Link>
            {due > 0 ? (
              <Link className="btn btn-ghost-light" to="/review">
                {t('home.todayReview', { n: due })}
              </Link>
            ) : (
              <Link className="btn btn-ghost-light" to="/settings">
                {t('nav.settings')}
              </Link>
            )}
          </div>
        </div>
        <div className="hero-side" aria-hidden>
          あ
          <br />
          ア
        </div>
      </section>

      {stats && (
        <section className="panel">
          <h2 className="section-title">{t('home.dashboardTitle')}</h2>
          <p className="muted" style={{ marginTop: 0 }}>{t('home.dashboardHint')}</p>
          <div className="stat-grid">
            <div>
              <strong>{stats.total}</strong>
              <span className="muted">{t('home.statTotal')}</span>
            </div>
            <div>
              <strong>{stats.accuracy}%</strong>
              <span className="muted">{t('home.statAccuracy')}</span>
            </div>
            <div>
              <strong>{due}</strong>
              <span className="muted">{t('home.statDue')}</span>
            </div>
            <div>
              <strong>{banks.vocab + banks.phrase}</strong>
              <span className="muted">{t('home.statBank')}</span>
            </div>
          </div>
          <p className="muted">
            {t('home.bankBreakdown', { vocab: banks.vocab, phrase: banks.phrase })}
          </p>
          <p className="muted">
            {t('home.moduleBreakdown', {
              kana: stats.byModule.kana ?? 0,
              vocab: stats.byModule.vocab ?? 0,
              phrase: stats.byModule.phrase ?? 0,
              review: stats.byModule.review ?? 0,
            })}
          </p>
          <Link className="btn" to="/review">{t('review.title')}</Link>
        </section>
      )}

      <section className="panel">
        <h2 className="section-title">{t('home.pathTitle')}</h2>
        <p className="muted" style={{ marginTop: 0 }}>{t('home.pathHint')}</p>
        <ol className="path-list">
          {path.map((item) => (
            <li key={item.to} className={item.recommend ? 'recommend' : undefined}>
              <div className="path-step">{item.step}</div>
              <div className="path-body">
                <strong>{item.title}</strong>
                <span>{item.desc}</span>
              </div>
              <Link className="btn" to={item.to}>
                {item.cta}
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
