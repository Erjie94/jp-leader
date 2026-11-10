import { CHOICE_COUNT } from './ai-gen-spec'
import { completeLines, splitFields } from './line-format'
import { isAllowedChoiceText, isAllowedQuizText } from './lang-gate'
import { isMostlyEnglish, sanitizeChoices } from './text-lang'

/** 短文理解題型 */
export type ReadingQuestionType = 'main' | 'detail' | 'inference' | 'vocab'

export interface ReadingQuestionDraft {
  type: ReadingQuestionType
  prompt: string
  answer: string
  choices: string[]
  explanation: string
}

export interface ReadingQuestion extends ReadingQuestionDraft {
  id: string
}

/** 使用者貼上的短文＋已生成題組（持久化單位） */
export interface ReadingPassageRecord {
  id: string
  title: string
  /** 原文（使用者貼上，產題依據） */
  sourceText: string
  lang: 'ja' | 'zh' | 'mixed' | 'unknown'
  questions: ReadingQuestion[]
  /** local=本機 LLM；online=連網 API；heuristic=離線規則；hybrid=混合 */
  generator: 'local' | 'online' | 'heuristic' | 'hybrid'
  createdAt: number
  lastPracticedAt: number
}

export const READING_PASSAGE_MIN = 40
export const READING_PASSAGE_MAX = 2400
export const READING_Q_MIN = 3
export const READING_Q_MAX = 5
export const READING_GEN_MAX_TOKENS = 900

const TYPE_SET = new Set<ReadingQuestionType>(['main', 'detail', 'inference', 'vocab'])

export function normalizePassageText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function clipPassageForModel(text: string, max = 1200): string {
  const t = normalizePassageText(text)
  const chars = [...t]
  if (chars.length <= max) return t
  return `${chars.slice(0, max - 1).join('')}…`
}

export function detectPassageLang(text: string): ReadingPassageRecord['lang'] {
  const t = text.replace(/\s/g, '')
  if (!t) return 'unknown'
  const ja = (t.match(/[\u3040-\u30ff一-龯]/g) ?? []).length
  const zh = (t.match(/[\u4e00-\u9fff]/g) ?? []).length
  const hasKana = /[\u3040-\u30ff]/.test(t)
  if (hasKana && ja > zh * 0.3) return 'ja'
  if (zh > 0 && !hasKana) return 'zh'
  if (ja > 0 && zh > 0) return 'mixed'
  return hasKana ? 'ja' : zh > 0 ? 'zh' : 'unknown'
}

export function defaultTitleFromPassage(text: string): string {
  const first = normalizePassageText(text).split(/\n/)[0]?.trim() ?? ''
  if (!first) return '短文練習'
  const chars = [...first]
  return chars.length > 24 ? `${chars.slice(0, 24).join('')}…` : first
}

export function validateReadingQuestion(
  raw: Partial<ReadingQuestionDraft> | null | undefined,
): ReadingQuestionDraft | null {
  if (!raw) return null
  const type = (raw.type as ReadingQuestionType) || 'detail'
  if (!TYPE_SET.has(type)) return null
  const prompt = (raw.prompt ?? '').trim()
  const answer = (raw.answer ?? '').trim()
  if (!prompt || !answer) return null
  if (!isAllowedQuizText(prompt, { allowBlank: true })) return null
  if (isMostlyEnglish(prompt) || isMostlyEnglish(answer)) return null

  const cleaned = sanitizeChoices(
    raw.choices ?? [answer],
    answer,
    [...(raw.choices ?? []), answer, 'はい', 'いいえ', 'わからない', '上記以外'],
    CHOICE_COUNT,
  )
  if (cleaned.choices.length !== CHOICE_COUNT) return null
  if (!cleaned.choices.includes(cleaned.answer)) return null
  if (!isAllowedChoiceText(cleaned.answer)) return null
  if (cleaned.choices.some((c) => !isAllowedChoiceText(c) || isMostlyEnglish(c))) return null

  const explanation = (raw.explanation ?? cleaned.answer).trim() || cleaned.answer
  if (!isAllowedQuizText(explanation, { allowBlank: true })) return null

  return {
    type,
    prompt,
    answer: cleaned.answer,
    choices: cleaned.choices,
    explanation,
  }
}

/**
 * 小模型友善一行格式：
 * type|題幹|答案|選1/選2/選3/選4|說明
 * type = main|detail|inference|vocab
 */
export function parseReadingQuestionLines(text: string): ReadingQuestionDraft[] {
  const out: ReadingQuestionDraft[] = []
  for (const line of completeLines(text)) {
    const cleaned = line.replace(/^#Q\s*/i, '').replace(/^Q\d+[:：.\s]*/, '')
    const parts = splitFields(cleaned, 3)
    if (!parts) continue
    let typeRaw = parts[0].toLowerCase()
    let prompt: string
    let answer: string
    let choiceRaw: string
    let explanation: string
    if (TYPE_SET.has(typeRaw as ReadingQuestionType)) {
      prompt = parts[1] ?? ''
      answer = parts[2] ?? ''
      choiceRaw = parts[3] ?? ''
      explanation = parts[4] ?? answer
    } else {
      // 容錯：未標 type 時當 detail
      typeRaw = 'detail'
      prompt = parts[0]
      answer = parts[1]
      choiceRaw = parts[2] ?? ''
      explanation = parts[3] ?? answer
    }
    const choices = choiceRaw
      ? choiceRaw.split(/[/／]/).map((c) => c.trim()).filter(Boolean)
      : []
    const v = validateReadingQuestion({
      type: typeRaw as ReadingQuestionType,
      prompt,
      answer,
      choices: choices.length ? choices : [answer],
      explanation,
    })
    if (v) out.push(v)
  }
  return out
}

export const READING_LINE_SYSTEM = `你是日文／繁中閱讀測驗出題者。只根據使用者提供的短文出題，不要改寫或新寫文章。
只輸出純文字行，不要 JSON、不要 markdown。
每行一題，格式：
type|題幹|答案|選項1/選項2/選項3/選項4|說明
type 只能是 main（主旨）／detail（細節）／inference（推論）／vocab（語彙）。
規則：剛好 4 個選項；答案必須在選項中；題幹與選項僅用日文或繁體中文；禁止英文與韓文；必須能從短文回答。`

export function readingUserPrompt(passage: string, count: number): string {
  const n = Math.min(READING_Q_MAX, Math.max(READING_Q_MIN, count))
  return `請依下列短文產出剛好 ${n} 題閱讀選擇題（可混合 main/detail/inference/vocab）。
短文：
---
${passage}
---`
}
