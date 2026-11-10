import { chatText, isModelReady } from './llm'
import { tokenizePhrase } from './phrase-tokens'

const PARTICLES = new Set([
  'は',
  'が',
  'を',
  'に',
  'で',
  'と',
  'も',
  'へ',
  'から',
  'まで',
  'より',
  'や',
  'の',
  'ね',
  'よ',
  'か',
])

export type BlankRole = 'particle' | 'content' | 'other'

export interface BlankPick {
  blankWord: string
  role: BlankRole
  source: 'manual' | 'model' | 'heuristic'
}

export function classifyBlankRole(token: string): BlankRole {
  const t = token.trim()
  if (!t) return 'other'
  if (PARTICLES.has(t)) return 'particle'
  if (t.length >= 1) return 'content'
  return 'other'
}

export function listBlankCandidates(phrase: string): Array<{ text: string; role: BlankRole }> {
  const tokens = tokenizePhrase(phrase)
    .filter((t) => t.selectable)
    .map((t) => t.text.trim())
    .filter(Boolean)
  const uniq = [...new Set(tokens)]
  return uniq.map((text) => ({ text, role: classifyBlankRole(text) }))
}

/** 啟發式：優先內容詞，其次助詞；略過過短標點 */
export function pickBlankHeuristic(phrase: string): BlankPick | null {
  const candidates = listBlankCandidates(phrase)
  if (!candidates.length) {
    const fallback = phrase.trim()
    if (!fallback) return null
    return { blankWord: fallback, role: 'other', source: 'heuristic' }
  }
  const content = candidates.filter((c) => c.role === 'content')
  const particles = candidates.filter((c) => c.role === 'particle')
  const pick = content[0] ?? particles[0] ?? candidates[0]
  return { blankWord: pick.text, role: pick.role, source: 'heuristic' }
}

/** 本機模型選挖空；失敗回退啟發式 */
export async function pickBlankWithModel(phrase: string): Promise<BlankPick> {
  const heuristic = pickBlankHeuristic(phrase)
  if (!heuristic) {
    throw new Error('無法從片語挑選挖空位置')
  }
  if (!isModelReady()) return heuristic

  const candidates = listBlankCandidates(phrase)
    .map((c) => c.text)
    .slice(0, 12)
  if (candidates.length <= 1) return heuristic

  try {
    const { text: raw } = await chatText(
      '你是日文文法助教。只回覆要挖空的「一個詞」，必須是使用者片語中的子字串。不要解釋。',
      `片語：${phrase}\n候選：${candidates.join(' / ')}\n請選一個最適合考文法或關鍵單詞的挖空詞。`,
      0.2,
      24,
    )
    const line = raw
      .split(/\r?\n/)[0]
      ?.replace(/^[「『"']|[」』"']$/g, '')
      .trim()
    if (line && phrase.includes(line)) {
      return {
        blankWord: line,
        role: classifyBlankRole(line),
        source: 'model',
      }
    }
  } catch {
    // fall through
  }
  return heuristic
}

export async function resolveBlankWord(
  phrase: string,
  manualBlank: string,
): Promise<BlankPick> {
  const manual = manualBlank.trim()
  if (manual && phrase.includes(manual)) {
    return { blankWord: manual, role: classifyBlankRole(manual), source: 'manual' }
  }
  return pickBlankWithModel(phrase)
}
