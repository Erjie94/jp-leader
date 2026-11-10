import { CHOICE_COUNT } from './ai-gen-spec'
import type { PhraseEntry } from './db'
import { applyBlank } from './phrase-tokens'
import { classifyBlankRole, type BlankRole } from './phrase-blank-select'
import { shuffle } from './quiz-fallback'
import { isMostlyEnglish, sanitizeChoices, sanitizeMeaningField } from './text-lang'

export interface PhraseQuizDraft {
  prompt: string
  sentence: string
  answer: string
  choices: string[]
  explanation: string
  choiceExplanations: Record<string, string>
  blankRole: BlankRole
}

const PARTICLE_DISTRACTORS = ['は', 'が', 'を', 'に', 'で', 'と', 'も', 'へ', 'から', 'まで', 'の', 'や']

function unique(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))]
}

function noteForChoice(
  choice: string,
  answer: string,
  role: BlankRole,
  phrase: string,
  meaning: string,
): string {
  if (choice === answer) {
    if (role === 'particle') {
      return `正解：助詞「${answer}」符合本句文法功能，整句語意正確。`
    }
    return meaning
      ? `正解：「${answer}」符合語境（${meaning}），整句「${phrase}」成立。`
      : `正解：「${answer}」是本句應填的關鍵詞。`
  }
  if (role === 'particle') {
    return `錯誤：助詞「${choice}」在此句的格／提示功能不符，不能替換「${answer}」。`
  }
  return `錯誤：「${choice}」填入後語境或詞性不符，本句需要「${answer}」。`
}

/** 依 blank 角色組四選一＋全選項註解（確認儲存時呼叫） */
export function buildAnnotatedPhraseQuiz(input: {
  phrase: string
  reading?: string
  meaning?: string
  blankWord: string
  blankRole?: BlankRole
  peerBlanks?: string[]
  vocabWords?: string[]
}): PhraseQuizDraft | null {
  const phrase = input.phrase.trim()
  const answer = input.blankWord.trim()
  if (!phrase || !answer || !phrase.includes(answer)) return null

  const role = input.blankRole ?? classifyBlankRole(answer)
  const meaning = sanitizeMeaningField(input.meaning ?? '')

  let pool: string[]
  if (role === 'particle') {
    pool = unique([...PARTICLE_DISTRACTORS, ...(input.peerBlanks ?? [])])
  } else {
    pool = unique([...(input.peerBlanks ?? []), ...(input.vocabWords ?? [])])
  }
  pool = pool.filter((x) => x && x !== answer && !isMostlyEnglish(x) && x.length <= 12)

  // 不足時補常見誤用
  const filler =
    role === 'particle'
      ? PARTICLE_DISTRACTORS
      : ['これ', 'それ', '人', '物', '事', '時', '所', '何']
  for (const f of filler) {
    if (pool.length >= 8) break
    if (f !== answer) pool.push(f)
  }
  pool = unique(pool)

  const distractors = shuffle(pool).slice(0, CHOICE_COUNT - 1)
  const rawChoices = [answer, ...distractors]
  const cleaned = sanitizeChoices(rawChoices, answer, pool, CHOICE_COUNT)
  if (cleaned.choices.length !== CHOICE_COUNT) return null

  const choiceExplanations: Record<string, string> = {}
  for (const c of cleaned.choices) {
    choiceExplanations[c] = noteForChoice(c, cleaned.answer, role, phrase, meaning)
  }

  // 錯因不得複製正解句
  for (const c of cleaned.choices) {
    if (c === cleaned.answer) continue
    const note = choiceExplanations[c]
    if (note === choiceExplanations[cleaned.answer]) {
      choiceExplanations[c] = `錯誤：選「${c}」無法構成本句正確文法／情境。`
    }
  }

  return {
    prompt: '選出填入空格的正確單字',
    sentence: applyBlank(phrase, answer),
    answer: cleaned.answer,
    choices: cleaned.choices,
    explanation: meaning
      ? `${phrase}（${input.reading || answer}）＝ ${meaning}`
      : `${phrase} → ${answer}`,
    choiceExplanations,
    blankRole: role,
  }
}

export function buildAnnotatedPhraseQuizFromEntry(
  entry: Pick<PhraseEntry, 'phrase' | 'reading' | 'meaning' | 'blankWord'>,
  peers: PhraseEntry[],
  vocabWords: string[],
): PhraseQuizDraft | null {
  return buildAnnotatedPhraseQuiz({
    phrase: entry.phrase,
    reading: entry.reading,
    meaning: entry.meaning,
    blankWord: entry.blankWord,
    peerBlanks: peers.map((p) => p.blankWord.trim()).filter(Boolean),
    vocabWords,
  })
}
