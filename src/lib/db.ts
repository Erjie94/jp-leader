import type { ReadingPassageRecord } from './reading-spec'
import { flushLibrary, getLibrarySnapshot, replaceLibrary, updateLibrary } from './library-store'
import { normalizeLibrarySnapshot } from './library-types'
import {
  isVocabQuizMode,
  PHRASE_QUIZ_MODE,
  VOCAB_QUIZ_MODES,
  type VocabQuizMode,
} from './quiz-modes'

export type { VocabQuizMode }
export { isVocabQuizMode, PHRASE_QUIZ_MODE, VOCAB_QUIZ_MODES }
export {
  inferVocabModeFromPrompt,
  migrateQuizBankModes,
} from './quiz-modes'

export interface VocabEntry {
  id: string
  word: string
  reading: string
  meaning: string
  /** openjlpt／thesaurus 僅相容舊資料，新寫入勿再使用 */
  source: 'manual' | 'openjlpt' | 'csv' | 'thesaurus' | 'ai'
  createdAt: number
}

/** 片語庫：完整片語＋標註要挖空的單字 */
export interface PhraseEntry {
  id: string
  phrase: string
  reading: string
  meaning: string
  /** 練習時挖空的單字（須為 phrase 的子字串） */
  blankWord: string
  source: 'manual' | 'ai'
  createdAt: number
}

export type QuizKind = 'vocab' | 'phrase' | 'reading'

export interface StoredQuiz {
  id: string
  kind: QuizKind
  /** vocab：三模式；phrase：blank；reading：main/detail/… */
  mode?: string
  prompt: string
  sentence?: string
  /** 閱讀篇：整段短文 */
  passage?: string
  /** 閱讀篇：題目 JSON 字串 */
  extra?: string
  answer: string
  choices: string[]
  explanation: string
  /** 各選項註解（正解為何對、錯項為何錯）；key = 選項文字 */
  choiceExplanations?: Record<string, string>
  source: 'local' | 'model' | 'fallback' | 'builtin'
  createdAt: number
  lastShownAt: number
  showCount: number
}

export interface ReviewItem {
  id: string
  kind: 'vocab' | 'phrase' | 'reading'
  prompt: string
  sentence?: string
  answer: string
  choices: string[]
  explanation: string
  choiceExplanations?: Record<string, string>
  mode?: string
  dueAt: number
  ease: number
  wrongCount: number
  rightCount: number
  updatedAt: number
}

export interface PracticeEvent {
  id: string
  module: 'kana' | 'vocab' | 'phrase' | 'reading' | 'conversation' | 'review' | 'exam'
  correct: boolean
  at: number
}

/** 使用者標記「題目／選項有問題」的項目（練習時迴避，設定頁審視） */
export type FlaggedKind = QuizKind | 'exam'

export interface FlaggedAiReviewStored {
  verdict: 'ok' | 'fix' | 'discard'
  issues: string[]
  note: string
  /** 整題修正稿（成套替換） */
  fixed?: {
    prompt?: string
    sentence?: string
    passage?: string
    answer?: string
    choices?: string[]
    explanation?: string
  }
  reviewedAt: number
}

export interface FlaggedQuiz {
  id: string
  fingerprint: string
  kind: FlaggedKind
  prompt: string
  sentence?: string
  passage?: string
  answer: string
  choices: string[]
  explanation?: string
  /** 若來自題庫，一併記住以便刪除 */
  quizId?: string
  flaggedAt: number
  /** AI 審視結果（可選） */
  aiReview?: FlaggedAiReviewStored
}

export function quizFingerprint(input: {
  kind: string
  prompt: string
  answer: string
  sentence?: string
  passage?: string
  choices?: string[]
  mode?: string
}): string {
  const choices = (input.choices ?? []).slice().sort().join('/')
  return [
    input.kind,
    (input.mode ?? '').trim(),
    input.prompt.trim(),
    input.answer.trim(),
    (input.sentence ?? '').trim(),
    (input.passage ?? '').trim(),
    choices,
  ].join('|')
}

