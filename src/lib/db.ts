import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

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
  source: 'local' | 'model' | 'fallback' | 'builtin'
  createdAt: number
  lastShownAt: number
  showCount: number
}

export interface ReviewItem {
  id: string
  kind: 'vocab' | 'phrase'
  prompt: string
  sentence?: string
  answer: string
  choices: string[]
  explanation: string
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

interface JpLeaderDB extends DBSchema {
  vocab: {
    key: string
    value: VocabEntry
    /** by-level 僅相容舊庫索引，新資料不再使用級別 */
    indexes: { 'by-level': string; 'by-word': string }
  }
  phrases: {
    key: string
    value: PhraseEntry
    indexes: { 'by-level': string; 'by-phrase': string }
  }
  quizBank: {
    key: string
    value: StoredQuiz
    indexes: { 'by-kind': QuizKind; 'by-kind-level': [QuizKind, string] }
  }
  reviewQueue: {
    key: string
    value: ReviewItem
    indexes: { 'by-due': number }
  }
  practiceLog: {
    key: string
    value: PracticeEvent
    indexes: { 'by-at': number }
  }
  flaggedQuizzes: {
    key: string
    value: FlaggedQuiz
    indexes: { 'by-fingerprint': string; 'by-kind': FlaggedKind }
  }
}

let dbPromise: Promise<IDBPDatabase<JpLeaderDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<JpLeaderDB>('jp-leader', 5, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('vocab', { keyPath: 'id' })
          store.createIndex('by-level', 'level')
          store.createIndex('by-word', 'word')
        }
        if (oldVersion < 2) {
          const quiz = db.createObjectStore('quizBank', { keyPath: 'id' })
          quiz.createIndex('by-kind', 'kind')
          quiz.createIndex('by-kind-level', ['kind', 'level'])
        }
        if (oldVersion < 3) {
          const review = db.createObjectStore('reviewQueue', { keyPath: 'id' })
          review.createIndex('by-due', 'dueAt')
          const log = db.createObjectStore('practiceLog', { keyPath: 'id' })
          log.createIndex('by-at', 'at')
        }
        if (oldVersion < 4) {
          const flagged = db.createObjectStore('flaggedQuizzes', { keyPath: 'id' })
          flagged.createIndex('by-fingerprint', 'fingerprint')
          flagged.createIndex('by-kind', 'kind')
        }
        if (oldVersion < 5) {
          const phrases = db.createObjectStore('phrases', { keyPath: 'id' })
          phrases.createIndex('by-level', 'level')
          phrases.createIndex('by-phrase', 'phrase')
        }
      },
    })
  }
  return dbPromise
}

export function quizFingerprint(input: {
  kind: string
  prompt: string
  answer: string
  sentence?: string
  passage?: string
  choices?: string[]
}): string {
  const choices = (input.choices ?? []).join('/')
  return [
    input.kind,
    input.prompt.trim(),
    input.answer.trim(),
    (input.sentence ?? '').trim(),
    (input.passage ?? '').trim(),
    choices,
  ].join('|')
}

export async function listVocab(): Promise<VocabEntry[]> {
  const db = await getDb()
  return db.getAll('vocab')
}

export async function addVocab(entry: Omit<VocabEntry, 'id' | 'createdAt'>): Promise<VocabEntry> {
  const db = await getDb()
  const record: VocabEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  }
  await db.put('vocab', record)
  return record
}

export async function bulkAddVocab(
  entries: Omit<VocabEntry, 'id' | 'createdAt'>[],
): Promise<number> {
  const db = await getDb()
  const existing = await db.getAll('vocab')
  const byKey = new Map(existing.map((e) => [`${e.word}|${e.reading}`, e]))
  let added = 0
  const tx = db.transaction('vocab', 'readwrite')
  for (const entry of entries) {
    const key = `${entry.word}|${entry.reading}`
    const prev = byKey.get(key)
    if (prev) {
      if (entry.meaning && entry.meaning !== prev.meaning) {
        await tx.store.put({ ...prev, meaning: entry.meaning })
      }
      continue
    }
    const record = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    }
    byKey.set(key, record)
    await tx.store.put(record)
    added += 1
  }
  await tx.done
  return added
}

export async function clearVocab(): Promise<void> {
  const db = await getDb()
  await db.clear('vocab')
}

export async function listPhrases(): Promise<PhraseEntry[]> {
  const db = await getDb()
  return db.getAll('phrases')
}

