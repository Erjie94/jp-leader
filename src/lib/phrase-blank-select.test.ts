import { describe, expect, it } from 'vitest'
import { classifyBlankRole, listBlankCandidates, pickBlankHeuristic } from './phrase-blank-select'

describe('phrase-blank-select', () => {
  it('classifies particles', () => {
    expect(classifyBlankRole('は')).toBe('particle')
    expect(classifyBlankRole('本')).toBe('content')
  })

  it('lists candidates inside phrase', () => {
    const list = listBlankCandidates('本を読みます')
    expect(list.length).toBeGreaterThan(0)
    expect(list.every((c) => '本を読みます'.includes(c.text))).toBe(true)
  })

  it('heuristic picks a substring of the phrase', () => {
    const pick = pickBlankHeuristic('学校へ行きます')
    expect(pick).not.toBeNull()
    expect('学校へ行きます'.includes(pick!.blankWord)).toBe(true)
  })
})
