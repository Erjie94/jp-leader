import { openDB } from 'idb'
import {
  detectLibraryBackend,
  getResolvedLibraryPath,
  loadLibrarySnapshot,
  saveLibrarySnapshot,
} from './library-io'
import {
  emptyLibrarySnapshot,
  isLibraryEmpty,
  normalizeLibrarySnapshot,
  type LibraryBackend,
  type LibraryInfo,
  type LibrarySnapshot,
} from './library-types'
import { migrateQuizBankModes } from './quiz-modes'

const LEGACY_DB = 'jp-leader'
const LEGACY_VERSION = 6
const FALLBACK_IDB = 'jp-leader-library-file'
const FALLBACK_STORE = 'snapshot'
const MIGRATED_KEY = 'jp-leader-library-migrated-v1'
const QUIZ_MODE_MIGRATED_KEY = 'jp-leader-quiz-mode-migrated-v1'

let cache: LibrarySnapshot | null = null
let cacheAt = 0
let loadPromise: Promise<LibrarySnapshot> | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null
let persistChain: Promise<void> = Promise.resolve()
let backend: LibraryBackend | null = null
const STALE_MS = 800

function cloneSnap(snap: LibrarySnapshot): LibrarySnapshot {
  return structuredClone(snap)
}

async function refreshFromBackendIfStale(): Promise<void> {
  if (!cache || !backend || backend === 'idb-fallback') return
  if (Date.now() - cacheAt < STALE_MS) return
  // 有未寫完的變更時不要用磁碟舊檔覆蓋
  if (persistTimer) return
  const fresh = await loadLibrarySnapshot()
  cache = cloneSnap(fresh)
  cacheAt = Date.now()
}

async function readFallbackIdb(): Promise<LibrarySnapshot | null> {
  try {
    const db = await openDB(FALLBACK_IDB, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(FALLBACK_STORE)) {
          d.createObjectStore(FALLBACK_STORE)
        }
      },
    })
    const raw = await db.get(FALLBACK_STORE, 'library')
    db.close()
    if (!raw) return null
    return normalizeLibrarySnapshot(raw)
  } catch {
    return null
  }
}

async function writeFallbackIdb(snap: LibrarySnapshot): Promise<void> {
  const db = await openDB(FALLBACK_IDB, 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains(FALLBACK_STORE)) {
        d.createObjectStore(FALLBACK_STORE)
      }
    },
  })
  await db.put(FALLBACK_STORE, snap, 'library')
  db.close()
}

async function readLegacyIdb(): Promise<LibrarySnapshot | null> {
  try {
    const db = await openDB(LEGACY_DB, LEGACY_VERSION)
    const names = db.objectStoreNames
    const snap = emptyLibrarySnapshot()
    if (names.contains('vocab')) snap.vocab = (await db.getAll('vocab')) as LibrarySnapshot['vocab']
    if (names.contains('phrases')) {
      snap.phrases = (await db.getAll('phrases')) as LibrarySnapshot['phrases']
    }
    if (names.contains('readingPassages')) {
      snap.readingPassages = (await db.getAll(
        'readingPassages',
      )) as LibrarySnapshot['readingPassages']
    }
    if (names.contains('quizBank')) {
      snap.quizBank = (await db.getAll('quizBank')) as LibrarySnapshot['quizBank']
    }
    if (names.contains('reviewQueue')) {
      snap.reviewQueue = (await db.getAll('reviewQueue')) as LibrarySnapshot['reviewQueue']
    }
    if (names.contains('practiceLog')) {
      snap.practiceLog = (await db.getAll('practiceLog')) as LibrarySnapshot['practiceLog']
    }
    if (names.contains('flaggedQuizzes')) {
      snap.flaggedQuizzes = (await db.getAll(
        'flaggedQuizzes',
      )) as LibrarySnapshot['flaggedQuizzes']
    }
    db.close()
    return isLibraryEmpty(snap) ? null : snap
  } catch {
    return null
  }
}

