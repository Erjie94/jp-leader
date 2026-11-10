import { useTranslation } from 'react-i18next'

/** 顯示選擇題各選項註解（正解／錯因） */
export function ChoiceNotes({
  answer,
  selected,
  choiceExplanations,
}: {
  answer: string
  selected?: string | null
  choiceExplanations?: Record<string, string>
}) {
  const { t } = useTranslation()
  if (!choiceExplanations) return null

  const keys = Object.keys(choiceExplanations)
  if (!keys.length) return null

  const ordered = [
    ...(selected && choiceExplanations[selected] ? [selected] : []),
    ...(answer !== selected && choiceExplanations[answer] ? [answer] : []),
    ...keys.filter((k) => k !== selected && k !== answer),
  ]

  return (
    <div className="choice-notes muted" style={{ marginTop: '0.5rem' }}>
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{t('quiz.choiceNotes')}</div>
      <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
        {ordered.map((k) => (
          <li key={k}>
            <strong>{k}</strong>
            {k === answer ? `（${t('quiz.correctChoice')}）` : ''}
            {k === selected && k !== answer ? `（${t('quiz.yourChoice')}）` : ''}
            ：{choiceExplanations[k]}
          </li>
        ))}
      </ul>
    </div>
  )
}
