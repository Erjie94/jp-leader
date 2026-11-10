/** 片語分詞與挖空預覽 */

export interface PhraseToken {
  text: string
  index: number
  /** 可點選作為挖空單字 */
  selectable: boolean
}

function isPunctuation(s: string): boolean {
  return /^[\s\u3000、。．，,．.！!？?：:；;「」『』（）()【】\[\]…ー・]+$/.test(s)
}

/** 以 Intl.Segmenter（日文 word）切詞；不支援時退回整句＋手動輸入 */
export function tokenizePhrase(phrase: string): PhraseToken[] {
  const text = phrase.trim()
  if (!text) return []

  try {
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      const segmenter = new Intl.Segmenter('ja', { granularity: 'word' })
      const out: PhraseToken[] = []
      let i = 0
      for (const { segment, isWordLike } of segmenter.segment(text)) {
        if (!segment) continue
        const selectable = Boolean(isWordLike) && !isPunctuation(segment)
        out.push({ text: segment, index: i, selectable })
        i += 1
      }
      if (out.some((t) => t.selectable)) return out
    }
  } catch {
    // fall through
  }

  return [{ text, index: 0, selectable: true }]
}

/** 將片語中首次出現的 blankWord 換成 ____ */
export function applyBlank(phrase: string, blankWord: string): string {
  const p = phrase.trim()
  const b = blankWord.trim()
  if (!p || !b) return p
  const at = p.indexOf(b)
  if (at < 0) return p
  return `${p.slice(0, at)}____${p.slice(at + b.length)}`
}

export function phraseContainsBlank(phrase: string, blankWord: string): boolean {
  const p = phrase.trim()
  const b = blankWord.trim()
  return Boolean(p && b && p.includes(b))
}