function withoutLevel<T extends object>(row: T): T {
  if (!row || typeof row !== 'object' || !('level' in row)) return row
  const { level: _removed, ...rest } = row as T & { level?: unknown }
  return rest as T
}

export async function listVocab(): Promise<VocabEntry[]> {
  const snap = await getLibrarySnapshot()
  return snap.vocab.map(withoutLevel)
}

export async function addVocab(entry: Omit<VocabEntry, 'id' | 'createdAt'>): Promise<VocabEntry> {
  const record: VocabEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  }
  await updateLibrary((draft) => {
    draft.vocab.push(record)
  })
  return record
}

export async function bulkAddVocab(
  entries: Omit<VocabEntry, 'id' | 'createdAt'>[],
): Promise<number> {
  let added = 0
  await updateLibrary((draft) => {
    const byKey = new Map(draft.vocab.map((e) => [`${e.word}|${e.reading}`, e]))
    for (const entry of entries) {
      const key = `${entry.word}|${entry.reading}`
      const prev = byKey.get(key)
      if (prev) {
        if (entry.meaning && entry.meaning !== prev.meaning) {
          prev.meaning = entry.meaning
        }
        continue
      }
      const record: VocabEntry = {
        ...entry,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      }
      byKey.set(key, record)
      draft.vocab.push(record)
      added += 1
    }
  })
  return added
}

export async function clearVocab(): Promise<void> {
  await updateLibrary((draft) => {
    draft.vocab = []
  })
}

export async function listPhrases(): Promise<PhraseEntry[]> {
  const snap = await getLibrarySnapshot()
  return snap.phrases.map(withoutLevel)
}

export async function addPhrase(
  entry: Omit<PhraseEntry, 'id' | 'createdAt'>,
): Promise<PhraseEntry> {
  const record: PhraseEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  }
  await updateLibrary((draft) => {
    draft.phrases.push(record)
  })
  return record
}

export async function bulkAddPhrases(
  entries: Omit<PhraseEntry, 'id' | 'createdAt'>[],
): Promise<number> {
  let added = 0
  await updateLibrary((draft) => {
    const byKey = new Map(draft.phrases.map((e) => [`${e.phrase}|${e.blankWord}`, e]))
    for (const entry of entries) {
      const key = `${entry.phrase}|${entry.blankWord}`
      if (byKey.has(key)) continue
      const record: PhraseEntry = {
        ...entry,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      }
      byKey.set(key, record)
      draft.phrases.push(record)
      added += 1
    }
  })
  return added
}

export async function clearPhrases(): Promise<void> {
  await updateLibrary((draft) => {
    draft.phrases = []
  })
}

export async function listReadingPassages(): Promise<ReadingPassageRecord[]> {
  const snap = await getLibrarySnapshot()
  return [...snap.readingPassages].sort((a, b) => b.createdAt - a.createdAt)
}

export async function getReadingPassage(id: string): Promise<ReadingPassageRecord | undefined> {
  const snap = await getLibrarySnapshot()
  return snap.readingPassages.find((r) => r.id === id)
}

export async function addReadingPassage(
  entry: Omit<ReadingPassageRecord, 'id' | 'createdAt' | 'lastPracticedAt'>,
): Promise<ReadingPassageRecord> {
  const record: ReadingPassageRecord = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    lastPracticedAt: 0,
  }
  await updateLibrary((draft) => {
    draft.readingPassages.push(record)
  })
  return record
}

export async function touchReadingPassagePracticed(id: string): Promise<void> {
  await updateLibrary((draft) => {
    const row = draft.readingPassages.find((r) => r.id === id)
    if (row) row.lastPracticedAt = Date.now()
  })
}

export async function deleteReadingPassage(id: string): Promise<void> {
  await updateLibrary((draft) => {
    draft.readingPassages = draft.readingPassages.filter((r) => r.id !== id)
  })
}

