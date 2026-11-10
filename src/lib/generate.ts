import { CHOICE_COUNT } from './ai-gen-spec'
import type { PhraseEntry, VocabEntry } from './db'
import { applyBlank, phraseContainsBlank } from './phrase-tokens'
import { shuffle } from './quiz-fallback'
import { isMostlyEnglish, sanitizeChoices, sanitizeMeaningField } from './text-lang'

export interface VocabChoiceQuestion {
  prompt: string
  sentence?: string
  answer: string
  choices: string[]
  explanation: string
}

export interface PhraseBlankQuestion {
  prompt: string
  sentence: string
  answer: string
  choices: string[]
  explanation: string
}

function unique(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))]
}

function distractors(pool: string[], answer: string, n = 3): string[] {
  return shuffle(unique(pool.filter((x) => x !== answer && !isMostlyEnglish(x)))).slice(0, n)
}

function zhVocab(vocab: VocabEntry[]): VocabEntry[] {
  return vocab.map((v) => ({
    ...v,
    meaning: sanitizeMeaningField(v.meaning),
  }))
}

/** 從單字庫本地組選擇題（不耗 AI）；意思一律繁中，禁止英文選項 */
export function buildVocabChoiceQuestions(
  vocab: VocabEntry[],
  mode: string,
  count: number,
): VocabChoiceQuestion[] {
  if (vocab.length < 2) return []
  const normalized = zhVocab(vocab)
  const pool = shuffle(normalized)
  const meanings = unique(
    normalized.map((v) => v.meaning).filter((m) => m && !isMostlyEnglish(m)),
  )
  const words = unique(normalized.map((v) => v.word))
  const readings = unique(normalized.map((v) => v.reading).filter(Boolean))
  const out: VocabChoiceQuestion[] = []

  for (const item of pool) {
    if (out.length >= count) break
    const meaning = item.meaning
    if (mode === 'ja-meaning' || mode === 'meaning-ja') {
      if (!meaning || isMostlyEnglish(meaning)) continue
    }

    if (mode === 'ja-meaning') {
      const rawChoices = [meaning, ...distractors(meanings, meaning)]
      const cleaned = sanitizeChoices(rawChoices, meaning, meanings, CHOICE_COUNT)
      if (cleaned.choices.length !== CHOICE_COUNT) continue
      out.push({
        prompt: '這個單字的意思是？',
        sentence: item.word,
        answer: cleaned.answer,
        choices: cleaned.choices,
        explanation: `${item.word}（${item.reading}）＝ ${cleaned.answer}`,
      })
    } else if (mode === 'meaning-ja') {
      const rawChoices = [item.word, ...distractors(words, item.word)]
      const cleaned = sanitizeChoices(rawChoices, item.word, words, CHOICE_COUNT)
      if (cleaned.choices.length !== CHOICE_COUNT) continue
      out.push({
        prompt: `哪個日文單字表示「${meaning}」？`,
        sentence: meaning,
        answer: cleaned.answer,
        choices: cleaned.choices,
        explanation: `${meaning} → ${item.word}（${item.reading}）`,
      })
    } else {
      if (!item.reading) continue
      const rawChoices = [item.reading, ...distractors(readings, item.reading)]
      const cleaned = sanitizeChoices(rawChoices, item.reading, readings, CHOICE_COUNT)
      if (cleaned.choices.length !== CHOICE_COUNT) continue
      out.push({
        prompt: '這個單字的讀音是？',
        sentence: item.word,
        answer: cleaned.answer,
        choices: cleaned.choices,
        explanation: `${item.word} 的讀音是 ${item.reading}`,
      })
    }
  }

  return out
}

/**
 * 片語挖空選擇題：句子挖空＋1 正確單字＋3 干擾單字
 * distractor 優先取其他片語的 blankWord，不足再從單字庫補。
 */
export function buildPhraseBlankQuestions(
  phrases: PhraseEntry[],
  vocabWords: string[],
  count: number,
): PhraseBlankQuestion[] {
  const usable = phrases.filter(
    (p) =>
      p.phrase.trim() &&
      p.blankWord.trim() &&
      phraseContainsBlank(p.phrase, p.blankWord),
  )
  if (!usable.length) return []

  const blankPool = unique(usable.map((p) => p.blankWord.trim()))
  const vocabPool = unique(vocabWords.map((w) => w.trim()).filter(Boolean))
  const distractorPool = unique([...blankPool, ...vocabPool])
  if (distractorPool.length < 2) return []

  const out: PhraseBlankQuestion[] = []
  for (const item of shuffle(usable)) {
    if (out.length >= count) break
    const answer = item.blankWord.trim()
    const rawChoices = [answer, ...distractors(distractorPool, answer, CHOICE_COUNT - 1)]
    const cleaned = sanitizeChoices(rawChoices, answer, distractorPool, CHOICE_COUNT)
    if (cleaned.choices.length !== CHOICE_COUNT) continue

    const cloze = applyBlank(item.phrase, answer)
    const meaning = sanitizeMeaningField(item.meaning)
    out.push({
      prompt: '選出填入空格的正確單字',
      sentence: cloze,
      answer: cleaned.answer,
      choices: cleaned.choices,
      explanation: meaning
        ? `${item.phrase}（${item.reading || answer}）＝ ${meaning}`
        : `${item.phrase} → ${answer}`,
    })
  }
  return out
}
