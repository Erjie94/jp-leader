import { describe, expect, it } from 'vitest'
import { applyBlank, phraseContainsBlank, tokenizePhrase } from './phrase-tokens'

describe('phrase-tokens', () => {
  it('detects blank substring', () => {
    expect(phraseContainsBlank('本を読みます', '本')).toBe(true)
    expect(phraseContainsBlank('本を読みます', '猫')).toBe(false)
  })

  it('applies blank at first occurrence', () => {
    expect(applyBlank('本を読みます', '本')).toBe('____を読みます')
  })

  it('tokenizes selectable words when Segmenter available', () => {
    const tokens = tokenizePhrase('本を読みます')
    expect(tokens.length).toBeGreaterThan(0)
    expect(tokens.some((t) => t.selectable)).toBe(true)
  })
})
