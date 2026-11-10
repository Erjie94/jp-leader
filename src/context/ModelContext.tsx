import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  getLastWebGpuCaps,
  getLoadedModelId,
  hasWebGPU,
  isModelReady,
  loadModel,
  unloadModel,
} from '../lib/llm'
import { isLikelyLinuxHost } from '../lib/webgpu-compat'
import { useSettings } from './SettingsContext'

type ModelStatus = 'idle' | 'checking' | 'loading' | 'ready' | 'unavailable' | 'error'

interface ModelContextValue {
  status: ModelStatus
  progress: number
  error: string
  ready: boolean
  loadedModelId: string | null
  reload: (modelId?: string) => Promise<void>
  unload: () => Promise<void>
  ensureLoaded: () => Promise<boolean>
}

const ModelContext = createContext<ModelContextValue | null>(null)

export function ModelProvider({ children }: { children: ReactNode }) {
  const { settings, markModelDownloaded } = useSettings()
  const [status, setStatus] = useState<ModelStatus>('checking')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [loadedModelId, setLoadedModelId] = useState<string | null>(getLoadedModelId())
  const autoStarted = useRef(false)

  const reload = useCallback(async (modelId?: string) => {
    const target = modelId ?? settings.modelId
    setStatus('loading')
    setError('')
    setProgress(0)
    try {
      const ok = await hasWebGPU()
      if (!ok) {
        const caps = getLastWebGpuCaps()
        const linuxHint = isLikelyLinuxHost()
          ? ' Linux／Chromebook：請使用較新 Chrome，並在設定中啟用硬體加速；必要時改選「Gemma 日文（Linux／相容）」q4f32。'
          : ''
        setError(`${caps?.detail ?? 'WebGPU 不可用'}。${linuxHint}`)
        setStatus('unavailable')
        return
      }
      await loadModel((report) => {
        setProgress(Math.round((report.progress ?? 0) * 100))
      }, target)
      setProgress(100)
      // 實際載入的可能是 f32 相容版
      const actual = getLoadedModelId()
      setLoadedModelId(actual)
      markModelDownloaded(actual ?? target)
      setStatus('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [settings.modelId, markModelDownloaded])

  const unload = useCallback(async () => {
    await unloadModel()
    setLoadedModelId(null)
    setStatus('idle')
    setProgress(0)
  }, [])

  const ensureLoaded = useCallback(async () => {
    if (isModelReady() && getLoadedModelId() === settings.modelId) {
      setStatus('ready')
      return true
    }
    if (status === 'unavailable') return false
    if (status === 'loading') return false
    await reload(settings.modelId)
    return isModelReady()
  }, [reload, settings.modelId, status])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (isModelReady()) {
        if (!cancelled) {
          setLoadedModelId(getLoadedModelId())
          setStatus('ready')
        }
        return
      }
      const ok = await hasWebGPU()
      if (cancelled) return
      if (!ok) {
        setStatus('unavailable')
        return
      }

      const shouldAuto =
        settings.autoLoadModel &&
        (settings.downloadedModelIds.includes(settings.modelId) ||
          settings.downloadedModelIds.length > 0)

      if (shouldAuto && !autoStarted.current) {
        autoStarted.current = true
        setStatus('loading')
        try {
          await loadModel((report) => {
            if (!cancelled) setProgress(Math.round((report.progress ?? 0) * 100))
          }, settings.modelId)
          if (cancelled) return
          setProgress(100)
          setLoadedModelId(getLoadedModelId())
          markModelDownloaded(settings.modelId)
          setStatus('ready')
        } catch (e) {
          if (cancelled) return
          // 快取損壞或離線且無快取：退回 idle，不阻斷使用
          setError(e instanceof Error ? e.message : String(e))
          setStatus('idle')
        }
        return
      }

      setStatus('idle')
    })()
    return () => {
      cancelled = true
    }
    // 只在首次掛載依設定嘗試自動載入
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo(
    () => ({
      status,
      progress,
      error,
      ready: status === 'ready' || isModelReady(),
      loadedModelId,
      reload,
      unload,
      ensureLoaded,
    }),
    [status, progress, error, loadedModelId, reload, unload, ensureLoaded],
  )

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>
}

export function useModel() {
  const ctx = useContext(ModelContext)
  if (!ctx) throw new Error('useModel must be used within ModelProvider')
  return ctx
}
