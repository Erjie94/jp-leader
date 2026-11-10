import { describe, expect, it } from 'vitest'
import { buildAnnotatedPhraseQuiz } from './phrase-quiz-build'

describe('buildAnnotatedPhraseQuiz', () => {
  it('builds 4 choices with full annotations', () => {
    const draft = buildAnnotatedPhraseQuiz({
      phrase: '本を読みます',
      reading: 'ほんをよみます',
      meaning: '讀書',
      blankWord: '本',
      peerBlanks: ['水', '人', '時間'],
      vocabWords: ['学校', '先生', '学生'],
    })
    expect(draft).not.toBeNull()
    expect(draft!.choices).toHaveLength(4)
    expect(draft!.choices).toContain('本')
    expect(draft!.answer).toBe('本')
    for (const c of draft!.choices) {
      expect(draft!.choiceExplanations[c]?.trim().length).toBeGreaterThan(0)
    }
    expect(draft!.choiceExplanations['本']).toContain('正解')
    const wrong = draft!.choices.find((c) => c !== '本')!
    expect(draft!.choiceExplanations[wrong]).not.toBe(draft!.choiceExplanations['本'])
  })

  it('returns null when blank missing from phrase', () => {
    expect(
      buildAnnotatedPhraseQuiz({
        phrase: '本を読みます',
        blankWord: '猫',
      }),
    ).toBeNull()
  })
})
