import { SENTENCE_MAX, SENTENCE_MIN } from './ai-gen-spec'

/** 單字短句選擇題結構檢查 */
export function isValidPhraseQuestion(q: {
  sentence?: string
  answer: string
  choices?: string[]
}): boolean {
  const sentence = (q.sentence ?? '').trim()
  if (!sentence) return false
  const compact = [...sentence.replace(/\s/g, '')]
  if (compact.length < SENTENCE_MIN || compact.length > SENTENCE_MAX + 8) return false
  const choices = q.choices ?? []
  if (choices.length !== 4) return false
  if (!choices.includes(q.answer)) return false
  return true
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
