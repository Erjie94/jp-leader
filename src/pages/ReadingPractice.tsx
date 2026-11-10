import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlagQuestionButton, QuestionBlock } from '../components/FlagQuestionButton'
import { PracticeHeader } from '../components/PracticeHeader'
import { SpeakButton } from '../components/SpeakButton'
import { useModel } from '../context/ModelContext'
import {
  addReadingPassage,
  countQuizzes,
  deleteReadingPassage,
  listReadingPassages,
  logPractice,
  saveQuizzes,
  touchReadingPassagePracticed,
  upsertReviewWrong,
} from '../lib/db'
import { isModelReady } from '../lib/llm'
import { flattenReadingPassageQuestions } from '../lib/quiz-bank'
import { shuffle } from '../lib/quiz-fallback'
import { generateReadingQuestionSet } from '../lib/reading-generate'
import {
  loadReadingOnlineConfig,
  saveReadingOnlineConfig,
  type ReadingOnlineConfig,
} from '../lib/reading-online'
import {
  READING_PASSAGE_MAX,
  READING_PASSAGE_MIN,
  READING_Q_MAX,
  READING_Q_MIN,
  type ReadingPassageRecord,
  type ReadingQuestion,
} from '../lib/reading-spec'

type Tab = 'practice' | 'manage'
type Phase = 'ready' | 'play' | 'done'

interface PlayQuestion extends ReadingQuestion {
  choices: string[]
}

function pickPassage(
  passages: ReadingPassageRecord[],
  excludeId?: string | null,
): ReadingPassageRecord | null {
  const usable = passages.filter((p) => (p.questions?.length ?? 0) > 0)
  if (!usable.length) return null
  const pool = excludeId ? usable.filter((p) => p.id !== excludeId) : usable
  const ranked = [...(pool.length ? pool : usable)].sort(
    (a, b) => a.lastPracticedAt - b.lastPracticedAt,
  )
  return ranked[0] ?? null
}

function toPlayQuestions(passage: ReadingPassageRecord): PlayQuestion[] {
  return (passage.questions ?? []).map((q) => ({
    ...q,
    choices: shuffle([...q.choices]),
  }))
}

