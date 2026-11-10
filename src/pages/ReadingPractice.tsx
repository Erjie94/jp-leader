import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlagQuestionButton, QuestionBlock } from '../components/FlagQuestionButton'
import { PracticeHeader } from '../components/PracticeHeader'
import { useModel } from '../context/ModelContext'
import {
  addReadingPassage,
  deleteReadingPassage,
  listReadingPassages,
  logPractice,
  touchReadingPassagePracticed,
  upsertReviewWrong,
} from '../lib/db'
import { isModelReady } from '../lib/llm'
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

type Tab = 'create' | 'library' | 'play'

export function ReadingPractice() {
  const { t } = useTranslation()
  const model = useModel()
  const [tab, setTab] = useState<Tab>('create')
  const [sourceText, setSourceText] = useState('')
  const [title, setTitle] = useState('')
  const [count, setCount] = useState(4)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [items, setItems] = useState<ReadingPassageRecord[]>([])
  const [session, setSession] = useState<ReadingPassageRecord | null>(null)
  const [qIndex, setQIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<'ok' | 'bad' | null>(null)

  const [onlineOpen, setOnlineOpen] = useState(false)
  const [onlineCfg, setOnlineCfg] = useState<ReadingOnlineConfig>(() => {
    return loadReadingOnlineConfig() ?? { baseUrl: '', apiKey: '', model: '' }
  })

  const refresh = useCallback(async () => {
    setItems(await listReadingPassages())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const currentQ: ReadingQuestion | undefined = session?.questions[qIndex]

  const generate = async () => {
    setBusy(true)
    setMsg(t('reading.generating'))
    try {
      const result = await generateReadingQuestionSet(sourceText, {
        count,
        title,
        onProgress: (p) => {
          setMsg(t(`reading.stage.${p.message}`, { defaultValue: p.message, detail: p.detail ?? '' }))
        },
      })
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
      setTab('library')
    } catch (e) {
      setMsg(`${t('common.error')}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const startPlay = async (row: ReadingPassageRecord) => {
    setSession(row)
    setQIndex(0)
    setSelected(null)
    setFeedback(null)
    setTab('play')
    await touchReadingPassagePracticed(row.id)
  }

  const check = () => {
    if (!session || !currentQ || !selected) return
    const ok = selected === currentQ.answer
    setFeedback(ok ? 'ok' : 'bad')
    void logPractice({ module: 'reading', correct: ok })
    if (!ok) {
      void upsertReviewWrong({
        kind: 'reading',
        prompt: currentQ.prompt,
        sentence: session.title,
        answer: currentQ.answer,
        choices: currentQ.choices,
        explanation: currentQ.explanation,
        mode: currentQ.type,
      })
    }
  }

  const next = () => {
    if (!session) return
    if (qIndex < session.questions.length - 1) {
      setQIndex((i) => i + 1)
      setSelected(null)
      setFeedback(null)
    } else {
      setSession(null)
      setTab('library')
      setMsg(t('reading.sessionDone'))
    }
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

  return (
    <div className="panel stack">
      <PracticeHeader title={t('reading.title')} step={4} hint={t('reading.flowHint')} />

      <div className="tabs">
        <button type="button" className={`tab ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>
          {t('reading.tabCreate')}
        </button>
        <button type="button" className={`tab ${tab === 'library' ? 'active' : ''}`} onClick={() => setTab('library')}>
          {t('reading.tabLibrary')}
        </button>
        {session && (
          <button type="button" className={`tab ${tab === 'play' ? 'active' : ''}`} onClick={() => setTab('play')}>
            {t('reading.tabPlay')}
          </button>
        )}
      </div>

      {tab === 'create' && (
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
              {t('reading.charCount', { n: charCount, min: READING_PASSAGE_MIN, max: READING_PASSAGE_MAX })}
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
              {busy ? t('common.loading') : t('reading.generate')}
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
        </>
      )}

      {tab === 'library' && (
        <>
          <p className="muted">{t('reading.libraryHint', { n: items.length })}</p>
          {!items.length && <p className="muted">{t('reading.empty')}</p>}
          <div className="stack">
            {items.map((row) => (
              <div key={row.id} className="ready-card" style={{ display: 'grid', gap: '0.5rem' }}>
                <strong>{row.title}</strong>
                <span className="muted">
                  {t('reading.meta', {
                    n: row.questions.length,
                    gen: t(`reading.generator.${row.generator}`),
                    lang: row.lang,
                  })}
                </span>
                <p className="muted" style={{ margin: 0 }}>
                  {[...row.sourceText].slice(0, 80).join('')}
                  {[...row.sourceText].length > 80 ? '…' : ''}
                </p>
                <div className="btn-row">
                  <button type="button" className="btn btn-accent" onClick={() => void startPlay(row)}>
                    {t('reading.practice')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      void deleteReadingPassage(row.id).then(() => refresh())
                    }}
                  >
                    {t('reading.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {msg && <p className="muted">{msg}</p>}
        </>
      )}

      {tab === 'play' && session && currentQ && (
        <>
          <div className="play-toolbar">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSession(null)
                setTab('library')
              }}
            >
              {t('common.changeOptions')}
            </button>
          </div>
          <div className="passage">{session.sourceText}</div>
          <QuestionBlock
            flag={(
              <FlagQuestionButton
                key={currentQ.id}
                item={{
                  kind: 'reading',
                  prompt: currentQ.prompt,
                  passage: session.sourceText,
                  answer: currentQ.answer,
                  choices: currentQ.choices,
                  explanation: currentQ.explanation,
                }}
                onFlagged={next}
              />
            )}
          >
            <div className="muted">
              {t(`reading.type.${currentQ.type}`)} · {qIndex + 1}/{session.questions.length}
            </div>
            <p>{currentQ.prompt}</p>
            <div className="choice-list">
              {currentQ.choices.map((c) => (
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
              {feedback === 'bad' && `${t('kana.wrong')} → ${currentQ.answer}`}
            </div>
            {feedback && <p className="muted">{currentQ.explanation}</p>}
          </QuestionBlock>
          <div className="btn-row" style={{ justifyContent: 'center' }}>
            {!feedback ? (
              <button type="button" className="btn btn-accent" disabled={!selected} onClick={check}>
                {t('kana.submit')}
              </button>
            ) : (
              <button type="button" className="btn btn-accent" onClick={next}>
                {qIndex < session.questions.length - 1 ? t('kana.next') : t('reading.finish')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
