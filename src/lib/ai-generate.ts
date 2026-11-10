import { bulkAddVocab, listVocab, type VocabEntry } from './db'
import { syncVocabEntriesQuizzes } from './vocab-quiz-sync'
import {
  CHOICE_COUNT,
  MAX_FAILS_MCQ,
  MCQ_LINE_PROMPT,
  VOCAB_MCQ_MAX_TOKENS,
  validateMcqSentence,
  type McqSentence,
} from './ai-gen-spec'
import { parsePhraseLine, parseVocabLines } from './line-format'
import { chatText, isModelReady } from './llm'
import { shuffle } from './quiz-fallback'
import type { AiGenPrefs } from './settings'
import { sanitizeChoices, sanitizeMeaningField, toZhMeaning } from './text-lang'

export interface AiGenerateOptions {
  vocabCount?: number
}

export interface AiGenerateProgress {
  stage: string
  message: string
  vocabAdded?: number
  detail?: string
}

export interface AiGenerateResult {
  vocabAdded: number
  vocabGenerated: number
}

export function prefsToGenerateOptions(prefs: AiGenPrefs): AiGenerateOptions {
  return {
    vocabCount: prefs.vocabCount,
  }
}

function zhMeaning(raw: string): string {
  const m = sanitizeMeaningField(toZhMeaning(raw))
  return m || raw
}

function vocabEntryFromMcq(q: McqSentence): Omit<VocabEntry, 'id' | 'createdAt'> {
  const word = q.answer
  const meaningMatch = q.explanation.match(/[=＝]\s*(.+)$/)
  const meaning = zhMeaning(meaningMatch?.[1]?.trim() || q.prompt.replace(/^選/, '') || word)
  return {
    word,
    reading: '',
    meaning,
    source: 'ai',
  }
}

function synthesizeVocabMcq(
  word: string,
  reading: string,
  meaning: string,
  distractors: string[],
): McqSentence | null {
  const cleaned = sanitizeChoices(
    [word, ...distractors],
    word,
    distractors,
    CHOICE_COUNT,
  )
  if (cleaned.choices.length !== CHOICE_COUNT) return null
  return validateMcqSentence({
    prompt: '選出正確單字',
    sentence: 'これは____です。',
    answer: cleaned.answer,
    choices: cleaned.choices,
    explanation: `${word}${reading ? `（${reading}）` : ''}＝${zhMeaning(meaning)}`,
  })
}

const OFFLINE_VOCAB_SEEDS: Array<Partial<McqSentence>> = [
  {
    prompt: '選出正確的助詞',
    sentence: '水____飲みます。',
    answer: 'を',
    choices: ['を', 'は', 'が', 'に'],
    explanation: '他動詞的賓語用「を」。',
  },
  {
    prompt: '選出正確的助詞',
    sentence: '明日、学校____行きます。',
    answer: 'に',
    choices: ['に', 'で', 'を', 'は'],
    explanation: '移動目的地用「に」。',
  },
  {
    prompt: '選出正確單字',
    sentence: 'これは____です。',
    answer: '本',
    choices: ['本', '水', '車', '茶'],
    explanation: '本＝書',
  },
  {
    prompt: '選出正確的句末',
    sentence: '今日はいい天気____。',
    answer: 'です',
    choices: ['です', 'だ', 'ます', 'する'],
    explanation: '丁寧形名詞句用「です」。',
  },
]

function offlineVocabFallback(count: number): McqSentence[] {
  const out: McqSentence[] = []
  for (const q of OFFLINE_VOCAB_SEEDS) {
    if (out.length >= count) break
    const v = validateMcqSentence(q)
    if (v) out.push(v)
  }
  return out
}

