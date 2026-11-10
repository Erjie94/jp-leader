import { toHiragana, isKana } from 'wanakana'
import { parseGoogleTranslatePayload } from './vocab-autofill'

export type PhraseFillDirection = 'ja2zh' | 'zh2ja'

export interface PhraseAutofillResult {
  phrase: string
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
  if (window.jpLeaderDesktop?.googleTranslate) {
    return window.jpLeaderDesktop.googleTranslate({ sl, tl, q })
  }

  const proxyParams = new URLSearchParams({ sl, tl, q })
  const proxyUrl = `./api/gtx?${proxyParams.toString()}`
  try {
    const res = await fetch(proxyUrl)
    if (res.ok) return res.json()
  } catch {
    // fall through
  }

  const res = await fetch(buildGtxUrl(sl, tl, q))
  if (!res.ok) throw new Error(`翻譯失敗（HTTP ${res.status}）`)
  return res.json()
}

function readingFromJapanese(phrase: string, sourceRomaji: string): string {
  const w = phrase.trim()
  if (!w) return ''
  if (isKana(w) || /^[\u3040-\u30ffー\s]+$/.test(w)) {
    return toHiragana(w)
  }
  if (sourceRomaji) return romajiToHiragana(sourceRomaji)
  return ''
}

/**
 * 片語自動填入（保留完整句子，不做單字截斷）
 * - ja2zh：日文片語 → 讀音＋繁中意思
 * - zh2ja：繁中 → 日文片語＋讀音
 */
export async function autofillPhrase(
  text: string,
  direction: PhraseFillDirection,
): Promise<PhraseAutofillResult> {
  const q = text.trim()
  if (!q) throw new Error('請先輸入文字')

  if (direction === 'ja2zh') {
    const raw = await fetchGoogleTranslate('ja', 'zh-TW', q)
    const { translated, sourceRomaji } = parseGoogleTranslatePayload(raw)
    return {
      phrase: q,
      reading: readingFromJapanese(q, sourceRomaji),
      meaning: translated,
      provider: 'google',
    }
  }

  const raw = await fetchGoogleTranslate('zh-TW', 'ja', q)
  const { translated, targetRomaji } = parseGoogleTranslatePayload(raw)
  const phrase = translated.trim()
  return {
    phrase,
    reading: readingFromJapanese(phrase, targetRomaji),
    meaning: q,
    provider: 'google',
  }
}
