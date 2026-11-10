/** WebGPU／Linux 相容性：偵測能力並將 f16 模型對應到 f32 */

export interface WebGpuCapabilities {
  available: boolean
  /** 多數 Linux／舊 GPU 可能沒有 shader-f16 */
  hasShaderF16: boolean
  detail: string
}

export async function detectWebGpuCapabilities(): Promise<WebGpuCapabilities> {
  if (!('gpu' in navigator)) {
    return {
      available: false,
      hasShaderF16: false,
      detail: '瀏覽器未提供 WebGPU（navigator.gpu）',
    }
  }

  try {
    const gpu = (navigator as Navigator & {
      gpu: {
        requestAdapter: (opts?: {
          powerPreference?: 'high-performance' | 'low-power'
        }) => Promise<{
          features: { has: (name: string) => boolean }
          requestDevice?: () => Promise<unknown>
        } | null>
      }
    }).gpu

    // Linux／整合顯示卡有時 high-performance 會失敗，改試兩種偏好
    let adapter =
      (await gpu.requestAdapter({ powerPreference: 'high-performance' })) ??
      (await gpu.requestAdapter({ powerPreference: 'low-power' })) ??
      (await gpu.requestAdapter())

    if (!adapter) {
      return {
        available: false,
        hasShaderF16: false,
        detail: '找不到可用的 WebGPU adapter（驅動／權限／無 GPU）',
      }
    }

    const hasShaderF16 =
      adapter.features.has('shader-f16') || adapter.features.has('shader-f16' as never)

    return {
      available: true,
      hasShaderF16,
      detail: hasShaderF16 ? 'WebGPU + shader-f16' : 'WebGPU（無 shader-f16，將改用 q4f32）',
    }
  } catch (e) {
    return {
      available: false,
      hasShaderF16: false,
      detail: e instanceof Error ? e.message : String(e),
    }
  }
}

/** 無 f16 時把 q4f16 型號改成對應 q4f32（WebLLM 預建清單有對應項） */
export function resolveCompatibleModelId(
  modelId: string,
  caps: Pick<WebGpuCapabilities, 'hasShaderF16'>,
): string {
  if (caps.hasShaderF16) return modelId
  if (modelId.includes('q4f16')) {
    return modelId.replace(/q4f16/g, 'q4f32')
  }
  return modelId
}

export function isLikelyLinuxHost(): boolean {
  const ua = navigator.userAgent.toLowerCase()
  return (
    ua.includes('linux') ||
    ua.includes('cros') ||
    ua.includes('chromium os') ||
    Boolean((window.jpLeaderDesktop?.platform ?? '').toLowerCase().includes('linux'))
  )
}
