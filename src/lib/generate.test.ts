import { describe, expect, it } from 'vitest'
import { SEED_VOCAB } from '../data/seed-vocab'
import type { VocabEntry } from './db'
import { buildVocabChoiceQuestions, buildVocabQuestionsForEntry } from './generate'
import { VOCAB_QUIZ_MODES } from './quiz-modes'

const vocab: VocabEntry[] = SEED_VOCAB.map((v, i) => ({
  ...v,
  id: `v${i}`,
  source: 'manual' as const,
  createdAt: i,
}))

describe('buildVocabChoiceQuestions', () => {
  it('builds ja-meaning with 4 choices and notes', () => {
    const qs = buildVocabChoiceQuestions(vocab, 'ja-meaning', 5)
    expect(qs.length).toBeGreaterThan(0)
    for (const q of qs) {
      expect(q.mode).toBe('ja-meaning')
      expect(q.choices).toHaveLength(4)
      expect(q.choices).toContain(q.answer)
      expect(q.choiceExplanations[q.answer]).toBeTruthy()
      expect(Object.keys(q.choiceExplanations)).toHaveLength(4)
    }
  })

  it('builds meaning-ja and reading modes', () => {
    const meaning = buildVocabChoiceQuestions(vocab, 'meaning-ja', 3)
    expect(meaning.length).toBeGreaterThan(0)
    expect(meaning[0].prompt).toContain('哪個日文')

    const reading = buildVocabChoiceQuestions(vocab, 'reading', 3)
    expect(reading.length).toBeGreaterThan(0)
    expect(reading[0].prompt).toContain('讀音')
  })
})

describe('buildVocabQuestionsForEntry', () => {
  it('returns up to three modes for one entry', () => {
    const entry = vocab[0]
    const qs = buildVocabQuestionsForEntry(entry, vocab, VOCAB_QUIZ_MODES)
    const modes = new Set(qs.map((q) => q.mode))
    expect(modes.has('ja-meaning')).toBe(true)
    expect(modes.has('meaning-ja')).toBe(true)
    if (entry.reading) expect(modes.has('reading')).toBe(true)
  })
})
