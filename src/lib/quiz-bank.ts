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
import { CHOICE_COUNT } from './ai-gen-spec'
import { isValidPhraseQuestion } from './quiz-fallback'
import { isAllowedChoiceText, isAllowedQuizText } from './lang-gate'
import { isMostlyEnglish, sanitizeChoices } from './text-lang'

function scrubVocabStored(q: StoredQuiz): StoredQuiz | null {
  if (q.kind !== 'vocab') return null
  if (q.prompt && !isAllowedQuizText(q.prompt, { allowBlank: true })) return null
  if (q.sentence && !isAllowedQuizText(q.sentence, { allowBlank: true })) return null
  if (q.explanation && !isAllowedQuizText(q.explanation, { allowBlank: true })) return null

  const cleaned = sanitizeChoices(q.choices, q.answer, q.choices, CHOICE_COUNT)
  if (cleaned.choices.length !== CHOICE_COUNT) return null
  if (isMostlyEnglish(cleaned.answer) || cleaned.choices.some(isMostlyEnglish)) return null
  if (!isAllowedChoiceText(cleaned.answer)) return null
  if (cleaned.choices.some((c) => !isAllowedChoiceText(c))) return null
  return { ...q, answer: cleaned.answer, choices: cleaned.choices }
}

function scrubPhraseStored(q: StoredQuiz): StoredQuiz | null {
  if (q.kind !== 'phrase') return null
  if (q.prompt && !isAllowedQuizText(q.prompt, { allowBlank: true })) return null
  if (q.sentence && !isAllowedQuizText(q.sentence, { allowBlank: true })) return null
  if (q.explanation && !isAllowedQuizText(q.explanation, { allowBlank: true })) return null

  const cleaned = sanitizeChoices(q.choices, q.answer, q.choices, CHOICE_COUNT)
  if (cleaned.choices.length !== CHOICE_COUNT) return null
  if (isMostlyEnglish(cleaned.answer) || cleaned.choices.some(isMostlyEnglish)) return null
  if (!isAllowedChoiceText(cleaned.answer)) return null
  if (cleaned.choices.some((c) => !isAllowedChoiceText(c))) return null
  const next = { ...q, answer: cleaned.answer, choices: cleaned.choices }
  if (!isValidPhraseQuestion(next)) return null
  return next
}

/** 啟動時掃描題庫，刪除非法語言或結構不符的髒題 */
export async function purgeForeignQuizzes(): Promise<number> {
  let removed = 0
  for (const kind of ['vocab', 'phrase', 'reading'] as const) {
    const list = await listQuizzes(kind)
    for (const q of list) {
      if (kind === 'vocab' && scrubVocabStored(q)) continue
      if (kind === 'phrase' && scrubPhraseStored(q)) continue
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
  const existingMode = await drawQuizzes('vocab', 500, mode)
  const bankSize = existingMode.length
  let added = 0
  let fromCache = true

  if (shouldRefresh(bankSize, QUIZ_DEFAULTS.vocabMinBank, Boolean(opts?.forceNew))) {
    const built = buildVocabChoiceQuestions(vocab, mode, QUIZ_DEFAULTS.vocabBuildBatch)
    added = await saveQuizzes(
      built.map((q) => ({
        kind: 'vocab' as const,
        mode,
        prompt: q.prompt,
        sentence: q.sentence,
        answer: q.answer,
        choices: q.choices,
        explanation: q.explanation,
        source: 'local' as const,
      })),
    )
    fromCache = false
  }

  let questions = (await drawQuizzes('vocab', sessionSize * 2, mode))
    .map(scrubVocabStored)
    .filter((q): q is StoredQuiz => Boolean(q))
    .slice(0, sessionSize)

  if (!questions.length) {
    const built = buildVocabChoiceQuestions(vocab, mode, sessionSize)
    await saveQuizzes(
      built.map((q) => ({
        kind: 'vocab' as const,
        mode,
        prompt: q.prompt,
        sentence: q.sentence,
        answer: q.answer,
        choices: q.choices,
        explanation: q.explanation,
        source: 'local' as const,
      })),
    )
    questions = (await drawQuizzes('vocab', sessionSize * 2, mode))
      .map(scrubVocabStored)
      .filter((q): q is StoredQuiz => Boolean(q))
      .slice(0, sessionSize)
    fromCache = false
  }

  await markQuizzesShown(questions.map((q) => q.id))
  return { questions, fromCache: fromCache && added === 0, added }
}

const PHRASE_MODE = 'blank'

export async function preparePhraseSession(
  phrases: PhraseEntry[],
  vocabWords: string[],
  opts?: { forceNew?: boolean },
): Promise<{ questions: StoredQuiz[]; fromCache: boolean; added: number }> {
  const sessionSize = QUIZ_DEFAULTS.phraseSessionSize
  const existingMode = await drawQuizzes('phrase', 500, PHRASE_MODE)
  const bankSize = existingMode.length
  let added = 0
  let fromCache = true

  if (shouldRefresh(bankSize, QUIZ_DEFAULTS.phraseMinBank, Boolean(opts?.forceNew))) {
    const built = buildPhraseBlankQuestions(
      phrases,
      vocabWords,
      QUIZ_DEFAULTS.phraseBuildBatch,
    )
    added = await saveQuizzes(
      built.map((q) => ({
        kind: 'phrase' as const,
        mode: PHRASE_MODE,
        prompt: q.prompt,
        sentence: q.sentence,
        answer: q.answer,
        choices: q.choices,
        explanation: q.explanation,
        source: 'local' as const,
      })),
    )
    fromCache = false
  }

  let questions = (await drawQuizzes('phrase', sessionSize * 2, PHRASE_MODE))
    .map(scrubPhraseStored)
    .filter((q): q is StoredQuiz => Boolean(q))
    .slice(0, sessionSize)

  if (!questions.length) {
    const built = buildPhraseBlankQuestions(phrases, vocabWords, sessionSize)
    await saveQuizzes(
      built.map((q) => ({
        kind: 'phrase' as const,
        mode: PHRASE_MODE,
        prompt: q.prompt,
        sentence: q.sentence,
        answer: q.answer,
        choices: q.choices,
        explanation: q.explanation,
        source: 'local' as const,
      })),
    )
    questions = (await drawQuizzes('phrase', sessionSize * 2, PHRASE_MODE))
      .map(scrubPhraseStored)
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
  }
}
