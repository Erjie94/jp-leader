import { mergeLibrarySnapshots } from './library-merge'
import {
  emptyLibrarySnapshot,
  normalizeLibrarySnapshot,
  type LibraryBackend,
  type LibraryInfo,
  type LibrarySnapshot,
} from './library-types'
import { getHostAuthToken, getRemoteHostConfig } from './settings'

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

let resolvedBackend: LibraryBackend | null = null
let resolvedPath = 'data/library.json'
let lastSyncStatus: LibraryInfo['syncStatus'] = 'idle'
let lastSyncError = ''
let lastSyncedAt = ''

export function resetLibraryBackendCache(): void {
  resolvedBackend = null
  lastSyncStatus = 'idle'
  lastSyncError = ''
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getHostAuthToken()
  const headers: Record<string, string> = { ...(extra || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function libraryUrl(baseUrl: string): string {
  const root = baseUrl.replace(/\/+$/, '')
  return root ? `${root}/api/library` : '/api/library'
}

async function fetchLibraryGet(
  baseUrl: string,
): Promise<{ snap: LibrarySnapshot; path: string } | null> {
  try {
    const res = await fetch(libraryUrl(baseUrl), {
      method: 'GET',
      cache: 'no-store',
      headers: authHeaders(),
    })
    if (!res.ok) {
      lastSyncStatus = 'error'
      lastSyncError = `GET ${res.status}`
      return null
    }
    const json = (await res.json()) as { data?: unknown; path?: string }
    lastSyncStatus = 'ok'
    lastSyncError = ''
    lastSyncedAt = new Date().toISOString()
    return {
      snap: normalizeLibrarySnapshot(json.data ?? json),
      path: typeof json.path === 'string' ? json.path : libraryUrl(baseUrl),
    }
  } catch (e) {
    lastSyncStatus = 'error'
    lastSyncError = e instanceof Error ? e.message : String(e)
    return null
  }
}

async function fetchLibraryPut(
  baseUrl: string,
  snap: LibrarySnapshot,
  mergeRemote: boolean,
): Promise<LibrarySnapshot | null> {
  try {
    let toSave = normalizeLibrarySnapshot(snap)
    if (mergeRemote) {
      const remote = await fetchLibraryGet(baseUrl)
      if (remote) toSave = mergeLibrarySnapshots(snap, remote.snap)
    }
    toSave.updatedAt = new Date().toISOString()
    const res = await fetch(libraryUrl(baseUrl), {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json; charset=utf-8' }),
      body: JSON.stringify(toSave),
    })
    if (!res.ok) {
      lastSyncStatus = 'error'
      lastSyncError = `PUT ${res.status}`
      return null
    }
    const json = (await res.json()) as { data?: unknown }
    lastSyncStatus = 'ok'
    lastSyncError = ''
    lastSyncedAt = new Date().toISOString()
    return normalizeLibrarySnapshot(json.data ?? toSave)
  } catch (e) {
    lastSyncStatus = 'error'
    lastSyncError = e instanceof Error ? e.message : String(e)
    return null
  }
}

export async function detectLibraryBackend(): Promise<LibraryBackend> {
  if (resolvedBackend) return resolvedBackend

  const remote = getRemoteHostConfig()
  if (remote) {
    const got = await fetchLibraryGet(remote.baseUrl)
    resolvedBackend = 'host'
    resolvedPath = got?.path ?? `${remote.baseUrl}/api/library`
    return 'host'
  }

  // 同源（Tunnel 網址或本機 vite）：可帶 token
  const api = await fetchLibraryGet('')
  if (api) {
    resolvedBackend = 'api'
    resolvedPath = api.path
    return 'api'
  }

  // 有 token 但同源 API 失敗（例如尚未填對／主機未開）→ 仍標 host 方便設定頁顯示錯誤
  if (getHostAuthToken()) {
    resolvedBackend = 'host'
    resolvedPath = '/api/library'
    return 'host'
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
  resolvedPath = 'IndexedDB (瀏覽器隔離，無法跨裝置共用)'
  return 'idb-fallback'
}

export async function loadLibrarySnapshot(): Promise<LibrarySnapshot> {
  const backend = await detectLibraryBackend()
  if (backend === 'host') {
    const remote = getRemoteHostConfig()
    const base = remote?.baseUrl ?? ''
    const got = await fetchLibraryGet(base)
    if (got) {
      resolvedPath = got.path
      return got.snap
    }
    return emptyLibrarySnapshot()
  }
  if (backend === 'api') {
    const api = await fetchLibraryGet('')
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
  if (backend === 'host') {
    const remote = getRemoteHostConfig()
    const base = remote?.baseUrl ?? ''
    const saved = await fetchLibraryPut(base, snap, true)
    if (saved) return saved
    throw new Error(lastSyncError || 'host sync failed')
  }
  if (backend === 'api') {
    // 本機 vite 無 token、或同源主機有 token：寫入前若有 token 也 merge
    const merge = Boolean(getHostAuthToken())
    const saved = await fetchLibraryPut('', snap, merge)
    if (saved) return saved
  }
  if (backend === 'electron') {
    const desk = desktop()
    if (desk?.writeLibrary) {
      return normalizeLibrarySnapshot(await desk.writeLibrary(snap))
    }
  }
  return normalizeLibrarySnapshot(snap)
}

export async function getLibraryInfo(): Promise<LibraryInfo> {
  const backend = await detectLibraryBackend()
  let snap = emptyLibrarySnapshot()
  try {
    snap = await loadLibrarySnapshot()
  } catch {
    /* keep empty */
  }
  const showSync = backend === 'host' || Boolean(getHostAuthToken())
  return {
    backend,
    path: resolvedPath,
    updatedAt: snap.updatedAt,
    writable: true,
    syncStatus: showSync ? lastSyncStatus : undefined,
    syncError: showSync && lastSyncError ? lastSyncError : undefined,
    lastSyncedAt: showSync && lastSyncedAt ? lastSyncedAt : undefined,
  }
}

export function getResolvedLibraryPath(): string {
  return resolvedPath
}

/** 設定頁測試連線 */
export async function testHostSync(): Promise<{ ok: boolean; message: string }> {
  resetLibraryBackendCache()
  const remote = getRemoteHostConfig()
  const token = getHostAuthToken()
  if (!token) return { ok: false, message: 'missing-token' }
  const base = remote?.baseUrl ?? ''
  const got = await fetchLibraryGet(base)
  if (!got) return { ok: false, message: lastSyncError || 'unreachable' }
  return { ok: true, message: got.path }
}
