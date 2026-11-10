import {
  countQuizzes,
  deleteQuizById,
  drawQuizzes,
  listQuizzes,
  markQuizzesShown,
  saveQuizzes,
  type PhraseEntry,
  type StoredQuiz,
  type VocabEntry,
} from './db'
import { buildPhraseBlankQuestions, buildVocabChoiceQuestions } from './generate'
import { QUIZ_DEFAULTS } from './quiz-defaults'
import { isVocabQuizMode, PHRASE_QUIZ_MODE, type VocabQuizMode } from './quiz-modes'
import { scrubPhraseStored, scrubReadingStored, scrubVocabStored } from './quiz-scrub'
import { shuffle } from './quiz-fallback'
import type { ReadingPassageRecord } from './reading-spec'
import { rebuildVocabModeBank } from './vocab-quiz-sync'
import { buildAnnotatedPhraseQuizFromEntry } from './phrase-quiz-build'

export { scrubPhraseStored, scrubReadingStored, scrubVocabStored } from './quiz-scrub'

/** 短文庫題組 → 題庫列 */
export function flattenReadingPassageQuestions(
  passages: ReadingPassageRecord[],
): Array<Omit<StoredQuiz, 'id' | 'createdAt' | 'lastShownAt' | 'showCount'>> {
  const rows: Array<Omit<StoredQuiz, 'id' | 'createdAt' | 'lastShownAt' | 'showCount'>> = []
  for (const p of passages) {
    for (const q of p.questions ?? []) {
      if (!q.prompt?.trim() || !q.answer?.trim() || !q.choices?.length) continue
      rows.push({
        kind: 'reading',
        mode: q.type,
        prompt: q.prompt,
        sentence: p.title,
        passage: p.sourceText,
        answer: q.answer,
        choices: shuffle([...q.choices]),
        explanation: q.explanation || '',
        source:
          p.generator === 'local' || p.generator === 'online'
            ? 'model'
            : p.generator === 'heuristic'
              ? 'fallback'
              : 'local',
      })
    }
  }
  return rows
}

/** 啟動時掃描題庫，刪除非法語言或結構不符的髒題 */
export async function purgeForeignQuizzes(): Promise<number> {
  let removed = 0
  for (const kind of ['vocab', 'phrase', 'reading'] as const) {
    const list = await listQuizzes(kind)
    for (const q of list) {
      if (kind === 'vocab' && scrubVocabStored(q)) continue
      if (kind === 'phrase' && scrubPhraseStored(q)) continue
      if (kind === 'reading' && scrubReadingStored(q)) continue
      await deleteQuizById(q.id)
      removed += 1
    }
  }
  return removed
}

function shouldRefresh(bankSize: number, minBank: number, force: boolean): boolean {
  if (force) return true
  if (bankSize < minBank) return true
  return Math.random() < QUIZ_DEFAULTS.refreshChance
}

export async function prepareVocabSession(
  vocab: VocabEntry[],
  mode: string,
  opts?: { forceNew?: boolean },
): Promise<{ questions: StoredQuiz[]; fromCache: boolean; added: number }> {
  const sessionSize = QUIZ_DEFAULTS.vocabSessionSize
  const quizMode: VocabQuizMode = isVocabQuizMode(mode) ? mode : 'ja-meaning'
  const existingMode = await drawQuizzes('vocab', 500, quizMode)
  const bankSize = existingMode.length
  let added = 0
  let fromCache = true

  if (shouldRefresh(bankSize, QUIZ_DEFAULTS.vocabMinBank, Boolean(opts?.forceNew))) {
    added = await rebuildVocabModeBank(quizMode, QUIZ_DEFAULTS.vocabBuildBatch)
    fromCache = false
  }

  let questions = (await drawQuizzes('vocab', sessionSize * 2, quizMode))
    .map(scrubVocabStored)
    .filter((q): q is StoredQuiz => Boolean(q))
    .slice(0, sessionSize)

  if (!questions.length) {
    const built = buildVocabChoiceQuestions(vocab, quizMode, sessionSize)
    await saveQuizzes(
      built.map((q) => ({
        kind: 'vocab' as const,
        mode: q.mode,
        prompt: q.prompt,
        sentence: q.sentence,
        answer: q.answer,
        choices: q.choices,
        explanation: q.explanation,
        choiceExplanations: q.choiceExplanations,
        source: 'local' as const,
      })),
    )
    questions = (await drawQuizzes('vocab', sessionSize * 2, quizMode))
      .map(scrubVocabStored)
      .filter((q): q is StoredQuiz => Boolean(q))
      .slice(0, sessionSize)
    fromCache = false
  }

  await markQuizzesShown(questions.map((q) => q.id))
  return { questions, fromCache: fromCache && added === 0, added }
}

