import { isModelReady, chatText } from './llm'
import { buildHeuristicReadingQuestions } from './reading-heuristic'
import { generateReadingViaOnline, loadReadingOnlineConfig } from './reading-online'
import {
  READING_GEN_MAX_TOKENS,
  READING_LINE_SYSTEM,
  READING_PASSAGE_MAX,
  READING_PASSAGE_MIN,
  READING_Q_MAX,
  READING_Q_MIN,
  clipPassageForModel,
  defaultTitleFromPassage,
  detectPassageLang,
  normalizePassageText,
  parseReadingQuestionLines,
  readingUserPrompt,
  validateReadingQuestion,
  type ReadingPassageRecord,
  type ReadingQuestion,
  type ReadingQuestionDraft,
} from './reading-spec'

export interface ReadingGenerateProgress {
  stage: 'validate' | 'local' | 'online' | 'heuristic' | 'save' | 'done'
  message: string
  detail?: string
}

export interface ReadingGenerateResult {
  passage: Omit<ReadingPassageRecord, 'id' | 'createdAt' | 'lastPracticedAt'>
  questions: ReadingQuestionDraft[]
  generator: ReadingPassageRecord['generator']
}

function clampCount(n: number): number {
  return Math.min(READING_Q_MAX, Math.max(READING_Q_MIN, Math.round(n) || 3))
}

function uniqQuestions(list: ReadingQuestionDraft[]): ReadingQuestionDraft[] {
  const seen = new Set<string>()
  const out: ReadingQuestionDraft[] = []
  for (const q of list) {
    const key = `${q.type}|${q.prompt}|${q.answer}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(q)
  }
  return out
}

function withIds(drafts: ReadingQuestionDraft[]): ReadingQuestion[] {
  return drafts.map((q) => ({ ...q, id: crypto.randomUUID() }))
}

async function generateViaLocal(
  passage: string,
  count: number,
): Promise<ReadingQuestionDraft[]> {
  if (!isModelReady()) throw new Error('本機模型尚未載入')
  const clipped = clipPassageForModel(passage)
  const { text } = await chatText(
    READING_LINE_SYSTEM,
    readingUserPrompt(clipped, count),
    0.35,
    READING_GEN_MAX_TOKENS,
  )
  const parsed = parseReadingQuestionLines(text)
    .map((q) => validateReadingQuestion(q))
    .filter((q): q is ReadingQuestionDraft => Boolean(q))
  return parsed
}

/**
 * 產題管線（重點在題目，不改寫文章）：
 * 1) 本機 WebLLM（若已載入）
 * 2) 連網 OpenAI 相容 API（若已設定且在線）
 * 3) 離線啟發式補足到 3～5 題
 */
export async function generateReadingQuestionSet(
  rawText: string,
  opts?: {
    count?: number
    title?: string
    onProgress?: (p: ReadingGenerateProgress) => void
  },
): Promise<ReadingGenerateResult> {
  const onProgress = opts?.onProgress
  onProgress?.({ stage: 'validate', message: 'checking-passage' })

  const sourceText = normalizePassageText(rawText)
  const len = [...sourceText].length
  if (len < READING_PASSAGE_MIN) {
    throw new Error(`短文太短（至少約 ${READING_PASSAGE_MIN} 字）`)
  }
  if (len > READING_PASSAGE_MAX) {
    throw new Error(`短文太長（請精簡到 ${READING_PASSAGE_MAX} 字以內）`)
  }

  const count = clampCount(opts?.count ?? 4)
  let collected: ReadingQuestionDraft[] = []
  let usedLocal = false
  let usedOnline = false
  let usedHeuristic = false

  // 1) local
  if (isModelReady()) {
    onProgress?.({ stage: 'local', message: 'generating-local', detail: `0/${count}` })
    try {
      const localQs = await generateViaLocal(sourceText, count)
      collected = uniqQuestions([...collected, ...localQs])
      usedLocal = localQs.length > 0
      onProgress?.({
        stage: 'local',
        message: 'local-done',
        detail: `${collected.length}/${count}`,
      })
    } catch (e) {
      onProgress?.({
        stage: 'local',
        message: 'local-fail',
        detail: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // 2) online（題數不足且可連網且有設定）
  if (collected.length < count && navigator.onLine && loadReadingOnlineConfig()) {
    onProgress?.({ stage: 'online', message: 'generating-online' })
    try {
      const onlineQs = await generateReadingViaOnline(sourceText, count - collected.length + 1)
      collected = uniqQuestions([...collected, ...onlineQs])
      usedOnline = onlineQs.length > 0
      onProgress?.({
        stage: 'online',
        message: 'online-done',
        detail: `${collected.length}/${count}`,
      })
    } catch (e) {
      onProgress?.({
        stage: 'online',
        message: 'online-fail',
        detail: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // 3) heuristic 保證達標
  if (collected.length < READING_Q_MIN) {
    onProgress?.({ stage: 'heuristic', message: 'generating-heuristic' })
    const h = buildHeuristicReadingQuestions(sourceText, count)
    collected = uniqQuestions([...collected, ...h])
    usedHeuristic = true
  } else if (collected.length < count) {
    const h = buildHeuristicReadingQuestions(sourceText, count)
    collected = uniqQuestions([...collected, ...h]).slice(0, count)
    usedHeuristic = true
  }

  collected = collected.slice(0, count)
  if (collected.length < READING_Q_MIN) {
    throw new Error('無法產生足夠題目，請換一段較完整的短文再試')
  }

  const generator: ReadingPassageRecord['generator'] =
    usedLocal && (usedOnline || usedHeuristic)
      ? 'hybrid'
      : usedLocal
        ? 'local'
        : usedOnline
          ? 'online'
          : 'heuristic'

  const title = (opts?.title ?? '').trim() || defaultTitleFromPassage(sourceText)
  const questions = withIds(collected)

  onProgress?.({ stage: 'done', message: 'done', detail: String(questions.length) })

  return {
    passage: {
      title,
      sourceText,
      lang: detectPassageLang(sourceText),
      questions,
      generator,
    },
    questions: collected,
    generator,
  }
}