async function generateOneMcq(): Promise<McqSentence | null> {
  const example = `選單字|これは____です。|水|水/茶/本/車|水＝水`
  const { text } = await chatText(
    MCQ_LINE_PROMPT,
    `日文單字四選一。
請完全依照此結構產出一行：
${example}
僅輸出一行；禁止英文與韓文。`,
    0.35,
    VOCAB_MCQ_MAX_TOKENS,
  )
  const parsed = parsePhraseLine(text)
  return validateMcqSentence(parsed)
}

async function generateVocabViaWordLines(
  need: number,
  avoid: Set<string>,
): Promise<McqSentence[]> {
  const { text } = await chatText(
    '只輸出純文字行，不要 JSON、不要 markdown。僅用日文與繁體中文。',
    `請寫 ${Math.min(3, need)} 行單字：
日文|讀音|繁中意思
範例：
水|みず|水
本|ほん|書`,
    0.4,
    280,
  )

  const words = parseVocabLines(text)
    .filter((w) => w.word && !avoid.has(w.word))
    .slice(0, need)

  const pool = words.map((w) => w.word)
  const out: McqSentence[] = []
  for (const w of words) {
    const distractors = shuffle(pool.filter((x) => x !== w.word)).slice(0, 3)
    const fillers = ['水', '本', '茶', '車', '学校', '友達']
    const q = synthesizeVocabMcq(
      w.word,
      w.reading,
      w.meaning,
      distractors.length ? distractors : fillers,
    )
    if (q) {
      out.push(q)
      avoid.add(w.word)
    }
  }
  return out
}

/** 需模型已載入。僅產單字題／詞條。 */
export async function generateContentWithAi(
  options: AiGenerateOptions = {},
  kindOrProgress?: 'vocab' | 'all' | ((p: AiGenerateProgress) => void),
  maybeProgress?: (p: AiGenerateProgress) => void,
): Promise<AiGenerateResult> {
  const opts = options
  const onProgress =
    typeof kindOrProgress === 'function' ? kindOrProgress : maybeProgress

  if (!isModelReady()) throw new Error('Model not loaded')

  const target = Math.min(50, Math.max(1, opts.vocabCount ?? 12))
  onProgress?.({ stage: 'vocab', message: 'generating-vocab', detail: `0/${target}` })

  const qs: McqSentence[] = []
  const avoid = new Set<string>()
  let fails = 0
  while (qs.length < target && fails < MAX_FAILS_MCQ) {
    try {
      const one = await generateOneMcq()
      if (one) {
        qs.push(one)
        avoid.add(one.answer)
        fails = 0
      } else {
        const batch = await generateVocabViaWordLines(
          Math.min(3, target - qs.length),
          avoid,
        )
        if (batch.length) {
          qs.push(...batch)
          fails = 0
        } else {
          fails += 1
        }
      }
    } catch {
      fails += 1
    }
    onProgress?.({
      stage: 'vocab',
      message: 'generating-vocab',
      detail: `${Math.min(qs.length, target)}/${target}`,
    })
  }

  if (qs.length === 0) {
    qs.push(...offlineVocabFallback(Math.min(4, target)))
  }

  const clipped = qs.slice(0, target)
  const vocabGenerated = clipped.length
  const entries = clipped.map((q) => vocabEntryFromMcq(q))
  await bulkAddVocab(entries)
  // 寫入單字庫後依三模式同步題庫（不再使用 mode:'choice'）
  const all = await listVocab()
  const justAdded = all.filter((v) =>
    entries.some((e) => e.word === v.word && e.meaning === v.meaning),
  )
  const vocabAdded = await syncVocabEntriesQuizzes(justAdded.length ? justAdded : all.slice(-entries.length))
  onProgress?.({ stage: 'vocab', message: 'vocab-done', vocabAdded })

  if (vocabGenerated === 0) {
    throw new Error('沒有產出可用單字內容。請確認模型已載入後再試。')
  }

  onProgress?.({
    stage: 'done',
    message: 'done',
    vocabAdded,
  })

  return { vocabAdded, vocabGenerated }
}
