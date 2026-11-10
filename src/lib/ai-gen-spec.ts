import { isAllowedChoiceText, isAllowedQuizText } from './lang-gate'
import { isMostlyEnglish, sanitizeChoices } from './text-lang'

/** 單字短句測驗字數 */
export const SENTENCE_MIN = 5
export const SENTENCE_MAX = 30

export const CHOICE_COUNT = 4

export const VOCAB_MCQ_MAX_TOKENS = 280

/** 連續失敗上限 */
export const MAX_FAILS_MCQ = 10

export interface McqSentence {
  prompt: string
  sentence: string
  answer: string
  choices: string[]
  explanation: string
}

function charLen(s: string): number {
  return [...s.replace(/\s/g, '')].length
}

export function ensureBlank(sentence: string): string {
  const s = sentence.trim()
  if (s.includes('____') || s.includes('＿＿') || s.includes('…')) return s
  return `${s.replace(/[。．.！!？?]$/, '')}____。`
}

/** 略超過上限時裁到 SENTENCE_MAX（盡量保留空白格） */
function fitSentence(sentence: string): string | null {
  let s = ensureBlank(sentence)
  let len = charLen(s)
  if (len < SENTENCE_MIN) return null
  if (len <= SENTENCE_MAX) return s

  const blankIdx = s.indexOf('____')
  if (blankIdx >= 0) {
    const keepFrom = Math.max(0, blankIdx - Math.floor(SENTENCE_MAX / 2))
    s = s.slice(keepFrom)
    if (!s.includes('____')) s = ensureBlank(s)
  }
  const chars = [...s]
  if (chars.length > SENTENCE_MAX) {
    s = chars.slice(0, SENTENCE_MAX).join('')
    if (!s.includes('____') && !s.includes('＿＿')) s = ensureBlank(s.slice(0, Math.max(0, SENTENCE_MAX - 5)))
  }
  len = charLen(s)
  if (len < SENTENCE_MIN || len > SENTENCE_MAX + 2) return null
  return s.slice(0, SENTENCE_MAX + 2)
}

/** 單字：5～30 字、空白格、剛好 4 選項 */
export function validateMcqSentence(
  raw: Partial<McqSentence> | null | undefined,
  _opts?: { truncated?: boolean },
): McqSentence | null {
  if (!raw) return null
  const prompt = (raw.prompt ?? '').trim() || '選出正確答案'
  const sentenceRaw = (raw.sentence ?? '').trim()
  const answerRaw = (raw.answer ?? '').trim()
  if (!sentenceRaw || !answerRaw) return null

  if (!isAllowedQuizText(prompt, { allowBlank: true })) return null
  if (!isAllowedQuizText(sentenceRaw, { allowBlank: true })) return null

  const sentence = fitSentence(sentenceRaw)
  if (!sentence || !isAllowedQuizText(sentence, { allowBlank: true })) return null

  const cleaned = sanitizeChoices(
    raw.choices ?? [answerRaw],
    answerRaw,
    [...(raw.choices ?? []), 'を', 'は', 'が', 'に', 'で', '水', '本', '茶', '学校'],
    CHOICE_COUNT,
  )
  if (cleaned.choices.length !== CHOICE_COUNT) return null
  if (!cleaned.choices.includes(cleaned.answer)) return null
  if (isMostlyEnglish(cleaned.answer) || cleaned.choices.some(isMostlyEnglish)) return null
  if (!isAllowedChoiceText(cleaned.answer)) return null
  if (cleaned.choices.some((c) => !isAllowedChoiceText(c))) return null

  const explanation = (raw.explanation ?? cleaned.answer).trim() || cleaned.answer
  if (!isAllowedQuizText(explanation, { allowBlank: true })) return null

  return {
    prompt,
    sentence,
    answer: cleaned.answer,
    choices: cleaned.choices,
    explanation,
  }
}

export const MCQ_LINE_PROMPT = `只回傳一行，不要 JSON、不要 markdown、不要多餘說明。
格式：提示|含____的日文句子|答案|選項1/選項2/選項3/選項4|說明
規則：句子 ${SENTENCE_MIN}-${SENTENCE_MAX} 字；剛好 4 個選項用 / 分隔；答案必須在選項中；僅用日文與繁體中文，禁止英文與韓文。`