export async function clearReadingPassages(): Promise<void> {
  await updateLibrary((draft) => {
    draft.readingPassages = []
  })
}

export async function countReadingPassages(): Promise<number> {
  const snap = await getLibrarySnapshot()
  return snap.readingPassages.length
}

export async function normalizeEnglishMeanings(
  translate: (raw: string) => string,
  isEnglish: (raw: string) => boolean,
): Promise<number> {
  let changed = 0
  await updateLibrary((draft) => {
    for (const entry of draft.vocab) {
      if (!isEnglish(entry.meaning)) continue
      const next = translate(entry.meaning)
      if (!next || isEnglish(next) || next === entry.meaning) continue
      entry.meaning = next
      changed += 1
    }
  })
  return changed
}

export async function updateVocabMeaningsByWord(
  updates: Array<{ word: string; meaning: string; reading?: string }>,
): Promise<number> {
  if (!updates.length) return 0
  const map = new Map(updates.map((u) => [u.word, u]))
  let changed = 0
  await updateLibrary((draft) => {
    for (const entry of draft.vocab) {
      const u = map.get(entry.word)
      if (!u) continue
      const nextReading = u.reading && !entry.reading ? u.reading : entry.reading
      const nextMeaning = u.meaning || entry.meaning
      if (nextMeaning === entry.meaning && nextReading === entry.reading) continue
      entry.meaning = nextMeaning
      entry.reading = nextReading
      changed += 1
    }
  })
  return changed
}

export async function listQuizzes(kind: QuizKind, mode?: string): Promise<StoredQuiz[]> {
  const snap = await getLibrarySnapshot()
  return snap.quizBank
    .filter((q) => q.kind === kind && (mode ? q.mode === mode : true))
    .map(withoutLevel)
}

export async function countQuizzes(kind: QuizKind, mode?: string): Promise<number> {
  const list = await listQuizzes(kind, mode)
  return list.length
}

function quizDedupeKey(
  q: Pick<StoredQuiz, 'kind' | 'mode' | 'prompt' | 'answer' | 'passage' | 'sentence'>,
): string {
  return `${q.kind}|${q.mode ?? ''}|${q.prompt}|${q.sentence ?? ''}|${q.answer}|${q.passage ?? ''}`
}

export async function saveQuizzes(
  items: Array<Omit<StoredQuiz, 'id' | 'createdAt' | 'lastShownAt' | 'showCount'>>,
  _opts?: { allowDuplicates?: boolean },
): Promise<number> {
  let added = 0
  await updateLibrary((draft) => {
    const seen = new Set(draft.quizBank.map(quizDedupeKey))
    for (const item of items) {
      const key = quizDedupeKey(item)
      if (seen.has(key)) continue
      seen.add(key)
      draft.quizBank.push({
        ...item,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        lastShownAt: 0,
        showCount: 0,
      })
      added += 1
    }
  })
  return added
}

export async function drawQuizzes(
  kind: QuizKind,
  count: number,
  mode?: string,
): Promise<StoredQuiz[]> {
  const all = await listQuizzes(kind)
  const flagged = await getFlaggedAvoidSets()
  const filtered = (mode ? all.filter((q) => q.mode === mode) : all).filter(
    (q) => !flagged.ids.has(q.id) && !flagged.fps.has(quizFingerprint(q)),
  )
  if (!filtered.length) return []

  const ranked = [...filtered].sort((a, b) => {
    if (a.showCount !== b.showCount) return a.showCount - b.showCount
    return a.lastShownAt - b.lastShownAt
  })

  const pool = ranked.slice(0, Math.max(count * 3, count))
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.min(count, pool.length))
}

export async function deleteQuizById(id: string): Promise<void> {
  await updateLibrary((draft) => {
    draft.quizBank = draft.quizBank.filter((q) => q.id !== id)
  })
}

let flaggedCache: { ids: Set<string>; fps: Set<string>; at: number } | null = null