export function ReadingPractice() {
  const { t } = useTranslation()
  const model = useModel()
  const [tab, setTab] = useState<Tab>('practice')
  const [items, setItems] = useState<ReadingPassageRecord[]>([])
  const [bankCount, setBankCount] = useState(0)
  const [questionTotal, setQuestionTotal] = useState(0)

  const [sourceText, setSourceText] = useState('')
  const [title, setTitle] = useState('')
  const [count, setCount] = useState(4)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const [phase, setPhase] = useState<Phase>('ready')
  const [active, setActive] = useState<ReadingPassageRecord | null>(null)
  const [questions, setQuestions] = useState<PlayQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [graded, setGraded] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)

  const [onlineOpen, setOnlineOpen] = useState(false)
  const [onlineCfg, setOnlineCfg] = useState<ReadingOnlineConfig>(() => {
    return loadReadingOnlineConfig() ?? { baseUrl: '', apiKey: '', model: '' }
  })

  const refresh = useCallback(async () => {
    const list = await listReadingPassages()
    setItems(list)
    setQuestionTotal(list.reduce((n, p) => n + (p.questions?.length ?? 0), 0))
    setBankCount(await countQuizzes('reading'))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const allAnswered = useMemo(
    () => questions.length > 0 && questions.every((q) => Boolean(answers[q.id])),
    [questions, answers],
  )

  const openPassage = async (passage: ReadingPassageRecord) => {
    const prepared = toPlayQuestions(passage)
    if (!prepared.length) {
      setMsg(t('reading.noQuestions'))
      return
    }
    setActive(passage)
    setQuestions(prepared)
    setAnswers({})
    setGraded(false)
    setCorrectCount(0)
    setPhase('play')
    setTab('practice')
    setMsg('')
    await touchReadingPassagePracticed(passage.id)
    await saveQuizzes(flattenReadingPassageQuestions([passage]))
    setBankCount(await countQuizzes('reading'))
  }

  const startPractice = async (excludeCurrent = false) => {
    if (!items.length || questionTotal < 1) {
      setMsg(t('reading.empty'))
      return
    }
    setBusy(true)
    setMsg('')
    try {
      const passage = pickPassage(items, excludeCurrent ? active?.id : null)
      if (!passage) {
        setMsg(t('reading.noQuestions'))
        return
      }
      await openPassage(passage)
    } catch (e) {
      setMsg(`${t('common.error')}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const generate = async () => {
    setBusy(true)
    setMsg(t('reading.generating'))
    try {
      const result = await generateReadingQuestionSet(sourceText, {
        count,
        title,
        onProgress: (p) => {
          setMsg(
            t(`reading.stage.${p.message}`, {
              defaultValue: p.message,
              detail: p.detail ?? '',
            }),
          )
        },
      })
      if (!result.passage.questions.length) {
        throw new Error(t('reading.noQuestions'))
      }
      const saved = await addReadingPassage(result.passage)
      setMsg(
        t('reading.generated', {
          n: saved.questions.length,
          gen: t(`reading.generator.${saved.generator}`),
        }),
      )
      setSourceText('')
      setTitle('')
      await refresh()
      await openPassage(saved)
    } catch (e) {
      setMsg(`${t('common.error')}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const submitAll = () => {
    if (!active || !allAnswered || graded) return
    let correct = 0
    for (const q of questions) {
      const pick = answers[q.id]
      const ok = pick === q.answer
      if (ok) correct += 1
      void logPractice({ module: 'reading', correct: ok })
      if (!ok) {
        void upsertReviewWrong({
          kind: 'reading',
          prompt: q.prompt,
          sentence: active.title,
          answer: q.answer,
          choices: q.choices,
          explanation: q.explanation,
          mode: q.type,
        })
      }
    }
    setCorrectCount(correct)
    setGraded(true)
    setPhase('done')
  }

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id))
    setAnswers((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const backToReady = () => {
    setPhase('ready')
    setActive(null)
    setQuestions([])
    setAnswers({})
    setGraded(false)
    setCorrectCount(0)
  }

  const saveOnline = () => {
    if (!onlineCfg.baseUrl.trim() || !onlineCfg.model.trim()) {
      saveReadingOnlineConfig(null)
      setMsg(t('reading.onlineCleared'))
      return
    }
    saveReadingOnlineConfig({
      baseUrl: onlineCfg.baseUrl.trim(),
      apiKey: onlineCfg.apiKey.trim(),
      model: onlineCfg.model.trim(),
    })
    setMsg(t('reading.onlineSaved'))
  }

  const charCount = [...sourceText].length
  const modelReady = model.ready || isModelReady()
  const onlineReady = Boolean(loadReadingOnlineConfig())
  const showExam = (phase === 'play' || phase === 'done') && active && questions.length > 0

  return (
    <div className="panel stack">
      <PracticeHeader title={t('reading.title')} step={4} hint={t('reading.flowHint')} />

      <div className="tabs">
        <button
          type="button"
          className={`tab ${tab === 'practice' ? 'active' : ''}`}
          onClick={() => setTab('practice')}
        >
          {t('reading.tabPractice')}
        </button>
        <button
          type="button"
          className={`tab ${tab === 'manage' ? 'active' : ''}`}
          onClick={() => setTab('manage')}
        >
          {t('reading.tabManage')}
        </button>
      </div>

      {tab === 'practice' && phase === 'ready' && (
        <>
          <p className="muted">
            {t('reading.count', { n: items.length, q: questionTotal })} ·{' '}
            {t('quiz.bankCount', { n: bankCount })}
          </p>
          <p className="muted">{t('reading.modeHint')}</p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-accent btn-lg"
              disabled={!questionTotal || busy}
              onClick={() => void startPractice(false)}
            >
              {busy ? t('common.loading') : t('reading.practice')}
            </button>
          </div>
          {!questionTotal && (
            <p className="muted">
              {t('reading.empty')}{' '}
              <button type="button" className="btn btn-ghost" onClick={() => setTab('manage')}>
                {t('reading.tabManage')}
              </button>
            </p>
          )}
          {msg && <p className="muted">{msg}</p>}
        </>
      )}

      {tab === 'practice' && showExam && active && (
        <>
          <div className="play-toolbar">
            <button type="button" className="btn btn-ghost" onClick={backToReady}>
              {t('common.changeOptions')}
            </button>
            <SpeakButton text={active.sourceText.slice(0, 120)} />
          </div>
          <p className="muted">
            {active.title} · {t('reading.examMeta', { n: questions.length })}
          </p>
          <div className="passage">{active.sourceText}</div>

          <div className="stack" style={{ gap: '1.25rem' }}>
            {questions.map((q, i) => {
              const picked = answers[q.id]
              const result = graded ? (picked === q.answer ? 'ok' : 'bad') : null
              return (
                <QuestionBlock
                  key={q.id}
                  flag={(
                    <FlagQuestionButton
                      item={{
                        kind: 'reading',
                        prompt: q.prompt,
                        passage: active.sourceText,
                        sentence: active.title,
                        answer: q.answer,
                        choices: q.choices,
                        explanation: q.explanation,
                      }}
                      onFlagged={() => removeQuestion(q.id)}
                    />
                  )}
                >
                  <div className="muted">
                    {t('reading.questionIndex', { i: i + 1, n: questions.length })}
                    {' · '}
                    {t(`reading.type.${q.type}`)}
                  </div>
                  <p>{q.prompt}</p>
                  <div className="choice-list">
                    {q.choices.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`choice ${picked === c ? 'selected' : ''}`}
                        disabled={graded}
                        onClick={() => {
                          setAnswers((prev) => ({ ...prev, [q.id]: c }))
                        }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  {result && (
                    <>
                      <div className={`feedback ${result}`}>
                        {result === 'ok' && t('kana.correct')}
                        {result === 'bad' && `${t('kana.wrong')} → ${q.answer}`}
                      </div>
                      <p className="muted">{q.explanation}</p>
                    </>
                  )}
                </QuestionBlock>
              )
            })}
          </div>

          {phase === 'play' && (
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-accent btn-lg"
                disabled={!allAnswered}
                onClick={submitAll}
              >
                {t('reading.submitAll')}
              </button>
            </div>
          )}

          {phase === 'done' && (
            <>
              <div className="ready-card">
                <p>{t('reading.sessionDone')}</p>
                <p className="muted">
                  {t('reading.score', { correct: correctCount, total: questions.length })}
                </p>
              </div>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-accent"
                  disabled={busy}
                  onClick={() => void startPractice(true)}
                >
                  {t('reading.nextPassage')}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (!active) return
                    void openPassage(active)
                  }}
                >
                  {t('common.restart')}
                </button>
                <button type="button" className="btn btn-ghost" onClick={backToReady}>
                  {t('reading.backReady')}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'manage' && (
        <>
          <p className="muted">{t('reading.createHint')}</p>
          <div className="field">
            <label>{t('reading.titleLabel')}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('reading.titlePlaceholder')}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label>{t('reading.pasteLabel')}</label>
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              rows={10}
              placeholder={t('reading.pastePlaceholder')}
              style={{ minHeight: '12rem', resize: 'vertical' }}
            />
            <span className="muted">
              {t('reading.charCount', {
                n: charCount,
                min: READING_PASSAGE_MIN,
                max: READING_PASSAGE_MAX,
              })}
            </span>
          </div>
          <div className="field">
            <label>{t('reading.questionCount')}</label>
            <input
              type="number"
              min={READING_Q_MIN}
              max={READING_Q_MAX}
              value={count}
              onChange={(e) => setCount(Number(e.target.value) || 4)}
            />
          </div>

          <p className="muted">
            {t('reading.pipelineHint', {
              local: modelReady ? t('settings.modelReady') : t('settings.modelIdle'),
              online: onlineReady ? t('reading.onlineReady') : t('reading.onlineOff'),
            })}
          </p>

          <div className="btn-row">
            <button
              type="button"
              className="btn btn-accent btn-lg"
              disabled={busy || charCount < READING_PASSAGE_MIN}
              onClick={() => void generate()}
            >
              {busy ? t('common.loading') : t('reading.generateAndPractice')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOnlineOpen((v) => !v)}>
              {t('reading.onlineSettings')}
            </button>
          </div>

          {onlineOpen && (
            <div className="stack" style={{ marginTop: '0.75rem' }}>
              <p className="muted">{t('reading.onlineHint')}</p>
              <div className="field">
                <label>{t('reading.onlineBaseUrl')}</label>
                <input
                  value={onlineCfg.baseUrl}
                  onChange={(e) => setOnlineCfg((c) => ({ ...c, baseUrl: e.target.value }))}
                  placeholder="https://api.openai.com/v1"
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label>{t('reading.onlineModel')}</label>
                <input
                  value={onlineCfg.model}
                  onChange={(e) => setOnlineCfg((c) => ({ ...c, model: e.target.value }))}
                  placeholder="gpt-4o-mini"
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label>{t('reading.onlineApiKey')}</label>
                <input
                  type="password"
                  value={onlineCfg.apiKey}
                  onChange={(e) => setOnlineCfg((c) => ({ ...c, apiKey: e.target.value }))}
                  placeholder="sk-..."
                  autoComplete="off"
                />
              </div>
              <div className="btn-row">
                <button type="button" className="btn" onClick={saveOnline}>
                  {t('reading.onlineSave')}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setOnlineCfg({ baseUrl: '', apiKey: '', model: '' })
                    saveReadingOnlineConfig(null)
                    setMsg(t('reading.onlineCleared'))
                  }}
                >
                  {t('reading.onlineClear')}
                </button>
              </div>
            </div>
          )}

          {msg && <p className="muted">{msg}</p>}

          <div className="stack" style={{ marginTop: '1rem' }}>
            <h3>{t('reading.libraryHint', { n: items.length })}</h3>
            {!items.length ? (
              <p className="muted">{t('reading.empty')}</p>
            ) : (
              <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: '0.5rem' }}>
                {items.map((row) => (
                  <li key={row.id} className="btn-row" style={{ alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <strong>{row.title}</strong>
                      <div className="muted">
                        {t('reading.meta', {
                          n: row.questions.length,
                          gen: t(`reading.generator.${row.generator}`),
                          lang: row.lang,
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        void deleteReadingPassage(row.id).then(() => refresh())
                      }}
                    >
                      {t('reading.delete')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
