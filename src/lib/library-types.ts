import type {
  FlaggedQuiz,
  PhraseEntry,
  PracticeEvent,
  ReviewItem,
  StoredQuiz,
  VocabEntry,
} from './db'
import type { ReadingPassageRecord } from './reading-spec'

/** 題庫／單字／短文等持久化快照（檔案式，跨瀏覽器共用） */
export interface LibrarySnapshot {
  version: number
  updatedAt: string
  vocab: VocabEntry[]
  phrases: PhraseEntry[]
  readingPassages: ReadingPassageRecord[]
  quizBank: StoredQuiz[]
  reviewQueue: ReviewItem[]
  practiceLog: PracticeEvent[]
  flaggedQuizzes: FlaggedQuiz[]
}

export type LibraryBackend = 'host' | 'api' | 'electron' | 'idb-fallback'

export interface LibraryInfo {
  backend: LibraryBackend
  path: string
  updatedAt: string
  writable: boolean
  syncStatus?: 'ok' | 'error' | 'idle'
  syncError?: string
  lastSyncedAt?: string
}

export function emptyLibrarySnapshot(): LibrarySnapshot {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    vocab: [],
    phrases: [],
    readingPassages: [],
    quizBank: [],
    reviewQueue: [],
    practiceLog: [],
    flaggedQuizzes: [],
  }
}

export function normalizeLibrarySnapshot(raw: unknown): LibrarySnapshot {
  const base = emptyLibrarySnapshot()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  return {
    version: typeof o.version === 'number' ? o.version : 1,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : base.updatedAt,
    vocab: Array.isArray(o.vocab) ? (o.vocab as VocabEntry[]) : [],
    phrases: Array.isArray(o.phrases) ? (o.phrases as PhraseEntry[]) : [],
    readingPassages: Array.isArray(o.readingPassages)
      ? (o.readingPassages as ReadingPassageRecord[])
      : [],
    quizBank: Array.isArray(o.quizBank) ? (o.quizBank as StoredQuiz[]) : [],
    reviewQueue: Array.isArray(o.reviewQueue) ? (o.reviewQueue as ReviewItem[]) : [],
    practiceLog: Array.isArray(o.practiceLog) ? (o.practiceLog as PracticeEvent[]) : [],
    flaggedQuizzes: Array.isArray(o.flaggedQuizzes) ? (o.flaggedQuizzes as FlaggedQuiz[]) : [],
  }
}

export function isLibraryEmpty(snap: LibrarySnapshot): boolean {
  return (
    !snap.vocab.length &&
    !snap.phrases.length &&
    !snap.readingPassages.length &&
    !snap.quizBank.length &&
    !snap.reviewQueue.length &&
    !snap.practiceLog.length &&
    !snap.flaggedQuizzes.length
  )
}
