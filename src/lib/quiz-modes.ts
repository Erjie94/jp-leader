/** 精簡形狀，避免與 db 循環依賴 */
export interface MigratableQuiz {
  kind: string
  mode?: string
  prompt: string
  [key: string]: unknown
}

/** 單字練習三種考試模式（對應題庫 mode） */
export type VocabQuizMode = 'ja-meaning' | 'meaning-ja' | 'reading'

export const VOCAB_QUIZ_MODES: readonly VocabQuizMode[] = [
  'ja-meaning',
  'meaning-ja',
  'reading',
] as const

export const PHRASE_QUIZ_MODE = 'blank' as const

export function isVocabQuizMode(value: string | undefined | null): value is VocabQuizMode {
  return value === 'ja-meaning' || value === 'meaning-ja' || value === 'reading'
}

/** 依 prompt 啟發式推斷舊 vocab 題的 mode；無法判斷則 null */
export function inferVocabModeFromPrompt(prompt: string): VocabQuizMode | null {
  const p = prompt.trim()
  if (!p) return null
  if (p.includes('讀音') || p.includes('読み')) return 'reading'
  if (p.includes('哪個日文') || p.includes('どの日本語') || p.includes('表示')) return 'meaning-ja'
  if (p.includes('意思') || p.includes('意味')) return 'ja-meaning'
  return null
}

/** 清理／歸類舊 quizBank（choice 殘題、缺 mode） */
export function migrateQuizBankModes<T extends MigratableQuiz>(quizBank: T[]): {
  quizBank: T[]
  removed: number
  relabeled: number
} {
  let removed = 0
  let relabeled = 0
  const next: T[] = []
  for (const q of quizBank) {
    if (q.kind !== 'vocab') {
      next.push(q)
      continue
    }
    if (q.mode === 'choice' || !q.mode) {
      const inferred = inferVocabModeFromPrompt(q.prompt)
      if (!inferred) {
        removed += 1
        continue
      }
      next.push({ ...q, mode: inferred })
      relabeled += 1
      continue
    }
    if (!isVocabQuizMode(q.mode)) {
      removed += 1
      continue
    }
    next.push(q)
  }
  return { quizBank: next, removed, relabeled }
}
