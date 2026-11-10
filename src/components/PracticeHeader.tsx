import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface Props {
  title: string
  step?: number
  hint?: string
}

export function PracticeHeader({ title, step, hint }: Props) {
  const { t } = useTranslation()

  return (
    <div className="practice-header">
      <Link to="/" className="back-link">
        ← {t('common.backHome')}
      </Link>
      <div>
        {step != null && (
          <div className="step-badge">{t('home.stepLabel', { n: step })}</div>
        )}
        <h1 className="page-title" style={{ marginBottom: hint ? '0.35rem' : undefined }}>
          {title}
        </h1>
        {hint && <p className="muted" style={{ margin: 0 }}>{hint}</p>}
      </div>
    </div>
  )
}
