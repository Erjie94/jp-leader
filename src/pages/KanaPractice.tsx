import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PracticeHeader } from '../components/PracticeHeader'
import { SpeakButton } from '../components/SpeakButton'
import {
  filterKana,
  normalizeKana,
  normalizeRomaji,
  type KanaGroup,
  type KanaItem,
  type KanaScript,
} from '../lib/kana'
import { logPractice } from '../lib/db'

type Mode = 'kana-to-romaji' | 'romaji-to-kana'

function pickRandom(list: KanaItem[], exclude?: string): KanaItem {
  const pool = exclude ? list.filter((k) => k.kana !== exclude) : list
  const src = pool.length ? pool : list
  return src[Math.floor(Math.random() * src.length)]
}

export function KanaPractice() {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<'setup' | 'play'>('setup')
  const [script, setScript] = useState<KanaScript>('hiragana')
  const [groups, setGroups] = useState<KanaGroup[]>(['basic'])
  const [mode, setMode] = useState<Mode>('kana-to-romaji')
  const [input, setInput] = useState('')
  const [streak, setStreak] = useState(0)
  const [feedback, setFeedback] = useState<'ok' | 'bad' | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [showOptions, setShowOptions] = useState(false)

  const pool = useMemo(() => filterKana(script, groups), [script, groups])
  const [current, setCurrent] = useState<KanaItem>(() => pickRandom(filterKana('hiragana', ['basic'])))

  const toggleGroup = (g: KanaGroup) => {
    setGroups((prev) => {
      const next = prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
      return next.length ? next : (['basic'] as KanaGroup[])
    })
  }

  const start = () => {
    const nextPool = filterKana(script, groups)
    setCurrent(pickRandom(nextPool))
    setInput('')
    setFeedback(null)
    setShowHint(false)
    setStreak(0)
    setPhase('play')
  }

  const check = () => {
    if (!pool.length) return
    const ok =
      mode === 'kana-to-romaji'
        ? normalizeRomaji(input) === normalizeRomaji(current.romaji)
        : normalizeKana(input) === normalizeKana(current.kana)

    void logPractice({ module: 'kana', correct: ok })
    if (ok) {
      setFeedback('ok')
      setStreak((n) => n + 1)
      window.setTimeout(() => {
        setCurrent(pickRandom(pool, current.kana))
        setInput('')
        setFeedback(null)
        setShowHint(false)
      }, 450)
    } else {
      setFeedback('bad')
      setStreak(0)
    }
  }

  const prompt = mode === 'kana-to-romaji' ? current.kana : current.romaji
  const hint = mode === 'kana-to-romaji' ? current.romaji : current.kana

  return (
    <div className="panel stack">
      <PracticeHeader title={t('kana.title')} step={1} hint={t('kana.flowHint')} />

      {phase === 'setup' ? (
        <>
          <div className="setup-block">
            <h3>{t('kana.chooseScript')}</h3>
            <div className="chips">
              <button type="button" className={`chip ${script === 'hiragana' ? 'active' : ''}`} onClick={() => setScript('hiragana')}>
                {t('kana.hiragana')}
              </button>
              <button type="button" className={`chip ${script === 'katakana' ? 'active' : ''}`} onClick={() => setScript('katakana')}>
                {t('kana.katakana')}
              </button>
            </div>
          </div>

          <div className="setup-block">
            <h3>{t('kana.modePrompt')}</h3>
            <div className="choice-list">
              <button type="button" className={`choice ${mode === 'kana-to-romaji' ? 'selected' : ''}`} onClick={() => setMode('kana-to-romaji')}>
                {t('kana.modeShowKanaTypeRomaji')}
              </button>
              <button type="button" className={`choice ${mode === 'romaji-to-kana' ? 'selected' : ''}`} onClick={() => setMode('romaji-to-kana')}>
                {t('kana.modeShowRomajiTypeKana')}
              </button>
            </div>
          </div>

          <div className="setup-block">
            <h3>{t('kana.rows')}</h3>
            <div className="chips">
              {([
                ['basic', 'kana.basic'],
                ['dakuten', 'kana.dakuten'],
                ['youon', 'kana.youon'],
              ] as const).map(([g, key]) => (
                <button
                  key={g}
                  type="button"
                  className={`chip ${groups.includes(g) ? 'active' : ''}`}
                  onClick={() => toggleGroup(g)}
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>

          <button type="button" className="btn btn-accent btn-lg" onClick={start}>
            {t('kana.startPractice')}
          </button>
        </>
      ) : (
        <>
          <div className="play-toolbar">
            <button type="button" className="btn btn-ghost" onClick={() => setPhase('setup')}>
              {t('common.changeOptions')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowOptions((v) => !v)}>
              {showOptions ? t('common.hideOptions') : t('common.showOptions')}
            </button>
          </div>

          {showOptions && (
            <div className="chips">
              <button type="button" className={`chip ${script === 'hiragana' ? 'active' : ''}`} onClick={() => setScript('hiragana')}>
                {t('kana.hiragana')}
              </button>
              <button type="button" className={`chip ${script === 'katakana' ? 'active' : ''}`} onClick={() => setScript('katakana')}>
                {t('kana.katakana')}
              </button>
            </div>
          )}

          <div className="play-toolbar" style={{ justifyContent: 'center' }}>
            <SpeakButton text={current.kana} />
          </div>
          <div className={mode === 'kana-to-romaji' ? 'prompt-kana' : 'prompt-romaji'}>{prompt}</div>
          <div className="muted" style={{ textAlign: 'center' }}>{t('kana.score', { n: streak })}</div>

          <input
            className="answer-input"
            value={input}
            placeholder={t('kana.typeHere')}
            onChange={(e) => {
              setInput(e.target.value)
              setFeedback(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') check()
            }}
            autoFocus
          />

          <div className={`feedback ${feedback ?? ''}`}>
            {feedback === 'ok' && t('kana.correct')}
            {feedback === 'bad' && t('kana.wrong')}
            {showHint && !feedback && hint}
          </div>

          <div className="btn-row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn-accent" onClick={check}>{t('kana.submit')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowHint(true)}>{t('kana.hint')}</button>
          </div>
        </>
      )}
    </div>
  )
}
