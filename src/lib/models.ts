/** 瀏覽器 WebLLM 可選模型（需線上首次下載權重） */
export type ModelUse = 'quiz' | 'chat'

export interface LocalModelOption {
  id: string
  label: string
  sizeHint: string
  recommended?: boolean
  suitableFor: ModelUse[]
  warnZh?: string
}

export const AVAILABLE_MODELS: LocalModelOption[] = [
  {
    id: 'gemma-2-2b-jpn-it-q4f16_1-MLC',
    label: 'Gemma-2 2B 日文',
    sizeHint: '~1.9GB · 產題推薦',
    recommended: true,
    suitableFor: ['quiz', 'chat'],
  },
  {
    id: 'gemma-2-2b-jpn-it-q4f32_1-MLC',
    label: 'Gemma-2 2B 日文（Linux／相容）',
    sizeHint: '~2.5GB · 無 f16 GPU 時較穩',
    suitableFor: ['quiz', 'chat'],
    warnZh: '適合 Linux／Chromebook 或不支援 shader-f16 的環境；較吃記憶體。',
  },
  {
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5 3B',
    sizeHint: '~2.5GB · 通用',
    suitableFor: ['quiz', 'chat'],
    warnZh: '非日文特化，產題可能夾雜其他語言；建議優先用 Gemma 日文。',
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5 1.5B',
    sizeHint: '~1.6GB · 輕量通用',
    suitableFor: ['quiz', 'chat'],
    warnZh: '非日文特化，產題較不穩；建議優先用 Gemma 日文。',
  },
  {
    id: 'Qwen3-1.7B-q4f16_1-MLC',
    label: 'Qwen3 1.7B',
    sizeHint: '~1.8GB · 對話用',
    suitableFor: ['chat'],
    warnZh: '僅建議對話／批改，不建議用於產題。',
  },
]

export function getModelOption(id: string): LocalModelOption | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id)
}

export function modelSupportsQuiz(id: string): boolean {
  return getModelOption(id)?.suitableFor.includes('quiz') ?? false
}