export async function preparePhraseSession(
  phrases: PhraseEntry[],
  vocabWords: string[],
  opts?: { forceNew?: boolean },
): Promise<{ questions: StoredQuiz[]; fromCache: boolean; added: number }> {
  const sessionSize = QUIZ_DEFAULTS.phraseSessionSize
  const existingMode = await drawQuizzes('phrase', 500, PHRASE_QUIZ_MODE)
  const bankSize = existingMode.length
  let added = 0
  let fromCache = true

  if (shouldRefresh(bankSize, QUIZ_DEFAULTS.phraseMinBank, Boolean(opts?.forceNew))) {
    // 優先用註解版 builder 補庫；失敗再回退舊函式
    const rows: Array<Omit<StoredQuiz, 'id' | 'createdAt' | 'lastShownAt' | 'showCount'>> = []
    for (const p of shuffle(phrases).slice(0, QUIZ_DEFAULTS.phraseBuildBatch)) {
      const draft = buildAnnotatedPhraseQuizFromEntry(p, phrases, vocabWords)
      if (!draft) continue
      rows.push({
        kind: 'phrase',
        mode: PHRASE_QUIZ_MODE,
        prompt: draft.prompt,
        sentence: draft.sentence,
        answer: draft.answer,
        choices: draft.choices,
        explanation: draft.explanation,
        choiceExplanations: draft.choiceExplanations,
        source: 'local',
      })
    }
    if (rows.length) {
      added = await saveQuizzes(rows)
    } else {
      const built = buildPhraseBlankQuestions(
        phrases,
        vocabWords,
        QUIZ_DEFAULTS.phraseBuildBatch,
      )
      added = await saveQuizzes(
        built.map((q) => ({
          kind: 'phrase' as const,
          mode: PHRASE_QUIZ_MODE,
          prompt: q.prompt,
          sentence: q.sentence,
          answer: q.answer,
          choices: q.choices,
          explanation: q.explanation,
          choiceExplanations: q.choiceExplanations,
          source: 'local' as const,
        })),
      )
    }
    fromCache = false
  }

  let questions = (await drawQuizzes('phrase', sessionSize * 2, PHRASE_QUIZ_MODE))
    .map(scrubPhraseStored)
    .filter((q): q is StoredQuiz => Boolean(q))
    .slice(0, sessionSize)

  if (!questions.length) {
    const built = buildPhraseBlankQuestions(phrases, vocabWords, sessionSize)
    await saveQuizzes(
      built.map((q) => ({
        kind: 'phrase' as const,
        mode: PHRASE_QUIZ_MODE,
        prompt: q.prompt,
        sentence: q.sentence,
        answer: q.answer,
        choices: q.choices,
        explanation: q.explanation,
        choiceExplanations: q.choiceExplanations,
        source: 'local' as const,
      })),
    )
    questions = (await drawQuizzes('phrase', sessionSize * 2, PHRASE_QUIZ_MODE))
      .map(scrubPhraseStored)
      .filter((q): q is StoredQuiz => Boolean(q))
      .slice(0, sessionSize)
    fromCache = false
  }

  await markQuizzesShown(questions.map((q) => q.id))
  return { questions, fromCache: fromCache && added === 0, added }
}

/** 從已存短文題組抽出閱讀測驗（介面同單字／片語：直接開始測驗） */
export async function prepareReadingSession(
  passages: ReadingPassageRecord[],
  opts?: { forceNew?: boolean },
): Promise<{ questions: StoredQuiz[]; fromCache: boolean; added: number }> {
  const sessionSize = QUIZ_DEFAULTS.readingSessionSize
  const existing = await drawQuizzes('reading', 500)
  const bankSize = existing.length
  let added = 0
  let fromCache = true
  const built = flattenReadingPassageQuestions(passages)

  if (
    built.length &&
    shouldRefresh(bankSize, QUIZ_DEFAULTS.readingMinBank, Boolean(opts?.forceNew))
  ) {
    added = await saveQuizzes(built)
    fromCache = false
  }

  let questions = (await drawQuizzes('reading', sessionSize * 2))
    .map(scrubReadingStored)
    .filter((q): q is StoredQuiz => Boolean(q))
    .slice(0, sessionSize)

  if (!questions.length && built.length) {
    await saveQuizzes(built)
    questions = (await drawQuizzes('reading', sessionSize * 2))
      .map(scrubReadingStored)
      .filter((q): q is StoredQuiz => Boolean(q))
      .slice(0, sessionSize)
    fromCache = false
  }

  await markQuizzesShown(questions.map((q) => q.id))
  return { questions, fromCache: fromCache && added === 0, added }
}

export async function bankStats() {
  return {
    vocab: await countQuizzes('vocab'),
    phrase: await countQuizzes('phrase'),
    reading: await countQuizzes('reading'),
  }
}
