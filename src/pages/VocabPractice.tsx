import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlagQuestionButton, QuestionBlock } from '../components/FlagQuestionButton'
import { PracticeHeader } from '../components/PracticeHeader'
import { SpeakButton } from '../components/SpeakButton'
import { SEED_VOCAB } from '../data/seed-vocab'
import { ChoiceNotes } from '../components/ChoiceNotes'
import {
  addVocab,
  bulkAddVocab,
  clearQuizzes,
  clearVocab,
  countQuizzes,
  listVocab,
  logPractice,
  normalizeEnglishMeanings,
  upsertReviewWrong,
  VOCAB_QUIZ_MODES,
  type StoredQuiz,
  type VocabEntry,
  type VocabQuizMode,
} from '../lib/db'
import { prepareVocabSession } from '../lib/quiz-bank'
import { isMostlyEnglish, toZhMeaning } from '../lib/text-lang'
import { autofillVocab, type VocabFillDirection } from '../lib/vocab-autofill'
import { syncVocabEntriesQuizzes, syncVocabEntryQuizzes } from '../lib/vocab-quiz-sync'

type Tab = 'practice' | 'manage'

export function VocabPractice() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('practice')
  const [items, setItems] = useState<VocabEntry[]>([])
  const [bankCount, setBankCount] = useState(0)
  const [modeBankCount, setModeBankCount] = useState(0)
  const [modeCounts, setModeCounts] = useState<Record<VocabQuizMode, number>>({
    'ja-meaning': 0,
    'meaning-ja': 0,
    reading: 0,
  })
  const [word, setWord] = useState('')
  const [reading, setReading] = useState('')
  const [meaning, setMeaning] = useState('')
  /** 翻譯意思預設唯讀；按「手動輸入」後才可改 */
  const [meaningManual, setMeaningManual] = useState(false)
  const [fillDir, setFillDir] = useState<VocabFillDirection>('ja2zh')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [lookupMsg, setLookupMsg] = useState('')
  const lookupSeq = useRef(0)
  const lastFilledQuery = useRef('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<'ready' | 'play'>('ready')
  const [mode, setMode] = useState<VocabQuizMode>('ja-meaning')
  const [session, setSession] = useState<StoredQuiz[]>([])
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<'ok' | 'bad' | null>(null)
  const [fromCache, setFromCache] = useState(false)

  const refreshBankCounts = useCallback(async () => {
    const total = await countQuizzes('vocab')
    setBankCount(total)
    const next: Record<VocabQuizMode, number> = {
      'ja-meaning': 0,
      'meaning-ja': 0,
      reading: 0,
    }
    for (const m of VOCAB_QUIZ_MODES) {
      next[m] = await countQuizzes('vocab', m)
    }
    setModeCounts(next)
    setModeBankCount(next[mode] ?? 0)
  }, [mode])

  const refresh = useCallback(async () => {
    await normalizeEnglishMeanings(toZhMeaning, isMostlyEnglish)
    let list = await listVocab()
    if (list.length === 0) {
      await bulkAddVocab(
        SEED_VOCAB.map((v) => ({
          word: v.word,
          reading: v.reading,
          meaning: v.meaning,
          source: 'manual' as const,
        })),
      )
      list = await listVocab()
      await syncVocabEntriesQuizzes(list)
    }
    setItems(list)
    await refreshBankCounts()
  }, [refreshBankCounts])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const runAutofill = useCallback(
    async (text: string, direction: VocabFillDirection) => {
      const q = text.trim()
      if (q.length < 1) return
      const seq = ++lookupSeq.current
      setLookupBusy(true)
      setLookupMsg(t('vocab.lookupRunning'))
      try {
        const result = await autofillVocab(q, direction)
        if (seq !== lookupSeq.current) return
        lastFilledQuery.current = `${direction}:${q}`
        setWord(result.word)
        setReading(result.reading)
        setMeaning(result.meaning)
        setLookupMsg(
          result.reading
            ? t('vocab.lookupOk')
            : t('vocab.lookupOkNoReading'),
        )
      } catch (e) {
        if (seq !== lookupSeq.current) return
        setLookupMsg(
          `${t('vocab.lookupFail')}: ${e instanceof Error ? e.message : String(e)}`,
        )
      } finally {
        if (seq === lookupSeq.current) setLookupBusy(false)
      }
    },
    [t],
  )

  const sourceText = fillDir === 'ja2zh' ? word : meaning

  useEffect(() => {
    if (tab !== 'manage') return
    const q = sourceText.trim()
    if (q.length < 1) return
    if (lastFilledQuery.current === `${fillDir}:${q}`) return
    const timer = window.setTimeout(() => {
      void runAutofill(q, fillDir)
    }, 650)
    return () => window.clearTimeout(timer)
  }, [sourceText, fillDir, tab, runAutofill])

  const save = async () => {
    if (!word.trim() || !meaning.trim()) return
    const entry = await addVocab({
      word: word.trim(),
      reading: reading.trim(),
      meaning: meaning.trim(),
      source: 'manual',
    })
    await syncVocabEntryQuizzes(entry)
    setWord('')
    setReading('')
    setMeaning('')
    setMeaningManual(false)
    setLookupMsg('')
    setMessage(t('vocab.saved'))
    await refresh()
  }

  const meaningLocked = fillDir === 'ja2zh' && !meaningManual

  const startPractice = async (forceNew = false) => {
    if (!items.length) return
    setBusy(true)
    try {
      const { questions, fromCache: cached } = await prepareVocabSession(
        items,
        mode,
        { forceNew },
      )
      setSession(questions)
      setIndex(0)
      setSelected(null)
      setFeedback(null)
      setFromCache(cached)
      setPhase('play')
      await refreshBankCounts()
    } finally {
      setBusy(false)
    }
  }

  const current = session[index]

  const check = () => {
    if (!current || !selected) return
    const ok = selected === current.answer
    setFeedback(ok ? 'ok' : 'bad')
    void logPractice({ module: 'vocab', correct: ok })
    if (!ok) {
      void upsertReviewWrong({
        kind: 'vocab',
        prompt: current.prompt,
        sentence: current.sentence,
        answer: current.answer,
        choices: current.choices,
        explanation: current.explanation,
        choiceExplanations: current.choiceExplanations,
        mode: current.mode,
      })
    }
  }

  const next = () => {
    if (index < session.length - 1) {
      setIndex((i) => i + 1)
      setSelected(null)
      setFeedback(null)
    } else {
      setPhase('ready')
    }
  }

  const skipAfterFlag = () => {
    if (index < session.length - 1) {
      setIndex((i) => i + 1)
      setSelected(null)
      setFeedback(null)
    } else {
      setPhase('ready')
    }
  }

  return (
    <div className="panel stack">
      <PracticeHeader title={t('vocab.title')} step={2} hint={t('vocab.flowHint')} />

      <div className="tabs">
        <button type="button" className={`tab ${tab === 'practice' ? 'active' : ''}`} onClick={() => setTab('practice')}>
          {t('vocab.tabPractice')}
        </button>
        <button type="button" className={`tab ${tab === 'manage' ? 'active' : ''}`} onClick={() => setTab('manage')}>
          {t('vocab.tabManage')}
        </button>
      </div>

      {tab === 'practice' && (
        <>
          <p className="muted">
            {t('vocab.count', { n: items.length })} · {t('quiz.bankCount', { n: bankCount })} ·{' '}
            {t('vocab.modeBankCount', { n: modeBankCount })}
          </p>

          {phase === 'ready' ? (
            <>
              <div className="setup-block">
                <h3>{t('kana.modePrompt')}</h3>
                <div className="choice-list">
                  <button type="button" className={`choice ${mode === 'ja-meaning' ? 'selected' : ''}`} onClick={() => setMode('ja-meaning')}>
                    {t('vocab.modeJaToMeaning')}
                  </button>
                  <button type="button" className={`choice ${mode === 'meaning-ja' ? 'selected' : ''}`} onClick={() => setMode('meaning-ja')}>
                    {t('vocab.modeMeaningToJa')}
                  </button>
                  <button type="button" className={`choice ${mode === 'reading' ? 'selected' : ''}`} onClick={() => setMode('reading')}>
                    {t('vocab.modeReading')}
                  </button>
                </div>
              </div>
              <p className="muted">{t('quiz.reuseHint')}</p>
              <div className="btn-row">
                <button type="button" className="btn btn-accent btn-lg" disabled={!items.length || busy} onClick={() => void startPractice(false)}>
                  {busy ? t('common.loading') : t('vocab.practice')}
                </button>
                <button type="button" className="btn btn-ghost" disabled={!items.length || busy} onClick={() => void startPractice(true)}>
                  {t('quiz.forceNew')}
                </button>
              </div>
              {!items.length && (
                <p className="muted">{t('vocab.empty')}</p>
              )}
            </>
          ) : current ? (
            <>
              <div className="play-toolbar">
                <button type="button" className="btn btn-ghost" onClick={() => setPhase('ready')}>
                  {t('common.changeOptions')}
                </button>
                {current.sentence && <SpeakButton text={current.sentence} />}
              </div>
              {fromCache && <p className="muted">{t('quiz.fromCache')}</p>}
              <QuestionBlock
                flag={(
                  <FlagQuestionButton
                    key={current.id}
                    item={{
                      kind: 'vocab',
                      mode: current.mode,
                      prompt: current.prompt,
                      sentence: current.sentence,
                      answer: current.answer,
                      choices: current.choices,
                      explanation: current.explanation,
                      quizId: current.id,
                    }}
                    onFlagged={skipAfterFlag}
                  />
                )}
              >
                <div className="muted">{t('vocab.multipleChoice')} · {index + 1}/{session.length}</div>
                <p>{current.prompt}</p>
                <div className="prompt-kana" style={{ fontSize: '2.4rem' }}>{current.sentence}</div>
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
                {feedback && <p className="muted">{current.explanation}</p>}
                {feedback && (
                  <ChoiceNotes
                    answer={current.answer}
                    selected={selected}
                    choiceExplanations={current.choiceExplanations}
                  />
                )}
              </QuestionBlock>
              <div className="btn-row" style={{ justifyContent: 'center' }}>
                {!feedback ? (
                  <button type="button" className="btn btn-accent" disabled={!selected} onClick={check}>
                    {t('kana.submit')}
                  </button>
                ) : (
                  <button type="button" className="btn btn-accent" onClick={next}>
                    {index < session.length - 1 ? t('kana.next') : t('common.restart')}
                  </button>
                )}
              </div>
            </>
          ) : null}
        </>
      )}

      {tab === 'manage' && (
        <div className="split">
          <div>
            <h3>{t('vocab.add')}</h3>
            <p className="muted">
              {t('vocab.modeBanks', {
                jaMeaning: modeCounts['ja-meaning'],
                meaningJa: modeCounts['meaning-ja'],
                reading: modeCounts.reading,
              })}
            </p>
            <div className="field">
              <label>
                {t('vocab.word')}
                {fillDir === 'ja2zh' ? ` · ${t('vocab.lookupSource')}` : ''}
              </label>
              <input
                value={word}
                onChange={(e) => {
                  setWord(e.target.value)
                  if (fillDir === 'ja2zh') setLookupMsg('')
                }}
                placeholder={fillDir === 'ja2zh' ? t('vocab.placeholderJa') : ''}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label>{t('vocab.reading')}</label>
              <input
                value={reading}
                onChange={(e) => setReading(e.target.value)}
                placeholder={t('vocab.placeholderReading')}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <div className="field-label-row">
                <label>
                  {t('vocab.meaning')}
                  {fillDir === 'zh2ja' ? ` · ${t('vocab.lookupSource')}` : ''}
                  {meaningLocked ? ` · ${t('vocab.meaningReadonly')}` : ''}
                </label>
                {fillDir === 'ja2zh' && (
                  <button
                    type="button"
                    className={`btn btn-ghost btn-sm ${meaningManual ? 'active-soft' : ''}`}
                    onClick={() => setMeaningManual(true)}
                    disabled={meaningManual}
                  >
                    {t('vocab.manualEdit')}
                  </button>
                )}
              </div>
              <input
                value={meaning}
                readOnly={meaningLocked}
                onChange={(e) => {
                  if (meaningLocked) return
                  setMeaning(e.target.value)
                  if (fillDir === 'zh2ja') setLookupMsg('')
                }}
                placeholder={fillDir === 'zh2ja' ? t('vocab.placeholderZh') : t('vocab.placeholderMeaningAuto')}
                autoComplete="off"
                className={meaningLocked ? 'input-readonly' : undefined}
              />
            </div>
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => void save()}>
                {t('vocab.save')}
              </button>
            </div>
            {message && <p className="muted">{message}</p>}
          </div>

          <div>
            <h3>{t('vocab.translateTitle')}</h3>
            <p className="muted">{t('vocab.lookupHint')}</p>
            <div className="choice-list" style={{ marginBottom: '0.75rem' }}>
              <button
                type="button"
                className={`choice ${fillDir === 'ja2zh' ? 'selected' : ''}`}
                onClick={() => {
                  lastFilledQuery.current = ''
                  setMeaningManual(false)
                  setFillDir('ja2zh')
                }}
              >
                {t('vocab.dirJa2Zh')}
              </button>
              <button
                type="button"
                className={`choice ${fillDir === 'zh2ja' ? 'selected' : ''}`}
                onClick={() => {
                  lastFilledQuery.current = ''
                  setMeaningManual(true)
                  setFillDir('zh2ja')
                }}
              >
                {t('vocab.dirZh2Ja')}
              </button>
            </div>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={lookupBusy || !(fillDir === 'ja2zh' ? word.trim() : meaning.trim())}
                onClick={() =>
                  void runAutofill(fillDir === 'ja2zh' ? word : meaning, fillDir)
                }
              >
                {lookupBusy ? t('vocab.lookupRunning') : t('vocab.lookupNow')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  void (async () => {
                    await clearVocab()
                    await clearQuizzes('vocab')
                    setMessage(t('vocab.cleared'))
                    await refresh()
                  })()
                }}
              >
                {t('vocab.clear')}
              </button>
            </div>
            {lookupMsg && <p className="muted">{lookupMsg}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