async function getFlaggedAvoidSets(): Promise<{ ids: Set<string>; fps: Set<string> }> {
  if (flaggedCache && Date.now() - flaggedCache.at < 2000) {
    return { ids: flaggedCache.ids, fps: flaggedCache.fps }
  }
  const list = await listFlaggedQuizzes()
  const ids = new Set(list.map((f) => f.quizId).filter(Boolean) as string[])
  const fps = new Set(list.map((f) => f.fingerprint))
  flaggedCache = { ids, fps, at: Date.now() }
  return { ids, fps }
}

function invalidateFlaggedCache() {
  flaggedCache = null
}

export async function listFlaggedQuizzes(): Promise<FlaggedQuiz[]> {
  const snap = await getLibrarySnapshot()
  return [...snap.flaggedQuizzes].sort((a, b) => b.flaggedAt - a.flaggedAt)
}

export async function countFlaggedQuizzes(): Promise<number> {
  const snap = await getLibrarySnapshot()
  return snap.flaggedQuizzes.length
}

export async function flagQuizItem(input: {
  kind: FlaggedKind
  prompt: string
  sentence?: string
  passage?: string
  answer: string
  choices: string[]
  explanation?: string
  mode?: string
  quizId?: string
}): Promise<FlaggedQuiz> {
  const fingerprint = quizFingerprint(input)
  const existing = (await listFlaggedQuizzes()).find((f) => f.fingerprint === fingerprint)
  if (existing) {
    invalidateFlaggedCache()
    return existing
  }
  const row: FlaggedQuiz = {
    id: crypto.randomUUID(),
    fingerprint,
    kind: input.kind,
    prompt: input.prompt,
    sentence: input.sentence,
    passage: input.passage,
    answer: input.answer,
    choices: input.choices,
    explanation: input.explanation,
    quizId: input.quizId,
    flaggedAt: Date.now(),
  }
  await updateLibrary((draft) => {
    draft.flaggedQuizzes.push(row)
  })
  invalidateFlaggedCache()
  return row
}

/** 從審視清單移除標記（之後可再出現於練習） */
export async function unflagQuizItem(id: string): Promise<void> {
  await updateLibrary((draft) => {
    draft.flaggedQuizzes = draft.flaggedQuizzes.filter((f) => f.id !== id)
  })
  invalidateFlaggedCache()
}

/** 刪除標記，並若有題庫 id 則一併刪除題庫題目 */
export async function discardFlaggedQuiz(id: string): Promise<void> {
  await updateLibrary((draft) => {
    const row = draft.flaggedQuizzes.find((f) => f.id === id)
    if (row?.quizId) {
      draft.quizBank = draft.quizBank.filter((q) => q.id !== row.quizId)
    }
    draft.flaggedQuizzes = draft.flaggedQuizzes.filter((f) => f.id !== id)
  })
  invalidateFlaggedCache()
}

export async function clearAllFlaggedQuizzes(): Promise<void> {
  await updateLibrary((draft) => {
    draft.flaggedQuizzes = []
  })
  invalidateFlaggedCache()
}

export async function saveFlaggedAiReview(
  id: string,
  review: FlaggedAiReviewStored,
): Promise<void> {
  await updateLibrary((draft) => {
    const row = draft.flaggedQuizzes.find((f) => f.id === id)
    if (row) row.aiReview = review
  })
}

