import type { InitProgressCallback, MLCEngineInterface } from '@mlc-ai/web-llm'
import { extractJsonPayload } from './json-extract'
import { AVAILABLE_MODELS } from './models'
import {
  detectWebGpuCapabilities,
  resolveCompatibleModelId,
  type WebGpuCapabilities,
} from './webgpu-compat'

/** 日文特化、可離線快取，適合瀏覽器 WebGPU 產題 */
export const DEFAULT_MODEL_ID = 'gemma-2-2b-jpn-it-q4f16_1-MLC'

let engine: MLCEngineInterface | null = null
let loading: Promise<MLCEngineInterface> | null = null
let loadedModelId: string | null = null
let lastCaps: WebGpuCapabilities | null = null

export function isModelReady(): boolean {
  return engine !== null
}

export function getLoadedModelId(): string | null {
  return loadedModelId
}

export function getLastWebGpuCaps(): WebGpuCapabilities | null {
  return lastCaps
}

export async function hasWebGPU(): Promise<boolean> {
  const caps = await detectWebGpuCapabilities()
  lastCaps = caps
  return caps.available
}

export async function loadModel(
  onProgress?: InitProgressCallback,
  modelId = DEFAULT_MODEL_ID,
): Promise<MLCEngineInterface> {
  if (engine && loadedModelId === modelId) return engine
  if (loading) return loading

  if (engine && loadedModelId !== modelId) {
    await unloadModel()
  }

  loading = (async () => {
    const caps = await detectWebGpuCapabilities()
    lastCaps = caps
    if (!caps.available) {
      throw new Error(
        `無法使用 WebGPU：${caps.detail}。Linux／Chromebook 請用較新 Chrome／Chromium，並確認已啟用硬體加速。`,
      )
    }

    const resolvedId = resolveCompatibleModelId(modelId, caps)
    const { CreateMLCEngine } = await import('@mlc-ai/web-llm')
    try {
      const e = await CreateMLCEngine(resolvedId, {
        initProgressCallback: onProgress,
        // 瀏覽器 IndexedDB 快取，Linux 跨工作階段可重用
        appConfig: undefined,
      })
      engine = e
      loadedModelId = resolvedId
      return e
    } catch (e) {
      // f16 路徑失敗時再硬改 f32 重試一次
      if (resolvedId.includes('q4f16')) {
        const fallback = resolveCompatibleModelId(resolvedId, { hasShaderF16: false })
        if (fallback !== resolvedId) {
          const e2 = await CreateMLCEngine(fallback, {
            initProgressCallback: onProgress,
          })
          engine = e2
          loadedModelId = fallback
          return e2
        }
      }
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(
        `模型載入失敗（${resolvedId}）：${msg}` +
          (caps.hasShaderF16
            ? ''
            : '。此環境無 shader-f16，已嘗試 q4f32；若仍失敗請更新顯示卡驅動或改用較新 Chrome。'),
      )
    } finally {
      loading = null
    }
  })()

  return loading
}

export async function unloadModel(): Promise<void> {
  if (engine) {
    await engine.unload()
    engine = null
    loadedModelId = null
  }
}

export { extractJsonPayload }

export interface ChatResult {
  text: string
  finishReason?: string | null
  truncated: boolean
}

/** 原始文字回覆（不強制 JSON）；截斷也不丟內容 */
export async function chatText(
  system: string,
  user: string,
  temperature = 0.3,
  maxTokens = 512,
): Promise<ChatResult> {
  if (!engine) throw new Error('Model not loaded')

  const reply = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    max_tokens: maxTokens,
  })

  const text = reply.choices[0]?.message?.content?.trim() ?? ''
  const finishReason = reply.choices[0]?.finish_reason ?? null
  return {
    text,
    finishReason,
    truncated: finishReason === 'length',
  }
}

/** 仍提供 JSON 模式；失敗時拋錯（練習頁用）。AI 產庫請改用 chatText + 行格式 */
export async function chatJson<T>(
  system: string,
  user: string,
  temperature = 0.4,
  maxTokens = 1024,
): Promise<T> {
  const { text, truncated } = await chatText(system, user, temperature, maxTokens)
  if (!text) throw new Error('Model returned empty response')
  try {
    const payload = extractJsonPayload(text)
    return JSON.parse(payload) as T
  } catch (e) {
    if (truncated) {
      try {
        const payload = extractJsonPayload(text)
        return JSON.parse(payload) as T
      } catch {
        throw new Error('模型輸出過長被截斷，請改為較少題數或使用行格式產題。')
      }
    }
    const hint = e instanceof Error ? e.message : String(e)
    throw new Error(`Failed to parse model JSON: ${hint}`)
  }
}

export function listSelectableModels() {
  return AVAILABLE_MODELS
}
