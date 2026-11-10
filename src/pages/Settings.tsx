import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PracticeHeader } from '../components/PracticeHeader'
import { useModel } from '../context/ModelContext'
import { useSettings } from '../context/SettingsContext'
import { generateContentWithAi, prefsToGenerateOptions } from '../lib/ai-generate'
import {
  clearAllFlaggedQuizzes,
  discardFlaggedQuiz,
  exportAllData,
  getLibraryStatus,
  importAllData,
  listFlaggedQuizzes,
  unflagQuizItem,
  type FlaggedQuiz,
} from '../lib/db'
import type { LibraryInfo } from '../lib/library-types'
import { applyFlagAiFix, reviewFlaggedWithAi } from '../lib/flag-ai-review'
import { getLoadedModelId, isModelReady } from '../lib/llm'
import { AVAILABLE_MODELS, getModelOption, modelSupportsQuiz } from '../lib/models'
import { resetOnboarding } from '../lib/onboarding'
import type { AppLanguage } from '../lib/settings'

export function Settings() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const {
    settings,
    setLanguage,
    setModelId,
    setAutoLoadModel,
    setAiGen,
  } = useSettings()
  const model = useModel()
  const fileRef = useRef<HTMLInputElement>(null)
  const [backupMsg, setBackupMsg] = useState('')
  const [libraryInfo, setLibraryInfo] = useState<LibraryInfo | null>(null)
  const [genBusy, setGenBusy] = useState(false)
  const [genMsg, setGenMsg] = useState('')
  const [online] = useState(() => navigator.onLine)
  const ai = settings.aiGen
  const [flagged, setFlagged] = useState<FlaggedQuiz[]>([])
  const [flagOpen, setFlagOpen] = useState(false)
  const [flagMsg, setFlagMsg] = useState('')
  const [aiReviewBusyId, setAiReviewBusyId] = useState<string | null>(null)
  const [aiReviewAllBusy, setAiReviewAllBusy] = useState(false)

  const refreshFlagged = useCallback(async () => {
    setFlagged(await listFlaggedQuizzes())
  }, [])

  useEffect(() => {
    void refreshFlagged()
  }, [refreshFlagged])

  useEffect(() => {
    void getLibraryStatus().then(setLibraryInfo)
  }, [])

  const ensureModelForFlag = async () => {
    if (!isModelReady() || getLoadedModelId() !== settings.modelId) {
      await model.reload(settings.modelId)
    }
  }

  const runAiReviewOne = async (f: FlaggedQuiz) => {
    setAiReviewBusyId(f.id)
    setFlagMsg(t('flag.aiReviewing'))
    try {
      await ensureModelForFlag()
      await reviewFlaggedWithAi(f)
      await refreshFlagged()
      setFlagMsg(t('flag.aiReviewDone'))
    } catch (e) {
      setFlagMsg(`${t('common.error')}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setAiReviewBusyId(null)
    }
  }

  const runAiReviewAll = async () => {
    if (!flagged.length) return
    setAiReviewAllBusy(true)
    setFlagOpen(true)
    try {
      await ensureModelForFlag()
      let i = 0
      for (const f of flagged) {
        i += 1
        setFlagMsg(t('flag.aiReviewProgress', { i, n: flagged.length }))
        setAiReviewBusyId(f.id)
        try {
          await reviewFlaggedWithAi(f)
        } catch {
          // 單題失敗繼續下一題
        }
        await refreshFlagged()
      }
      setFlagMsg(t('flag.aiReviewDone'))
    } catch (e) {
      setFlagMsg(`${t('common.error')}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setAiReviewBusyId(null)
      setAiReviewAllBusy(false)
    }
  }

  const doExport = async () => {
    const data = await exportAllData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `jp-leader-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setBackupMsg(t('backup.exported'))
  }

  const doImport = async (file: File | null) => {
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text) as Parameters<typeof importAllData>[0]
      await importAllData(data)
      setLibraryInfo(await getLibraryStatus())
      setBackupMsg(t('backup.imported'))
    } catch (e) {
      setBackupMsg(`${t('common.error')}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const loadSelectedModel = async () => {
    await model.reload(settings.modelId)
  }

  const onChangeModel = (id: string) => {
    setModelId(id)
    if (model.ready && getLoadedModelId() !== id) {
      void model.unload()
    }
  }

  const quizSupported = modelSupportsQuiz(settings.modelId)
  const modelWarn = getModelOption(settings.modelId)?.warnZh

  const runAiGenerate = async () => {
    if (!modelSupportsQuiz(settings.modelId)) {
      setGenMsg(t('aiGen.modelNotForQuiz'))
      return
    }
    if (!online && !model.ready && !settings.downloadedModelIds.includes(settings.modelId)) {
      setGenMsg(t('aiGen.needOnline'))
      return
    }
    setGenBusy(true)
    setGenMsg(t('aiGen.starting'))
    try {
      if (!isModelReady() || getLoadedModelId() !== settings.modelId) {
        setGenMsg(t('aiGen.loadingModel'))
        await model.reload(settings.modelId)
      }
      if (!isModelReady()) {
        throw new Error(t('settings.modelError'))
      }
      const result = await generateContentWithAi(prefsToGenerateOptions(ai), (p) => {
        const base = t(`aiGen.stage.${p.message}`, {
          vocab: p.vocabAdded ?? 0,
          defaultValue: p.message,
        })
        setGenMsg(p.detail ? `${base}（${p.detail}）` : base)
      })
      const dupVocab = Math.max(0, result.vocabGenerated - result.vocabAdded)
      setGenMsg(
        t('aiGen.doneDetail', {
          vocabAdd: result.vocabAdded,
          vocabGen: result.vocabGenerated,
          vocabDup: dupVocab,
        }),
      )
    } catch (e) {
      setGenMsg(`${t('common.error')}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setGenBusy(false)
    }
  }

  const cachedLabel =
    settings.downloadedModelIds.length > 0
      ? t('settings.cachedModels', { n: settings.downloadedModelIds.length })
      : t('settings.noCachedModels')

  return (
    <div className="panel stack">
      <PracticeHeader title={t('settings.title')} hint={t('settings.flowHint')} />

      <div className="field">
        <label>{t('settings.language')}</label>
        <select
          value={settings.language}
          onChange={(e) => {
            const lang = e.target.value as AppLanguage
            setLanguage(lang)
            void i18n.changeLanguage(lang)
          }}
        >
          <option value="zh-TW">{t('settings.zhTW')}</option>
          <option value="ja">{t('settings.ja')}</option>
        </select>
        <span className="muted">{t('settings.rememberHint')}</span>
      </div>

      <div className="stack">
        <h3>{t('settings.model')}</h3>
        <p className="muted">{t('settings.modelHint')}</p>
        <p className="muted">{t('settings.modelAuto')}</p>
        <p className="muted">{cachedLabel}</p>
        <div className="field">
          <label>{t('settings.pickModel')}</label>
          <select
            value={settings.modelId}
            onChange={(e) => onChangeModel(e.target.value)}
            disabled={model.status === 'loading'}
          >
            {AVAILABLE_MODELS.map((m) => {
              const cached = settings.downloadedModelIds.includes(m.id)
              const quizOk = m.suitableFor.includes('quiz')
              return (
                <option key={m.id} value={m.id}>
                  {m.label}（{m.sizeHint}）
                  {m.recommended ? ` · ${t('settings.recommended')}` : ''}
                  {!quizOk ? ` · ${t('settings.notForQuiz')}` : ''}
                  {cached ? ` · ${t('settings.cached')}` : ''}
                </option>
              )
            })}
          </select>
          {modelWarn && <p className="muted">{modelWarn}</p>}
        </div>
        <label className="muted" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={settings.autoLoadModel}
            onChange={(e) => setAutoLoadModel(e.target.checked)}
          />
          {t('settings.autoLoadModel')}
        </label>
        <p className="muted">
          {model.status === 'checking' && t('common.loading')}
          {model.status === 'loading' && t('settings.progress', { p: model.progress })}
          {model.status === 'ready' && `${t('settings.modelReady')} · ${model.loadedModelId ?? settings.modelId}`}
          {model.status === 'idle' && t('settings.modelIdle')}
          {model.status === 'unavailable' && t('settings.webgpuMissing')}
          {model.status === 'error' && t('settings.modelError')}
        </p>
        <p className="muted">{t('settings.linuxModelHint')}</p>

        {(model.status === 'loading' || model.progress > 0) && model.status !== 'ready' && (
          <div className="progress-bar"><span style={{ width: `${model.progress}%` }} /></div>
        )}

        {model.error && model.status !== 'ready' && <p className="feedback bad">{model.error}</p>}

        <div className="btn-row">
          <button
            type="button"
            className="btn"
            disabled={model.status === 'loading' || (model.status === 'ready' && model.loadedModelId === settings.modelId)}
            onClick={() => void loadSelectedModel()}
          >
            {t('settings.loadModel')}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={model.status !== 'ready'}
            onClick={() => void model.unload()}
          >
            {t('settings.unloadModel')}
          </button>
        </div>
      </div>

      <div className="stack">
        <h3>{t('aiGen.title')}</h3>
        <p className="muted">{t('aiGen.hint')}</p>
        <p className="muted">{t('aiGen.rules')}</p>
        {!online && <p className="muted">{t('aiGen.offlineNote')}</p>}
        <div className="field">
          <label>{t('aiGen.vocabCount')}</label>
          <input
            type="number"
            min={1}
            max={50}
            value={ai.vocabCount}
            onChange={(e) => setAiGen({ vocabCount: Number(e.target.value) || 1 })}
          />
        </div>

        {!quizSupported && (
          <p className="feedback bad">{t('aiGen.modelNotForQuiz')}</p>
        )}
        <button
          type="button"
          className="btn btn-accent"
          disabled={
            genBusy ||
            !quizSupported ||
            model.status === 'loading' ||
            model.status === 'unavailable'
          }
          onClick={() => void runAiGenerate()}
        >
          {genBusy ? t('aiGen.running') : t('aiGen.start')}
        </button>
        {genMsg && <p className="muted">{genMsg}</p>}
      </div>

      <div className="stack">
        <h3>{t('flag.title')}</h3>
        <p className="muted">{t('flag.sectionHint')}</p>
        <p className="muted">{t('flag.aiReviewHint')}</p>
        <p className="muted">{t('flag.count', { n: flagged.length })}</p>
        <div className="btn-row" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setFlagOpen((o) => !o)
              void refreshFlagged()
            }}
          >
            {flagOpen ? t('flag.close') : t('flag.open')}
          </button>
          {flagged.length > 0 && (
            <>
              <button
                type="button"
                className="btn btn-accent"
                disabled={aiReviewAllBusy || model.status === 'loading' || model.status === 'unavailable'}
                onClick={() => void runAiReviewAll()}
              >
                {aiReviewAllBusy ? t('flag.aiReviewing') : t('flag.aiReviewAll')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={aiReviewAllBusy}
                onClick={() => {
                  void (async () => {
                    await clearAllFlaggedQuizzes()
                    await refreshFlagged()
                    setFlagMsg(t('flag.cleared'))
                  })()
                }}
              >
                {t('flag.clearAll')}
              </button>
            </>
          )}
        </div>
        {flagMsg && <p className="muted">{flagMsg}</p>}
        {flagOpen && (
          <div className="stack">
            {!flagged.length && <p className="muted">{t('flag.empty')}</p>}
            {flagged.map((f) => (
              <div key={f.id} className="ready-card stack" style={{ gap: '0.4rem' }}>
                <div className="muted">
                  {t(`flag.kind.${f.kind}`)} ·{' '}
                  {t('flag.flaggedAt', { t: new Date(f.flaggedAt).toLocaleString() })}
                </div>
                <p>{f.prompt}</p>
                {f.passage && <div className="passage">{f.passage}</div>}
                {f.sentence && <p className="passage">{f.sentence}</p>}
                <p className="muted">
                  {t('flag.answer')}: {f.answer}
                </p>
                <p className="muted">
                  {t('flag.choices')}: {f.choices.join(' / ')}
                </p>
                {f.explanation && <p className="muted">{f.explanation}</p>}

                {f.aiReview && (
                  <div className="ready-card" style={{ background: 'rgba(220, 38, 38, 0.06)' }}>
                    <p>
                      <strong>{t(`flag.verdict.${f.aiReview.verdict}`)}</strong>
                      {' · '}
                      {f.aiReview.note}
                    </p>
                    {f.aiReview.issues.length > 0 && (
                      <p className="muted">{t('flag.issues')}: {f.aiReview.issues.join('；')}</p>
                    )}
                    {f.aiReview.fixed && (
                      <div className="muted stack" style={{ gap: '0.2rem' }}>
                        <p><strong>{t('flag.suggestedFix')}</strong></p>
                        {f.aiReview.fixed.prompt && <p>{t('flag.fixPrompt')}: {f.aiReview.fixed.prompt}</p>}
                        {f.aiReview.fixed.passage && <p>{t('flag.fixPassage')}: {f.aiReview.fixed.passage}</p>}
                        {f.aiReview.fixed.sentence && <p>{t('flag.fixSentence')}: {f.aiReview.fixed.sentence}</p>}
                        {f.aiReview.fixed.answer && <p>{t('flag.answer')}: {f.aiReview.fixed.answer}</p>}
                        {f.aiReview.fixed.choices && (
                          <p>{t('flag.choices')}: {f.aiReview.fixed.choices.join(' / ')}</p>
                        )}
                        {f.aiReview.fixed.explanation && (
                          <p>{t('common.explanation')}: {f.aiReview.fixed.explanation}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="btn-row" style={{ flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={
                      aiReviewBusyId === f.id ||
                      aiReviewAllBusy ||
                      model.status === 'loading' ||
                      model.status === 'unavailable'
                    }
                    onClick={() => void runAiReviewOne(f)}
                  >
                    {aiReviewBusyId === f.id ? t('flag.aiReviewing') : t('flag.aiReviewOne')}
                  </button>
                  {f.aiReview?.verdict === 'fix' && f.aiReview.fixed && (
                    <button
                      type="button"
                      className="btn btn-accent"
                      disabled={aiReviewAllBusy}
                      onClick={() => {
                        void (async () => {
                          try {
                            const fx = f.aiReview!.fixed!
                            if (!fx.prompt || !fx.answer || !fx.choices?.length) {
                              throw new Error(t('flag.aiReviewHint'))
                            }
                            await applyFlagAiFix(f, {
                              verdict: 'fix',
                              issues: f.aiReview!.issues,
                              note: f.aiReview!.note,
                              reviewedAt: f.aiReview!.reviewedAt,
                              fixed: {
                                prompt: fx.prompt,
                                sentence: fx.sentence,
                                passage: fx.passage,
                                answer: fx.answer,
                                choices: fx.choices,
                                explanation: fx.explanation ?? fx.answer,
                              },
                            })
                            await refreshFlagged()
                            setFlagMsg(t('flag.fixApplied'))
                          } catch (e) {
                            setFlagMsg(`${t('common.error')}: ${e instanceof Error ? e.message : String(e)}`)
                          }
                        })()
                      }}
                    >
                      {t('flag.applyFix')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={aiReviewAllBusy}
                    onClick={() => {
                      void (async () => {
                        await unflagQuizItem(f.id)
                        await refreshFlagged()
                        setFlagMsg(t('flag.restoredOk'))
                      })()
                    }}
                  >
                    {t('flag.restore')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={aiReviewAllBusy}
                    onClick={() => {
                      void (async () => {
                        await discardFlaggedQuiz(f.id)
                        await refreshFlagged()
                      })()
                    }}
                  >
                    {t('flag.discard')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="stack">
        <h3>{t('backup.title')}</h3>
        <p className="muted">{t('backup.hint')}</p>
        {libraryInfo && (
          <p className="muted">
            {t('backup.libraryPath', {
              backend: t(`backup.backend.${libraryInfo.backend}`),
              path: libraryInfo.path,
            })}
          </p>
        )}
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => void doExport()}>
            {t('backup.export')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            {t('backup.import')}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => void doImport(e.target.files?.[0] ?? null)}
        />
        {backupMsg && <p className="muted">{backupMsg}</p>}
      </div>

      <div className="btn-row">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            resetOnboarding()
            navigate('/welcome')
          }}
        >
          {t('settings.replayOnboard')}
        </button>
      </div>
    </div>
  )
}