/** 將 AI「整題」修正寫回題庫；預設並取消標記 */
export async function updateQuizFromFlagFix(
  item: FlaggedQuiz,
  fixed: NonNullable<FlaggedAiReviewStored['fixed']>,
  opts?: { unflag?: boolean },
): Promise<void> {
  await updateLibrary((draft) => {
    if (item.quizId) {
      const q = draft.quizBank.find((x) => x.id === item.quizId)
      if (q) {
        q.prompt = fixed.prompt ?? q.prompt
        q.sentence = fixed.sentence ?? q.sentence
        q.passage = fixed.passage ?? q.passage
        q.answer = fixed.answer ?? q.answer
        q.choices = fixed.choices ?? q.choices
        q.explanation = fixed.explanation ?? q.explanation
      }
    }
    if (opts?.unflag !== false) {
      draft.flaggedQuizzes = draft.flaggedQuizzes.filter((f) => f.id !== item.id)
    } else {
      const row = draft.flaggedQuizzes.find((f) => f.id === item.id)
      if (row) {
        const nextPrompt = fixed.prompt ?? row.prompt
        const nextAnswer = fixed.answer ?? row.answer
        const nextSentence = fixed.sentence ?? row.sentence
        const nextPassage = fixed.passage ?? row.passage
        const nextChoices = fixed.choices ?? row.choices
        row.prompt = nextPrompt
        row.sentence = nextSentence
        row.passage = nextPassage
        row.answer = nextAnswer
        row.choices = nextChoices
        row.explanation = fixed.explanation ?? row.explanation
        row.fingerprint = quizFingerprint({
          kind: row.kind,
          prompt: nextPrompt,
          answer: nextAnswer,
          sentence: nextSentence,
          passage: nextPassage,
          choices: nextChoices,
        })
      }
    }
  })
  invalidateFlaggedCache()
}

export async function isQuizFlagged(input: {
  kind: string
  prompt: string
  answer: string
  sentence?: string
  passage?: string
  choices?: string[]
  mode?: string
  quizId?: string
}): Promise<boolean> {
  const { ids, fps } = await getFlaggedAvoidSets()
  if (input.quizId && ids.has(input.quizId)) return true
  return fps.has(quizFingerprint(input))
}

export async function markQuizzesShown(ids: string[]): Promise<void> {
  if (!ids.length) return
  const now = Date.now()
  const idSet = new Set(ids)
  await updateLibrary((draft) => {
    for (const q of draft.quizBank) {
      if (!idSet.has(q.id)) continue
      q.lastShownAt = now
      q.showCount += 1
    }
  })
}

export async function clearQuizzes(kind?: QuizKind, mode?: string): Promise<void> {
  await updateLibrary((draft) => {
    if (!kind) {
      draft.quizBank = []
      return
    }
    draft.quizBank = draft.quizBank.filter((q) => {
      if (q.kind !== kind) return true
      if (mode && q.mode !== mode) return true
      return false
    })
  })
}

function reviewKey(kind: string, prompt: string, answer: string, mode?: string) {
  return `${kind}|${mode ?? ''}|${prompt}|${answer}`
}

export async function upsertReviewWrong(
  item: Omit<ReviewItem, 'id' | 'dueAt' | 'ease' | 'wrongCount' | 'rightCount' | 'updatedAt'> & {
    id?: string
  },
): Promise<void> {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  await updateLibrary((draft) => {
    const key = reviewKey(item.kind, item.prompt, item.answer, item.mode)
    const existing = draft.reviewQueue.find(
      (r) => reviewKey(r.kind, r.prompt, r.answer, r.mode) === key,
    )
    if (existing) {
      Object.assign(existing, item, {
        id: existing.id,
        wrongCount: existing.wrongCount + 1,
        ease: Math.max(1.3, existing.ease - 0.2),
        dueAt: now + day,
        updatedAt: now,
      })
    } else {
      draft.reviewQueue.push({
        ...item,
        id: crypto.randomUUID(),
        wrongCount: 1,
        rightCount: 0,
        ease: 2.5,
        dueAt: now + day,
        updatedAt: now,
      })
    }
  })
}

export async function markReviewCorrect(id: string): Promise<void> {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  await updateLibrary((draft) => {
    const item = draft.reviewQueue.find((r) => r.id === id)
    if (!item) return
    const nextEase = Math.min(3.0, item.ease + 0.15)
    const intervalDays =
      item.rightCount === 0 ? 3 : item.rightCount === 1 ? 7 : Math.round(7 * nextEase)
    item.rightCount += 1
    item.ease = nextEase
    item.dueAt = now + intervalDays * day
    item.updatedAt = now
  })
}

