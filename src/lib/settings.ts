export type AppLanguage = 'zh-TW' | 'ja'

export interface AiGenPrefs {
  vocabCount: number
}

export interface AppSettings {
  language: AppLanguage
  /** WebLLM 模型 ID */
  modelId: string
  /** 開啟程式時若已下載過模型則自動載入 */
  autoLoadModel: boolean
  /** 曾成功下載／載入過的模型 ID（權重由 WebLLM 快取於瀏覽器） */
  downloadedModelIds: string[]
  /** AI 建立單字資料的偏好 */
  aiGen: AiGenPrefs
}

const KEY = 'jp-leader-settings'

const defaultAiGen: AiGenPrefs = {
  vocabCount: 12,
}

const defaults: AppSettings = {
  language: 'zh-TW',
  modelId: 'gemma-2-2b-jpn-it-q4f16_1-MLC',
  autoLoadModel: true,
  downloadedModelIds: [],
  aiGen: { ...defaultAiGen },
}

function clampCount(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, Math.round(v)))
}

function normalizeAiGen(raw: Partial<AiGenPrefs> | undefined): AiGenPrefs {
  return {
    vocabCount: clampCount(raw?.vocabCount, 1, 50, defaultAiGen.vocabCount),
  }
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...defaults, aiGen: { ...defaultAiGen } }
    const parsed = JSON.parse(raw) as Partial<AppSettings> & {
      level?: string
      readingPromptLang?: string
      aiGen?: Partial<AiGenPrefs> & {
        level?: string
        includeVocab?: boolean
        includePhrase?: boolean
        includeReading?: boolean
        phraseCount?: number
        readingCount?: number
      }
    }
    return {
      language: parsed.language ?? defaults.language,
      modelId: parsed.modelId ?? defaults.modelId,
      autoLoadModel: parsed.autoLoadModel !== false,
      downloadedModelIds: Array.isArray(parsed.downloadedModelIds)
        ? parsed.downloadedModelIds.filter((x): x is string => typeof x === 'string')
        : [],
      aiGen: normalizeAiGen(parsed.aiGen),
    }
  } catch {
    return { ...defaults, aiGen: { ...defaultAiGen } }
  }
}

export function saveSettings(next: Partial<AppSettings>): AppSettings {
  const current = loadSettings()
  const merged: AppSettings = {
    ...current,
    ...next,
    aiGen: next.aiGen
      ? normalizeAiGen({ ...current.aiGen, ...next.aiGen })
      : current.aiGen,
    downloadedModelIds: next.downloadedModelIds ?? current.downloadedModelIds,
  }
  localStorage.setItem(KEY, JSON.stringify(merged))
  return merged
}

export function markModelDownloaded(modelId: string): AppSettings {
  const current = loadSettings()
  if (current.downloadedModelIds.includes(modelId)) {
    return saveSettings({ modelId })
  }
  return saveSettings({
    modelId,
    downloadedModelIds: [...current.downloadedModelIds, modelId],
  })
}

export function hasDownloadedModel(modelId: string): boolean {
  return loadSettings().downloadedModelIds.includes(modelId)
}
