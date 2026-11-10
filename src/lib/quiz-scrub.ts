import { CHOICE_COUNT } from './ai-gen-spec'
import type { StoredQuiz } from './db'
import { isValidPhraseQuestion } from './quiz-fallback'
import { isAllowedChoiceText, isAllowedQuizText } from './lang-gate'
import { isMostlyEnglish, sanitizeChoices } from './text-lang'

function remapChoiceExplanations(
  prev: Record<string, string> | undefined,
  choices: string[],
  answer: string,
): Record<string, string> | undefined {
  if (!prev) return undefined
  const next: Record<string, string> = {}
  for (const c of choices) {
    const note = prev[c]?.trim()
    if (!note) return undefined
    next[c] = note
  }
  if (!next[answer]) return undefined
  return next
}

export function scrubVocabStored(q: StoredQuiz): StoredQuiz | null {
  if (q.kind !== 'vocab') return null
  if (q.prompt && !isAllowedQuizText(q.prompt, { allowBlank: true })) return null
  if (q.sentence && !isAllowedQuizText(q.sentence, { allowBlank: true })) return null
  if (q.explanation && !isAllowedQuizText(q.explanation, { allowBlank: true })) return null

  const cleaned = sanitizeChoices(q.choices, q.answer, q.choices, CHOICE_COUNT)
  if (cleaned.choices.length !== CHOICE_COUNT) return null
  if (isMostlyEnglish(cleaned.answer) || cleaned.choices.some(isMostlyEnglish)) return null
  if (!isAllowedChoiceText(cleaned.answer)) return null
  if (cleaned.choices.some((c) => !isAllowedChoiceText(c))) return null

  const choiceExplanations = remapChoiceExplanations(
    q.choiceExplanations,
    cleaned.choices,
    cleaned.answer,
  )
  // 舊題可無 choiceExplanations；有則必須覆蓋全部選項
  if (q.choiceExplanations && !choiceExplanations) return null

  return {
    ...q,
    answer: cleaned.answer,
    choices: cleaned.choices,
    choiceExplanations: choiceExplanations ?? q.choiceExplanations,
  }
}

export function scrubPhraseStored(q: StoredQuiz): StoredQuiz | null {
  if (q.kind !== 'phrase') return null
  if (q.prompt && !isAllowedQuizText(q.prompt, { allowBlank: true })) return null
  if (q.sentence && !isAllowedQuizText(q.sentence, { allowBlank: true })) return null
  if (q.explanation && !isAllowedQuizText(q.explanation, { allowBlank: true })) return null

  const cleaned = sanitizeChoices(q.choices, q.answer, q.choices, CHOICE_COUNT)
  if (cleaned.choices.length !== CHOICE_COUNT) return null
  if (isMostlyEnglish(cleaned.answer) || cleaned.choices.some(isMostlyEnglish)) return null
  if (!isAllowedChoiceText(cleaned.answer)) return null
  if (cleaned.choices.some((c) => !isAllowedChoiceText(c))) return null

  const next: StoredQuiz = {
    ...q,
    answer: cleaned.answer,
    choices: cleaned.choices,
  }
  if (!isValidPhraseQuestion(next)) return null

  if (q.choiceExplanations) {
    const notes = remapChoiceExplanations(q.choiceExplanations, cleaned.choices, cleaned.answer)
    if (!notes) return null
    next.choiceExplanations = notes
  }
  return next
}

export function scrubReadingStored(q: StoredQuiz): StoredQuiz | null {
  if (q.kind !== 'reading') return null
  if (!q.passage?.trim()) return null
  if (q.prompt && !isAllowedQuizText(q.prompt, { allowBlank: true })) return null
  if (q.explanation && !isAllowedQuizText(q.explanation, { allowBlank: true })) return null
  const cleaned = sanitizeChoices(q.choices, q.answer, q.choices, CHOICE_COUNT)
  if (cleaned.choices.length !== CHOICE_COUNT) return null
  if (isMostlyEnglish(cleaned.answer) || cleaned.choices.some(isMostlyEnglish)) return null
  if (!isAllowedChoiceText(cleaned.answer)) return null
  if (cleaned.choices.some((c) => !isAllowedChoiceText(c))) return null
  return { ...q, answer: cleaned.answer, choices: cleaned.choices }
}
