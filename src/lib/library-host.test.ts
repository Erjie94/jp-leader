import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyLibrarySnapshot, type LibrarySnapshot } from './library-types'

const TOKEN = 'test-token-32chars-xxxxxxxxxxxx'
const BASE = 'https://jp-leader.example.com'

function makeLocalStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v))
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
    clear: () => {
      map.clear()
    },
  }
}

function snap(partial: Partial<LibrarySnapshot>): LibrarySnapshot {
  return {
    ...emptyLibrarySnapshot(),
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    vocab: partial.vocab ?? [],
    phrases: partial.phrases ?? [],
  }
}

describe('personal host library sync', () => {
  beforeEach(() => {
    vi.resetModules()
    const ls = makeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    ls.setItem(
      'jp-leader-settings',
      JSON.stringify({
        language: 'zh-TW',
        modelId: 'x',
        autoLoadModel: false,
        downloadedModelIds: [],
        aiGen: { vocabCount: 12 },
        hostBaseUrl: BASE,
        hostToken: TOKEN,
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('GET uses Bearer against host base URL', async () => {
    const remote = snap({
      updatedAt: '2026-02-01T00:00:00.000Z',
      vocab: [
        {
          id: 'v1',
          word: '犬',
          reading: 'いぬ',
          meaning: 'dog',
          source: 'manual',
          createdAt: 1,
        },
      ],
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(`${BASE}/api/library`)
        expect(init?.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` })
        return new Response(JSON.stringify({ path: 'host-library', data: remote }), {
          status: 200,
        })
      }),
    )

    const { loadLibrarySnapshot, detectLibraryBackend, resetLibraryBackendCache } =
      await import('./library-io')
    resetLibraryBackendCache()
    expect(await detectLibraryBackend()).toBe('host')
    const loaded = await loadLibrarySnapshot()
    expect(loaded.vocab[0]?.word).toBe('犬')
  })

  it('PUT merges remote ids before write', async () => {
    const remote = snap({
      updatedAt: '2026-03-01T00:00:00.000Z',
      vocab: [
        {
          id: 'remote-only',
          word: '猫',
          reading: 'ねこ',
          meaning: 'cat',
          source: 'manual',
          createdAt: 2,
        },
      ],
    })
    const local = snap({
      updatedAt: '2026-02-01T00:00:00.000Z',
      vocab: [
        {
          id: 'local-only',
          word: '鳥',
          reading: 'とり',
          meaning: 'bird',
          source: 'manual',
          createdAt: 1,
        },
      ],
    })

    let putBody: LibrarySnapshot | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const method = (init?.method || 'GET').toUpperCase()
        if (method === 'GET') {
          return new Response(JSON.stringify({ path: 'host-library', data: remote }), {
            status: 200,
          })
        }
        putBody = JSON.parse(String(init?.body)) as LibrarySnapshot
        return new Response(JSON.stringify({ path: 'host-library', data: putBody }), {
          status: 200,
        })
      }),
    )

    const { saveLibrarySnapshot, resetLibraryBackendCache } = await import('./library-io')
    resetLibraryBackendCache()
    await saveLibrarySnapshot(local)
    expect(putBody).not.toBeNull()
    expect((putBody!.vocab || []).map((v) => v.id).sort()).toEqual([
      'local-only',
      'remote-only',
    ])
  })

  it('401 fails testHostSync', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })),
    )
    const { testHostSync, resetLibraryBackendCache } = await import('./library-io')
    resetLibraryBackendCache()
    const result = await testHostSync()
    expect(result.ok).toBe(false)
    expect(result.message).toContain('401')
  })
})