export async function addPhrase(
  entry: Omit<PhraseEntry, 'id' | 'createdAt'>,
): Promise<PhraseEntry> {
  const db = await getDb()
  const record: PhraseEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  }
  await db.put('phrases', record)
  return record
}

export async function bulkAddPhrases(
  entries: Omit<PhraseEntry, 'id' | 'createdAt'>[],
): Promise<number> {
  const db = await getDb()
  const existing = await db.getAll('phrases')
  const byKey = new Map(existing.map((e) => [`${e.phrase}|${e.blankWord}`, e]))
  let added = 0
  const tx = db.transaction('phrases', 'readwrite')
  for (const entry of entries) {
    const key = `${entry.phrase}|${entry.blankWord}`
    if (byKey.has(key)) continue
    const record = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    }
    byKey.set(key, record)
    await tx.store.put(record)
    added += 1
  }
  await tx.done
  return added
}

export async function clearPhrases(): Promise<void> {
  const db = await getDb()
  await db.clear('phrases')
}

export async function normalizeEnglishMeanings(
  translate: (raw: string) => string,
  isEnglish: (raw: string) => boolean,
): Promise<number> {
  const db = await getDb()
  const all = await db.getAll('vocab')
  let changed = 0
  const tx = db.transaction('vocab', 'readwrite')
  for (const entry of all) {
    if (!isEnglish(entry.meaning)) continue
    const next = translate(entry.meaning)
    if (!next || isEnglish(next) || next === entry.meaning) continue
    await tx.store.put({ ...entry, meaning: next })
    changed += 1
  }
  await tx.done
  return changed
}

export async function updateVocabMeaningsByWord(
  updates: Array<{ word: string; meaning: string; reading?: string }>,
): Promise<number> {
  if (!updates.length) return 0
  const map = new Map(updates.map((u) => [u.word, u]))
  const db = await getDb()
  const all = await db.getAll('vocab')
  let changed = 0
  const tx = db.transaction('vocab', 'readwrite')
  for (const entry of all) {
    const u = map.get(entry.word)
    if (!u) continue
    const nextReading = u.reading && !entry.reading ? u.reading : entry.reading
    const nextMeaning = u.meaning || entry.meaning
    if (nextMeaning === entry.meaning && nextReading === entry.reading) continue
    await tx.store.put({
      ...entry,
      meaning: nextMeaning,
      reading: nextReading,
    })
    changed += 1
  }
  await tx.done
  return changed
}

export async function listQuizzes(kind: QuizKind): Promise<StoredQuiz[]> {
  const db = await getDb()
  return db.getAllFromIndex('quizBank', 'by-kind', kind)
}

export async function countQuizzes(kind: QuizKind): Promise<number> {
  const list = await listQuizzes(kind)
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
  const db = await getDb()
  const existing = await db.getAll('quizBank')
  const seen = new Set(existing.map(quizDedupeKey))
  let added = 0
  const tx = db.transaction('quizBank', 'readwrite')
  for (const item of items) {
    const key = quizDedupeKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    await tx.store.put({
      ...item,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      lastShownAt: 0,
      showCount: 0,
    })
    added += 1
  }
  await tx.done
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
  const db = await getDb()
  await db.delete('quizBank', id)
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
  const db = await getDb()
  const list = await db.getAll('flaggedQuizzes')
  return list.sort((a, b) => b.flaggedAt - a.flaggedAt)
}

export async function countFlaggedQuizzes(): Promise<number> {
  const db = await getDb()
  return db.count('flaggedQuizzes')
}

