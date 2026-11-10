import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSettings } from '../context/SettingsContext'
import { completeOnboarding, isOnboardingDone } from '../lib/onboarding'
import type { AppLanguage } from '../lib/settings'

export function Onboarding() {
  const { t, i18n } = useTranslation()
  const { settings, setLanguage } = useSettings()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [alreadyDone] = useState(() => isOnboardingDone())

  useEffect(() => {
    void i18n.changeLanguage(settings.language)
  }, [i18n, settings.language])

  if (alreadyDone) {
    return <Navigate to="/" replace />
  }

  const finish = (path = '/kana') => {
    completeOnboarding()
    navigate(path)
  }

  return (
    <div className="onboard-wrap">
      <div className="panel onboard-card">
        {step === 0 && (
          <>
            <div className="brand-name" style={{ fontSize: '2.4rem' }}>{t('brand')}</div>
            <p className="muted">{t('onboard.welcome')}</p>
            <p>{t('onboard.intro')}</p>
            <div className="btn-row">
              <button type="button" className="btn btn-accent" onClick={() => setStep(1)}>
                {t('onboard.next')}
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="page-title">{t('onboard.pickLang')}</h1>
            <div className="choice-list">
              {([
                ['zh-TW', t('settings.zhTW')],
                ['ja', t('settings.ja')],
              ] as const).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  className={`choice ${settings.language === code ? 'selected' : ''}`}
                  onClick={() => {
                    setLanguage(code as AppLanguage)
                    void i18n.changeLanguage(code)
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="btn-row">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>
                {t('common.back')}
              </button>
              <button type="button" className="btn btn-accent" onClick={() => setStep(2)}>
                {t('onboard.next')}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="page-title">{t('onboard.readyTitle')}</h1>
            <p>{t('onboard.readyBody')}</p>
            <ol className="path-list compact">
              <li>{t('nav.kana')} — {t('home.features.kana')}</li>
              <li>{t('nav.vocab')} — {t('home.features.vocab')}</li>
              <li>{t('nav.phrase')} — {t('home.features.phrase')}</li>
            </ol>
            <div className="btn-row">
              <button type="button" className="btn btn-accent" onClick={() => finish('/kana')}>
                {t('onboard.startKana')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => finish('/')}>
                {t('onboard.goHome')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
