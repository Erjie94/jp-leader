import { CHOICE_COUNT } from './ai-gen-spec'
import type { PhraseEntry, VocabEntry } from './db'
import { applyBlank, phraseContainsBlank } from './phrase-tokens'
import type { VocabQuizMode } from './quiz-modes'
import { VOCAB_QUIZ_MODES } from './quiz-modes'
import { shuffle } from './quiz-fallback'
import { isMostlyEnglish, sanitizeChoices, sanitizeMeaningField } from './text-lang'

export interface VocabChoiceQuestion {
  mode: VocabQuizMode
  prompt: string
  sentence?: string
  answer: string
  choices: string[]
  explanation: string
  choiceExplanations: Record<string, string>
}

export interface PhraseBlankQuestion {
  prompt: string
  sentence: string
  answer: string
  choices: string[]
  explanation: string
  choiceExplanations?: Record<string, string>
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

function vocabChoiceNotes(
  mode: VocabQuizMode,
  item: VocabEntry,
  answer: string,
  choices: string[],
): Record<string, string> {
  const notes: Record<string, string> = {}
  for (const c of choices) {
    if (c === answer) {
      if (mode === 'ja-meaning') {
        notes[c] = `正解：${item.word}（${item.reading || '—'}）的意思是「${answer}」。`
      } else if (mode === 'meaning-ja') {
        notes[c] = `正解：「${item.meaning}」對應日文「${item.word}」（${item.reading || '—'}）。`
      } else {
        notes[c] = `正解：${item.word} 的讀音是「${item.reading}」。`
      }
    } else if (mode === 'ja-meaning') {
      notes[c] = `錯誤：此意思與「${item.word}」不符，勿與易混淆詞義搞混。`
    } else if (mode === 'meaning-ja') {
      notes[c] = `錯誤：「${c}」不是「${item.meaning}」的對應單字。`
    } else {
      notes[c] = `錯誤：「${c}」不是「${item.word}」的正確讀音。`
    }
  }
  return notes
}

/** 從單字庫本地組選擇題（不耗 AI）；意思一律繁中，禁止英文選項 */
export function buildVocabChoiceQuestions(
  vocab: VocabEntry[],
  mode: VocabQuizMode,
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
        mode,
        prompt: '這個單字的意思是？',
        sentence: item.word,
        answer: cleaned.answer,
        choices: cleaned.choices,
        explanation: `${item.word}（${item.reading}）＝ ${cleaned.answer}`,
        choiceExplanations: vocabChoiceNotes(mode, item, cleaned.answer, cleaned.choices),
      })
    } else if (mode === 'meaning-ja') {
      const rawChoices = [item.word, ...distractors(words, item.word)]
      const cleaned = sanitizeChoices(rawChoices, item.word, words, CHOICE_COUNT)
      if (cleaned.choices.length !== CHOICE_COUNT) continue
      out.push({
        mode,
        prompt: `哪個日文單字表示「${meaning}」？`,
        sentence: meaning,
        answer: cleaned.answer,
        choices: cleaned.choices,
        explanation: `${meaning} → ${item.word}（${item.reading}）`,
        choiceExplanations: vocabChoiceNotes(mode, item, cleaned.answer, cleaned.choices),
      })
    } else {
      if (!item.reading) continue
      const rawChoices = [item.reading, ...distractors(readings, item.reading)]
      const cleaned = sanitizeChoices(rawChoices, item.reading, readings, CHOICE_COUNT)
      if (cleaned.choices.length !== CHOICE_COUNT) continue
      out.push({
        mode,
        prompt: '這個單字的讀音是？',
        sentence: item.word,
        answer: cleaned.answer,
        choices: cleaned.choices,
        explanation: `${item.word} 的讀音是 ${item.reading}`,
        choiceExplanations: vocabChoiceNotes(mode, item, cleaned.answer, cleaned.choices),
      })
    }
  }

  return out
}

/** 針對單一單字，在給定詞庫池下盡量產出三模式各一題 */
export function buildVocabQuestionsForEntry(
  entry: VocabEntry,
  pool: VocabEntry[],
  modes: readonly VocabQuizMode[] = VOCAB_QUIZ_MODES,
): VocabChoiceQuestion[] {
  const all = pool.some((v) => v.word === entry.word && v.reading === entry.reading)
    ? pool
    : [entry, ...pool]
  const out: VocabChoiceQuestion[] = []
  for (const mode of modes) {
    // 把目標 entry 放前面，提高被選中機率
    const ordered = [entry, ...all.filter((v) => v !== entry && !(v.word === entry.word && v.reading === entry.reading))]
    const built = buildVocabChoiceQuestions(ordered, mode, 1)
    const hit =
      built.find((q) => {
        if (mode === 'ja-meaning') return q.sentence === entry.word
        if (mode === 'meaning-ja') return q.answer === entry.word
        return q.sentence === entry.word && q.answer === entry.reading
      }) ?? built[0]
    if (hit) out.push(hit)
  }
  return out
}

/**
 * 片語挖空選擇題：句子挖空＋1 正確單字＋3 干擾單字
 * distractor 優先取其他片語的 blankWord，不足再從單字庫補。
 * （回退路徑；新流程請用 phrase-quiz-build）
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
    const choiceExplanations: Record<string, string> = {}
    for (const c of cleaned.choices) {
      choiceExplanations[c] =
        c === cleaned.answer
          ? `正解：此處應填「${answer}」，整句「${item.phrase}」語意完整。`
          : `錯誤：「${c}」填入後不符合本句文法或語境。`
    }
    out.push({
      prompt: '選出填入空格的正確單字',
      sentence: cloze,
      answer: cleaned.answer,
      choices: cleaned.choices,
      explanation: meaning
        ? `${item.phrase}（${item.reading || answer}）＝ ${meaning}`
        : `${item.phrase} → ${answer}`,
      choiceExplanations,
    })
  }
  return out
}
