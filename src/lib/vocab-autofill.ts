import { toHiragana, isJapanese, isKana } from 'wanakana'

export type VocabFillDirection = 'ja2zh' | 'zh2ja'

export interface VocabAutofillResult {
  word: string
  reading: string
  meaning: string
  provider: 'google'
}

function romajiToHiragana(romaji: string): string {
  const normalized = romaji
    .trim()
    .replace(/ō/gi, 'ou')
    .replace(/ū/gi, 'uu')
    .replace(/ā/gi, 'aa')
    .replace(/ī/gi, 'ii')
    .replace(/ē/gi, 'ee')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z']/g, '')
  if (!normalized) return ''
  return toHiragana(normalized, { IMEMode: true })
}

/** 解析 Google translate_a/single JSON */
export function parseGoogleTranslatePayload(data: unknown): {
  translated: string
  sourceRomaji: string
  targetRomaji: string
} {
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('翻譯回應格式異常')
  }
  const blocks = data[0] as unknown[]
  let translated = ''
  let sourceRomaji = ''
  let targetRomaji = ''

  for (const block of blocks) {
    if (!Array.isArray(block)) continue
    if (typeof block[0] === 'string' && typeof block[1] === 'string') {
      translated += block[0]
    }
    if (block[0] == null && typeof block[2] === 'string') {
      // [null, null, targetRomaji, sourceRomaji]
      targetRomaji = block[2] || targetRomaji
      if (typeof block[3] === 'string') sourceRomaji = block[3] || sourceRomaji
    }
  }

  translated = translated.trim()
  if (!translated) throw new Error('沒有取得翻譯結果')
  return {
    translated,
    sourceRomaji: sourceRomaji.trim(),
    targetRomaji: targetRomaji.trim(),
  }
}

function buildGtxUrl(sl: string, tl: string, q: string): string {
  const params = new URLSearchParams({
    client: 'gtx',
    sl,
    tl,
    q,
  })
  return `https://translate.googleapis.com/translate_a/single?${params.toString()}&dt=t&dt=rm`
}

async function fetchGoogleTranslate(sl: string, tl: string, q: string): Promise<unknown> {
  // Electron：主行程代打，避開 CORS
  if (window.jpLeaderDesktop?.googleTranslate) {
    return window.jpLeaderDesktop.googleTranslate({ sl, tl, q })
  }

  // 瀏覽器開發／PWA：走 Vite／同源代理
  const proxyParams = new URLSearchParams({ sl, tl, q })
  const proxyUrl = `./api/gtx?${proxyParams.toString()}`
  try {
    const res = await fetch(proxyUrl)
    if (res.ok) return res.json()
  } catch {
    // fall through
  }

  // 最後直連（部分環境可能被 CORS 擋住）
  const res = await fetch(buildGtxUrl(sl, tl, q))
  if (!res.ok) throw new Error(`翻譯失敗（HTTP ${res.status}）`)
  return res.json()
}

function readingFromJapanese(word: string, sourceRomaji: string): string {
  const w = word.trim()
  if (!w) return ''
  if (isKana(w) || /^[\u3040-\u30ffー\s]+$/.test(w)) {
    return toHiragana(w)
  }
  if (sourceRomaji) return romajiToHiragana(sourceRomaji)
  // 純漢字但無羅馬字時無法可靠推測
  return ''
}

/**
 * 依方向自動補齊單字欄位。
 * - ja2zh：輸入日文 → 讀音＋繁中意思
 * - zh2ja：輸入繁中 → 日文單字＋讀音
 */
export async function autofillVocab(
  text: string,
  direction: VocabFillDirection,
): Promise<VocabAutofillResult> {
  const q = text.trim()
  if (!q) throw new Error('請先輸入文字')

  if (direction === 'ja2zh') {
    const raw = await fetchGoogleTranslate('ja', 'zh-TW', q)
    const { translated, sourceRomaji } = parseGoogleTranslatePayload(raw)
    const word = q
    const reading = readingFromJapanese(word, sourceRomaji)
    return {
      word,
      reading,
      meaning: translated,
      provider: 'google',
    }
  }

  // 中 → 日
  const raw = await fetchGoogleTranslate('zh-TW', 'ja', q)
  const { translated, targetRomaji } = parseGoogleTranslatePayload(raw)
  let word = translated
  // 取第一段較像詞的內容（避免整句）
  const firstToken = translated.split(/[\s、，,。．]/)[0]?.trim()
  if (firstToken && isJapanese(firstToken)) word = firstToken

  const reading = readingFromJapanese(word, targetRomaji)
  return {
    word,
    reading,
    meaning: q,
    provider: 'google',
  }
}
