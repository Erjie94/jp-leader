import {
  normalizeLibrarySnapshot,
  type LibrarySnapshot,
} from './library-types'

function mergeById<T extends { id: string }>(secondary: T[], primary: T[]): T[] {
  const map = new Map(secondary.map((x) => [x.id, x]))
  for (const row of primary) map.set(row.id, row)
  return [...map.values()]
}

/**
 * 合併兩份題庫：較新 updatedAt 為 primary（同 id 覆蓋），另一側獨有 id 保留。
 */
export function mergeLibrarySnapshots(
  a: LibrarySnapshot,
  b: LibrarySnapshot,
): LibrarySnapshot {
  const left = normalizeLibrarySnapshot(a)
  const right = normalizeLibrarySnapshot(b)
  const aNewer = Date.parse(left.updatedAt) >= Date.parse(right.updatedAt)
  const primary = aNewer ? left : right
  const secondary = aNewer ? right : left
  return normalizeLibrarySnapshot({
    version: 1,
    updatedAt: new Date().toISOString(),
    vocab: mergeById(secondary.vocab, primary.vocab),
    phrases: mergeById(secondary.phrases, primary.phrases),
    readingPassages: mergeById(secondary.readingPassages, primary.readingPassages),
    quizBank: mergeById(secondary.quizBank, primary.quizBank),
    reviewQueue: mergeById(secondary.reviewQueue, primary.reviewQueue),
    practiceLog: mergeById(secondary.practiceLog, primary.practiceLog),
    flaggedQuizzes: mergeById(secondary.flaggedQuizzes, primary.flaggedQuizzes),
  })
}