export async function listDueReviews(limit = 20): Promise<ReviewItem[]> {
  const snap = await getLibrarySnapshot()
  const now = Date.now()
  return [...snap.reviewQueue]
    .filter((r) => r.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, limit)
    .map(withoutLevel)
}

export async function countDueReviews(): Promise<number> {
  return (await listDueReviews(1000)).length
}

export async function logPractice(
  event: Omit<PracticeEvent, 'id' | 'at'> & { at?: number },
): Promise<void> {
  await updateLibrary((draft) => {
    draft.practiceLog.push({
      ...event,
      id: crypto.randomUUID(),
      at: event.at ?? Date.now(),
    })
  })
}

export async function getPracticeStats(days = 7) {
  const snap = await getLibrarySnapshot()
  const since = Date.now() - days * 24 * 60 * 60 * 1000
  const recent = snap.practiceLog.filter((e) => e.at >= since)
  const total = recent.length
  const correct = recent.filter((e) => e.correct).length
  const byModule: Record<string, number> = {}
  for (const e of recent) {
    byModule[e.module] = (byModule[e.module] ?? 0) + 1
  }
  return {
    total,
    correct,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
    byModule,
  }
}

export async function exportAllData() {
  await flushLibrary()
  const snap = await getLibrarySnapshot()
  return {
    version: 8,
    exportedAt: new Date().toISOString(),
    vocab: snap.vocab.map(withoutLevel),
    phrases: snap.phrases.map(withoutLevel),
    readingPassages: snap.readingPassages,
    quizBank: snap.quizBank.map(withoutLevel),
    reviewQueue: snap.reviewQueue.map(withoutLevel),
    practiceLog: snap.practiceLog.map(withoutLevel),
    flaggedQuizzes: snap.flaggedQuizzes.map(withoutLevel),
  }
}

export async function importAllData(data: {
  vocab?: VocabEntry[]
  phrases?: PhraseEntry[]
  readingPassages?: ReadingPassageRecord[]
  quizBank?: StoredQuiz[]
  reviewQueue?: ReviewItem[]
  practiceLog?: PracticeEvent[]
  flaggedQuizzes?: FlaggedQuiz[]
}): Promise<void> {
  const current = await getLibrarySnapshot()
  const next = normalizeLibrarySnapshot({
    ...current,
    vocab: data.vocab?.length
      ? mergeById(current.vocab, data.vocab.map(withoutLevel))
      : current.vocab,
    phrases: data.phrases?.length
      ? mergeById(current.phrases, data.phrases.map(withoutLevel))
      : current.phrases,
    readingPassages: data.readingPassages?.length
      ? mergeById(current.readingPassages, data.readingPassages)
      : current.readingPassages,
    quizBank: data.quizBank?.length
      ? mergeById(current.quizBank, data.quizBank.map(withoutLevel))
      : current.quizBank,
    reviewQueue: data.reviewQueue?.length
      ? mergeById(current.reviewQueue, data.reviewQueue.map(withoutLevel))
      : current.reviewQueue,
    practiceLog: data.practiceLog?.length
      ? mergeById(current.practiceLog, data.practiceLog.map(withoutLevel))
      : current.practiceLog,
    flaggedQuizzes: data.flaggedQuizzes?.length
      ? mergeById(current.flaggedQuizzes, data.flaggedQuizzes.map(withoutLevel))
      : current.flaggedQuizzes,
  })
  await replaceLibrary(next)
  invalidateFlaggedCache()
}

function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map(existing.map((x) => [x.id, x]))
  for (const row of incoming) map.set(row.id, row)
  return [...map.values()]
}

/** 供設定頁顯示資料檔路徑 */
export { getLibraryStatus, flushLibrary } from './library-store'
