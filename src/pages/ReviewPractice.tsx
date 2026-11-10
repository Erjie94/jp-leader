import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChoiceNotes } from '../components/ChoiceNotes'
import { FlagQuestionButton, QuestionBlock } from '../components/FlagQuestionButton'
import { PracticeHeader } from '../components/PracticeHeader'
import { SpeakButton } from '../components/SpeakButton'
import {
  listDueReviews,
  logPractice,
  markReviewCorrect,
  upsertReviewWrong,
  type ReviewItem,
} from '../lib/db'

export function ReviewPractice() {
  const { t } = useTranslation()
  const [queue, setQueue] = useState<ReviewItem[]>([])
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<'ok' | 'bad' | null>(null)
  const [phase, setPhase] = useState<'ready' | 'play' | 'done'>('ready')

  const refresh = useCallback(async () => {
    setQueue(await listDueReviews(30))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const start = () => {
    if (!queue.length) return
    setIndex(0)
    setSelected(null)
    setFeedback(null)
    setPhase('play')
  }

  const current = queue[index]

  const check = async () => {
    if (!current || !selected) return
    const ok = selected === current.answer
    setFeedback(ok ? 'ok' : 'bad')
    void logPractice({ module: 'review', correct: ok })
    if (ok) {
      await markReviewCorrect(current.id)
    } else {
      await upsertReviewWrong({
        kind: current.kind,
        prompt: current.prompt,
        sentence: current.sentence,
        answer: current.answer,
        choices: current.choices,
        explanation: current.explanation,
        mode: current.mode,
      })
    }
  }

  const next = async () => {
    if (index < queue.length - 1) {
      setIndex((i) => i + 1)
      setSelected(null)
      setFeedback(null)
    } else {
      setPhase('done')
      await refresh()
    }
  }

  return (
    <div className="panel stack">
      <PracticeHeader title={t('review.title')} hint={t('review.flowHint')} />

      {phase === 'ready' && (
        <>
          <div className="ready-card">
            <p>{t('review.dueCount', { n: queue.length })}</p>
            <p className="muted">{t('review.hint')}</p>
          </div>
          {queue.length ? (
            <button type="button" className="btn btn-accent btn-lg" onClick={start}>
              {t('review.start')}
            </button>
          ) : (
            <p className="muted">
              {t('review.empty')}{' '}
              <Link to="/vocab">{t('nav.vocab')}</Link>
              {' · '}
              <Link to="/phrase">{t('nav.phrase')}</Link>
              {' · '}
              <Link to="/reading">{t('nav.reading')}</Link>
            </p>
          )}
        </>
      )}

      {phase === 'play' && current && (
        <>
          <div className="play-toolbar">
            <button type="button" className="btn btn-ghost" onClick={() => setPhase('ready')}>
              {t('common.restart')}
            </button>
            {current.sentence && <SpeakButton text={current.sentence} />}
          </div>
          <QuestionBlock
            flag={(
              <FlagQuestionButton
                key={current.id}
                item={{
                  kind: current.kind,
                  mode: current.mode,
                  prompt: current.prompt,
                  sentence: current.sentence,
                  answer: current.answer,
                  choices: current.choices,
                  explanation: current.explanation,
                }}
                onFlagged={() => void next()}
              />
            )}
          >
            <div className="muted">
              {current.kind} · {index + 1}/{queue.length}
            </div>
            <p>{current.prompt}</p>
            {current.sentence && <div className="passage">{current.sentence}</div>}
            <div className="choice-list">
              {current.choices.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`choice ${selected === c ? 'selected' : ''}`}
                  onClick={() => {
                    setSelected(c)
                    setFeedback(null)
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className={`feedback ${feedback ?? ''}`}>
              {feedback === 'ok' && t('kana.correct')}
              {feedback === 'bad' && `${t('kana.wrong')} → ${current.answer}`}
            </div>
            {feedback && current.explanation && <p className="muted">{current.explanation}</p>}
            {feedback && (
              <ChoiceNotes
                answer={current.answer}
                selected={selected}
                choiceExplanations={current.choiceExplanations}
              />
            )}
          </QuestionBlock>
          <div className="btn-row">
            {!feedback ? (
              <button type="button" className="btn btn-accent" disabled={!selected} onClick={() => void check()}>
                {t('kana.submit')}
              </button>
            ) : (
              <button type="button" className="btn btn-accent" onClick={() => void next()}>
                {index < queue.length - 1 ? t('kana.next') : t('review.finish')}
              </button>
            )}
          </div>
        </>
      )}

      {phase === 'done' && (
        <>
          <p>{t('review.done')}</p>
          <button type="button" className="btn" onClick={() => setPhase('ready')}>
            {t('common.restart')}
          </button>
        </>
      )}
    </div>
  )
}
