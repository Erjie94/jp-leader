import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  loadSettings,
  markModelDownloaded as persistModelDownloaded,
  saveSettings,
  type AiGenPrefs,
  type AppLanguage,
  type AppSettings,
} from '../lib/settings'

interface SettingsContextValue {
  settings: AppSettings
  setLanguage: (language: AppLanguage) => void
  setModelId: (modelId: string) => void
  setAutoLoadModel: (auto: boolean) => void
  setAiGen: (patch: Partial<AiGenPrefs>) => void
  markModelDownloaded: (modelId: string) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation()
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())

  const setLanguage = useCallback(
    (language: AppLanguage) => {
      const next = saveSettings({ language })
      setSettings(next)
      void i18n.changeLanguage(language)
      document.documentElement.lang = language === 'ja' ? 'ja' : 'zh-Hant'
    },
    [i18n],
  )

  const setModelId = useCallback((modelId: string) => {
    setSettings(saveSettings({ modelId }))
  }, [])

  const setAutoLoadModel = useCallback((autoLoadModel: boolean) => {
    setSettings(saveSettings({ autoLoadModel }))
  }, [])

  const setAiGen = useCallback((patch: Partial<AiGenPrefs>) => {
    setSettings(saveSettings({ aiGen: { ...loadSettings().aiGen, ...patch } }))
  }, [])

  const markModelDownloaded = useCallback((modelId: string) => {
    setSettings(persistModelDownloaded(modelId))
  }, [])

  const value = useMemo(
    () => ({
      settings,
      setLanguage,
      setModelId,
      setAutoLoadModel,
      setAiGen,
      markModelDownloaded,
    }),
    [
      settings,
      setLanguage,
      setModelId,
      setAutoLoadModel,
      setAiGen,
      markModelDownloaded,
    ],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