async function persistNow(snap: LibrarySnapshot): Promise<void> {
  const mode = backend ?? (await detectLibraryBackend())
  backend = mode
  if (mode === 'idb-fallback') {
    await writeFallbackIdb(snap)
    return
  }
  const saved = await saveLibrarySnapshot(snap)
  cache = cloneSnap(saved)
  cacheAt = Date.now()
}

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    const snap = cache
    if (!snap) return
    persistChain = persistChain
      .then(() => persistNow(snap))
      .catch((err) => {
        console.error('[library-store] persist failed', err)
      })
  }, 120)
}

export async function ensureLibraryLoaded(): Promise<LibrarySnapshot> {
  if (cache) return cache
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    backend = await detectLibraryBackend()
    let snap =
      backend === 'idb-fallback'
        ? ((await readFallbackIdb()) ?? emptyLibrarySnapshot())
        : await loadLibrarySnapshot()

    // 舊版 IndexedDB → 檔案庫（僅一次）
    if (isLibraryEmpty(snap) && localStorage.getItem(MIGRATED_KEY) !== '1') {
      const legacy = await readLegacyIdb()
      if (legacy) {
        snap = normalizeLibrarySnapshot({
          ...legacy,
          updatedAt: new Date().toISOString(),
        })
        if (backend === 'idb-fallback') {
          await writeFallbackIdb(snap)
        } else {
          snap = await saveLibrarySnapshot(snap)
        }
      }
      localStorage.setItem(MIGRATED_KEY, '1')
    }

    // vocab mode:'choice'／缺 mode → 歸類或清除（僅一次）
    if (localStorage.getItem(QUIZ_MODE_MIGRATED_KEY) !== '1') {
      const migrated = migrateQuizBankModes(snap.quizBank)
      if (migrated.removed > 0 || migrated.relabeled > 0) {
        snap = normalizeLibrarySnapshot({
          ...snap,
          quizBank: migrated.quizBank,
          updatedAt: new Date().toISOString(),
        })
        if (backend === 'idb-fallback') {
          await writeFallbackIdb(snap)
        } else {
          snap = await saveLibrarySnapshot(snap)
        }
      }
      localStorage.setItem(QUIZ_MODE_MIGRATED_KEY, '1')
    }

    cache = cloneSnap(snap)
    cacheAt = Date.now()
    return cache
  })()

  return loadPromise
}

export async function getLibrarySnapshot(): Promise<LibrarySnapshot> {
  await ensureLibraryLoaded()
  await refreshFromBackendIfStale()
  return cloneSnap(cache!)
}

/** 變更題庫並排程寫入檔案 */
export async function updateLibrary(
  mutator: (draft: LibrarySnapshot) => void | Promise<void>,
): Promise<LibrarySnapshot> {
  await ensureLibraryLoaded()
  await refreshFromBackendIfStale()
  const draft = cloneSnap(cache!)
  await mutator(draft)
  draft.updatedAt = new Date().toISOString()
  draft.version = 1
  cache = draft
  cacheAt = Date.now()
  schedulePersist()
  return cloneSnap(draft)
}

/** 立即寫入（匯入／匯出前用） */
export async function flushLibrary(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  await persistChain
  if (cache) await persistNow(cache)
}

export async function replaceLibrary(snap: LibrarySnapshot): Promise<void> {
  cache = normalizeLibrarySnapshot(snap)
  cache.updatedAt = new Date().toISOString()
  cacheAt = Date.now()
  await flushLibrary()
}

export async function getLibraryStatus(): Promise<LibraryInfo> {
  await ensureLibraryLoaded()
  const mode = backend ?? (await detectLibraryBackend())
  return {
    backend: mode,
    path: getResolvedLibraryPath(),
    updatedAt: cache?.updatedAt ?? '',
    writable: true,
  }
}
