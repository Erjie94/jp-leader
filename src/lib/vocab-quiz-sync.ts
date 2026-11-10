import {
  listVocab,
  saveQuizzes,
  type StoredQuiz,
  type VocabEntry,
} from './db'
import { buildVocabChoiceQuestions, buildVocabQuestionsForEntry } from './generate'
import { QUIZ_DEFAULTS } from './quiz-defaults'
import { VOCAB_QUIZ_MODES, type VocabQuizMode } from './quiz-modes'

function toStored(
  q: ReturnType<typeof buildVocabQuestionsForEntry>[number],
): Omit<StoredQuiz, 'id' | 'createdAt' | 'lastShownAt' | 'showCount'> {
  return {
    kind: 'vocab',
    mode: q.mode,
    prompt: q.prompt,
    sentence: q.sentence,
    answer: q.answer,
    choices: q.choices,
    explanation: q.explanation,
    choiceExplanations: q.choiceExplanations,
    source: 'local',
  }
}

/** 單筆單字寫入／更新後：同步三模式題到題庫 */
export async function syncVocabEntryQuizzes(
  entry: VocabEntry,
  pool?: VocabEntry[],
): Promise<number> {
  const all = pool ?? (await listVocab())
  const questions = buildVocabQuestionsForEntry(entry, all, VOCAB_QUIZ_MODES)
  if (!questions.length) return 0
  return saveQuizzes(questions.map(toStored))
}

/** 批次同步多筆（CSV／種子／AI 匯入後） */
export async function syncVocabEntriesQuizzes(entries: VocabEntry[]): Promise<number> {
  if (!entries.length) return 0
  const pool = await listVocab()
  let added = 0
  for (const entry of entries) {
    added += await syncVocabEntryQuizzes(entry, pool)
  }
  return added
}

/** 重建某一模式題庫批次（練習 forceNew／庫不足時） */
export async function rebuildVocabModeBank(
  mode: VocabQuizMode,
  count = QUIZ_DEFAULTS.vocabBuildBatch,
): Promise<number> {
  const vocab = await listVocab()
  const built = buildVocabChoiceQuestions(vocab, mode, count)
  return saveQuizzes(built.map(toStored))
}
