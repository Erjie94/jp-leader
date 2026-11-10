import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlagQuestionButton, QuestionBlock } from '../components/FlagQuestionButton'
import { PracticeHeader } from '../components/PracticeHeader'
import { SpeakButton } from '../components/SpeakButton'
import { SEED_PHRASES } from '../data/seed-phrases'
import {
  addPhrase,
  bulkAddPhrases,
  clearPhrases,
  countQuizzes,
  listPhrases,
  listVocab,
  logPractice,
  upsertReviewWrong,
  type PhraseEntry,
  type StoredQuiz,
} from '../lib/db'
import { autofillPhrase, type PhraseFillDirection } from '../lib/phrase-autofill'
import {
  applyBlank,
  phraseContainsBlank,
  tokenizePhrase,
} from '../lib/phrase-tokens'
import { preparePhraseSession } from '../lib/quiz-bank'

type Tab = 'practice' | 'manage'

export function PhrasePractice() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('practice')
  const [items, setItems] = useState<PhraseEntry[]>([])
  const [vocabWords, setVocabWords] = useState<string[]>([])
  const [bankCount, setBankCount] = useState(0)
  const [phrase, setPhrase] = useState('')
  const [reading, setReading] = useState('')
  const [meaning, setMeaning] = useState('')
  /** 翻譯意思預設唯讀；按「手動輸入」後才可改 */
  const [meaningManual, setMeaningManual] = useState(false)
  const [blankWord, setBlankWord] = useState('')
  const [fillDir, setFillDir] = useState<PhraseFillDirection>('ja2zh')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [lookupMsg, setLookupMsg] = useState('')
  const lookupSeq = useRef(0)
  const lastFilledQuery = useRef('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<'ready' | 'play'>('ready')
  const [session, setSession] = useState<StoredQuiz[]>([])
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<'ok' | 'bad' | null>(null)
  const [fromCache, setFromCache] = useState(false)

  const tokens = useMemo(() => tokenizePhrase(phrase), [phrase])
  const clozePreview = useMemo(
    () => (blankWord && phraseContainsBlank(phrase, blankWord)
      ? applyBlank(phrase, blankWord)
      : ''),
    [phrase, blankWord],
  )

  const refresh = useCallback(async () => {
    let list = await listPhrases()
    if (list.length === 0) {
      await bulkAddPhrases(
        SEED_PHRASES.map((p) => ({
          phrase: p.phrase,
          reading: p.reading,
          meaning: p.meaning,
          blankWord: p.blankWord,
          source: 'manual' as const,
        })),
      )
      list = await listPhrases()
    }
    setItems(list)
    const vocab = await listVocab()
    setVocabWords(vocab.map((v) => v.word))
    setBankCount(await countQuizzes('phrase'))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const runAutofill = useCallback(
    async (text: string, direction: PhraseFillDirection) => {
      const q = text.trim()
      if (q.length < 1) return
      const seq = ++lookupSeq.current
      setLookupBusy(true)
      setLookupMsg(t('phrase.lookupRunning'))
      try {
        const result = await autofillPhrase(q, direction)
        if (seq !== lookupSeq.current) return
        lastFilledQuery.current = `${direction}:${q}`
        setPhrase(result.phrase)
        setReading(result.reading)
        setMeaning(result.meaning)
        setBlankWord((prev) => {
          if (prev && result.phrase.includes(prev)) return prev
          return ''
        })
        setLookupMsg(
          result.reading
            ? t('phrase.lookupOk')
            : t('phrase.lookupOkNoReading'),
        )
      } catch (e) {
        if (seq !== lookupSeq.current) return
        setLookupMsg(
          `${t('phrase.lookupFail')}: ${e instanceof Error ? e.message : String(e)}`,
        )
      } finally {
        if (seq === lookupSeq.current) setLookupBusy(false)
      }
    },
    [t],
  )

  const sourceText = fillDir === 'ja2zh' ? phrase : meaning

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
    const p = phrase.trim()
    const m = meaning.trim()
    const b = blankWord.trim()
    if (!p || !m || !b) {
      setMessage(t('phrase.needBlank'))
      return
    }
    if (!phraseContainsBlank(p, b)) {
      setMessage(t('phrase.blankNotInPhrase'))
      return
    }
    await addPhrase({
      phrase: p,
      reading: reading.trim(),
      meaning: m,
      blankWord: b,
      source: 'manual',
    })
    setPhrase('')
    setReading('')
    setMeaning('')
    setMeaningManual(false)
    setBlankWord('')
    setLookupMsg('')
    setMessage(t('phrase.saved'))
    await refresh()
  }

  const meaningLocked = fillDir === 'ja2zh' && !meaningManual

  const startPractice = async (forceNew = false) => {
    if (!items.length) return
    setBusy(true)
    try {
      const { questions, fromCache: cached } = await preparePhraseSession(
        items,
        vocabWords,
        { forceNew },
      )
      setSession(questions)
      setIndex(0)
      setSelected(null)
      setFeedback(null)
      setFromCache(cached)
      setPhase('play')
      setBankCount(await countQuizzes('phrase'))
    } finally {
      setBusy(false)
    }
  }

  const current = session[index]

  const check = () => {
    if (!current || !selected) return
    const ok = selected === current.answer
    setFeedback(ok ? 'ok' : 'bad')
    void logPractice({ module: 'phrase', correct: ok })
    if (!ok) {
      void upsertReviewWrong({
        kind: 'phrase',
        prompt: current.prompt,
        sentence: current.sentence,
        answer: current.answer,
        choices: current.choices,
        explanation: current.explanation,
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
      <PracticeHeader title={t('phrase.title')} step={3} hint={t('phrase.flowHint')} />

      <div className="tabs">
        <button type="button" className={`tab ${tab === 'practice' ? 'active' : ''}`} onClick={() => setTab('practice')}>
          {t('phrase.tabPractice')}
        </button>
        <button type="button" className={`tab ${tab === 'manage' ? 'active' : ''}`} onClick={() => setTab('manage')}>
          {t('phrase.tabManage')}
        </button>
      </div>

      {tab === 'practice' && (
        <>
          <p className="muted">
            {t('phrase.count', { n: items.length })} · {t('quiz.bankCount', { n: bankCount })}
          </p>

          {phase === 'ready' ? (
            <>
              <p className="muted">{t('phrase.modeHint')}</p>
              <p className="muted">{t('quiz.reuseHint')}</p>
              <div className="btn-row">
                <button type="button" className="btn btn-accent btn-lg" disabled={!items.length || busy} onClick={() => void startPractice(false)}>
                  {busy ? t('common.loading') : t('phrase.practice')}
                </button>
                <button type="button" className="btn btn-ghost" disabled={!items.length || busy} onClick={() => void startPractice(true)}>
                  {t('quiz.forceNew')}
                </button>
              </div>
              {!items.length && (
                <p className="muted">{t('phrase.empty')}</p>
              )}
            </>
          ) : current ? (
            <>
              <div className="play-toolbar">
                <button type="button" className="btn btn-ghost" onClick={() => setPhase('ready')}>
                  {t('common.changeOptions')}
                </button>
                {current.sentence && (
                  <SpeakButton text={current.sentence.replace(/____/g, current.answer)} />
                )}
              </div>
              {fromCache && <p className="muted">{t('quiz.fromCache')}</p>}
              <QuestionBlock
                flag={(
                  <FlagQuestionButton
                    key={current.id}
                    item={{
                      kind: 'phrase',
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
                <div className="muted">{t('phrase.multipleChoice')} · {index + 1}/{session.length}</div>
                <p>{current.prompt}</p>
                <div className="prompt-kana" style={{ fontSize: '1.8rem' }}>{current.sentence}</div>
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
            <h3>{t('phrase.add')}</h3>
            <div className="field">
              <label>
                {t('phrase.phrase')}
                {fillDir === 'ja2zh' ? ` · ${t('phrase.lookupSource')}` : ''}
              </label>
              <input
                value={phrase}
                onChange={(e) => {
                  setPhrase(e.target.value)
                  if (fillDir === 'ja2zh') setLookupMsg('')
                }}
                placeholder={fillDir === 'ja2zh' ? t('phrase.placeholderJa') : ''}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label>{t('phrase.reading')}</label>
              <input
                value={reading}
                onChange={(e) => setReading(e.target.value)}
                placeholder={t('phrase.placeholderReading')}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <div className="field-label-row">
                <label>
                  {t('phrase.meaning')}
                  {fillDir === 'zh2ja' ? ` · ${t('phrase.lookupSource')}` : ''}
                  {meaningLocked ? ` · ${t('phrase.meaningReadonly')}` : ''}
                </label>
                {fillDir === 'ja2zh' && (
                  <button
                    type="button"
                    className={`btn btn-ghost btn-sm ${meaningManual ? 'active-soft' : ''}`}
                    onClick={() => setMeaningManual(true)}
                    disabled={meaningManual}
                  >
                    {t('phrase.manualEdit')}
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
                placeholder={fillDir === 'zh2ja' ? t('phrase.placeholderZh') : t('phrase.placeholderMeaningAuto')}
                autoComplete="off"
                className={meaningLocked ? 'input-readonly' : undefined}
              />
            </div>

            <div className="field">
              <label>{t('phrase.blankLabel')}</label>
              <p className="muted" style={{ marginTop: 0 }}>{t('phrase.blankHint')}</p>
              <div className="token-row" role="group" aria-label={t('phrase.blankLabel')}>
                {tokens.map((tok) => (
                  tok.selectable ? (
                    <button
                      key={`${tok.index}-${tok.text}`}
                      type="button"
                      className={`token-chip ${blankWord === tok.text ? 'selected' : ''}`}
                      onClick={() => setBlankWord(tok.text)}
                    >
                      {tok.text}
                    </button>
                  ) : (
                    <span key={`${tok.index}-${tok.text}`} className="token-gap">{tok.text}</span>
                  )
                ))}
              </div>
              <input
                value={blankWord}
                onChange={(e) => setBlankWord(e.target.value)}
                placeholder={t('phrase.placeholderBlank')}
                autoComplete="off"
                style={{ marginTop: '0.5rem' }}
              />
              {clozePreview && (
                <p className="cloze-preview">
                  <span className="muted">{t('phrase.preview')}：</span>
                  {clozePreview}
                </p>
              )}
            </div>

            <div className="btn-row">
              <button type="button" className="btn" onClick={() => void save()}>
                {t('phrase.save')}
              </button>
            </div>
            {message && <p className="muted">{message}</p>}
          </div>

          <div>
            <h3>{t('phrase.translateTitle')}</h3>
            <p className="muted">{t('phrase.lookupHint')}</p>
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
                {t('phrase.dirJa2Zh')}
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
                {t('phrase.dirZh2Ja')}
              </button>
            </div>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={lookupBusy || !(fillDir === 'ja2zh' ? phrase.trim() : meaning.trim())}
                onClick={() =>
                  void runAutofill(fillDir === 'ja2zh' ? phrase : meaning, fillDir)
                }
              >
                {lookupBusy ? t('phrase.lookupRunning') : t('phrase.lookupNow')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  void clearPhrases().then(() => {
                    setMessage(t('phrase.cleared'))
                    return refresh()
                  })
                }}
              >
                {t('phrase.clear')}
              </button>
            </div>
            {lookupMsg && <p className="muted">{lookupMsg}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
