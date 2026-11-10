import {
  emptyLibrarySnapshot,
  normalizeLibrarySnapshot,
  type LibraryBackend,
  type LibraryInfo,
  type LibrarySnapshot,
} from './library-types'

interface DesktopLibraryApi {
  isDesktop: boolean
  platform: string
  readLibrary?: () => Promise<LibrarySnapshot>
  writeLibrary?: (data: LibrarySnapshot) => Promise<LibrarySnapshot>
  getLibraryPath?: () => Promise<string>
}

function desktop(): DesktopLibraryApi | undefined {
  return window.jpLeaderDesktop as DesktopLibraryApi | undefined
}

async function tryApiGet(): Promise<{ snap: LibrarySnapshot; path: string } | null> {
  try {
    const res = await fetch('/api/library', { method: 'GET', cache: 'no-store' })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: unknown; path?: string }
    return {
      snap: normalizeLibrarySnapshot(json.data ?? json),
      path: typeof json.path === 'string' ? json.path : 'data/library.json',
    }
  } catch {
    return null
  }
}

async function tryApiPut(snap: LibrarySnapshot): Promise<LibrarySnapshot | null> {
  try {
    const res = await fetch('/api/library', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(snap),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: unknown }
    return normalizeLibrarySnapshot(json.data ?? snap)
  } catch {
    return null
  }
}

let resolvedBackend: LibraryBackend | null = null
let resolvedPath = 'data/library.json'

export async function detectLibraryBackend(): Promise<LibraryBackend> {
  if (resolvedBackend) return resolvedBackend
  const api = await tryApiGet()
  if (api) {
    resolvedBackend = 'api'
    resolvedPath = api.path
    return 'api'
  }
  const desk = desktop()
  if (desk?.readLibrary && desk.writeLibrary) {
    resolvedBackend = 'electron'
    try {
      resolvedPath = (await desk.getLibraryPath?.()) ?? 'userData/data/library.json'
    } catch {
      resolvedPath = 'userData/data/library.json'
    }
    return 'electron'
  }
  resolvedBackend = 'idb-fallback'
  resolvedPath = 'IndexedDB (瀏覽器隔離，無法跨瀏覽器共用)'
  return 'idb-fallback'
}

export async function loadLibrarySnapshot(): Promise<LibrarySnapshot> {
  const backend = await detectLibraryBackend()
  if (backend === 'api') {
    const api = await tryApiGet()
    if (api) {
      resolvedPath = api.path
      return api.snap
    }
  }
  if (backend === 'electron') {
    const desk = desktop()
    if (desk?.readLibrary) {
      const snap = normalizeLibrarySnapshot(await desk.readLibrary())
      try {
        resolvedPath = (await desk.getLibraryPath?.()) ?? resolvedPath
      } catch {
        /* ignore */
      }
      return snap
    }
  }
  return emptyLibrarySnapshot()
}

export async function saveLibrarySnapshot(snap: LibrarySnapshot): Promise<LibrarySnapshot> {
  const backend = await detectLibraryBackend()
  if (backend === 'api') {
    const saved = await tryApiPut(snap)
    if (saved) return saved
  }
  if (backend === 'electron') {
    const desk = desktop()
    if (desk?.writeLibrary) {
      return normalizeLibrarySnapshot(await desk.writeLibrary(snap))
    }
  }
  // idb-fallback：由 library-store 另行寫入 IndexedDB
  return normalizeLibrarySnapshot(snap)
}

export async function getLibraryInfo(): Promise<LibraryInfo> {
  const backend = await detectLibraryBackend()
  const snap = await loadLibrarySnapshot()
  return {
    backend,
    path: resolvedPath,
    updatedAt: snap.updatedAt,
    writable: backend !== 'idb-fallback' || true,
  }
}

export function getResolvedLibraryPath(): string {
  return resolvedPath
}
