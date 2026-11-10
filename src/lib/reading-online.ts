import {
  clipPassageForModel,
  parseReadingQuestionLines,
  READING_LINE_SYSTEM,
  readingUserPrompt,
  type ReadingQuestionDraft,
} from './reading-spec'

/**
 * 連網產題（可選）：OpenAI 相容 API。
 * 設定寫在 localStorage key：jp-leader-reading-online
 * { baseUrl, apiKey, model }
 * 未設定則跳過。
 */
export interface ReadingOnlineConfig {
  baseUrl: string
  apiKey: string
  model: string
}

const KEY = 'jp-leader-reading-online'

export function loadReadingOnlineConfig(): ReadingOnlineConfig | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ReadingOnlineConfig>
    if (!parsed.baseUrl || !parsed.model) return null
    return {
      baseUrl: String(parsed.baseUrl).replace(/\/$/, ''),
      apiKey: String(parsed.apiKey ?? ''),
      model: String(parsed.model),
    }
  } catch {
    return null
  }
}

export function saveReadingOnlineConfig(cfg: ReadingOnlineConfig | null): void {
  if (!cfg) {
    localStorage.removeItem(KEY)
    return
  }
  localStorage.setItem(KEY, JSON.stringify(cfg))
}

export async function generateReadingViaOnline(
  sourceText: string,
  count: number,
): Promise<ReadingQuestionDraft[]> {
  if (!navigator.onLine) throw new Error('目前離線，無法使用連網產題')
  const cfg = loadReadingOnlineConfig()
  if (!cfg) throw new Error('尚未設定連網產題（可在短文頁填入 OpenAI 相容 API）')

  const passage = clipPassageForModel(sourceText)
  const url = `${cfg.baseUrl}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.35,
      max_tokens: 900,
      messages: [
        { role: 'system', content: READING_LINE_SYSTEM },
        { role: 'user', content: readingUserPrompt(passage, count) },
      ],
    }),
  })
  if (!res.ok) {
    throw new Error(`連網產題失敗（HTTP ${res.status}）`)
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = data.choices?.[0]?.message?.content?.trim() ?? ''
  if (!text) throw new Error('連網產題回傳空白')
  return parseReadingQuestionLines(text)
}
