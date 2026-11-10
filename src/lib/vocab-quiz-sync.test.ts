import { describe, expect, it } from 'vitest'
import { SEED_VOCAB } from '../data/seed-vocab'
import type { VocabEntry } from './db'
import { buildVocabQuestionsForEntry } from './generate'
import { quizFingerprint } from './db'
import { VOCAB_QUIZ_MODES } from './quiz-modes'

describe('vocab-quiz-sync helpers', () => {
  it('dedupe fingerprint includes mode so three modes coexist', () => {
    const entry: VocabEntry = {
      ...SEED_VOCAB[0],
      id: 'x',
      source: 'manual',
      createdAt: 1,
    }
    const pool: VocabEntry[] = SEED_VOCAB.map((v, i) => ({
      ...v,
      id: `v${i}`,
      source: 'manual' as const,
      createdAt: i,
    }))
    const qs = buildVocabQuestionsForEntry(entry, pool, VOCAB_QUIZ_MODES)
    const fps = qs.map((q) =>
      quizFingerprint({
        kind: 'vocab',
        mode: q.mode,
        prompt: q.prompt,
        answer: q.answer,
        sentence: q.sentence,
        choices: q.choices,
      }),
    )
    expect(new Set(fps).size).toBe(fps.length)
  })
})
