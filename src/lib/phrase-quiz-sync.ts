import {
  addPhrase,
  listPhrases,
  listVocab,
  saveQuizzes,
  type PhraseEntry,
  type StoredQuiz,
} from './db'
import { resolveBlankWord } from './phrase-blank-select'
import { buildAnnotatedPhraseQuizFromEntry } from './phrase-quiz-build'
import { PHRASE_QUIZ_MODE } from './quiz-modes'
import { phraseContainsBlank } from './phrase-tokens'

export interface ConfirmSavePhraseInput {
  phrase: string
  reading: string
  meaning: string
  blankWord: string
  source?: 'manual' | 'ai'
  onProgress?: (message: string) => void
}

export interface ConfirmSavePhraseResult {
  phrase: PhraseEntry
  quizAdded: number
  blankSource: 'manual' | 'model' | 'heuristic'
}

/** 確認儲存時：解析挖空 → 產註解題 → 寫入片語庫與題庫 */
export async function confirmSavePhrase(
  input: ConfirmSavePhraseInput,
): Promise<ConfirmSavePhraseResult> {
  const phrase = input.phrase.trim()
  const meaning = input.meaning.trim()
  if (!phrase || !meaning) {
    throw new Error('片語與意思不可空白')
  }

  input.onProgress?.('resolving-blank')
  const blank = await resolveBlankWord(phrase, input.blankWord)
  if (!phraseContainsBlank(phrase, blank.blankWord)) {
    throw new Error('挖空單字必須出現在片語中')
  }

  input.onProgress?.('building-quiz')
  const peers = await listPhrases()
  const vocabWords = (await listVocab()).map((v) => v.word)
  const draft = buildAnnotatedPhraseQuizFromEntry(
    {
      phrase,
      reading: input.reading.trim(),
      meaning,
      blankWord: blank.blankWord,
    },
    peers,
    vocabWords,
  )
  if (!draft) {
    throw new Error('無法為此片語生成選擇題（選項不足）')
  }

  input.onProgress?.('saving')
  const record = await addPhrase({
    phrase,
    reading: input.reading.trim(),
    meaning,
    blankWord: blank.blankWord,
    source: input.source ?? (blank.source === 'model' ? 'ai' : 'manual'),
  })

  const quizRow: Omit<StoredQuiz, 'id' | 'createdAt' | 'lastShownAt' | 'showCount'> = {
    kind: 'phrase',
    mode: PHRASE_QUIZ_MODE,
    prompt: draft.prompt,
    sentence: draft.sentence,
    answer: draft.answer,
    choices: draft.choices,
    explanation: draft.explanation,
    choiceExplanations: draft.choiceExplanations,
    source: blank.source === 'model' ? 'model' : 'local',
  }
  const quizAdded = await saveQuizzes([quizRow])

  return { phrase: record, quizAdded, blankSource: blank.source }
}
