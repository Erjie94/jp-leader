import { describe, expect, it } from 'vitest'
import type { StoredQuiz } from './db'
import { scrubPhraseStored, scrubVocabStored } from './quiz-scrub'

function baseQuiz(partial: Partial<StoredQuiz>): StoredQuiz {
  return {
    id: '1',
    kind: 'vocab',
    mode: 'ja-meaning',
    prompt: '這個單字的意思是？',
    sentence: '食べる',
    answer: '吃',
    choices: ['吃', '喝', '去', '看'],
    explanation: '食べる＝吃',
    source: 'local',
    createdAt: 1,
    lastShownAt: 0,
    showCount: 0,
    ...partial,
  }
}

describe('quiz-scrub', () => {
  it('accepts valid vocab quiz', () => {
    const q = scrubVocabStored(baseQuiz({}))
    expect(q).not.toBeNull()
    expect(q!.choices).toHaveLength(4)
  })

  it('rejects non-vocab kind', () => {
    const q = scrubVocabStored(baseQuiz({ kind: 'phrase' }))
    expect(q).toBeNull()
  })

  it('rejects vocab quiz with incomplete choiceExplanations when provided', () => {
    const q = scrubVocabStored(
      baseQuiz({
        choiceExplanations: { 吃: '正解' },
      }),
    )
    expect(q).toBeNull()
  })

  it('rejects phrase quiz with incomplete choiceExplanations', () => {
    const q = scrubPhraseStored(
      baseQuiz({
        kind: 'phrase',
        mode: 'blank',
        prompt: '選出填入空格的正確單字',
        sentence: '____を読みます',
        answer: '本',
        choices: ['本', '水', '人', '時'],
        explanation: '本を読みます＝讀書',
        choiceExplanations: { 本: '正解' },
      }),
    )
    expect(q).toBeNull()
  })

  it('accepts phrase quiz with full annotations', () => {
    const choices = ['本', '水', '人', '時']
    const notes = Object.fromEntries(choices.map((c) => [c, c === '本' ? '正解：本' : `錯誤：${c}`]))
    const q = scrubPhraseStored(
      baseQuiz({
        kind: 'phrase',
        mode: 'blank',
        prompt: '選出填入空格的正確單字',
        sentence: '____を読みます',
        answer: '本',
        choices,
        explanation: '本を読みます＝讀書',
        choiceExplanations: notes,
      }),
    )
    expect(q).not.toBeNull()
  })
})
