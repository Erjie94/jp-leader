import { describe, expect, it } from 'vitest'
import { emptyLibrarySnapshot } from './library-types'
import { mergeLibrarySnapshots } from './library-merge'

describe('mergeLibrarySnapshots', () => {
  it('keeps unique ids and prefers newer side on conflict', () => {
    const older = {
      ...emptyLibrarySnapshot(),
      updatedAt: '2026-01-01T00:00:00.000Z',
      vocab: [
        {
          id: 'shared',
          word: '旧',
          reading: 'きゅう',
          meaning: 'old',
          source: 'manual' as const,
          createdAt: 1,
        },
        {
          id: 'only-a',
          word: '甲',
          reading: 'こう',
          meaning: 'a',
          source: 'manual' as const,
          createdAt: 1,
        },
      ],
    }
    const newer = {
      ...emptyLibrarySnapshot(),
      updatedAt: '2026-02-01T00:00:00.000Z',
      vocab: [
        {
          id: 'shared',
          word: '新',
          reading: 'しん',
          meaning: 'new',
          source: 'manual' as const,
          createdAt: 2,
        },
        {
          id: 'only-b',
          word: '乙',
          reading: 'おつ',
          meaning: 'b',
          source: 'manual' as const,
          createdAt: 2,
        },
      ],
    }
    const merged = mergeLibrarySnapshots(older, newer)
    const byId = Object.fromEntries(merged.vocab.map((v) => [v.id, v]))
    expect(byId.shared?.word).toBe('新')
    expect(byId['only-a']).toBeTruthy()
    expect(byId['only-b']).toBeTruthy()
  })
})
