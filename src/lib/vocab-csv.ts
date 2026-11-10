import { hasHangul, hasLatinLetters, isAllowedQuizText } from './lang-gate'
import { isMostlyEnglish, toZhMeaning } from './text-lang'

/** CSV：word,reading,meaning */
export function parseVocabCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  const start = /word|日文|単語|expression/i.test(lines[0]) ? 1 : 0

  const entries = []
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    const word = cols[0]
    const reading = cols[1] ?? ''
    const meaning = cols[2] ?? ''
    if (!word || !meaning) continue
    if (hasHangul(word + reading + meaning) || hasLatinLetters(word + reading)) continue
    let zh = meaning
    if (isMostlyEnglish(zh) || hasLatinLetters(zh)) {
      zh = toZhMeaning(zh)
      if (isMostlyEnglish(zh) || hasLatinLetters(zh) || !isAllowedQuizText(zh)) continue
    }
    if (!isAllowedQuizText(word) || (reading && !isAllowedQuizText(reading))) continue
    entries.push({
      word,
      reading,
      meaning: zh,
      source: 'csv' as const,
    })
  }
  return entries
}