export async function flagQuizItem(input: {
  kind: FlaggedKind
  prompt: string
  sentence?: string
  passage?: string
  answer: string
  choices: string[]
  explanation?: string
  quizId?: string
}): Promise<FlaggedQuiz> {
  const db = await getDb()
  const fingerprint = quizFingerprint(input)
  const existing = await db.getAllFromIndex('flaggedQuizzes', 'by-fingerprint', fingerprint)
  if (existing[0]) {
    invalidateFlaggedCache()
    return existing[0]
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
  await db.put('flaggedQuizzes', row)
  invalidateFlaggedCache()
  return row
}

/** 從審視清單移除標記（之後可再出現於練習） */
export async function unflagQuizItem(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('flaggedQuizzes', id)
  invalidateFlaggedCache()
}

/** 刪除標記，並若有題庫 id 則一併刪除題庫題目 */
export async function discardFlaggedQuiz(id: string): Promise<void> {
  const db = await getDb()
  const row = await db.get('flaggedQuizzes', id)
  if (row?.quizId) {
    await db.delete('quizBank', row.quizId)
  }
  await db.delete('flaggedQuizzes', id)
  invalidateFlaggedCache()
}

export async function clearAllFlaggedQuizzes(): Promise<void> {
  const db = await getDb()
  await db.clear('flaggedQuizzes')
  invalidateFlaggedCache()
}

export async function saveFlaggedAiReview(
  id: string,
  review: FlaggedAiReviewStored,
): Promise<void> {
  const db = await getDb()
  const row = await db.get('flaggedQuizzes', id)
  if (!row) return
  await db.put('flaggedQuizzes', { ...row, aiReview: review })
}

/** 將 AI「整題」修正寫回題庫；預設並取消標記 */
export async function updateQuizFromFlagFix(
  item: FlaggedQuiz,
  fixed: NonNullable<FlaggedAiReviewStored['fixed']>,
  opts?: { unflag?: boolean },
): Promise<void> {
  const db = await getDb()
  if (item.quizId) {
    const q = await db.get('quizBank', item.quizId)
    if (q) {
      await db.put('quizBank', {
        ...q,
        prompt: fixed.prompt ?? q.prompt,
        sentence: fixed.sentence ?? q.sentence,
        passage: fixed.passage ?? q.passage,
        answer: fixed.answer ?? q.answer,
        choices: fixed.choices ?? q.choices,
        explanation: fixed.explanation ?? q.explanation,
      })
    }
  }
  if (opts?.unflag !== false) {
    await db.delete('flaggedQuizzes', item.id)
    invalidateFlaggedCache()
  } else {
    const row = await db.get('flaggedQuizzes', item.id)
    if (row) {
      const nextPrompt = fixed.prompt ?? row.prompt
      const nextAnswer = fixed.answer ?? row.answer
      const nextSentence = fixed.sentence ?? row.sentence
      const nextPassage = fixed.passage ?? row.passage
      const nextChoices = fixed.choices ?? row.choices
      await db.put('flaggedQuizzes', {
        ...row,
        prompt: nextPrompt,
        sentence: nextSentence,
        passage: nextPassage,
        answer: nextAnswer,
        choices: nextChoices,
        explanation: fixed.explanation ?? row.explanation,
        fingerprint: quizFingerprint({
          kind: row.kind,
          prompt: nextPrompt,
          answer: nextAnswer,
          sentence: nextSentence,
          passage: nextPassage,
          choices: nextChoices,
        }),
      })
      invalidateFlaggedCache()
    }
  }
}

export async function isQuizFlagged(input: {
  kind: string
  prompt: string
  answer: string
  sentence?: string
  passage?: string
  choices?: string[]
  quizId?: string
}): Promise<boolean> {
  const { ids, fps } = await getFlaggedAvoidSets()
  if (input.quizId && ids.has(input.quizId)) return true
  return fps.has(quizFingerprint(input))
}

export async function markQuizzesShown(ids: string[]): Promise<void> {
  if (!ids.length) return
  const db = await getDb()
  const now = Date.now()
  const tx = db.transaction('quizBank', 'readwrite')
  for (const id of ids) {
    const q = await tx.store.get(id)
    if (!q) continue
    await tx.store.put({
      ...q,
      lastShownAt: now,
      showCount: q.showCount + 1,
    })
  }
  await tx.done
}

export async function clearQuizzes(kind?: QuizKind): Promise<void> {
  const db = await getDb()
  if (!kind) {
    await db.clear('quizBank')
    return
  }
  const list = await listQuizzes(kind)
  const tx = db.transaction('quizBank', 'readwrite')
  for (const q of list) await tx.store.delete(q.id)
  await tx.done
}

function reviewKey(kind: string, prompt: string, answer: string) {
  return `${kind}|${prompt}|${answer}`
}

export async function upsertReviewWrong(
  item: Omit<ReviewItem, 'id' | 'dueAt' | 'ease' | 'wrongCount' | 'rightCount' | 'updatedAt'> & {
    id?: string
  },
): Promise<void> {
  const db = await getDb()
  const all = await db.getAll('reviewQueue')
  const key = reviewKey(item.kind, item.prompt, item.answer)
  const existing = all.find((r) => reviewKey(r.kind, r.prompt, r.answer) === key)
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  if (existing) {
    await db.put('reviewQueue', {
      ...existing,
      ...item,
      id: existing.id,
      wrongCount: existing.wrongCount + 1,
      ease: Math.max(1.3, existing.ease - 0.2),
      dueAt: now + day,
      updatedAt: now,
    })
  } else {
    await db.put('reviewQueue', {
      ...item,
      id: crypto.randomUUID(),
      wrongCount: 1,
      rightCount: 0,
      ease: 2.5,
      dueAt: now + day,
      updatedAt: now,
    })
  }
}

export async function markReviewCorrect(id: string): Promise<void> {
  const db = await getDb()
  const item = await db.get('reviewQueue', id)
  if (!item) return
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const nextEase = Math.min(3.0, item.ease + 0.15)
  const intervalDays = item.rightCount === 0 ? 3 : item.rightCount === 1 ? 7 : Math.round(7 * nextEase)
  await db.put('reviewQueue', {
    ...item,
    rightCount: item.rightCount + 1,
    ease: nextEase,
    dueAt: now + intervalDays * day,
    updatedAt: now,
  })
}

export async function listDueReviews(limit = 20): Promise<ReviewItem[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex('reviewQueue', 'by-due')
  const now = Date.now()
  return all.filter((r) => r.dueAt <= now).slice(0, limit)
}

export async function countDueReviews(): Promise<number> {
  return (await listDueReviews(1000)).length
}

export async function logPractice(
  event: Omit<PracticeEvent, 'id' | 'at'> & { at?: number },
): Promise<void> {
  const db = await getDb()
  await db.put('practiceLog', {
    ...event,
    id: crypto.randomUUID(),
    at: event.at ?? Date.now(),
  })
}

export async function getPracticeStats(days = 7) {
  const db = await getDb()
  const since = Date.now() - days * 24 * 60 * 60 * 1000
  const all = await db.getAllFromIndex('practiceLog', 'by-at')
  const recent = all.filter((e) => e.at >= since)
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

function withoutLevel<T extends object>(row: T): T {
  if (!row || typeof row !== 'object' || !('level' in row)) return row
  const { level: _removed, ...rest } = row as T & { level?: unknown }
  return rest as T
}

export async function exportAllData() {
  const db = await getDb()
  return {
    version: 6,
    exportedAt: new Date().toISOString(),
    vocab: (await db.getAll('vocab')).map(withoutLevel),
    phrases: (await db.getAll('phrases')).map(withoutLevel),
    quizBank: (await db.getAll('quizBank')).map(withoutLevel),
    reviewQueue: (await db.getAll('reviewQueue')).map(withoutLevel),
    practiceLog: (await db.getAll('practiceLog')).map(withoutLevel),
    flaggedQuizzes: (await db.getAll('flaggedQuizzes')).map(withoutLevel),
  }
}

export async function importAllData(data: {
  vocab?: VocabEntry[]
  phrases?: PhraseEntry[]
  quizBank?: StoredQuiz[]
  reviewQueue?: ReviewItem[]
  practiceLog?: PracticeEvent[]
  flaggedQuizzes?: FlaggedQuiz[]
}): Promise<void> {
  const db = await getDb()
  if (data.vocab?.length) {
    const tx = db.transaction('vocab', 'readwrite')
    for (const v of data.vocab) await tx.store.put(withoutLevel(v))
    await tx.done
  }
  if (data.phrases?.length) {
    const tx = db.transaction('phrases', 'readwrite')
    for (const p of data.phrases) await tx.store.put(withoutLevel(p))
    await tx.done
  }
  if (data.quizBank?.length) {
    const tx = db.transaction('quizBank', 'readwrite')
    for (const q of data.quizBank) await tx.store.put(withoutLevel(q))
    await tx.done
  }
  if (data.reviewQueue?.length) {
    const tx = db.transaction('reviewQueue', 'readwrite')
    for (const r of data.reviewQueue) await tx.store.put(withoutLevel(r))
    await tx.done
  }
  if (data.practiceLog?.length) {
    const tx = db.transaction('practiceLog', 'readwrite')
    for (const p of data.practiceLog) await tx.store.put(withoutLevel(p))
    await tx.done
  }
  if (data.flaggedQuizzes?.length) {
    const tx = db.transaction('flaggedQuizzes', 'readwrite')
    for (const f of data.flaggedQuizzes) await tx.store.put(withoutLevel(f))
    await tx.done
    invalidateFlaggedCache()
  }
}
